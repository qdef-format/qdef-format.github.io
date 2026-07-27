// Minimal CBOR decoder for QDEF validation
const QDEF_MAGIC = new Uint8Array([0x51, 0x44, 0x45, 0x46]);

function hexToBytes(s) {
  s = s.replace(/\s+/g, '').replace(/0x/gi, '').replace(/[^0-9a-fA-F]/g, '');
  if (s.length % 2 !== 0) return null;
  const bytes = new Uint8Array(s.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(s.substr(i * 2, 2), 16);
  }
  return bytes;
}

function majorName(m) {
  return ['uint','nint','bytes','tstr','array','map','tag','simple'][m] || 'unknown';
}

function bytesToHex(bytes) {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join(' ');
}

class CBORReader {
  constructor(bytes) { this.bytes = bytes; this.offset = 0; }

  readByte() {
    if (this.offset >= this.bytes.length) throw new Error('Unexpected end of CBOR data');
    return this.bytes[this.offset++];
  }

  readLen(n) {
    const v = new Uint8Array(n);
    for (let i = 0; i < n; i++) v[i] = this.readByte();
    return v;
  }

  readArg(addInfo) {
    if (addInfo <= 23) return addInfo;
    if (addInfo === 24) return this.readByte();
    if (addInfo === 25) return (this.readByte() << 8) | this.readByte();
    if (addInfo === 26) {
      const b = this.readLen(4);
      return (b[0] << 24) | (b[1] << 16) | (b[2] << 8) | b[3];
    }
    if (addInfo === 27) {
      const b = this.readLen(8);
      const hi = BigInt((b[0] << 24) | (b[1] << 16) | (b[2] << 8) | b[3]);
      const lo = BigInt((b[4] << 24) | (b[5] << 16) | (b[6] << 8) | b[7]);
      return (hi << 32n) | lo;
    }
    if (addInfo === 31) return -1; // indefinite
    throw new Error(`Unsupported additional info: ${addInfo}`);
  }

  tryReadArg(addInfo) {
    try { return this.readArg(addInfo); } catch (e) { return { error: e.message }; }
  }

  readItem() {
    if (this.offset >= this.bytes.length) return null;
    const start = this.offset;
    let byte, major, addInfo, arg;
    try { byte = this.readByte(); } catch (e) {
      return { type: 'error', text: `truncated at byte ${start}` };
    }
    major = byte >> 5;
    addInfo = byte & 0x1f;

    const rawArg = this.tryReadArg(addInfo);
    if (rawArg.error) return { type: 'error', text: `truncated reading ${majorName(major)} argument at byte ${start}` };
    arg = addInfo === 31 ? -1 : rawArg;

    try {
      switch (major) {
        case 0: return { type: 'uint', value: typeof arg === 'bigint' ? arg : Number(arg), start, end: this.offset };
        case 1: return { type: 'nint', value: typeof arg === 'bigint' ? -1n - arg : -1 - Number(arg), start, end: this.offset };
        case 2: {
          if (arg < 0) return { type: 'error', text: 'indefinite-length byte strings not supported', start };
          try { return { type: 'bytes', value: this.readLen(arg), start, end: this.offset }; }
          catch (e) { return { type: 'error', text: `truncated byte string at byte ${start}`, start }; }
        }
        case 3: {
          if (arg < 0) return { type: 'error', text: 'indefinite-length text strings not supported', start };
          try {
            const raw = this.readLen(arg);
            return { type: 'tstr', value: new TextDecoder().decode(raw), start, end: this.offset };
          } catch (e) { return { type: 'error', text: `truncated text string at byte ${start}`, start }; }
        }
        case 4: {
          if (arg < 0) return { type: 'error', text: 'indefinite-length arrays not supported', start };
          const items = [];
          const count = typeof arg === 'bigint' ? Number(arg) : arg;
          for (let i = 0; i < count; i++) {
            const item = this.readItem();
            if (!item) { items.push({ type: 'error', text: `array item ${i} truncated` }); break; }
            if (item.type === 'error') { items.push(item); break; }
            items.push(item);
          }
          return { type: 'array', value: items, start, end: this.offset };
        }
        case 5: {
          if (arg < 0) return { type: 'error', text: 'indefinite-length maps not supported', start };
          const pairs = [];
          const count = typeof arg === 'bigint' ? Number(arg) : arg;
          for (let i = 0; i < count; i++) {
            const k = this.readItem();
            if (!k) { pairs.push({ key: { type: 'error', text: `map key ${i} truncated` }, value: null }); break; }
            if (k.type === 'error') { pairs.push({ key: k, value: null }); break; }
            const v = this.readItem();
            if (!v) { pairs.push({ key: k, value: { type: 'error', text: `map value ${i} truncated` } }); break; }
            if (v.type === 'error') { pairs.push({ key: k, value: v }); break; }
            pairs.push({ key: k, value: v });
          }
          return { type: 'map', value: pairs, start, end: this.offset };
        }
        case 6: {
          const item = this.readItem();
          if (!item || item.type === 'error') return { type: 'tag', tag: Number(arg), value: item || { type: 'error', text: 'truncated tag content' }, start, end: this.offset };
          return { type: 'tag', tag: Number(arg), value: item, start, end: this.offset };
        }
        case 7: {
          const val = typeof arg === 'bigint' ? Number(arg) : arg;
          if (addInfo <= 23 || addInfo === 24) return { type: 'simple', value: val, start, end: this.offset };
          if (addInfo === 25) return { type: 'float16', value: val, start, end: this.offset };
          if (addInfo === 26) return { type: 'float32', value: val, start, end: this.offset };
          if (addInfo === 27) return { type: 'float64', value: val, start, end: this.offset };
          return { type: 'error', text: `unsupported simple value ${addInfo} at byte ${start}` };
        }
        default:
          return { type: 'error', text: `unsupported major type ${major} at byte ${start}` };
      }
    } catch (e) {
      return { type: 'error', text: `parse error at byte ${start}: ${e.message}` };
    }
  }
}

