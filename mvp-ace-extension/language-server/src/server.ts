// Copyright © 2022-2024, SAS Institute Inc., Cary, NC, USA.  All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
// Simplified SAS-only Language Server for Browser/WebWorker

import {
  Connection,
  InitializeResult,
  TextDocumentSyncKind,
  TextDocumentPositionParams,
  CompletionParams,
  DocumentFormattingParams,
  FoldingRangeParams,
  DocumentSymbolParams,
  HoverParams,
  SemanticTokensParams,
  FormattingOptions,
} from "vscode-languageserver/browser";
import { TextDocument } from "vscode-languageserver-textdocument";

import { LanguageServiceProvider, legend } from "./core/LanguageServiceProvider";

interface DocumentInfo {
  document: TextDocument;
  changed: boolean;
  service?: LanguageServiceProvider;
}

export function runServer(connection: Connection) {
  const documentPool: Record<string, DocumentInfo> = {};

  // Helper to get or create language service for a document
  function getLanguageService(uri: string): LanguageServiceProvider {
    const info = documentPool[uri];
    if (!info) {
      throw new Error(`Document not found: ${uri}`);
    }

    if (info.service && !info.changed) {
      return info.service;
    }

    // Create new service
    info.service = new LanguageServiceProvider(info.document);
    info.changed = false;
    return info.service;
  }

  // Initialize
  connection.onInitialize(() => {
    const result: InitializeResult = {
      capabilities: {
        textDocumentSync: TextDocumentSyncKind.Incremental,
        semanticTokensProvider: {
          legend,
          full: true,
        },
        documentFormattingProvider: true,
        foldingRangeProvider: true,
        documentSymbolProvider: true,
        hoverProvider: true,
        completionProvider: {
          triggerCharacters: [".", " ", "("],
          resolveProvider: false,
        },
      },
    };
    return result;
  });

  // Document lifecycle
  connection.onDidOpenTextDocument((params) => {
    const document = TextDocument.create(
      params.textDocument.uri,
      params.textDocument.languageId,
      params.textDocument.version,
      params.textDocument.text
    );

    documentPool[params.textDocument.uri] = {
      document,
      changed: true,
      service: undefined,
    };
  });

  connection.onDidChangeTextDocument((params) => {
    const info = documentPool[params.textDocument.uri];
    if (!info) return;

    // Apply changes
    TextDocument.update(
      info.document,
      params.contentChanges,
      params.textDocument.version
    );
    info.changed = true;
  });

  connection.onDidCloseTextDocument((params) => {
    delete documentPool[params.textDocument.uri];
  });

  // Semantic tokens
  connection.languages.semanticTokens.on((params: SemanticTokensParams) => {
    try {
      const service = getLanguageService(params.textDocument.uri);
      return { data: service.getTokens() };
    } catch (error) {
      console.error("Error getting semantic tokens:", error);
      return { data: [] };
    }
  });

  // Completion
  connection.onCompletion(async (params: CompletionParams) => {
    try {
      const service = getLanguageService(params.textDocument.uri);
      const completionList = await service.completionProvider.getCompleteItems(params);
      return completionList;
    } catch (error) {
      console.error("Error getting completions:", error);
      return { isIncomplete: false, items: [] };
    }
  });

  // Hover
  connection.onHover(async (params: HoverParams) => {
    try {
      const service = getLanguageService(params.textDocument.uri);
      return await service.completionProvider.getHelp(params.position);
    } catch (error) {
      console.error("Error getting hover:", error);
      return null;
    }
  });

  // Document formatting
  connection.onDocumentFormatting((params: DocumentFormattingParams) => {
    try {
      const service = getLanguageService(params.textDocument.uri);
      return service.formatter.format();
    } catch (error) {
      console.error("Error formatting document:", error);
      return [];
    }
  });

  // Folding ranges
  connection.onFoldingRanges((params: FoldingRangeParams) => {
    try {
      const service = getLanguageService(params.textDocument.uri);
      return service.getFoldingRanges();
    } catch (error) {
      console.error("Error getting folding ranges:", error);
      return [];
    }
  });

  // Document symbols
  connection.onDocumentSymbol((params: DocumentSymbolParams) => {
    try {
      const service = getLanguageService(params.textDocument.uri);
      return service.getDocumentSymbols();
    } catch (error) {
      console.error("Error getting document symbols:", error);
      return [];
    }
  });

  // Start listening
  connection.listen();
}
