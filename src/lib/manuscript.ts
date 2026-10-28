/**
 * One safe manuscript parser used by the editor and PDF/Word exports.
 * Line-based so headings and lists work even without blank lines.
 */
export type ManuscriptBlock =
  | { type: "heading"; level: number; text: string }
  | { type: "paragraph"; text: string }
  | { type: "ul"; items: string[] }
  | { type: "ol"; items: string[] };

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
      !heading.test(lines[i]) && !bullet.test(lines[i]) && !number.test(lines[i])) {
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