function fmtCBOR(item) {
  if (!item) return '<li>(null)</li>';
  if (item.type === 'error') return `<li style="color:#721c24">⚠ ${escapeHtml(item.text)}</li>`;

  function ann(item) {
    return item && item._ann ? ` <span class="tree-parity">// ${escapeHtml(item._ann)}</span>` : '';
  }

  switch (item.type) {
    case 'uint':
    case 'nint':
      return `<li><span class="type-num">${item.value}</span>${ann(item)}</li>`;
    case 'bytes': {
      const hex = Array.from(item.value).slice(0, 16).map(b => b.toString(16).padStart(2, '0')).join('');
      const ellipsis = item.value.length > 16 ? '...' : '';
      return `<li><span class="type-bytes">h'${hex}${ellipsis}'</span> <span class="tree-meta">(${item.value.length} B)</span>${ann(item)}</li>`;
    }
    case 'tstr': {
      const s = item.value.length > 64 ? item.value.slice(0, 64) + '...' : item.value;
      return `<li><span class="type-str">"${escapeHtml(s)}"</span>${ann(item)}</li>`;
    }
    case 'array': {
      let html = `<li><span class="tree-bracket">[</span> <span class="tree-meta">${item.value.length} items</span>${ann(item)}<ul>`;
      for (const v of item.value) {
        html += fmtCBOR(v);
      }
      html += `</ul><span class="tree-bracket">]</span></li>`;
      return html;
    }
    case 'map': {
      let html = `<li><span class="tree-bracket">{</span> <span class="tree-meta">${item.value.length} keys</span><ul>`;
      for (const p of item.value) {
        const keyAnn = p.key._ann;
        if (keyAnn) p.key._ann = '';
        html += `<li><span class="key">${fmtInline(p.key)}</span>: ${fmtInline(p.value)}`;
        if (keyAnn) {
          html += ` <span class="tree-parity">// ${escapeHtml(keyAnn)}</span>`;
        } else if ((p.key.type === 'uint' || p.key.type === 'nint') && typeof p.key.value === 'number') {
          const parity = p.key.value % 2 === 0 ? 'even/critical' : 'odd/optional';
          html += ` <span class="tree-parity">// ${parity}</span>`;
        }
        html += '</li>';
      }
      html += `</ul><span class="tree-bracket">}</span></li>`;
      return html;
    }
    case 'tag':
      return `<li><span class="tree-bracket">tag(${item.tag})</span><ul>${fmtCBOR(item.value)}</ul></li>`;
    case 'simple':
      return `<li>${item.value === 20 ? '<span class="type-bool">false</span>' : item.value === 21 ? '<span class="type-bool">true</span>' : item.value === 22 ? '<span class="type-bool">null</span>' : item.value === 23 ? '<span class="type-bool">undefined</span>' : `simple(${item.value})`}</li>`;
    default:
      return `<li>(${item.type})</li>`;
  }
}

