/**
 * One safe manuscript parser used by the editor and PDF/Word exports.
 * Line-based so headings and lists work even without blank lines.
 */
export type TextAlignment = "left" | "center" | "right" | "justify";
export type ManuscriptBlock = (
  | { type: "heading"; level: number; text: string }
  | { type: "paragraph"; text: string }
  | { type: "ul"; items: string[] }
  | { type: "ol"; items: string[] }
  | { type: "illustration"; id: string }
  | { type: "divider" }
  | { type: "pagebreak" }
  | { type: "quote"; text: string }
  | { type: "note"; text: string }) & { align?: TextAlignment };

const heading = /^\s{0,3}(#{1,4})[ \t]+(.+)$/;
const bullet = /^\s*[-*+][ \t]+(.+)$/;
const number = /^\s*\d+[.)][ \t]+(.+)$/;
export function parseManuscript(input: string): ManuscriptBlock[] {
  const lines = input.replace(/\r/g, "").split("\n");
  const result: ManuscriptBlock[] = [];
  let alignment: TextAlignment | undefined;
  const push = (block: ManuscriptBlock) => {
    result.push(alignment ? { ...block, align: alignment } : block);
    alignment = undefined;
  };
  let i = 0;
  while (i < lines.length) {
    const value = lines[i].trim();
    if (!value) { i++; continue; }
    const align = /^\[\[align:(left|center|right|justify)\]\]$/.exec(value);
    if (align) { alignment = align[1] as TextAlignment; i++; continue; }
    const illustration = /^\[\[illustration:([0-9a-f-]{36})\]\]$/i.exec(value);
    if (illustration) {
      push({ type: "illustration", id: illustration[1].toLowerCase() });
      i++; continue;
    }
    if (value === "[[pagebreak]]") {
      push({ type: "pagebreak" });
      i++; continue;
    }
    if (value.startsWith("> [!NOTE] ")) {
      push({ type: "note", text: value.slice(10) });
      i++; continue;
    }
    if (value.startsWith("> ")) {
      push({ type: "quote", text: value.slice(2) });
      i++; continue;
    }
    if (value === "***" || value === "⁂") {
      push({ type: "divider" });
      i++; continue;
    }
    const h = heading.exec(lines[i]);
    if (h) {
      push({ type: "heading", level: h[1].length, text: h[2].trim() });
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
      if (type === "ul") push({ type: "ul", items });
      else push({ type: "ol", items });
      continue;
    }
    const paragraph: string[] = [];
    while (i < lines.length && lines[i].trim() &&
      !heading.test(lines[i]) && !bullet.test(lines[i]) && !number.test(lines[i]) &&
      !/^\[\[illustration:[0-9a-f-]{36}\]\]$/i.test(lines[i].trim()) &&
      !["***", "⁂", "[[pagebreak]]"].includes(lines[i].trim()) &&
      !/^\[\[align:(left|center|right|justify)\]\]$/.test(lines[i].trim()) &&
      !lines[i].trim().startsWith("> ")) {
      paragraph.push(lines[i].trim());
      i++;
    }
    if (paragraph.length) push({ type: "paragraph", text: paragraph.join(" ") });
  }
  return result;
}
export type InlineRun = { text: string; bold?: boolean; italic?: boolean };
/** Small, safe inline grammar shared by editing, reading and every export format. */
export function inlineRuns(value: string, marks: Omit<InlineRun, "text"> = {}): InlineRun[] {
  const result: InlineRun[] = [];
  let plain = "";
  const flush = () => { if (plain) result.push({ text: plain, ...marks }); plain = ""; };
  for (let i = 0; i < value.length;) {
    if (value[i] === "\\" && /[\\*_]/.test(value[i + 1] || " ")) {
      plain += value[i + 1]; i += 2; continue;
    }
    const delimiter = value.startsWith("***", i) ? "***" : value.startsWith("**", i) ? "**" :
      value[i] === "*" ? "*" : value[i] === "_" && !/[\p{L}\p{N}]/u.test(value[i - 1] || " ") ? "_" : "";
    const end = delimiter ? value.indexOf(delimiter, i + delimiter.length) : -1;
    if (end > i + delimiter.length) {
      flush();
      result.push(...inlineRuns(value.slice(i + delimiter.length, end), {
        ...marks, ...(delimiter.length >= 2 ? { bold: true } : {}),
        ...(delimiter !== "**" ? { italic: true } : {}),
      }));
      i = end + delimiter.length;
    } else { plain += value[i]; i++; }
  }
  flush();
  return result;
}
export function stripInlineMarkdown(text: string): string {
  return inlineRuns(text).map(run => run.text).join("");
}
