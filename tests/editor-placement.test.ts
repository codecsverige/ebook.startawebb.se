import {test} from "node:test";
import assert from "node:assert/strict";
import {parseManuscript} from "../src/lib/manuscript";
import {serializeVisualBlocks} from "../src/components/visual-chapter-editor";

test("image placement at + between two paragraphs remains exactly between them",()=>{
  const source="First paragraph, unchanged.\n\nSecond paragraph, unchanged.";
  const blocks=parseManuscript(source);
  const canonical=serializeVisualBlocks(blocks);
  assert.equal(canonical,source);
  const position=serializeVisualBlocks(blocks.slice(0,1)).length+2;
  const imageId="11111111-1111-4111-8111-111111111111";
  const result=canonical.slice(0,position)+"\n\n[[illustration:"+imageId+"]]\n\n"+canonical.slice(position);
  assert.deepEqual(parseManuscript(result).map(b=>b.type),["paragraph","illustration","paragraph"]);
  assert.equal((parseManuscript(result)[0] as {text:string}).text,"First paragraph, unchanged.");
  assert.equal((parseManuscript(result)[2] as {text:string}).text,"Second paragraph, unchanged.");
});
test("block insertion preserves semantic blocks and does not place image inside quote",()=>{
  const source="Intro\n\n> A quote\n\n> [!NOTE] Note\n\nLast line";
  const blocks=parseManuscript(source);
  const canonical=serializeVisualBlocks(blocks);
  const position=serializeVisualBlocks(blocks.slice(0,3)).length+2;
  const id="22222222-2222-4222-8222-222222222222";
  const content=canonical.slice(0,position)+"\n\n[[illustration:"+id+"]]\n\n"+canonical.slice(position);
  assert.deepEqual(parseManuscript(content).map(b=>b.type),
    ["paragraph","quote","note","illustration","paragraph"]);
});
