# SAS Language Server + Ace Editor - Browser Extension MVP

This MVP demonstrates the SAS Language Server running in a browser extension with Ace Editor, using the ace-linters library for LSP integration.

## Quick Start

### Prerequisites

- Node.js 18+ and npm
- Chrome or Chromium-based browser
- Basic knowledge of browser extensions

### Build and Install

```bash
# 1. Install language server dependencies
cd language-server
npm install

# 2. Build the language server for browser
npm run build

# 3. The built worker is output to ../dist/sas-language-server.worker.js

# 4. Create placeholder icons (16x16, 48x48, 128x128 PNG files)
#    Place them in the extension/ folder as icon16.png, icon48.png, icon128.png
#    You can use any simple colored square as a placeholder

# 5. Load the extension in Chrome
#    - Open chrome://extensions/
#    - Enable "Developer mode"
#    - Click "Load unpacked"
#    - Select the mvp-ace-extension/extension/ folder

# 6. Click the extension icon to open the SAS editor!
```

## Project Structure

```
mvp-ace-extension/
├── README.md                          # This file
├── language-server/                   # SAS Language Server (browser build)
│   ├── src/
│   │   ├── core/                     # Core SAS language services
│   │   │   ├── Lexer.ts
│   │   │   ├── CodeZoneManager.ts
│   │   │   ├── CompletionProvider.ts
│   │   │   ├── LanguageServiceProvider.ts
│   │   │   ├── formatter/
│   │   │   └── ...
│   │   ├── server.ts                 # Simplified LSP server (no Python)
│   │   └── worker.ts                 # WebWorker entry point
│   ├── package.json
│   ├── webpack.config.js             # Browser build configuration
│   └── tsconfig.json
│
├── extension/                         # Chrome extension
│   ├── manifest.json                 # Extension manifest
│   ├── popup.html                    # Editor UI
│   ├── editor.js                     # Ace + LSP integration
│   ├── README.md                     # Extension documentation
│   └── icon*.png                     # Icons (you need to create these)
│
└── dist/                              # Build output
    └── sas-language-server.worker.js # Built language server WebWorker
```

## Features

✅ **Syntax Highlighting**: Full SAS syntax highlighting
✅ **Code Completion**: Intelligent autocomplete for SAS keywords, procedures, and functions
✅ **Hover Documentation**: Hover over SAS keywords for help
✅ **Code Formatting**: Format SAS code with Ctrl+Shift+F
✅ **Document Symbols**: Navigate code structure
✅ **Folding Ranges**: Collapse/expand DATA, PROC, and MACRO blocks
✅ **Semantic Tokens**: Rich syntax highlighting
✅ **Auto-save**: Code is automatically saved to browser storage

## How It Works

```
┌───────────────────────────────────────────────────────────┐
│                    Browser Extension                      │
│                                                           │
│  ┌─────────────────────────────────────────────────┐     │
│  │              Ace Editor (popup.html)            │     │
│  │                                                 │     │
│  │  ┌────────────────────────────────────────┐    │     │
│  │  │        ace-linters                     │    │     │
│  │  │      (LSP Client Library)              │    │     │
│  │  └──────────────┬─────────────────────────┘    │     │
│  │                 │                               │     │
│  │                 │ LSP Protocol (JSON-RPC)       │     │
│  │                 │                               │     │
│  │  ┌──────────────▼─────────────────────────┐    │     │
│  │  │         WebWorker                      │    │     │
│  │  │                                        │    │     │
│  │  │  ┌──────────────────────────────┐     │    │     │
│  │  │  │   SAS Language Server        │     │    │     │
│  │  │  │   - Lexer                    │     │    │     │
│  │  │  │   - Parser                   │     │    │     │
│  │  │  │   - Completion Provider      │     │    │     │
│  │  │  │   - Formatter                │     │    │     │
│  │  │  │   - Symbol Provider          │     │    │     │
│  │  │  └──────────────────────────────┘     │    │     │
│  │  └────────────────────────────────────────┘    │     │
│  └─────────────────────────────────────────────────┘     │
└───────────────────────────────────────────────────────────┘
```

## Key Components

### 1. Language Server (`language-server/`)

The SAS Language Server provides all language intelligence:

- **Lexer**: Tokenizes SAS code
- **Parser**: Understands SAS syntax structure
- **CompletionProvider**: Provides code completion suggestions
- **Formatter**: Formats SAS code
- **SymbolProvider**: Extracts document symbols
- **CodeZoneManager**: Manages DATA/PROC/MACRO blocks

