// Copyright © 2023, SAS Institute Inc., Cary, NC, USA.  All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
import { useCallback, useEffect } from "react";
import { createRoot } from "react-dom/client";

import { AgGridReact } from "ag-grid-react";

import ".";
import ColumnMenu from "./ColumnMenu";
import TableFilter from "./TableFilter";
import localize from "./localize";
import useDataViewer from "./useDataViewer";
import useTheme from "./useTheme";

import "./DataViewer.css";
import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-alpine.css";

const gridStyles = {
  "--ag-borders": "none",
  "--ag-row-border-width": "0px",
  flex: "1",
  width: "100%",
  minHeight: 0,
};

const DataViewer = () => {
  const title = document
    .querySelector("[data-title]")
    .getAttribute("data-title");
  const theme = useTheme();
  const {
    columnMenu,
    columns,
    dismissMenu,
    gridRef,
    onGridReady,
    refreshResults,
    totalRowCount,
    totalColumnCount,
    viewProperties,
  } = useDataViewer();

  const handleKeydown = useCallback(
    (event) => {
      if (event.key === "Escape" && columnMenu) {
        dismissMenu();
      }
    },
    [columnMenu, dismissMenu],
  );
  const dismissMenuWithoutFocus = useCallback(
    () => dismissMenu(false),
    [dismissMenu],
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeydown);
    window.addEventListener("blur", dismissMenuWithoutFocus);
    return () => {
      document.removeEventListener("keydown", handleKeydown);
      window.removeEventListener("blur", dismissMenuWithoutFocus);
    };
  }, [handleKeydown, dismissMenuWithoutFocus]);

  if (columns.length === 0) {
    return null;
  }

  return (
    <div className="data-viewer">
      <h1>{title}</h1>
      {(totalRowCount !== undefined || totalColumnCount !== undefined) && (
        <div className="row-count-bar">
          <span className="row-count">
            {[
              totalRowCount !== undefined ? `${totalRowCount} rows` : undefined,
              totalColumnCount !== undefined
                ? `${totalColumnCount} columns`
                : undefined,
            ]
              .filter(Boolean)
              .join(", ")}
          </span>
        </div>
      )}
      <TableFilter
        onCommit={(value) => {
          refreshResults({ filterValue: value });
        }}
        initialValue={viewProperties()?.query?.filterValue ?? ""}
      />
      {columnMenu && <ColumnMenu {...columnMenu} />}
      <div
        className={`ag-grid-wrapper ${theme}`}
        style={gridStyles}
        onClick={() => columnMenu && dismissMenuWithoutFocus()}
      >
        <AgGridReact
          ref={gridRef}
          cacheBlockSize={100}
          columnDefs={columns}
          defaultColDef={{
            sortable: true,
          }}
          maintainColumnOrder
          infiniteInitialRowCount={100}
          maxBlocksInCache={10}
          onGridReady={onGridReady}
          rowModelType="infinite"
          theme="legacy"
          noRowsOverlayComponent={() =>
            localize("No data matches the current filters.")
          }
        />
      </div>
    </div>
  );
};

const root = createRoot(document.querySelector(".data-viewer-container"));
root.render(<DataViewer />);