function fmtInline(item) {
  if (!item) return '(null)';
  if (item.type === 'error') return `<span style="color:#721c24">⚠ ${escapeHtml(item.text)}</span>`;
  const ann = item._ann ? ` <span class="tree-meta">${escapeHtml(item._ann)}</span>` : '';
  switch (item.type) {
    case 'uint': case 'nint': return `<span class="type-num">${item.value}</span>${ann}`;
    case 'bytes':
      const hex = Array.from(item.value).slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join('');
      const ellipsis = item.value.length > 8 ? '...' : '';
      return `<span class="type-bytes">h'${hex}${ellipsis}'</span>${ann}`;
    case 'tstr':
      return `<span class="type-str">"${escapeHtml(item.value.slice(0, 40))}"</span>${ann}`;
    case 'simple': return (item.value === 21 ? '<span class="type-bool">true</span>' : item.value === 20 ? '<span class="type-bool">false</span>' : `simple(${item.value})`) + ann;
    case 'tag': return `tag(${item.tag})${ann}`;
    case 'array': return `[${item.value.length} items]${ann}`;
    case 'map': return `{${item.value.length} keys}${ann}`;
    default: return `(${item.type})${ann}`;
  }
}

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function parseShape(shapeStr) {
  if (!shapeStr) return null;
  const fields = {};
  const inner = shapeStr.replace(/^map\s*\{/, '').replace(/\}\s*$/, '').trim();
  const re = /(-?\d+)\s*:\s*(\w+)\s*\(([^)]+)\)/g;
  let m;
  while ((m = re.exec(inner)) !== null) {
    const name = m[3].split(',')[0].trim();
    const opt = m[3].includes('opt');
    fields[m[1]] = { type: m[2], name, optional: opt };
  }
  return Object.keys(fields).length > 0 ? fields : null;
}

const COMMON_FIELDS = {
  '-1':  { type: 'bstr or tstr', name: 'ID' },
  '-3':  { type: 'bstr', name: 'UUID' },
  '-5':  { type: 'tag', name: 'Date' },
  '-7':  { type: 'tstr', name: 'Label' },
  '-9':  { type: 'tstr', name: 'Language' },
  '-11': { type: 'bstr', name: 'Content Hash' },
  '-13': { type: 'tstr', name: 'Source' },
  '-15': { type: 'tstr', name: 'Filename' },
};

const STANDARD_TYPE_NAMES = {
  '0': 'Bundle',
  '2': 'Split',
  '4': 'Encrypt',
  '6': 'Media Payload',
  '8': 'Compress',
  '10': 'Open/Hint URI',
  '12': 'App Route',
  '14': 'Media Preview',
  '16': 'Signature',
};

const STANDARD_SHAPES = {
  '0': {
    '3': { type: 'tstr', name: 'Hint Name', optional: true },
    '5': { type: 'bstr', name: 'Backup Namespace', optional: true },
  },
  '2': {
    '0': { type: 'bstr', name: 'Group ID' },
    '2': { type: 'uint', name: 'Fragment Index' },
    '4': { type: 'uint', name: 'Fragment Count' },
    '7': { type: 'uint', name: 'Total Bytes', optional: true },
    '9': { type: 'uint', name: 'Parity Scheme', optional: true },
  },
  '4': {
    '0': { type: 'bstr', name: 'Nonce' },
    '3': { type: 'uint or tstr', name: 'Algorithm', optional: true },
    '5': { type: 'uint or tstr', name: 'Key Algorithm', optional: true },
  },
  '6': {
    '0': { type: 'uint or tstr', name: 'Media Type' },
  },
  '10': {
    '0': { type: 'tstr', name: 'URI' },
    '1': { type: 'tstr', name: 'Label', optional: true },
    '3': { type: 'tstr', name: 'Language', optional: true },
    '5': { type: 'uint', name: 'Action', optional: true },
  },
  '12': {
    '0': { type: 'tstr or bstr', name: 'Origin' },
    '1': { type: 'tstr', name: 'Hint Name', optional: true },
  },
  '14': {
    '0': { type: 'uint or tstr', name: 'Media Type' },
    '1': { type: 'bstr', name: 'Content Hash', optional: true },
    '3': { type: 'tstr', name: 'Filename', optional: true },
    '5': { type: 'tstr', name: 'Label', optional: true },
  },
  '16': {
    '0': { type: 'nint', name: 'Algorithm' },
    '2': { type: 'bstr', name: 'Public Key' },
  },
};

