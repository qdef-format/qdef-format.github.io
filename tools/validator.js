// CBOR decoder, field metadata, and field-name resolution loaded from the
// shared module (loaded as <script src="../assets/cbor-util.js"> before this file).
const {
  hexToBytes, bytesToHex, CBORReader,
  COMMON_FIELDS, STANDARD_TYPE_NAMES, STANDARD_SHAPES,
  parseShape, getFieldDef
} = CBOR_UTIL;

const QDEF_MAGIC = new Uint8Array([0x51, 0x44, 0x45, 0x46]);

function majorName(m) {
  return ['uint','nint','bytes','tstr','array','map','tag','simple'][m] || 'unknown';
}

function fmtCBOR(item) {
  if (!item) return '<li>(null)</li>';
  if (item.type === 'error') return `<li class="tree-error">⚠ ${escapeHtml(item.text)}</li>`;

  function ann(item) {
    return item && item._ann ? ` <span class="tree-parity">// ${escapeHtml(item._ann)}</span>` : '';
  }

  switch (item.type) {
    case 'uint':
    case 'nint':
      return `<li><span class="type-num">${item.value}</span>${ann(item)}</li>`;
    case 'bytes': {
      const hex = Array.from(item.value).slice(0, 16).map(b => b.toString(16).padStart(2, '0')).join('');
      const ellipsis = item.value.length > 16 ? '...' : '';
      return `<li><span class="type-bytes">h'${hex}${ellipsis}'</span> <span class="tree-meta">(${item.value.length} B)</span>${ann(item)}</li>`;
    }
    case 'tstr': {
      const s = item.value.length > 64 ? item.value.slice(0, 64) + '...' : item.value;
      return `<li><span class="type-str">"${escapeHtml(s)}"</span>${ann(item)}</li>`;
    }
    case 'array': {
      let html = `<li><span class="tree-bracket">[</span> <span class="tree-meta">${item.value.length} items</span>${ann(item)}<ul>`;
      for (const v of item.value) {
        html += fmtCBOR(v);
      }
      html += `</ul><span class="tree-bracket">]</span></li>`;
      return html;
    }
    case 'map': {
      let html = `<li><span class="tree-bracket">{</span> <span class="tree-meta">${item.value.length} keys</span><ul>`;
      for (const p of item.value) {
        const keyAnn = p.key._ann;
        if (keyAnn) p.key._ann = '';
        html += `<li><span class="key">${fmtInline(p.key)}</span>: ${fmtInline(p.value)}`;
        if (keyAnn) {
          html += ` <span class="tree-parity">// ${escapeHtml(keyAnn)}</span>`;
        } else if ((p.key.type === 'uint' || p.key.type === 'nint') && typeof p.key.value === 'number') {
          const parity = p.key.value % 2 === 0 ? 'even/critical' : 'odd/optional';
          html += ` <span class="tree-parity">// ${parity}</span>`;
        }
        html += '</li>';
      }
      html += `</ul><span class="tree-bracket">}</span></li>`;
      return html;
    }
    case 'tag':
      return `<li><span class="tree-bracket">tag(${item.tag})</span><ul>${fmtCBOR(item.value)}</ul></li>`;
    case 'simple':
      return `<li>${item.value === 20 ? '<span class="type-bool">false</span>' : item.value === 21 ? '<span class="type-bool">true</span>' : item.value === 22 ? '<span class="type-bool">null</span>' : item.value === 23 ? '<span class="type-bool">undefined</span>' : `simple(${item.value})`}</li>`;
    default:
      return `<li>(${item.type})</li>`;
  }
}

function fmtInline(item) {
  if (!item) return '(null)';
  if (item.type === 'error') return `<span class="tree-error">⚠ ${escapeHtml(item.text)}</span>`;
  const ann = item._ann ? ` <span class="tree-meta">${escapeHtml(item._ann)}</span>` : '';
  switch (item.type) {
    case 'uint': case 'nint': return `<span class="type-num">${item.value}</span>${ann}`;
    case 'bytes':
      const hex = Array.from(item.value).slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join('');
      const ellipsis = item.value.length > 8 ? '...' : '';
      return `<span class="type-bytes">h'${hex}${ellipsis}'</span>${ann}`;
    case 'tstr':
      return `<span class="type-str">"${escapeHtml(item.value.slice(0, 40))}"</span>${ann}`;
    case 'simple': return (item.value === 21 ? '<span class="type-bool">true</span>' : item.value === 20 ? '<span class="type-bool">false</span>' : `simple(${item.value})`) + ann;
    case 'tag': return `tag(${item.tag})${ann}`;
    case 'array': return `[${item.value.length} items]${ann}`;
    case 'map': return `{${item.value.length} keys}${ann}`;
    default: return `(${item.type})${ann}`;
  }
}

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// COMMON_FIELDS, STANDARD_TYPE_NAMES, STANDARD_SHAPES, parseShape,
// and getFieldDef are all defined in assets/cbor-util.js (CBOR_UTIL).

