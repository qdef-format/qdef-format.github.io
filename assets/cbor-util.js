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

function formatUUID(bytes) {
  if (!bytes || bytes.length !== 16) return null;
  const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20,32)}`;
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
};

// Generated from standard-types.rec at build time (assets/standard-types-data.js,
// loaded before this file) -- or set directly on `global` by the Node
// loaders (scripts/load-validator.js, scripts/gen-examples.js) that eval
// this file headlessly. Never hardcoded here: standard-types.rec is the
// single source of truth for standard Record Type field shapes.
const STANDARD_TYPE_NAMES = global.QDEF_STANDARD_TYPE_NAMES || {};
const STANDARD_SHAPES = global.QDEF_STANDARD_SHAPES || {};

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

// A typeId's first element may be negative (§3.5 -- scoped, inheriting
// the ambient namespace, in place of an explicit namespace bstr). The
// magnitude is the type's actual identity for registry/shape lookup;
// the sign is a wire-encoding flag, not part of the number itself --
// typeId -100 and typeId 100 (with an explicit repeated namespace)
// name the same type.
function absTypeId(v) {
  if (typeof v === 'bigint') return v < 0n ? -v : v;
  return Math.abs(v);
}

function getFieldDef(typeId, keyStr, nsHex) {
  if (COMMON_FIELDS[keyStr]) return COMMON_FIELDS[keyStr];

  // Only ever resolve field names against the record's own actual
  // namespace (nsHex). A typeId is only meaningful relative to whatever
  // namespace is actually present (or absent = global) — searching
  // every *other* registered namespace for a numeric match here would
  // misattribute an unrelated scoped type's field names onto this
  // record purely by typeId coincidence, exactly the collision hazard
  // namespace-scoping exists to prevent (QDEF-SPEC.md §3.5).
  let shape;
  if (nsHex && typeof QDEF_REGISTRY !== 'undefined') {
    const entry = QDEF_REGISTRY[nsHex];
    if (entry && entry.types[String(typeId)]) {
      shape = parseShape(entry.types[String(typeId)].shape);
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
  let idx = 0, namespace = null, nsAnnotation = null;

  if (idx < items.length && items[idx].type === 'bytes' && items[idx].value.length <= 8) {
    namespace = items[idx];
    idx++;
    if (idx < items.length && items[idx].type === 'tstr') {
      nsAnnotation = items[idx];
      idx++;
    }
  }

  // typeId: an optional leading negative int (§3.5 -- scoped, adopting
  // the ambient namespace, only meaningful with no namespace bstr
  // above), followed by zero or more uints for the rest of the X.X.X
  // hierarchy.
  const typeIdUints = [];
  let tidItem = null;
  let typeIdNegative = false;
  if (idx < items.length && items[idx].type === 'nint') {
    tidItem = items[idx];
    typeIdNegative = true;
    typeIdUints.push(items[idx].value);
    idx++;
  }
  while (idx < items.length && items[idx].type === 'uint') {
    if (!tidItem) tidItem = items[idx];
    typeIdUints.push(items[idx].value);
    idx++;
  }
  const typeIdExplicit = typeIdUints.length > 0;

  let typeAnnotation = null;
  if (typeIdExplicit && idx < items.length && items[idx].type === 'tstr') {
    typeAnnotation = items[idx];
    idx++;
  }

  let mapItem = null;
  if (idx < items.length && items[idx].type === 'map') {
    mapItem = items[idx];
    idx++;
  }

  const subrecords = items.slice(idx).filter(i => i.type === 'array');

  return { namespace, nsAnnotation, typeId: typeIdUints, typeIdExplicit, typeIdNegative, tidItem, typeAnnotation, mapItem, subrecords };
}

// ── In-place Record annotation (shared between validator and docs) ─────

function annotateItem(item, text) {
  if (item) item._ann = text;
}

function annotateRecordStructure(arr, inheritedNamespace) {
  const ra = analyzeRecord(arr);
  const { namespace, nsAnnotation, typeId, typeIdExplicit, typeIdNegative, tidItem, typeAnnotation, mapItem, subrecords } = ra;

  // Namespace resolution (§3.5). A namespace bstr's ONLY job is to set
  // the ambient namespace for subrecords -- it never scopes the
  // Record's own typeId. A Record's own scope is decided purely by its
  // own typeId's sign, independent of whether a bstr sits on the same
  // Record:
  //
  // - effectiveNamespace: THIS Record's own scope. Non-negative typeId
  //   = always global, unconditional, regardless of any bstr present
  //   here or any ambient flowing through. Negative typeId = the
  //   ambient namespace received from the immediate parent -- never
  //   this Record's own bstr, which only ever affects subrecords.
  // - namespaceForChildren: what subrecords receive as their own
  //   ambient. An explicit non-empty bstr resets it (regardless of this
  //   Record's own typeId or scope); no bstr at all passes the received
  //   ambient straight through unchanged.
  const namespaceIsEmptyBstr = !!(namespace && namespace.value.length === 0);
  const effectiveNamespace = typeIdNegative ? (inheritedNamespace || null) : null;
  const namespaceForChildren = (namespace && namespace.value.length > 0)
    ? namespace
    : (inheritedNamespace || null);
  let regNsHex = null;
  if (effectiveNamespace) {
    regNsHex = bytesToHex(effectiveNamespace.value).replace(/ /g, '');
  }

  // A Bundle is defined purely by absent typeId (§4.6) — it MAY still
  // carry a namespace bstr of its own, e.g. to let its subrecords
  // cascade from it without transmitting the value per-child.
  const isBundle = typeId.length === 0;

  // Annotate namespace -- always a cascade-only declaration, whatever
  // this Record's own typeId turns out to be.
  if (namespace) {
    let nsAnn;
    if (namespace.value.length === 0) {
      nsAnn = 'invalid: empty namespace (h\'\') -- use a negative typeId to inherit instead (§3.5)';
    } else {
      const nsBstrHex = bytesToHex(namespace.value).replace(/ /g, '');
      nsAnn = 'namespace (cascades to subrecords): ' + nsBstrHex;
      if (typeof QDEF_REGISTRY !== 'undefined' && QDEF_REGISTRY[nsBstrHex]) {
        const entry = QDEF_REGISTRY[nsBstrHex];
        nsAnn += ` (${entry.variable || entry.name})`;
      }
    }
    annotateItem(namespace, nsAnn);
  }
  if (nsAnnotation) {
    annotateItem(nsAnnotation, `annotation: "${nsAnnotation.value}"`);
  }

  // Resolve type name. Lookups key on the typeId's magnitude -- the
  // sign is a wire-encoding flag for how scope was determined, not
  // part of the type's identity (§3.5).
  const typeIdKey = typeId.length > 0 ? absTypeId(typeId[0]) : null;
  let typeName = null;
  if (regNsHex && typeof QDEF_REGISTRY !== 'undefined') {
    const entry = QDEF_REGISTRY[regNsHex];
    if (entry && entry.types) {
      if (typeId.length === 1 && entry.types[String(typeIdKey)]) {
        typeName = entry.types[String(typeIdKey)].variable || entry.types[String(typeIdKey)].name;
      }
    }
  }
  if (!typeName && typeId.length === 1 && !typeIdNegative && STANDARD_TYPE_NAMES[String(typeId[0])]) {
    typeName = STANDARD_TYPE_NAMES[String(typeId[0])];
  }

  // Annotate typeId. A namespace bstr on this same Record never affects
  // this: non-negative is always global, negative always adopts the
  // ambient (received from a parent, not this Record's own bstr).
  if (typeIdExplicit && tidItem) {
    const tidStr = typeId.join(',');
    let scope;
    if (typeIdNegative) scope = regNsHex ? `scoped, inherits [${regNsHex}]` : 'scoped, no ambient namespace';
    else scope = 'global';
    let typeAnn = `typeId=[${tidStr}] (${scope})`;
    if (typeName) typeAnn += ` - ${typeName}`;
    annotateItem(tidItem, typeAnn);
  }
  if (typeAnnotation) {
    annotateItem(typeAnnotation, `annotation: "${typeAnnotation.value}"`);
  }

  // Annotate array itself with record description
  let recordAnn = '';
  if (isBundle) {
    recordAnn = 'Bundle';
  } else {
    const tidStr = typeId.join('.');
    let base = `Record [${tidStr}]`;
    if (regNsHex && typeof QDEF_REGISTRY !== 'undefined') {
      const entry = QDEF_REGISTRY[regNsHex];
      if (entry) {
        const nsName = entry.variable || entry.name;
        base = `${nsName} ${base}`;
      }
    }
    if (typeName) base += ` — ${typeName}`;
    recordAnn = base;
  }
  if (recordAnn) annotateItem(arr, recordAnn);

  // Annotate map keys
  if (mapItem) {
    for (const pair of mapItem.value) {
      if (pair.key && (pair.key.type === 'uint' || pair.key.type === 'nint')) {
        const keyVal = pair.key.value;
        const k = String(keyVal);

        // Key 0 = payload (reserved)
        if (keyVal === 0) {
          annotateItem(pair.key, 'payload');
          continue;
        }

        // Key -1 = spec-reserved Record ID
        if (keyVal === -1) {
          const common = COMMON_FIELDS[k];
          annotateItem(pair.key, common ? `${common.name} (spec-reserved)` : `spec-reserved key ${k}`);
          if (pair.value && pair.value.type === 'tag' && pair.value.tag === 37 &&
              pair.value.value && pair.value.value.type === 'bytes' &&
              pair.value.value.value && pair.value.value.value.length === 16) {
            annotateItem(pair.value, `UUID: ${formatUUID(pair.value.value.value)}`);
          }
          continue;
        }

        // Negative < -1 = reserved
        if (keyVal < -1) {
          annotateItem(pair.key, `reserved`);
          continue;
        }

        // Positive > 0: per-Type with even/odd
        const keyParity = keyVal % 2 === 0 ? 'even/critical' : 'odd/optional';
        const tidForLookup = typeIdKey !== null ? typeIdKey : 0;
        const fd = getFieldDef(tidForLookup, k, regNsHex);
        if (fd) {
          annotateItem(pair.key, `${fd.name} (${keyParity})`);
          if (pair.value && pair.value.type !== 'map' && pair.value.type !== 'array') {
            annotateItem(pair.value, fd.type);
          }
        } else {
          annotateItem(pair.key, keyParity);
        }
      }
    }
  }

  // Recurse into subrecords
  for (const sub of subrecords) {
    annotateRecordStructure(sub, namespaceForChildren);
  }

  return { namespace, typeId, typeIdExplicit, mapItem, subrecords, effectiveNamespace };
}

// ── Text tree renderer (shared between validator and docs) ────────────

function renderInlineText(item) {
  if (!item) return '(null)';
  switch (item.type) {
    case 'uint': case 'nint': return String(item.value);
    case 'bytes': {
      const hex = Array.from(item.value.slice(0, 8)).map(b => b.toString(16).padStart(2, '0')).join('');
      return `h'${hex}${item.value.length > 8 ? '...' : ''}'`;
    }
    case 'tstr': {
      const s = item.value.length > 40 ? item.value.slice(0, 40) + '...' : item.value;
      return `"${s}"`;
    }
    case 'simple': return item.value === 20 ? 'false' : item.value === 21 ? 'true' : `simple(${item.value})`;
    case 'tag': return `tag(${item.tag})`;
    case 'array': return `[${item.value.length} items]`;
    case 'map': return `{${item.value.length} keys}`;
    default: return `(${item.type})`;
  }
}

function renderTreeText(item, indent) {
  const pad = '  '.repeat(indent);
  if (!item) return pad + '(null)';
  if (item.type === 'error') return pad + `⚠ ${item.text}`;

  const ann = item._ann ? ` // ${item._ann}` : '';

  switch (item.type) {
    case 'uint':
    case 'nint':
      return pad + String(item.value) + ann;

    case 'bytes': {
      const hex = bytesToHex(item.value).replace(/ /g, '');
      const size = item.value.length > 0 ? ` (${item.value.length} B)` : '';
      return pad + `h'${hex}'${size}${ann}`;
    }

    case 'tstr': {
      const s = item.value.length > 64 ? item.value.slice(0, 64) + '...' : item.value;
      return pad + `"${s}"` + ann;
    }

    case 'simple':
      return pad + (item.value === 20 ? 'false' : item.value === 21 ? 'true' : `simple(${item.value})`) + ann;

    case 'tag':
      return pad + `tag(${item.tag})\n` + renderTreeText(item.value, indent + 1);

    case 'array': {
      const items = (item.value || []).filter(i => i != null);
      if (items.length === 0) return pad + '[]' + ann;
      let s = pad + `[ ${items.length} items${ann}\n`;
      for (let i = 0; i < items.length; i++) {
        if (i > 0) s += '\n';
        s += renderTreeText(items[i], indent + 1);
      }
      s += '\n' + pad + ']';
      return s;
    }

    case 'map': {
      if (item.value.length === 0) return pad + '{}' + ann;
      let s = pad + `{ ${item.value.length} keys\n`;
      for (const p of item.value) {
        const k = p.key;
        const v = p.value;
        let keyAnn = '';
        if (k._ann) {
          keyAnn = ` // ${k._ann}`;
        } else if ((k.type === 'uint' || k.type === 'nint') && typeof k.value === 'number') {
          keyAnn = ` // ${k.value % 2 === 0 ? 'even/critical' : 'odd/optional'}`;
        }
        const kText = renderInlineText(k);
        const vText = renderInlineText(v);
        const vAnn = v._ann && (v.type === 'map' || v.type === 'array') ? '' : v._ann ? ` ${v._ann}` : '';
        s += '  '.repeat(indent + 1) + `${kText}: ${vText}${vAnn}${keyAnn}\n`;
      }
      s += pad + '}';
      return s;
    }

    default:
      return pad + `(${item.type})` + ann;
  }
}

// ── Global registration ───────────────────────────────────────────────

global.CBOR_UTIL = {
  hexToBytes,
  bytesToHex,
  formatUUID,
  CBORReader,
  COMMON_FIELDS,
  STANDARD_TYPE_NAMES,
  STANDARD_SHAPES,
  parseShape,
  getFieldDef,
  fieldName,
  absTypeId,
  analyzeRecord,
  annotateItem,
  annotateRecordStructure,
  renderInlineText,
  renderTreeText,
};

})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this);
