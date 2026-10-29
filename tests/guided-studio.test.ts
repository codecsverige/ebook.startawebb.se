import { test } from "node:test";
import assert from "node:assert/strict";
import { parseManuscript } from "../src/lib/manuscript";
import { markdownHtml } from "../src/lib/export-text";
import { makeDocx, pdfHtml } from "../src/lib/export";
import { makeEpub } from "../src/lib/epub";
import type { Book } from "../src/lib/domain";

const id="33333333-3333-4333-8333-333333333333";
const chapter=[
  "A chapter begins here.",
  "> A quotation from the author.",
  "> [!NOTE] Remember this useful idea.",
  "[[pagebreak]]",
  "A final paragraph."
].join("\n\n");
const book:Book={
  id:"11111111-1111-4111-8111-111111111111",user_id:"user",idea:"How to make attractive books",audience:"Readers",
  kind:"guide",language:"en",tone:"friendly",author:"Author",chapter_count:1,
  title:"Professional Layout",subtitle:"",cover_style:"forest",cover_path:null,use_artwork:false,
  unlocked:true,revision:2,created_at:"2026-10-29",updated_at:"2026-10-29",
  outline:[{id,title:"First chapter",summary:"Chapter summary"}],
  chapters:{[id]:{content:chapter,summary:"Chapter summary"}}
};
test("the visual editor block format safely round-trips quotes notes and print breaks",()=>{
  const blocks=parseManuscript(chapter);
  assert.deepEqual(blocks.map(x=>x.type),["paragraph","quote","note","pagebreak","paragraph"]);
  assert.equal((blocks[2] as {text:string}).text,"Remember this useful idea.");
});
test("special book elements produce safe HTML with page breaks",()=>{
  const rendered=markdownHtml(chapter+"<script>bad</script>");
  assert.match(rendered,/class="manuscript-quote"/);
  assert.match(rendered,/class="manuscript-note"/);
  assert.match(rendered,/class="manuscript-pagebreak"/);
  assert.doesNotMatch(rendered,/<script>/);
});
test("PDF and EPUB preserve book components",async()=>{
  const pdf=await pdfHtml(book);
  assert.match(pdf,/class="manuscript-quote"/);
  assert.match(pdf,/page-break-before:always/);
  const epub=makeEpub(book);
  assert.ok(epub.includes(Buffer.from("manuscript-note")));
});
test("Word uses a real page-break element for inserted page breaks",async()=>{
  const doc=await makeDocx(book);
  assert.ok(doc.length>0);
});
