const fs = require('fs');
const path = require('path');
const { marked } = require('marked');
const recfile = require('./recfile');
const standardTypes = require('./standard-types');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, '_site');

function slugify(text) {
  return text.toLowerCase().replace(/[^\w]+/g, '-').replace(/^-+|-+$/g, '');
}

function addIds(html) {
  return html.replace(/<h([1-6])>(.*?)<\/h\1>/g, (_, level, text) => {
    const id = slugify(text.replace(/<[^>]+>/g, ''));
    return `<h${level} id="${id}">${text}</h${level}>`;
  });
}

function generateToc(html) {
  const headings = [];
  const re = /<h([23])\s+id="([^"]+)"[^>]*>(.*?)<\/h\1>/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    headings.push({ level: parseInt(m[1]), id: m[2], text: m[3].replace(/<[^>]+>/g, '') });
  }
  if (headings.length < 3) return '';

  let toc = '<nav class="toc"><h2>Table of Contents</h2>\n<ul>\n';
  for (let i = 0; i < headings.length; i++) {
    const h = headings[i];
    const next = headings[i + 1];
    if (h.level === 2) {
      toc += `  <li><a href="#${h.id}">${h.text}</a>\n`;
      if (next && next.level === 3) {
        toc += '    <ul>\n';
      } else {
        toc += '  </li>\n';
      }
    } else {
      toc += `      <li><a href="#${h.id}">${h.text}</a></li>\n`;
      if (!next || next.level === 2) {
        toc += '    </ul>\n  </li>\n';
      }
    }
  }
  toc += '</ul>\n</nav>\n';
  return toc;
}

const pageMap = {
  'QDEF-SPEC.md': 'spec.html',

  'EXAMPLES.md': 'examples.html',
  'IMPLEMENTATIONS.md': 'implementations.html',
  'RELATED-WORK.md': 'related-work.html',
  'IMPLEMENTATION-NOTES.md': 'https://github.com/qdef-format/qdef/blob/main/docs/IMPLEMENTATION-NOTES.md'
};

function fixDocLinks(html) {
  html = html.replace(/href="([^"]+\.md(?:#[^"]*)?)"/g, (match, href) => {
    const [filePart, fragment] = href.split('#');
    const filename = filePart.split('/').pop();
    if (pageMap[filename]) {
      const frag = fragment ? `#${fragment}` : '';
      const target = pageMap[filename];
      if (target.startsWith('http')) return `href="${target}${frag}"`;
      return `href="${target}${frag}"`;
    }
    const frag = fragment ? `#${fragment}` : '';
    return `href="https://github.com/qdef-format/qdef/blob/main/docs/${filePart}${frag}"`;
  });
  html = html.replace(/href="\.\.\/(prototype\/?)"/g, 'href="https://github.com/qdef-format/qdef/tree/main/prototype"');
  html = html.replace(/href="\.\.\/rust\/qdef-core\/?"/g, 'href="https://github.com/qdef-format/qdef/tree/main/rust/qdef-core"');
  return html;
}

if (fs.existsSync(OUT)) {
  fs.rmSync(OUT, { recursive: true });
}

const docsDir = path.join(ROOT, 'docs');
const map = {
  'QDEF-SPEC.md': { out: 'spec.html', title: 'Specification', desc: 'QDEF wire format specification.', banner: true },
  'EXAMPLES.md': { out: 'examples.html', title: 'Examples', desc: 'QDEF Record Type examples.', banner: false },
  'IMPLEMENTATIONS.md': { out: 'implementations.html', title: 'Implementations', desc: 'Projects and applications using QDEF.', banner: false },
  'RELATED-WORK.md': { out: 'related-work.html', title: 'Related Work', desc: 'Survey of related formats and standards in the typed-record container space.', banner: false }
};

const shell = fs.readFileSync(path.join(ROOT, 'templates', 'shell.html'), 'utf-8');

