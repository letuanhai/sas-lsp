// Copyright © 2024, SAS Institute Inc., Cary, NC, USA.  All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
import { expect } from "chai";

import {
  getAxios,
  getCredentials,
  setCredentials,
} from "../../src/connection/studioweb/state";

describe("StudioWeb state", () => {
  afterEach(() => {
    setCredentials(undefined);
  });

  it("starts with no credentials", () => {
    expect(getCredentials()).to.be.undefined;
    expect(getAxios()).to.be.undefined;
  });

  it("stores credentials and creates an axios instance", () => {
    setCredentials({
      endpoint: "https://sas.example.com",
      sessionId: "sess-123",
      cookieString: "myCookie=abc",
    });

    const creds = getCredentials();
    expect(creds).to.deep.equal({
      endpoint: "https://sas.example.com",
      sessionId: "sess-123",
      cookieString: "myCookie=abc",
    });

    const ax = getAxios();
    expect(ax).to.not.be.undefined;
    expect(ax.defaults.baseURL).to.equal(
      "https://sas.example.com/sasexec",
    );
    expect(ax.defaults.headers["Cookie"]).to.equal("myCookie=abc");
    expect(ax.defaults.headers["RemoteSession-Id"]).to.equal("sess-123");
  });

  it("clears credentials and axios instance", () => {
    setCredentials({
      endpoint: "https://sas.example.com",
      sessionId: "sess-123",
      cookieString: "myCookie=abc",
    });
    setCredentials(undefined);

    expect(getCredentials()).to.be.undefined;
    expect(getAxios()).to.be.undefined;
  });
});
