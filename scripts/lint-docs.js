#!/usr/bin/env node
'use strict';
// Doc-quality lint: catches the class of bugs found by hand this session --
// markdown tables whose separator row doesn't match the header's column
// count, fenced code blocks with unbalanced braces (e.g. a dangling '}'
// with no opening '{'), §N.N cross-references that don't resolve to a
// real heading, and regressions of specific broken URLs already fixed
// once. Exits non-zero (and prints every finding) so CI catches these
// before they reach the live site.

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

const MD_FILES = [
  'README.md',
  'llms-full.txt',
  'docs/QDEF-SPEC.md',
  'docs/EXAMPLES.md',
  'docs/IMPLEMENTATIONS.md',
  'docs/IMPLEMENTATION-NOTES.md',
  'docs/RELATED-WORK.md',
].map((f) => path.join(ROOT, f));

const URL_SCAN_GLOBS = ['.md', '.js', '.html', '.txt', '.json'];
const URL_SCAN_SKIP_DIRS = new Set(['node_modules', '_site', '.git']);

let issues = [];

function report(file, line, message) {
  issues.push({ file: path.relative(ROOT, file), line, message });
}

// ── Check 1: markdown table header/separator column-count mismatch ────

function checkTableColumns(file) {
  if (!fs.existsSync(file)) return;
  const lines = fs.readFileSync(file, 'utf-8').split('\n');
  for (let i = 0; i < lines.length - 1; i++) {
    const header = lines[i];
    const sep = lines[i + 1];
    if (!header.trim().startsWith('|')) continue;
    if (!/^\|[\s\-:|]+\|\s*$/.test(sep.trim())) continue;
    const headerCols = (header.match(/\|/g) || []).length;
    const sepCols = (sep.match(/\|/g) || []).length;
    if (headerCols !== sepCols) {
      report(file, i + 1, `table header has ${headerCols} pipes but separator row has ${sepCols} (line ${i + 2})`);
    }
  }
}

// ── Check 2: fenced code blocks with unbalanced { } ────────────────────

function checkBraceBalance(file) {
  if (!fs.existsSync(file)) return;
  const text = fs.readFileSync(file, 'utf-8');
  const lines = text.split('\n');
  let inBlock = false;
  let blockStart = -1;
  let depth = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim().startsWith('```')) {
      if (!inBlock) {
        inBlock = true;
        blockStart = i + 1;
        depth = 0;
      } else {
        inBlock = false;
        if (depth !== 0) {
          report(file, blockStart, `code block starting at line ${blockStart} has unbalanced braces (net ${depth > 0 ? '+' : ''}${depth})`);
        }
      }
      continue;
    }
    if (!inBlock) continue;
    for (const ch of line) {
      if (ch === '{') depth++;
      else if (ch === '}') depth--;
    }
  }
}

// ── Check 3: §N.N cross-references resolve to a real heading ──────────

function checkSectionRefs(file) {
  if (!fs.existsSync(file)) return;
  const text = fs.readFileSync(file, 'utf-8');
  const headings = [...text.matchAll(/^#{1,4}\s+(\d+(?:\.\d+)?)\b/gm)].map((m) => m[1]);
  const defined = new Set(headings);
  const topLevelMax = Math.max(...headings.map((h) => parseInt(h.split('.')[0], 10)));

  const lines = text.split('\n');
  lines.forEach((line, i) => {
    const refs = [...line.matchAll(/§(\d+(?:\.\d+)?)/g)].map((m) => m[1]);
    for (const ref of refs) {
      const topLevel = parseInt(ref.split('.')[0], 10);
      if (topLevel > topLevelMax) continue; // likely an external doc's own section (e.g. "RFC 7252 §12.3")
      if (!defined.has(ref)) {
        report(file, i + 1, `§${ref} does not match any heading in this document`);
      }
    }
  });
}

// ── Check 4: regression guard for specific already-fixed broken URLs ──

const BAD_URL_PATTERNS = [
  { pattern: /qdef-format\.github\.io\/qdef-format\//, message: 'qdef-format.github.io/qdef-format/ 404s -- this repo is served at the domain root' },
  { pattern: /qdef-format\.github\.io\/qdef\//, message: 'qdef-format.github.io/qdef/ 404s -- this repo is served at the domain root' },
  { pattern: /github\.com\/qdef-format\/qdef\/(?!format)/, message: 'github.com/qdef-format/qdef (missing .github.io) relies on a rename-redirect -- use the canonical qdef-format/qdef-format.github.io' },
];

const SELF = __filename;

function walk(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (URL_SCAN_SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, out);
    } else if (full !== SELF && URL_SCAN_GLOBS.some((ext) => entry.name.endsWith(ext))) {
      out.push(full);
    }
  }
}

function checkBadUrls() {
  const files = [];
  walk(ROOT, files);
  for (const file of files) {
    const lines = fs.readFileSync(file, 'utf-8').split('\n');
    lines.forEach((line, i) => {
      for (const { pattern, message } of BAD_URL_PATTERNS) {
        if (pattern.test(line)) {
          report(file, i + 1, message);
        }
      }
    });
  }
}

// ── Run ─────────────────────────────────────────────────────────────────

for (const file of MD_FILES) {
  checkTableColumns(file);
  checkBraceBalance(file);
}
checkSectionRefs(path.join(ROOT, 'docs', 'QDEF-SPEC.md'));
checkBadUrls();

if (issues.length === 0) {
  console.log('lint-docs: no issues found');
  process.exit(0);
}

console.error(`lint-docs: ${issues.length} issue(s) found\n`);
for (const { file, line, message } of issues) {
  console.error(`${file}:${line}: ${message}`);
}
process.exit(1);
