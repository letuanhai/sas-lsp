# SAS Language Extension Architecture Documentation

## Table of Contents
1. [Overview](#overview)
2. [High-Level Architecture](#high-level-architecture)
3. [Component Architecture](#component-architecture)
4. [Language Server Architecture](#language-server-architecture)
5. [Client Extension Architecture](#client-extension-architecture)
6. [Build System](#build-system)
7. [Language Server Independence Analysis](#language-server-independence-analysis)
8. [Key Technologies](#key-technologies)
9. [File Structure](#file-structure)

---

## Overview

The **SAS Language Extension for Visual Studio Code** is a sophisticated language extension that provides comprehensive support for SAS programming. It implements the Language Server Protocol (LSP) to deliver rich code intelligence features and supports both desktop (Electron) and web (browser) environments.

**Key Features:**
- Full Language Server Protocol implementation for SAS
- Dual runtime support (Node.js and Browser/WebWorker)
- Python language support via Pyright integration
- Multiple SAS backend connections (Viya, SAS 9.4, local)
- Rich UI features (notebooks, content explorers, result viewers)
- Support for 11+ languages with full localization

**Version:** 1.17.0
**Publisher:** SAS Institute Inc.
**License:** Apache-2.0

---

## High-Level Architecture

```mermaid
graph TB
    subgraph "VSCode Extension Host"
        Client[Client Extension]
        UI[UI Components]
        Commands[Commands]
        Notebooks[Notebook Controller]
    end

    subgraph "Language Server Process"
        Server[Language Server]
        SASServices[SAS Language Services]
        PythonServices[Python Services - Pyright]
    end

    subgraph "SAS Backends"
        Viya[SAS Viya - REST]
        SAS94SSH[SAS 9.4 - SSH]
        SAS94IOM[SAS 9.4 - IOM]
        SAS94COM[SAS 9.4 - COM]
    end

    Client <-->|LSP over IPC/WebWorker| Server
    Server --> SASServices
    Server --> PythonServices
    Client --> UI
    Client --> Commands
    Client --> Notebooks
    Commands -->|Connection Adapters| Viya
    Commands -->|Connection Adapters| SAS94SSH
    Commands -->|Connection Adapters| SAS94IOM
    Commands -->|Connection Adapters| SAS94COM

    style Server fill:#e1f5ff
    style Client fill:#fff4e1
    style SASServices fill:#e8f5e9
    style PythonServices fill:#f3e5f5
```

---

## Component Architecture

### 1. Dual Runtime Support

The extension supports both Node.js (desktop) and Browser (web) environments:

```mermaid
graph LR
    subgraph "Desktop Mode - Electron"
        ClientNode[Client - Node Entry]
        ServerNode[Server - Node Entry]
        PyrightNode[Pyright Node]
        IPCNode[IPC Transport]

        ClientNode <-->|IPC| IPCNode
        IPCNode <--> ServerNode
        ServerNode --> PyrightNode
    end

    subgraph "Web Mode - Browser"
        ClientBrowser[Client - Browser Entry]
        ServerBrowser[Server - WebWorker Entry]
        PyrightBrowser[Pyright Browser]
        WebWorker[WebWorker Transport]
        FakeFS[Fake FileSystem]

        ClientBrowser <-->|WebWorker| WebWorker
        WebWorker <--> ServerBrowser
        ServerBrowser --> PyrightBrowser
        PyrightBrowser --> FakeFS
    end

    style ClientNode fill:#4caf50
    style ServerNode fill:#4caf50
    style ClientBrowser fill:#2196f3
    style ServerBrowser fill:#2196f3
```

**Entry Points:**

| Runtime | Client Entry | Server Entry |
|---------|--------------|--------------|
| **Node/Desktop** | `client/src/node/extension.ts` | `server/src/node/server.ts` |
| **Browser/Web** | `client/src/browser/extension.ts` | `server/src/browser/server.ts` |

---

## Language Server Architecture

### 2. Language Server Core

The language server is the heart of the extension, providing all code intelligence features:

```mermaid
graph TD
    subgraph "Language Server Core"
        ServerEntry[server.ts - Main Server Logic]
        Connection[LSP Connection]

        subgraph "SAS Language Services"
            Lexer[Lexer - Tokenization]
            LexerEx[LexerEx - Extended Features]
            CodeZone[CodeZoneManager]
            Completion[CompletionProvider]
            Syntax[SyntaxProvider]
            SyntaxData[SyntaxDataProvider]
            Formatter[Formatter]
            FormatType[FormatOnTypeProvider]
            Model[Model - Document State]
            LSP[LanguageServiceProvider]
        end

        subgraph "Python Language Services"
            PyrightBase[PyrightLanguageProvider]
            PyrightNode[PyrightLanguageProviderNode]
            PyrightBrowser[PyrightLanguageProviderBrowser]
            FakeFS[Fake FileSystem - Browser]
        end
    end

    Connection --> ServerEntry
    ServerEntry --> LSP
    ServerEntry --> PyrightBase

    LSP --> Model
    LSP --> Syntax
    LSP --> Completion
    LSP --> Formatter
    LSP --> FormatType

    Model --> Lexer
    Model --> LexerEx
    Syntax --> CodeZone
    Completion --> CodeZone
    Completion --> SyntaxData

    PyrightBase --> PyrightNode
    PyrightBase --> PyrightBrowser
    PyrightBrowser --> FakeFS

    style ServerEntry fill:#ff9800
    style LSP fill:#4caf50
    style PyrightBase fill:#9c27b0
```

### 3. LSP Capabilities

The server implements comprehensive LSP capabilities:

```mermaid
graph LR
    subgraph "Document Capabilities"
        TextSync[Text Document Sync - Incremental]
        SemanticTokens[Semantic Tokens]
        Formatting[Document Formatting]
        FormatOnType[Format on Type]
        Folding[Folding Ranges]
        Symbols[Document Symbols]
    end

    subgraph "Code Intelligence"
        Hover[Hover Information]
        Completion[Code Completion]
        SignatureHelp[Signature Help]
        Definition[Go to Definition]
        References[Find References]
        Implementation[Go to Implementation]
        Rename[Rename Symbol]
    end

    subgraph "Workspace Capabilities"
        WorkspaceSymbols[Workspace Symbols]
        CodeActions[Code Actions]
        ExecuteCommand[Execute Command]
    end

    Server[Language Server] --> TextSync
    Server --> SemanticTokens
    Server --> Formatting
    Server --> FormatOnType
    Server --> Folding
    Server --> Symbols
    Server --> Hover
    Server --> Completion
    Server --> SignatureHelp
    Server --> Definition
    Server --> References
    Server --> Implementation
    Server --> Rename
    Server --> WorkspaceSymbols
    Server --> CodeActions
    Server --> ExecuteCommand

    style Server fill:#ff9800
```

### 4. SAS Language Service Components

```mermaid
graph TD
    Doc[TextDocument] --> Model[Model]
    Model --> LSP[LanguageServiceProvider]

    LSP --> SyntaxProvider[SyntaxProvider]
    LSP --> CompletionProvider[CompletionProvider]
    LSP --> FormatOnTypeProvider[FormatOnTypeProvider]
    LSP --> Formatter[Formatter]

    SyntaxProvider --> Lexer[Lexer]
    SyntaxProvider --> LexerEx[LexerEx]

    CompletionProvider --> CodeZoneManager[CodeZoneManager]
    CompletionProvider --> SyntaxDataProvider[SyntaxDataProvider]

    CodeZoneManager --> Lexer
    SyntaxDataProvider --> |SAS Procedures & Functions| CompletionProvider

    LexerEx --> |Folding Blocks| FoldingRanges[Folding Ranges]
    Lexer --> |Tokens| SemanticTokens[Semantic Tokens]

    Formatter --> |AST Parser| FormatterPrinter[Printer]

    style LSP fill:#4caf50
    style Model fill:#2196f3
    style Lexer fill:#ff9800
    style SyntaxDataProvider fill:#9c27b0
```

**Component Responsibilities:**

| Component | File | Responsibility |
|-----------|------|----------------|
| **Model** | `Model.ts` | Document state management, line-based access |
| **Lexer** | `Lexer.ts` | Tokenization of SAS code |
| **LexerEx** | `LexerEx.ts` | Extended lexer with folding support |
| **CodeZoneManager** | `CodeZoneManager.ts` | Code zone detection (DATA/PROC/MACRO blocks) |
| **SyntaxProvider** | `SyntaxProvider.ts` | Syntax token generation for semantic highlighting |
| **SyntaxDataProvider** | `SyntaxDataProvider.ts` | Built-in SAS procedures, functions, and help data |
| **CompletionProvider** | `CompletionProvider.ts` | Code completion logic |
| **FormatOnTypeProvider** | `FormatOnTypeProvider.ts` | Format-on-type implementation |
| **Formatter** | `formatter/` | Full document formatting (parser + printer) |
| **LanguageServiceProvider** | `LanguageServiceProvider.ts` | Main orchestrator for all language services |

---

## Client Extension Architecture

### 5. Client Components

```mermaid
graph TD
    subgraph "Extension Activation"
        ExtensionEntry[extension.ts]
        LanguageClient[Language Client]
        ServerOptions[Server Options]
    end

    subgraph "Command Handlers"
        Run[Run Commands]
        Profile[Profile Management]
        Authorize[Authorization]
        Session[Session Management]
        New[New File/Notebook]
    end

    subgraph "UI Components"
        ContentNav[Content Navigator]
        LibraryNav[Library Navigator]
        ResultPanel[Result Panel]
        StatusBar[Status Bar]
        LogViewer[Log Viewer]
    end

    subgraph "Notebook Support"
        Controller[Notebook Controller]
        Serializer[Notebook Serializer]
        LogRenderer[Log Renderer]
        HTMLRenderer[HTML Renderer]
        Exporters[Exporters - HTML/SAS]
    end

    subgraph "Connection Layer"
        ConnectionFactory[Connection Factory]
        REST[REST Adapter - Viya]
        SSH[SSH Adapter]
        IOM[IOM Adapter]
        COM[COM Adapter]
        Studio[Studio Adapter]
    end

    subgraph "State Management"
        Zustand[Zustand Store]
        ProfileStore[Profile Store]
        SessionStore[Session Store]
    end

    ExtensionEntry --> LanguageClient
    ExtensionEntry --> Run
    ExtensionEntry --> Profile
    ExtensionEntry --> ContentNav
    ExtensionEntry --> LibraryNav
    ExtensionEntry --> Controller

    Run --> ConnectionFactory
    Profile --> ProfileStore
    Controller --> Serializer
    Controller --> LogRenderer
    Controller --> HTMLRenderer

    ConnectionFactory --> REST
    ConnectionFactory --> SSH
    ConnectionFactory --> IOM
    ConnectionFactory --> COM
    ConnectionFactory --> Studio

    ContentNav --> Zustand
    LibraryNav --> SessionStore

    style ExtensionEntry fill:#ff9800
    style LanguageClient fill:#4caf50
    style ConnectionFactory fill:#2196f3
```

### 6. Connection Architecture

The client supports multiple connection types to different SAS backends:

```mermaid
graph TD
    User[User Action - Run SAS Code] --> CommandHandler[Run Command Handler]
    CommandHandler --> ConnectionFactory[Connection Factory]

    ConnectionFactory --> |Profile Type: REST| RESTConnection[REST Connection]
    ConnectionFactory --> |Profile Type: SSH| SSHConnection[SSH Connection]
    ConnectionFactory --> |Profile Type: IOM| IOMConnection[IOM Connection]
    ConnectionFactory --> |Profile Type: COM| COMConnection[COM Connection]

    subgraph "REST - SAS Viya"
        RESTConnection --> OAuth[OAuth2 Authentication]
        RESTConnection --> ComputeAPI[Compute Service API]
        RESTConnection --> ContentAPI[Content Service API]
        ComputeAPI --> Session[Session Management]
        Session --> Execute[Execute Code]
    end

    subgraph "SSH - SAS 9.4 Remote"
        SSHConnection --> SSH2Lib[SSH2 Library]
        SSH2Lib --> SSHSession[SSH Session]
        SSHSession --> RemoteSAS[Remote SAS Process]
    end

    subgraph "IOM - SAS 9.4"
        IOMConnection --> IOMBridge[IOM Bridge]
        IOMBridge --> Workspace[Workspace Server]
    end

    subgraph "COM - Windows SAS"
        COMConnection --> COMBridge[COM Bridge]
        COMBridge --> LocalSAS[Local SAS Instance]
    end

    Execute --> Results[Results]
    RemoteSAS --> Results
    Workspace --> Results
    LocalSAS --> Results

    Results --> ResultPanel[Result Panel]
    Results --> LogViewer[Log Viewer]

    style RESTConnection fill:#4caf50
    style SSHConnection fill:#2196f3
    style IOMConnection fill:#ff9800
    style COMConnection fill:#9c27b0
```

### 7. Notebook Architecture

```mermaid
graph LR
    subgraph "Notebook Support"
        VSCodeNotebook[VSCode Notebook API]
        Controller[Notebook Controller]
        Serializer[Notebook Serializer]

        subgraph "Execution"
            KernelExec[Kernel Execution]
            Connection[SAS Connection]
            OutputProcessor[Output Processor]
        end

        subgraph "Renderers"
            LogRenderer[Log Renderer]
            HTMLRenderer[HTML Renderer]
        end

        subgraph "Exporters"
            HTMLExporter[HTML Exporter]
            SASExporter[SAS Exporter]
        end
    end

    VSCodeNotebook --> Controller
    VSCodeNotebook --> Serializer

    Controller --> KernelExec
    KernelExec --> Connection
    Connection --> OutputProcessor

    OutputProcessor --> |application/vnd.sas.compute.log.lines| LogRenderer
    OutputProcessor --> |application/vnd.sas.ods.html5| HTMLRenderer

    Controller --> HTMLExporter
    Controller --> SASExporter

    style Controller fill:#4caf50
    style LogRenderer fill:#2196f3
    style HTMLRenderer fill:#2196f3
```

---

## Build System

### 8. Build Architecture

The project uses a dual-build system to support both Node.js and browser environments:

```mermaid
graph TD
    subgraph "Build Tools"
        ESBuild[ESBuild]
        Webpack[Webpack]
        TSC[TypeScript Compiler]
    end

    subgraph "Build Targets"
        ClientNode[Client - Node]
        ClientBrowser[Client - Browser]
        ClientWebview[Client - Webviews]
        ClientNotebook[Client - Notebook Renderers]
        ServerNode[Server - Node]
        ServerBrowser[Server - Browser/WebWorker]
    end

    subgraph "Output Artifacts"
        ClientNodeDist[client/dist/node/extension.js]
        ClientBrowserDist[client/dist/browser/extension.js]
        ClientWebviewDist[client/dist/webview/*.js]
        ClientNotebookDist[client/dist/notebook/*.js]
        ServerNodeDist[server/dist/node/server.js]
        ServerBrowserDist[server/dist/browser/server.js]
    end

    ESBuild --> ClientNode
    ESBuild --> ClientWebview
    ESBuild --> ClientNotebook
    ESBuild --> ServerNode

    Webpack --> ClientBrowser
    Webpack --> ServerBrowser

    TSC --> |Type Checking| ClientNode
    TSC --> |Type Checking| ServerNode

    ClientNode --> ClientNodeDist
    ClientBrowser --> ClientBrowserDist
    ClientWebview --> ClientWebviewDist
    ClientNotebook --> ClientNotebookDist
    ServerNode --> ServerNodeDist
    ServerBrowser --> ServerBrowserDist

    style ESBuild fill:#4caf50
    style Webpack fill:#ff9800
    style TSC fill:#2196f3
```

**Build Configuration:**

| Target | Tool | Entry Point | Output |
|--------|------|-------------|--------|
| Client (Node) | ESBuild | `client/src/node/extension.ts` | `client/dist/node/extension.js` |
| Client (Browser) | Webpack | `client/src/browser/extension.ts` | `client/dist/browser/extension.js` |
| Server (Node) | ESBuild | `server/src/node/server.ts` | `server/dist/node/server.js` |
| Server (Browser) | Webpack | `server/src/browser/server.ts` | `server/dist/browser/server.js` |
| Webviews | ESBuild | `client/src/webview/*.tsx` | `client/dist/webview/*.js` |
| Notebook Renderers | ESBuild | `client/src/components/notebook/renderers/*.tsx` | `client/dist/notebook/*.js` |

---

## Language Server Independence Analysis

### 9. Can the Language Server be Extracted?

**Answer: YES** - The SAS language server can be extracted as an independent component. Here's the analysis:

#### Current Dependencies

```mermaid
graph TD
    Server[Server Core - server.ts]

    subgraph "LSP Dependencies"
        LSPServer[vscode-languageserver]
        TextDoc[vscode-languageserver-textdocument]
    end

    subgraph "SAS Language Services - Independent"
        Lexer[Lexer.ts]
        LexerEx[LexerEx.ts]
        CodeZone[CodeZoneManager.ts]
        Completion[CompletionProvider.ts]
        Syntax[SyntaxProvider.ts]
        SyntaxData[SyntaxDataProvider.ts]
        Formatter[Formatter/]
        Model[Model.ts]
        LSP[LanguageServiceProvider.ts]
    end

    subgraph "Python Services - Optional"
        Pyright[Pyright Integration]
    end

    Server --> LSPServer
    Server --> TextDoc
    Server --> LSP
    Server --> Pyright

    LSP --> Model
    LSP --> Syntax
    LSP --> Completion
    LSP --> Formatter

    Model --> Lexer
    Model --> LexerEx
    Syntax --> CodeZone
    Completion --> SyntaxData

    style LSP fill:#4caf50
    style Server fill:#ff9800
    style Pyright fill:#f3e5f5,stroke-dasharray: 5 5
```

#### Independence Assessment

**Core SAS Language Services (100% Independent):**
- ✅ `Lexer.ts` - No external dependencies
- ✅ `LexerEx.ts` - Only depends on Lexer
- ✅ `Model.ts` - Only depends on LSP TextDocument interface
- ✅ `CodeZoneManager.ts` - Only depends on Lexer
- ✅ `SyntaxProvider.ts` - Only depends on Model and Lexer
- ✅ `SyntaxDataProvider.ts` - Pure data provider
- ✅ `CompletionProvider.ts` - Only depends on internal services
- ✅ `Formatter/` - Only depends on Model and SyntaxProvider
- ✅ `LanguageServiceProvider.ts` - Orchestrates independent services

**Minimal External Dependencies:**
- `vscode-languageserver` - Standard LSP protocol (can use any LSP implementation)
- `vscode-languageserver-textdocument` - Simple TextDocument abstraction

**Optional Dependencies:**
- `pyright-internal-*` - Only for Python language support (can be removed)

#### Portability Analysis

```mermaid
graph TD
    subgraph "Current State"
        VSCodeServer[VSCode Language Server]
        SASServices[SAS Language Services]
        PythonServices[Python Services - Optional]
    end

    subgraph "Portable Language Server"
        LSPInterface[LSP Protocol Interface]
        CoreServices[Core SAS Services]
    end

    subgraph "Can Be Used With"
        VSCode[VSCode]
        Vim[Vim/Neovim - coc.nvim, nvim-lsp]
        Emacs[Emacs - lsp-mode]
        Sublime[Sublime Text - LSP]
        WebEditor[Web Editors - Monaco, CodeMirror]
        Browser[Browser - WebWorker]
        Atom[Atom/Pulsar - atom-ide]
        Eclipse[Eclipse - LSP4E]
    end

    VSCodeServer --> SASServices
    VSCodeServer --> PythonServices

    LSPInterface --> CoreServices
    CoreServices --> |Same Code| SASServices

    LSPInterface --> VSCode
    LSPInterface --> Vim
    LSPInterface --> Emacs
    LSPInterface --> Sublime
    LSPInterface --> WebEditor
    LSPInterface --> Browser
    LSPInterface --> Atom
    LSPInterface --> Eclipse

    style CoreServices fill:#4caf50
    style LSPInterface fill:#2196f3
    style PythonServices fill:#f3e5f5,stroke-dasharray: 5 5
```

### 10. Web Worker Compatibility

**Can it run as a Web Worker in the browser? YES!**

The extension **already supports browser/WebWorker mode**:

```mermaid
graph TD
    subgraph "Browser Environment"
        Editor[Web-based Editor]
        MainThread[Main Thread]
        Worker[Web Worker]

        subgraph "In Web Worker"
            ServerBrowser[server/browser/server.ts]
            SASServices[SAS Language Services]
            PyrightBrowser[Pyright - Browser Mode]
            FakeFS[Fake FileSystem]
        end
    end

    Editor --> MainThread
    MainThread <-->|postMessage| Worker
    Worker --> ServerBrowser
    ServerBrowser --> SASServices
    ServerBrowser --> PyrightBrowser
    PyrightBrowser --> FakeFS

    SASServices --> |No File I/O Needed| Analysis[Code Analysis]

    style Worker fill:#2196f3
    style SASServices fill:#4caf50
```

**Current Browser Implementation:**
- Entry: `server/src/browser/server.ts`
- Transport: `BrowserMessageReader/Writer` (postMessage API)
- Pyright: Uses browser-specific version with fake filesystem
- Build: Webpack bundles for browser environment

**Requirements for Browser/WebWorker:**
- ✅ No Node.js file system access (already implemented)
- ✅ Uses LSP protocol over postMessage (already implemented)
- ✅ All language services work without file I/O (already implemented)
- ✅ Bundled as single JavaScript file (already implemented)

---

## Key Technologies

### 11. Technology Stack

```mermaid
graph TD
    subgraph "Core Technologies"
        TS[TypeScript 5.5.3]
        React[React 19.2.0]
        LSP[Language Server Protocol]
    end

    subgraph "LSP Infrastructure"
        LSPServer[vscode-languageserver 10.0.0]
        LSPClient[vscode-languageclient 10.0.0]
        TextDoc[vscode-languageserver-textdocument]
    end

    subgraph "UI & State"
        ReactDOM[React DOM 19.2.0]
        Zustand[Zustand 5.0.8]
        AGGrid[AG-Grid 34.3.1]
    end

    subgraph "Network"
        Axios[Axios 1.13.1]
        SSH2[SSH2 1.17.0]
    end

    subgraph "Build Tools"
        ESBuild[ESBuild 0.25.12]
        Webpack[Webpack 5.102.1]
        ESLint[ESLint 9.19.0]
        Prettier[Prettier 3.5.0]
    end

    subgraph "Python Support"
        Pyright[Pyright 1.1.367]
    end

    style TS fill:#2196f3
    style LSP fill:#4caf50
    style React fill:#00bcd4
```

---

## File Structure

### 12. Directory Organization

```
/home/user/sas-lsp/
├── client/                          # VSCode Extension Client
│   ├── src/
│   │   ├── node/                   # Node.js entry point
│   │   │   └── extension.ts        # Main activation
│   │   ├── browser/                # Browser entry point
│   │   │   └── extension.ts        # Web activation
│   │   ├── commands/               # Command handlers
│   │   │   ├── run.ts             # Run SAS code
│   │   │   ├── authorize.ts       # Authentication
│   │   │   ├── profile.ts         # Profile management
│   │   │   ├── new.ts             # New file/notebook
│   │   │   └── ...
│   │   ├── components/            # Core components
│   │   │   ├── notebook/          # Notebook support
│   │   │   ├── ContentNavigator/  # Content tree
│   │   │   ├── LibraryNavigator/  # Library explorer
│   │   │   ├── ResultPanel/       # Results viewer
│   │   │   ├── logViewer/         # Log parsing
│   │   │   ├── profile.ts         # Profile definitions
│   │   │   └── AuthProvider.ts    # OAuth provider
│   │   ├── connection/            # Connection adapters
│   │   │   ├── rest/              # SAS Viya
│   │   │   ├── ssh/               # SSH connections
│   │   │   ├── iom/               # IOM connections
│   │   │   ├── com/               # COM connections
│   │   │   └── index.ts           # Factory
│   │   ├── webview/               # Webview panels
│   │   │   ├── DataViewer.tsx     # Table viewer
│   │   │   └── ...
│   │   └── store/                 # State management
│   ├── dist/                      # Build output
│   │   ├── node/
│   │   ├── browser/
│   │   ├── webview/
│   │   └── notebook/
│   └── package.json
│
├── server/                         # Language Server
│   ├── src/
│   │   ├── node/                  # Node.js entry
│   │   │   └── server.ts
│   │   ├── browser/               # Browser entry
│   │   │   └── server.ts
│   │   ├── server.ts              # Main server logic
│   │   ├── sas/                   # SAS language services
│   │   │   ├── Lexer.ts           # Tokenizer
│   │   │   ├── LexerEx.ts         # Extended lexer
│   │   │   ├── Model.ts           # Document model
│   │   │   ├── CodeZoneManager.ts # Zone detection
│   │   │   ├── CompletionProvider.ts
│   │   │   ├── SyntaxProvider.ts
│   │   │   ├── SyntaxDataProvider.ts
│   │   │   ├── FormatOnTypeProvider.ts
│   │   │   ├── LanguageServiceProvider.ts
│   │   │   ├── formatter/         # Document formatter
│   │   │   └── utils.ts
│   │   └── python/                # Python support
│   │       ├── PyrightLanguageProvider.ts
│   │       ├── node/
│   │       │   └── PyrightLanguageProviderNode.ts
│   │       └── browser/
│   │           ├── PyrightLanguageProviderBrowser.ts
│   │           └── fakeFileSystem.ts
│   ├── dist/                      # Build output
│   │   ├── node/
│   │   └── browser/
│   └── package.json
│
├── syntaxes/                      # TextMate grammars
│   ├── sas.tmLanguage.json       # SAS syntax
│   └── sassql.tmLanguage.json    # SQL syntax
│
├── themes/                        # Color themes
├── snippets/                      # Code snippets
├── icons/                         # Extension icons
├── l10n/                          # Localization (11 languages)
├── tools/                         # Build scripts
│   └── build.mjs                 # ESBuild config
│
├── package.json                   # Root manifest
├── webpack.config.js              # Webpack config
├── tsconfig.json                  # TypeScript config
└── language-configuration.json    # Language config
```

---

## Summary

### Architectural Highlights

1. **Clean Separation**: Client handles UI/UX and connections; server provides language intelligence
2. **LSP-Based**: Standard Language Server Protocol enables editor independence
3. **Dual Runtime**: Supports both Node.js (desktop) and browser (web) environments
4. **Modular Design**: Core SAS language services are independent and reusable
5. **Multi-Backend**: Flexible connection layer supports various SAS backends
6. **Rich Features**: Notebooks, content navigation, result viewers, and more
7. **Modern Stack**: TypeScript, React, LSP, ESBuild, and Webpack
8. **Internationalized**: Support for 11+ languages
9. **Comprehensive Testing**: Unit and E2E tests included

### Language Server Independence

The SAS language server **can be extracted** as an independent component:

✅ **Core language services are self-contained** (Lexer, Parser, Completion, etc.)
✅ **Minimal dependencies** (only standard LSP protocol)
✅ **Already browser-compatible** (WebWorker support exists)
✅ **Can be used with any LSP client** (Vim, Emacs, Sublime, Monaco, etc.)
✅ **Python support is optional** (can be removed if not needed)

**Next Steps for Extraction:**
1. Create standalone `sas-language-server` package
2. Extract `server/src/sas/` as core module
3. Provide thin LSP wrapper (`server/src/server.ts`)
4. Publish to npm for use in other editors
5. Provide browser bundle for web editors
6. Create LSP client examples for popular editors

The architecture is well-designed for this use case and requires minimal refactoring.