function getFieldDef(typeId, keyStr, nsHex) {
  if (COMMON_FIELDS[keyStr]) return COMMON_FIELDS[keyStr];

  let shape;
  if (nsHex && typeof QDEF_REGISTRY !== 'undefined') {
    const entry = QDEF_REGISTRY[nsHex];
    if (entry && entry.types[String(typeId)]) {
      shape = parseShape(entry.types[String(typeId)].shape);
    }
  }
  if (!shape && typeof QDEF_REGISTRY !== 'undefined') {
    const nsEntry = Object.values(QDEF_REGISTRY).find(e => e.types && e.types[String(typeId)]);
    if (nsEntry && nsEntry.types[String(typeId)]) {
      shape = parseShape(nsEntry.types[String(typeId)].shape);
    }
  }
  if (shape && shape[keyStr]) return shape[keyStr];

  const std = STANDARD_SHAPES[String(typeId)];
  if (std && std[keyStr]) return std[keyStr];

  return null;
}

// QDEF validation
function validateQDEF(bytes) {
  const issues = [];

  // Check magic — warn, don't bail
  let magicOk = false;
  if (bytes.length < 4) {
    issues.push({ level: 'error', text: `Payload too short: ${bytes.length} byte(s), need at least 4` });
  } else {
    const magic = bytes.slice(0, 4);
    magicOk = magic[0] === QDEF_MAGIC[0] && magic[1] === QDEF_MAGIC[1] && magic[2] === QDEF_MAGIC[2] && magic[3] === QDEF_MAGIC[3];
    if (magicOk) {
      issues.push({ level: 'ok', text: `Magic header: 51 44 45 46 ("QDEF")` });
    } else {
      issues.push({ level: 'warn', text: `Expected QDEF magic (51 44 45 46), got ${bytesToHex(magic)} — parsing raw CBOR` });
    }
  }

  // Try to parse root CBOR even without valid magic
  let root = null;
  const cborStart = bytes.length >= 4 ? 4 : 0;
  const reader = new CBORReader(bytes.slice(cborStart));
  root = reader.readItem();

  if (root && root.type === 'error') {
    issues.push({ level: 'error', text: `Parse error: ${root.text}` });
  } else if (root && root.type !== 'array') {
    issues.push({ level: 'warn', text: `Root is a CBOR ${majorName(root.type)} — expected an array for QDEF Records` });
    root = null;
  } else if (root && root.type === 'array') {
    issues.push({ level: 'ok', text: `Root is a CBOR array with ${root.value.length} item(s)` });
    // Analyze Record structure
    analyzeRecord(root, issues, 'Root', 0);
  } else if (!root) {
    issues.push({ level: 'warn', text: `No CBOR data found after magic header` });
  }

  // Check remaining bytes
  if (reader && reader.offset < bytes.length - cborStart) {
    issues.push({ level: 'warn', text: `${bytes.length - cborStart - reader.offset} byte(s) unparsed after root Record` });
  }

  return { valid: issues.filter(i => i.level === 'error').length === 0, root, issues };
}

function annotateItem(item, text) {
  if (item) item._ann = text;
}

