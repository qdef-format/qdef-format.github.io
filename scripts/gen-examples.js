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

// ── Annotated tree rendering ─────────────────────────────────────────

function renderExample(ex) {
  const bytes = hexToBytes(ex.hex);
  const cborStart = bytes.length >= 4 && bytes[0] === 0x51 && bytes[1] === 0x44 && bytes[2] === 0x45 && bytes[3] === 0x46 ? 4 : 0;
  const reader = new CBORReader(bytes.slice(cborStart));
  const root = reader.readItem();

  if (!root || root.type !== 'array') {
    return `\`\`\`js\n${ex.hex}\n\`\`\`\n\n*Not a valid QDEF Bundle.*`;
  }

  // Annotate the root bundle and all subrecords
  annotateRecordStructure(root);

  let s = '```js\n';
  s += renderAnnotated(root, 0) + '\n';
  s += '```\n';
  return s;
}

function renderAnnotated(item, indent) {
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
      return pad + `tag(${item.tag})\n` + renderAnnotated(item.value, indent + 1);

    case 'array': {
      const items = (item.value || []).filter(i => i != null);
      if (items.length === 0) return pad + '[]' + ann;
      let s = pad + `[ ${items.length} item${items.length !== 1 ? 's' : ''}${ann}\n`;
      for (let i = 0; i < items.length; i++) {
        if (i > 0) s += '\n';
        s += renderAnnotated(items[i], indent + 1);
      }
      s += '\n' + pad + ']';
      return s;
    }

    case 'map': {
      if (item.value.length === 0) return pad + '{}' + ann;
      let s = pad + `{ ${item.value.length} key${item.value.length !== 1 ? 's' : ''}\n`;
      for (const p of item.value) {
        const k = p.key;
        const v = p.value;
        let keyAnn = '';
        if (k._ann) {
          keyAnn = ` // ${k._ann}`;
        } else if ((k.type === 'uint' || k.type === 'nint') && typeof k.value === 'number') {
          keyAnn = ` // ${k.value % 2 === 0 ? 'even/critical' : 'odd/optional'}`;
        }
        // Render key inline, then colon and value
        const kText = renderInline(k);
        const vText = renderInline(v);
        s += '  '.repeat(indent + 1) + `${kText}: ${vText}${keyAnn}\n`;
      }
      s += pad + '}';
      return s;
    }

    default:
      return pad + `(${item.type})` + ann;
  }
}

function renderInline(item) {
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
