// Regression check for a real bug: assets/cbor-util.js's STANDARD_TYPE_NAMES/
// STANDARD_SHAPES silently resolved to {} in every real browser page, even though
// scripts/test-validator.js (via load-validator.js) passed 38/38 clean throughout.
//
// Root cause: assets/standard-types-data.js declares `const QDEF_STANDARD_TYPE_NAMES`/
// `const QDEF_STANDARD_SHAPES` at a classic <script>'s top level -- a global *lexical*
// binding, not a `window`/`globalThis` *property*. cbor-util.js used to read them via
// `global.QDEF_STANDARD_TYPE_NAMES || {}`, a property lookup that's always undefined
// for a const declared this way -- silently falling back to `{}`, so every standard/
// global Record Type's field-key comments (Split's "Group ID", Media Payload's
// "Content", ...) never appeared in the validator's annotated CBOR tree. Namespaced/
// registry types were unaffected, since QDEF_REGISTRY is checked everywhere via
// `typeof QDEF_REGISTRY !== 'undefined'` (a lexical check, which sees a const binding
// fine) instead of a `global.X` property read -- the asymmetry is exactly what made
// namespaced annotations work while standard ones silently didn't.
//
// scripts/load-validator.js's Node headless path can't catch this class of bug no
// matter how many assertions run through it: it assigns these globals via a real
// `globalThis.X = ...` property (see its own comment), sidestepping the exact
// classic-script scoping gap that broke the real browser page. This script instead
// loads the REAL built assets (_site/assets/*.js) via `vm.Script(...).runInThisContext()`,
// which shares Node's own global object the same way a browser's `<script>` tags
// share `window` -- reproducing the real page's loading semantics, not a shortcut
// around them. Run `npm run build` first if `_site/` is stale or missing.

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');

let passed = 0;
let failed = 0;
function assert(condition, msg) {
  if (condition) { passed++; }
  else { failed++; console.error('FAIL: ' + msg); }
}

const siteAssets = path.join(ROOT, '_site', 'assets');
for (const f of ['registry-data.js', 'standard-types-data.js']) {
  if (!fs.existsSync(path.join(siteAssets, f))) {
    console.error(`${f} not found in _site/assets -- run "npm run build" first.`);
    process.exit(1);
  }
}

function loadClassic(filePath) {
  const src = fs.readFileSync(filePath, 'utf-8');
  new vm.Script(src, { filename: filePath }).runInThisContext();
}

// Same load order as tools/validator.html's <script> tags.
loadClassic(path.join(siteAssets, 'registry-data.js'));
loadClassic(path.join(siteAssets, 'standard-types-data.js'));
loadClassic(path.join(ROOT, 'assets', 'cbor-util.js'));

assert(Object.keys(CBOR_UTIL.STANDARD_TYPE_NAMES).length > 0,
  'STANDARD_TYPE_NAMES must not be empty when loaded the same way a real browser page does');
assert(Object.keys(CBOR_UTIL.STANDARD_SHAPES).length > 0,
  'STANDARD_SHAPES must not be empty when loaded the same way a real browser page does');
assert(CBOR_UTIL.STANDARD_TYPE_NAMES['1'] === 'Split', 'Type 1 must resolve to "Split"');

const splitGroupIdField = CBOR_UTIL.getFieldDef(1, '2', null);
assert(splitGroupIdField && splitGroupIdField.name === 'Group ID',
  'getFieldDef(typeId=1, key="2", nsHex=null) must resolve to Split\'s "Group ID" field ' +
  '(this is the exact lookup annotateRecordStructure() makes when labeling a Split Wrapper\'s map keys)');

// End-to-end: annotate a real, well-formed Split Wrapper Record and confirm its map
// keys actually get field-name comments, not just a bare even/odd label.
const bytes = CBOR_UTIL.hexToBytes('8201a4004161024162040601');
const item = new CBOR_UTIL.CBORReader(bytes).readItem();
CBOR_UTIL.annotateRecordStructure(item, null);
const groupIdKeyAnn = item.value[1].value.find(p => p.key.value === 2)?.key._ann;
assert(groupIdKeyAnn === 'Group ID (even/critical)',
  `Split Wrapper's Group ID key must be annotated with its field name, got: ${groupIdKeyAnn}`);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
