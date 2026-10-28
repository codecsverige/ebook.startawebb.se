import { Fragment } from "react";
import { parseManuscript } from "@/lib/manuscript";

function inline(value: string) {
  return value.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g).map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**"))
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("*") && part.endsWith("*"))
      return <em key={i}>{part.slice(1, -1)}</em>;
    return <Fragment key={i}>{part}</Fragment>;
  });
}
export function Markdown({ text }: { text: string }) {
  return (
    <div className="manuscript">
      {parseManuscript(text).map((block, i) => {
        if (block.type === "heading")
          return block.level >= 3
            ? <h4 key={i}>{inline(block.text)}</h4>
            : <h3 key={i}>{inline(block.text)}</h3>;
        if (block.type === "ul")
          return <ul key={i}>{block.items.map((s, j) => <li key={j}>{inline(s)}</li>)}</ul>;
        if (block.type === "ol")
          return <ol key={i}>{block.items.map((s, j) => <li key={j}>{inline(s)}</li>)}</ol>;
        return <p key={i}>{inline(block.text)}</p>;
      })}
    </div>
  );
}
