export function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
}
function inlineHtml(value: string): string {
  return escapeHtml(value).replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
}
export function markdownHtml(text: string): string {
  return text
    .replace(/\r/g, "")
    .split(/\n{2,}/)
    .map((block) => {
      const lines = block.split("\n");
      if (/^#{1,4} /.test(block))
        return `<h3>${inlineHtml(lines[0].replace(/^#{1,4} /, ""))}</h3>${lines.length > 1 ? `<p>${inlineHtml(lines.slice(1).join("\n"))}</p>` : ""}`;
      if (lines.every((l) => /^\s*[-*] /.test(l)))
        return `<ul>${lines.map((l) => `<li>${inlineHtml(l.replace(/^\s*[-*] /, ""))}</li>`).join("")}</ul>`;
      if (lines.every((l) => /^\s*\d+[.)] /.test(l)))
        return `<ol>${lines.map((l) => `<li>${inlineHtml(l.replace(/^\s*\d+[.)] /, ""))}</li>`).join("")}</ol>`;
      return `<p>${inlineHtml(block)}</p>`;
    })
    .join("");
}
