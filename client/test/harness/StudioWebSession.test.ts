// Copyright © 2024, SAS Institute Inc., Cary, NC, USA.  All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
import { expect } from "chai";
import * as sinon from "sinon";

import * as state from "../../src/connection/studioweb/state";

/**
 * Tests for StudioWebSession cancel behavior.
 *
 * The asyncSubmissions API returns a bare UUID string (not an object with .id),
 * so _submissionId must be set directly from submission data, not submission?.id.
 * This is critical for cancel() to send the DELETE request.
 */
describe("StudioWebSession — cancel", () => {
  let sandbox: sinon.SinonSandbox;
  let axiosMock: {
    post: sinon.SinonStub;
    get: sinon.SinonStub;
    delete: sinon.SinonStub;
    defaults: { baseURL: string };
    interceptors: {
      response: { use: sinon.SinonStub };
    };
  };

  beforeEach(() => {
    sandbox = sinon.createSandbox();

    axiosMock = {
      post: sinon.stub(),
      get: sinon.stub(),
      delete: sinon.stub(),
      defaults: { baseURL: "http://sas.test/sasexec" },
      interceptors: { response: { use: sinon.stub() } },
    };

    // Inject mock axios and credentials into state
    state.setCredentials({
      endpoint: "http://sas.test",
      sessionId: "sess-abc",
      cookieString: "mySession=xyz",
    });
    // Replace the axios instance with our mock after setCredentials creates it
    sandbox.stub(state, "getAxios").returns(axiosMock as never);
  });

  afterEach(() => {
    state.setCredentials(undefined);
    sandbox.restore();
  });

  it("captures bare UUID string submission ID from asyncSubmissions response", async () => {
    const submissionId = "83916b45-13e5-4816-83e8-6f821a1eac48";

    // asyncSubmissions returns a bare UUID string (not { id: "..." })
    axiosMock.post.resolves({ data: submissionId });

    // Longpoll returns SubmitComplete immediately
    axiosMock.get.resolves({
      data: [{ messageType: "SubmitComplete", payload: { links: [] } }],
    });

    // Import after state is set up to get the real class
    const { StudioWebSession } = await import(
      "../../src/connection/studioweb/index"
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const session = new (StudioWebSession as any)();

    await session._run("data _null_; run;");

    // Verify POST was called for submission
    expect(axiosMock.post.calledOnce).to.be.true;
    // The session should have cleared _submissionId after run completes
    expect(session._submissionId).to.be.undefined;
  });

  it("cancel() sends DELETE with the correct submission ID", async () => {
    const submissionId = "83916b45-13e5-4816-83e8-6f821a1eac48";

    axiosMock.post.resolves({ data: submissionId });

    // Longpoll blocks until cancel is called, then resolve with empty
    let resolvePoll!: (value: { data: unknown[] }) => void;
    const pollPromise = new Promise<{ data: unknown[] }>((resolve) => {
      resolvePoll = resolve;
    });
    axiosMock.get.returns(pollPromise);
    axiosMock.delete.resolves({ status: 200, data: "" });

    const { StudioWebSession } = await import(
      "../../src/connection/studioweb/index"
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const session = new (StudioWebSession as any)();

    // Start the run (will block on longpoll)
    const runPromise = session._run("data _null_; call sleep(30,1); run;");

    // Wait a tick for the POST to complete and _submissionId to be set
    await new Promise((r) => setImmediate(r));

    // Cancel — should set _cancelled and send DELETE
    await session.cancel();

    expect(axiosMock.delete.calledOnce).to.be.true;
    const deleteCall = axiosMock.delete.firstCall;
    expect(deleteCall.args[0]).to.equal("/sessions/sess-abc/submissions");
    expect(deleteCall.args[1]).to.deep.equal({ params: { id: submissionId } });

    // Unblock the poll so _run() can finish
    resolvePoll({ data: [] });
    await runPromise;
  });

  it("cancel() does nothing when no submission is in flight", async () => {
    axiosMock.delete.resolves({ status: 200, data: "" });

    const { StudioWebSession } = await import(
      "../../src/connection/studioweb/index"
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const session = new (StudioWebSession as any)();

    // No _run() has been called, so _submissionId is undefined
    await session.cancel();

    expect(axiosMock.delete.called).to.be.false;
  });
});