// QDEF validation
function validateQDEF(bytes) {
  const issues = [];

  // Check magic — warn, don't bail
  let magicOk = false;
  if (bytes.length < 4) {
    issues.push({ level: 'error', text: `Payload too short: ${bytes.length} byte(s), need at least 4` });
  } else {
    const magic = bytes.slice(0, 4);
    magicOk = magic[0] === QDEF_MAGIC[0] && magic[1] === QDEF_MAGIC[1] && magic[2] === QDEF_MAGIC[2] && magic[3] === QDEF_MAGIC[3];
    if (magicOk) {
      issues.push({ level: 'ok', text: `Magic header: 51 44 45 46 ("QDEF")` });
    } else {
      issues.push({ level: 'warn', text: `Expected QDEF magic (51 44 45 46), got ${bytesToHex(magic)} — parsing raw CBOR` });
    }
  }

  // Try to parse root CBOR even without valid magic
  let root = null;
  const cborStart = bytes.length >= 4 ? 4 : 0;
  const reader = new CBORReader(bytes.slice(cborStart));
  root = reader.readItem();

  if (root && root.type === 'error') {
    issues.push({ level: 'error', text: `Parse error: ${root.text}` });
  } else if (root && root.type !== 'array') {
    issues.push({ level: 'warn', text: `Root is a CBOR ${majorName(root.type)} — expected an array for QDEF Records` });
    root = null;
  } else if (root && root.type === 'array') {
    issues.push({ level: 'ok', text: `Root is a CBOR array with ${root.value.length} item(s)` });
    // Analyze Record structure
    analyzeRecord(root, issues, 'Root', 0);
  } else if (!root) {
    issues.push({ level: 'warn', text: `No CBOR data found after magic header` });
  }

  // Check remaining bytes
  if (reader && reader.offset < bytes.length - cborStart) {
    issues.push({ level: 'warn', text: `${bytes.length - cborStart - reader.offset} byte(s) unparsed after root Record` });
  }

  return { valid: issues.filter(i => i.level === 'error').length === 0, root, issues };
}

function annotateItem(item, text) {
  if (item) item._ann = text;
}

