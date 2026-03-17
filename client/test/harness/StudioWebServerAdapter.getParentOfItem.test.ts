// Copyright © 2024, SAS Institute Inc., Cary, NC, USA.  All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
import { FileType } from "vscode";

import { expect } from "chai";
import * as sinon from "sinon";

import {
  SERVER_FOLDER_ID,
  SAS_SERVER_ROOT_FOLDERS,
} from "../../src/components/ContentNavigator/const";
import { ContentItem } from "../../src/components/ContentNavigator/types";
import StudioWebServerAdapter from "../../src/connection/studioweb/StudioWebServerAdapter";
import * as studiwebIndex from "../../src/connection/studioweb/index";
import * as state from "../../src/connection/studioweb/state";

const makeItem = (overrides: Partial<ContentItem> = {}): ContentItem => ({
  id: "/folders/myfolders/file.sas",
  uid: "/folders/myfolders/file.sas",
  uri: "/folders/myfolders/file.sas",
  name: "file.sas",
  creationTimeStamp: 0,
  modifiedTimeStamp: 0,
  links: [],
  parentFolderUri: "/folders/myfolders",
  permission: { write: true, delete: true, addMember: false },
  fileStat: { type: FileType.File, ctime: 0, mtime: 0, size: 0 },
  ...overrides,
});

const makeAxiosMock = () => ({
  get: sinon.stub(),
  post: sinon.stub(),
  put: sinon.stub(),
  delete: sinon.stub(),
  defaults: { baseURL: "http://sas.test/SASStudio/38/sasexec" },
});

// Simulates what the SAS Studio _root_ API returns
const ROOT_API_RESPONSE = {
  id: "_root_",
  name: "Root",
  isDirectory: true,
  uri: "/",
  children: [
    { name: "Files", uri: "/folders/myfolders", isDirectory: true },
    { name: "Folder Shortcuts", uri: "_folderShortcutRoot_", isDirectory: true },
  ],
};

