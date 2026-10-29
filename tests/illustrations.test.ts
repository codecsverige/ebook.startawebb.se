import { test } from "node:test";
import assert from "node:assert/strict";
import { parseManuscript } from "../src/lib/manuscript";
import { markdownHtml } from "../src/lib/export-text";
import { editBookSchema, illustrationMarker, type Book, type Illustration } from "../src/lib/domain";
import { pdfHtml, makeDocx } from "../src/lib/export";
import { makeEpub } from "../src/lib/epub";

const chapter = "22222222-2222-4222-8222-222222222222";
const imageId = "33333333-3333-4333-8333-333333333333";
const image: Illustration = {
  id:imageId,source:"library",preset:"mountain",
  alt:"Mountain sunrise",caption:"Chapter scene",size:"small",
};
const book:Book = {
  id:"11111111-1111-4111-8111-111111111111",user_id:"user",
  idea:"A detailed book idea for testing images.",audience:"Readership",
  kind:"guide",language:"en",tone:"friendly",author:"Author",
  chapter_count:3,title:"Illustrated guide",subtitle:"Examples",
  cover_style:"cobalt",cover_path:null,use_artwork:false,
  unlocked:true,revision:1,created_at:"2026-10-29",updated_at:"2026-10-29",
  outline:[{id:chapter,title:"First",summary:"Introduction"}],
  chapters:{[chapter]:{content:"A paragraph.\n\n"+illustrationMarker(imageId)+"\n\n***\n\nAnother paragraph.",summary:"Intro"}},
  illustrations:{[imageId]:image},
};
const imageBytes = Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLttAAAAABJRU5ErkJggg==","base64"));
const assets = { [imageId]:{data:imageBytes,type:"image/png",meta:image} };

test("images and scene breaks parse as safe standalone blocks",()=>{
  const blocks=parseManuscript(book.chapters[chapter].content);
  assert.deepEqual(blocks.map(x=>x.type),["paragraph","illustration","divider","paragraph"]);
  assert.equal(markdownHtml(book.chapters[chapter].content),"<p>A paragraph.</p><div class=\"scene-divider\" aria-hidden=\"true\">✦ &nbsp; ✦ &nbsp; ✦</div><p>Another paragraph.</p>");
  assert.match(markdownHtml(book.chapters[chapter].content,{[imageId]:"<figure>trusted</figure>"}), /<figure>trusted<\/figure>/);
});

test("PDF renders embedded images only from bound book assets",async()=>{
  const html=await pdfHtml(book,undefined,assets);
  assert.match(html,/data:image\/png;base64/);
  assert.match(html,/Chapter scene/);
  assert.match(html,/scene-divider/);
});

test("EPUB packages illustration bytes, manifest and caption",()=>{
  const file=makeEpub(book,undefined,assets).toString("utf8");
  assert.match(file,new RegExp("OEBPS/images/"+imageId+"\\.png"));
  assert.match(file,new RegExp('id="img-'+imageId+'"'));
  assert.match(file,/Chapter scene/);
  assert.match(file,/scene-divider/);
});

test("Word exports embedded PNG and preserves the caption",async()=>{
  const bytes=await makeDocx(book,undefined,assets);
  assert.ok(bytes.length>2000);
  assert.match(bytes.toString("latin1"),/word\/media\/image/);
});

test("book editing never accepts forged illustration metadata via PATCH",()=>{
  const input={
    revision:1,title:book.title,subtitle:book.subtitle,author:book.author,
    cover_style:book.cover_style,use_artwork:false,outline:[
      book.outline[0],
      {id:"44444444-4444-4444-8444-444444444444",title:"Second",summary:"Next"},
      {id:"55555555-5555-4555-8555-555555555555",title:"Third",summary:"Final"},
    ],chapters:book.chapters,illustrations:{evil:{path:"other-user-file"}},
  };
  const parsed=editBookSchema.parse(input);
  assert.equal("illustrations" in parsed,false);
});
