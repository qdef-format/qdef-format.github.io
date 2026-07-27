const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

// Shared CBOR decoder + field metadata + field-name resolution.
const assetPath = path.join(ROOT, 'assets', 'cbor-util.js');
eval(fs.readFileSync(assetPath, 'utf-8'));
const {
  hexToBytes, bytesToHex, CBORReader,
  COMMON_FIELDS, STANDARD_TYPE_NAMES, STANDARD_SHAPES, fieldName
} = CBOR_UTIL;

// ── Formatting helpers ────────────────────────────────────────────────

function fmtInline(item) {
  if (!item) return '(null)';
  switch (item.type) {
    case 'uint': case 'nint': return String(item.value);
    case 'bytes': {
      const h = Array.from(item.value.slice(0, 8)).map(b => b.toString(16).padStart(2, '0')).join('');
      return `h'${h}${item.value.length > 8 ? '...' : ''}'`;
    }
    case 'tstr': return `"${item.value.length > 60 ? item.value.slice(0, 60) + '...' : item.value}"`;
    case 'simple': return item.value === 20 ? 'false' : item.value === 21 ? 'true' : `simple(${item.value})`;
    case 'tag': return `tag(${item.tag})`;
    case 'array': return `[...]`;
    case 'map': return `{...}`;
    default: return `(${item.type})`;
  }
}

function parity(keyNum) {
  return keyNum % 2 === 0 ? 'even/critical' : 'odd/optional';
}

// ── Tree rendering ───────────────────────────────────────────────────

function render(item, typeId, indent) {
  const pad = '  '.repeat(indent);
  if (!item) return pad + '(null)';

  switch (item.type) {
    case 'uint':
    case 'nint':
      return pad + String(item.value);
    case 'bytes':
      return pad + `h'${bytesToHex(item.value)}'`;
    case 'tstr':
      return pad + `"${item.value}"`;
    case 'simple':
      return pad + (item.value === 20 ? 'false' : item.value === 21 ? 'true' : `simple(${item.value})`);
    case 'tag':
      return pad + `tag(${item.tag})\n` + render(item.value, typeId, indent);
    case 'array':
      return renderArray(item, typeId, indent);
    case 'map':
      return renderMap(item, typeId, indent);
    default:
      return pad + `(${item.type})`;
  }
}

function renderArray(arr, typeId, indent) {
  const pad = '  '.repeat(indent);
  if (arr.value.length === 0) return pad + '[]';
  let s = pad + '[\n';
  for (let i = 0; i < arr.value.length; i++) {
    if (i > 0) s += '\n';
    s += render(arr.value[i], typeId, indent + 1);
  }
  s += '\n' + pad + ']';
  return s;
}

function renderMap(map, typeId, indent) {
  const pad = '  '.repeat(indent);
  if (map.value.length === 0) return pad + '{}';
  let s = pad + '{\n';
  for (let i = 0; i < map.value.length; i++) {
    const p = map.value[i];
    const k = p.key;
    const v = p.value;
    const keyNum = (k.type === 'uint' || k.type === 'nint') ? k.value : null;
    const fn = keyNum !== null ? fieldName(typeId, keyNum) : null;
    const par = keyNum !== null ? parity(keyNum) : '';
    let ann = '';
    if (fn) ann = `  // ${fn} (${par})`;
    else if (par) ann = `  // ${par}`;
    s += '  '.repeat(indent + 1) + `${fmtInline(k)}: ${fmtInline(v)}${ann}\n`;
  }
  s += pad + '}';
  return s;
}

// ── Record analysis ───────────────────────────────────────────────────

function analyzeRecord(arr, indent) {
  const items = arr.value || [];
  let idx = 0, namespace = null;

  // optional namespace
  if (idx < items.length && items[idx].type === 'bytes' && items[idx].value.length <= 8) {
    namespace = items[idx];
    idx++;
  }

  // typeId
  let typeId = 0, typeIdExplicit = false;
  if (idx < items.length && (items[idx].type === 'uint' || items[idx].type === 'nint')) {
    typeId = items[idx].value;
    typeIdExplicit = true;
    idx++;
  }

  // map
  let mapItem = null;
  if (idx < items.length && items[idx].type === 'map') {
    mapItem = items[idx];
    idx++;
  }

  // payload
  let payload = null;
  if (idx < items.length && items[idx].type !== 'array') {
    payload = items[idx];
    idx++;
  }

  // subrecords
  const subrecords = items.slice(idx).filter(i => i.type === 'array');

  return { namespace, typeId, typeIdExplicit, mapItem, payload, subrecords };
}

