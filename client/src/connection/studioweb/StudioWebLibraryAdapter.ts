// Copyright © 2024, SAS Institute Inc., Cary, NC, USA.  All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
import type { SortModelItem } from "ag-grid-community";

import {
  LibraryAdapter,
  LibraryItem,
  TableData,
  TableQuery,
  TableRow,
} from "../../components/LibraryNavigator/types";
import { ColumnCollection, TableInfo } from "../rest/api/compute";
import { getColumnIconType } from "../util";
import { ensureCredentials } from "./index";
import { getAxios, getCredentials } from "./state";

class StudioWebLibraryAdapter implements LibraryAdapter {
  public async connect(): Promise<void> {
    // no-op: session is handled by StudioWebSession
  }

  public async setup(): Promise<void> {
    // no-op
  }

  public async getLibraries(): Promise<{ items: LibraryItem[]; count: number }> {
    if (!(await ensureCredentials())) {
      return { items: [], count: 0 };
    }
    const axios = getAxios();
    const creds = getCredentials();
    if (!axios || !creds) {
      return { items: [], count: 0 };
    }

    try {
      const response = await axios.get(
        `/libdata/${creds.sessionId}/libraries`,
      );
      const rawItems: Array<Record<string, unknown>> =
        response.data?.items ?? [];

      const libraries: LibraryItem[] = rawItems.map((entry) => {
        const libref = String(entry.libref ?? "");
        const readOnlyRaw = entry.readOnly;
        const readOnly =
          readOnlyRaw === true ||
          String(readOnlyRaw).toLowerCase() === "yes";
        return {
          type: "library",
          uid: libref,
          id: libref,
          name: libref,
          readOnly,
        };
      });

      return { items: libraries, count: -1 };
    } catch (error) {
      console.error("StudioWebLibraryAdapter.getLibraries error:", error);
      return { items: [], count: 0 };
    }
  }

  public async getTables(
    item: LibraryItem,
  ): Promise<{ items: LibraryItem[]; count: number }> {
    const axios = getAxios();
    const creds = getCredentials();
    if (!axios || !creds) {
      return { items: [], count: 0 };
    }

    try {
      const response = await axios.get(
        `/libdata/${creds.sessionId}/libraries~${item.name}`,
      );
      const rawItems: Array<Record<string, unknown>> =
        response.data?.items ?? [];

      const tables: LibraryItem[] = rawItems.map((entry) => {
        const tableName = String(entry.member ?? "");
        return {
          type: "table",
          uid: `${item.name}.${tableName}`,
          id: tableName,
          name: tableName,
          library: item.name,
          readOnly: item.readOnly,
        };
      });

      return { items: tables, count: -1 };
    } catch (error) {
      console.error("StudioWebLibraryAdapter.getTables error:", error);
      return { items: [], count: 0 };
    }
  }

  public async getColumns(item: LibraryItem): Promise<ColumnCollection> {
    const axios = getAxios();
    const creds = getCredentials();
    if (!axios || !creds) {
      return { items: [], count: -1 };
    }

    try {
      const response = await axios.post(
        `/sessions/${creds.sessionId}/tables/${item.library}/${item.name}/`,
        {
          isMultipleWorkspace: "",
          serverName: "",
          dataSetKey: "",
          clearCache: "false",
        },
        {
          params: { getViewColumnCount: "true" },
          headers: { "Content-Type": "application/json" },
        },
      );

      const rawColumns: Array<Record<string, unknown>> =
        response.data?.items ??
        response.data?.columns ??
        [];

      const columns = rawColumns.map((col, index) => ({
        index,
        id: String(col.id ?? col.name ?? ""),
        name: String(col.name ?? ""),
        label: String(col.label ?? ""),
        type: String(col.type ?? "char"),
        length: Number(col.length ?? 0),
        format: col.format ?? { name: "", width: 0, precision: 0 },
        informat: col.informat ?? { name: "", width: 0, precision: 0 },
        // Compute the icon type using the shared utility
        // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
        ...(() => {
          const iconType = getColumnIconType({
            index,
            type: String(col.type ?? "char"),
            name: String(col.name ?? ""),
            format: String(
              (col.format as Record<string, unknown>)?.name ?? col.format ?? "",
            ),
          });
          return { type: iconType };
        })(),
      }));

      return { items: columns, count: -1 };
    } catch (error) {
      console.error("StudioWebLibraryAdapter.getColumns error:", error);
      return { items: [], count: -1 };
    }
  }

  public async getRows(
    item: LibraryItem,
    start: number,
    limit: number,
    sortModel: SortModelItem[],
    query: TableQuery | undefined,
  ): Promise<TableData> {
    const axios = getAxios();
    const creds = getCredentials();
    if (!axios || !creds) {
      return { rows: [], count: 0 };
    }

    try {
      const lib = item.library ?? item.name;
      const table = item.name;

      // Build dataset options for firstobs/obs
      const datasetOptions = `firstobs=${start + 1} obs=${start + limit}`;

      // Build WHERE clause
      let whereClause = "";
      if (query?.filterValue) {
        // We filter across all columns with a CONTAINS predicate via a subquery;
        // simpler approach: wrap in a generated where on a text search isn't easily
        // done without column names, so we rely on the caller to pass a SQL-valid
        // filter string, or we skip if complex. Use CONTAINS on the filter value.
        whereClause = `where (${query.filterValue})`;
      }

      // Build ORDER BY clause
      let orderByClause = "";
      if (sortModel.length > 0) {
        const sortString = sortModel
          .map((col) => `${col.colId} ${col.sort ?? "asc"}`)
          .join(", ");
        orderByClause = `order by ${sortString}`;
      }

      // When sort/filter is present we need a wrapping select because
      // dataset options (firstobs/obs) interact with ORDER BY unpredictably.
      // Use a clean outer select for simplicity.
      let sql: string;
      if (whereClause || orderByClause) {
        sql = `select * from (select * from ${lib}.'${table}'n(${datasetOptions})) ${whereClause} ${orderByClause}`.trim();
      } else {
        sql = `select * from ${lib}.'${table}'n(${datasetOptions})`;
      }

      const response = await axios.post(
        `/sessions/${creds.sessionId}/sql`,
        sql,
        {
          params: { numobs: limit + 1 },
          headers: { "Content-Type": "application/json" },
        },
      );

      const rawRows: string[][] = response.data?.rows ?? [];
      const count: number = response.data?.count ?? rawRows.length;

      const rows: TableRow[] = rawRows.map(
        (rowValues, idx): TableRow => ({
          cells: [`${start + idx + 1}`, ...rowValues],
        }),
      );

      return { rows, count };
    } catch (error) {
      console.error("StudioWebLibraryAdapter.getRows error:", error);
      return { rows: [], count: 0 };
    }
  }

