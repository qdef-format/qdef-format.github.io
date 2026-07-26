const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

globalThis.QDEF_REGISTRY = JSON.parse(
  fs.readFileSync(path.join(ROOT, '_site', 'assets', 'registry-data.js'), 'utf-8')
    .replace('const QDEF_REGISTRY = ', '').replace(/;\n$/, '')
);

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

function test(label, hex, expectValid) {
  const bytes = hexToBytes(hex);
  if (!bytes) { assert(false, label + ': hexToBytes returned null'); return; }
  const r = validateQDEF(bytes);
  const ok = r.valid === expectValid;
  assert(ok, label + ': expected valid=' + expectValid + ' got valid=' + r.valid + ' (' + r.issues.filter(i => i.level === 'error').length + ' errors)');
  // Verify CBOR tree renders without throwing
  try {
    if (r.root) fmtCBOR(r.root);
  } catch (e) {
    assert(false, label + ': fmtCBOR threw: ' + e.message);
  }
}

// Valid payloads
test('Wi-Fi + URL Bundle',
  '51 44 45 46 82 82 18 64 a3 00 6e 4d 79 20 43 6f 66 66 65 65 20 53 68 6f 70 02 68 67 75 65 73 74 31 32 33 04 02 82 0a a1 00 78 1f 68 74 74 70 73 3a 2f 2f 65 78 61 6d 70 6c 65 2e 63 6f 6d 2f 63 6f 66 66 65 65 2d 6d 65 6e 75', true);

test('TagDrop Route (scoped)',
  '51 44 45 46 81 83 44 66 3c 1c f2 01 a2 00 48 53 6f 6d 65 44 65 73 74 02 01', true);

test('Single URL (global typeId=10)',
  '51 44 45 46 81 82 0a a1 00 78 18 68 74 74 70 73 3a 2f 2f 65 78 61 6d 70 6c 65 2e 63 6f 6d 2f 71 64 65 66', true);

test('Empty Bundle (no subrecords)',
  '51 44 45 46 80', true);

// Invalid payloads
test('No magic header',
  '00 01 02 03 81 01', false);

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

// Verify annotations on TagDrop example
(function() {
  const bytes = hexToBytes('51 44 45 46 81 83 44 66 3c 1c f2 01 a2 00 48 53 6f 6d 65 44 65 73 74 02 01');
  const r = validateQDEF(bytes);
  assert(r.root._ann && r.root._ann.includes('Bundle'), 'Root array annotated as Bundle');
  const sub = r.root.value[0];
  assert(sub && sub._ann && sub._ann.includes('Tag Drop'), 'Subrecord annotated with namespace name');
  assert(sub && sub._ann && sub._ann.includes('Tag Drop Route'), 'Subrecord annotated with type name');
  const nsBytes = sub.value[0];
  assert(nsBytes && nsBytes._ann && nsBytes._ann.includes('Tag Drop'), 'Namespace bytes annotated');
  const tid = sub.value[1];
  assert(tid && tid._ann && tid._ann.includes('Tag Drop Route'), 'TypeId annotated');
})();

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