Object.entries(map).forEach(([file, cfg]) => {
  const md = fs.readFileSync(path.join(docsDir, file), 'utf-8');
  let body = marked.parse(md);
  body = addIds(body);
  body = fixDocLinks(body);

  const toc = generateToc(body);
  if (toc) {
    body = body.replace('</h1>', `</h1>\n${toc}`);
  }

  // Add back-to-top links after each h2
  body = body.replace(/<\/h2>/g, '</h2><a href="#" class="back-to-top" title="Back to top">&#x25B2;</a>');

  // Convert Mermaid code blocks to collapsible mermaid divs
  body = body.replace(/<pre><code class="language-mermaid">([\s\S]*?)<\/code><\/pre>/g,
    '<details class="mermaid-wrap"><summary>Record flowchart</summary>\n<pre class="mermaid">$1</pre>\n</details>');

  let ogUrl = cfg.out;
  if (ogUrl === 'spec.html') ogUrl = ''; // root spec page
  let page = shell
    .replace('__TITLE__', cfg.title)
    .replace('__DESCRIPTION__', cfg.desc)
    .replace('__OGURL__', ogUrl)
    .replace('__CONTENT__', body);

  if (cfg.banner) {
    const banner = '<div class="spec-status"><strong>Status: Draft — work in progress.</strong> The wire format is settled and validated by two prototypes, but there is no reference library and no production use yet. <a href="https://github.com/qdef-format/qdef-format.github.io/issues" style="color:inherit">Suggest changes &rarr;</a></div>';
    page = page.replace('<main class="container content">', `<main class="container content">\n${banner}`);
  }

  const outPath = path.join(OUT, cfg.out);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, page);
  console.log(`Wrote ${outPath}`);
});

// Copy static files
['assets', 'tools'].forEach(dir => {
  const src = path.join(ROOT, dir);
  const dst = path.join(OUT, dir);
  if (fs.existsSync(src)) {
    fs.cpSync(src, dst, { recursive: true, filter: f => !f.endsWith('.svg') });
  }
});

fs.mkdirSync(path.join(OUT, 'assets'), { recursive: true });
// logo.svg is the single source; derive a white version for the header
let logoSvg = fs.readFileSync(path.join(ROOT, 'assets', 'logo.svg'), 'utf-8');
fs.writeFileSync(path.join(OUT, 'assets', 'logo.svg'), logoSvg);
fs.writeFileSync(
  path.join(OUT, 'assets', 'logo-white.svg'),
  logoSvg.replace('<svg ', '<svg data-theme="white" ')
);
fs.copyFileSync(path.join(ROOT, 'assets', 'logo.png'), path.join(OUT, 'assets', 'logo.png'));
fs.copyFileSync(path.join(ROOT, 'index.html'), path.join(OUT, 'index.html'));

const docsOut = path.join(OUT, 'docs');
fs.mkdirSync(docsOut, { recursive: true });
fs.readdirSync(docsDir).forEach(f => {
  if (f.endsWith('.md')) fs.copyFileSync(path.join(docsDir, f), path.join(docsOut, f));
});

// Build registry page and registry data JS from recfile
const records = recfile.parse(path.join(ROOT, 'registry.rec'));
const namespaces = recfile.getFlat(records, 'Namespace');
const recordTypes = recfile.getFlat(records, 'RecordType');

function byNamespace(rt) {
  return recfile.get(rt, 'NamespaceId');
}

let registryBody = '';

// Standard Record Types section, from standard-types.rec -- the spec's own
// Standards Action-governed types (§4), distinct from the community/FCFS
// namespace registry below.
const stdRecords = recfile.parse(path.join(ROOT, 'standard-types.rec'));
const stdTypes = recfile.getFlat(stdRecords, 'StandardType');

registryBody += '<section style="margin-bottom:2rem">';
registryBody += '<h2 id="standard-record-types">Standard Record Types (§4)</h2>';
registryBody += '<p>These are the QDEF spec\'s own Record Types, TypeId range 1&ndash;22, '
  + '<strong>Standards Action</strong> governed &mdash; changes go through the spec itself '
  + '(<a href="spec.html">QDEF-SPEC.md §4</a>), not a standalone registration PR. Tracked machine-readably in '
  + '<a href="https://github.com/qdef-format/qdef/blob/main/standard-types.rec"><code>standard-types.rec</code></a>. '
  + 'Bundle (§4.6) carries no TypeId and no fixed field shape, so it has no entry below.</p>';
registryBody += '<table><thead><tr>'
  + '<th>TypeId</th><th>Name</th><th>Section</th><th>Data Item</th><th>Semantics</th>'
  + '</tr></thead><tbody>';
for (const t of stdTypes) {
  const tid = recfile.get(t, 'TypeId');
  if (!tid) continue; // recfile.js appends a spurious empty record at EOF
  const tname = recfile.get(t, 'RecordTypeName') || '';
  const section = recfile.get(t, 'Section') || '';
  const shape = recfile.get(t, 'DataItem') || '';
  const semantics = recfile.get(t, 'Semantics') || '';
  registryBody += '<tr>'
    + `<td><code>[${tid}]</code></td>`
    + `<td>${tname}</td>`
    + `<td>${section ? `§${section}` : ''}</td>`
    + `<td><code style="font-size:0.8rem">${shape}</code></td>`
    + `<td>${semantics}</td>`
    + '</tr>';
}
registryBody += '</tbody></table>';
registryBody += '</section>';

