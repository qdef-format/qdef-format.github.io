const path = require('path');
const recfile = require('./recfile');

// DataItem type strings here can be multi-word ("uint or tstr"), unlike
// registry.rec's app-authored shapes -- so this can't reuse cbor-util.js's
// parseShape() regex, which assumes a single \w+ token per type.
function parseDataItem(str) {
  if (!str) return null;
  const fields = {};
  const inner = str.replace(/^map\s*\{/, '').replace(/\}\s*$/, '').trim();
  const re = /(-?\d+)\s*:\s*([^(),]+?)\s*\(([^)]+)\)/g;
  let m;
  while ((m = re.exec(inner)) !== null) {
    const parts = m[3].split(',').map((s) => s.trim());
    fields[m[1]] = { type: m[2].trim(), name: parts[0], optional: parts.includes('opt') };
  }
  return Object.keys(fields).length > 0 ? fields : null;
}

function build(rootDir) {
  const records = recfile.parse(path.join(rootDir, 'standard-types.rec'));
  const types = recfile.getFlat(records, 'StandardType');
  const names = {};
  const shapes = {};
  for (const t of types) {
    const tid = recfile.get(t, 'TypeId');
    if (!tid) continue; // structural types (e.g. Bundle) carry no TypeId
    const name = recfile.get(t, 'RecordTypeName');
    if (name) names[tid] = name;
    const shape = parseDataItem(recfile.get(t, 'DataItem'));
    if (shape) shapes[tid] = shape;
  }
  return { names, shapes };
}

module.exports = { build, parseDataItem };
