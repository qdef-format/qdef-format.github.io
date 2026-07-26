async function sha256(str) {
  const enc = new TextEncoder().encode(str);
  const buf = await crypto.subtle.digest('SHA-256', enc);
  return new Uint8Array(buf);
}

function escapeHtml(s) {
  if (!s) return '';
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function val(id) { return (document.getElementById(id) || {}).value || ''; }

function deriveHint() {
  const name = val('ns-name').trim();
  if (!name) return;
  sha256(name).then(digest => {
    const hex = Array.from(digest.slice(0, 4)).map(b => b.toString(16).padStart(2, '0')).join('');
    document.getElementById('ns-id').value = hex;
  });
}

function addRecordType() {
  const container = document.getElementById('record-types-container');
  const count = container.children.length + 1;
  const div = document.createElement('div');
  div.className = 'record-type-entry';
  div.innerHTML = `
    <h3>Type ${count} <button type="button" class="btn btn-sm btn-secondary" style="float:right" onclick="this.closest('.record-type-entry').remove()">Remove</button></h3>
    <div class="field">
      <label>Scoped Type ID <span class="req">*</span></label>
      <input type="number" class="rt-typeid" min="1" step="2" placeholder="1">
      <span class="hint">Odd uint (1, 3, 5, ...).</span>
    </div>
    <div class="field">
      <label>Record Type Name</label>
      <input type="text" class="rt-name" placeholder="com.example.project/route">
    </div>
    <div class="field">
      <label>Variable Name</label>
      <input type="text" class="rt-variable" placeholder="Project Route">
    </div>
    <div class="field">
      <label>Data item (CBOR shape)</label>
      <input type="text" class="rt-shape" placeholder="map { 0: bytes, 2: uint }">
    </div>
    <div class="field">
      <label>Semantics</label>
      <input type="text" class="rt-semantics" placeholder="Routes payload to a physical delivery target">
    </div>
    <div class="field">
      <label>Reference</label>
      <input type="text" class="rt-ref" placeholder="https://github.com/example/project/SPEC.md#route">
    </div>
  `;
  container.appendChild(div);
}

function getRecordTypes() {
  const entries = document.querySelectorAll('.record-type-entry');
  const types = [];
  entries.forEach(e => {
    const typeId = (e.querySelector('.rt-typeid') || {}).value;
    if (!typeId) return;
    types.push({
      typeId: typeId,
      name: (e.querySelector('.rt-name') || {}).value || '',
      variable: (e.querySelector('.rt-variable') || {}).value || '',
      shape: (e.querySelector('.rt-shape') || {}).value || '',
      semantics: (e.querySelector('.rt-semantics') || {}).value || '',
      ref: (e.querySelector('.rt-ref') || {}).value || ''
    });
  });
  return types;
}

function validateForm() {
  const errors = [];
  if (!val('ns-name').trim()) errors.push('Namespace Name is required.');
  if (!val('ns-id').trim()) errors.push('Namespace ID is required.');
  if (!val('ns-contact').trim()) errors.push('Point of Contact is required.');
  const nsId = val('ns-id').replace(/\s/g, '');
  if (nsId.length > 0 && nsId.length % 2 !== 0) errors.push('Namespace ID must have an even number of hex characters.');
  if (nsId.length > 0 && !/^[0-9a-fA-F]+$/.test(nsId)) errors.push('Namespace ID must be valid hex.');
  return errors;
}

function generate() {
  const errors = validateForm();
  const output = document.getElementById('generator-output');
  const text = document.getElementById('generated-text');

  if (errors.length > 0) {
    text.textContent = errors.join('\n');
    output.classList.add('visible');
    return;
  }

  const types = getRecordTypes();
  const lines = [];

  // Namespace record
  lines.push('%rec: Namespace');
  lines.push('');
  lines.push("NamespaceId: h'" + val('ns-id').replace(/\s/g, '') + "'");
  lines.push('NamespaceName: ' + val('ns-name').trim());
  if (val('ns-variable').trim()) lines.push('VariableName: ' + val('ns-variable').trim());
  lines.push('Contact: ' + val('ns-contact').trim());
  if (val('ns-registry-url').trim()) lines.push('RegistryUrl: ' + val('ns-registry-url').trim());
  if (val('ns-ref').trim()) lines.push('Reference: ' + val('ns-ref').trim());
  lines.push('Status: ' + val('ns-status'));
  lines.push('');

  // Record Types
  types.forEach((t, i) => {
    lines.push('%rec: RecordType');
    lines.push('');
    lines.push("NamespaceId: h'" + val('ns-id').replace(/\s/g, '') + "'");
    lines.push('ScopedTypeId: ' + t.typeId);
    if (t.name) lines.push('RecordTypeName: ' + t.name);
    if (t.variable) lines.push('VariableName: ' + t.variable);
    if (t.shape) lines.push('DataItem: ' + t.shape);
    if (t.semantics) lines.push('Semantics: ' + t.semantics);
    if (t.ref) lines.push('Reference: ' + t.ref);
    if (i < types.length - 1) lines.push('');
  });

  text.textContent = lines.join('\n');
  output.classList.add('visible');
}

function clearForm() {
  document.getElementById('registry-form').reset();
  const container = document.getElementById('record-types-container');
  container.innerHTML = '';
  addRecordType();
  document.getElementById('generator-output').classList.remove('visible');
}

function copyOutput() {
  const text = document.getElementById('generated-text');
  navigator.clipboard.writeText(text.textContent).then(() => {
    const btn = document.querySelector('#generator-output .btn');
    const orig = btn.textContent;
    btn.textContent = 'Copied!';
    setTimeout(() => { btn.textContent = orig; }, 1500);
  });
}

function loadExample() {
  clearForm();
  document.getElementById('ns-name').value = 'com.example.tagdrop-paper';
  document.getElementById('ns-variable').value = 'Tag Drop';
  document.getElementById('ns-id').value = '663c1cf2';
  document.getElementById('ns-contact').value = 'tagdrop-maintainers@example.com';
  document.getElementById('ns-registry-url').value = 'https://github.com/example/tagdrop/blob/main/QDEF-TYPES.md';
  document.getElementById('ns-ref').value = 'https://github.com/mofosyne/tagdrop';

  const container = document.getElementById('record-types-container');
  container.innerHTML = '';
  const div = document.createElement('div');
  div.className = 'record-type-entry';
  div.innerHTML = `
    <h3>Type 1</h3>
    <div class="field">
      <label>Scoped Type ID <span class="req">*</span></label>
      <input type="number" class="rt-typeid" min="1" step="2" value="1">
    </div>
    <div class="field">
      <label>Record Type Name</label>
      <input type="text" class="rt-name" value="com.example.tagdrop/route">
    </div>
    <div class="field">
      <label>Variable Name</label>
      <input type="text" class="rt-variable" value="Tag Drop Route">
    </div>
    <div class="field">
      <label>Data item (CBOR shape)</label>
      <input type="text" class="rt-shape" value="map { 0: bytes (destination), 2: uint (priority) }">
    </div>
    <div class="field">
      <label>Semantics</label>
      <input type="text" class="rt-semantics" value="Routes payload to a physical delivery target">
    </div>
    <div class="field">
      <label>Reference</label>
      <input type="text" class="rt-ref" value="https://github.com/mofosyne/tagdrop/blob/main/SPEC.md#route">
    </div>
  `;
  container.appendChild(div);
}

// Init with one empty record type
addRecordType();