function analyzeRecord(arr, issues, label, depth, inheritedNamespace) {
  if (depth > 10) {
    issues.push({ level: 'error', text: `${label}: nesting depth exceeds 10` });
    return null;
  }

  const items = (arr.value || []).filter(i => i != null);
  let idx = 0;

  // Determine typeId and namespace
  let namespace = null;
  let typeId = 0;
  let typeIdExplicit = false;
  let tidItem = null;

  const nsMatch = idx < items.length && items[idx].type === 'bytes' && items[idx].value.length <= 8;
  if (nsMatch) {
    namespace = items[idx];
    idx++;
  }

  if (idx < items.length && (items[idx].type === 'uint' || items[idx].type === 'nint')) {
    tidItem = items[idx];
    typeId = tidItem.type === 'uint' ? tidItem.value : tidItem.value;
    typeIdExplicit = true;
    idx++;
  }

  // Check map
  const hasMap = idx < items.length && items[idx].type === 'map';
  if (hasMap) idx++;

  // Check payload
  let hasPayload = false;
  let payloadItem = null;
  if (idx < items.length && items[idx].type !== 'array') {
    hasPayload = true;
    payloadItem = items[idx];
    idx++;
  }

  // Remaining items are subrecords
  const subrecords = items.slice(idx).filter(i => i.type === 'array');

  // Per §3.5, a namespace cascades to subrecords: the effective namespace
  // used for validation is this Record's own namespace if present, else
  // the one inherited from its parent.
  const effectiveNamespace = namespace || inheritedNamespace;

  // Build description
  let recLabel = `${label} Record`;
  let recordAnn = '';
  if (typeId === 0 && !typeIdExplicit) {
    recLabel += ` (Bundle, implicit typeId=0)`;
    recordAnn = `Bundle (implicit typeId=0)`;
  } else if (typeId === 0 && typeIdExplicit) {
    recLabel += ` (typeId=0, Bundle)`;
    recordAnn = `Bundle (typeId=0)`;
  } else {
    recLabel += ` (typeId=${typeId})`;
    recordAnn = `Record (typeId=${typeId})`;
  }

  let nsHexFlat = null;
  let regNsHex = null;
  if (namespace) {
    const nsHex = bytesToHex(namespace.value);
    nsHexFlat = nsHex.replace(/ /g, '');
    regNsHex = nsHexFlat;
    recLabel += ` [namespace: ${nsHex}]`;
    issues.push({ level: 'ok', text: `${recLabel}: namespace present` });

    let nsAnn = `namespace: ${nsHexFlat}`;
    let nsName = null;
    if (typeof QDEF_REGISTRY !== 'undefined' && QDEF_REGISTRY[nsHexFlat]) {
      const entry = QDEF_REGISTRY[nsHexFlat];
      nsName = entry.variable || entry.name;
      nsAnn += ` (${nsName})`;
      issues.push({ level: 'ok', text: `${'  '.repeat(depth+1)}→ ${nsName} (${entry.name})` });
    }
    annotateItem(namespace, nsAnn);

    if (recordAnn) recordAnn = `${nsName || nsHexFlat} ${recordAnn}`;
    else recordAnn = `${nsName || nsHexFlat}`;
  } else {
    issues.push({ level: 'ok', text: `${recLabel}` });
    if (effectiveNamespace) {
      regNsHex = bytesToHex(effectiveNamespace.value).replace(/ /g, '');
    }
  }

  if (typeIdExplicit) {
    const parity = typeId % 2 === 0 ? 'even (global)' : 'odd (scoped)';
    let typeAnn = `typeId=${typeId}`;
    let typeName = null;
    if (regNsHex && typeof QDEF_REGISTRY !== 'undefined') {
      const entry = QDEF_REGISTRY[regNsHex];
      if (entry && entry.types[String(typeId)]) {
        const rt = entry.types[String(typeId)];
        typeName = rt.variable || rt.name;
      }
    }
    if (!typeName && STANDARD_TYPE_NAMES[String(typeId)]) {
      typeName = STANDARD_TYPE_NAMES[String(typeId)];
    }
    typeAnn += ` (${parity})`;
    if (typeName) typeAnn += ` - ${typeName}`;
    issues.push({ level: 'ok', text: `${'  '.repeat(depth+1)}Type ID: ${typeId} (${parity})${typeName ? ' → ' + typeName : ''}` });
    annotateItem(tidItem, typeAnn);
    if (typeName && recordAnn) recordAnn += ` — ${typeName}`;
  }
  if (recordAnn) annotateItem(arr, recordAnn);

  if (hasMap) {
    issues.push({ level: 'ok', text: `${'  '.repeat(depth+1)}Has field map` });
    const mapItem = items[namespace ? (typeIdExplicit ? 2 : 1) : (typeIdExplicit ? 1 : 0)];
    if (mapItem) {
      for (const pair of mapItem.value) {
        if (pair.key && (pair.key.type === 'uint' || pair.key.type === 'nint')) {
          const k = String(pair.key.value);
          const fd = getFieldDef(typeId, k, regNsHex);
          const keyParity = typeof pair.key.value === 'number'
            ? (pair.key.value % 2 === 0 ? 'even/critical' : 'odd/optional') : '';
          if (fd) {
            pair.key._ann = keyParity ? `${fd.name} (${keyParity})` : fd.name;
            if (pair.value && pair.value.type !== 'map' && pair.value.type !== 'array') {
              pair.value._ann = fd.type;
            }
          }
        }
      }
    }
  }
  if (hasPayload) {
    if (payloadItem) {
      issues.push({ level: 'ok', text: `${'  '.repeat(depth+1)}Has payload: ${fmtInlineShort(payloadItem)}` });
    }
  }
  if (subrecords.length > 0) {
    issues.push({ level: 'ok', text: `${'  '.repeat(depth+1)}${subrecords.length} subrecord(s)` });
    for (let si = 0; si < subrecords.length; si++) {
      analyzeRecord(subrecords[si], issues, `${label}.${si}`, depth + 1, effectiveNamespace);
    }
  }

  // Validation rules
  if (typeId === 0 && hasPayload) {
    issues.push({ level: 'error', text: `${label}: Bundle (typeId=0) MUST NOT carry a payload` });
  }
  if (typeIdExplicit && typeof typeId === 'number' && typeId % 2 !== 0 && !effectiveNamespace) {
    issues.push({ level: 'error', text: `${label}: odd typeId requires a namespace` });
  }

  return { namespace, typeId, typeIdExplicit, hasMap, hasPayload, subrecords };
}

