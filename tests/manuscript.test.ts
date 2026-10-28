import { test } from "node:test";
import assert from "node:assert/strict";
import { parseManuscript } from "../src/lib/manuscript";
import { markdownHtml } from "../src/lib/export-text";

test("Arabic Markdown headings are parsed even without blank lines", () => {
  const sample = "مقدمة\n### 1. حب الذات\nسطر عربي\n- عنصر أول\n- عنصر ثان";
  const blocks = parseManuscript(sample);
  assert.deepEqual(blocks.map(b => b.type), ["paragraph", "heading", "paragraph", "ul"]);
  assert.equal(blocks[1].type === "heading" ? blocks[1].text : "", "1. حب الذات");
  const html = markdownHtml(sample);
  assert.match(html, /<h4>1\. حب الذات<\/h4>/);
  assert.doesNotMatch(html, /###/);
  assert.match(html, /<li>عنصر أول<\/li>/);
});
test("Manuscript HTML escapes tags rather than executing them", () => {
  const html = markdownHtml("## عنوان\n<script>alert(1)</script>\n1. أول\n2. ثاني\n**مهم**");
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /<ol>/);
  assert.match(html, /<strong>مهم<\/strong>/);
});
