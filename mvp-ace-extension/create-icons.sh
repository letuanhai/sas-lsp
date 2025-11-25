#!/bin/bash
# Script to create placeholder icons for the browser extension

cd extension

# Check if ImageMagick is available
if command -v convert &> /dev/null; then
    echo "Creating icons with ImageMagick..."

    # Create 128x128 icon
    convert -size 128x128 xc:#0066cc -gravity center \
        -fill white -pointsize 48 -font Arial-Bold -annotate +0+0 "SAS" icon128.png

    # Create 48x48 icon
    convert -size 48x48 xc:#0066cc -gravity center \
        -fill white -pointsize 18 -font Arial-Bold -annotate +0+0 "SAS" icon48.png

    # Create 16x16 icon
    convert -size 16x16 xc:#0066cc -gravity center \
        -fill white -pointsize 8 -font Arial-Bold -annotate +0+0 "S" icon16.png

    echo "Icons created successfully!"
else
    echo "ImageMagick not found. Creating simple SVG placeholders..."

    # Create SVG and convert to PNG using base64
    cat > icon.svg << 'EOF'
<svg width="128" height="128" xmlns="http://www.w3.org/2000/svg">
  <rect width="128" height="128" fill="#0066cc"/>
  <text x="64" y="80" font-family="Arial" font-size="48" font-weight="bold"
        fill="white" text-anchor="middle">SAS</text>
</svg>
EOF

    echo "SVG icon template created. Please manually convert to PNG using an online tool."
    echo "Or install ImageMagick: sudo apt-get install imagemagick"
fi

echo "Done! Icons should be in the extension/ folder."
