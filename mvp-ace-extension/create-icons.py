#!/usr/bin/env python3
"""Create placeholder icons for the browser extension"""

import base64

# Create SVG icons
def create_svg(size, text):
    return f'''<svg width="{size}" height="{size}" xmlns="http://www.w3.org/2000/svg">
  <rect width="{size}" height="{size}" fill="#0066cc"/>
  <text x="{size/2}" y="{size*0.65}" font-family="Arial" font-size="{size*0.35}"
        font-weight="bold" fill="white" text-anchor="middle">{text}</text>
</svg>'''

# Create icons
icons = {
    'extension/icon128.png': create_svg(128, 'SAS'),
    'extension/icon48.png': create_svg(48, 'SAS'),
    'extension/icon16.png': create_svg(16, 'S'),
}

print("SVG icon templates created. To convert to PNG:")
print("1. Use an online SVG to PNG converter")
print("2. Or install ImageMagick/Inkscape and run:")
print("   for i in 128 48 16; do")
print("     convert icon${i}.svg extension/icon${i}.png")
print("   done")
print()
print("Or use this data URL in Chrome (saves as icon*.svg):")
for name, svg in icons.items():
    svg_name = name.replace('.png', '.svg')
    encoded = base64.b64encode(svg.encode()).decode()
    print(f"\n{svg_name}:")
    print(f"data:image/svg+xml;base64,{encoded[:100]}...")
    # Save SVG
    with open(svg_name, 'w') as f:
        f.write(svg)
    print(f"Saved: {svg_name}")

print("\nNote: Chrome extensions can use SVG icons directly in manifest v3!")
print("You can update manifest.json to use .svg files instead of .png")
