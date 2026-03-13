// Copyright © 2024, SAS Institute Inc., Cary, NC, USA.  All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
import { l10n, window } from "vscode";

import { RunResult } from "..";
import { updateStatusBarItem } from "../../components/StatusBarItem";
import { Session } from "../session";
import { extractOutputHtmlFileName } from "../util";
import { getAxios, getCredentials, setCredentials } from "./state";
import { Config } from "./types";
export type { Config };

let sessionInstance: StudioWebSession;

/**
 * Converts HTML log chunk to plain-text lines, preserving line breaks from
 * block-level elements before stripping all remaining tags.
 */
function stripHtml(html: string): string {
  return html
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&amp;/gi, "&")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:p|div|li|tr|td|th|h[1-6]|pre|blockquote)>/gi, "\n")
    .replace(/<[^>]*>/g, "");
}

/**
 * Determines the log line type from a plain text log line.
 */
function getLogLineType(
  line: string,
): "error" | "warning" | "note" | "normal" {
  if (/ERROR:/i.test(line)) {
    return "error";
  }
  if (/WARNING:/i.test(line)) {
    return "warning";
  }
  if (/NOTE:/i.test(line)) {
    return "note";
  }
  return "normal";
}

export class StudioWebSession extends Session {
  private _config: Config;
  private _cancelled = false;
  private _submissionId: string | undefined;
  private _htmlFileName = "";

  public set config(value: Config) {
    this._config = value;
  }

  public get configEndpoint(): string | undefined {
    return this._config?.endpoint;
  }

  protected async establishConnection(): Promise<void> {
    // If credentials are already set, re-use the existing session.
    if (getCredentials()) {
      updateStatusBarItem(true);
      return;
    }

    const sessionId = await window.showInputBox({
      title: l10n.t("SAS Studio Session ID"),
      placeHolder: l10n.t("Enter your SAS Studio remote session ID"),
      ignoreFocusOut: true,
    });

    if (sessionId === undefined) {
      throw new Error(l10n.t("SAS Studio session ID input was cancelled."));
    }

    const cookieString = await window.showInputBox({
      title: l10n.t("SAS Studio Session Cookie"),
      placeHolder: l10n.t("Enter session cookie (e.g. cookieName=value)"),
      ignoreFocusOut: true,
      password: true,
    });

    if (cookieString === undefined) {
      throw new Error(
        l10n.t("SAS Studio session cookie input was cancelled."),
      );
    }

    setCredentials({
      endpoint: this._config.endpoint,
      sessionId,
      cookieString,
    });

    updateStatusBarItem(true);
  }

  protected async _run(code: string): Promise<RunResult> {
    const axiosInstance = getAxios();
    const credentials = getCredentials();

    if (!axiosInstance || !credentials) {
      throw new Error(l10n.t("No active SAS Studio session."));
    }

    this._cancelled = false;
    this._submissionId = undefined;
    this._htmlFileName = "";
    const { sessionId } = credentials;

    // Redirect ODS HTML5 output to /tmp so SAS has write permission
    const codeWithODSPath = code.replace(
      /\bods html5\(id=vscode\)([^;]*;)/i,
      `ods html5(id=vscode) path="/tmp" $1`,
    );

    // Submit code
    const { data: submission } = await axiosInstance.post(
      `/sessions/${sessionId}/asyncSubmissions`,
      codeWithODSPath,
      {
        params: { label: "Program", uri: "Program" },
        headers: { "Content-Type": "text/plain; charset=UTF-8" },
      },
    );
    this._submissionId = submission?.id;

    // Poll for results
    let runResult: RunResult = {};
    let done = false;

    while (!done && !this._cancelled) {
      const { data: messages } = await axiosInstance.get(
        `/sessions/${sessionId}/messages/longpoll`,
      );

      // Empty array means execution ended
      if (!messages || messages.length === 0) {
        break;
      }

      for (const message of messages) {
        const { messageType, payload } = message;

        if (messageType === "LogChunk" || messageType === "LogEnd") {
          if (payload?.chunk) {
            const plainText = stripHtml(payload.chunk);
            const lines = plainText
              .split("\n")
              .filter((line: string) => line.trim() !== "")
              .map((line: string) => ({
                type: getLogLineType(line),
                line,
              }));

            // Extract the ODS output filename from log (e.g. body="<uuid>.htm")
            for (const { line } of lines) {
              this._htmlFileName = extractOutputHtmlFileName(
                line,
                this._htmlFileName,
              );
            }

            if (lines.length > 0) {
              this._onExecutionLogFn?.(lines);
            }
          }
        } else if (messageType === "SubmitComplete") {
          // Fetch HTML result from /tmp via workspace API
          if (this._htmlFileName) {
            try {
              const { data: htmlContent } = await axiosInstance.get(
                `/sessions/${sessionId}/workspace/~~ds~~/tmp/${this._htmlFileName}.htm`,
                { params: { ct: "text/html;charset=UTF-8" } },
              );

              if (
                typeof htmlContent === "string" &&
                /id="IDX/i.test(htmlContent)
              ) {
                runResult = { html5: htmlContent, title: "Result" };
              }

              // Clean up the temp file
              axiosInstance
                .delete(
                  `/sessions/${sessionId}/workspace/~~ds~~/tmp/${this._htmlFileName}.htm`,
                )
                .catch(() => undefined);
            } catch {
              // If fetching results fails, continue without results
            }
          }

          done = true;
          break;
        }
      }
    }

    this._submissionId = undefined;
    return runResult;
  }

  protected async _close(): Promise<void> {
    setCredentials(undefined);
    updateStatusBarItem(false);

    if (this._rejectRun) {
      this._rejectRun({ message: l10n.t("The SAS session has closed.") });
      this._rejectRun = undefined;
    }
  }

  public async cancel(): Promise<void> {
    this._cancelled = true;

    const axiosInstance = getAxios();
    const credentials = getCredentials();

    if (axiosInstance && credentials && this._submissionId) {
      try {
        await axiosInstance.delete(
          `/sessions/${credentials.sessionId}/submissions`,
          { params: { id: this._submissionId } },
        );
      } catch {
        // Ignore errors on cancel
      }
    }
  }

  public sessionId(): string | undefined {
    return getCredentials()?.sessionId;
  }
}

/**
 * Clears the current session credentials and prompts the user for a new
 * session ID and cookie. The new credentials are stored but no HTTP
 * connection is established until the next call to `setup()`.
 */
export async function promptNewSession(): Promise<void> {
  // Capture the endpoint from the current credentials before clearing them.
  const endpoint = getCredentials()?.endpoint ?? sessionInstance?.configEndpoint ?? "";

  setCredentials(undefined);

  const sessionId = await window.showInputBox({
    title: l10n.t("SAS Studio Session ID"),
    placeHolder: l10n.t("Enter your SAS Studio remote session ID"),
    ignoreFocusOut: true,
  });

  if (sessionId === undefined) {
    return;
  }

  const cookieString = await window.showInputBox({
    title: l10n.t("SAS Studio Session Cookie"),
    placeHolder: l10n.t("Enter session cookie (e.g. cookieName=value)"),
    ignoreFocusOut: true,
    password: true,
  });

  if (cookieString === undefined) {
    return;
  }

  setCredentials({ endpoint, sessionId, cookieString });
}

/**
 * Returns the singleton `StudioWebSession` instance, creating it if needed.
 */
export function getSession(config: Config): Session {
  if (!sessionInstance) {
    sessionInstance = new StudioWebSession();
  }
  sessionInstance.config = config;
  return sessionInstance;
}
