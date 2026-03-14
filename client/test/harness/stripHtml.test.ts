// Copyright © 2024, SAS Institute Inc., Cary, NC, USA.  All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
//
// Tests for the stripHtml helper in StudioWebSession.
// The function is not exported, so we duplicate a minimal copy here and
// keep it in sync. If the logic grows more complex, consider exporting it.
import { expect } from "chai";

// Duplicated from client/src/connection/studioweb/index.ts — keep in sync.
function stripHtml(html: string): string {
  return html
    .replace(/&nbsp;/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:p|div|li|tr|td|th|h[1-6]|pre|blockquote)>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&amp;/gi, "&");
}

describe("stripHtml", () => {
  it("strips simple tags", () => {
    expect(stripHtml("<b>hello</b>")).to.equal("hello");
  });

  it("replaces <br> with newline", () => {
    expect(stripHtml("line1<br>line2")).to.equal("line1\nline2");
    expect(stripHtml("line1<br/>line2")).to.equal("line1\nline2");
    expect(stripHtml("line1<br />line2")).to.equal("line1\nline2");
  });

  it("replaces block-level closing tags with newline", () => {
    expect(stripHtml("<p>para</p>")).to.equal("para\n");
    expect(stripHtml("<div>block</div>")).to.equal("block\n");
  });

  it("decodes HTML entities", () => {
    expect(stripHtml("1 &lt; 2 &amp; 3 &gt; 0")).to.equal("1 < 2 & 3 > 0");
  });

  it("decodes &nbsp;", () => {
    expect(stripHtml("a&nbsp;b")).to.equal("a b");
  });

  it("handles mixed content", () => {
    const input =
      '<span class="err">ERROR: file not found</span><br/><span>NOTE: done</span>';
    expect(stripHtml(input)).to.equal("ERROR: file not found\nNOTE: done");
  });
});
