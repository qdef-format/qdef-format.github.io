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

  readItem() {
    if (this.offset >= this.bytes.length) return null;
    const start = this.offset;
    const byte = this.readByte();
    const major = byte >> 5;
    const addInfo = byte & 0x1f;

    const arg = addInfo === 31 ? -1 : this.readArg(addInfo);

    switch (major) {
      case 0: return { type: 'uint', value: typeof arg === 'bigint' ? arg : Number(arg), start, end: this.offset };
      case 1: return { type: 'nint', value: typeof arg === 'bigint' ? -1n - arg : -1 - Number(arg), start, end: this.offset };
      case 2: { // byte string
        if (arg < 0) throw new Error('Indefinite-length byte strings not supported');
        const raw = this.readLen(arg);
        return { type: 'bytes', value: raw, start, end: this.offset };
      }
      case 3: { // text string
        if (arg < 0) throw new Error('Indefinite-length text strings not supported');
        const raw = this.readLen(arg);
        const decoder = new TextDecoder();
        return { type: 'tstr', value: decoder.decode(raw), start, end: this.offset };
      }
      case 4: { // array
        const items = [];
        const count = typeof arg === 'bigint' ? Number(arg) : arg;
        if (count < 0) throw new Error('Indefinite-length arrays not supported');
        for (let i = 0; i < count; i++) items.push(this.readItem());
        return { type: 'array', value: items, start, end: this.offset };
      }
      case 5: { // map
        const pairs = [];
        const count = typeof arg === 'bigint' ? Number(arg) : arg;
        if (count < 0) throw new Error('Indefinite-length maps not supported');
        for (let i = 0; i < count; i++) {
          const k = this.readItem();
          const v = this.readItem();
          pairs.push({ key: k, value: v });
        }
        return { type: 'map', value: pairs, start, end: this.offset };
      }
      case 6: { // tag
        const tagNum = typeof arg === 'bigint' ? Number(arg) : arg;
        const item = this.readItem();
        return { type: 'tag', tag: tagNum, value: item, start, end: this.offset };
      }
      case 7: { // simple/float
        const val = typeof arg === 'bigint' ? Number(arg) : arg;
        if (addInfo <= 23 || addInfo === 24) return { type: 'simple', value: val, start, end: this.offset };
        if (addInfo === 25) return { type: 'float16', value: val, start, end: this.offset };
        if (addInfo === 26) return { type: 'float32', value: val, start, end: this.offset };
        if (addInfo === 27) return { type: 'float64', value: val, start, end: this.offset };
        throw new Error(`Unsupported simple value: ${addInfo}`);
      }
      default:
        throw new Error(`Unsupported major type: ${major}`);
    }
  }
}

