// Copyright © 2023, SAS Institute Inc., Cary, NC, USA.  All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
import { Uri, commands, window } from "vscode";

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
  description?: string;
}

interface FolderItem {
  kind: "folder";
  label: string;
  description: string;
  detail?: string;
  item: ContentItem;
}

interface FileItem {
  kind: "file";
  label: string;
  description?: string;
  item: ContentItem;
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
  onDidChangeValue(listener: (value: string) => void): { dispose(): void };
  onDidHide(listener: () => void): { dispose(): void };
  show(): void;
  hide(): void;
  dispose(): void;
}

// ---------------------------------------------------------------------------
// QuickFileBrowser class
// ---------------------------------------------------------------------------

export default class QuickFileBrowser {
  private contentModel: ContentModel;

  constructor(contentModel: ContentModel) {
    this.contentModel = contentModel;
  }

  async show(arg?: ContentItem | string): Promise<void> {
    // window.createQuickPick() returns QuickPick<QuickPickItem>; we widen it to
    // our BrowserQuickPick type which uses a string-literal `kind` discriminant.
    const qp = window.createQuickPick() as unknown as BrowserQuickPick;
    qp.matchOnDescription = true;
    qp.matchOnDetail = true;
    qp.ignoreFocusOut = true;
    qp.placeholder = "Type to filter. / to jump to path. ↵ to open.";

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

    qp.onDidHide(() => {
      cache.clear();
      qp.dispose();
    });

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
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
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
    qp.placeholder = "Type to filter. / to jump to path. ↵ to open.";

    const sorted = sortContentItems(children);

    const parentItems: ParentItem[] =
      stack.length > 0
        ? [{ kind: "parent", label: "$(arrow-left) .." }]
        : [];

    const folderItems: FolderItem[] = sorted
      .filter(isFolder)
      .map((item) => ({
        kind: "folder" as const,
        label: `$(folder) ${item.name}`,
        description: item.uri,
        item,
      }));

    const fileItems: FileItem[] = sorted
      .filter((item) => !isFolder(item))
      .map((item) => ({
        kind: "file" as const,
        label: `$(file) ${item.name}`,
        item,
      }));

    qp.items = [...parentItems, ...folderItems, ...fileItems];
    // Clear the text filter so the new directory's items show unfiltered
    qp.value = "";
  }
}
