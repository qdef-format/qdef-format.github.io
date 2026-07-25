const fs = require('fs');
const path = require('path');
const { marked } = require('marked');

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
  'EXAMPLES.md': { out: 'examples.html', title: 'Examples', desc: 'QDEF Record Type examples.', banner: false }
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
    const banner = '<div class="spec-status"><strong>Status: Draft.</strong> Validated by two throwaway prototypes (Node round-trip, <code>no_std</code> Rust/Cortex-M0). Not yet a reference library; not yet used in production.</div>';
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
fs.copyFileSync(path.join(ROOT, 'assets', 'logo.svg'), path.join(OUT, 'assets', 'logo.svg'));
fs.copyFileSync(path.join(ROOT, 'assets', 'logo.png'), path.join(OUT, 'assets', 'logo.png'));
fs.copyFileSync(path.join(ROOT, 'index.html'), path.join(OUT, 'index.html'));

const docsOut = path.join(OUT, 'docs');
fs.mkdirSync(docsOut, { recursive: true });
fs.readdirSync(docsDir).forEach(f => {
  if (f.endsWith('.md')) fs.copyFileSync(path.join(docsDir, f), path.join(docsOut, f));
});

fs.writeFileSync(path.join(OUT, '.nojekyll'), '');
console.log('Done');
