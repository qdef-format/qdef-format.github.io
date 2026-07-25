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

# Run validator unit tests
test:
    node -e "const fs=require('fs');eval(fs.readFileSync('tools/validator.js','utf8'));const r=validateQDEF(hexToBytes('51 44 45 46 81 82 18 64 a1 00 64 74 65 73 74'));process.exit(r.valid?0:1)" && echo "Validator: OK"

# Export logo PNG from SVG (requires Inkscape)
logo-export:
    inkscape assets/logo.svg --export-filename=assets/logo.png --export-area-page --export-width=512 --export-height=512

# Count lines of source files (excluding _site and .git)
wc:
    find . -type f \( -name '*.html' -o -name '*.js' -o -name '*.css' -o -name '*.md' \) -not -path './_site/*' -not -path './.git/*' | xargs wc -l | tail -1