function fmtInlineShort(item) {
  if (item.type === 'bytes') return `h'${Array.from(item.value.slice(0, 8)).map(b => b.toString(16).padStart(2, '0')).join('')}...' (${item.value.length}B)`;
  if (item.type === 'tstr') return `"${escapeHtml(item.value.slice(0, 40))}"`;
  if (item.type === 'uint' || item.type === 'nint') return String(item.value);
  return `[${item.type}]`;
}

// Main validation entry point
function validateQDEPayload(hexInput) {
  const output = document.getElementById('validator-output');
  const resultDiv = document.getElementById('validation-result');
  const treeDiv = document.getElementById('cbor-tree');

  output.classList.remove('visible');

  if (!hexInput.trim()) {
    resultDiv.className = 'validation-result warning';
    resultDiv.innerHTML = 'Please enter a hex-encoded QDEF payload.';
    output.classList.add('visible');
    treeDiv.innerHTML = '';
    return;
  }

  const bytes = hexToBytes(hexInput);
  if (!bytes) {
    resultDiv.className = 'validation-result invalid';
    resultDiv.innerHTML = 'Invalid hex input. Please enter valid hexadecimal (with or without spaces).';
    output.classList.add('visible');
    treeDiv.innerHTML = '';
    return;
  }

  const result = validateQDEF(bytes);

  if (result.valid) {
    resultDiv.className = 'validation-result valid';
    resultDiv.innerHTML = `<strong>Payload is a valid QDEF container.</strong> (${bytes.length} bytes)`;
  } else {
    resultDiv.className = 'validation-result invalid';
    resultDiv.innerHTML = `<strong>Payload is NOT a valid QDEF container.</strong>`;
  }

  // Issues list
  let issuesHtml = '<ul style="margin-top:0.5rem;list-style:none;padding-left:0">';
  for (const issue of result.issues) {
    if (typeof issue === 'string') {
      issuesHtml += `<li style="font-size:0.85rem;color:var(--text-muted)">${issue}</li>`;
    } else if (issue.level === 'ok') {
      issuesHtml += `<li class="issue-ok" style="font-size:0.85rem">${issue.text}</li>`;
    } else if (issue.level === 'warn') {
      issuesHtml += `<li class="issue-warn" style="font-size:0.85rem">${issue.text}</li>`;
    } else {
      issuesHtml += `<li class="issue-err" style="font-size:0.85rem">${issue.text}</li>`;
    }
  }
  issuesHtml += '</ul>';
  resultDiv.innerHTML += issuesHtml;

  // CBOR tree
  if (result.root) {
    treeDiv.innerHTML = `<h3 style="margin-bottom:0.5rem">CBOR Structure</h3><div class="tree"><ul>${fmtCBOR(result.root)}</ul></div>`;
  }

  // QR Code generation
  const qrSection = document.getElementById('qr-section');
  const qrWrapper = document.getElementById('qr-canvas-wrapper');
  const qrInfo = document.getElementById('qr-info');
  qrWrapper.innerHTML = '';
  if (typeof qrcode !== 'undefined') {
    try {
      let qrStr = '';
      for (let i = 0; i < bytes.length; i++) {
        qrStr += String.fromCharCode(bytes[i]);
      }
      const qr = qrcode(0, 'L');
      qr.addData(qrStr, 'Byte');
      qr.make();
      qrWrapper.innerHTML = qr.createImgTag(4, 4);
      const mc = qr.getModuleCount();
      const ver = (mc - 17) / 4;
      let info = `${bytes.length} B · v${ver} (${mc}×${mc}) · ECC L`;
      if (bytes.length <= 400) info += ' · super reliable';
      else if (bytes.length <= 600) info += ' · average reliability';
      else if (bytes.length <= 800) info += ' · dense';
      else if (bytes.length <= 1000) info += ' · super dense';
      else info += ' · may be difficult to scan';
      if (!result.valid) info += ' · ⚠ invalid payload';
      qrInfo.textContent = info;
      qrSection.style.display = '';
    } catch (e) {
      qrWrapper.innerHTML = `<span class="qr-error">QR capacity exceeded (${bytes.length} bytes). Try fewer examples.</span>`;
      qrInfo.textContent = '';
      qrSection.style.display = '';
    }
  } else {
    qrSection.style.display = 'none';
  }

  output.classList.add('visible');
}

