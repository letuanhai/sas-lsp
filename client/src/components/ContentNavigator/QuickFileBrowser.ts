// Copyright © 2023, SAS Institute Inc., Cary, NC, USA.  All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
import { QuickInputButton, ThemeIcon, Uri, commands, window } from "vscode";

// Module-level active item — lets the keybinding command (`SAS.server.quickBrowseReveal`)
// read which file/folder is currently highlighted in the QuickPick.
let _activeItem: ContentItem | undefined;
export function getActiveItem(): ContentItem | undefined {
  return _activeItem;
}

// Button shown on each file/folder item — clicking it reveals the item in the
// SAS sidebar file tree without closing the QuickPick.
const REVEAL_BUTTON: QuickInputButton = {
  iconPath: new ThemeIcon("list-tree"),
  tooltip: "Reveal in SAS File Tree (or press Shift+Enter)",
};

import { ContentModel } from "./ContentModel";
import { ContentItem, Link } from "./types";

// ---------------------------------------------------------------------------
// Exported pure helpers (testable without vscode)
// ---------------------------------------------------------------------------

export function syntheticFolder(path: string): ContentItem {
  const name =
    path === "/" ? "/" : path.split("/").filter(Boolean).pop() ?? path;
  const link: Link = {
    method: "GET",
    rel: "getDirectoryMembers",
    href: path,
    uri: path,
    type: "GET",
  };
  return {
    id: `synthetic:${path}`,
    uri: path,
    name,
    links: [link],
    creationTimeStamp: 0,
    modifiedTimeStamp: 0,
    permission: { write: false, delete: false, addMember: false },
  };
}

export function fileIcon(name: string): ThemeIcon {
  const dot = name.lastIndexOf(".");
  const ext = dot >= 0 ? name.slice(dot + 1).toLowerCase() : "";
  switch (ext) {
    case "sas":
    case "py":
    case "r":
    case "rmd":
    case "js":
    case "ts":
    case "jsx":
    case "tsx":
    case "html":
    case "htm":
    case "xml":
    case "json":
    case "jsonc":
    case "css":
    case "scss":
    case "less":
    case "yaml":
    case "yml":
    case "sh":
    case "bash":
    case "c":
    case "cpp":
    case "h":
    case "java":
    case "cs":
    case "go":
    case "rs":
    case "php":
    case "rb":
      return new ThemeIcon("file-code");
    case "txt":
    case "log":
    case "rst":
      return new ThemeIcon("file-text");
    case "md":
    case "markdown":
      return new ThemeIcon("markdown");
    case "csv":
    case "tsv":
    case "xls":
    case "xlsx":
      return new ThemeIcon("table");
    case "sql":
    case "sas7bdat":
    case "parquet":
    case "feather":
    case "h5":
    case "hdf5":
    case "db":
    case "sqlite":
    case "sqlite3":
      return new ThemeIcon("database");
    case "zip":
    case "tar":
    case "gz":
    case "bz2":
    case "exe":
    case "dll":
    case "so":
    case "png":
    case "jpg":
    case "jpeg":
    case "gif":
    case "svg":
    case "ico":
    case "pdf":
      return new ThemeIcon("file-binary");
    default:
      return new ThemeIcon("file");
  }
}

export function isFolder(item: ContentItem): boolean {
  return (
    item.links?.some((l) => l.rel === "getDirectoryMembers") === true ||
    item.type === "folder"
  );
}

export function sortContentItems(items: ContentItem[]): ContentItem[] {
  const folders = items
    .filter(isFolder)
    .sort((a, b) => a.name.localeCompare(b.name));
  const files = items
    .filter((i) => !isFolder(i))
    .sort((a, b) => a.name.localeCompare(b.name));
  return [...folders, ...files];
}

// ---------------------------------------------------------------------------
// QuickPick item types
//
// vscode's QuickPickItem declares `kind?: QuickPickItemKind` (an enum), so
// we cannot simply intersect QuickPickItem with our string-literal `kind`
// discriminant. Instead we build each variant from scratch, carrying all the
// QuickPickItem fields we actually need (label, description, detail) plus our
// own discriminant `kind`.  We then cast the QuickPick to use these variants.
// ---------------------------------------------------------------------------

