const fs = require('fs');

function parse(filePath) {
  const text = fs.readFileSync(filePath, 'utf-8');
  const records = [];
  let current = null;
  let fields = {};

  const lines = text.split('\n');
  for (const raw of lines) {
    const line = raw.trimEnd();

    if (line === '' || line.startsWith('#') || line.startsWith('%rec:') || line.startsWith('%mandatory:') || line.startsWith('%sort:')) {
      if (line.startsWith('%rec:')) {
        if (current) {
          records.push({ type: current, fields });
          fields = {};
        }
        current = line.slice(5).trim();
      }
      continue;
    }

    const colon = line.indexOf(':');
    if (colon === -1) continue;

    const key = line.slice(0, colon).trim();
    const value = line.slice(colon + 1).trim();

    if (!fields[key]) fields[key] = [];
    fields[key].push(value);
  }

  if (current) {
    records.push({ type: current, fields });
  }

  return records;
}

function get(record, key) {
  const v = record.fields[key];
  if (!v) return null;
  return v.length === 1 ? v[0] : v;
}

function getFlat(records, type) {
  return records.filter(r => r.type === type);
}

module.exports = { parse, get, getFlat };