describe("StudioWebServerAdapter — getParentOfItem", () => {
  let sandbox: sinon.SinonSandbox;
  let adapter: StudioWebServerAdapter;
  let axiosMock: ReturnType<typeof makeAxiosMock>;

  beforeEach(async () => {
    sandbox = sinon.createSandbox();
    adapter = new StudioWebServerAdapter(undefined, undefined);

    axiosMock = makeAxiosMock();
    sandbox.stub(studiwebIndex, "ensureCredentials").resolves(true);
    sandbox.stub(state, "getAxios").returns(axiosMock as never);
    sandbox.stub(state, "getCredentials").returns({
      endpoint: "http://sas.test/SASStudio/38",
      sessionId: "test-session-id",
      cookieString: "JSESSIONID=abc123",
    });

    // Populate rootFolders
    await adapter.getRootItems();
  });

  afterEach(() => {
    sandbox.restore();
  });

  /**
   * Populates the rootChildrenByUri cache by calling getChildItems on the root node.
   * Must be called before tests that depend on the cache being populated.
   */
  async function populateRootChildrenCache() {
    axiosMock.get.withArgs("/test-session-id/_root_").resolves({
      status: 200,
      data: ROOT_API_RESPONSE,
    });
    const rootItem = makeItem({
      id: SERVER_FOLDER_ID,
      uid: "0",
      uri: SERVER_FOLDER_ID,
      name: "SAS Server",
      parentFolderUri: undefined,
    });
    await adapter.getChildItems(rootItem);
  }

  // ── Basic / boundary cases ──────────────────────────────────────────────────

  it("returns undefined when item has no parentFolderUri", async () => {
    const item = makeItem({ parentFolderUri: undefined });
    const result = await adapter.getParentOfItem(item);
    expect(result).to.be.undefined;
  });

  it('returns rootNode when parentFolderUri is "/"', async () => {
    const item = makeItem({ parentFolderUri: "/" });
    const result = await adapter.getParentOfItem(item);
    expect(result).to.not.be.undefined;
    expect(result!.id).to.equal(SERVER_FOLDER_ID);
  });

  it("returns rootNode when parentFolderUri is SERVER_FOLDER_ID", async () => {
    const item = makeItem({ parentFolderUri: SERVER_FOLDER_ID });
    const result = await adapter.getParentOfItem(item);
    expect(result).to.not.be.undefined;
    expect(result!.id).to.equal(SERVER_FOLDER_ID);
  });

  // ── Cache-based cases (require rootChildrenByUri to be populated) ───────────

  describe("with root children cache populated", () => {
    beforeEach(async () => {
      await populateRootChildrenCache();
    });

    it("returns rootNode when item IS a direct logical root child (/folders/myfolders)", async () => {
      // /folders/myfolders is returned by _root_ API → it IS a root child.
      // Its physical parent /folders does NOT exist in the tree.
      const rootChild = makeItem({
        id: "/folders/myfolders",
        uid: "/folders/myfolders",
        uri: "/folders/myfolders",
        name: "Files",
        parentFolderUri: "/folders", // physical parent — not a tree node
        fileStat: { type: FileType.Directory, ctime: 0, mtime: 0, size: 0 },
      });
      const result = await adapter.getParentOfItem(rootChild);
      expect(result).to.not.be.undefined;
      expect(result!.id).to.equal(SERVER_FOLDER_ID);
    });

    it("getChildItems sets parentFolderUri to '/' for root children even when API returns uriParent=''", async () => {
      // The _root_ API returns uriParent:"" for top-level items.
      // convertEntryToContentItem must use || (not ??) so empty string falls
      // back to the parentPath "/" argument.
      axiosMock.get.withArgs("/test-session-id/_root_").resolves({
        status: 200,
        data: {
          ...ROOT_API_RESPONSE,
          children: [{ name: "Files", uri: "/folders/myfolders", isDirectory: true, uriParent: "" }],
        },
      });
      const rootItem = makeItem({ id: SERVER_FOLDER_ID, uid: "0", uri: SERVER_FOLDER_ID, name: "SAS Server", parentFolderUri: undefined });
      const children = await adapter.getChildItems(rootItem);
      const filesEntry = children.find((c) => c.uri === "/folders/myfolders");
      expect(filesEntry).to.not.be.undefined;
      expect(filesEntry!.parentFolderUri).to.equal("/");
    });

    it("returns rootNode even when parentFolderUri is empty string ''", async () => {
      // Defense-in-depth: even if parentFolderUri somehow ends up as "",
      // the rootChildrenByUri check fires first and returns rootNode correctly.
      const rootChild = makeItem({
        id: "/folders/myfolders",
        uid: "/folders/myfolders",
        uri: "/folders/myfolders",
        name: "Files",
        parentFolderUri: "",
        fileStat: { type: FileType.Directory, ctime: 0, mtime: 0, size: 0 },
      });
      const result = await adapter.getParentOfItem(rootChild);
      expect(result).to.not.be.undefined;
      expect(result!.id).to.equal(SERVER_FOLDER_ID);
    });

    it("returns rootNode for _folderShortcutRoot_ (non-path root child)", async () => {
      const item = makeItem({
        id: "_folderShortcutRoot_",
        uid: "_folderShortcutRoot_",
        uri: "_folderShortcutRoot_",
        name: "Folder Shortcuts",
        parentFolderUri: "_somePhysicalParent_",
        fileStat: { type: FileType.Directory, ctime: 0, mtime: 0, size: 0 },
      });
      const result = await adapter.getParentOfItem(item);
      expect(result).to.not.be.undefined;
      expect(result!.id).to.equal(SERVER_FOLDER_ID);
    });

    it("returns the cached root child item (correct uid) for a file directly inside /folders/myfolders", async () => {
      // This is the key fix: previously getParentOfItem would fall through to
      // getItemAtPath("/folders/myfolders") which builds a synthetic item.
      // Now it must return the CACHED item (same uid as what getChildren returns).
      const file = makeItem({
        uri: "/folders/myfolders/file.sas",
        name: "file.sas",
        parentFolderUri: "/folders/myfolders",
      });
      const result = await adapter.getParentOfItem(file);
      expect(result).to.not.be.undefined;
      expect(result!.uri).to.equal("/folders/myfolders");
      expect(result!.name).to.equal("Files");
      // uid must match exactly what getChildItems returned
      expect(result!.uid).to.equal("/folders/myfolders");
    });

    it("returns the cached root child item for a folder directly inside /folders/myfolders", async () => {
      const folder = makeItem({
        uri: "/folders/myfolders/mysubdir",
        name: "mysubdir",
        parentFolderUri: "/folders/myfolders",
        fileStat: { type: FileType.Directory, ctime: 0, mtime: 0, size: 0 },
      });
      const result = await adapter.getParentOfItem(folder);
      expect(result).to.not.be.undefined;
      expect(result!.uri).to.equal("/folders/myfolders");
      expect(result!.uid).to.equal("/folders/myfolders");
    });

    it("returns a synthetic intermediate item for a deeply nested file (parent is not a root child)", async () => {
      // /folders/myfolders/subdir/nested/file.sas
      // parentFolderUri = /folders/myfolders/subdir/nested — not a root child
      // should fall through to getItemAtPath
      const deepFile = makeItem({
        uri: "/folders/myfolders/subdir/nested/file.sas",
        name: "file.sas",
        parentFolderUri: "/folders/myfolders/subdir/nested",
      });
      const result = await adapter.getParentOfItem(deepFile);
      expect(result).to.not.be.undefined;
      expect(result!.uri).to.equal("/folders/myfolders/subdir/nested");
      expect(result!.name).to.equal("nested");
      // Must be a directory so VS Code can expand it during reveal traversal
      expect(result!.fileStat!.type).to.equal(FileType.Directory);
    });

    it("intermediate synthetic item has parentFolderUri pointing to its physical parent", async () => {
      const deepFile = makeItem({
        uri: "/folders/myfolders/subdir/file.sas",
        name: "file.sas",
        parentFolderUri: "/folders/myfolders/subdir",
      });
      const parent = await adapter.getParentOfItem(deepFile);
      // parent = /folders/myfolders/subdir  (synthetic, parentFolderUri = /folders/myfolders)
      expect(parent!.uri).to.equal("/folders/myfolders/subdir");
      expect(parent!.parentFolderUri).to.equal("/folders/myfolders");

      // Next level up: parent of /folders/myfolders/subdir should be cached root child
      const grandparent = await adapter.getParentOfItem(parent!);
      expect(grandparent!.uri).to.equal("/folders/myfolders");
      expect(grandparent!.uid).to.equal("/folders/myfolders");

      // Next level up: parent of /folders/myfolders should be rootNode
      const greatgrandparent = await adapter.getParentOfItem(grandparent!);
      expect(greatgrandparent!.id).to.equal(SERVER_FOLDER_ID);
    });
  });

  // ── Full parent-chain traversal (simulates what TreeView.reveal does) ───────

  describe("full parent-chain traversal for TreeView.reveal", () => {
    beforeEach(async () => {
      await populateRootChildrenCache();
    });

    it("builds a correct parent chain for a file directly in /folders/myfolders", async () => {
      const file = makeItem({
        uri: "/folders/myfolders/report.sas",
        name: "report.sas",
        parentFolderUri: "/folders/myfolders",
      });

      const chain: string[] = [file.uri];
      let current: ContentItem = file;
      for (let i = 0; i < 5; i++) {
        const parent = await adapter.getParentOfItem(current);
        if (!parent) break;
        chain.push(parent.uri);
        current = parent;
      }

      // Expected chain: file → /folders/myfolders (root child) → SERVER_FOLDER_ID (rootNode)
      expect(chain).to.deep.equal([
        "/folders/myfolders/report.sas",
        "/folders/myfolders",
        SERVER_FOLDER_ID,
      ]);
    });

    it("builds a correct parent chain for a deeply nested file", async () => {
      const file = makeItem({
        uri: "/folders/myfolders/projects/q1/analysis.sas",
        name: "analysis.sas",
        parentFolderUri: "/folders/myfolders/projects/q1",
      });

      const chain: string[] = [file.uri];
      let current: ContentItem = file;
      for (let i = 0; i < 10; i++) {
        const parent = await adapter.getParentOfItem(current);
        if (!parent) break;
        chain.push(parent.uri);
        current = parent;
      }

      // Expected: file → q1 → projects → /folders/myfolders (cached) → SERVER_FOLDER_ID
      expect(chain).to.deep.equal([
        "/folders/myfolders/projects/q1/analysis.sas",
        "/folders/myfolders/projects/q1",
        "/folders/myfolders/projects",
        "/folders/myfolders",
        SERVER_FOLDER_ID,
      ]);
    });

    it("no phantom /folders intermediate node appears in the chain", async () => {
      const file = makeItem({
        uri: "/folders/myfolders/file.sas",
        name: "file.sas",
        parentFolderUri: "/folders/myfolders",
      });

      const chain: string[] = [];
      let current: ContentItem = file;
      for (let i = 0; i < 5; i++) {
        const parent = await adapter.getParentOfItem(current);
        if (!parent) break;
        chain.push(parent.uri);
        current = parent;
      }

      // /folders must NOT appear — it's a phantom physical path, not a tree node
      expect(chain).to.not.include("/folders");
    });

    it("rootNode uid matches the uid stored in rootFolders (used as tree item id)", async () => {
      const rootItems = await adapter.getRootItems();
      const rootNode = rootItems[SAS_SERVER_ROOT_FOLDERS[0]];

      // Ask for the parent of /folders/myfolders (a root child): must return rootNode
      const rootChild = makeItem({
        uri: "/folders/myfolders",
        uid: "/folders/myfolders",
        parentFolderUri: "/folders",
        fileStat: { type: FileType.Directory, ctime: 0, mtime: 0, size: 0 },
      });
      const result = await adapter.getParentOfItem(rootChild);

      // The returned rootNode must have the same uid as the one in rootFolders
      expect(result!.uid).to.equal(rootNode.uid);
      expect(result!.id).to.equal(rootNode.id);
    });
  });

  // ── Cache not populated (tree not yet loaded) ────────────────────────────────

  describe("without root children cache", () => {
    it("falls back to physical parent traversal when cache is empty", async () => {
      // Do NOT call populateRootChildrenCache
      const file = makeItem({
        uri: "/folders/myfolders/file.sas",
        name: "file.sas",
        parentFolderUri: "/folders/myfolders",
      });
      // Falls back: returns synthetic item for /folders/myfolders
      const result = await adapter.getParentOfItem(file);
      expect(result).to.not.be.undefined;
      expect(result!.uri).to.equal("/folders/myfolders");
    });
  });
});
