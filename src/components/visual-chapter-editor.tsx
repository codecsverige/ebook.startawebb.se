"use client";
import { useMemo, useState, type ReactNode } from "react";
import { parseManuscript, type ManuscriptBlock } from "@/lib/manuscript";
import type { Illustration } from "@/lib/domain";
import { Markdown } from "./markdown";

type Props = {
  content: string;
  chapterId: string;
  illustrations?: Record<string, Illustration>;
  bookId: string;
  disabled?: boolean;
  onChange: (value: string) => void;
  onInsertImage: (position: number) => void;
  onSelection?: (text: string) => void;
};

function encodeBlock(block: ManuscriptBlock): string {
  if (block.type === "heading") return "#".repeat(block.level) + " " + block.text;
  if (block.type === "paragraph") return block.text;
  if (block.type === "ul") return block.items.map(item => "- " + item).join("\n");
  if (block.type === "ol") return block.items.map((item, i) => (i + 1) + ". " + item).join("\n");
  if (block.type === "divider") return "***";
  if (block.type === "pagebreak") return "[[pagebreak]]";
  if (block.type === "quote") return "> " + block.text;
  if (block.type === "note") return "> [!NOTE] " + block.text;
  return "[[illustration:" + block.id + "]]";
}
export function serializeVisualBlocks(blocks: ManuscriptBlock[]): string {
  return blocks.map(encodeBlock).join("\n\n");
}
/** Serialize only safe semantic inline text; never persist arbitrary pasted HTML. */
function inlineMarkdown(node: Node): string {
  if (node.nodeType === 3) return node.textContent || "";
  if (node.nodeType !== 1) return "";
  const el = node as HTMLElement;
  const value = Array.from(el.childNodes).map(inlineMarkdown).join("");
  if (["STRONG", "B"].includes(el.tagName)) return "**" + value + "**";
  if (["EM", "I"].includes(el.tagName)) return "*" + value + "*";
  if (el.tagName === "BR") return " ";
  return value;
}
function nodeMarkdown(el: HTMLElement): string {
  return Array.from(el.childNodes).map(inlineMarkdown).join("").replace(/\s+/gu, " ").trim();
}
function inlineNodes(value: string): ReactNode {
  return value.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/gu).map((part,i) =>
    part.startsWith("**") && part.endsWith("**")
      ? <strong key={i}>{part.slice(2,-2)}</strong>
      : part.startsWith("*") && part.endsWith("*")
        ? <em key={i}>{part.slice(1,-1)}</em> : part);
}
export function VisualChapterEditor({content, chapterId, illustrations, bookId, disabled=false,
  onChange, onInsertImage, onSelection}: Props) {
  const blocks = useMemo(() => parseManuscript(content), [content]);
  const [active, setActive] = useState<number | null>(null);
  const apply = (index: number, next: ManuscriptBlock[]) => {
    const modified = [...blocks.slice(0,index), ...next, ...blocks.slice(index+1)];
    const text = serializeVisualBlocks(modified);
    if (text.length <= 30000 && text.trim()) onChange(text);
  };
  const insert = (index: number, type: "paragraph" | "heading" | "divider" | "quote" | "note" | "pagebreak" | "ul") => {
    if (disabled) return;
    const newBlock: ManuscriptBlock = type === "paragraph"
      ? {type:"paragraph",text:"New paragraph"}
      : type === "heading" ? {type:"heading",level:2,text:"New heading"}
      : type === "quote" ? {type:"quote",text:"A meaningful quotation"}
      : type === "note" ? {type:"note",text:"A useful note for your reader"}
      : type === "ul" ? {type:"ul",items:["List item"]}
      : type === "pagebreak" ? {type:"pagebreak"}
      : {type:"divider"};
    const newBlocks = [...blocks.slice(0,index),newBlock,...blocks.slice(index)];
    const text = serializeVisualBlocks(newBlocks);
    if (text.length <= 30000) onChange(text);
  };
  const at = (index: number) => serializeVisualBlocks(blocks.slice(0,index)).length +
    (index > 0 ? 2 : 0);
  const menu = (index: number) => <div className="visual-insert-bar" key={"plus-"+index}>
    <button type="button" disabled={disabled} onClick={()=>insert(index,"paragraph")} title="Add paragraph">+ {/** text */}¶</button>
    <button type="button" disabled={disabled} onClick={()=>insert(index,"heading")} title="Add heading">+ H</button>
    <button type="button" disabled={disabled} onClick={()=>onInsertImage(at(index))} title="Insert image">+ ◩</button>
    <button type="button" disabled={disabled} onClick={()=>insert(index,"quote")} title="Add quotation">+ ❝</button>
    <button type="button" disabled={disabled} onClick={()=>insert(index,"note")} title="Add note box">+ ▤</button>
    <button type="button" disabled={disabled} onClick={()=>insert(index,"ul")} title="Add list">+ ☷</button>
    <button type="button" disabled={disabled} onClick={()=>insert(index,"divider")} title="Add divider">+ ✦</button>
    <button type="button" disabled={disabled} onClick={()=>insert(index,"pagebreak")} title="Page break">+ ↴</button>
  </div>;
  return <div className="visual-manuscript" aria-label="Visual chapter editor" data-chapter={chapterId}
    onMouseUp={()=>onSelection?.(window.getSelection()?.toString() || "")}
    onKeyUp={()=>onSelection?.(window.getSelection()?.toString() || "")}>
    <p className="visual-hint">✦ Select and edit each paragraph directly. Changes save when leaving a block. Use + to insert content between paragraphs.</p>
    {menu(0)}
    {blocks.map((block,index) => {
      if (block.type === "illustration" || block.type === "divider" || block.type === "pagebreak")
        return <div key={chapterId+"-"+index} className="visual-block-static">
          <Markdown text={encodeBlock(block)} illustrations={illustrations} bookId={bookId}/>
          {menu(index+1)}
        </div>;
      const editable = (tag: "h3" | "p" | "div", body: ReactNode, save: (text:string)=>void) => {
        const Tag = tag;
        return <Tag key={chapterId+"-"+index} className="visual-editable"
          contentEditable={!disabled} suppressContentEditableWarning
          spellCheck
          dir="auto"
          onFocus={()=>setActive(index)}
          onBlur={e=>{setActive(null); const value=nodeMarkdown(e.currentTarget);
            if(value) save(value);
            else if(blocks.length>1) apply(index,[]);}}
          >{body}</Tag>;
      };
      if (block.type === "heading") return <div key={index} className="visual-block">
        {editable("h3",inlineNodes(block.text),text=>apply(index,[{...block,text}]))}
        {menu(index+1)}
      </div>;
      if (block.type === "quote" || block.type === "note") return <div key={index} className={"visual-block visual-"+block.type}>
        {editable("p",inlineNodes(block.text),text=>apply(index,[{...block,text}]))}
        {menu(index+1)}
      </div>;
      if (block.type === "paragraph") return <div key={index} className="visual-block">
        {editable("p",inlineNodes(block.text),text=>apply(index,[{...block,text}]))}
        {menu(index+1)}
      </div>;
      return <div key={index} className="visual-block">
        {(block.items).map((item,i)=> <div key={i} className="visual-list-row">
          <span aria-hidden="true">{block.type === "ol" ? i+1+"." : "•"}</span>
          {editable("div",inlineNodes(item),text=>{
            const items=[...block.items];items[i]=text;apply(index,[{...block,items}]);})}
        </div>)}
        {menu(index+1)}
      </div>;
    })}
    {active!==null && <div className="visual-selected-indicator">Editing paragraph {active+1}</div>}
  </div>;
}
