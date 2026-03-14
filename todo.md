- [ ] show output dataset from submission

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

### 1e. Same-name files in different folders can't be opened simultaneously — not resolved

Root cause unknown. The `vscUri` was changed from `sasServer:/name?id=/path` to
`sasServer:/full/path` so the URI path is now distinct per folder. VS Code breadcrumb
shows the correct distinct URI, but VS Code still reuses the same editor tab for both.
May be a VS Code document identity issue beyond the extension's control.

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

## Task 4: Support opening SAS dataset (.sas7bdat) in data view — not started

## Task 5: Support read/write with server encoding (not UTF-8) — not started
