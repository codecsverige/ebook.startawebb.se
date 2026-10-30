import {test} from "node:test";
import assert from "node:assert/strict";
import {editBookSchema} from "../src/lib/domain";
import {editableBook, readDraft, restoreDraft, writeDraft} from "../src/lib/draft-storage";
import type {BookWithCover} from "../src/lib/domain";

const chapter="e0b9a35b-b8c3-4acc-814a-ebfbf0e0adf7";
const book:BookWithCover={
  id:"019692c7-fd2a-4a64-9f5d-22a0113efaca",user_id:"test-user",
  idea:"A detailed original book about writing clear memorable stories for children.",
  audience:"Children and families",kind:"children_story",language:"ar",tone:"playful",
  author:"",chapter_count:5, title:"", subtitle:"", cover_style:"sky",
  cover_path:null,use_artwork:false,unlocked:true,revision:0,
  created_at:"2026-10-30T00:00:00Z",updated_at:"2026-10-30T00:00:00Z",
  outline:[],chapters:{},
};
test("author can edit initial brief before creating any chapters",()=>{
  const fields=editableBook(book);
  assert.equal(fields.chapter_count,5);
  assert.equal(editBookSchema.safeParse(fields).success,true);
  assert.equal(fields.idea,book.idea);
  assert.equal(fields.kind,book.kind);
  assert.equal(fields.tone,book.tone);
});
test("editing idea cannot implicitly erase existing chapters",()=>{
  const existing={...book,chapter_count:1,title:"Adventure",
    outline:[{id:chapter,title:"Chapter one",summary:"The opening."}],
    chapters:{[chapter]:{content:"A manuscript remains untouched.",summary:"The opening."}}};
  const fields=editableBook({...existing,idea:"A different perspective on writing a long fictional adventure."});
  assert.equal(editBookSchema.safeParse(fields).success,true);
  assert.equal(fields.chapters[chapter].content,"A manuscript remains untouched.");
  assert.equal(fields.outline[0].id,chapter);
});
test("empty title is valid only before an outline exists",()=>{
  assert.equal(editBookSchema.safeParse(editableBook(book)).success,true);
  const planned={...book,outline:[{id:chapter,title:"Opening",summary:"An opening."}]};
  assert.equal(editBookSchema.safeParse(editableBook(planned)).success,false);
});
test("offline idea revisions survive restore without reverting the cloud revision or permissions",()=>{
  const map=new Map<string,string>();
  const storage={getItem:(k:string)=>map.get(k)||null,setItem:(k:string,v:string)=>{map.set(k,v);},removeItem:(k:string)=>{map.delete(k);}};
  writeDraft(storage,{...book,idea:"An updated book idea that must survive an accidental browser close."});
  const server={...book,revision:7,unlocked:false,created_at:"2026-10-30T00:00:00Z"};
  const saved=readDraft(storage,server);
  assert.ok(saved);
  const restored=restoreDraft(server,saved.book);
  assert.equal(restored.idea,"An updated book idea that must survive an accidental browser close.");
  assert.equal(restored.revision,7);
  assert.equal(restored.unlocked,false);
  assert.deepEqual(restored.outline,[]);
});
