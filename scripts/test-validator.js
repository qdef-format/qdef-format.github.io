const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

globalThis.QDEF_REGISTRY = JSON.parse(
  fs.readFileSync(path.join(ROOT, '_site', 'assets', 'registry-data.js'), 'utf-8')
    .replace('const QDEF_REGISTRY = ', '').replace(/;\n$/, '')
);

// Load examples from the shared data file
globalThis.VALIDATOR_EXAMPLES = [];
eval(fs.readFileSync(path.join(ROOT, 'assets', 'validator-examples.js'), 'utf-8'));

const valSrc = fs.readFileSync(path.join(ROOT, 'tools', 'validator.js'), 'utf-8');
// Strip browser-only code (populateExamples references document)
const cleanSrc = valSrc
  .replace(/function populateExamples[\s\S]*?^}/m, 'function populateExamples() {}')
  .replace(/function loadExample[\s\S]*?^}/m, 'function loadExample() {}')
  .replace(/populateExamples\(\);/g, '');
eval(cleanSrc);

let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (condition) { passed++; }
  else { failed++; console.error('FAIL: ' + msg); }
}

function test(label, hex, expectValid, opts) {
  opts = opts || {};
  const bytes = hexToBytes(hex);
  if (!bytes) { assert(false, label + ': hexToBytes returned null'); return; }
  const r = validateQDEF(bytes);
  const ok = r.valid === expectValid;
  assert(ok, label + ': expected valid=' + expectValid + ' got valid=' + r.valid + ' (' + r.issues.filter(i => i.level === 'error').length + ' errors)');
  // Check no trailing bytes when expected clean
  if (opts.expectClean) {
    const trailing = r.issues.filter(i => i.text && i.text.includes('unparsed'));
    assert(trailing.length === 0, label + ': expected no trailing bytes, got: ' + (trailing.length ? trailing[0].text : ''));
  }
  // Verify CBOR tree renders without throwing
  try {
    if (r.root) fmtCBOR(r.root);
  } catch (e) {
    assert(false, label + ': fmtCBOR threw: ' + e.message);
  }
}

// ── Tests from shared validator-examples.js ──────────────────────────────
for (const ex of VALIDATOR_EXAMPLES) {
  test(ex.label, ex.hex, ex.expectValid, { expectClean: ex.expectValid });
}

// ── Additional edge cases ──────────────────────────────────────────────

test('Odd typeId without namespace',
  '51 44 45 46 81 83 01 a0', false);

test('Bundle with payload',
  '51 44 45 46 82 01 a0', false);

test('Too short (3 bytes)',
  '51 44 45', false);

test('Empty hex string',
  '', false);

// Edge cases that should not crash
test('Truncated text string (structurally valid, content truncated)',
  '51 44 45 46 81 82 0a a1 00 78 20 68', true);

test('Random garbage CBOR',
  '51 44 45 46 de ad be ef ca fe ba be', false);

// ── Annotation verification ──────────────────────────────────────────────
(function() {
  const bytes = hexToBytes('51 44 45 46 81 83 44 89 d4 14 e0 01 a2 00 48 53 6f 6d 65 44 65 73 74 02 01');
  const r = validateQDEF(bytes);
  assert(r.root._ann && r.root._ann.includes('Bundle'), 'Root array annotated as Bundle');
  const sub = r.root.value[0];
  assert(sub && sub._ann && sub._ann.includes('TagDrop'), 'Subrecord annotated with namespace name');
  assert(sub && sub._ann && sub._ann.includes('Content Extension'), 'Subrecord annotated with type name');
  const nsBytes = sub.value[0];
  assert(nsBytes && nsBytes._ann && nsBytes._ann.includes('TagDrop'), 'Namespace bytes annotated');
  const tid = sub.value[1];
  assert(tid && tid._ann && tid._ann.includes('Content Extension'), 'TypeId annotated');
})();

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
