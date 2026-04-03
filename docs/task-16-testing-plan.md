# Task 16: DataViewer Improvement — Testing Plan

## Testing Strategy Overview

Each phase produces **pure logic** that can be tested in the fast Mocha harness (`test-harness`), plus **UI integration** that requires manual testing in VS Code (F5 launch). No VS Code integration tests (`test-client`) are needed — DataViewer is a webview, not a native VS Code UI element, and its React components are bundled by esbuild outside the extension host.

### Test infrastructure

| Layer | Framework | Speed | What it covers |
|-------|-----------|-------|----------------|
| `test-harness` | Mocha + Chai + Sinon, `ts-node` | Seconds | Pure functions, state logic, data transformations |
| Manual (F5) | VS Code Extension Development Host | Minutes | Full UI: ag-grid rendering, selection visuals, tab switching, clipboard, SQLite3 Editor interop |

---

## Phase 1: Cell/Row/Column/Range Selection + Copy

### Unit Tests (`client/test/harness/useSelection.test.ts`)

The `useSelection.ts` hook contains pure helper functions that can be extracted/duplicated for testing (same pattern as `stripHtml.test.ts` and `OutputDatasetPanel.test.ts`).

#### Test: `getColumnRange`

```ts
describe("getColumnRange", () => {
  const cols = ["#", "Make", "Model", "MSRP", "Invoice", "Weight"];

  it("returns single column when start === end", () => {
    expect(getColumnRange("MSRP", "MSRP", cols)).to.deep.equal(["MSRP"]);
  });

  it("returns range in forward order", () => {
    expect(getColumnRange("Make", "MSRP", cols)).to.deep.equal(["Make", "Model", "MSRP"]);
  });

  it("returns range in reverse order (auto-swaps)", () => {
    expect(getColumnRange("MSRP", "Make", cols)).to.deep.equal(["Make", "Model", "MSRP"]);
  });

  it("returns empty array when column not found", () => {
    expect(getColumnRange("NotExist", "Make", cols)).to.deep.equal([]);
  });
});
```

#### Test: `getRowRange`

```ts
describe("getRowRange", () => {
  it("returns [start, end] when start <= end", () => {
    expect(getRowRange(2, 5)).to.deep.equal([2, 5]);
  });

  it("swaps when start > end", () => {
    expect(getRowRange(5, 2)).to.deep.equal([2, 5]);
  });

  it("works with identical indices", () => {
    expect(getRowRange(3, 3)).to.deep.equal([3, 3]);
  });
});
```

#### Test: `isCellSelected`

```ts
describe("isCellSelected", () => {
  const cols = ["#", "Make", "Model", "MSRP", "Invoice"];

  it("returns true for a single-cell selection", () => {
    const state = { anchor: { row: 2, col: "MSRP" }, end: { row: 2, col: "MSRP" }, mode: "cell" };
    expect(isCellSelected(state, 2, "MSRP", cols)).to.be.true;
  });

  it("returns false for cell outside selection", () => {
    const state = { anchor: { row: 2, col: "MSRP" }, end: { row: 2, col: "MSRP" }, mode: "cell" };
    expect(isCellSelected(state, 3, "MSRP", cols)).to.be.false;
  });

  it("returns true for cell within a rectangular range", () => {
    const state = { anchor: { row: 1, col: "Make" }, end: { row: 3, col: "MSRP" }, mode: "range" };
    expect(isCellSelected(state, 2, "Model", cols)).to.be.true;
  });

  it("returns true for all data columns in row mode", () => {
    const state = { anchor: { row: 2, col: "#" }, end: { row: 2, col: "#" }, mode: "row" };
    expect(isCellSelected(state, 2, "Make", cols)).to.be.true;
    expect(isCellSelected(state, 2, "Invoice", cols)).to.be.true;
  });

  it("returns false for different row in row mode", () => {
    const state = { anchor: { row: 2, col: "#" }, end: { row: 2, col: "#" }, mode: "row" };
    expect(isCellSelected(state, 3, "Make", cols)).to.be.false;
  });

  it("returns true for all rows in column mode", () => {
    const state = { anchor: { row: 0, col: "MSRP" }, end: { row: 999, col: "MSRP" }, mode: "column" };
    expect(isCellSelected(state, 50, "MSRP", cols)).to.be.true;
  });

  it("returns false when selection is null", () => {
    const state = { anchor: null, end: null, mode: null };
    expect(isCellSelected(state, 0, "Make", cols)).to.be.false;
  });
});
```

