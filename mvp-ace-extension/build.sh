#!/bin/bash
# Build script for SAS Language Server + Ace Editor MVP

set -e

echo "🚀 Building SAS Language Server for Browser Extension..."
echo ""

# Step 1: Install dependencies
echo "📦 Installing dependencies..."
cd language-server
if [ ! -d "node_modules" ]; then
    npm install
else
    echo "Dependencies already installed (skipping npm install)"
fi

# Step 2: Build the language server
echo ""
echo "🔨 Building language server..."
npm run build

# Step 3: Copy worker to extension folder
echo ""
echo "📋 Copying worker to extension folder..."
cp ../dist/sas-language-server.worker.js ../extension/

# Step 4: Create icons if they don't exist
echo ""
cd ..
if [ ! -f "extension/icon128.png" ]; then
    echo "🎨 Creating placeholder icons..."
    ./create-icons.sh
else
    echo "Icons already exist (skipping icon creation)"
fi

# Success!
echo ""
echo "✅ Build complete!"
echo ""
echo "📂 Files created:"
echo "  - dist/sas-language-server.worker.js"
echo "  - extension/sas-language-server.worker.js"
echo "  - extension/icon*.png (if created)"
echo ""
echo "🎯 Next steps:"
echo "  1. Open Chrome and go to chrome://extensions/"
echo "  2. Enable 'Developer mode' (top right)"
echo "  3. Click 'Load unpacked'"
echo "  4. Select the 'extension/' folder"
echo "  5. Click the extension icon to use the SAS editor!"
echo ""
