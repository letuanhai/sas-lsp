// Copyright © 2024, SAS Institute Inc., Cary, NC, USA.  All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
import { Uri, commands } from "vscode";

import * as path from "path";

import LibraryModel from "../../components/LibraryNavigator/LibraryModel";
import { LibraryItem } from "../../components/LibraryNavigator/types";
import StudioWebLibraryAdapter from "./StudioWebLibraryAdapter";

let librefCounter = 0;

/**
 * Opens a .sas7bdat file from the server file system in the data viewer
 * by assigning a temporary SAS library pointing to the file's directory.
 */
export async function openSas7bdatAsDataViewer(fileUri: Uri): Promise<void> {
  const filePath = fileUri.path;
  const tableName = path.basename(filePath, ".sas7bdat");
  const dirPath = path.dirname(filePath);

  // Generate a short unique libref: _FV0 .. _FV9999
  const libref = `_FV${librefCounter++ % 10000}`;

  const adapter = new StudioWebLibraryAdapter();
  await adapter.assignTempLibrary(libref, dirPath);

  const item: LibraryItem = {
    uid: `${libref}.${tableName}`,
    id: tableName,
    name: tableName,
    library: libref,
    type: "table",
    readOnly: false,
  };

  const model = new LibraryModel(adapter);
  await commands.executeCommand(
    "SAS.viewTable",
    item,
    model.getTableResultSet(item),
    () => model.fetchColumns(item),
    () => model.getTableRowCount(item),
  );
}