#### Test: `csvQuote`

```ts
describe("csvQuote", () => {
  it("returns plain value when no special characters", () => {
    expect(csvQuote("hello")).to.equal("hello");
  });

  it("wraps in double quotes when value contains comma", () => {
    expect(csvQuote("a,b")).to.equal('"a,b"');
  });

  it("wraps and escapes embedded double quotes", () => {
    expect(csvQuote('say "hi"')).to.equal('"say ""hi"""');
  });

  it("wraps when value contains newline", () => {
    expect(csvQuote("line1\nline2")).to.equal('"line1\nline2"');
  });

  it("handles empty string", () => {
    expect(csvQuote("")).to.equal("");
  });
});
```

#### Test: `getSelectedDataAsCSV`

```ts
describe("getSelectedDataAsCSV", () => {
  // Use a mock GridApi that returns row data by index
  const makeApi = (data: Record<string, string>[]) => ({
    getDisplayedRowAtIndex: (i: number) =>
      i < data.length ? { data: data[i] } : null,
  });

  const allColumns = ["#", "Make", "Model", "MSRP"];

  it("single cell: returns header + one value", () => {
    const api = makeApi([
      { "#": "1", Make: "Acura", Model: "MDX", MSRP: "36945" },
    ]);
    const state = { anchor: { row: 0, col: "Make" }, end: { row: 0, col: "Make" }, mode: "cell" };
    const csv = getSelectedDataAsCSV(state, api, allColumns);
    expect(csv).to.equal("Make\nAcura");
  });

  it("range: returns header + rectangular data", () => {
    const api = makeApi([
      { "#": "1", Make: "Acura", Model: "MDX", MSRP: "36945" },
      { "#": "2", Make: "BMW", Model: "X5", MSRP: "54200" },
    ]);
    const state = { anchor: { row: 0, col: "Make" }, end: { row: 1, col: "Model" }, mode: "range" };
    const csv = getSelectedDataAsCSV(state, api, allColumns);
    expect(csv).to.equal("Make,Model\nAcura,MDX\nBMW,X5");
  });

  it("row mode: includes all data columns (excludes '#')", () => {
    const api = makeApi([
      { "#": "1", Make: "Acura", Model: "MDX", MSRP: "36945" },
    ]);
    const state = { anchor: { row: 0, col: "#" }, end: { row: 0, col: "#" }, mode: "row" };
    const csv = getSelectedDataAsCSV(state, api, allColumns);
    expect(csv).to.equal("Make,Model,MSRP\nAcura,MDX,36945");
  });

  it("skips rows with no data (not loaded)", () => {
    const api = makeApi([
      { "#": "1", Make: "Acura", Model: "MDX", MSRP: "36945" },
    ]);
    // Selecting rows 0-2 but only row 0 has data
    const state = { anchor: { row: 0, col: "Make" }, end: { row: 2, col: "Make" }, mode: "range" };
    const csv = getSelectedDataAsCSV(state, api, allColumns);
    expect(csv).to.equal("Make\nAcura");
  });

  it("quotes values containing commas", () => {
    const api = makeApi([
      { "#": "1", Make: "Acura", Model: "RSX Type S, 2dr", MSRP: "23820" },
    ]);
    const state = { anchor: { row: 0, col: "Model" }, end: { row: 0, col: "Model" }, mode: "cell" };
    const csv = getSelectedDataAsCSV(state, api, allColumns);
    expect(csv).to.equal('Model\n"RSX Type S, 2dr"');
  });
});
```

### Manual Test Scenarios (F5 Launch)

