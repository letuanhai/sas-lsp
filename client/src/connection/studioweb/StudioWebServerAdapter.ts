// Copyright © 2024, SAS Institute Inc., Cary, NC, USA.  All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
import { FileType, Uri } from "vscode";

import {
  SAS_SERVER_ROOT_FOLDER,
  SAS_SERVER_ROOT_FOLDERS,
  SERVER_FOLDER_ID,
} from "../../components/ContentNavigator/const";
import {
  ContentAdapter,
  ContentItem,
  RootFolderMap,
} from "../../components/ContentNavigator/types";
import {
  ContextMenuAction,
  ContextMenuProvider,
  convertStaticFolderToContentItem,
  createStaticFolder,
  homeDirectoryNameAndType,
  sortedContentItems,
} from "../../components/ContentNavigator/utils";
import { ProfileWithFileRootOptions } from "../../components/profile";
import { getResourceId, getSasServerUri } from "../rest/util";
import { ensureCredentials } from "./index";
import { getAxios, getCredentials } from "./state";

/**
 * Encode a filesystem path using SAS Studio's tilde notation for directory listing.
 * `/` → `~ps~`, `.` → `~dot~` (no trailing tilde for directories).
 * Example: `/folders/myfolders` → `~ps~folders~ps~myfolders`
 */
