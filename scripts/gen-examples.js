const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

// Shared CBOR decoder + field metadata + field-name resolution.
const assetPath = path.join(ROOT, 'assets', 'cbor-util.js');
eval(fs.readFileSync(assetPath, 'utf-8'));
const {
  hexToBytes, bytesToHex, CBORReader,
  annotateRecordStructure
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

// ── Annotated tree rendering ─────────────────────────────────────────

function renderExample(ex) {
  const bytes = hexToBytes(ex.hex);
  const cborStart = bytes.length >= 4 && bytes[0] === 0x51 && bytes[1] === 0x44 && bytes[2] === 0x45 && bytes[3] === 0x46 ? 4 : 0;
  const reader = new CBORReader(bytes.slice(cborStart));
  const root = reader.readItem();

  if (!root || root.type !== 'array') {
    return `\`\`\`js\n${ex.hex}\n\`\`\`\n\n*Not a valid QDEF Bundle.*`;
  }

  // Annotate all records using the shared annotation logic
  for (const item of root.value) {
    if (item.type === 'array') {
      annotateRecordStructure(item);
    }
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
      return renderAnnotatedRecord(item, 0);
    }
    return '  ' + fmtInline(item);
  }
  let s = '[\n';
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.type === 'array') {
      s += renderAnnotatedRecord(item, 1);
    } else {
      s += '  ' + fmtInline(item);
    }
    if (i < items.length - 1) s += '\n';
  }
  s += '\n]';
  return s;
}

function renderAnnotatedRecord(arr, indent) {
  const pad = '  '.repeat(indent);
  const items = (arr.value || []).filter(i => i != null);
  let s = pad + '[\n';

  let hadSub = false;
  for (let i = 0; i < items.length; i++) {
    const item = items[i];

    if (item.type === 'array') {
      hadSub = true;
      s += renderAnnotatedRecord(item, indent + 1);
      if (i < items.length - 1) s += '\n';
      continue;
    }

    const ann = item._ann ? `  // ${item._ann}` : '';
    const prefix = pad + '  ';

    if (item.type === 'map') {
      s += renderMapAnnotated(item, indent + 1);
      s += '\n';
    } else if (item.type === 'bytes') {
      if (item._ann && item._ann.startsWith('namespace:')) {
        s += prefix + `h'${bytesToHex(item.value).replace(/ /g, '')}'${ann}\n`;
      } else {
        s += prefix + fmtInline(item) + ann + '\n';
      }
    } else {
      s += prefix + fmtInline(item) + ann + '\n';
    }
  }

  if (hadSub) s += '\n';
  s += pad + ']';
  return s;
}

function renderMapAnnotated(map, indent) {
  const pad = '  '.repeat(indent);
  if (map.value.length === 0) return pad + '{}';
  let s = pad + '{';
  for (let i = 0; i < map.value.length; i++) {
    const p = map.value[i];
    const k = p.key;
    const v = p.value;
    let ann = '';
    if (k._ann) {
      ann = `  // ${k._ann}`;
    } else if ((k.type === 'uint' || k.type === 'nint') && typeof k.value === 'number') {
      ann = `  // ${k.value % 2 === 0 ? 'even/critical' : 'odd/optional'}`;
    }
    s += '\n' + '  '.repeat(indent + 1) + `${fmtInline(k)}: ${fmtInline(v)}${ann}`;
  }
  s += '\n' + pad + '}';
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
