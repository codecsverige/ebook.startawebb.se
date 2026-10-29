import { parseManuscript } from "./manuscript";

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}
function inlineHtml(value: string): string {
  return escapeHtml(value)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>");
}
export function markdownHtml(text: string, imageMarkup: Record<string, string> = {}): string {
  return parseManuscript(text).map((block) => {
    if (block.type === "illustration") return imageMarkup[block.id] || "";
    if (block.type === "divider") return '<div class="scene-divider" aria-hidden="true">✦ &nbsp; ✦ &nbsp; ✦</div>';
    if (block.type === "heading") {
      const tag = block.level >= 3 ? "h4" : "h3";
      return `<${tag}>${inlineHtml(block.text)}</${tag}>`;
    }
    if (block.type === "ul" || block.type === "ol")
      return `<${block.type}>${block.items.map(x => `<li>${inlineHtml(x)}</li>`).join("")}</${block.type}>`;
    return `<p>${inlineHtml(block.text)}</p>`;
  }).join("");
}
