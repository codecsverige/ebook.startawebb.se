"use client";
import { useMemo, useState, type ReactNode } from "react";
import { parseManuscript, type ManuscriptBlock } from "@/lib/manuscript";
import type { Illustration, Locale } from "@/lib/domain";
import { tr } from "@/lib/i18n";
import { Markdown } from "./markdown";

type Props = {
  content: string;
  chapterId: string;
  locale?: Locale;
  illustrations?: Record<string, Illustration>;
  bookId: string;
  disabled?: boolean;
  onChange: (value: string) => void;
  onInsertImage: (position: number, canonicalContent: string) => void;
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
export function VisualChapterEditor({content, chapterId, illustrations, bookId, locale="en", disabled=false,
  onChange, onInsertImage, onSelection}: Props) {
  const blocks = useMemo(() => parseManuscript(content), [content]);
  const [active, setActive] = useState<number | null>(null);
  const [menuAt, setMenuAt] = useState<number | null>(null);
  const [insertDraft, setInsertDraft] = useState<{ index: number; type: "paragraph" | "heading" | "quote" | "note" | "ul" } | null>(null);
  const [insertText, setInsertText] = useState("");
  const apply = (index: number, next: ManuscriptBlock[]) => {
    const modified = [...blocks.slice(0,index), ...next, ...blocks.slice(index+1)];
    const text = serializeVisualBlocks(modified);
    if (text.length <= 30000 && text.trim()) onChange(text);
  };
  const insert = (index: number, type: "paragraph" | "heading" | "divider" | "quote" | "note" | "pagebreak" | "ul", value = "") => {
    if (disabled) return;
    const clean = value.trim().slice(0, 3000);
    if (!["divider","pagebreak"].includes(type) && !clean) return;
    const newBlock: ManuscriptBlock = type === "paragraph"
      ? {type:"paragraph", text:clean}
      : type === "heading" ? {type:"heading",level:2,text:clean}
      : type === "quote" ? {type:"quote",text:clean}
      : type === "note" ? {type:"note",text:clean}
      : type === "ul" ? {type:"ul",items:clean.split(/\n+/).map(item=>item.trim()).filter(Boolean)}
      : type === "pagebreak" ? {type:"pagebreak"}
      : {type:"divider"};
    const text = serializeVisualBlocks([...blocks.slice(0,index),newBlock,...blocks.slice(index)]);
    if (text.length <= 30000) onChange(text);
    setMenuAt(null);
    setInsertDraft(null);
    setInsertText("");
  };
  const at = (index: number) => serializeVisualBlocks(blocks.slice(0,index)).length + (index>0?2:0);
  const add = (index: number, type: "paragraph" | "heading" | "divider" | "quote" | "note" | "pagebreak" | "ul") => {
    if (type==="divider" || type==="pagebreak") { insert(index,type); return; }
    setInsertDraft({index,type});
    setInsertText("");
  };
  const menu = (index: number) => <div className={"visual-insert-bar"+(menuAt===index?" is-open":"")} key={"plus-"+index}>
    <button type="button" className="visual-add-trigger" disabled={disabled}
      aria-expanded={menuAt===index}
      aria-label={tr(locale, index===0?"Insert at chapter beginning":"Insert after paragraph",index===0?"إضافة في بداية الفصل":"إضافة بعد هذه الفقرة",index===0?"Infoga i början":"Infoga efter stycke")}
      onClick={()=>{setMenuAt(menuAt===index?null:index);setInsertDraft(null);setInsertText("");}}>
      <span aria-hidden="true">+</span><span>{tr(locale,"Add","إضافة","Lägg till")}</span>
    </button>
    {menuAt===index && <div className="visual-add-options" role="group"
      aria-label={tr(locale,"Insert at this exact position","إضافة في هذا الموضع بالتحديد","Infoga här")}>
      {([
        ["paragraph",tr(locale,"Text","نص","Text")],
        ["heading",tr(locale,"Heading","عنوان","Rubrik")],
        ["quote",tr(locale,"Quote","اقتباس","Citat")],
        ["note",tr(locale,"Note","ملاحظة","Anteckning")],
        ["ul",tr(locale,"List","قائمة","Lista")],
      ] as const).map(([type,label])=><button key={type} type="button" disabled={disabled}
        onClick={()=>add(index,type)}>{label}</button>)}
      <button type="button" disabled={disabled} onClick={()=>{setMenuAt(null);setInsertDraft(null);onInsertImage(at(index),serializeVisualBlocks(blocks));}}>
        {tr(locale,"Image / logo","صورة أو شعار","Bild / logotyp")}
      </button>
      <button type="button" disabled={disabled} onClick={()=>add(index,"divider")}>
        {tr(locale,"Divider","فاصل زخرفي","Avdelare")}
      </button>
      <button type="button" disabled={disabled} onClick={()=>add(index,"pagebreak")}>
        {tr(locale,"Print page break","فاصل صفحة للطباعة","Sidbrytning")}
      </button>
      {insertDraft?.index===index&&<div className="visual-add-compose">
        <label>{tr(locale,"Enter the content to insert here","اكتب المحتوى الذي تريد إضافته هنا","Skriv innehållet här")}
          <textarea autoFocus rows={insertDraft.type==="ul"?4:3} maxLength={3000}
            value={insertText} onChange={e=>setInsertText(e.target.value)}
            placeholder={insertDraft.type==="ul"
              ?tr(locale,"Each list item on a separate line","كل عنصر في سطر مستقل","En punkt per rad")
              :tr(locale,"Write the text here, then tap Insert","اكتب النص ثم اضغط إدراج","Skriv text och tryck Infoga")}/>
        </label>
        <div>
          <button type="button" disabled={!insertText.trim()||disabled} className="visual-confirm-insert"
            onClick={()=>insert(index,insertDraft.type,insertText)}>{tr(locale,"Insert here","إدراج هنا","Infoga här")}</button>
          <button type="button" onClick={()=>{setInsertDraft(null);setInsertText("");}}>
            {tr(locale,"Cancel","إلغاء","Avbryt")}</button>
        </div>
      </div>}
    </div>}
  </div>;
  return <div className="visual-manuscript" aria-label="Visual chapter editor" data-chapter={chapterId}
    onMouseUp={()=>onSelection?.(window.getSelection()?.toString() || "")}
    onKeyUp={()=>onSelection?.(window.getSelection()?.toString() || "")}>
    <p className="visual-hint">✦ {tr(locale,"Edit paragraphs directly. Use + between paragraphs to add elements.","عدّل الفقرات مباشرة، واضغط + بين الفقرات لإضافة العناصر.","Redigera direkt. Använd + mellan stycken för att lägga till innehåll.")}</p>
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
    {active!==null && <div className="visual-selected-indicator">{tr(locale,"Editing paragraph","تحرير الفقرة","Redigerar stycke")} {active+1}</div>}
  </div>;
}
