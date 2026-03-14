// Copyright © 2024, SAS Institute Inc., Cary, NC, USA.  All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
import { FileType } from "vscode";

import { expect } from "chai";
import * as sinon from "sinon";

import StudioWebServerAdapter from "../../src/connection/studioweb/StudioWebServerAdapter";
import * as studiwebIndex from "../../src/connection/studioweb/index";
import * as state from "../../src/connection/studioweb/state";
import { ContentItem } from "../../src/components/ContentNavigator/types";

// Minimal ContentItem factory for StudioWeb (no uid/flags needed)
const makeItem = (overrides: Partial<ContentItem> = {}): ContentItem => ({
  id: "/folders/myfolders/test/file.sas",
  uri: "/folders/myfolders/test/file.sas",
  name: "file.sas",
  creationTimeStamp: 0,
  modifiedTimeStamp: 0,
  links: [],
  parentFolderUri: "/folders/myfolders/test",
  permission: { write: true, delete: true, addMember: false },
  fileStat: { type: FileType.File, ctime: 0, mtime: 0, size: 0 },
  ...overrides,
});

/** Minimal mock axios-like object */
const makeAxiosMock = () => ({
  get: sinon.stub(),
  post: sinon.stub(),
  put: sinon.stub(),
  delete: sinon.stub(),
  defaults: { baseURL: "http://sas.test/SASStudio/38/sasexec" },
});

describe("StudioWebServerAdapter — renameItem", () => {
  let sandbox: sinon.SinonSandbox;
  let adapter: StudioWebServerAdapter;
  let axiosMock: ReturnType<typeof makeAxiosMock>;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    adapter = new StudioWebServerAdapter(undefined, undefined);

    axiosMock = makeAxiosMock();

    // Stub ensureCredentials so no UI prompt fires
    sandbox.stub(studiwebIndex, "ensureCredentials").resolves(true);

    // Stub getAxios / getCredentials from state
    sandbox.stub(state, "getAxios").returns(axiosMock as never);
    sandbox.stub(state, "getCredentials").returns({
      endpoint: "http://sas.test/SASStudio/38",
      sessionId: "test-session-id",
      cookieString: "JSESSIONID=abc123",
    });
  });

  afterEach(() => {
    sandbox.restore();
  });

  it("renames a file: POSTs to tree store and returns updated ContentItem", async () => {
    const item = makeItem();
    axiosMock.post.resolves({ status: 200, data: {} });

    const result = await adapter.renameItem(item, "file_renamed.sas");

    // Should have called POST with correct body
    expect(axiosMock.post.calledOnce).to.be.true;
    const [url, body] = axiosMock.post.firstCall.args;
    expect(url).to.equal("/test-session-id/");
    expect(body).to.deep.equal({
      operationName: "rename",
      newName: "file_renamed.sas",
      oldName: "file.sas",
      parent: "~ps~folders~ps~myfolders~ps~test~ps~file.sas",
      isPDSMember: false,
      isNativeMVS: false,
    });

    // Should return ContentItem with updated name and URI
    expect(result).to.not.be.undefined;
    expect(result!.name).to.equal("file_renamed.sas");
    expect(result!.uri).to.equal("/folders/myfolders/test/file_renamed.sas");
    expect(result!.fileStat!.type).to.equal(FileType.File);
  });

  it("renames a folder: POSTs to tree store and returns ContentItem with Directory type", async () => {
    const item = makeItem({
      id: "/folders/myfolders/test/my_folder",
      uri: "/folders/myfolders/test/my_folder",
      name: "my_folder",
      parentFolderUri: "/folders/myfolders/test",
      fileStat: { type: FileType.Directory, ctime: 0, mtime: 0, size: 0 },
    });
    axiosMock.post.resolves({ status: 200, data: {} });

    const result = await adapter.renameItem(item, "my_folder_renamed");

    expect(axiosMock.post.calledOnce).to.be.true;
    const [url, body] = axiosMock.post.firstCall.args;
    expect(url).to.equal("/test-session-id/");
    expect(body.operationName).to.equal("rename");
    expect(body.newName).to.equal("my_folder_renamed");
    expect(body.oldName).to.equal("my_folder");
    expect(body.parent).to.equal(
      "~ps~folders~ps~myfolders~ps~test~ps~my_folder",
    );

    expect(result).to.not.be.undefined;
    expect(result!.name).to.equal("my_folder_renamed");
    expect(result!.uri).to.equal(
      "/folders/myfolders/test/my_folder_renamed",
    );
    expect(result!.fileStat!.type).to.equal(FileType.Directory);
  });

  it("returns undefined when POST fails (HTTP error)", async () => {
    const item = makeItem();
    axiosMock.post.rejects({
      response: { status: 500, data: "Internal Server Error" },
      message: "Request failed with status code 500",
    });

    const result = await adapter.renameItem(item, "file_renamed.sas");

    expect(result).to.be.undefined;
  });

  it("returns undefined when ensureCredentials returns false", async () => {
    // Override the stub to return false
    (studiwebIndex.ensureCredentials as sinon.SinonStub).resolves(false);
    const item = makeItem();

    const result = await adapter.renameItem(item, "file_renamed.sas");

    expect(result).to.be.undefined;
    expect(axiosMock.post.notCalled).to.be.true;
  });

  it("encodes dots in file name using ~ps~ only in body (not ~dot~)", async () => {
    // encodeTreePath replaces / → ~ps~ but keeps dots as-is
    const item = makeItem({
      uri: "/folders/myfolders/test/file.sas",
      name: "file.sas",
    });
    axiosMock.post.resolves({ status: 200, data: {} });

    await adapter.renameItem(item, "file2.sas");

    const [, body] = axiosMock.post.firstCall.args;
    // dot should stay as-is in the `parent` body field
    expect(body.parent).to.equal(
      "~ps~folders~ps~myfolders~ps~test~ps~file.sas",
    );
  });
});
