# Task 16: DataViewer Improvement — Design & Implementation Spec

## Overview

Improve the DataViewer panel with text selection, cell/row/column/range selection with copy, an integrated column management tab, and SQLite3 Editor integration for EDA.

**Library**: Keep ag-grid Community (v35.1, MIT). No library switch.

---

## Architecture Context

### File Map

| File | Role |
|------|------|
| `client/src/webview/DataViewer.tsx` | React root component — renders ag-grid, tab bar, filter, column menu |
| `client/src/webview/useDataViewer.ts` | Core hook — manages columns, dataSource, sort/filter state, fetches data via postMessage |
| `client/src/webview/ColumnHeader.tsx` | Custom ag-grid header component — type icon + name + sort indicator + dropdown |
| `client/src/webview/ColumnMenu.tsx` | Column dropdown menu — sort actions + Properties |
| `client/src/webview/TableFilter.tsx` | WHERE expression input bar |
| `client/src/webview/GridMenu.tsx` | Generic menu component used by ColumnMenu |
| `client/src/webview/DataViewer.css` | All DataViewer styles |
| `client/src/webview/localize.ts` | l10n helper for webview strings |
| `client/src/panels/DataViewer.ts` | Extension host side — WebView subclass, handles IPC messages (loadData, loadColumns, etc.) |
| `client/src/panels/WebviewManager.ts` | Creates/manages webview panels, handles forceReRender via `reset` message |
| `client/src/panels/TablePropertiesViewer.ts` | Separate webview panel for table properties (General + Columns tabs) |
| `client/src/components/LibraryNavigator/index.ts` | Registers `SAS.viewTable` command, creates DataViewer instances, manages openTables map |
| `client/src/components/LibraryNavigator/types.ts` | `LibraryAdapter` interface, `TableData`, `TableRow`, `TableQuery` types |
| `client/src/components/LibraryNavigator/PaginatedResultSet.ts` | Thin wrapper around the adapter's `getData` call |
| `client/src/connection/rest/api/compute.ts` | `Column` interface (name, type, length, format, informat, label, index, id) |
| `tools/build.mjs` | esbuild config — webview entry point: `./client/src/webview/DataViewer.tsx` → `./client/dist/webview/DataViewer.js` |

### Data Flow

```
User scrolls ag-grid
  → ag-grid infinite row model calls getRows(startRow, endRow)
  → useDataViewer.dataSource.getRows()
  → postMessage({command: "request:loadData", data: {start, end, sortModel, query}})
  → panels/DataViewer.processMessage()
  → PaginatedResultSet.getData() → LibraryAdapter.getRows()
  → SAS server (SQL via /sessions/{id}/sql with firstobs/numobs)
  → response posted back to webview
  → ag-grid renders rows
```

### Column Data Available

The `Column` interface from `compute.ts` provides per-column:
- `name: string` — column name
- `type: string` — SAS type mapped to icon type (char, float/num, date, time, datetime, currency)
- `length: number` — SAS column length
- `format: { name: string }` — SAS format (e.g., "DOLLAR12.2")
- `informat: { name: string }` — SAS informat
- `label: string` — column label
- `index: number` — zero-based position

These are fetched once when the DataViewer opens via `fetchColumns()` and stored in `useDataViewer` state.

### Build & Test

```bash
npm run compile          # build everything
npm run watch            # dev mode with sourcemaps
npx tsc -p client/tsconfig.json --noEmit  # type-check only
```

The DataViewer webview is bundled by esbuild from `client/src/webview/DataViewer.tsx` to `client/dist/webview/DataViewer.js`. CSS files referenced via `import` are bundled. SVG icons are inlined as data URLs via the `dataurl` loader.

To test: open in VS Code with F5 ("Launch Client"), connect to a SAS server, open a dataset from the Libraries panel.

---

## Phase 1A: Text Selection

**Goal**: Enable native text selection in column headers and cell values.

### Changes

#### `client/src/webview/DataViewer.tsx`

Add two props to `<AgGridReact>`:

```tsx
<AgGridReact
  // ... existing props ...
  enableCellTextSelection={true}
  ensureDomOrder={true}
/>
```

