# Export a white-on-transparent logo PNG from the SVG source.
#
# The original logo.svg uses CSS custom properties for theming
# (e.g. `:root { --fill: #000000; }` with `.fill { fill: var(--fill); }`).
# Inkscape cannot resolve CSS var() — it silently falls back to a default
# fill (black), so a simple text replacement of the hex value in the CSS
# has no effect on the rendered output.
#
# This script bakes #ffffff directly into the SVG XML before exporting,
# producing a correctly white PNG.

import subprocess, sys, os
from xml.etree import ElementTree as ET

SVG_NS = 'http://www.w3.org/2000/svg'
# Register namespaces so ElementTree preserves the Inkscape/Sodipodi
# namespace prefixes instead of rewriting them as ns0:, ns1:, etc.
ET.register_namespace('', SVG_NS)
ET.register_namespace('inkscape', 'http://www.inkscape.org/namespaces/inkscape')
ET.register_namespace('sodipodi', 'http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd')

tree = ET.parse('assets/logo.svg')
root = tree.getroot()

# Replace the entire <style> block — drop the CSS variable indirection
# and set the fill directly.
style = root.find('{%s}style' % SVG_NS)
style.text = '.fill { fill: #ffffff; }\n.fill-none { fill: none; }\n'

# Also add an explicit fill="#ffffff" on every element with class="fill".
# This covers any Inkscape rendering path that doesn't consult the <style>
# block (e.g. --pipe mode, or older Inkscape versions).
for el in root.iter():
    if el.get('class') == 'fill':
        el.set('fill', '#ffffff')

# Write a temporary SVG and export it via Inkscape.
tree.write('assets/logo-white.svg', xml_declaration=True, encoding='UTF-8')
subprocess.run([
    'inkscape', 'assets/logo-white.svg',
    '--export-filename=assets/logo-white.png',
    '--export-area-page', '--export-width=512', '--export-height=512'
], check=True)
os.remove('assets/logo-white.svg')
