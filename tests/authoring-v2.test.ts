import { test } from "node:test";
import assert from "node:assert/strict";
import { editBookSchema, jobRequestSchema, type Book } from "../src/lib/domain";
import { parseDocxManuscript, parseTextManuscript } from "../src/lib/docx-import";
import { directFormat } from "../src/lib/direct-openai";
import { makeDocx, pdfHtml } from "../src/lib/export";
import { makeEpub } from "../src/lib/epub";
import { parseManuscript } from "../src/lib/manuscript";

const chapter="33333333-3333-4333-8333-333333333333";
const sample:Book={
  id:"11111111-1111-4111-8111-111111111111",user_id:"user",
  idea:"Making illustrated books with a flexible editor and export.",
  audience:"Readers",kind:"guide",language:"en",tone:"friendly",
  author:"Writer",chapter_count:1,title:"The Book",subtitle:"An example",
  cover_style:"forest",cover_path:null,use_artwork:false,unlocked:true,
  revision:1,created_at:"2026-10-29",updated_at:"2026-10-29",
  copyright_notice:"© 2026 Writer. All rights reserved.",
  acknowledgments:"Thank you to the readers.",
  layout_theme:"literary",
  outline:[{id:chapter,title:"A beginning",summary:"A simple start"}],
  chapters:{[chapter]:{content:"A pleasant first paragraph.\n\nA thoughtful second paragraph.",summary:"A chapter summary."}},
};
const base={
  revision:1,title:"A",subtitle:"",author:"Writer",cover_style:"forest",
  use_artwork:false,outline:sample.outline,chapters:sample.chapters,
};
test("one to thirty authored chapters are valid, but never 31",()=>{
  assert.equal(editBookSchema.safeParse(base).success,true);
  const many=[sample.outline[0],...Array.from({length:29},(_,i)=>({...sample.outline[0],id:(
    (i+1).toString(16).padStart(8,"0")+"-3333-4333-8333-333333333333"
  )}))];
  assert.equal(editBookSchema.safeParse({...base,outline:many}).success,true);
  assert.equal(editBookSchema.safeParse({...base,outline:[...many,many[0]]}).success,false);
});
test("AI text edit accepts bounded selection and rejects unrecognized actions",()=>{
  const request={kind:"text_edit",chapter_id:chapter,request_id:sample.id,text_action:"proofread",
    text_start:0,text_end:20};
  assert.equal(jobRequestSchema.safeParse(request).success,true);
  assert.equal(jobRequestSchema.safeParse({...request,text_action:"copy"}).success,false);
  assert.deepEqual(Object.keys(directFormat("text_edit").schema.properties),["replacement"]);
});
test("Markdown import splits on headings and limits file sizes",()=>{
  const sections=parseTextManuscript("# One\nThis is one.\n\n# Two\nThis is two.");
  assert.equal(sections.length,2);
  assert.equal(sections[1].title,"Two");
  assert.throws(()=>parseTextManuscript("a".repeat(300000)),/invalid_input/);
});
test("DOCX importer reads an actual generated Word document",async()=>{
  const docx=await makeDocx(sample);
  const sections=parseDocxManuscript(docx);
  assert.ok(sections.length>=1);
  assert.ok(sections.some(x=>x.content.includes("A pleasant first paragraph.")));
  assert.throws(()=>parseDocxManuscript(Buffer.from("not a zip")) ,/invalid_input/);
});
test("copyright and acknowledgments survive PDF and EPUB rendering",async()=>{
  const html=await pdfHtml(sample);
  assert.ok(html.indexOf("All rights reserved")<html.indexOf('class="toc"'));
  assert.ok(html.indexOf("Thank you to the readers.")>html.indexOf('class="chapter"'));
  const epub=makeEpub(sample).toString("utf8");
  assert.match(epub,/copyright.xhtml/);
  assert.match(epub,/acknowledgments.xhtml/);
  assert.match(epub,/<itemref idref="copyright"\/>/);
  assert.match(epub,/<itemref idref="acknowledgments"\/>/);
});
test("paragraph blocks retain meaning in the source parser",()=>{
  assert.deepEqual(parseManuscript("One\n\n## Two").map(x=>x.type),["paragraph","heading"]);
});
