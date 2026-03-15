// Copyright © 2024, SAS Institute Inc., Cary, NC, USA.  All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
import axios, { AxiosError, AxiosInstance } from "axios";
import { window } from "vscode";

// Allow callers to mark a request as silent so the global error interceptor
// does not show a notification for it (use for requests that have dedicated
// error handling, e.g. code-execution errors handled by onRunError).
declare module "axios" {
  interface AxiosRequestConfig {
    _silent?: boolean;
  }
}

export interface StudioWebCredentials {
  endpoint: string; // e.g. https://sas8.example.com
  sessionId: string;
  cookieString: string; // raw Cookie header value, e.g. "name=value; name2=value2"
}

let _credentials: StudioWebCredentials | undefined;
let _axios: AxiosInstance | undefined;
let _controller: AbortController | undefined;
let _serverEncoding = "UTF-8";

export function getCredentials(): StudioWebCredentials | undefined {
  return _credentials;
}

export function getAxios(): AxiosInstance | undefined {
  return _axios;
}

/** Returns the server's default text encoding (e.g. "UTF-8", "ISO-8859-1"). */
export function getServerEncoding(): string {
  return _serverEncoding;
}

/** Sets the server's default text encoding. Call after fetching session preferences. */
export function setServerEncoding(encoding: string): void {
  _serverEncoding = encoding || "UTF-8";
}

export function setCredentials(creds: StudioWebCredentials | undefined): void {
  // Cancel any in-flight requests from the previous session
  _controller?.abort();
  _controller = undefined;

  _credentials = creds;
  if (creds) {
    _controller = new AbortController();
    const controller = _controller;
    _axios = axios.create({
      baseURL: `${creds.endpoint}/sasexec`,
      headers: {
        Cookie: creds.cookieString,
        "RemoteSession-Id": creds.sessionId,
      },
      timeout: 30000,
    });
    // Attach abort signal so all requests on this instance can be cancelled together
    _axios.interceptors.request.use((config) => {
      config.signal = controller.signal;
      return config;
    });

    // Show an error notification for any HTTP error response, unless the
    // request was cancelled or marked silent by the caller.
    _axios.interceptors.response.use(undefined, (error: unknown) => {
      const isCancel =
        axios.isCancel(error) ||
        (error instanceof Error &&
          (error.name === "AbortError" || error.name === "CanceledError"));
      const isSilent =
        error instanceof AxiosError && error.config?._silent === true;

      if (!isCancel && !isSilent && error instanceof AxiosError && error.response) {
        const { status, data } = error.response;
        const method = error.config?.method?.toUpperCase() ?? "REQUEST";
        const url = error.config?.url ?? "";
        const detail =
          typeof data === "string"
            ? data.slice(0, 200)
            : typeof data === "object" &&
                data !== null &&
                "message" in data &&
                typeof (data as { message: unknown }).message === "string"
              ? (data as { message: string }).message
              : "";
        window.showErrorMessage(
          `HTTP ${status} error on ${method} ${url}${detail ? ": " + detail : ""}`,
        );
      }
      return Promise.reject(error);
    });
  } else {
    _axios = undefined;
    _serverEncoding = "UTF-8";
  }
}