| # | Scenario | Steps | Expected |
|---|----------|-------|----------|
| M1.1 | Single cell click | Click any data cell | Cell highlights with selection color; previous selection clears |
| M1.2 | Shift+click range | Click cell A, Shift+click cell B | Rectangular region from A to B highlights |
| M1.3 | Row selection | Click the `#` (row number) column | Entire row highlights |
| M1.4 | Row range selection | Click `#` on row 3, Shift+click `#` on row 7 | Rows 3–7 highlight |
| M1.5 | Column selection | Click a column header name | Entire column (loaded rows) highlights |
| M1.6 | Copy single cell | Select cell → Ctrl/Cmd+C → Paste in text editor | Header + cell value in CSV format |
| M1.7 | Copy range | Select 3×2 range → Ctrl/Cmd+C → Paste | CSV with header row + 3 data rows × 2 columns |
| M1.8 | Copy row | Select row → Ctrl/Cmd+C → Paste | All column headers + row data |
| M1.9 | Escape clears | Select range → press Escape | Highlight clears |
| M1.10 | Click clears previous | Select range → click different cell | Only new cell selected |
| M1.11 | Scroll + selection | Select visible cell → scroll → Shift+click | Selection extends across scroll boundary (only loaded rows included in copy) |
| M1.12 | Dark/light theme | Switch VS Code theme | Selection highlight adapts to `--vscode-editor-selectionBackground` |

---

## Phase 2: Column Management Tab

### Unit Tests (`client/test/harness/columnManager.test.ts`)

The column manager has fuzzy search filtering logic that is pure.

#### Test: Column search filtering

```ts
describe("filterColumns (ColumnManager)", () => {
  const columns = [
    { name: "Make", type: "char", length: 13, label: "" },
    { name: "Model", type: "char", length: 40, label: "Vehicle Model" },
    { name: "MSRP", type: "num", length: 8, label: "Retail Price" },
    { name: "Invoice", type: "num", length: 8, label: "" },
    { name: "EngineSize", type: "num", length: 8, label: "Engine Size (L)" },
  ];

  it("returns all columns with empty query", () => {
    expect(filterColumns(columns, "")).to.have.length(5);
  });

  it("filters by name (case-insensitive)", () => {
    const result = filterColumns(columns, "msrp");
    expect(result).to.have.length(1);
    expect(result[0].name).to.equal("MSRP");
  });

  it("filters by partial name match", () => {
    const result = filterColumns(columns, "m");
    expect(result.map(c => c.name)).to.include.members(["Make", "Model", "MSRP"]);
  });

  it("filters by label", () => {
    const result = filterColumns(columns, "retail");
    expect(result).to.have.length(1);
    expect(result[0].name).to.equal("MSRP");
  });

  it("returns empty for no matches", () => {
    expect(filterColumns(columns, "xyz")).to.have.length(0);
  });
});
```

#### Test: Bulk visibility operations

```ts
describe("column visibility helpers", () => {
  const allCols = ["Make", "Model", "MSRP", "Invoice", "Weight"];

  it("selectAll: returns set with all columns", () => {
    const visible = new Set(["Make"]);
    const result = selectAllColumns(visible, allCols);
    expect([...result]).to.deep.equal(allCols);
  });

  it("deselectAll: returns empty set", () => {
    const visible = new Set(allCols);
    const result = deselectAllColumns(visible, allCols);
    expect(result.size).to.equal(0);
  });

  it("invertSelection: flips each column", () => {
    const visible = new Set(["Make", "MSRP"]);
    const result = invertSelection(visible, allCols);
    expect([...result].sort()).to.deep.equal(["Invoice", "Model", "Weight"]);
  });
});
```

### Manual Test Scenarios (F5 Launch)

| # | Scenario | Steps | Expected |
|---|----------|-------|----------|
| M2.1 | Tab bar renders | Open DataViewer | "Data" and "Columns" tabs visible; Data tab active |
| M2.2 | Switch to Columns tab | Click "Columns" tab | Grid hides; column list appears with all columns checked |
| M2.3 | Search columns | Type in search box | List filters in real-time |
| M2.4 | Toggle visibility | Uncheck "Invoice" → switch to Data tab | "Invoice" column hidden in grid |
| M2.5 | Select All | Click "Select All" button | All checkboxes checked |
| M2.6 | Deselect All | Click "Deselect All" | All checkboxes unchecked |
| M2.7 | Invert | Check Make + Model only → click Invert | Make + Model unchecked, all others checked |
| M2.8 | Copy column names | Click "Copy Selected" → Paste | Checked column names, newline-separated |
| M2.9 | Persistence | Hide columns → close DataViewer → reopen same table | Hidden columns remain hidden |
| M2.10 | Text selection | Select text in the column list with mouse | Text is selectable (no user-select: none) |
| M2.11 | Column details | Check column list entries | Each column shows name, type icon, length, format, informat, label |
| M2.12 | Search focus | Switch to Columns tab | Search input auto-focused |

---

## Phase 3: SQLite3 Editor Integration