function analyzeRecord(arr, issues, label, depth, inheritedNamespace) {
  if (depth > 10) {
    issues.push({ level: 'error', text: `${label}: nesting depth exceeds 10` });
    return null;
  }

  const items = (arr.value || []).filter(i => i != null);
  let idx = 0;

  // Determine typeId and namespace
  let namespace = null;
  let typeId = 0;
  let typeIdExplicit = false;
  let tidItem = null;

  const nsMatch = idx < items.length && items[idx].type === 'bytes' && items[idx].value.length <= 8;
  if (nsMatch) {
    namespace = items[idx];
    idx++;
  }

  if (idx < items.length && (items[idx].type === 'uint' || items[idx].type === 'nint')) {
    tidItem = items[idx];
    typeId = tidItem.type === 'uint' ? tidItem.value : tidItem.value;
    typeIdExplicit = true;
    idx++;
  }

  // Check map
  const hasMap = idx < items.length && items[idx].type === 'map';
  if (hasMap) idx++;

  // Check payload
  let hasPayload = false;
  let payloadItem = null;
  if (idx < items.length && items[idx].type !== 'array') {
    hasPayload = true;
    payloadItem = items[idx];
    idx++;
  }

  // Remaining items are subrecords
  const subrecords = items.slice(idx).filter(i => i.type === 'array');

  // Per §3.5, a namespace cascades to subrecords: the effective namespace
  // used for validation is this Record's own namespace if present, else
  // the one inherited from its parent.
  const effectiveNamespace = namespace || inheritedNamespace;

  // Build description
  let recLabel = `${label} Record`;
  let recordAnn = '';
  if (typeId === 0 && !typeIdExplicit) {
    recLabel += ` (Bundle, implicit typeId=0)`;
    recordAnn = `Bundle (implicit typeId=0)`;
  } else if (typeId === 0 && typeIdExplicit) {
    recLabel += ` (typeId=0, Bundle)`;
    recordAnn = `Bundle (typeId=0)`;
  } else {
    recLabel += ` (typeId=${typeId})`;
    recordAnn = `Record (typeId=${typeId})`;
  }

  let nsHexFlat = null;
  let regNsHex = null;
  if (namespace) {
    const nsHex = bytesToHex(namespace.value);
    nsHexFlat = nsHex.replace(/ /g, '');
    regNsHex = nsHexFlat;
    recLabel += ` [namespace: ${nsHex}]`;
    issues.push({ level: 'ok', text: `${recLabel}: namespace present` });

    let nsAnn = `namespace: ${nsHexFlat}`;
    let nsName = null;
    if (typeof QDEF_REGISTRY !== 'undefined' && QDEF_REGISTRY[nsHexFlat]) {
      const entry = QDEF_REGISTRY[nsHexFlat];
      nsName = entry.variable || entry.name;
      nsAnn += ` (${nsName})`;
      issues.push({ level: 'ok', text: `${'  '.repeat(depth+1)}→ ${nsName} (${entry.name})` });
    }
    annotateItem(namespace, nsAnn);

    if (recordAnn) recordAnn = `${nsName || nsHexFlat} ${recordAnn}`;
    else recordAnn = `${nsName || nsHexFlat}`;
  } else {
    issues.push({ level: 'ok', text: `${recLabel}` });
    if (effectiveNamespace) {
      regNsHex = bytesToHex(effectiveNamespace.value).replace(/ /g, '');
    }
  }

  if (typeIdExplicit) {
    const parity = typeId % 2 === 0 ? 'even (global)' : 'odd (scoped)';
    let typeAnn = `typeId=${typeId}`;
    let typeName = null;
    if (regNsHex && typeof QDEF_REGISTRY !== 'undefined') {
      const entry = QDEF_REGISTRY[regNsHex];
      if (entry && entry.types[String(typeId)]) {
        const rt = entry.types[String(typeId)];
        typeName = rt.variable || rt.name;
      }
    }
    if (!typeName && STANDARD_TYPE_NAMES[String(typeId)]) {
      typeName = STANDARD_TYPE_NAMES[String(typeId)];
    }
    typeAnn += ` (${parity})`;
    if (typeName) typeAnn += ` - ${typeName}`;
    issues.push({ level: 'ok', text: `${'  '.repeat(depth+1)}Type ID: ${typeId} (${parity})${typeName ? ' → ' + typeName : ''}` });
    annotateItem(tidItem, typeAnn);
    if (typeName && recordAnn) recordAnn += ` — ${typeName}`;
  }
  if (recordAnn) annotateItem(arr, recordAnn);

  if (hasMap) {
    issues.push({ level: 'ok', text: `${'  '.repeat(depth+1)}Has field map` });
    const mapItem = items[namespace ? (typeIdExplicit ? 2 : 1) : (typeIdExplicit ? 1 : 0)];
    if (mapItem) {
      for (const pair of mapItem.value) {
        if (pair.key && (pair.key.type === 'uint' || pair.key.type === 'nint')) {
          const k = String(pair.key.value);
          const fd = getFieldDef(typeId, k, regNsHex);
          const keyParity = typeof pair.key.value === 'number'
            ? (pair.key.value % 2 === 0 ? 'even/critical' : 'odd/optional') : '';
          if (fd) {
            pair.key._ann = keyParity ? `${fd.name} (${keyParity})` : fd.name;
            if (pair.value && pair.value.type !== 'map' && pair.value.type !== 'array') {
              pair.value._ann = fd.type;
            }
          }
        }
      }
    }
  }
  if (hasPayload) {
    if (payloadItem) {
      issues.push({ level: 'ok', text: `${'  '.repeat(depth+1)}Has payload: ${fmtInlineShort(payloadItem)}` });
    }
  }
  if (subrecords.length > 0) {
    issues.push({ level: 'ok', text: `${'  '.repeat(depth+1)}${subrecords.length} subrecord(s)` });
    for (let si = 0; si < subrecords.length; si++) {
      analyzeRecord(subrecords[si], issues, `${label}.${si}`, depth + 1, effectiveNamespace);
    }
  }

  // Validation rules
  if (typeId === 0 && hasPayload) {
    issues.push({ level: 'error', text: `${label}: Bundle (typeId=0) MUST NOT carry a payload` });
  }
  if (typeIdExplicit && typeof typeId === 'number' && typeId % 2 !== 0 && !effectiveNamespace) {
    issues.push({ level: 'error', text: `${label}: odd typeId requires a namespace` });
  }

  return { namespace, typeId, typeIdExplicit, hasMap, hasPayload, subrecords };
}

