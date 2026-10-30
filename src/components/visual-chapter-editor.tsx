"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Extension, Node, type Editor, type JSONContent } from "@tiptap/core";
import { EditorContent, NodeViewWrapper, ReactNodeViewRenderer, useEditor, useEditorState, type NodeViewProps } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { NodeSelection, Plugin, TextSelection } from "@tiptap/pm/state";
import { ArrowUp, ArrowDown, Bold, Italic, Plus, Copy, Trash2, Undo2, Redo2, Sparkles, Search, Maximize2, Minimize2, SlidersHorizontal, ArrowUpToLine, ArrowDownToLine, MoreHorizontal } from "lucide-react";
import type { Illustration, Locale } from "@/lib/domain";
import { tr } from "@/lib/i18n";
import { manuscriptDocument, serializeRichDocument } from "@/lib/rich-manuscript";
import { Dialog } from "./dialog";
export { serializeVisualBlocks } from "@/lib/rich-manuscript";
export type VisualSelection = { text: string; start: number; end: number; content: string };
type Props = {
  content: string; chapterId: string; locale?: Locale; language?: Locale;
  illustrations?: Record<string, Illustration>; bookId: string; disabled?: boolean;
  onChange: (value: string, typing?: boolean) => void;
  onInsertImage: (position: number, canonicalContent: string, replaceId?: string) => void;
  onSelection?: (selection: VisualSelection) => void;
  onSaveImage?: (id: string, size: "small" | "medium" | "full", caption: string) => void;
  onDeleteImage?: (id: string) => void;
  onUndo?: () => void; onRedo?: () => void; canUndo?: boolean; canRedo?: boolean;
  onAI?: (selection: VisualSelection, action: "improve" | "proofread" | "shorten" | "expand" | "simplify") => void;
  aiEnabled?: boolean; chapters?: { id: string; title: string }[];
  onMoveToChapter?: (block: string, remaining: string, target: string) => boolean;
};
function ImageView({ node, selected }: NodeViewProps) {
  return <NodeViewWrapper as="figure" className={`manuscript-figure figure-${node.attrs.size || "medium"}${selected ? " is-selected" : ""}`} contentEditable={false} data-drag-handle>
    {node.attrs.src ? <img src={node.attrs.src} alt={node.attrs.alt || node.attrs.caption || ""} draggable={false}/> : <span>▧</span>}
    {node.attrs.caption && <figcaption>{node.attrs.caption}</figcaption>}
  </NodeViewWrapper>;
}
const BookImage = Node.create({
  name: "bookImage", group: "block", atom: true, draggable: true,
  addAttributes: () => Object.fromEntries(["id","src","alt","caption","size"].map(key=>[key,{default:""}])),
  parseHTML: () => [{tag:"figure[data-book-image]"}],
  renderHTML: ({HTMLAttributes}) => ["figure",{"data-book-image":HTMLAttributes.id}],
  addNodeView: () => ReactNodeViewRenderer(ImageView),
});
const PageBreak = Node.create({
  name:"bookPageBreak",group:"block",atom:true,
  parseHTML:()=>[{tag:"div[data-book-page-break]"}],
  renderHTML:()=>["div",{"data-book-page-break":"",class:"rich-page-break"},"✂"],
});
const BookNote = Node.create({
  name:"bookNote",group:"block",content:"inline*",defining:true,
  parseHTML:()=>[{tag:"aside[data-book-note]"}],
  renderHTML:({HTMLAttributes})=>["aside",{...HTMLAttributes,"data-book-note":"",class:"book-note"},0],
});
const FlatListItem = Node.create({
  name:"listItem",content:"paragraph",defining:true,
  parseHTML:()=>[{tag:"li"}],renderHTML:()=>["li",0],
  addKeyboardShortcuts(){return {Enter:()=>this.editor.commands.splitListItem("listItem"),"Shift-Tab":()=>this.editor.commands.liftListItem("listItem")};},
});
const Alignment = Extension.create({
  name:"bookAlignment",addGlobalAttributes:()=>[{
    types:["paragraph","heading","blockquote","bookNote","bulletList","orderedList","bookImage"],
    attributes:{textAlign:{default:null,
      parseHTML:el=>["left","right","center","justify"].includes(el.style.textAlign)?el.style.textAlign:null,
      renderHTML:attrs=>attrs.textAlign?{style:`text-align:${attrs.textAlign}`}:{},
    }},
  }],
});
function withMedia(doc:JSONContent,props:Props):JSONContent {
  return {...doc,...(doc.content?{content:doc.content.map(node=>{
    if(node.type!=="bookImage")return withMedia(node,props);
    const asset=props.illustrations?.[node.attrs?.id];
    return {...node,attrs:{...node.attrs,size:asset?.size||"medium",caption:asset?.caption||"",alt:asset?.alt||"",
      src:asset?asset.source==="library"&&asset.preset?`/illustrations/${asset.preset}.png`:`/api/books/${props.bookId}/illustrations/${asset.id}`:""}};
  })}:{})};
}
function blocks(editor:Editor){
  const result:{pos:number;size:number;json:JSONContent}[]=[];
  editor.state.doc.forEach((node,pos)=>result.push({pos,size:node.nodeSize,json:node.toJSON()}));
  return result;
}
export function VisualChapterEditor(props:Props){
  const {locale="en",language=locale,disabled=false,content}=props;
  const latest=useRef(props);latest.current=props;
  const editorRef=useRef<Editor|null>(null),lastEmitted=useRef(content),discrete=useRef(false);
  const [insertOpen,setInsertOpen]=useState(false),[aiOpen,setAiOpen]=useState(false),[toolsOpen,setToolsOpen]=useState(false),[formatOpen,setFormatOpen]=useState(false);
  const [searchOpen,setSearchOpen]=useState(false),[full,setFull]=useState(false),[error,setError]=useState("");
  const [query,setQuery]=useState(""),[replacement,setReplacement]=useState("");
  const [caption,setCaption]=useState(""),[imageSize,setImageSize]=useState<Illustration["size"]>("medium");
  const names:Record<string,string>={
    paragraph:tr(locale,"Text","نص","Text"),heading:tr(locale,"Heading","عنوان","Rubrik"),
    blockquote:tr(locale,"Quote","اقتباس","Citat"),bookNote:tr(locale,"Note","ملاحظة","Anteckning"),
    bulletList:tr(locale,"List","قائمة","Lista"),orderedList:tr(locale,"Numbered list","قائمة مرقمة","Numrerad lista"),
    bookImage:tr(locale,"Image / logo","صورة أو شعار","Bild / logotyp"),horizontalRule:tr(locale,"Divider","فاصل زخرفي","Avdelare"),
    bookPageBreak:tr(locale,"Print page break","فاصل صفحة للطباعة","Sidbrytning"),
  };
  const limit=useMemo(()=>Extension.create({name:"manuscriptLimit",addProseMirrorPlugins(){return [new Plugin({filterTransaction(transaction){
    if(!transaction.docChanged||serializeRichDocument(transaction.doc.toJSON()).text.length<=30000)return true;
    queueMicrotask(()=>setError(tr(latest.current.locale||"en","A chapter can contain 30,000 characters. Split it to continue.","بلغ الفصل 30 ألف حرف. قسّمه إلى فصلين للمتابعة.","Kapitlet får innehålla 30 000 tecken. Dela det för att fortsätta.")));
    return false;
  }})];}}),[]);
  const editor=useEditor({
    extensions:[StarterKit.configure({code:false,codeBlock:false,link:false,underline:false,strike:false,hardBreak:false,undoRedo:false,listItem:false,heading:{levels:[1,2,3,4]}}),FlatListItem,BookImage,PageBreak,BookNote,Alignment,limit],
    content:withMedia(manuscriptDocument(content),props),immediatelyRender:false,editable:!disabled,
    editorProps:{
      attributes:{class:"rich-book-document",dir:language==="ar"?"rtl":"ltr",role:"textbox","aria-multiline":"true","aria-label":tr(locale,"Chapter text","نص الفصل","Kapiteltext"),spellcheck:"true"},
      handleKeyDown:(_view,event)=>{
        if((event.ctrlKey||event.metaKey)&&["z","y"].includes(event.key.toLowerCase())){
          event.preventDefault();if(event.key.toLowerCase()==="y"||event.shiftKey)latest.current.onRedo?.();else latest.current.onUndo?.();return true;
        }return false;
      },
      handlePaste:(_view,event)=>{
        const text=event.clipboardData?.getData("text/plain");if(!text)return false;
        event.preventDefault();discrete.current=true;
        editorRef.current?.chain().focus().insertContent(manuscriptDocument(text.replace(/\r/g,"").replace(/(?<!\n)\n(?!\n)/g,"\n\n")).content||[]).run();
        discrete.current=false;return true;
      },
    },
    onUpdate:({editor:current})=>{
      const value=serializeRichDocument(current.getJSON()).text;
      if(value!==lastEmitted.current){lastEmitted.current=value;latest.current.onChange(value,!discrete.current);}
    },
    onSelectionUpdate:({editor:current})=>{const {from,to}=current.state.selection;if(from!==to)latest.current.onSelection?.(serializeRichDocument(current.getJSON()).range(from,to));},
  });
  editorRef.current=editor;
  const state=useEditorState({editor,selector:({editor:current})=>current?{
    from:current.state.selection.from,to:current.state.selection.to,index:current.state.selection.$from.index(0),
    bold:current.isActive("bold"),italic:current.isActive("italic"),size:current.state.doc.content.size,image:current.isActive("bookImage"),
  }:null});
  useEffect(()=>{editor?.setEditable(!disabled);},[disabled,editor]);
  useEffect(()=>{
    if(!editor||content.trimEnd()===lastEmitted.current.trimEnd())return;
    lastEmitted.current=content;const selection=editor.state.selection.from;
    editor.commands.setContent(withMedia(manuscriptDocument(content),latest.current),{emitUpdate:false});
    editor.commands.setTextSelection(Math.min(selection,Math.max(0,editor.state.doc.content.size-1)));
  },[content,editor]);
  useEffect(()=>{
    if(!editor)return;let transaction=editor.state.tr;
    editor.state.doc.forEach((node,pos)=>{
      if(node.type.name!=="bookImage")return;
      const updated=withMedia({type:"doc",content:[node.toJSON()]},latest.current).content![0];
      if(JSON.stringify(updated.attrs)!==JSON.stringify(node.attrs))transaction=transaction.setNodeMarkup(pos,undefined,updated.attrs);
    });
    if(transaction.docChanged)editor.view.dispatch(transaction);
  },[editor,props.illustrations]);
  useEffect(()=>{if(!full)return;const close=(event:KeyboardEvent)=>{if(event.key==="Escape")setFull(false);};document.addEventListener("keydown",close);return()=>document.removeEventListener("keydown",close);},[full]);
  const all=editor?blocks(editor):[],index=Math.min(state?.index||0,Math.max(0,all.length-1)),active=all[index];
  const asset=active?.json.type==="bookImage"?props.illustrations?.[active.json.attrs?.id]:undefined;
  useEffect(()=>{if(state?.image)setToolsOpen(true);},[state?.image]);
  useEffect(()=>{setCaption(asset?.caption||"");setImageSize(asset?.size||"medium");},[asset?.id,asset?.caption,asset?.size]);
  const run=(fn:()=>void)=>{if(!editor||disabled)return;discrete.current=true;fn();discrete.current=false;setError("");};
  const prepareImage=(replaceId?:string)=>{
    if(!editor||!active)return;
    run(()=>{
      if(!replaceId&&["paragraph","heading","bookNote"].includes(active.json.type||"")&&editor.state.selection.$from.parent.content.size)
        editor.chain().focus().setTextSelection(editor.state.selection.to).splitBlock().run();
      const items=blocks(editor),selected=items[editor.state.selection.$from.index(0)]||items[items.length-1];
      const serialized=serializeRichDocument(editor.getJSON()),pos=replaceId?active.pos:selected.pos;
      latest.current.onInsertImage(serialized.range(pos,pos).start,serialized.text,replaceId);
    });setInsertOpen(false);setToolsOpen(false);
  };
  const insert=(type:string)=>{
    if(type==="bookImage"){prepareImage();return;}
    run(()=>{
      const node:JSONContent=type==="heading"?{type,attrs:{level:2}}:type==="blockquote"?{type,content:[{type:"paragraph"}]}:
        type==="bulletList"||type==="orderedList"?{type,content:[{type:"listItem",content:[{type:"paragraph"}]}]}:{type};
      editor!.chain().focus().insertContent(node).run();
    });setInsertOpen(false);
  };
  const move=(target:number)=>run(()=>{
    if(!editor||!active||target===index||target<0||target>=all.length)return;
    const transaction=editor.state.tr.delete(active.pos,active.pos+active.size);
    const at=target<index?all[target].pos:all[target].pos+all[target].size-active.size;
    transaction.insert(at,editor.state.schema.nodeFromJSON(active.json));
    transaction.setSelection(["bookImage","horizontalRule","bookPageBreak"].includes(active.json.type||"")
      ? NodeSelection.create(transaction.doc,at) : TextSelection.near(transaction.doc.resolve(Math.min(at+1,transaction.doc.content.size))));
    editor.view.dispatch(transaction);editor.commands.focus();
  });
  const ai=(action:"proofread"|"improve"|"shorten"|"expand"|"simplify")=>{
    if(!editor||!active)return;const selection=editor.state.selection,serialized=serializeRichDocument(editor.getJSON());
    props.onAI?.(selection.empty?serialized.range(active.pos,active.pos+active.size):serialized.range(selection.from,selection.to),action);setAiOpen(false);
  };
  const matches=()=>{
    const ranges:{from:number;to:number}[]=[];if(!editor||!query)return ranges;
    editor.state.doc.descendants((node,pos)=>{
      if(!node.isTextblock)return;let start=node.textContent.indexOf(query);
      while(start!==-1){ranges.push({from:pos+1+start,to:pos+1+start+query.length});start=node.textContent.indexOf(query,start+query.length);}return false;
    });return ranges;
  };
  const find=()=>{const ranges=matches(),next=ranges.find(r=>r.from>=(editor?.state.selection.to||0))||ranges[0];if(next)editor?.chain().focus().setTextSelection(next).scrollIntoView().run();};
  return <div className={`rich-studio${full?" is-fullscreen":""}`} data-chapter={props.chapterId}>
    <div className={"rich-toolbar rich-toolbar-compact"+(formatOpen?" is-advanced":"")} role="toolbar" aria-label={tr(locale,"Writing tools","أدوات الكتابة","Skrivverktyg")}>
      <div className="rich-toolbar-primary">
        <button type="button" disabled={disabled||!props.canUndo} onMouseDown={e=>e.preventDefault()} onClick={props.onUndo} aria-label={tr(locale,"Undo","تراجع","Ångra")} title={tr(locale,"Undo","تراجع","Ångra")}><Undo2 size={18}/></button>
        <button type="button" disabled={disabled||!props.canRedo} onMouseDown={e=>e.preventDefault()} onClick={props.onRedo} aria-label={tr(locale,"Redo","إعادة","Gör om")} title={tr(locale,"Redo","إعادة","Gör om")}><Redo2 size={18}/></button>
        <span className="rich-toolbar-divider"/>
        <button type="button" disabled={disabled} aria-pressed={state?.bold||false} aria-label={tr(locale,"Bold","غامق","Fetstil")} onMouseDown={e=>e.preventDefault()} onClick={()=>run(()=>{editor?.chain().focus().toggleBold().run();})}><Bold size={18}/></button>
        <button type="button" disabled={disabled} aria-pressed={state?.italic||false} aria-label={tr(locale,"Italic","مائل","Kursiv")} onMouseDown={e=>e.preventDefault()} onClick={()=>run(()=>{editor?.chain().focus().toggleItalic().run();})}><Italic size={18}/></button>
        <select aria-label={tr(locale,"Paragraph type","نوع الفقرة","Stycketyp")} disabled={disabled||!editor} value={active?.json.type==="heading"?`h${active.json.attrs?.level}`:active?.json.type||"paragraph"} onChange={e=>run(()=>{
          const value=e.target.value,chain=editor!.chain().focus();
          if(/^h[1-4]$/.test(value))chain.setHeading({level:Number(value.slice(1)) as 1|2|3|4}).run();
          else if(value==="paragraph")chain.clearNodes().setParagraph().run();else if(value==="blockquote")chain.toggleBlockquote().run();
          else if(value==="bookNote")chain.clearNodes().setNode("bookNote").run();else if(value==="bulletList")chain.toggleBulletList().run();else if(value==="orderedList")chain.toggleOrderedList().run();
        })}><option value="paragraph">{names.paragraph}</option>{[1,2,3,4].map(n=><option key={n} value={`h${n}`}>{names.heading} {n}</option>)}
          {Object.entries(names).filter(([type])=>["blockquote","bookNote","bulletList","orderedList"].includes(type)).map(([type,label])=><option key={type} value={type}>{label}</option>)}
          {active&&["bookImage","horizontalRule","bookPageBreak"].includes(active.json.type||"")&&<option value={active.json.type}>{names[active.json.type!]}</option>}
        </select>
        <select aria-label={tr(locale,"Alignment","المحاذاة","Justering")} value={active?.json.attrs?.textAlign||""} disabled={disabled||!editor||!active} onChange={e=>run(()=>{editor?.chain().focus().updateAttributes(active.json.type!,{textAlign:e.target.value||null}).run();})}>
          <option value="">{tr(locale,"Alignment","المحاذاة","Justering")}</option><option value="right">{tr(locale,"Right","يمين","Höger")}</option><option value="center">{tr(locale,"Center","وسط","Centrera")}</option><option value="left">{tr(locale,"Left","يسار","Vänster")}</option><option value="justify">{tr(locale,"Justify","ضبط","Marginaljustera")}</option>
        </select>
        <button type="button" disabled={disabled||!editor} className="rich-insert-button" onMouseDown={e=>e.preventDefault()} onClick={()=>setInsertOpen(true)}>
          <Plus size={17}/><span>{tr(locale,"Add","إضافة","Lägg till")}</span></button>
        <button type="button" className="rich-ai-trigger" disabled={disabled||!props.aiEnabled||!editor||!!asset}
          aria-expanded={aiOpen} onMouseDown={e=>e.preventDefault()} onClick={()=>setAiOpen(open=>!open)}><Sparkles size={17}/>AI</button>
        <button type="button" disabled={!editor} aria-label={tr(locale,"Paragraph and image options","خيارات الفقرة والصورة","Stycke- och bildalternativ")}
          aria-expanded={toolsOpen} onMouseDown={e=>e.preventDefault()} onClick={()=>setToolsOpen(open=>!open)}><SlidersHorizontal size={17}/></button>
        <button type="button" aria-label={tr(locale,"More tools and navigation","المزيد من الأدوات والتنقل","Fler verktyg och navigering")}
          aria-expanded={formatOpen} onMouseDown={e=>e.preventDefault()} onClick={()=>setFormatOpen(open=>!open)}><MoreHorizontal size={19}/></button>
      </div>
      <div className="rich-toolbar-secondary">
        <button type="button" disabled={!editor} onClick={()=>editor?.chain().focus("start").scrollIntoView().run()}>
          <ArrowUpToLine size={16}/>{tr(locale,"Start","البداية","Start")}</button>
        <button type="button" disabled={!editor} onClick={()=>editor?.chain().focus("end").scrollIntoView().run()}>
          <ArrowDownToLine size={16}/>{tr(locale,"End","النهاية","Slut")}</button>
        <button type="button" disabled={disabled||!props.aiEnabled||!editor||!!asset} onMouseDown={e=>e.preventDefault()} onClick={()=>setAiOpen(!aiOpen)}><Sparkles size={16}/>{tr(locale,"AI edit","تحسين AI","AI-redigering")}</button>
        <button type="button" disabled={disabled||!editor} aria-expanded={toolsOpen} onClick={()=>setToolsOpen(!toolsOpen)}>{tr(locale,"Element options","خيارات العنصر","Objektalternativ")}</button>
        <button type="button" aria-label={tr(locale,"Search and replace","بحث واستبدال","Sök och ersätt")} onClick={()=>setSearchOpen(!searchOpen)}><Search size={17}/></button>
        <span className="rich-word-count">{content.trim().split(/\s+/u).filter(Boolean).length.toLocaleString(locale)} {tr(locale,"words","كلمة","ord")}</span>
        <button type="button" aria-label={full?tr(locale,"Exit full screen","إغلاق ملء الشاشة","Stäng helskärm"):tr(locale,"Full screen","ملء الشاشة","Helskärm")} onClick={()=>setFull(!full)}>{full?<Minimize2 size={17}/>:<Maximize2 size={17}/>}</button>
      </div>
    </div>
    {!!editor && !!state && state.from!==state.to && !state.image && <div className="rich-selection-actions" role="toolbar"
      aria-label={tr(locale,"Selected text actions","أدوات النص المحدد","Verktyg för markerad text")}>
      <span>{tr(locale,"Selected text","النص المحدد","Markerad text")}</span>
      <button type="button" aria-label={tr(locale,"Bold","غامق","Fetstil")} disabled={disabled}
        onMouseDown={e=>e.preventDefault()} onClick={()=>run(()=>editor.chain().focus().toggleBold().run())}><Bold size={16}/></button>
      <button type="button" aria-label={tr(locale,"Italic","مائل","Kursiv")} disabled={disabled}
        onMouseDown={e=>e.preventDefault()} onClick={()=>run(()=>editor.chain().focus().toggleItalic().run())}><Italic size={16}/></button>
      <button type="button" disabled={disabled||!props.aiEnabled} onMouseDown={e=>e.preventDefault()} onClick={()=>ai("proofread")}>
        <Sparkles size={16}/>{tr(locale,"Correct","تصحيح","Korrigera")}</button>
      <button type="button" disabled={disabled||!props.aiEnabled} onMouseDown={e=>e.preventDefault()} onClick={()=>ai("improve")}>
        {tr(locale,"Improve","تحسين","Förbättra")}</button>
      <button type="button" className="rich-delete" aria-label={tr(locale,"Delete selected text","حذف النص المحدد","Ta bort markerad text")}
        disabled={disabled} onMouseDown={e=>e.preventDefault()}
        onClick={()=>run(()=>editor.chain().focus().deleteRange({from:state.from,to:state.to}).run())}><Trash2 size={16}/></button>
    </div>}
    {aiOpen&&<div className="rich-ai-actions" role="group" aria-label={tr(locale,"Improve this passage","تحسين هذا النص","Förbättra texten")}>
      <p>{tr(locale,"Selected text, or the current paragraph. Review the suggestion before applying.","سيُعدّل النص المحدد، أو الفقرة الحالية. راجع الاقتراح قبل اعتماده.","Markerad text eller aktuellt stycke. Granska förslaget innan du använder det.")}</p>
      {(["proofread","improve","simplify","shorten","expand"] as const).map((action,i)=><button type="button" key={action} onClick={()=>ai(action)}>{[tr(locale,"Correct","تصحيح","Korrekturläs"),tr(locale,"Improve","تحسين","Förbättra"),tr(locale,"Simplify","تبسيط","Förenkla"),tr(locale,"Shorten","اختصار","Förkorta"),tr(locale,"Expand","توسيع","Utöka")][i]}</button>)}
    </div>}
    {toolsOpen&&active&&<div className="rich-element-panel" role="group" aria-label={tr(locale,"Selected element tools","أدوات العنصر المحدد","Verktyg för valt objekt")}>
      <strong>{names[active.json.type||""]||names.paragraph} · {index+1}/{all.length}</strong>
      <div className="rich-element-actions">
        <button type="button" disabled={disabled||index===0} onClick={()=>move(index-1)}><ArrowUp size={15}/>{tr(locale,"Move up","للأعلى","Flytta upp")}</button>
        <button type="button" disabled={disabled||index===all.length-1} onClick={()=>move(index+1)}><ArrowDown size={15}/>{tr(locale,"Move down","للأسفل","Flytta ned")}</button>
        <button type="button" disabled={disabled} onClick={()=>run(()=>{editor?.chain().focus().insertContentAt(active.pos+active.size,active.json).run();})}><Copy size={15}/>{tr(locale,"Duplicate","نسخ العنصر","Duplicera")}</button>
        <button type="button" className="rich-delete" disabled={disabled} onClick={()=>{if(asset&&props.onDeleteImage){props.onDeleteImage(asset.id);setToolsOpen(false);}else run(()=>{editor?.chain().focus().deleteRange({from:active.pos,to:active.pos+active.size}).run();});}}><Trash2 size={15}/>{tr(locale,"Delete","حذف","Ta bort")}</button>
        <label>{tr(locale,"Move to position","نقل إلى الموضع","Flytta till plats")}<select value={index} disabled={disabled} onChange={e=>move(Number(e.target.value))}>{all.map((_,i)=><option key={i} value={i}>{i+1}</option>)}</select></label>
        {props.chapters&&props.chapters.length>1&&<label>{tr(locale,"Move to chapter","نقل إلى فصل","Flytta till kapitel")}<select value="" disabled={disabled} onChange={e=>{
          if(!e.target.value||!editor)return;
          const remaining=serializeRichDocument({type:"doc",content:all.filter((_,i)=>i!==index).map(b=>b.json)}).text;
          const block=serializeRichDocument({type:"doc",content:[active.json]}).text;
          if(props.onMoveToChapter?.(block,remaining,e.target.value))setToolsOpen(false);
        }}><option value="">{tr(locale,"Choose chapter","اختر الفصل","Välj kapitel")}</option>{props.chapters.filter(c=>c.id!==props.chapterId).map(c=><option key={c.id} value={c.id}>{c.title}</option>)}</select></label>}
      </div>
      {asset&&<div className="rich-image-settings">
        <label>{tr(locale,"Size","الحجم","Storlek")}<select value={imageSize} disabled={disabled} onChange={e=>setImageSize(e.target.value as Illustration["size"])}><option value="small">{tr(locale,"Small","صغير","Liten")}</option><option value="medium">{tr(locale,"Medium","متوسط","Mellan")}</option><option value="full">{tr(locale,"Full width","عرض كامل","Full bredd")}</option></select></label>
        <label>{tr(locale,"Caption","الوصف أسفل الصورة","Bildtext")}<input value={caption} maxLength={240} disabled={disabled} onChange={e=>setCaption(e.target.value)}/></label>
        <button type="button" disabled={disabled||!props.onSaveImage||(caption===asset.caption&&imageSize===asset.size)} onClick={()=>props.onSaveImage?.(asset.id,imageSize,caption)}>{tr(locale,"Save image settings","حفظ إعدادات الصورة","Spara bildinställningar")}</button>
        <button type="button" disabled={disabled} onClick={()=>prepareImage(asset.id)}>{tr(locale,"Replace image","استبدال الصورة","Ersätt bild")}</button>
      </div>}
    </div>}
    {searchOpen&&<div className="rich-search" role="search">
      <input aria-label={tr(locale,"Find text","ابحث عن نص","Sök text")} value={query} onChange={e=>setQuery(e.target.value)}/>
      <input aria-label={tr(locale,"Replacement text","النص البديل","Ersättningstext")} value={replacement} onChange={e=>setReplacement(e.target.value)}/>
      <button type="button" disabled={!query} onClick={find}>{tr(locale,"Find next","النتيجة التالية","Sök nästa")}</button>
      <button type="button" disabled={disabled||!query} onClick={()=>run(()=>{if(!editor)return;let transaction=editor.state.tr;for(const range of [...matches()].reverse())transaction=transaction.insertText(replacement,range.from,range.to);editor.view.dispatch(transaction);})}>{tr(locale,"Replace all","استبدال الكل","Ersätt alla")}</button>
      <span role="status">{matches().length} {tr(locale,"matches","نتيجة","träffar")}</span>
    </div>}
    {error&&<p className="error-message" role="alert">{error}</p>}
    <EditorContent editor={editor}/>
    {!content.trim()&&<p className="rich-editor-hint">{tr(locale,"Write directly. Enter creates a paragraph. Select text to format, or select an image and open Element options.","اكتب مباشرة. Enter يضيف فقرة. حدد النص لتنسيقه، أو حدد صورة وافتح خيارات العنصر.","Skriv direkt. Enter skapar ett stycke. Markera text för formatering, eller välj en bild och öppna Objektalternativ.")}</p>}
    {insertOpen&&<Dialog title={tr(locale,"Insert into your chapter","إضافة داخل الفصل","Infoga i kapitlet")} closeLabel={tr(locale,"Close","إغلاق","Stäng")} onClose={()=>setInsertOpen(false)}>
      <p>{tr(locale,"Insert at the text cursor. Images split the paragraph at the cursor.","ستُضاف العناصر عند مؤشر الكتابة. إدراج صورة يقسم الفقرة عند المؤشر.","Infoga vid markören. En bild delar stycket vid markören.")}</p>
      <div className="rich-insert-grid">{(["bookImage","paragraph","heading","bulletList","orderedList","bookNote","blockquote","horizontalRule","bookPageBreak"] as const).map(type=><button type="button" key={type} disabled={disabled} onClick={()=>insert(type)}><Plus size={16}/>{names[type]}</button>)}</div>
    </Dialog>}
  </div>;
}
