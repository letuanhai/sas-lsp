- [x] show output dataset from submission

## Task 1: File contents pane bugs — mostly complete

### 1a. "Cannot resolve tree item" error when creating file from root folder ✓

Root cause: ContentItems in StudioWebServerAdapter don't have stable `uid` fields, so after
refresh VS Code can't resolve items for `reveal()`. Also `getParentOfItem` returns a new item
for "/" that doesn't match the virtual root in the tree.

Fix:

- Add `uid: uri` to all items in `convertEntryToContentItem`
- Fix `getParentOfItem` to return `rootFolders["@sasServerRoot"]` for items whose
  parentFolderUri is "/" (direct children of the file system root)
- Wrap `reveal()` call in `.then(undefined, () => {})` to swallow residual errors

### 1b. Creating a new file with same name overwrites existing file silently ✓

Fix:

- Add `FileAlreadyExistsError` message to const.ts
- Pre-fetch sibling names before showing input box; validate in `validateInput` callback
- Add a duplicate check in `createNewItem` as a safety net

### 1c. Extension hangs after creating file in subfolder ✓

Root cause: Same as 1a — `reveal()` after file creation causes VS Code tree errors
for items without stable UIDs. Fix 1a addresses this.
Additional fix:

- Add 30s request timeout to axios in state.ts
- Add AbortController to cancel all pending requests when a new session starts

### 1d. "New SAS Studio session" command doesn't cancel in-flight requests ✓

Fix:

- Add AbortController in state.ts; abort on `setCredentials`

### 1e. Same-name files in different folders can't be opened simultaneously ✓

**URIs ARE distinct** — confirmed by code review. StudioWeb adapter builds
`sasServer:/folder1/test.sas` vs `sasServer:/folder2/test.sas` (line 303 of
`StudioWebServerAdapter.ts`). These are fully distinct URIs (different `path` component,
same scheme, no authority). VS Code identifies FileSystemProvider documents by full URI,
so document identity is NOT the problem.

**Root cause: VS Code preview tab behavior.** When a tree item is clicked, the `command`
on the TreeItem fires `SAS.server.openItem` (ContentDataProvider.ts:281), which calls
`commands.executeCommand("vscode.open", uri)` (index.ts:102) **without** passing
`{ preview: false }`. This means VS Code opens the file in **preview mode** — and preview
tabs replace each other on single-click. So clicking `test.sas` in folder1, then clicking
`test.sas` in folder2, replaces the first preview tab with the second. This happens for
ALL files (not just same-name ones), but is most confusing when names match because the
tab label doesn't visually change.

**Why it seems name-specific:** The tab label shows only the filename (not the full path).
When two files have different names, the user sees the tab label change and perceives it
as "opening a new file." When names match, the tab label stays the same, so it looks like
"the same file is still open" even though the content changed to the second file.

**Fix options (pick one):**

1. **Pass `{ preview: false }` to `vscode.open`** in the `openItem` command
   (index.ts:102). This makes every tree-item click open a persistent (non-preview) tab.
   Simple, but changes behavior for all files — users accumulate many open tabs.

2. **Double-click already handles this.** VS Code tree views promote preview→persistent
   on double-click. Educating users to double-click to "pin" a tab may be sufficient.
   No code change needed.

3. **Show parent folder in tab label.** Use `resourceUri` (already set on TreeItem at
   line 289) which includes the full path. VS Code automatically appends parent folder
   disambiguation to tab labels when two tabs share the same filename. This ALREADY
   works if both files are opened as persistent tabs (double-click or edit). The issue
   is only that preview mode prevents both from being open simultaneously.

**Recommended fix:** Option 1 — change the `openItem` command to use `{ preview: false }`:

```ts
// In index.ts, line 102:
await commands.executeCommand("vscode.open", uri, { preview: false });
```

This is a one-line change. The `resourceUri` on the TreeItem already contains the full
path, so VS Code will auto-disambiguate tab labels (e.g., "test.sas — folder1" vs
"test.sas — folder2") when both are open.

**Secondary issue:** `getEditorTabsForItem` in utils.ts:125 matches tabs by
`tab.input.uri.query.includes(fileUri.query)`. StudioWeb URIs have NO query string,
so `"".includes("")` is always true — this function matches ALL open StudioWeb file tabs
for any item. This could cause bugs when closing tabs on delete. Fix: compare full URI
(`tab.input.uri.toString() === fileUri.toString()`) or compare path
(`tab.input.uri.path === fileUri.path`).

### 1f. Rename allows duplicate name in same folder ✓

Fix:

- Pre-fetch parent's children before showing rename input box; validate in `validateInput`
- Add duplicate check in `renameItem` in StudioWebServerAdapter as a safety net

### 1g. Opened files show stale content (cached) ✓

Fix:

- Add `forcedMtime` map in ContentDataProvider; `invalidateFile(uri)` stores fresh mtime
  and fires `FileChangeType.Changed` event
