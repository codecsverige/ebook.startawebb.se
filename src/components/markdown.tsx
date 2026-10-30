import { Fragment } from "react";
import { inlineRuns, parseManuscript } from "@/lib/manuscript";
import type { Illustration } from "@/lib/domain";

function inline(value: string) {
  return inlineRuns(value).map((part, i) => {
    const body = part.italic ? <em>{part.text}</em> : part.text;
    return part.bold ? <strong key={i}>{body}</strong> : <Fragment key={i}>{body}</Fragment>;
  });
}
export function Markdown({ text, illustrations, bookId }: {
  text: string; illustrations?: Record<string, Illustration>; bookId?: string;
}) {
  return (
    <div className="manuscript">
      {parseManuscript(text).map((block, i) => {
        if (block.type === "pagebreak")
          return <div key={i} className="page-break" aria-label="Page break"><span>✂</span></div>;
        if (block.type === "quote")
          return <blockquote key={i} style={{textAlign:block.align}} className="book-quote">{inline(block.text)}</blockquote>;
        if (block.type === "note")
          return <aside key={i} style={{textAlign:block.align}} className="book-note" role="note">{inline(block.text)}</aside>;
        if (block.type === "divider")
          return <div key={i} className="scene-divider" aria-hidden="true">✦ &nbsp; ✦ &nbsp; ✦</div>;
        if (block.type === "illustration") {
          const asset = illustrations?.[block.id];
          if (!asset || !bookId) return null;
          const src = asset.source === "library" && asset.preset
            ? `/illustrations/${asset.preset}.png`
            : `/api/books/${bookId}/illustrations/${asset.id}`;
          return <figure key={i} style={{textAlign:block.align}} className={`manuscript-figure figure-${asset.size}`}>
            <img src={src} alt={asset.alt || asset.caption} loading="lazy" />
            {asset.caption && <figcaption>{asset.caption}</figcaption>}
          </figure>;
        }
        if (block.type === "heading")
          return block.level >= 3
            ? <h4 key={i} style={{textAlign:block.align}}>{inline(block.text)}</h4>
            : <h3 key={i} style={{textAlign:block.align}}>{inline(block.text)}</h3>;
        if (block.type === "ul")
          return <ul key={i} style={{textAlign:block.align}}>{block.items.map((s, j) => <li key={j}>{inline(s)}</li>)}</ul>;
        if (block.type === "ol")
          return <ol key={i} style={{textAlign:block.align}}>{block.items.map((s, j) => <li key={j}>{inline(s)}</li>)}</ol>;
        return <p key={i} style={{textAlign:block.align}}>{inline(block.text)}</p>;
      })}
    </div>
  );
}
