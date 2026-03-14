// Minimal vscode shim for the Mocha harness.
// Intercepts "vscode" module resolution and returns a lightweight mock so that
// extension source files can be required in a plain Node.js/ts-node process.
"use strict";

const Module = require("module");
const path = require("path");

// ---------- Uri shim ----------
class Uri {
  constructor(scheme, authority, uriPath, query, fragment) {
    this.scheme = scheme || "";
    this.authority = authority || "";
    this.path = uriPath || "";
    this.query = query || "";
    this.fragment = fragment || "";
    this.fsPath = uriPath || "";
  }
  toString() {
    let s = `${this.scheme}:`;
    if (this.authority) s += `//${this.authority}`;
    s += this.path;
    if (this.query) s += `?${this.query}`;
    if (this.fragment) s += `#${this.fragment}`;
    return s;
  }
  with(change) {
    return new Uri(
      "scheme" in change ? change.scheme : this.scheme,
      "authority" in change ? change.authority : this.authority,
      "path" in change ? change.path : this.path,
      "query" in change ? change.query : this.query,
      "fragment" in change ? change.fragment : this.fragment,
    );
  }
  static parse(str) {
    const match =
      /^([a-zA-Z][a-zA-Z0-9+\-.]*):([^?#]*)(?:\?([^#]*))?(?:#(.*))?$/.exec(
        str,
      );
    if (match) {
      const scheme = match[1];
      const rest = match[2] || "";
      const query = match[3] || "";
      const authority = rest.startsWith("//")
        ? rest.slice(2).split("/")[0]
        : "";
      const uriPath = rest.startsWith("//")
        ? rest.slice(2 + authority.length)
        : rest;
      return new Uri(scheme, authority, uriPath, query, "");
    }
    return new Uri("", "", str, "", "");
  }
  static from(components) {
    return new Uri(
      components.scheme || "",
      components.authority || "",
      components.path || "",
      components.query || "",
      components.fragment || "",
    );
  }
  static joinPath(base, ...segments) {
    const joined = [base.path, ...segments].join("/").replace(/\/+/g, "/");
    return base.with({ path: joined });
  }
  static file(p) {
    return new Uri("file", "", p, "", "");
  }
}

// ---------- FileType enum ----------
const FileType = { Unknown: 0, File: 1, Directory: 2, SymbolicLink: 64 };

// ---------- ThemeIcon ----------
class ThemeIcon {
  constructor(id, color) {
    this.id = id;
    this.color = color;
  }
  static File = new (class ThemeIconStatic {
    constructor() {
      this.id = "file";
    }
  })();
}

// ---------- TreeItemCollapsibleState ----------
const TreeItemCollapsibleState = { None: 0, Collapsed: 1, Expanded: 2 };

// ---------- SnippetString ----------
class SnippetString {
  constructor(value) {
    this.value = value || "";
  }
}

// ---------- Tab / TabInput stubs ----------
class TabInputText {
  constructor(uri) {
    this.uri = uri;
  }
}
class TabInputNotebook {
  constructor(uri) {
    this.uri = uri;
  }
}

// ---------- Minimal window ----------
const window = {
  showInputBox: () => Promise.resolve(undefined),
  showErrorMessage: () => Promise.resolve(undefined),
  showInformationMessage: () => Promise.resolve(undefined),
  showWarningMessage: () => Promise.resolve(undefined),
  createStatusBarItem: () => ({
    show: () => {},
    hide: () => {},
    dispose: () => {},
    text: "",
    tooltip: "",
  }),
  tabGroups: {
    all: [],
    close: () => Promise.resolve(true),
  },
};

// ---------- l10n ----------
const l10n = {
  t: (str, ...args) => {
    if (typeof str !== "string") return String(str);
    return str.replace(/\{(\w+)\}/g, (_, key) => {
      const idx = parseInt(key, 10);
      if (!isNaN(idx)) return String(args[idx] ?? `{${key}}`);
      const obj = args[0];
      return obj && typeof obj === "object"
        ? String(obj[key] ?? `{${key}}`)
        : `{${key}}`;
    });
  },
};

// ---------- commands ----------
const commands = {
  executeCommand: () => Promise.resolve(undefined),
  registerCommand: () => ({ dispose: () => {} }),
  registerTextEditorCommand: () => ({ dispose: () => {} }),
};

// ---------- authentication ----------
const authentication = {
  getSession: () => Promise.resolve(undefined),
  registerAuthenticationProvider: () => ({ dispose: () => {} }),
  onDidChangeSessions: () => ({ dispose: () => {} }),
};

// ---------- workspace ----------
const workspace = {
  getConfiguration: () => ({ get: () => undefined, has: () => false }),
  onDidChangeConfiguration: () => ({ dispose: () => {} }),
};

// ---------- EventEmitter ----------
class EventEmitter {
  constructor() {
    this._listeners = [];
    this.event = (listener) => {
      this._listeners.push(listener);
      return { dispose: () => {} };
    };
  }
  fire(data) {
    this._listeners.forEach((l) => l(data));
  }
  dispose() {
    this._listeners = [];
  }
}

// ---------- StatusBarAlignment ----------
const StatusBarAlignment = { Left: 1, Right: 2 };

// ---------- vscode mock object ----------
const vscodeMock = {
  Uri,
  FileType,
  ThemeIcon,
  TreeItemCollapsibleState,
  SnippetString,
  TabInputText,
  TabInputNotebook,
  window,
  l10n,
  commands,
  authentication,
  workspace,
  EventEmitter,
  StatusBarAlignment,
};

// ---------- Hook module resolution ----------
// Store the fake module so require.cache references work
const FAKE_PATH = path.join(__dirname, "__vscode_shim__.js");

// Pre-populate require.cache with our shim at a fake path
require.cache[FAKE_PATH] = {
  id: FAKE_PATH,
  filename: FAKE_PATH,
  loaded: true,
  exports: vscodeMock,
  paths: [],
  parent: null,
  children: [],
};

// Intercept resolution of "vscode" to point at our fake module
const originalResolveFilename = Module._resolveFilename.bind(Module);
Module._resolveFilename = function (request, parentModule, isMain, options) {
  if (request === "vscode") {
    return FAKE_PATH;
  }
  return originalResolveFilename(request, parentModule, isMain, options);
};