function fmtInlineShort(item) {
  if (item.type === 'bytes') return `h'${Array.from(item.value.slice(0, 8)).map(b => b.toString(16).padStart(2, '0')).join('')}...' (${item.value.length}B)`;
  if (item.type === 'tstr') return `"${escapeHtml(item.value.slice(0, 40))}"`;
  if (item.type === 'uint' || item.type === 'nint') return String(item.value);
  return `[${item.type}]`;
}

// Main validation entry point
function validateQDEPayload(hexInput) {
  const output = document.getElementById('validator-output');
  const resultDiv = document.getElementById('validation-result');
  const treeDiv = document.getElementById('cbor-tree');

  output.classList.remove('visible');

  if (!hexInput.trim()) {
    resultDiv.className = 'validation-result warning';
    resultDiv.innerHTML = 'Please enter a hex-encoded QDEF payload.';
    output.classList.add('visible');
    treeDiv.innerHTML = '';
    return;
  }

  const bytes = hexToBytes(hexInput);
  if (!bytes) {
    resultDiv.className = 'validation-result invalid';
    resultDiv.innerHTML = 'Invalid hex input. Please enter valid hexadecimal (with or without spaces).';
    output.classList.add('visible');
    treeDiv.innerHTML = '';
    return;
  }

  const result = validateQDEF(bytes);

  if (result.valid) {
    resultDiv.className = 'validation-result valid';
    resultDiv.innerHTML = `<strong>Payload is a valid QDEF container.</strong> (${bytes.length} bytes)`;
  } else {
    resultDiv.className = 'validation-result invalid';
    resultDiv.innerHTML = `<strong>Payload is NOT a valid QDEF container.</strong>`;
  }

  // Issues list
  let issuesHtml = '<ul style="margin-top:0.5rem;list-style:none;padding-left:0">';
  for (const issue of result.issues) {
    if (typeof issue === 'string') {
      issuesHtml += `<li style="color:var(--text-muted);font-size:0.85rem">${issue}</li>`;
    } else if (issue.level === 'ok') {
      issuesHtml += `<li style="color:#155724;font-size:0.85rem">${issue.text}</li>`;
    } else if (issue.level === 'warn') {
      issuesHtml += `<li style="color:#856404;font-size:0.85rem">${issue.text}</li>`;
    } else {
      issuesHtml += `<li style="color:#721c24;font-size:0.85rem">${issue.text}</li>`;
    }
  }
  issuesHtml += '</ul>';
  resultDiv.innerHTML += issuesHtml;

  // CBOR tree
  if (result.root) {
    treeDiv.innerHTML = `<h3 style="margin-bottom:0.5rem">CBOR Structure</h3><div class="tree"><ul>${fmtCBOR(result.root)}</ul></div>`;
  }

  // QR Code generation
  const qrSection = document.getElementById('qr-section');
  const qrWrapper = document.getElementById('qr-canvas-wrapper');
  const qrInfo = document.getElementById('qr-info');
  qrWrapper.innerHTML = '';
  if (typeof qrcode !== 'undefined') {
    try {
      let qrStr = '';
      for (let i = 0; i < bytes.length; i++) {
        qrStr += String.fromCharCode(bytes[i]);
      }
      const qr = qrcode(0, 'L');
      qr.addData(qrStr, 'Byte');
      qr.make();
      qrWrapper.innerHTML = qr.createImgTag(4, 4);
      const mc = qr.getModuleCount();
      const ver = (mc - 17) / 4;
      let info = `${bytes.length} B · v${ver} (${mc}×${mc}) · ECC L`;
      if (bytes.length <= 400) info += ' · super reliable';
      else if (bytes.length <= 600) info += ' · average reliability';
      else if (bytes.length <= 800) info += ' · dense';
      else if (bytes.length <= 1000) info += ' · super dense';
      else info += ' · may be difficult to scan';
      if (!result.valid) info += ' · ⚠ invalid payload';
      qrInfo.textContent = info;
      qrSection.style.display = '';
    } catch (e) {
      qrWrapper.innerHTML = `<span style="color:#721c24">QR capacity exceeded (${bytes.length} bytes). Try fewer examples.</span>`;
      qrInfo.textContent = '';
      qrSection.style.display = '';
    }
  } else {
    qrSection.style.display = 'none';
  }

  output.classList.add('visible');
}

