# QDEF — Quick Data Exchange Format

QDEF is a general-purpose binary container for multi-action 2D barcodes
(QR, Data Matrix, Aztec) and NFC tags — carry one or more typed records
in a single scan or tap.

This repository hosts the [QDEF website](https://qdef-format.github.io/)
and the canonical specification documents.

## Repository structure

```
├── index.html               # Landing page (source)
├── assets/                  # Static files (CSS, logo)
├── tools/                   # Hex validator (browser-side JS)
├── docs/                    # Specification source files (Markdown)
│   ├── QDEF-SPEC.md
│   ├── EXAMPLES.md
│   └── IMPLEMENTATION-NOTES.md
├── templates/shell.html     # HTML template for content pages
├── scripts/build.js         # Build: .md → .html, copies to _site/
├── .github/workflows/deploy.yml  # GH Actions → GitHub Pages
└── _site/                   # Build output (generated, gitignored)
```

## Building locally

```sh
node scripts/build.js
```

Output goes to `_site/`. Open `_site/index.html` in a browser to preview.

## License

See [LICENSE](LICENSE).
