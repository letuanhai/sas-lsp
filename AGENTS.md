# AGENTS.md

This file provides guidance to AI agents when working with code in this repository.

## Commands

```bash
npm install          # install all deps (root + client + server via postinstall)
npm run compile      # esbuild production build (client + server, node targets)
npm run watch        # esbuild watch mode with sourcemaps for dev
npm run lint         # ESLint on all TS/TSX files
npm run format       # Prettier write
npm run format:check # Prettier check (CI)
npm run test         # compile + typecheck + run all tests (server + harness + integration)
npm run test-client  # @vscode/test-cli integration tests (downloads VS Code, runs in extension host)
npm run test-harness # Mocha direct-import tests (no VS Code, fast)
npm run test-server  # Mocha + ts-node for server only
```

Type-check only (faster than full test):

```bash
npx tsc -p client/tsconfig.json --noEmit
npx tsc -p server/tsconfig.json --noEmit
```

For debugging: open in VS Code and press **F5** ("Launch Client" configuration).

## Testing (for AI agents)

There are two testing approaches. **Choose based on what you need:**

### 1. Direct Test Harness (`npm run test-harness`) — PREFER THIS

**When to use:** Testing code logic, API calls, utilities, stores, data transformations — anything that does NOT require the `vscode` API namespace.

- Files go in `client/test/harness/`
- Runs via Mocha + ts-node directly (no VS Code download, no GUI)
- Uses the same chai/sinon stack as existing tests
- **Fast** — completes in seconds, ideal for agent iteration loops
- Can mock axios to test HTTP API interactions (e.g., StudioWeb adapters)

```bash
# Run all harness tests
npm run test-harness

# Run a single file
npx cross-env TS_NODE_PROJECT=./client/tsconfig.json mocha -r ts-node/register client/test/harness/mytest.test.ts
```

**What to test here:** `state.ts`, `SASCodeDocument`, stores (`useRunStore`, `useLogStore`), `stripHtml`, profile validation, data transformations, adapter logic (with mocked axios).

### 2. VS Code Integration Tests (`npm run test-client`) — WHEN YOU NEED VSCODE API

**When to use:** Testing functionality that requires the VS Code extension host — commands, UI interactions, language server integration, webview panels, tree views.

- Configured in `.vscode-test.mjs` using `@vscode/test-cli`
- Tests go in `client/test/` (compiled to `client/out/test/`)
- Requires `npm run pretest` first (compile + typecheck)
- Downloads VS Code automatically, launches extension host, runs Mocha inside it
- Tests have full access to the `vscode` API

```bash
# Run all integration tests (requires pretest first)
npm run pretest && npm run test-client

# Run only a specific label
npm run test-client:label integration
```

**What to test here:** Extension activation, command registration, LSP features (completion, hover, diagnostics), notebook serialization, content/library tree views.

### Decision guide for agents

| Need to test…                        | Use                  |
| ------------------------------------ | -------------------- |
| Pure function / utility              | `test-harness`       |
| Store actions (zustand)              | `test-harness`       |
| HTTP API logic (with mocked axios)   | `test-harness`       |
| Data transformation / parsing        | `test-harness`       |
| VS Code command execution            | `test-client`        |
| LSP features (completion, hover)     | `test-client`        |
| Extension activation / registration  | `test-client`        |
| Anything importing from `"vscode"`   | `test-client`        |

## Architecture

The repo is a VS Code extension split into two independent TypeScript packages:

- **`client/`** — the extension itself (UI, commands, connection logic, tree views). Entry points: `client/src/node/extension.ts` (Electron) and `client/src/browser/extension.ts` (web).
- **`server/`** — a Language Server Protocol (LSP) server providing SAS/Python syntax features (completion, hover, diagnostics). Compiled separately and launched as a child process.

Build uses **esbuild** (`tools/build.mjs`) for node targets and **webpack** (`webpack.config.js`) for browser/webworker targets.

### Connection system

All connection types share a common abstract base (`client/src/connection/session.ts`):

```
Session (abstract)
  ├── establishConnection(): Promise<void>
  ├── _run(code): Promise<RunResult>        // RunResult = { html5?, title? }
  ├── _close(): Promise<void>
  ├── cancel?(): Promise<void>
  └── sessionId?(): string | undefined
```

Connection types live in `client/src/connection/{rest,itc,ssh,studioweb}/`. Each exports a `getSession(config)` factory returning the singleton session. `client/src/connection/index.ts` is the single dispatch point — add a `case ConnectionType.X` there when adding a new type.

