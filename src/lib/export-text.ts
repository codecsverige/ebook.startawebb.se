import { inlineRuns, parseManuscript } from "./manuscript";

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}
function inlineHtml(value: string): string {
  return inlineRuns(value).map(run => {
    let value = escapeHtml(run.text);
    if (run.italic) value = "<em>" + value + "</em>";
    return run.bold ? "<strong>" + value + "</strong>" : value;
  }).join("");
}
export function markdownHtml(text: string, imageMarkup: Record<string, string> = {}): string {
  return parseManuscript(text).map((block) => {
    const align = block.align ? ` style="text-align:${block.align}"` : "";
    if (block.type === "illustration") return imageMarkup[block.id] || "";
    if (block.type === "pagebreak") return '<div class="page-break" aria-hidden="true"></div>';
    if (block.type === "quote") return '<blockquote class="book-quote"'+align+'>'+inlineHtml(block.text)+'</blockquote>';
    if (block.type === "note") return '<aside class="book-note"'+align+'>'+inlineHtml(block.text)+'</aside>';
    if (block.type === "divider") return '<div class="scene-divider" aria-hidden="true">✦ &nbsp; ✦ &nbsp; ✦</div>';
    if (block.type === "heading") {
      const tag = block.level >= 3 ? "h4" : "h3";
      return `<${tag}${align}>${inlineHtml(block.text)}</${tag}>`;
    }
    if (block.type === "ul" || block.type === "ol")
      return `<${block.type}${align}>${block.items.map(x => `<li>${inlineHtml(x)}</li>`).join("")}</${block.type}>`;
    return `<p${align}>${inlineHtml(block.text)}</p>`;
  }).join("");
}