registryBody += '<section style="margin-bottom:2rem">';
registryBody += '<h2 id="namespace-registry">Namespace Registry</h2>';
registryBody += '<p>This is the canonical registry of QDEF namespaces and their Record Types. '
  + 'To submit a new registration, open a pull request that adds a Namespace entry '
  + 'to <a href="https://github.com/qdef-format/qdef/blob/main/registry.rec"><code>registry.rec</code></a> '
  + 'or use the <a href="tools/registry-generator.html">Registry Generator</a> to draft one.</p>';
registryBody += '</section>';

if (namespaces.length === 0) {
  registryBody += '<p><em>No namespaces registered yet.</em></p>';
} else {
  for (const ns of namespaces) {
    const nsId = recfile.get(ns, 'NamespaceId');
    const nsName = recfile.get(ns, 'NamespaceName');
    const variable = recfile.get(ns, 'VariableName');
    const contact = recfile.get(ns, 'Contact');
    const status = recfile.get(ns, 'Status');
    const regUrl = recfile.get(ns, 'RegistryUrl');
    const ref = recfile.get(ns, 'Reference');

    registryBody += '<section style="margin-bottom:2rem">';
    registryBody += `<h2 id="${slugify(nsName)}">${variable || nsName}</h2>`;
    registryBody += '<table>';
    registryBody += `<tr><td style="width:180px"><strong>Namespace ID</strong></td><td><code>${nsId}</code></td></tr>`;
    registryBody += `<tr><td><strong>Namespace Name</strong></td><td><code>${nsName}</code></td></tr>`;
    if (contact) registryBody += `<tr><td><strong>Contact</strong></td><td>${contact.includes('@') ? `<a href="${contact}">${contact}</a>` : contact}</td></tr>`;
    if (regUrl) registryBody += `<tr><td><strong>Registry URL</strong></td><td><a href="${regUrl}">${regUrl}</a></td></tr>`;
    if (ref) registryBody += `<tr><td><strong>Reference</strong></td><td><a href="${ref}">${ref}</a></td></tr>`;
    registryBody += `<tr><td><strong>Status</strong></td><td>${status}</td></tr>`;
    registryBody += '</table>';

    const types = recordTypes.filter(rt => recfile.get(rt, 'NamespaceId') === nsId);
    if (types.length > 0) {
      registryBody += '<h3>Record Types</h3>';
      registryBody += '<table><thead><tr>'
        + '<th>Scoped Type ID</th><th>Name</th><th>Data Item</th><th>Semantics</th><th>Reference</th>'
        + '</tr></thead><tbody>';
      for (const t of types) {
        const tid = recfile.get(t, 'ScopedTypeId');
        const tname = recfile.get(t, 'RecordTypeName') || '';
        const tvariable = recfile.get(t, 'VariableName') || '';
        const shape = recfile.get(t, 'DataItem') || '';
        const semantics = recfile.get(t, 'Semantics') || '';
        const tref = recfile.get(t, 'Reference') || '';
        registryBody += '<tr>'
          + `<td><code>${tid}</code></td>`
          + `<td>${tvariable ? `${tvariable}<br>` : ''}<code style="font-size:0.8rem">${tname}</code></td>`
          + `<td><code style="font-size:0.8rem">${shape}</code></td>`
          + `<td>${semantics}</td>`
          + `<td>${tref ? `<a href="${tref}">link</a>` : ''}</td>`
          + '</tr>';
      }
      registryBody += '</tbody></table>';
    }

    registryBody += '</section>';
  }
}

let registryPage = shell
  .replace('__TITLE__', 'Registry')
  .replace('__DESCRIPTION__', 'QDEF Registry — standard Record Types (§4) and registered community namespaces.')
  .replace('__OGURL__', 'registry.html')
  .replace('__CONTENT__', registryBody);

registryPage = registryPage.replace('<main class="container content">', '<main class="container">\n<h1>QDEF Registry</h1>');

fs.writeFileSync(path.join(OUT, 'registry.html'), registryPage);
console.log('Wrote ' + path.join(OUT, 'registry.html'));