Profile types and the `ConnectionType` enum are in `client/src/components/profile.ts`. Adding a connection type requires changes in: `profile.ts` (enum + interface + `prompt()` + `validateProfile()` + `remoteTarget()`), `connection/index.ts`, and both adapter factories.

### Adapter pattern (file & library navigation)

Tree-view panels use adapters rather than calling session code directly:

- **`LibraryAdapterFactory`** → `LibraryAdapter` (browse libraries/tables, query data)
- **`ContentAdapterFactory`** → `ContentAdapter` (browse/read/write server files)

Factory dispatch uses `connectionType` (library) or `"${connectionType}.${sourceType}"` (content). Implementations live alongside their session code: e.g. `connection/studioweb/StudioWebLibraryAdapter.ts`.

### Code submission pipeline

`run.ts` → `SASCodeDocument.getWrappedCode()` → `session.run()`:

- `SASCodeDocument` (`components/utils/SASCodeDocument.ts`) wraps user code with ODS HTML5 statements, autoexec, `%let _SASPROGRAMFILE`, etc. The `outputHtml` flag controls ODS wrapping.
- **StudioWeb note**: `StudioWebSession._run()` strips the ODS wrapper before submitting because SAS Studio handles output rendering natively. Results are fetched via the `results` link in the `SubmitComplete` poll message.

### SAS Studio Web connection (current feature branch)

`client/src/connection/studioweb/` implements the `studioweb` connection type:

- `state.ts` — holds runtime credentials (endpoint, session ID, cookie) in memory; never persisted. Provides a shared axios instance with `baseURL = {endpoint}/sasexec`.
- `index.ts` — `StudioWebSession`: prompts for session ID + cookie on first `establishConnection()`; submits code via `POST /sessions/{id}/asyncSubmissions`; polls `/sessions/{id}/messages/longpoll` until `SubmitComplete` or empty response; cancels via `DELETE /sessions/{id}/submissions?id={submissionId}`.
- `StudioWebLibraryAdapter.ts` — uses `/libdata/{id}/libraries` and `/sessions/{id}/sql` endpoints.
- `StudioWebServerAdapter.ts` — uses `/sessions/{id}/workspace/~~ds~~{path}` for file operations.

The `SAS.studioweb.newSession` command (registered in `node/extension.ts`) closes the current session and re-prompts for credentials.

### View visibility

`updateViewSettings()` in `node/extension.ts` controls sidebar panel visibility via `setContext`:

| Context key            | Enabled for                        |
| ---------------------- | ---------------------------------- |
| `SAS.canSignIn`        | All types except SSH and StudioWeb |
| `SAS.librariesEnabled` | All types except SSH               |
| `SAS.serverEnabled`    | All types except SSH               |
| `SAS.contentEnabled`   | REST (Viya) and StudioWeb          |

## SAS Studio Web API Reference

The following documentation files describe the internal SAS Studio Web REST API used by the `studioweb` connection type:

| File                              | Description                                                                                                                       |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `SASStudio-API-Documentation.md`  | Complete API reference: code execution, file operations, library navigation, SQL queries, and VS Code extension integration guide |
| `SASStudio-FileOperations-API.md` | Detailed file/folder operations: path encoding (`~ps~`, `~dot~`), tree loading, CRUD operations, BIP tree, FTP, and CSRF handling |
| `SASStudio-API.ipynb`             | Interactive Jupyter notebook with working Python examples for all API endpoints                                                   |

**Key API patterns:**

- Base URL: `{host}/sasexec` or `{host}/SASStudio/{version}/sasexec`
- Auth: `RemoteSession-Id` header + session cookie
- File paths: Use `~~ds~~` prefix (e.g., `/workspace/~~ds~~/path/to/file`)
- Libraries: `/libdata/{sessionId}/libraries` endpoint
- Code execution: `POST /sessions/{id}/asyncSubmissions` → poll `/messages/longpoll`

### API Exploration via Playwright

Agents can use the `playwright-cli` skill to explore SAS Studio Web API behavior interactively:

```bash
# Load the skill first
/skill playwright-cli

# Then navigate to the SAS Studio instance
/playwright-cli open http://192.168.0.141/SASStudio/38
```

This opens a browser to the local SAS Studio instance where you can observe actual API calls, inspect network traffic, and verify endpoint behavior while working on `studioweb` connection features.

## SAS Server SSH Access

The SAS server is also accessible via SSH:

- **Host:** `192.168.0.141`
- **Username:** `sasdemo`
- **Command:** `ssh sasdemo@192.168.0.141`

SSH access is useful for inspecting server-side logs, running SAS commands directly, or debugging connection issues outside of the extension.

## Do Not

- Do not commit until the user explicitly ask for