`enableCellTextSelection` is a **Community** (free) feature. It enables native browser text selection inside cells. `ensureDomOrder` is required for it to work correctly (ensures DOM order matches visual order).

**Side effect**: With `enableCellTextSelection=true`, ag-grid's built-in Ctrl+C copies only selected text (not focused cell). This is the desired behavior for us.

#### `client/src/webview/ColumnHeader.tsx`

The column header is a custom component. The column name is rendered in a `<span className="ag-header-cell-text">`. Native text selection should work if there are no CSS overrides preventing it.

**Verify**: Ensure no CSS rule in `DataViewer.css` or ag-grid themes sets `user-select: none` on header elements. If found, override:

```css
.ag-header-cell-text {
  user-select: text;
  cursor: text;
}
```

### Localization

No new strings needed.

---

## Phase 1B: Cell/Row/Column/Range Selection with Copy

**Goal**: Custom selection layer on top of ag-grid Community that supports selecting cells by row, column, or rectangular range, with Ctrl/Cmd+C to copy.

### Approach

ag-grid Community does NOT support range selection (that requires `CellSelectionModule` from Enterprise). We implement a **custom overlay selection** tracked in React state.

### New File: `client/src/webview/useSelection.ts`

Hook that manages selection state and copy logic.

#### State

```ts
interface SelectionState {
  // null = no selection active
  anchor: { row: number; col: string } | null;
  // end defines the opposite corner of the selection rectangle
  end: { row: number; col: string } | null;
  // Mode determines how the selection was initiated
  mode: 'cell' | 'row' | 'column' | 'range' | null;
}
```

- `anchor` is set on mousedown/click
- `end` is set on shift+click or mousemove (drag)
- The selection rectangle spans from `anchor` to `end` inclusive

#### Column Ordering

The hook needs the ordered list of visible column field names to compute which columns fall between `anchor.col` and `end.col`:

```ts
const getColumnRange = (startCol: string, endCol: string, allColumns: string[]): string[] => {
  const startIdx = allColumns.indexOf(startCol);
  const endIdx = allColumns.indexOf(endCol);
  const [lo, hi] = startIdx <= endIdx ? [startIdx, endIdx] : [endIdx, startIdx];
  return allColumns.slice(lo, hi + 1);
};
```

#### Row Range

For infinite scroll, we only have data for loaded blocks. The selection should work within loaded rows. `anchor.row` and `end.row` are ag-grid row indices (absolute, 0-based).

```ts
const getRowRange = (startRow: number, endRow: number): [number, number] => {
  return startRow <= endRow ? [startRow, endRow] : [endRow, startRow];
};
```

#### Selection Triggers

| User Action | Result |
|-------------|--------|
| Click on a cell | Select single cell. Set `anchor = end = {row, col}`, mode = `'cell'` |
| Shift+click on a cell | Extend selection from anchor to clicked cell. Set `end = {row, col}`, mode = `'range'` |
| Click on row number column (field `"#"`) | Select entire row. Set `anchor = end = {row, col: ALL}`, mode = `'row'` |
| Click on a column header | Select entire column (all loaded rows). mode = `'column'` |
| Ctrl/Cmd+A | Select all loaded cells |
| Escape | Clear selection |
| Click without Shift | Clear previous selection, start new |

#### ag-grid Event Wiring

In `useDataViewer.ts` or `DataViewer.tsx`, wire these ag-grid callbacks:

```tsx
<AgGridReact
  onCellClicked={(event) => {
    if (event.colDef.field === '#') {
      // Row selection
      selection.selectRow(event.rowIndex, event.event.shiftKey);
    } else {
      selection.selectCell(event.rowIndex, event.colDef.field, event.event.shiftKey);
    }
  }}
/>
```

For column header clicks, modify `ColumnHeader.tsx` to call a selection handler when the header text (not the dropdown button) is clicked. Add an `onClick` handler on the `ag-header-cell-text` span:

```tsx
<span
  className="ag-header-cell-text"
  onClick={(e) => {
    onColumnSelect?.(column.colId, e.shiftKey);
  }}
>
```

Pass `onColumnSelect` through `headerComponentParams` just like `displayMenuForColumn` is already passed.

#### Visual Highlighting

Use ag-grid's `cellClassRules` on each column def to apply a CSS class when a cell is in the selection:

```ts
cellClassRules: {
  'dv-selected': (params) => selection.isCellSelected(params.rowIndex, params.colDef.field),
}
```

Add CSS in `DataViewer.css`:

```css
.ag-cell.dv-selected {
  background-color: var(--vscode-editor-selectionBackground, rgba(0, 120, 215, 0.3));
}

.ag-header-cell.dv-col-selected {
  background-color: var(--vscode-editor-selectionBackground, rgba(0, 120, 215, 0.3));
}
```

**Performance note**: `cellClassRules` is evaluated per cell on render. For infinite scroll with `maxBlocksInCache=10` and 100 rows/block = max 1000 loaded rows × N columns. The `isCellSelected` check is O(1) — just a range bounds check. This is fast enough.

After changing selection state, call `gridRef.current.api.refreshCells({ force: true })` to trigger re-evaluation of `cellClassRules`. This may cause a flash; if so, limit to `refreshCells({ columns: affectedColumns })`.

#### Copy (Ctrl/Cmd+C)

Add a `keydown` listener in `DataViewer.tsx`:

```ts
useEffect(() => {
  const handleCopy = (e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'c' && selection.hasSelection()) {
      e.preventDefault();
      const tsv = selection.getSelectedDataAsTSV(gridRef.current.api);
      navigator.clipboard.writeText(tsv);
    }
  };
  document.addEventListener('keydown', handleCopy);
  return () => document.removeEventListener('keydown', handleCopy);
}, [selection]);
```

`getSelectedDataAsTSV()` implementation:

```ts
getSelectedDataAsTSV(api: GridApi): string {
  const [rowStart, rowEnd] = getRowRange(anchor.row, end.row);
  const cols = mode === 'row'
    ? allColumns.filter(c => c !== '#')
    : getColumnRange(anchor.col, end.col, allColumns);

  const lines: string[] = [];
  // Header row
  lines.push(cols.join('\t'));
  // Data rows
  for (let r = rowStart; r <= rowEnd; r++) {
    const rowNode = api.getDisplayedRowAtIndex(r);
    if (!rowNode?.data) continue;
    lines.push(cols.map(col => rowNode.data[col] ?? '').join('\t'));
  }
  return lines.join('\n');
}
```

**Important**: `api.getDisplayedRowAtIndex(r)` only returns data for rows currently in the cache. Rows that haven't been loaded will be skipped. This is acceptable — the user can only select what they can see.

#### Context Menu (optional enhancement)

Add a right-click context menu on selected cells with options:
- Copy (TSV)
- Copy as CSV
- Copy column names

Use the existing `GridMenu` component. Wire via a `onCellContextMenu` handler or a custom `contextmenu` event listener.

### Localization

Add to `panels/DataViewer.ts` `l10nMessages()`:

```ts
"Copy": l10n.t("Copy"),
"Copy as CSV": l10n.t("Copy as CSV"),
"Copy column names": l10n.t("Copy column names"),
"Select all": l10n.t("Select all"),
```

---

## Phase 1C: Column Management Tab

**Goal**: Add a "Columns" tab to the DataViewer pane (next to the data grid) for column visibility management, search, and copy.

### UI Layout

The DataViewer component currently renders:
```
<h1>{title}</h1>
<row-count-bar />
<TableFilter />
<ColumnMenu />
<ag-grid />
```

Change to:
```
<h1>{title}</h1>
<row-count-bar />
<TabBar tabs={["Data", "Columns"]} />
{activeTab === 'data' && (
  <TableFilter />
  <ColumnMenu />
  <ag-grid />
)}
{activeTab === 'columns' && (
  <ColumnManager />
)}
```

### New File: `client/src/webview/ColumnManager.tsx`

React component that displays all columns with selection controls.

#### Props

```ts
interface ColumnManagerProps {
  columns: Column[];           // from fetchColumns()
  visibleColumns: Set<string>; // currently visible column names
  onVisibilityChange: (columnName: string, visible: boolean) => void;
  onBulkVisibilityChange: (columnNames: string[], visible: boolean) => void;
}
```

#### Layout