- `stat()` returns forced mtime once (consumed), causing VS Code to call `readFile` again
- `SAS.server.openItem` / `SAS.content.openItem` commands call `invalidateFile` before opening

## Task 2: Drag-and-drop of untitled file uploads entire local root filesystem ✓

Fix:

- In `handleDataTransferItemDrop`: if scheme is `untitled:`, show `FileDropUnsavedError` and return
- Guard `fsPath === "/"` to prevent any accidental root-level upload
- Wrap `lstat` in try-catch — if the path doesn't exist on disk, show error and skip
- Add `FileDropUnsavedError` message to const.ts

## Task 3: Drag-and-drop confirmation message ✓

Fix:

- Add confirmation dialog in `handleDrop` (ContentDataProvider) before any drop is processed
- Distinct messages: single item move, multiple items move, external file upload
- Add `DropConfirmationMessage`, `DropConfirmationMessageMultiple`, `DropUploadConfirmationMessage`,
  `DropConfirmationLabel` to const.ts
- Button labels: Cancel / Yes

## Task 4: Support opening SAS dataset (.sas7bdat) file in data view ✓

### How it works (SAS Studio API)

When a `.sas7bdat` file is double-clicked in SAS Studio's file browser, it:
1. `PUT /sasexec/libdata/{sessionId}/{LIBREF}` — creates a temporary SAS library pointing to
   the directory containing the file. Body is a libdata node with `path` set to the dir.
2. `POST /sasexec/sessions/{sessionId}/tables/{LIBREF}/{tableName}/?getViewColumnCount=true`
   — gets column metadata (reuses existing `getColumns` / `getTableRowCount` code).
3. `POST /sasexec/sessions/{sessionId}/sql?numobs=N` — fetches rows (reuses `getRows`).

### Fix

- `StudioWebLibraryAdapter.assignTempLibrary(libref, dirPath)` — PUT to create the temp library
- `connection/studioweb/openDataset.ts` — `openSas7bdatAsDataViewer(uri)`: generates a unique
  libref `_FV0`…`_FV9999`, assigns temp library, builds `LibraryItem`, fires `SAS.viewTable`
- `ContentNavigator/index.ts` `SAS.server.openItem` — detects `.sas7bdat` extension + StudioWeb
  connection type, calls `openSas7bdatAsDataViewer` instead of `vscode.open`

## Task 5: Support read/write with server encoding (not UTF-8) ✓

### Investigation findings (from SSH + API testing)

**Reading files:**
- `GET /sessions/{id}/workspace/{path}` always returns **raw file bytes** — no transcoding.
- `?ct=text/plain;charset=<ENC>` only echoes the charset back in the response `Content-Type` header; it does NOT transcode the body.
- Old code used `responseType: "text"` → Node.js axios decoded as UTF-8 → corrupted non-UTF-8 files.

**Writing files:**
- `POST /sessions/{id}/workspace/{path}` with `?encoding=<ENC>` tells the server to transcode **from UTF-8 input → target encoding** before saving.
- Without `?encoding`, the server saves body bytes as-is (assumes UTF-8).
- The `Content-Type` request charset header is **ignored** — only the `?encoding` URL param matters.
- Old code sent `params: { ct: ... }` (the `ct` param does nothing on POST) and never passed `?encoding`.

**Session preferences (default encoding):**
- `GET /{sessionId}/preferences/get?key=SWE.optionPreferencesGeneral.key`
- Returns `{ "defaultTextEncoding": "ISO-8859-1", ... }` (this test server has ISO-8859-1 set).

**SQL / table data:**
- `POST /sessions/{id}/sql` always returns UTF-8 JSON — no encoding issues. No changes needed.

**File listing API:**
- `GET /sessions/{id}/workspace/{path}?includeChildren=false` (with `ObjectType` header) returns JSON.
- File objects do NOT include a per-file `encoding` field — only session-level default encoding is available.

### Fix

- `state.ts`: Add `_serverEncoding` var + `getServerEncoding()` / `setServerEncoding()`.
  Reset to `"UTF-8"` when credentials are cleared.
- `index.ts` `establishConnection()`: After `setCredentials()`, fetch `SWE.optionPreferencesGeneral`
  from `/{sessionId}/preferences/get` and call `setServerEncoding(data.defaultTextEncoding)`.
  Failure is non-fatal (keeps default UTF-8).
- `StudioWebServerAdapter.getContentOfItem()`: Change to `responseType: "arraybuffer"`,
  decode with `new TextDecoder(getServerEncoding()).decode(response.data)`.
- `StudioWebServerAdapter.updateContentOfItem()`: Remove wrong `ct` param; add
  `?encoding=<enc>` when server encoding ≠ UTF-8 (server transcodes UTF-8 body → target).
- `StudioWebServerAdapter.createNewItem()`: Fix `Buffer.from(buffer).toString()` →
  `new TextDecoder("utf-8").decode(buffer)` (explicit); add same `?encoding` param.
