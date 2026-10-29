import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { parseManuscript } from "../src/lib/manuscript";
import { markdownHtml } from "../src/lib/export-text";
import { jobRequestSchema } from "../src/lib/domain";

test("book blocks preserve quotations, notes, print page breaks and ordinary prose", () => {
  const input = "# Chapter\n\nA reader's introduction.\n\n> A thoughtful quote\n\n> [!NOTE] Helpful reading note\n\n[[pagebreak]]\n\nThe next printed page.";
  const blocks = parseManuscript(input);
  assert.deepEqual(blocks.map(x=>x.type),["heading","paragraph","quote","note","pagebreak","paragraph"]);
  assert.equal(blocks[3].type,"note");
  if (blocks[3].type==="note") assert.equal(blocks[3].text,"Helpful reading note");
  const html=markdownHtml(input);
  assert.match(html,/<blockquote class="book-quote">/);
  assert.match(html,/<aside class="book-note">/);
  assert.match(html,/<div class="page-break"/);
  assert.match(html,/The next printed page/);
});

test("rich editorial blocks never interpret untrusted HTML", () => {
  const rendered = markdownHtml("> <script>alert('x')</script>\n\n> [!NOTE] <img src=x onerror=alert(1)>");
  assert.doesNotMatch(rendered,/<script>|<img /);
  assert.match(rendered,/&lt;script&gt;/);
  assert.match(rendered,/&lt;img/);
});

test("contextual AI edit accepts simplify and bounded author directions", () => {
  const request={kind:"text_edit",chapter_id:randomUUID(),request_id:randomUUID(),text_start:3,text_end:35};
  assert.equal(jobRequestSchema.safeParse({...request,text_action:"simplify"}).success,true);
  assert.equal(jobRequestSchema.safeParse({...request,text_action:"custom",text_instruction:"Make it simpler"}).success,true);
  assert.equal(jobRequestSchema.safeParse({...request,text_action:"custom",text_instruction:"x".repeat(600)}).success,false);
  assert.equal(jobRequestSchema.safeParse({...request,text_action:"unknown"}).success,false);
});
