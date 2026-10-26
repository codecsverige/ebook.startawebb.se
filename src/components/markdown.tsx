import { Fragment } from "react";

// Deliberately supports a small, safe Markdown subset. AI text never becomes HTML.
function inline(text: string) {
  return text
    .split(/(\*\*[^*]+\*\*)/g)
    .map((p, i) =>
      p.startsWith("**") && p.endsWith("**") ? (
        <strong key={i}>{p.slice(2, -2)}</strong>
      ) : (
        <Fragment key={i}>{p}</Fragment>
      ),
    );
}
export function Markdown({ text }: { text: string }) {
  const blocks = text.replace(/\r/g, "").split(/\n{2,}/);
  return (
    <div className="manuscript">
      {blocks.map((block, i) => {
        const lines = block.split("\n");
        if (/^#{1,4} /.test(block)) {
          const [head, ...rest] = lines;
          return (
            <Fragment key={i}>
              <h3>{inline(head.replace(/^#{1,4} /, ""))}</h3>
              {rest.length > 0 && <p>{inline(rest.join("\n"))}</p>}
            </Fragment>
          );
        }
        if (lines.every((l) => /^\s*[-*] /.test(l)))
          return (
            <ul key={i}>
              {lines.map((l, n) => (
                <li key={n}>{inline(l.replace(/^\s*[-*] /, ""))}</li>
              ))}
            </ul>
          );
        if (lines.every((l) => /^\s*\d+[.)] /.test(l)))
          return (
            <ol key={i}>
              {lines.map((l, n) => (
                <li key={n}>{inline(l.replace(/^\s*\d+[.)] /, ""))}</li>
              ))}
            </ol>
          );
        return <p key={i}>{inline(block)}</p>;
      })}
    </div>
  );
}