// Example payloads (loaded from assets/validator-examples.js)
const EXAMPLES = typeof VALIDATOR_EXAMPLES !== 'undefined' ? VALIDATOR_EXAMPLES : [];

function populateExamples() {
  const sel = document.getElementById('example-select');
  for (const ex of EXAMPLES) {
    const opt = document.createElement('option');
    opt.value = ex.label;
    opt.textContent = ex.label;
    sel.appendChild(opt);
  }
}

function loadExample() {
  const sel = document.getElementById('example-select');
  const label = sel.value;
  if (!label) return;
  const ex = EXAMPLES.find(e => e.label === label);
  if (!ex) return;
  document.getElementById('hex-input').value = ex.hex;
  validateQDEPayload(ex.hex);
}

populateExamples();

// ── QR scanning ──────────────────────────────────────────────────────────
if (typeof ZXingWASM !== 'undefined') {
  ZXingWASM.prepareZXingModule({ fireImmediately: true });
}

let scanStream = null;
let scanRafId = null;
let scanning = false;

function hexFromBytes(bytes) {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join(' ');
}

function handleScannedBytes(bytes) {
  const hex = hexFromBytes(bytes);
  document.getElementById('hex-input').value = hex;
  document.getElementById('validator-output').classList.remove('visible');
}

async function scanQr(imgData) {
  const results = await ZXingWASM.readBarcodes(imgData, { formats: ['QRCode'], tryHarder: true });
  return results[0] || null;
}

async function tickScan(video, canvas) {
  if (!scanning) return;
  if (video.readyState === video.HAVE_ENOUGH_DATA) {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(video, 0, 0);
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const result = await scanQr(img);
    if (!scanning) return;
    if (result) {
      stopScan();
      handleScannedBytes(result.bytes);
      return;
    }
  }
  scanRafId = requestAnimationFrame(() => tickScan(video, canvas));
}

async function startScan() {
  if (scanning) return;
  const overlay = document.getElementById('scanOverlay');
  const video = document.getElementById('scanVideo');
  overlay.classList.remove('hidden');
  try {
    scanStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' } }
    });
    video.srcObject = scanStream;
    scanning = true;
    tickScan(video, document.getElementById('scanCanvas'));
  } catch (e) {
    overlay.classList.add('hidden');
  }
}

function stopScan() {
  scanning = false;
  if (scanRafId) { cancelAnimationFrame(scanRafId); scanRafId = null; }
  if (scanStream) { scanStream.getTracks().forEach(t => t.stop()); scanStream = null; }
  document.getElementById('scanVideo').srcObject = null;
  document.getElementById('scanOverlay').classList.add('hidden');
}

function decodeQrFromImage(img) {
  const c = document.createElement('canvas');
  c.width = img.naturalWidth || img.width;
  c.height = img.naturalHeight || img.height;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  return scanQr(ctx.getImageData(0, 0, c.width, c.height));
}

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('btnScan').addEventListener('click', startScan);
    document.getElementById('btnStopScan').addEventListener('click', stopScan);

    const dropZone = document.getElementById('qrDropZone');
    const fileInput = document.getElementById('qrFileInput');

    dropZone.addEventListener('dragover', e => {
      e.preventDefault();
      dropZone.classList.add('dragover');
    });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
    dropZone.addEventListener('drop', async e => {
      e.preventDefault();
      dropZone.classList.remove('dragover');
      const file = e.dataTransfer.files[0];
      if (!file || !file.type.startsWith('image/')) return;
      const img = await loadImage(file);
      const result = await decodeQrFromImage(img);
      if (result) handleScannedBytes(result.bytes);
    });

    fileInput.addEventListener('change', async () => {
      const file = fileInput.files[0];
      if (!file) return;
      const img = await loadImage(file);
      const result = await decodeQrFromImage(img);
      if (result) handleScannedBytes(result.bytes);
    });

    document.addEventListener('paste', async e => {
      const items = e.clipboardData.items;
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (!file) continue;
          const img = await loadImage(file);
          const result = await decodeQrFromImage(img);
          if (result) { handleScannedBytes(result.bytes); break; }
        }
      }
    });
  });
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Failed to load image')); };
    img.src = url;
  });
}