// Example payloads
const EXAMPLES = [
  {
    label: 'Wi-Fi + URL Bundle',
    hex: '51 44 45 46 ' +
      '82 ' +
      '  82 ' +
      '    18 64 ' +
      '    a3 ' +
      '      00 6e 4d 79 20 43 6f 66 66 65 65 20 53 68 6f 70 ' +
      '      02 68 67 75 65 73 74 31 32 33 ' +
      '      04 02 ' +
      '  82 ' +
      '    0a ' +
      '    a1 ' +
      '      00 78 1f 68 74 74 70 73 3a 2f 2f 65 78 61 6d 70 6c 65 2e 63 6f 6d 2f 63 6f 66 66 65 65 2d 6d 65 6e 75'
  },
  {
    label: 'TagDrop Route (scoped)',
    hex: '51 44 45 46 ' +
      '81 ' +
      '  83 44 89 d4 14 e0 01 a2 00 48 53 6f 6d 65 44 65 73 74 02 01'
  },
  {
    label: 'Media Preview + Payload',
    hex: '51 44 45 46 81 83 0e a3 00 6a 74 65 78 74 2f 70 6c 61 69 6e 2a 48 12 9d a0 88 d6 d3 61 bc 2e 69 68 65 6c 6c 6f 2e 74 78 74 83 06 a1 00 6a 74 65 78 74 2f 70 6c 61 69 6e 58 19 48 65 6c 6c 6f 20 66 72 6f 6d 20 54 61 67 44 72 6f 70 20 43 6f 6e 74 65 6e 74'
  },
  {
    label: 'TagDrop Content Extension',
    hex: '51 44 45 46 81 83 44 89 d4 14 e0 01 a3 03 64 68 69 6e 74 0b 6a 64 65 73 63 72 69 70 74 69 6f 6e 0d 42 01 02'
  },
  {
    label: 'Single URL (global typeId=10)',
    hex: '51 44 45 46 ' +
      '81 ' +
      '  82 0a a1 00 78 18 68 74 74 70 73 3a 2f 2f 65 78 61 6d 70 6c 65 2e 63 6f 6d 2f 71 64 65 66'
  },
  {
    label: 'Empty Bundle (typeId=0, no subrecords)',
    hex: '51 44 45 46 80'
  },
  {
    label: 'Invalid: no magic header',
    hex: '00 01 02 03 81 01'
  }
];