**Important**: Python support has been removed for the MVP (no Pyright dependency).

### 2. Browser Extension (`extension/`)

A Chrome extension that hosts the editor:

- **popup.html**: UI with Ace Editor
- **editor.js**: Integration logic (Ace + ace-linters + LSP)
- **manifest.json**: Extension configuration

### 3. ace-linters Integration

The `ace-linters` library bridges Ace Editor and the Language Server:

- Translates Ace editor events to LSP requests
- Translates LSP responses to Ace editor actions
- Handles WebWorker communication
- Provides completion, hover, formatting, and more

## Development

### Building

```bash
cd language-server

# Production build
npm run build

# Development build with watch
npm run watch
```

### Testing

1. Make changes to the language server code
2. Rebuild with `npm run build`
3. Reload the extension in Chrome (chrome://extensions/)
4. Open the popup and test your changes

### Debugging

**Extension Console:**
```
Right-click extension popup → Inspect
```

**WebWorker Console:**
```
chrome://inspect/#workers → Inspect the worker
```

**Check LSP Communication:**
Enable verbose logging in `editor.js` to see LSP messages.

## Differences from Main Project

This MVP differs from the main SAS Language Extension:

| Feature | Main Extension | MVP |
|---------|---------------|-----|
| Editor | VS Code | Ace Editor |
| Platform | Desktop + Web | Browser Extension |
| Python Support | ✅ Yes (Pyright) | ❌ No (removed) |
| SAS Execution | ✅ Yes | ❌ No (editor only) |
| File System | ✅ Yes | ❌ No |
| Multi-file | ✅ Yes | ❌ No (single file) |
| Notebooks | ✅ Yes | ❌ No |
| Connection Types | 4 types | ❌ None |

## Customization

### Change Editor Theme

Edit `popup.html`:
```javascript
editor.setTheme("ace/theme/twilight"); // or any other theme
```

### Modify Window Size

Edit `popup.html` CSS:
```css
body {
  width: 1000px;  /* Change width */
  height: 800px;  /* Change height */
}
```

### Add Custom Completions

Edit `language-server/src/core/SyntaxDataProvider.ts` to add custom SAS procedures or functions.

### Change Font

Edit `popup.html`:
```javascript
editor.setOptions({
  fontSize: "16px",  // Change font size
  fontFamily: "Consolas",  // Change font family
});
```

## Creating Icons

You need to create three icon files for the extension:

**Simple method** (using any graphics tool):
1. Create a 128x128 pixel image with "SAS" text or a simple design
2. Save as `extension/icon128.png`
3. Resize to 48x48 and save as `extension/icon48.png`
4. Resize to 16x16 and save as `extension/icon16.png`

**Command-line method** (using ImageMagick):
```bash
cd extension

# Create a simple colored square with text
convert -size 128x128 xc:#0066cc -gravity center \
  -fill white -pointsize 48 -annotate +0+0 "SAS" icon128.png

convert icon128.png -resize 48x48 icon48.png
convert icon128.png -resize 16x16 icon16.png
```

## Troubleshooting

### "LSP: Error" in status bar

- Check the browser console for errors
- Ensure `sas-language-server.worker.js` exists in `extension/` folder
- Verify the worker built successfully

### No completions appearing

- Check if ace-linters loaded (look for errors in console)
- Try pressing Ctrl+Space manually
- Verify LSP status shows "Connected"

### Worker won't load

- Check `manifest.json` has correct `web_accessible_resources`
- Verify webpack built the worker correctly
- Check Chrome DevTools → Network tab for 404 errors

### Extension won't install

- Ensure all required files exist in `extension/` folder
- Create placeholder icons if missing
- Check `manifest.json` for syntax errors

## Next Steps

To expand this MVP:

1. **Full-page editor**: Create a separate page instead of popup
2. **File management**: Add open/save functionality using File System Access API
3. **Multiple files**: Support tabs for multiple SAS files
4. **Execute SAS code**: Connect to SAS server
5. **Better UI**: Improved toolbar, settings panel
6. **More LSP features**: Diagnostics, go-to-definition, find references
7. **Snippets**: Add SAS code snippets
8. **Themes**: Support multiple color themes

## License

Apache-2.0

## Related Projects

- [Official SAS Language Extension for VS Code](https://github.com/sassoftware/vscode-sas-extension)
- [Ace Editor](https://ace.c9.io/)
- [ace-linters](https://github.com/mkslanc/ace-linters)
- [Language Server Protocol](https://microsoft.github.io/language-server-protocol/)