### Unit Tests (`client/test/harness/sqliteExport.test.ts`)

`sqliteExport.ts` is a pure function with no VS Code dependency — ideal for `test-harness`.

#### Test: `escapeValue`

```ts
describe("escapeValue", () => {
  it("returns NULL for empty string", () => {
    expect(escapeValue("", "char")).to.equal("NULL");
  });

  it("returns NULL for SAS missing value '.'", () => {
    expect(escapeValue(".", "num")).to.equal("NULL");
  });

  it("returns number for numeric type", () => {
    expect(escapeValue("36945", "num")).to.equal("36945");
  });

  it("returns REAL representation for float type", () => {
    expect(escapeValue("3.14", "float")).to.equal("3.14");
  });

  it("returns NULL for non-numeric string with numeric type", () => {
    expect(escapeValue("abc", "num")).to.equal("NULL");
  });

  it("wraps char value in single quotes", () => {
    expect(escapeValue("Acura", "char")).to.equal("'Acura'");
  });

  it("escapes embedded single quotes", () => {
    expect(escapeValue("O'Brien", "char")).to.equal("'O''Brien'");
  });

  it("handles null/undefined", () => {
    expect(escapeValue(null, "char")).to.equal("NULL");
    expect(escapeValue(undefined, "char")).to.equal("NULL");
  });
});
```

#### Test: `mapSASTypeToSQLite`

```ts
describe("mapSASTypeToSQLite", () => {
  it("maps 'char' to TEXT", () => {
    expect(mapSASTypeToSQLite("char")).to.equal("TEXT");
  });

  it("maps 'num' to REAL", () => {
    expect(mapSASTypeToSQLite("num")).to.equal("REAL");
  });

  it("maps 'float' to REAL", () => {
    expect(mapSASTypeToSQLite("float")).to.equal("REAL");
  });

  it("defaults unknown types to TEXT", () => {
    expect(mapSASTypeToSQLite("date")).to.equal("TEXT");
    expect(mapSASTypeToSQLite("datetime")).to.equal("TEXT");
    expect(mapSASTypeToSQLite("")).to.equal("TEXT");
  });
});
```

#### Test: `generateSQLiteSQL`

```ts
describe("generateSQLiteSQL", () => {
  const columns = [
    { name: "Make", type: "char", length: 13 },
    { name: "MSRP", type: "num", length: 8 },
  ];

  it("generates valid CREATE TABLE statement", () => {
    const sql = generateSQLiteSQL({
      tableName: "WORK_CARS",
      columns,
      rows: [],
      includeDropTable: true,
    });
    expect(sql).to.include('DROP TABLE IF EXISTS "WORK_CARS"');
    expect(sql).to.include('CREATE TABLE "WORK_CARS"');
    expect(sql).to.include('"Make" TEXT');
    expect(sql).to.include('"MSRP" REAL');
  });

  it("omits DROP TABLE when includeDropTable is false", () => {
    const sql = generateSQLiteSQL({
      tableName: "WORK_CARS",
      columns,
      rows: [],
      includeDropTable: false,
    });
    expect(sql).not.to.include("DROP TABLE");
  });

  it("generates INSERT VALUES for rows", () => {
    const sql = generateSQLiteSQL({
      tableName: "WORK_CARS",
      columns,
      rows: [["Acura", "36945"], ["BMW", "54200"]],
      includeDropTable: true,
    });
    expect(sql).to.include("INSERT INTO");
    expect(sql).to.include("'Acura'");
    expect(sql).to.include("36945");
    expect(sql).to.include("'BMW'");
  });

  it("wraps in BEGIN TRANSACTION / COMMIT", () => {
    const sql = generateSQLiteSQL({
      tableName: "WORK_CARS",
      columns,
      rows: [["Acura", "36945"]],
      includeDropTable: true,
    });
    expect(sql).to.include("BEGIN TRANSACTION");
    expect(sql).to.include("COMMIT");
  });

  it("batches INSERT statements at 500 rows", () => {
    const rows = Array.from({ length: 750 }, (_, i) => [`Car${i}`, `${i}`]);
    const sql = generateSQLiteSQL({
      tableName: "WORK_CARS",
      columns,
      rows,
      includeDropTable: true,
    });
    const insertCount = (sql.match(/INSERT INTO/g) || []).length;
    expect(insertCount).to.equal(2); // 500 + 250
  });

  it("handles empty rows (CREATE TABLE only)", () => {
    const sql = generateSQLiteSQL({
      tableName: "WORK_CARS",
      columns,
      rows: [],
      includeDropTable: true,
    });
    expect(sql).to.include("CREATE TABLE");
    expect(sql).not.to.include("INSERT INTO");
    expect(sql).not.to.include("BEGIN TRANSACTION");
  });

  it("escapes table name with double quotes", () => {
    const sql = generateSQLiteSQL({
      tableName: 'MY "TABLE"',
      columns,
      rows: [],
      includeDropTable: true,
    });
    // Double quotes inside identifier should be escaped as ""
    expect(sql).to.include('"MY ""TABLE"""');
  });

  it("handles SAS missing values in numeric columns", () => {
    const sql = generateSQLiteSQL({
      tableName: "T",
      columns,
      rows: [["Acura", "."]],
      includeDropTable: false,
    });
    expect(sql).to.include("NULL");
  });

  it("includes comment header with table name and row count", () => {
    const sql = generateSQLiteSQL({
      tableName: "WORK_CARS",
      columns,
      rows: [["Acura", "36945"]],
      includeDropTable: true,
    });
    expect(sql).to.include("-- SAS Dataset: WORK_CARS");
    expect(sql).to.include("1 rows");
  });
});
```

