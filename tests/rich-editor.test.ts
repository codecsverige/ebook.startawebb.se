import { test } from "node:test";
import assert from "node:assert/strict";
import { manuscriptDocument, richNodeSize, serializeRichDocument } from "../src/lib/rich-manuscript";
import { inlineRuns, parseManuscript } from "../src/lib/manuscript";
import { markdownHtml } from "../src/lib/export-text";
import { readDraft, restoreDraft, writeDraft, draftKey } from "../src/lib/draft-storage";
import { DraftHistory } from "../src/lib/draft-history";
import type { BookWithCover } from "../src/lib/domain";
const chapter = "11111111-1111-4111-8111-111111111111";
const image = "22222222-2222-4222-8222-222222222222";
const book: BookWithCover = {
  id:"33333333-3333-4333-8333-333333333333",user_id:"author-1",revision:2,
  title:"Book",subtitle:"",author:"Author",idea:"An original book for readers.",audience:"Adults",
  language:"ar",kind:"novel",tone:"literary",chapter_count:1,cover_style:"ivory",cover_path:null,
  use_artwork:false,unlocked:true,created_at:"2026-10-01T00:00:00Z",updated_at:"2026-10-01T00:00:00Z",
  outline:[{id:chapter,title:"Opening",summary:"The story opens."}],
  chapters:{[chapter]:{content:"Original paragraph.",summary:"The story opens."}},
};
test("rich editor preserves semantic content, inline styles, alignment and image markers through reload",()=>{
  const input=`[[align:center]]\n## العنوان\n\nهذه فقرة **غامقة** مع _كلمات مائلة_.\n\n> اقتباس واضح\n\n> [!NOTE] ملاحظة مهمة\n\n- الأول\n- الثاني\n\n1. واحد\n2. اثنان\n\n[[illustration:${image}]]\n\n***\n\n[[pagebreak]]`;
  const serialized=serializeRichDocument(manuscriptDocument(input)).text;
  // Asterisks and underscores are equivalent Markdown italic delimiters.
  // The editor normalizes their spelling but must preserve the rendered semantics.
  assert.deepEqual(parseManuscript(serialized),parseManuscript(input.replace("_كلمات مائلة_","*كلمات مائلة*")));
  assert.equal(serializeRichDocument(manuscriptDocument(serialized)).text,serialized);
  assert.match(markdownHtml(serialized),/style="text-align:center"/);
  assert.match(markdownHtml(serialized),/<strong>غامقة<\/strong>/);
  assert.match(markdownHtml(serialized),/<em>كلمات مائلة<\/em>/);
});
test("AI positions select the second identical passage without searching by text",()=>{
  const doc=manuscriptDocument("Same passage.\n\nSame passage.");
  const second=richNodeSize(doc.content![0]);
  const result=serializeRichDocument(doc),range=result.range(second+1,second+1+"Same passage.".length);
  assert.equal(range.text,"Same passage.");
  assert.equal(range.start,"Same passage.\n\n".length);
});
test("overlapping bold and italic ranges keep their text and marks",()=>{
  const doc={type:"doc",content:[{type:"paragraph",content:[
    {type:"text",text:"One ",marks:[{type:"bold"}]},
    {type:"text",text:"two",marks:[{type:"bold"},{type:"italic"}]},
    {type:"text",text:" three",marks:[{type:"italic"}]},
  ]}]};
  const text=serializeRichDocument(doc).text;
  const runs=inlineRuns(text);
  assert.equal(runs.map(r=>r.text).join(""),"One two three");
  assert.equal(runs.find(r=>r.text==="two")?.bold,true);
  assert.equal(runs.find(r=>r.text==="two")?.italic,true);
});
test("pasted markup stays escaped in exports",()=>{
  const doc={type:"doc",content:[{type:"paragraph",content:[{type:"text",text:'<img src=x onerror=alert(1)> _literal_ *literal*'}]}]};
  const text=serializeRichDocument(doc).text;
  assert.doesNotMatch(markdownHtml(text),/<img|<script|<em>/);
  assert.match(markdownHtml(text),/_literal_/);
});
test("drafts survive a new storage reader and a changed server revision, but never cross accounts",()=>{
  const map=new Map<string,string>();
  const storage={getItem:(k:string)=>map.get(k)||null,setItem:(k:string,v:string)=>{map.set(k,v);},removeItem:(k:string)=>{map.delete(k);}};
  const changed={...book,chapters:{[chapter]:{...book.chapters[chapter],content:"Unsynced text."}}};
  writeDraft(storage,changed);
  const cloud={...book,revision:8,unlocked:false,cover_path:"server-owned.png"};
  const recovered=readDraft(storage,cloud);
  assert.ok(recovered);
  const restored=restoreDraft(cloud,recovered.book);
  assert.equal(restored.revision,8);assert.equal(restored.unlocked,false);assert.equal(restored.cover_path,"server-owned.png");
  assert.equal(restored.chapters[chapter].content,"Unsynced text.");
  assert.equal(readDraft(storage,{...cloud,user_id:"someone-else"}),null);
  map.set(draftKey(book.id),"bad json");assert.equal(readDraft(storage,cloud),null);
});
test("undo and redo preserve the latest cloud revision and current media",()=>{
  const history=new DraftHistory(),changed={...book,chapters:{[chapter]:{...book.chapters[chapter],content:"New text."}}};
  history.record(book,changed);
  const live={...changed,revision:12,illustrations:{[image]:{id:image,source:"library" as const,preset:"stars" as const,alt:"",caption:"",size:"medium" as const}}};
  const undone=history.undo(live)!;assert.equal(undone.chapters[chapter].content,"Original paragraph.");assert.equal(undone.revision,12);assert.ok(undone.illustrations?.[image]);
  assert.equal(history.redo(undone)?.chapters[chapter].content,"New text.");
});
test("a blank chapter remains an editable draft and is not a completed book",async()=>{
  const {editBookSchema,isComplete}=await import("../src/lib/domain");
  const empty={...book,chapters:{[chapter]:{content:"",summary:""}}};
  assert.equal(editBookSchema.safeParse(empty).success,true);assert.equal(isComplete(empty),false);
});
