const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const { loadValidator } = require('./load-validator');

// Shared headless loader (also used by scripts/qdef-validate.js) --
// builds QDEF_REGISTRY from registry.rec directly, loads cbor-util.js
// and validator.js with the DOM-only wiring stripped.
const { validateQDEF, fmtCBOR, CBOR_UTIL } = loadValidator(ROOT);

// Load examples from the shared data file (test-only, not part of the
// shared loader since the CLI doesn't need them).
eval(fs.readFileSync(path.join(ROOT, 'assets', 'validator-examples.js'), 'utf-8'));

let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (condition) { passed++; }
  else { failed++; console.error('FAIL: ' + msg); }
}

const { hexToBytes, bytesToHex } = CBOR_UTIL;

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
  const expectClean = ex.expectClean !== undefined ? ex.expectClean : ex.expectValid;
  test(ex.label, ex.hex, ex.expectValid, { expectClean });
}

// ── Additional edge cases ──────────────────────────────────────────────

test('Single uint global typeId',
  '51 44 45 46 81 83 01 a0', true);

test('Single uint with payload at key 0',
  '51 44 45 46 82 01 a0', true);

test('Inherit marker with no parent namespace should error',
  '51 44 45 46 81 83 40 01 a0', false);

// Namespace cascade from validator-examples — just test it round-trips
// (it has expectValid: true, so the existing loop covers it)

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
// A namespace bstr only ever cascades to subrecords (§3.5) -- it never
// scopes the Record carrying it, so the namespace lives on the outer
// Bundle and the actual scoped type is the inner Record, whose negative
// typeId adopts that ambient namespace.
(function() {
  const bytes = hexToBytes('51 44 45 46 82 44 89 d4 14 e0 82 20 a2 00 48 53 6f 6d 65 44 65 73 74 02 01');
  const r = validateQDEF(bytes);
  assert(r.root._ann && r.root._ann.includes('Bundle'), 'Root array annotated as Bundle');
  const nsBytes = r.root.value[0];
  assert(nsBytes && nsBytes._ann && nsBytes._ann.includes('TagDrop'), 'Namespace bytes annotated');
  const sub = r.root.value[1];
  assert(sub && sub._ann && sub._ann.includes('TagDrop'), 'Subrecord annotated with namespace name');
  assert(sub && sub._ann && sub._ann.includes('Content Extension'), 'Subrecord annotated with type name');
  const tid = sub.value[0];
  assert(tid && tid._ann && tid._ann.includes('Content Extension'), 'TypeId annotated');
})();

// A namespace bstr AND a negative typeId on the SAME Record (§3.5's
// amended rule): the Record simultaneously introduces the namespace and
// is scoped by it -- no Bundle wrapper needed. Same content as the
// "TagDrop Route (scoped)" example above, minus the outer Bundle.
(function() {
  const bytes = hexToBytes('51 44 45 46 83 44 89 d4 14 e0 20 a2 00 48 53 6f 6d 65 44 65 73 74 02 01');
  const r = validateQDEF(bytes);
  assert(r.valid, 'Self-scoped root Record (namespace + negative typeId, no Bundle) is valid');
  assert(r.root._ann && !r.root._ann.includes('Bundle'), 'Root array annotated as a Record, not a Bundle (it has a typeId)');
  assert(r.root._ann && r.root._ann.includes('TagDrop'), 'Root Record annotated with its self-declared namespace name');
  const nsBytes = r.root.value[0];
  assert(nsBytes && nsBytes._ann && nsBytes._ann.includes('TagDrop'), 'Namespace bytes annotated');
  const tid = r.root.value[1];
  assert(tid && tid._ann && tid._ann.includes('self-declared'), 'TypeId annotated as self-declaring, not merely inheriting');
})();

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
