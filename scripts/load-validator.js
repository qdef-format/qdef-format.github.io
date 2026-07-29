// Deliberately NOT 'use strict' -- loadValidator() relies on a direct,
// sloppy-mode eval() to let the evaled sources' top-level `function`
// declarations (validateQDEF, CBOR_UTIL's IIFE, etc.) leak into this
// function's own scope so they can be returned. Strict mode eval
// sandboxes those declarations instead, which breaks this on purpose.
//
// Loads the browser-facing tools/validator.js and its dependencies into
// a plain Node context, stripping only the DOM-touching wiring
// (populateExamples/loadExample) that the page itself needs. This is
// the importable, headless path into validateQDEF() that an external
// adopter (TagDrop) asked for -- previously this trick only existed,
// unshared, inside scripts/test-validator.js.
//
// Builds QDEF_REGISTRY directly from registry.rec (via recfile.js), so
// this works standalone without requiring `node scripts/build.js` to
// have run first.

const fs = require('fs');
const path = require('path');
const recfile = require('./recfile');
const standardTypes = require('./standard-types');

function buildRegistry(rootDir) {
  const records = recfile.parse(path.join(rootDir, 'registry.rec'));
  const namespaces = recfile.getFlat(records, 'Namespace');
  const recordTypes = recfile.getFlat(records, 'RecordType');
  const byId = {};
  for (const ns of namespaces) {
    const rawId = recfile.get(ns, 'NamespaceId');
    const hex = rawId.replace(/^h'|'$/g, '').toLowerCase();
    byId[hex] = {
      name: recfile.get(ns, 'NamespaceName'),
      variable: recfile.get(ns, 'VariableName') || null,
      types: {},
    };
    const types = recordTypes.filter((rt) => recfile.get(rt, 'NamespaceId') === rawId);
    for (const t of types) {
      const tid = recfile.get(t, 'ScopedTypeId');
      byId[hex].types[tid] = {
        name: recfile.get(t, 'RecordTypeName') || null,
        variable: recfile.get(t, 'VariableName') || null,
        shape: recfile.get(t, 'DataItem') || null,
      };
    }
  }
  return byId;
}

/**
 * Load validateQDEF() (and its CBOR_UTIL dependencies) into a headless
 * Node context. Returns { validateQDEF, fmtCBOR, CBOR_UTIL }. fmtCBOR
 * renders an HTML tree (used by the browser page); most non-DOM callers
 * want CBOR_UTIL.renderTreeText instead, which is what the CLI uses.
 */
function loadValidator(rootDir) {
  const ROOT = rootDir || path.join(__dirname, '..');

  globalThis.QDEF_REGISTRY = buildRegistry(ROOT);
  const std = standardTypes.build(ROOT);
  globalThis.QDEF_STANDARD_TYPE_NAMES = std.names;
  globalThis.QDEF_STANDARD_SHAPES = std.shapes;
  eval(fs.readFileSync(path.join(ROOT, 'assets', 'cbor-util.js'), 'utf-8'));

  const valSrc = fs
    .readFileSync(path.join(ROOT, 'tools', 'validator.js'), 'utf-8')
    .replace(/function populateExamples[\s\S]*?^}/m, 'function populateExamples() {}')
    .replace(/function loadExample[\s\S]*?^}/m, 'function loadExample() {}')
    .replace(/populateExamples\(\);/g, '');
  eval(valSrc);

  // eslint-disable-next-line no-undef -- defined by the evaled sources above
  return { validateQDEF, fmtCBOR, CBOR_UTIL };
}

module.exports = { loadValidator, buildRegistry };