function populateExamples() {
  const sel = document.getElementById('example-select');
  for (const ex of EXAMPLES) {
    const opt = document.createElement('option');
    opt.value = ex.label;
    opt.textContent = ex.label;
    sel.appendChild(opt);
  }
}

function loadExample() {
  const sel = document.getElementById('example-select');
  const label = sel.value;
  if (!label) return;
  const ex = EXAMPLES.find(e => e.label === label);
  if (!ex) return;
  document.getElementById('hex-input').value = ex.hex;
  validateQDEPayload(ex.hex);
}

populateExamples();

// ── QR scanning ──────────────────────────────────────────────────────────
if (typeof ZXingWASM !== 'undefined') {
  ZXingWASM.prepareZXingModule({ fireImmediately: true });
}

let scanStream = null;
let scanRafId = null;
let scanning = false;

function hexFromBytes(bytes) {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join(' ');
}

function handleScannedBytes(bytes) {
  const hex = hexFromBytes(bytes);
  document.getElementById('hex-input').value = hex;
  document.getElementById('validator-output').classList.remove('visible');
}

async function scanQr(imgData) {
  const results = await ZXingWASM.readBarcodes(imgData, { formats: ['QRCode'], tryHarder: true });
  return results[0] || null;
}

async function tickScan(video, canvas) {
  if (!scanning) return;
  if (video.readyState === video.HAVE_ENOUGH_DATA) {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(video, 0, 0);
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const result = await scanQr(img);
    if (!scanning) return;
    if (result) {
      stopScan();
      handleScannedBytes(result.bytes);
      return;
    }
  }
  scanRafId = requestAnimationFrame(() => tickScan(video, canvas));
}

async function startScan() {
  if (scanning) return;
  const overlay = document.getElementById('scanOverlay');
  const video = document.getElementById('scanVideo');
  overlay.classList.remove('hidden');
  try {
    scanStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' } }
    });
    video.srcObject = scanStream;
    scanning = true;
    tickScan(video, document.getElementById('scanCanvas'));
  } catch (e) {
    overlay.classList.add('hidden');
  }
}

function stopScan() {
  scanning = false;
  if (scanRafId) { cancelAnimationFrame(scanRafId); scanRafId = null; }
  if (scanStream) { scanStream.getTracks().forEach(t => t.stop()); scanStream = null; }
  document.getElementById('scanVideo').srcObject = null;
  document.getElementById('scanOverlay').classList.add('hidden');
}

function decodeQrFromImage(img) {
  const c = document.createElement('canvas');
  c.width = img.naturalWidth || img.width;
  c.height = img.naturalHeight || img.height;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  return scanQr(ctx.getImageData(0, 0, c.width, c.height));
}

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('btnScan').addEventListener('click', startScan);
    document.getElementById('btnStopScan').addEventListener('click', stopScan);

    const dropZone = document.getElementById('qrDropZone');
    const fileInput = document.getElementById('qrFileInput');

    dropZone.addEventListener('dragover', e => {
      e.preventDefault();
      dropZone.classList.add('dragover');
    });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
    dropZone.addEventListener('drop', async e => {
      e.preventDefault();
      dropZone.classList.remove('dragover');
      const file = e.dataTransfer.files[0];
      if (!file || !file.type.startsWith('image/')) return;
      const img = await loadImage(file);
      const result = await decodeQrFromImage(img);
      if (result) handleScannedBytes(result.bytes);
    });

    fileInput.addEventListener('change', async () => {
      const file = fileInput.files[0];
      if (!file) return;
      const img = await loadImage(file);
      const result = await decodeQrFromImage(img);
      if (result) handleScannedBytes(result.bytes);
    });

    document.addEventListener('paste', async e => {
      const items = e.clipboardData.items;
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (!file) continue;
          const img = await loadImage(file);
          const result = await decodeQrFromImage(img);
          if (result) { handleScannedBytes(result.bytes); break; }
        }
      }
    });
  });
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Failed to load image')); };
    img.src = url;
  });
}
