const fs = require('fs');
const path = require('path');
const { marked } = require('marked');
const recfile = require('./recfile');

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

const pageMap = {
  'QDEF-SPEC.md': 'spec.html',
  'DESIGN.md': 'design.html',
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
  'DESIGN.md': { out: 'design.html', title: 'Design Rationale', desc: 'QDEF design rationale.', banner: false },
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

  let page = shell
    .replace('__TITLE__', cfg.title)
    .replace('__DESCRIPTION__', cfg.desc)
    .replace('__CONTENT__', body);

  if (cfg.banner) {
    const banner = '<div class="spec-status"><strong>Status: Draft — work in progress.</strong> The wire format is settled and validated by two prototypes, but there is no reference library and no production use yet.</div>';
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

// Build registry page from recfile
const records = recfile.parse(path.join(ROOT, 'registry.rec'));
const namespaces = recfile.getFlat(records, 'Namespace');
const recordTypes = recfile.getFlat(records, 'RecordType');

function byNamespace(rt) {
  return recfile.get(rt, 'NamespaceId');
}

let registryBody = '';
registryBody += '<p>This is the canonical registry of QDEF namespaces and their Record Types. '
  + 'To submit a new registration, open a pull request that adds a Namespace entry '
  + 'to <a href="https://github.com/qdef-format/qdef/blob/main/registry.rec"><code>registry.rec</code></a> '
  + 'or use the <a href="tools/registry-generator.html">Registry Generator</a> to draft one.</p>';

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
  .replace('__DESCRIPTION__', 'QDEF Namespace Registry — registered namespaces and Record Types.')
  .replace('__CONTENT__', registryBody);

registryPage = registryPage.replace('<main class="container content">', '<main class="container">\n<h1>QDEF Namespace Registry</h1>');

fs.writeFileSync(path.join(OUT, 'registry.html'), registryPage);
console.log('Wrote ' + path.join(OUT, 'registry.html'));

fs.writeFileSync(path.join(OUT, '.nojekyll'), '');
console.log('Done');