  public async getRowsAsCSV(
    item: LibraryItem,
    start: number,
    limit: number,
  ): Promise<TableData> {
    // Only prepend column headers on the first page
    const columnHeader =
      start === 0
        ? {
            columns: ["INDEX"].concat(
              (await this.getColumns(item)).items.map((col) => col.name ?? ""),
            ),
          }
        : {};

    const { rows } = await this.getRows(item, start, limit, [], undefined);
    rows.unshift(columnHeader);

    // CSV export does not rely on count; row count is obtained via getTableRowCount
    return { rows, count: -1 };
  }

  public async getTableRowCount(
    item: LibraryItem,
  ): Promise<{ rowCount: number; maxNumberOfRowsToRead: number }> {
    const axios = getAxios();
    const creds = getCredentials();
    if (!axios || !creds) {
      return { rowCount: 0, maxNumberOfRowsToRead: 100 };
    }

    try {
      const lib = item.library ?? item.name;
      const table = item.name;
      const sql = `select count(*) as N from ${lib}.'${table}'n`;

      const response = await axios.post(
        `/sessions/${creds.sessionId}/sql`,
        sql,
        {
          headers: { "Content-Type": "application/json" },
        },
      );

      const rows: string[][] = response.data?.rows ?? [];
      const rowCount = rows[0]?.[0] !== undefined ? parseInt(String(rows[0][0]), 10) : 0;

      return { rowCount: isNaN(rowCount) ? 0 : rowCount, maxNumberOfRowsToRead: 100 };
    } catch (error) {
      console.error("StudioWebLibraryAdapter.getTableRowCount error:", error);
      return { rowCount: 0, maxNumberOfRowsToRead: 100 };
    }
  }

  public async deleteTable(item: LibraryItem): Promise<void> {
    const axios = getAxios();
    const creds = getCredentials();
    if (!axios || !creds) {
      return;
    }

    try {
      const code = `proc datasets library=${item.library} nolist nodetails; delete ${item.name}; run; quit;`;

      // Submit code asynchronously
      const submitResponse = await axios.post(
        `/sessions/${creds.sessionId}/asyncSubmissions`,
        code,
        { headers: { "Content-Type": "application/json" } },
      );

      const submissionId: string =
        submitResponse.data?.id ?? submitResponse.data?.submissionId ?? "";

      if (!submissionId) {
        // Fall back: try synchronous submission if async is not available
        console.warn(
          "StudioWebLibraryAdapter.deleteTable: no submissionId returned, skipping poll",
        );
        return;
      }

      // Poll until complete
      await this.pollUntilComplete(creds.sessionId, submissionId);
    } catch (error) {
      console.error("StudioWebLibraryAdapter.deleteTable error:", error);
      throw error;
    }
  }

  private async pollUntilComplete(
    sessionId: string,
    _submissionId: string,
  ): Promise<void> {
    const axios = getAxios();
    if (!axios) {
      return;
    }

    const maxAttempts = 60;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const response = await axios.get(
          `/sessions/${sessionId}/messages/longpoll`,
        );
        const messages: Array<Record<string, unknown>> =
          response.data ?? [];

        if (!Array.isArray(messages) || messages.length === 0) {
          // Empty array indicates completion
          return;
        }

        const isDone = messages.some(
          (msg) =>
            msg.type === "SubmitComplete" ||
            msg.event === "SubmitComplete" ||
            msg.type === "complete",
        );

        if (isDone) {
          return;
        }
        // Continue polling
      } catch (error) {
        console.warn("StudioWebLibraryAdapter.pollUntilComplete error:", error);
        return;
      }
    }
  }

  public async getTableInfo(item: LibraryItem): Promise<TableInfo> {
    const basicInfo: TableInfo = {
      bookmarkLength: 0,
      columnCount: 0,
      compressionRoutine: "",
      creationTimeStamp: "",
      encoding: "",
      engine: "",
      extendedType: "",
      label: "",
      libref: item.library,
      logicalRecordCount: 0,
      modifiedTimeStamp: "",
      name: item.name,
      physicalRecordCount: 0,
      recordLength: 0,
      rowCount: 0,
      type: "DATA",
    };

    try {
      const { rowCount } = await this.getTableRowCount(item);
      return {
        ...basicInfo,
        rowCount,
        logicalRecordCount: rowCount,
        physicalRecordCount: rowCount,
      };
    } catch (error) {
      console.warn("StudioWebLibraryAdapter.getTableInfo error:", error);
      return basicInfo;
    }
  }
}

export default StudioWebLibraryAdapter;