### Manual Test Scenarios (F5 Launch)

| # | Scenario | Steps | Expected |
|---|----------|-------|----------|
| M3.1 | Copy SQLite SQL | Open DataViewer → run "Copy SQLite SQL" command | SQL copied to clipboard; info notification with row count |
| M3.2 | Paste SQL validity | Paste copied SQL into any text editor | Valid SQL: has CREATE TABLE, INSERT statements, proper quoting |
| M3.3 | Open in SQLite (installed) | Install SQLite3 Editor → run "Open in SQLite Editor" | In-memory DB opens; query editor with SQL appears; data visible in SQLite3 Editor |
| M3.4 | Open in SQLite (not installed) | Uninstall SQLite3 Editor → run "Open in SQLite Editor" | Prompt: "SQLite3 Editor extension is required. Install it?" |
| M3.5 | Large dataset warning | Open table with >50K rows → export | Warning message about large dataset |
| M3.6 | Numeric values | Export table with num/float columns | Numbers appear as unquoted values in SQL |
| M3.7 | Missing values | Export table with SAS missing values (`.`) | Missing values become NULL in SQL |
| M3.8 | Special characters | Export table with apostrophes in data | Apostrophes escaped as `''` in SQL |
| M3.9 | Filtered data | Apply WHERE filter → export | Only filtered rows exported |

---

## Running Tests

```bash
# All harness tests (includes new tests)
npm run test-harness

# Individual test files
npx cross-env TS_NODE_PROJECT=./client/tsconfig.json mocha -r ts-node/register client/test/harness/useSelection.test.ts
npx cross-env TS_NODE_PROJECT=./client/tsconfig.json mocha -r ts-node/register client/test/harness/columnManager.test.ts
npx cross-env TS_NODE_PROJECT=./client/tsconfig.json mocha -r ts-node/register client/test/harness/sqliteExport.test.ts

# Type-check (catches interface/import errors across all phases)
npx tsc -p client/tsconfig.json --noEmit
```

---

## Test File Summary

### New Test Files
| File | Phase | Tests |
|------|-------|-------|
| `client/test/harness/useSelection.test.ts` | 1 | `getColumnRange`, `getRowRange`, `isCellSelected`, `csvQuote`, `getSelectedDataAsCSV` |
| `client/test/harness/columnManager.test.ts` | 2 | `filterColumns`, bulk visibility helpers |
| `client/test/harness/sqliteExport.test.ts` | 3 | `escapeValue`, `mapSASTypeToSQLite`, `generateSQLiteSQL` |

### Testing Pattern

Following the established project convention (see `stripHtml.test.ts`, `OutputDatasetPanel.test.ts`):
- Pure helper functions are **duplicated** into the test file when the source module has VS Code/browser dependencies that prevent direct import
- Functions that can be exported from modules with no `vscode` import are imported directly (e.g., `sqliteExport.ts` is designed to have zero VS Code deps)
- Use `chai` (`expect`/`assert`) for assertions
- No mocking of VS Code API needed — all tested functions are pure
