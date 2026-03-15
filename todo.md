- [x] show output dataset from submission
- [x] show error messages noti when http error code

## Task 6: Quick File Browser (QuickPick-based server file navigation)

A keyboard-friendly file browser using `window.createQuickPick()` that composes the
existing `ContentModel`/`ContentAdapter` without modifying tree view code. Provides
fuzzy filtering, absolute path jumping, and fast drill-down navigation.

### Architecture

- **New file:** `client/src/components/ContentNavigator/QuickFileBrowser.ts`
- **New command:** `SAS.server.quickBrowse` (registered in `ContentNavigator.getSubscriptions()`)
- **No changes to:** `ContentDataProvider`, `ContentModel`, `ContentAdapter`, `StudioWebServerAdapter`

```
Command palette / keybinding
        │
        ▼
SAS.server.quickBrowse ──► QuickFileBrowser (new class)
        │                       │
        │                       ├─ contentModel.getChildren(syntheticFolder)
        │                       │       └─► ContentAdapter.getChildItems()
        │                       │
        │                       └─ file selected ──► SAS.server.openItem (existing)
        │
        └─ optional arg: ContentItem (from tree context menu) or string (abs path)
```

### 6a. Create `QuickFileBrowser` class

File: `client/src/components/ContentNavigator/QuickFileBrowser.ts`

Core design:
- Use `window.createQuickPick()` (not `showQuickPick`) for async item loading, busy
  state, and persistent navigation within a single QuickPick instance
- `matchOnDescription = true`, `matchOnDetail = true`, `ignoreFocusOut = true`
- Title shows current folder path; placeholder explains controls

Item types (use a discriminated union wrapper):
- `$(arrow-left) ..` → navigate to parent folder
- `$(folder) folderName` → drill into subfolder (detail shows full path)
- `$(file) fileName` → open file via existing `SAS.server.openItem`
- `$(arrow-right) Go to /typed/path` → jump to an absolute path

Implementation details:
- **Synthetic `ContentItem` for path jumping:** Create a minimal `ContentItem` with
  just `id`, `uri`, `name`, `links` (with `getDirectoryMembers` rel pointing to the
  path), `permission`, and timestamps. Pass to `contentModel.getChildren()`. No adapter
  changes needed — `StudioWebServerAdapter.getChildItems()` reads `parentItem.links`
  or `parentItem.uri` to determine which directory to list.
- **Per-session cache:** `Map<string, ContentItem[]>` keyed by folder URI. Populated on
  first visit; reused on back/up navigation. Discarded when QuickPick closes.
- **Stale response guard:** Increment a version counter on each navigation; ignore
  responses from older versions.
- **Root flattening:** Skip the virtual "SAS Server" root node — load its children as
  the initial browse screen.

Navigation behavior:
- `onDidAccept`: inspect selected item kind → folder: reload items; file: open & close;
  parent: go up; goto: resolve path & load
- `onDidChangeValue`: if value starts with `/`, add/update a "Go to …" item at top
- `onDidHide`: dispose QuickPick and clear cache

### 6b. Register `SAS.server.quickBrowse` command

File: `client/src/components/ContentNavigator/index.ts`

Add ~10 lines in `getSubscriptions()`:
```ts
commands.registerCommand(`${SAS}.quickBrowse`, async (arg?: ContentItem | string) => {
  await this.contentModel.connect(this.viyaEndpoint());
  const browser = new QuickFileBrowser(this.contentModel);
  await browser.show(arg);
}),
```

Only register for `sourceType === ContentSourceType.SASServer` (or scope to StudioWeb
initially via a `when` clause in `package.json`).

### 6c. Add command to `package.json`

Add to `contributes.commands`:
```json
{ "command": "SAS.server.quickBrowse", "title": "Browse Server Files", "category": "SAS" }
```

Optionally add a keybinding (e.g., `Ctrl+Shift+B` when SAS is active) and/or a
context menu item on the SAS Server tree view title bar.

Add `when` clause: `"SAS.serverEnabled"` so it only appears when a server connection
is configured.

### 6d. Test with harness tests

File: `client/test/harness/quickFileBrowser.test.ts`

Test the non-vscode logic:
- `syntheticFolder()` helper produces valid ContentItem for a given path
- Cache hit/miss behavior
- Version guard discards stale responses
- Item sorting (folders first, then files alphabetically)

### Implementation order

1. **6a** — Create `QuickFileBrowser.ts` with core navigation logic
2. **6b** — Register command in `ContentNavigator/index.ts`
3. **6c** — Add command metadata to `package.json`
4. **6d** — Add harness tests
5. Manual testing: command palette → "Browse Server Files" → navigate, filter, jump

---

## Completed tasks (reference)

- ✅ Task 1: File contents pane bugs (1a–1g)
- ✅ Task 2: Drag-and-drop of untitled file uploads entire local root filesystem
- ✅ Task 3: Drag-and-drop confirmation message
- ✅ Task 4: Support opening SAS dataset (.sas7bdat) file in data view
- ✅ Task 5: Support read/write with server encoding (not UTF-8)
