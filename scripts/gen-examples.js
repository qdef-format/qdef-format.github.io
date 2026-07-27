const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

// Shared CBOR decoder + field metadata + annotation + tree renderer.
const assetPath = path.join(ROOT, 'assets', 'cbor-util.js');
eval(fs.readFileSync(assetPath, 'utf-8'));
const {
  hexToBytes, CBORReader,
  annotateRecordStructure, renderTreeText
} = CBOR_UTIL;

function renderExample(ex) {
  const bytes = hexToBytes(ex.hex);
  const cborStart = bytes.length >= 4 && bytes[0] === 0x51 && bytes[1] === 0x44 && bytes[2] === 0x45 && bytes[3] === 0x46 ? 4 : 0;
  const reader = new CBORReader(bytes.slice(cborStart));
  const root = reader.readItem();

  if (!root || root.type !== 'array') {
    return `\`\`\`js\n${ex.hex}\n\`\`\`\n\n*Not a valid QDEF Bundle.*`;
  }

  annotateRecordStructure(root);

  return '```js\n' + renderTreeText(root, 0) + '\n```\n';
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
