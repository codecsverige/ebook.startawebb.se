"use client";
import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { BookWithCover } from "@/lib/domain";
import { tr } from "@/lib/i18n";
import { BookCover, BookBackCover } from "./book-cover";
import { Markdown } from "./markdown";

type Part = { id: string; title: string; type: "cover"|"back"|"text"|"toc"|"chapter"; content?: string; chapterId?: string };
export function BookSectionReader({book, bookId}:{book:BookWithCover;bookId:string}) {
  const [index,setIndex]=useState(0);
  const parts = useMemo<Part[]>(()=>{
    const list:Part[]=[{id:"front",title:book.title,type:"cover"}];
    if(book.copyright_notice?.trim())list.push({id:"rights",title:tr(book.language,"Copyright","حقوق النشر","Upphovsrätt"),type:"text",content:book.copyright_notice});
    if(book.dedication?.trim())list.push({id:"dedication",title:tr(book.language,"Dedication","الإهداء","Dedikation"),type:"text",content:book.dedication});
    if(book.preface?.trim())list.push({id:"preface",title:tr(book.language,"Preface","المقدمة","Förord"),type:"text",content:book.preface});
    list.push({id:"toc",title:tr(book.language,"Contents","الفهرس","Innehåll"),type:"toc"});
    book.outline.forEach(c=>list.push({id:c.id,title:c.title,type:"chapter",chapterId:c.id,content:book.chapters[c.id]?.content || ""}));
    if(book.acknowledgments?.trim())list.push({id:"thanks",title:tr(book.language,"Acknowledgments","الشكر والتقدير","Tack"),type:"text",content:book.acknowledgments});
    list.push({id:"back",title:tr(book.language,"Back cover","الغلاف الخلفي","Baksida"),type:"back"});
    return list;
  },[book]);
  const current=parts[Math.min(index,parts.length-1)];
  return <section className="book-section-reader" dir={book.language==="ar"?"rtl":"ltr"}
      aria-label={tr(book.language,"Browse book sections","تصفح أقسام الكتاب","Bläddra genom boken")}>
    <div className="book-reader-header">
      <strong>{tr(book.language,"Browse your book","تصفح كتابك","Bläddra i din bok")}</strong>
      <span>{Math.min(index+1,parts.length)} / {parts.length}</span>
    </div>
    <div className="book-reader-page" key={current.id}>
      {current.type==="cover" ? <div className="preview-cover">
        <BookCover title={book.title} subtitle={book.subtitle} author={book.author}
          style={book.cover_style} language={book.language}
          image={book.use_artwork?book.cover_url:null}/>
      </div> : current.type==="back" ? <div className="preview-cover">
        <BookBackCover title={book.title} author={book.author} style={book.cover_style}
          language={book.language} blurb={book.back_blurb||book.idea}
          authorBio={book.author_bio||""} image={book.back_cover_url}/>
      </div> : <div className={`reader-content theme-${book.layout_theme || "classic"}`}>
        <h2>{current.title}</h2>
        {current.type==="toc" ? book.outline.map((c,i)=><p key={c.id}>
          <button type="button" onClick={()=>setIndex(parts.findIndex(part=>part.id===c.id))}>{i+1}. {c.title}</button>
        </p>) : current.content ? <Markdown text={current.content}
          illustrations={book.illustrations} bookId={bookId}/> :
          <p className="muted">{tr(book.language,"Chapter not written yet","لم يُكتب هذا الفصل بعد","Kapitlet är inte skrivet än")}</p>}
      </div>}
    </div>
    <div className="book-reader-nav">
      <button type="button" className="button button-outline button-small" disabled={index<=0}
        onClick={()=>setIndex(i=>Math.max(0,i-1))}>
        <ChevronLeft size={17}/>{tr(book.language,"Previous","السابق","Föregående")}
      </button>
      <span>{current.title}</span>
      <button type="button" className="button button-outline button-small" disabled={index>=parts.length-1}
        onClick={()=>setIndex(i=>Math.min(parts.length-1,i+1))}>
        {tr(book.language,"Next","التالي","Nästa")}<ChevronRight size={17}/>
      </button>
    </div>
    <p className="book-reader-note">{tr(book.language,
      "This viewer navigates sections. Use PDF preview for exact printable page breaks.",
      "هذا القارئ يتنقّل بين أقسام الكتاب. استخدم معاينة PDF لرؤية حدود الصفحات الحقيقية.",
      "Den här läsaren visar avsnitt. För exakta sidbrytningar använder du PDF-förhandsvisningen.")}</p>
  </section>;
}
