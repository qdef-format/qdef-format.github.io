#!/usr/bin/env node
'use strict';
// Headless CLI for validateQDEF() -- decode and validate a hex-encoded
// QDEF payload without a browser, for use by bots/CI. Prints a JSON
// result to stdout and exits non-zero on validation errors.
//
//   npx qdef-validate "51 44 45 46 82 05 A1 00 78 18 68 74 74 70 73 3A ..."
//   npx qdef-validate 51444546... < payload.hex
//   npx qdef-validate --strict <hex>
//
// --strict enables additional, more speculative checks that are opt-in
// rather than default because they can only be inferred from this
// tool's own local shape data (registry.rec / STANDARD_SHAPES), which
// could be stale against a real, newer extension -- e.g. flagging an
// even/critical map key a Type's known shape doesn't document, which
// per §3.2 is exactly what a conformant decoder implementing that Type
// MUST abort the Record on, but might just be this tool not knowing
// about a legitimate newer field yet.
//
// Output shape: { valid: boolean, issues: [{level, text}, ...], tree: <string> }
// `tree` is the same indented rendering used elsewhere on the site
// (docs/EXAMPLES.md, the online validator), not a raw object dump --
// CBOR items include Buffer/typed-array values that aren't directly
// JSON-safe, and the rendered form is more useful to a bot than a
// blow-by-blow token dump would be.

const path = require('path');
const { loadValidator } = require('./load-validator');

function readStdin() {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf-8');
    process.stdin.on('data', (chunk) => (data += chunk));
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', reject);
  });
}

async function main() {
  const rawArgs = process.argv.slice(2);
  const strict = rawArgs.includes('--strict');
  const positional = rawArgs.filter((a) => a !== '--strict');

  const arg = positional[0];
  const hex = arg !== undefined ? arg : (await readStdin()).trim();

  if (!hex) {
    process.stderr.write('Usage: qdef-validate [--strict] <hex> (or pipe hex via stdin)\n');
    process.exit(2);
  }

  const ROOT = path.join(__dirname, '..');
  const { validateQDEF, CBOR_UTIL } = loadValidator(ROOT);
  const { hexToBytes, renderTreeText } = CBOR_UTIL;

  const bytes = hexToBytes(hex);
  if (!bytes) {
    process.stdout.write(JSON.stringify({ valid: false, issues: [{ level: 'error', text: 'Could not parse input as hex' }], tree: null }, null, 2) + '\n');
    process.exit(1);
  }

  const result = validateQDEF(bytes, { strict });
  const tree = result.root ? renderTreeText(result.root, 0) : null;

  process.stdout.write(
    JSON.stringify(
      {
        valid: result.valid,
        issues: result.issues,
        tree,
      },
      null,
      2
    ) + '\n'
  );

  process.exit(result.valid ? 0 : 1);
}

main().catch((err) => {
  process.stderr.write(String((err && err.stack) || err) + '\n');
  process.exit(2);
});
