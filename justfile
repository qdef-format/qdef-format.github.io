default: build

# Build site into _site/
build:
    node scripts/build.js

# Build and open in browser
serve: build
    xdg-open _site/index.html

# Clean build output
clean:
    rm -rf _site

# Rebuild from scratch
rebuild: clean build

# Validate all generated HTML links
check-links: build
    grep -rnP 'href="(?!https?://)[^"]*"' _site/*.html _site/tools/*.html | grep -v 'assets/' || true

# Build and run validator tests
test: build
    node scripts/test-validator.js

# Export logo PNGs from SVG (requires Inkscape)
logo-export:
    inkscape assets/logo.svg --export-filename=assets/logo.png --export-area-page --export-width=512 --export-height=512
    python3 scripts/export-logo-white.py

# Count lines of source files (excluding _site and .git)
wc:
    find . -type f \( -name '*.html' -o -name '*.js' -o -name '*.css' -o -name '*.md' \) -not -path './_site/*' -not -path './.git/*' | xargs wc -l | tail -1
