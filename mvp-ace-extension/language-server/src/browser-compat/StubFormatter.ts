// Stub formatter for browser MVP
// Removes dependency on prettier

import { TextEdit } from "vscode-languageserver";
import type { Model } from "../core/Model";
import type { SyntaxProvider } from "../core/SyntaxProvider";

export class Formatter {
  constructor(private model: Model, private syntaxProvider: SyntaxProvider) {}

  format(): TextEdit[] {
    // For MVP, return empty array (no formatting)
    // In future, could implement simple indentation-based formatting
    console.warn("Formatting not implemented in browser version");
    return [];
  }
}
