// Copyright © 2022, SAS Institute Inc., Cary, NC, USA.  All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
// Browser-compatible version - simplified for MVP

export interface TextPosition {
  line: number;
  column: number;
}

export interface TextRange {
  start: TextPosition;
  end: TextPosition;
}

export function isSamePosition(pos1: TextPosition, pos2: TextPosition) {
  return pos1.line === pos2.line && pos1.column === pos2.column;
}

export function arrayToMap(arr: string[] | number[]): Record<string, 1> {
  const map: Record<string, 1> = {};
  for (const key of arr) {
    map[key] = 1;
  }
  return map;
}

// Simplified getText for browser MVP - no internationalization
export function getText(key: string, arg?: string): string {
  // For MVP, return the key itself as fallback
  // In future, could load message bundles dynamically
  let result = key;
  if (arg) {
    result = result.replace("{0}", arg);
  }
  return result;
}

export const isCustomRegionStartComment = (commmentText?: string) => {
  return /^\s*[%/]?\*\s*region\b/i.test(commmentText ?? "");
};

export const isCustomRegionEndComment = (commmentText?: string) => {
  return /^\s*[%/]?\*\s*endregion\b/i.test(commmentText ?? "");
};