function fmtCBOR(item) {
  if (!item) return '<li>(null)</li>';
  switch (item.type) {
    case 'uint':
    case 'nint':
      return `<li><span class="type-num">${item.value}</span></li>`;
    case 'bytes': {
      const hex = Array.from(item.value).slice(0, 16).map(b => b.toString(16).padStart(2, '0')).join('');
      const ellipsis = item.value.length > 16 ? '...' : '';
      return `<li><span class="type-bytes">h'${hex}${ellipsis}'</span> <span class="tree-meta">(${item.value.length} B)</span></li>`;
    }
    case 'tstr': {
      const s = item.value.length > 64 ? item.value.slice(0, 64) + '...' : item.value;
      return `<li><span class="type-str">"${escapeHtml(s)}"</span></li>`;
    }
    case 'array': {
      let html = `<li><span class="tree-bracket">[</span> <span class="tree-meta">${item.value.length} items</span><ul>`;
      for (const v of item.value) {
        html += fmtCBOR(v);
      }
      html += `</ul><span class="tree-bracket">]</span></li>`;
      return html;
    }
    case 'map': {
      let html = `<li><span class="tree-bracket">{</span> <span class="tree-meta">${item.value.length} keys</span><ul>`;
      for (const p of item.value) {
        html += `<li><span class="key">${fmtInline(p.key)}</span>: ${fmtInline(p.value)}`;
        if (p.key.type === 'uint' && typeof p.key.value === 'number') {
          const parity = p.key.value % 2 === 0 ? 'critical' : 'optional';
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
  switch (item.type) {
    case 'uint': case 'nint': return `<span class="type-num">${item.value}</span>`;
    case 'bytes':
      const hex = Array.from(item.value).slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join('');
      const ellipsis = item.value.length > 8 ? '...' : '';
      return `<span class="type-bytes">h'${hex}${ellipsis}'</span>`;
    case 'tstr':
      return `<span class="type-str">"${escapeHtml(item.value.slice(0, 40))}"</span>`;
    case 'simple': return item.value === 21 ? '<span class="type-bool">true</span>' : item.value === 20 ? '<span class="type-bool">false</span>' : `simple(${item.value})`;
    case 'tag': return `tag(${item.tag})`;
    case 'array': return `[${item.value.length} items]`;
    case 'map': return `{${item.value.length} keys}`;
    default: return `(${item.type})`;
  }
}

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// QDEF validation
function validateQDEF(bytes) {
  const issues = [];

  // Check magic
  if (bytes.length < 4) {
    return { valid: false, issues: ['Payload too short: need at least 4 bytes for magic header'] };
  }
  const magic = bytes.slice(0, 4);
  if (magic[0] !== QDEF_MAGIC[0] || magic[1] !== QDEF_MAGIC[1] || magic[2] !== QDEF_MAGIC[2] || magic[3] !== QDEF_MAGIC[3]) {
    return { valid: false, issues: [`Invalid magic header: expected 51 44 45 46 ("QDEF"), got ${bytesToHex(magic)}`] };
  }
  issues.push({ level: 'ok', text: `Magic header: 51 44 45 46 ("QDEF")` });

  // Parse root Record
  const reader = new CBORReader(bytes.slice(4));
  let root;
  try {
    root = reader.readItem();
  } catch (e) {
    return { valid: false, issues: [...issues, { level: 'error', text: `Failed to parse root CBOR: ${e.message}` }] };
  }

  // Root must be an array
  if (!root || root.type !== 'array') {
    return { valid: false, issues: [...issues, { level: 'error', text: `Root Record must be a CBOR array, got ${root ? root.type : 'nothing'}` }] };
  }
  issues.push({ level: 'ok', text: `Root is a CBOR array with ${root.value.length} item(s)` });

  // Analyze Record structure
  analyzeRecord(root, issues, 'Root', 0);

  // Check remaining bytes
  if (reader.offset < bytes.length - 4) {
    issues.push({ level: 'warn', text: `Trailing bytes after root Record: ${bytes.length - 4 - reader.offset} byte(s) unaccounted for` });
  }

  return { valid: issues.filter(i => i.level === 'error').length === 0, root, issues };
}

function analyzeRecord(arr, issues, label, depth) {
  if (depth > 10) {
    issues.push({ level: 'error', text: `${label}: nesting depth exceeds 10` });
    return null;
  }

  const items = (arr.value || []).filter(i => i != null);
  let idx = 0;

  // Determine typeId and namespace
  let namespace = null;
  let typeId = 0; // default Bundle
  let typeIdExplicit = false;

  const nsMatch = idx < items.length && items[idx].type === 'bytes';
  if (nsMatch) {
    namespace = items[idx];
    idx++;
  }

  const tidMatch = idx < items.length && (items[idx].type === 'uint' || items[idx].type === 'nint');
  if (tidMatch) {
    typeId = items[idx].type === 'uint' ? items[idx].value : items[idx].value;
    typeIdExplicit = true;
    idx++;
  }

  // Check map
  const hasMap = idx < items.length && items[idx].type === 'map';
  if (hasMap) idx++;

  // Check payload
  let hasPayload = false;
  if (idx < items.length && items[idx].type !== 'array') {
    hasPayload = true;
    idx++;
  }

  // Remaining items are subrecords
  const subrecords = items.slice(idx).filter(i => i.type === 'array');

  // Build description
  let recLabel = `${label} Record`;
  if (typeId === 0 && !typeIdExplicit) {
    recLabel += ` (Bundle, implicit typeId=0)`;
  } else if (typeId === 0 && typeIdExplicit) {
    recLabel += ` (typeId=0, Bundle)`;
  } else {
    recLabel += ` (typeId=${typeId})`;
  }

  if (namespace) {
    const nsHex = bytesToHex(namespace.value);
    recLabel += ` [namespace: ${nsHex}]`;
    issues.push({ level: 'ok', text: `${recLabel}: namespace present` });
  } else {
    issues.push({ level: 'ok', text: `${recLabel}` });
  }

  if (typeIdExplicit) {
    const parity = typeId % 2 === 0 ? 'even (global)' : 'odd (scoped)';
    issues.push({ level: 'ok', text: `${'  '.repeat(depth+1)}Type ID: ${typeId} (${parity})` });
  }
  if (hasMap) {
    issues.push({ level: 'ok', text: `${'  '.repeat(depth+1)}Has field map` });
  }
  if (hasPayload) {
    let payloadIdx = 0;
    if (namespace) payloadIdx++;
    if (typeIdExplicit) payloadIdx++;
    if (hasMap) payloadIdx++;
    const payload = items[payloadIdx];
    if (payload && payload.type !== 'array') {
      issues.push({ level: 'ok', text: `${'  '.repeat(depth+1)}Has payload: ${fmtInlineShort(payload)}` });
    }
  }
  if (subrecords.length > 0) {
    issues.push({ level: 'ok', text: `${'  '.repeat(depth+1)}${subrecords.length} subrecord(s)` });
    for (let si = 0; si < subrecords.length; si++) {
      analyzeRecord(subrecords[si], issues, `${label}.${si}`, depth + 1);
    }
  }

  // Validation rules
  if (typeId === 0 && hasPayload) {
    issues.push({ level: 'error', text: `${label}: Bundle (typeId=0) MUST NOT carry a payload` });
  }
  if (typeIdExplicit && typeof typeId === 'number' && typeId % 2 !== 0 && !namespace) {
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

  output.classList.add('visible');
}

// Copy from example
function loadExample() {
  const example = '51 44 45 46 ' +
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
    '      00 78 1f 68 74 74 70 73 3a 2f 2f 65 78 61 6d 70 6c 65 2e 63 6f 6d 2f 63 6f 66 66 65 65 2d 6d 65 6e 75';
  document.getElementById('hex-input').value = example;
  validateQDEPayload(example);
}