// Generate registry-data.js for client-side lookup by the validator
const nsById = {};
for (const ns of namespaces) {
  const rawId = recfile.get(ns, 'NamespaceId');
  const hex = rawId.replace(/^h'|'$/g, '').toLowerCase();
  nsById[hex] = {
    name: recfile.get(ns, 'NamespaceName'),
    variable: recfile.get(ns, 'VariableName') || null,
    contact: recfile.get(ns, 'Contact') || null,
    status: recfile.get(ns, 'Status'),
    types: {}
  };
  const types = recordTypes.filter(rt => recfile.get(rt, 'NamespaceId') === rawId);
  for (const t of types) {
    const tid = recfile.get(t, 'ScopedTypeId');
    nsById[hex].types[tid] = {
      name: recfile.get(t, 'RecordTypeName') || null,
      variable: recfile.get(t, 'VariableName') || null,
      shape: recfile.get(t, 'DataItem') || null,
      semantics: recfile.get(t, 'Semantics') || null
    };
  }
}
const registryJs = 'const QDEF_REGISTRY = ' + JSON.stringify(nsById, null, 2) + ';\n';
fs.writeFileSync(path.join(OUT, 'assets', 'registry-data.js'), registryJs);
console.log('Wrote ' + path.join(OUT, 'assets', 'registry-data.js'));

// Generate standard-types-data.js from standard-types.rec (the spec's own
// Standards Action-governed Record Types, §4) -- same pattern as
// registry-data.js above, for the community/namespaced side.
const std = standardTypes.build(ROOT);
const stdJs = 'const QDEF_STANDARD_TYPE_NAMES = ' + JSON.stringify(std.names, null, 2) + ';\n'
  + 'const QDEF_STANDARD_SHAPES = ' + JSON.stringify(std.shapes, null, 2) + ';\n';
fs.writeFileSync(path.join(OUT, 'assets', 'standard-types-data.js'), stdJs);
console.log('Wrote ' + path.join(OUT, 'assets', 'standard-types-data.js'));

// Regenerate EXAMPLES.md using the same registry data.
// Pass the already-built nsById/std to avoid re-parsing registry.rec / standard-types.rec.
globalThis.QDEF_REGISTRY = nsById;
globalThis.QDEF_STANDARD_TYPE_NAMES = std.names;
globalThis.QDEF_STANDARD_SHAPES = std.shapes;
require('./gen-examples');

// LLM-friendly content index
const llms = `# QDEF — Quick Data Exchange Format

QDEF is a binary container format for multi-action 2D barcodes (QR, Data Matrix, Aztec) and NFC tags. It carries typed, self-describing records in a compact CBOR-based wire format.

## Key pages

- Spec (normative): https://qdef-format.github.io/qdef-format/spec.html
- Examples: https://qdef-format.github.io/qdef-format/examples.html
- Registry: https://qdef-format.github.io/qdef-format/registry.html
- Implementations: https://qdef-format.github.io/qdef-format/implementations.html
- Related work: https://qdef-format.github.io/qdef-format/related-work.html
- Full reference (single page): https://qdef-format.github.io/qdef-format/llms-full.txt
- Validator tool: https://qdef-format.github.io/qdef-format/tools/validator.html
- GitHub (prototype): https://github.com/mofosyne/qdef
- GitHub (website): https://github.com/qdef-format/qdef-format.github.io

## Quick summary

Record shape: [namespace?, ns_annotation?, typeId*, type_annotation?, map?, subrecord*]
- namespace: optional bstr, h'' = inherit parent, absent = global
- typeId: consecutive uints, [N] with N in 2-22 for standard types
- map key 0 = payload, key 1 = descriptor, keys > 0 with even/odd criticality
- Negative keys: -1 (ID), -3 (UUID) only
- Standard types: [2]=Split, [4]=Encrypt, [6]=Media Payload, [8]=Compress, [10]=Open/Hint URI, [12]=App Route, [14]=Media Preview, [16]=Signature
`;
fs.writeFileSync(path.join(OUT, 'llms.txt'), llms);
console.log('Wrote ' + path.join(OUT, 'llms.txt'));

// Copy llms-full.txt from source (single-page LLM reference)
const llmsFull = fs.readFileSync(path.join(ROOT, 'llms-full.txt'), 'utf-8');
fs.writeFileSync(path.join(OUT, 'llms-full.txt'), llmsFull);
console.log('Wrote ' + path.join(OUT, 'llms-full.txt'));

// Robots
const robots = `User-agent: *
Allow: /
Sitemap: https://qdef-format.github.io/qdef-format/sitemap.xml
`;
fs.writeFileSync(path.join(OUT, 'robots.txt'), robots);
console.log('Wrote ' + path.join(OUT, 'robots.txt'));

fs.writeFileSync(path.join(OUT, '.nojekyll'), '');
console.log('Done');
