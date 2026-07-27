(function(global) {

// ── Byte helpers ──────────────────────────────────────────────────────

function hexToBytes(s) {
  s = s.replace(/\s+/g, '').replace(/0x/gi, '').replace(/[^0-9a-fA-F]/g, '');
  if (s.length % 2 !== 0) return null;
  const bytes = new Uint8Array(s.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(s.substr(i * 2, 2), 16);
  return bytes;
}

function bytesToHex(bytes) {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join(' ');
}

// ── CBOR decoder ─────────────────────────────────────────────────────

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
    if (addInfo === 31) return -1;
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
    if (rawArg.error) return { type: 'error', text: `truncated reading argument at byte ${start}` };
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

// ── Field metadata ─────────────────────────────────────────────────────

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

// ── Field name resolution ─────────────────────────────────────────────

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

function fieldName(typeId, keyNum) {
  const ks = String(keyNum);
  if (COMMON_FIELDS[ks]) return COMMON_FIELDS[ks].name;
  const shape = STANDARD_SHAPES[String(typeId)];
  if (shape && shape[ks]) return shape[ks].name;
  return null;
}

// ── Record structure analysis (shared between validator and docs) ─────

function analyzeRecord(arr) {
  const items = (arr.value || []).filter(i => i != null);
  let idx = 0, namespace = null;

  if (idx < items.length && items[idx].type === 'bytes' && items[idx].value.length <= 8) {
    namespace = items[idx];
    idx++;
  }

  let typeId = 0, typeIdExplicit = false, tidItem = null;
  if (idx < items.length && (items[idx].type === 'uint' || items[idx].type === 'nint')) {
    tidItem = items[idx];
    typeId = tidItem.value;
    typeIdExplicit = true;
    idx++;
  }

  let mapItem = null;
  if (idx < items.length && items[idx].type === 'map') {
    mapItem = items[idx];
    idx++;
  }

  let hasPayload = false, payloadItem = null;
  if (idx < items.length && items[idx].type !== 'array') {
    hasPayload = true;
    payloadItem = items[idx];
    idx++;
  }

  const subrecords = items.slice(idx).filter(i => i.type === 'array');

  return { namespace, typeId, typeIdExplicit, tidItem, mapItem, hasPayload, payloadItem, subrecords };
}

// ── In-place Record annotation (shared between validator and docs) ─────

function annotateItem(item, text) {
  if (item) item._ann = text;
}

function annotateRecordStructure(arr, inheritedNamespace) {
  const ra = analyzeRecord(arr);
  const { namespace, typeId, typeIdExplicit, tidItem, mapItem, payloadItem, subrecords } = ra;

  const effectiveNamespace = namespace || inheritedNamespace;
  let regNsHex = null;
  if (effectiveNamespace) {
    regNsHex = bytesToHex(effectiveNamespace.value).replace(/ /g, '');
  }

  // Annotate namespace
  if (namespace) {
    let nsAnn = 'namespace: ' + bytesToHex(namespace.value).replace(/ /g, '');
    if (typeof QDEF_REGISTRY !== 'undefined' && QDEF_REGISTRY[regNsHex]) {
      const entry = QDEF_REGISTRY[regNsHex];
      nsAnn += ` (${entry.variable || entry.name})`;
    }
    annotateItem(namespace, nsAnn);
  }

  // Annotate typeId
  if (typeIdExplicit) {
    const parity = typeId % 2 === 0 ? 'even (global)' : 'odd (scoped)';
    let typeAnn = `typeId=${typeId} (${parity})`;
    let typeName = null;
    if (regNsHex && typeof QDEF_REGISTRY !== 'undefined') {
      const entry = QDEF_REGISTRY[regNsHex];
      if (entry && entry.types[String(typeId)]) {
        typeName = entry.types[String(typeId)].variable || entry.types[String(typeId)].name;
      }
    }
    if (!typeName && STANDARD_TYPE_NAMES[String(typeId)]) {
      typeName = STANDARD_TYPE_NAMES[String(typeId)];
    }
    if (typeName) typeAnn += ` - ${typeName}`;
    annotateItem(tidItem, typeAnn);
  }

  // Annotate array itself with record description
  let recordAnn = '';
  if (typeId === 0 && !typeIdExplicit) {
    recordAnn = 'Bundle (implicit typeId=0)';
  } else if (typeId === 0 && typeIdExplicit) {
    recordAnn = 'Bundle (typeId=0)';
  } else {
    let base = `Record (typeId=${typeId})`;
    if (regNsHex && typeof QDEF_REGISTRY !== 'undefined') {
      const entry = QDEF_REGISTRY[regNsHex];
      if (entry) {
        const nsName = entry.variable || entry.name;
        base = `${nsName} ${base}`;
      }
    }
    if (typeIdExplicit) {
      const typeName = STANDARD_TYPE_NAMES[String(typeId)] || null;
      if (typeName) base += ` — ${typeName}`;
    }
    recordAnn = base;
  }
  if (recordAnn) annotateItem(arr, recordAnn);

  // Annotate map keys
  if (mapItem) {
    for (const pair of mapItem.value) {
      if (pair.key && (pair.key.type === 'uint' || pair.key.type === 'nint')) {
        const k = String(pair.key.value);
        const fd = getFieldDef(typeId, k, regNsHex);
        const keyParity = typeof pair.key.value === 'number'
          ? (pair.key.value % 2 === 0 ? 'even/critical' : 'odd/optional') : '';
        if (fd) {
          annotateItem(pair.key, keyParity ? `${fd.name} (${keyParity})` : fd.name);
          if (pair.value && pair.value.type !== 'map' && pair.value.type !== 'array') {
            annotateItem(pair.value, fd.type);
          }
        }
      }
    }
  }

  // Recurse into subrecords
  for (const sub of subrecords) {
    annotateRecordStructure(sub, effectiveNamespace);
  }

  return { namespace, typeId, typeIdExplicit, mapItem, payloadItem, subrecords, effectiveNamespace };
}

// ── Global registration ───────────────────────────────────────────────

global.CBOR_UTIL = {
  hexToBytes,
  bytesToHex,
  CBORReader,
  COMMON_FIELDS,
  STANDARD_TYPE_NAMES,
  STANDARD_SHAPES,
  parseShape,
  getFieldDef,
  fieldName,
  analyzeRecord,
  annotateItem,
  annotateRecordStructure,
};

})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this);