```
┌─────────────────────────────────────────┐
│ [🔍 Search columns...                ] │
│ [✓ All] [✗ None] [⇄ Invert] [📋 Copy] │
├────┬──────────┬──────┬────┬──────┬──────┤
│ ☑  │ Name     │ Type │ Len│Format│Label │
├────┼──────────┼──────┼────┼──────┼──────┤
│ ☑  │ Make     │ char │ 13 │      │      │
│ ☑  │ Model    │ char │ 40 │      │      │
│ ☑  │ MSRP     │ num  │  8 │DOLLAR│ MSRP │
│ ☐  │ Invoice  │ num  │  8 │DOLLAR│      │
│ ...│          │      │    │      │      │
└────┴──────────┴──────┴────┴──────┴──────┘
```

#### Features

1. **Fuzzy search**: Text input at top. Filter the column list by name (case-insensitive substring match). The search input should be focused when the tab is activated.

2. **Checkbox per column**: Controls whether the column is visible in the Data tab. Checked = visible. Stored in component state, synced to ag-grid via callback.

3. **Toolbar buttons**:
   - **Select All**: Check all columns (respect current search filter — only toggle filtered columns)
   - **Deselect All**: Uncheck all columns
   - **Invert Selection**: Toggle each column's checkbox
   - **Copy Selected**: Copy names of checked columns to clipboard (newline-separated)
   - **Copy All**: Copy all column names to clipboard (newline-separated)

4. **Text selection**: All text in the column table (names, types, formats, labels) must be selectable via native browser selection. Do NOT use `user-select: none` on any element.

5. **Column detail display**: For each column show:
   - `column.name`
   - `column.type` (with the same type icon used in the data grid header)
   - `column.length`
   - `column.format?.name` (SAS format)
   - `column.informat?.name`
   - `column.label`

#### Syncing with ag-grid

When the user toggles column visibility in the Columns tab and switches back to the Data tab:

```ts
// In useDataViewer.ts — add a method:
const setColumnsVisible = (columnNames: string[], visible: boolean) => {
  gridRef.current.api.setColumnsVisible(columnNames, visible);
};
```

`api.setColumnsVisible()` is a Community API. It hides/shows columns without re-fetching data.

#### State Persistence

Add `hiddenColumns: string[]` to the existing `ViewProperties` type in `panels/DataViewer.ts`:

```ts
export type ViewProperties = {
  columnState?: ColumnState[];
  query?: TableQuery;
  hiddenColumns?: string[];
};
```

This is already persisted via the `request:storeViewProperties` message. On reload, hidden columns are re-applied.

### New File: `client/src/webview/TabBar.tsx`

Simple tab bar component:

```tsx
interface TabBarProps {
  tabs: string[];
  activeTab: string;
  onTabChange: (tab: string) => void;
}
```

Render as a row of buttons. Active tab has a bottom border highlight. Use VS Code theme variables for colors:

```css
.tab-bar { display: flex; border-bottom: 1px solid var(--vscode-editorGroup-border); }
.tab-bar button { ... }
.tab-bar button.active { border-bottom: 2px solid var(--vscode-focusBorder); }
```

### Localization

Add to `panels/DataViewer.ts` `l10nMessages()`:

```ts
"Data": l10n.t("Data"),
"Columns": l10n.t("Columns"),
"Search columns": l10n.t("Search columns"),
"Select all columns": l10n.t("Select all columns"),
"Deselect all columns": l10n.t("Deselect all columns"),
"Invert selection": l10n.t("Invert selection"),
"Copy selected column names": l10n.t("Copy selected column names"),
"Copy all column names": l10n.t("Copy all column names"),
"Name": l10n.t("Name"),
"Type": l10n.t("Type"),
"Length": l10n.t("Length"),
"Format": l10n.t("Format"),
"Informat": l10n.t("Informat"),
"Label": l10n.t("Label"),
```

---

## Phase 2: SQLite3 Editor Integration

### Goal

Allow users to export SAS dataset data to SQLite3 Editor for interactive SQL exploration.

### Dependency

Soft dependency on `yy0931.vscode-sqlite3-editor` (v1.0.212+). Check before use:

```ts
const sqlite3Editor = vscode.extensions.getExtension('yy0931.vscode-sqlite3-editor');
if (!sqlite3Editor) {
  const action = await vscode.window.showInformationMessage(
    'SQLite3 Editor extension is required. Install it?',
    'Install'
  );
  if (action === 'Install') {
    await vscode.commands.executeCommand(
      'workbench.extensions.installExtension',
      'yy0931.vscode-sqlite3-editor'
    );
  }
  return;
}
```

### Integration Flow

SQLite3 Editor has **no direct SQL execution API**. The interaction model is:

1. `sqlite3-editor.openInMemoryDatabase` — opens in-memory DB (URI: `sqlite3-editor-memory:/memory`)
2. Create a text document with `languageId: 'query-editor'` containing SQL
3. `sqlite3-editor.executescript` — executes the active query editor document

```
User clicks "Open in SQLite" in DataViewer toolbar
  → SAS extension checks SQLite3 Editor is installed
  → executeCommand('sqlite3-editor.openInMemoryDatabase')
  → wait for editor to activate
  → create untitled document with language 'query-editor'
  → write SQL (CREATE TABLE + INSERT VALUES)
  → show document
  → executeCommand('sqlite3-editor.executescript')
```

### SQL Generation

#### New File: `client/src/components/LibraryNavigator/sqliteExport.ts`

Pure function, no dependencies on VS Code API (can be unit tested in test-harness).

```ts
export interface SQLiteExportOptions {
  tableName: string;        // e.g., "WORK_CARS"
  columns: Column[];        // from fetchColumns()
  rows: string[][];         // array of row arrays (cell values as strings)
  includeDropTable: boolean;
}

export function generateSQLiteSQL(options: SQLiteExportOptions): string {
  // Returns complete SQL string
}
```

#### Type Mapping

```
SAS char        → TEXT
SAS num/float   → REAL
(all other)     → TEXT
```

No date/datetime conversion. SAS dates are numeric (days since 1960-01-01); users handle conversion themselves.

#### Generated SQL Format

```sql
-- SAS Dataset: WORK.CARS (15 columns, 428 rows)
-- Exported from SAS Extension

DROP TABLE IF EXISTS "WORK_CARS";

CREATE TABLE "WORK_CARS" (
  "Make" TEXT,
  "Model" TEXT,
  "MSRP" REAL,
  "Invoice" REAL
);

BEGIN TRANSACTION;

INSERT INTO "WORK_CARS" VALUES
  ('Acura', 'MDX', 36945.0, 33337.0),
  ('Acura', 'RSX Type S 2dr', 23820.0, 21761.0),
  -- ... up to 500 rows per INSERT
  ;

INSERT INTO "WORK_CARS" VALUES
  -- next batch ...
  ;

COMMIT;
```

#### Value Escaping

