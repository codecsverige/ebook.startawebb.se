/**
 * One safe manuscript parser used by the editor and PDF/Word exports.
 * Line-based so headings and lists work even without blank lines.
 */
export type ManuscriptBlock =
  | { type: "heading"; level: number; text: string }
  | { type: "paragraph"; text: string }
  | { type: "ul"; items: string[] }
  | { type: "ol"; items: string[] }
  | { type: "illustration"; id: string }
  | { type: "divider" }
  | { type: "quote"; text: string }
  | { type: "note"; text: string }
  | { type: "pagebreak" };

const heading = /^\s{0,3}(#{1,4})[ \t]+(.+)$/;
const bullet = /^\s*[-*+][ \t]+(.+)$/;
const number = /^\s*\d+[.)][ \t]+(.+)$/;
export function parseManuscript(input: string): ManuscriptBlock[] {
  const lines = input.replace(/\r/g, "").split("\n");
  const result: ManuscriptBlock[] = [];
  let i = 0;
  while (i < lines.length) {
    const value = lines[i].trim();
    if (!value) { i++; continue; }
    const illustration = /^\[\[illustration:([0-9a-f-]{36})\]\]$/i.exec(value);
    if (illustration) {
      result.push({ type: "illustration", id: illustration[1].toLowerCase() });
      i++; continue;
    }
    if (value === "[[pagebreak]]") {
      result.push({ type: "pagebreak" });
      i++; continue;
    }
    if (value.startsWith("> [!NOTE] ")) {
      result.push({ type: "note", text: value.slice(10) });
      i++; continue;
    }
    if (value.startsWith("> ")) {
      result.push({ type: "quote", text: value.slice(2) });
      i++; continue;
    }
    if (value === "***" || value === "⁂") {
      result.push({ type: "divider" });
      i++; continue;
    }
    const h = heading.exec(lines[i]);
    if (h) {
      result.push({ type: "heading", level: h[1].length, text: h[2].trim() });
      i++; continue;
    }
    const type = bullet.test(lines[i]) ? "ul" : number.test(lines[i]) ? "ol" : null;
    if (type) {
      const items: string[] = [];
      const pattern = type === "ul" ? bullet : number;
      while (i < lines.length) {
        const next = pattern.exec(lines[i]);
        if (!next) break;
        items.push(next[1].trim());
        i++;
      }
      if (type === "ul") result.push({ type: "ul", items });
      else result.push({ type: "ol", items });
      continue;
    }
    const paragraph: string[] = [];
    while (i < lines.length && lines[i].trim() &&
      !heading.test(lines[i]) && !bullet.test(lines[i]) && !number.test(lines[i]) &&
      !/^\[\[illustration:[0-9a-f-]{36}\]\]$/i.test(lines[i].trim()) &&
      !["***", "⁂","[[pagebreak]]"].includes(lines[i].trim()) &&
      !lines[i].trim().startsWith("> ")) {
      paragraph.push(lines[i].trim());
      i++;
    }
    if (paragraph.length) result.push({ type: "paragraph", text: paragraph.join(" ") });
  }
  return result;
}
export function stripInlineMarkdown(text: string): string {
  return text.replace(/\*\*([^*]+)\*\*/g, "$1").replace(/\*([^*]+)\*/g, "$1");
}