interface ParentItem {
  kind: "parent";
  label: string;
  iconPath?: ThemeIcon;
  description?: string;
}

interface FolderItem {
  kind: "folder";
  label: string;
  iconPath: ThemeIcon;
  description: string;
  detail?: string;
  item: ContentItem;
  buttons: readonly QuickInputButton[];
}

interface FileItem {
  kind: "file";
  label: string;
  iconPath: ThemeIcon;
  description?: string;
  item: ContentItem;
  buttons: readonly QuickInputButton[];
}

interface GotoItem {
  kind: "goto";
  label: string;
  description: string;
  path: string;
}

type BrowserQuickPickItem = ParentItem | FolderItem | FileItem | GotoItem;

// QuickPick<T> requires T extends QuickPickItem. Our BrowserQuickPickItem
// fails that constraint because the string-literal `kind` discriminant
// conflicts with `kind?: QuickPickItemKind` on QuickPickItem. We therefore
// define a minimal structural alias covering only the members we use and cast
// at the call site.
interface BrowserQuickPick {
  readonly selectedItems: readonly BrowserQuickPickItem[];
  items: BrowserQuickPickItem[];
  value: string;
  title: string | undefined;
  placeholder: string | undefined;
  busy: boolean;
  matchOnDescription: boolean;
  matchOnDetail: boolean;
  ignoreFocusOut: boolean;
  onDidAccept(listener: () => void): { dispose(): void };
  onDidChangeActive(
    listener: (items: readonly BrowserQuickPickItem[]) => void,
  ): { dispose(): void };
  onDidChangeValue(listener: (value: string) => void): { dispose(): void };
  onDidHide(listener: () => void): { dispose(): void };
  onDidTriggerItemButton(
    listener: (e: {
      button: QuickInputButton;
      item: BrowserQuickPickItem;
    }) => void,
  ): { dispose(): void };
  show(): void;
  hide(): void;
  dispose(): void;
}

// ---------------------------------------------------------------------------
// QuickFileBrowser class
// ---------------------------------------------------------------------------

export default class QuickFileBrowser {
  private contentModel: ContentModel;
  private onReveal: ((item: ContentItem) => void) | undefined;

  constructor(
    contentModel: ContentModel,
    onReveal?: (item: ContentItem) => void,
  ) {
    this.contentModel = contentModel;
    this.onReveal = onReveal;
  }