```ts
function escapeValue(value: string, columnType: string): string {
  if (value === '' || value === null || value === undefined) return 'NULL';
  if (columnType === 'num' || columnType === 'float') {
    // Try parsing as number; if NaN, treat as NULL (SAS missing value '.')
    if (value === '.') return 'NULL';
    const n = Number(value);
    return isNaN(n) ? 'NULL' : String(n);
  }
  // Text: escape single quotes
  return `'${value.replace(/'/g, "''")}'`;
}
```

#### Batching

Split INSERT statements at 500 rows each to avoid huge SQL strings. Wrap in `BEGIN TRANSACTION` / `COMMIT` for performance.

### Commands & UI

#### New Command: `SAS.openInSQLite`

Registered in `client/src/components/LibraryNavigator/index.ts`.

**Behavior**:
1. Get the active DataViewer's item, columns, and currently loaded rows
2. Prompt: "Export first {n} rows to SQLite?" with options [100, 1000, 5000, All (if known)]
3. Generate SQL
4. Execute the SQLite3 Editor integration flow above

**How to get loaded rows**: The DataViewer uses ag-grid's infinite row model with `maxBlocksInCache=10` and `cacheBlockSize=100`, so up to 1000 rows may be cached. Use `api.getDisplayedRowAtIndex(i)` to read cached rows. For rows beyond the cache, make additional `getRows()` calls via the adapter.

#### New Command: `SAS.copySQLiteSQL`

Same SQL generation, but copies to clipboard instead of executing. Works without SQLite3 Editor installed.

**Behavior**:
1. Get active DataViewer's item, columns, loaded rows
2. Generate SQL
3. `navigator.clipboard.writeText(sql)` (from webview) or `vscode.env.clipboard.writeText(sql)` (from extension host)
4. Show info notification: "SQLite SQL copied to clipboard ({n} rows)"

#### DataViewer Toolbar Button

Add to `package.json` under `menus` → `editor/title`:

```json
{
  "command": "SAS.copySQLiteSQL",
  "when": "activeCustomEditorId == SAS.dataViewer || SAS.dataViewerActive",
  "group": "navigation"
}
```

The button uses codicon `$(database)` or `$(copy)`.

**Implementation detail**: The toolbar buttons are on the extension host side. The webview doesn't have direct access to VS Code commands. The flow is:

1. Add a new button in the DataViewer webview (React component) that posts a message: `{ command: "request:copySQLiteSQL" }` or `{ command: "request:openInSQLite" }`
2. `panels/DataViewer.ts` handles the message, gathers columns + rows data, generates SQL, performs the action

Alternatively, register the commands at the VS Code level and have them access the active DataViewer through the `lastActiveDataViewerUid` tracking in `LibraryNavigator`.

### Performance Limits

| Row Count | SQL Size (est.) | Approach |
|-----------|----------------|----------|
| < 1,000 | < 200 KB | Direct clipboard / query editor |
| 1,000–10,000 | 200 KB – 2 MB | Query editor document (VS Code handles large docs fine) |
| 10,000–50,000 | 2–10 MB | Write to temp `.sqlite3-query` file, open in editor |
| > 50,000 | > 10 MB | Warning: "Large dataset. Consider filtering first." Truncate to 50K rows |

### Localization

```ts
"Open in SQLite Editor": l10n.t("Open in SQLite Editor"),
"Copy SQLite SQL": l10n.t("Copy SQLite SQL"),
"SQLite SQL copied to clipboard ({count} rows)": l10n.t("SQLite SQL copied to clipboard ({count} rows)"),
"Export rows to SQLite": l10n.t("Export rows to SQLite"),
"SQLite3 Editor extension is required": l10n.t("SQLite3 Editor extension is required"),
```

---

## Implementation Order

```
1. Phase 1A — Text selection (smallest, ~10 min)
     Files: DataViewer.tsx, DataViewer.css (possibly)

2. Phase 1C — Column management tab (~2-4 hours)
     Files: new ColumnManager.tsx, new TabBar.tsx, DataViewer.tsx,
            useDataViewer.ts, DataViewer.css, panels/DataViewer.ts

3. Phase 1B — Range selection + copy (~3-5 hours)
     Files: new useSelection.ts, DataViewer.tsx, useDataViewer.ts,
            ColumnHeader.tsx, DataViewer.css, panels/DataViewer.ts

4. Phase 2 — SQLite integration (~2-3 hours)
     Files: new sqliteExport.ts, LibraryNavigator/index.ts,
            panels/DataViewer.ts, package.json (commands)
```

Phases can be worked on independently by different agents. Phase 1A should be done first (other phases build on it). Phases 1B, 1C, and 2 have no mutual dependencies.

---

## Files Changed (Summary)

### New Files
- `client/src/webview/useSelection.ts` — selection state hook
- `client/src/webview/ColumnManager.tsx` — column management tab component
- `client/src/webview/TabBar.tsx` — tab bar component
- `client/src/components/LibraryNavigator/sqliteExport.ts` — SQL generation

### Modified Files
- `client/src/webview/DataViewer.tsx` — add ag-grid props, tab bar, selection wiring, copy handler
- `client/src/webview/DataViewer.css` — selection highlight styles, tab bar styles, column manager styles
- `client/src/webview/useDataViewer.ts` — expose setColumnsVisible, pass selection handlers
- `client/src/webview/ColumnHeader.tsx` — add column select click handler
- `client/src/panels/DataViewer.ts` — new l10n messages, new IPC message handlers, hiddenColumns in ViewProperties
- `client/src/components/LibraryNavigator/index.ts` — register new commands (SAS.openInSQLite, SAS.copySQLiteSQL)
- `package.json` — register new commands and menu contributions
