# SAS Editor Browser Extension MVP

A browser extension that provides a SAS code editor powered by Ace Editor and the SAS Language Server Protocol (LSP).

## Features

- **Syntax Highlighting**: SAS code syntax highlighting
- **Code Completion**: Intelligent autocomplete for SAS procedures, functions, and keywords
- **Hover Information**: Hover over SAS keywords for documentation
- **Code Formatting**: Format your SAS code with a single click
- **Persistent Storage**: Your code is automatically saved
- **LSP-Powered**: Uses the official SAS Language Server running in a WebWorker

## Architecture

```
┌─────────────────────────────────────┐
│   Browser Extension (Popup)         │
│  ┌──────────────────────────────┐   │
│  │   Ace Editor                 │   │
│  │   + ace-linters             │   │
│  └──────────┬───────────────────┘   │
│             │ LSP Protocol          │
│  ┌──────────▼───────────────────┐   │
│  │   WebWorker                  │   │
│  │   SAS Language Server        │   │
│  │   (No Python support)        │   │
│  └──────────────────────────────┘   │
└─────────────────────────────────────┘
```

## Installation

### 1. Build the Language Server

```bash
cd language-server
npm install
npm run build
```

This will create `dist/sas-language-server.worker.js`.

### 2. Copy the worker to extension folder

```bash
cp dist/sas-language-server.worker.js extension/
```

### 3. Create placeholder icons

The extension needs icons in the `extension/` folder:
- `icon16.png` (16x16)
- `icon48.png` (48x48)
- `icon128.png` (128x128)

You can create simple placeholder icons or use the SAS logo.

### 4. Load the extension in Chrome

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top right)
3. Click "Load unpacked"
4. Select the `extension/` folder
5. The SAS Editor extension should now appear in your extensions

### 5. Use the Editor

1. Click the extension icon in your toolbar
2. A popup will open with the SAS editor
3. Start coding! The language server will provide:
   - Syntax highlighting
   - Code completion (Ctrl+Space)
   - Hover documentation
   - Code formatting (Ctrl+Shift+F)

## Technology Stack

- **Ace Editor**: Code editor
- **ace-linters**: LSP client for Ace Editor
- **SAS Language Server**: Core language intelligence
  - Lexer, Parser, CodeZoneManager
  - Completion, Formatting, Symbols
- **WebWorker**: Runs language server in background
- **Chrome Extension API**: Extension framework

## Files Structure

```
mvp-ace-extension/
├── language-server/
│   ├── src/
│   │   ├── core/              # SAS language services (copied from main project)
│   │   ├── server.ts          # Simplified LSP server (no Python)
│   │   └── worker.ts          # WebWorker entry point
│   ├── package.json
│   ├── webpack.config.js
│   └── tsconfig.json
│
├── extension/
│   ├── manifest.json          # Extension manifest
│   ├── popup.html            # Editor UI
│   ├── editor.js             # Ace + LSP integration
│   ├── sas-language-server.worker.js  # Built worker (from dist/)
│   └── icon*.png             # Extension icons
│
└── dist/
    └── sas-language-server.worker.js  # Built language server
```

## Development

### Watch mode for language server

```bash
cd language-server
npm run watch
```

This will rebuild the language server whenever you make changes.

### Debugging

1. Open Chrome DevTools for the popup:
   - Right-click the popup → Inspect
2. Check the Console for errors
3. Network tab shows WebWorker communication
4. You can also debug the WebWorker separately

### Logs

- Extension logs: Popup DevTools Console
- Language Server logs: WebWorker Console
- LSP communication: Check `ace-linters` debug output

## Limitations (MVP)

This is a Minimum Viable Product with some limitations:

- No Python support (removed from language server)
- Limited to popup window (not a full IDE)
- No file system integration
- No SAS execution (editor only)
- Basic error handling

## Future Enhancements

Potential improvements for future versions:

1. **Full-page editor**: Standalone editor page (not just popup)
2. **File management**: Open/save SAS files
3. **Multiple files**: Tab support
4. **SAS execution**: Connect to SAS server for running code
5. **Better error handling**: Improved diagnostics and error messages
6. **Settings**: Customizable theme, font size, etc.
7. **Snippets**: SAS code snippets
8. **Keyboard shortcuts**: More shortcuts for common actions

## Troubleshooting

### LSP not connecting

- Check browser console for errors
- Verify `sas-language-server.worker.js` is in the extension folder
- Make sure the worker is built correctly (`npm run build`)

### Completions not working

- Ensure `ace-linters` loaded correctly (check console)
- Try triggering manually with Ctrl+Space
- Check LSP status indicator in the UI

### Extension won't load

- Verify all files are in the `extension/` folder
- Check `manifest.json` for errors
- Make sure icons exist (create placeholders if needed)

## License

Apache-2.0 (same as the main SAS Language Extension)

## Credits

- Based on the official SAS Language Extension for VS Code
- Uses Ace Editor and ace-linters
- Implements Language Server Protocol (LSP)