  async show(arg?: ContentItem | string): Promise<void> {
    // window.createQuickPick() returns QuickPick<QuickPickItem>; we widen it to
    // our BrowserQuickPick type which uses a string-literal `kind` discriminant.
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    const qp = window.createQuickPick() as unknown as BrowserQuickPick;
    qp.matchOnDescription = true;
    qp.matchOnDetail = true;
    qp.ignoreFocusOut = true;
    qp.placeholder =
      "Type to filter. / to jump to path. ↵ open  Shift+Enter reveal.";

    // Navigation stack: last element is the current folder; empty = root
    const stack: ContentItem[] = [];

    // Determine initial folder from argument
    if (typeof arg === "string") {
      stack.push(syntheticFolder(arg));
    } else if (arg !== undefined) {
      stack.push(arg);
    }

    // Per-session cache keyed by folder URI (or "root" for the root listing)
    const cache = new Map<string, ContentItem[]>();

    // Monotonic version counter used to discard stale async responses
    const version = { current: 0 };

    const currentFolder = (): ContentItem | undefined =>
      stack.length > 0 ? stack[stack.length - 1] : undefined;

    const reload = (): void => {
      version.current += 1;
      const v = version.current;
      void this.loadFolder(currentFolder(), qp, stack, cache, version, v).catch(
        (err: unknown) => {
          const msg = err instanceof Error ? err.message : String(err);
          void window.showErrorMessage(`QuickFileBrowser error: ${msg}`);
        },
      );
    };

    qp.onDidAccept(() => {
      const selected = qp.selectedItems[0];
      if (!selected) {
        return;
      }

      if (selected.kind === "parent") {
        stack.pop();
        reload();
      } else if (selected.kind === "folder") {
        stack.push(selected.item);
        reload();
      } else if (selected.kind === "goto") {
        stack.push(syntheticFolder(selected.path));
        reload();
      } else if (selected.kind === "file") {
        const fileItem = selected.item;
        qp.busy = true;
        this.contentModel
          .getUri(fileItem, false)
          .then((uri: Uri) =>
            commands.executeCommand("SAS.server.openItem", uri),
          )
          .then(() => {
            qp.hide();
          })
          .catch((err: unknown) => {
            const msg = err instanceof Error ? err.message : String(err);
            void window.showErrorMessage(`Failed to open file: ${msg}`);
            qp.busy = false;
          });
      }
    });

    qp.onDidChangeValue((value: string) => {
      if (value.startsWith("/")) {
        const gotoItem: GotoItem = {
          kind: "goto",
          label: `$(arrow-right) Go to ${value}`,
          description: "Navigate to path",
          path: value,
        };
        // Replace any existing goto item at the top; keep all non-goto items
        const existing = qp.items.filter((i) => i.kind !== "goto");
        qp.items = [gotoItem, ...existing];
      } else {
        // Remove goto item if user cleared the leading slash
        const withoutGoto = qp.items.filter((i) => i.kind !== "goto");
        if (withoutGoto.length !== qp.items.length) {
          qp.items = withoutGoto;
        }
      }
    });

    qp.onDidChangeActive((active) => {
      const first = active[0];
      _activeItem =
        first?.kind === "folder" || first?.kind === "file"
          ? first.item
          : undefined;
    });

    qp.onDidTriggerItemButton((e) => {
      const it = e.item;
      if ((it.kind === "folder" || it.kind === "file") && this.onReveal) {
        this.onReveal(it.item);
      }
    });

    qp.onDidHide(() => {
      _activeItem = undefined;
      void commands.executeCommand("setContext", "SAS.quickBrowseOpen", false);
      cache.clear();
      qp.dispose();
    });

    void commands.executeCommand("setContext", "SAS.quickBrowseOpen", true);
    qp.show();
    reload();
  }

  private async loadFolder(
    folder: ContentItem | undefined,
    qp: BrowserQuickPick,
    stack: ContentItem[],
    cache: Map<string, ContentItem[]>,
    version: { current: number },
    expectedVersion: number,
  ): Promise<void> {
    qp.busy = true;

    const cacheKey = folder?.uri ?? "root";

    let children: ContentItem[];
    if (cache.has(cacheKey)) {
      children = cache.get(cacheKey)!;
    } else {
      children = await this.contentModel.getChildren(folder);
    }

    // Guard against stale responses delivered after a newer navigation
    if (version.current !== expectedVersion) {
      return;
    }

    cache.set(cacheKey, children);
    qp.busy = false;

    // Update title to reflect current path
    const currentPath = folder?.uri ?? "/";
    qp.title =
      currentPath === "/" || currentPath === "root"
        ? "SAS Server"
        : currentPath;
    qp.placeholder =
      "Type to filter. / to jump to path. ↵ open  Shift+Enter reveal.";

    const sorted = sortContentItems(children);

    const parentItems: ParentItem[] =
      stack.length > 0
        ? [{ kind: "parent", label: "..", iconPath: new ThemeIcon("arrow-left") }]
        : [];

    const folderItems: FolderItem[] = sorted
      .filter(isFolder)
      .map((item) => ({
        kind: "folder" as const,
        label: item.name,
        iconPath: new ThemeIcon("folder"),
        description: item.uri,
        item,
        buttons: [REVEAL_BUTTON],
      }));

    const fileItems: FileItem[] = sorted
      .filter((item) => !isFolder(item))
      .map((item) => ({
        kind: "file" as const,
        label: item.name,
        iconPath: fileIcon(item.name),
        item,
        buttons: [REVEAL_BUTTON],
      }));

    qp.items = [...parentItems, ...folderItems, ...fileItems];
    // Clear the text filter so the new directory's items show unfiltered
    qp.value = "";
  }
}