function encodeDirectoryPath(dirPath: string): string {
  return dirPath.replace(/\./g, "~dot~").replace(/\//g, "~ps~");
}

interface WorkspaceEntry {
  name: string;
  uri?: string;
  path?: string;
  type?: string; // "file" | "directory" | "dir"
  isDirectory?: boolean;
  category?: number; // 0 = directory, 1+ = file
  modifiedTimeStamp?: string | number;
  modifiedDate?: number; // Unix timestamp in milliseconds (from SAS Studio 3.8 API)
  creationTimeStamp?: string | number;
  size?: number | string; // Can be number or "166 bytes" string
  parentFolderUri?: string;
  uriParent?: string;
  haveChildren?: boolean;
}

class StudioWebServerAdapter implements ContentAdapter {
  private rootFolders: RootFolderMap;
  private contextMenuProvider: ContextMenuProvider;

  public constructor(
    protected readonly fileNavigationCustomRootPath: ProfileWithFileRootOptions["fileNavigationCustomRootPath"],
    protected readonly fileNavigationRoot: ProfileWithFileRootOptions["fileNavigationRoot"],
  ) {
    this.rootFolders = {};
    this.contextMenuProvider = new ContextMenuProvider(
      [
        ContextMenuAction.CreateChild,
        ContextMenuAction.Delete,
        ContextMenuAction.Update,
        ContextMenuAction.CopyPath,
        ContextMenuAction.AllowDownload,
      ],
      {
        [ContextMenuAction.CopyPath]: (item) => item.id !== SERVER_FOLDER_ID,
      },
    );
  }

  /* Favorites / flow operations – not applicable to SAS Server */
  public async addChildItem(): Promise<boolean> {
    throw new Error("Method not implemented");
  }
  public async addItemToFavorites(): Promise<boolean> {
    throw new Error("Method not implemented");
  }
  public removeItemFromFavorites(): Promise<boolean> {
    throw new Error("Method not implemented");
  }
  public getRootFolder(): ContentItem | undefined {
    return undefined;
  }

  public async connect(_baseUrl: string): Promise<void> {
    // no-op: credentials are managed by StudioWebSession via state.ts
  }

  public connected(): boolean {
    return true;
  }

  public async getFolderPathForItem(): Promise<string> {
    return "";
  }

  public async getRootItems(): Promise<RootFolderMap> {
    for (let index = 0; index < SAS_SERVER_ROOT_FOLDERS.length; ++index) {
      const delegateFolderName = SAS_SERVER_ROOT_FOLDERS[index];
      this.rootFolders[delegateFolderName] = {
        uid: `${index}`,
        ...convertStaticFolderToContentItem(SAS_SERVER_ROOT_FOLDER, {
          write: false,
          delete: false,
          addMember: false,
        }),
      };
    }
    return this.rootFolders;
  }

  public async getChildItems(parentItem: ContentItem): Promise<ContentItem[]> {
    console.log("[StudioWeb] getChildItems called for id:", parentItem.id, "uri:", parentItem.uri);
    if (!(await ensureCredentials())) {
      console.warn("[StudioWeb] getChildItems: ensureCredentials returned false");
      return [];
    }
    const axios = getAxios();
    const creds = getCredentials();
    if (!axios || !creds) {
      console.warn("[StudioWeb] getChildItems: no axios or creds");
      return [];
    }
    console.log("[StudioWeb] getChildItems: sessionId =", creds.sessionId, "baseURL =", axios.defaults.baseURL);

    // Root folder: fetch the home/starting directory entry
    if (parentItem.id === SERVER_FOLDER_ID) {
      try {
        const rootUrl = `/${creds.sessionId}/_root_`;
        console.log("[StudioWeb] getChildItems(_root_) GET", rootUrl);
        const response = await axios.get(rootUrl);
        console.log(
          "[StudioWeb] getChildItems(_root_) status:",
          response.status,
          "data:",
          JSON.stringify(response.data),
        );
        const data = response.data;

        // Per SASStudio-FileOperations-API.md, _root_ returns:
        // { id: "_root_", name: "...", isDirectory: true, uri: "/", children: [...] }
        // The children array contains top-level items like "My Folders", "Folder Shortcuts"
        const children: WorkspaceEntry[] = Array.isArray(data?.children)
          ? data.children
          : [];

        if (children.length === 0) {
          // Fallback: create a home folder pointing to root
          const [homeName, homeType] = homeDirectoryNameAndType(
            this.fileNavigationRoot,
            this.fileNavigationCustomRootPath,
          );

          const homeFolder = convertStaticFolderToContentItem(
            createStaticFolder("/", homeName, homeType, "/", "getDirectoryMembers"),
            { write: false, delete: false, addMember: true },
          );
          homeFolder.contextValue =
            this.contextMenuProvider.availableActions(homeFolder);
          return [homeFolder];
        }

        // Convert each root child (e.g., "My Folders", "Folder Shortcuts") to a ContentItem
        const childItems = children
          .filter((e) => e.name)
          .map((entry) => {
            const isDir = entry.isDirectory === true;
            const uri = entry.uri ?? `/${entry.name}`;
            return this.convertEntryToContentItem(
              { ...entry, uri, isDirectory: isDir },
              "/",
            );
          });

        return sortedContentItems(childItems);
      } catch (error) {
        console.error("StudioWebServerAdapter.getChildItems(_root_) error:", error);
        return [];
      }
    }

    // For normal folders, list their children via workspace API
    try {
      // Find the "getDirectoryMembers" link URI, which holds the directory path
      const dirLink = parentItem.links?.find(
        (l) => l.rel === "getDirectoryMembers",
      );
      const dirPath = dirLink?.uri ?? parentItem.uri;
      const dirUrl = `/${creds.sessionId}/${encodeDirectoryPath(dirPath)}`;
      console.log(
        "[StudioWeb] getChildItems GET",
        dirUrl,
        "(dirPath:",
        dirPath,
        ")",
      );

      const response = await axios.get(dirUrl);
      console.log(
        "[StudioWeb] getChildItems status:",
        response.status,
        "data:",
        JSON.stringify(response.data),
      );

      const data = response.data;
      // Per SASStudio-FileOperations-API.md, folder response includes a `children` array
      const entries: WorkspaceEntry[] = Array.isArray(data?.children)
        ? data.children
        : Array.isArray(data)
          ? data
          : data?.items
            ? data.items
            : [];
      console.log("[StudioWeb] getChildItems entries count:", entries.length);

      const childItems = entries
        .filter((e) => e.name) // skip unnamed entries
        .map((entry) => {
          // The entry.uri from API is the full path; use it directly
          const uri = entry.uri ?? `${dirPath}/${entry.name}`;
          return this.convertEntryToContentItem({ ...entry, uri }, dirPath);
        });

      return sortedContentItems(childItems);
    } catch (error) {
      console.error(
        "[StudioWeb] getChildItems error for",
        parentItem.uri,
        error,
      );
      return [];
    }
  }

  private convertEntryToContentItem(
    entry: WorkspaceEntry,
    parentPath: string,
  ): ContentItem {
    const isDir =
      entry.isDirectory === true ||
      entry.category === 0 ||
      entry.type === "directory" ||
      entry.type === "dir";

    const fileType = isDir ? FileType.Directory : FileType.File;
    const name = entry.name ?? "";

    // Build the full path
    const uri =
      entry.uri ??
      entry.path ??
      (parentPath.endsWith("/")
        ? `${parentPath}${name}`
        : `${parentPath}/${name}`);

    // SAS Studio 3.8 uses modifiedDate (timestamp in ms), fallback to modifiedTimeStamp
    const modifiedTimeStamp =
      entry.modifiedDate ??
      (entry.modifiedTimeStamp
        ? typeof entry.modifiedTimeStamp === "number"
          ? entry.modifiedTimeStamp
          : new Date(String(entry.modifiedTimeStamp).replace(/[^0-9]/g, "")).getTime() || 0
        : 0);

    const creationTimeStamp = entry.creationTimeStamp
      ? typeof entry.creationTimeStamp === "number"
        ? entry.creationTimeStamp
        : new Date(String(entry.creationTimeStamp)).getTime() || 0
      : 0;

    const links = [
      isDir && {
        method: "GET",
        rel: "getDirectoryMembers",
        href: uri,
        uri: uri,
        type: "GET",
      },
      { method: "GET", rel: "self", href: uri, uri: uri, type: "GET" },
    ].filter(Boolean) as ContentItem["links"];

    const item: ContentItem = {
      id: uri,
      uri,
      name,
      creationTimeStamp,
      modifiedTimeStamp,
      links,
      parentFolderUri: entry.parentFolderUri ?? entry.uriParent ?? parentPath,
      permission: {
        write: true,
        delete: true,
        addMember: isDir,
      },
      type: "",
      fileStat: {
        ctime: 0,
        mtime: modifiedTimeStamp,
        size:
          typeof entry.size === "number"
            ? entry.size
            : typeof entry.size === "string"
              ? parseInt(entry.size, 10) || 0
              : 0,
        type: fileType,
      },
    };

    return {
      ...item,
      contextValue: this.contextMenuProvider.availableActions(item),
      vscUri: getSasServerUri(item, false),
    };
  }

  public async getContentOfItem(item: ContentItem): Promise<string> {
    const axios = getAxios();
    const creds = getCredentials();
    if (!axios || !creds) {
      return "";
    }

    try {
      // Per SASStudio-FileOperations-API.md line 225-235:
      // GET /sasexec/sessions/{sessionId}/workspace/{filePath}
      const response = await axios.get(
        `/sessions/${creds.sessionId}/workspace${item.uri}`,
        {
          responseType: "text",
          transformResponse: [(data) => data],
        },
      );
      return String(response.data ?? "");
    } catch (error) {
      console.error("StudioWebServerAdapter.getContentOfItem error:", error);
      return "";
    }
  }

  public async getContentOfUri(uri: Uri): Promise<string> {
    const path = getResourceId(uri);
    const item = await this.getItemAtPath(path);
    return (await this.getContentOfItem(item)) || "";
  }

  public async getItemOfUri(uri: Uri): Promise<ContentItem> {
    const path = getResourceId(uri);
    return this.getItemAtPath(path);
  }

  public async updateContentOfItem(uri: Uri, content: string): Promise<void> {
    const axios = getAxios();
    const creds = getCredentials();
    if (!axios || !creds) {
      return;
    }

    try {
      const path = getResourceId(uri);
      await axios.post(
        `/sessions/${creds.sessionId}/workspace/~~ds~~${path}`,
        content,
        {
          params: { ct: "text/plain;charset=UTF-8" },
          headers: { "Content-Type": "text/plain;charset=UTF-8" },
        },
      );
    } catch (error) {
      console.error("StudioWebServerAdapter.updateContentOfItem error:", error);
    }
  }

  public async deleteItem(item: ContentItem): Promise<boolean> {
    const axios = getAxios();
    const creds = getCredentials();
    if (!axios || !creds) {
      return false;
    }

    try {
      await axios.delete(
        `/sessions/${creds.sessionId}/workspace/~~ds~~${item.uri}`,
      );
      return true;
    } catch (error) {
      console.error("StudioWebServerAdapter.deleteItem error:", error);
      return false;
    }
  }

  public async createNewItem(
    parentItem: ContentItem,
    fileName: string,
    buffer?: ArrayBufferLike,
  ): Promise<ContentItem | undefined> {
    const axios = getAxios();
    const creds = getCredentials();
    if (!axios || !creds) {
      return undefined;
    }

    try {
      const parentPath = parentItem.uri;
      const filePath = parentPath.endsWith("/")
        ? `${parentPath}${fileName}`
        : `${parentPath}/${fileName}`;

      const content = buffer ? Buffer.from(buffer).toString() : "";
      await axios.post(
        `/sessions/${creds.sessionId}/workspace/~~ds~~${filePath}`,
        content,
        {
          params: { ct: "text/plain;charset=UTF-8" },
          headers: { "Content-Type": "text/plain;charset=UTF-8" },
        },
      );

      return this.convertEntryToContentItem(
        { name: fileName, uri: filePath, isDirectory: false },
        parentPath,
      );
    } catch (error) {
      console.error("StudioWebServerAdapter.createNewItem error:", error);
      return undefined;
    }
  }

  public async createNewFolder(
    parentItem: ContentItem,
    folderName: string,
  ): Promise<ContentItem | undefined> {
    const axios = getAxios();
    const creds = getCredentials();
    if (!axios || !creds) {
      return undefined;
    }

    try {
      const parentPath = parentItem.uri;
      const folderPath = parentPath.endsWith("/")
        ? `${parentPath}${folderName}`
        : `${parentPath}/${folderName}`;

      // Create directory by POSTing with a trailing slash
      await axios.post(
        `/sessions/${creds.sessionId}/workspace/~~ds~~${folderPath}/`,
        "",
        {
          params: { ct: "text/plain;charset=UTF-8" },
          headers: { "Content-Type": "text/plain;charset=UTF-8" },
        },
      );

      return this.convertEntryToContentItem(
        { name: folderName, uri: folderPath, isDirectory: true },
        parentPath,
      );
    } catch (error) {
      console.error("StudioWebServerAdapter.createNewFolder error:", error);
      return undefined;
    }
  }

  public async renameItem(
    _item: ContentItem,
    _newName: string,
  ): Promise<ContentItem | undefined> {
    // Rename is not directly supported by the Studio Web workspace API
    return undefined;
  }

  public async moveItem(
    _item: ContentItem,
    _targetParentFolderUri: string,
  ): Promise<Uri | undefined> {
    // Move is not directly supported by the Studio Web workspace API
    return undefined;
  }

  public async getParentOfItem(
    item: ContentItem,
  ): Promise<ContentItem | undefined> {
    if (!item.parentFolderUri) {
      return undefined;
    }
    try {
      return await this.getItemAtPath(item.parentFolderUri);
    } catch {
      return undefined;
    }
  }

  public async getPathOfItem(item: ContentItem): Promise<string> {
    return item.uri;
  }

  public async getUriOfItem(item: ContentItem): Promise<Uri> {
    return item.vscUri;
  }

  /** Retrieve a ContentItem for a given filesystem path. */
  private async getItemAtPath(path: string): Promise<ContentItem> {
    // Derive parent path and name from the path
    const normalised = path.replace(/\/$/, "");
    const lastSlash = normalised.lastIndexOf("/");
    const name = lastSlash >= 0 ? normalised.slice(lastSlash + 1) : normalised;
    const parentPath = lastSlash > 0 ? normalised.slice(0, lastSlash) : "/";

    return this.convertEntryToContentItem(
      { name, uri: path, isDirectory: false },
      parentPath,
    );
  }
}

export default StudioWebServerAdapter;