function renderExample(ex) {
  const bytes = hexToBytes(ex.hex);
  const cborStart = bytes.length >= 4 && bytes[0] === 0x51 && bytes[1] === 0x44 && bytes[2] === 0x45 && bytes[3] === 0x46 ? 4 : 0;
  const reader = new CBORReader(bytes.slice(cborStart));
  const root = reader.readItem();

  if (!root || root.type !== 'array') {
    return `\`\`\`js\n${ex.hex}\n\`\`\`\n\n*Not a valid QDEF Bundle.*`;
  }

  let s = '```js\n';
  if (root.value.length === 0) {
    s += '[]     // Bundle (implicit typeId=0), empty\n';
  } else {
    s += renderBundleItems(root.value) + '\n';
  }
  s += '```\n';
  return s;
}

function renderBundleItems(items) {
  if (items.length === 1) {
    const item = items[0];
    if (item.type === 'array') {
      return renderRecordFull(item, 0);
    }
    return '  ' + fmtInline(item);
  }
  let s = '[\n';
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.type === 'array') {
      s += renderRecordFull(item, 1);
    } else {
      s += '  ' + fmtInline(item);
    }
    if (i < items.length - 1) s += '\n';
  }
  s += '\n]';
  return s;
}

function renderRecordFull(arr, indent) {
  const ra = analyzeRecord(arr, indent);
  const pad = '  '.repeat(indent);
  let s = pad + '[\n';

  // typeId line with annotation
  if (ra.typeIdExplicit) {
    const typeName = STANDARD_TYPE_NAMES[String(ra.typeId)] || null;
    const typeParity = ra.typeId % 2 === 0 ? 'even/global' : 'odd/scoped';
    let ann = `  // typeId=${ra.typeId} (${typeParity})`;
    if (typeName) ann += ` — ${typeName}`;
    s += pad + '  ' + ra.typeId + ann + '\n';
  } else {
    s += pad + '  ' + '0 (implicit)  // typeId=0 (even/global) — Bundle\n';
  }

  // namespace
  if (ra.namespace) {
    s += pad + `  // namespace: ${bytesToHex(ra.namespace.value)}\n`;
  }

  // map
  if (ra.mapItem) {
    s += renderMap(ra.mapItem, ra.typeId, indent + 1) + '\n';
  }

  // payload
  if (ra.payload) {
    if (ra.payload.type === 'bytes') {
      const hex = bytesToHex(ra.payload.value);
      const preview = hex.length > 48 ? hex.slice(0, 48) + '...' : hex;
      s += pad + `  h'${preview}'  // payload (${ra.payload.value.length} B)\n`;
    } else {
      s += pad + '  ' + fmtInline(ra.payload) + '  // payload\n';
    }
  }

  // subrecords
  for (let si = 0; si < ra.subrecords.length; si++) {
    s += renderRecordFull(ra.subrecords[si], indent + 1);
    if (si < ra.subrecords.length - 1) s += '\n';
  }

  if (ra.subrecords.length > 0) s += '\n';
  s += pad + ']';
  return s;
}

// ── Main ──────────────────────────────────────────────────────────────

function main() {
  const srcPath = path.join(ROOT, 'assets', 'validator-examples.js');

  // Load examples
  const src = fs.readFileSync(srcPath, 'utf-8');
  let EXAMPLES;
  eval(src);
  EXAMPLES = globalThis.VALIDATOR_EXAMPLES || [];

  let md = `# QDEF Record Type Examples

These are informative examples — actual QDEF payloads decoded into human-readable
Record Type definitions. Each hex string is validated by the CI suite
(via \`assets/validator-examples.js\` and \`scripts/test-validator.js\`).

> **Note:** The hex strings below can be pasted directly into the
> [online Validator](../tools/validator.html) to inspect the CBOR tree
> and generate QR codes.

`;

  for (const ex of EXAMPLES) {
    const validLabel = ex.expectValid ? '' : ' (intentionally broken)';
    md += `## ${ex.label}${validLabel}\n\n`;

    if (ex.descriptor) {
      md += `${ex.descriptor}\n\n`;
    }

    md += `Hex: \`${ex.hex}\`\n\n`;

    if (!ex.expectValid) {
      md += `*This payload is intentionally malformed to test validator error handling.*\n\n`;
    }

    md += renderExample(ex, null);
    md += '\n\n';
  }

  const outPath = path.join(ROOT, 'docs', 'EXAMPLES.md');
  fs.writeFileSync(outPath, md, 'utf-8');
  console.log(`Wrote ${outPath}`);
}

main();
