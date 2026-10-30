import type { JSONContent } from "@tiptap/core";
import { inlineRuns, parseManuscript, type ManuscriptBlock } from "./manuscript";

export function encodeBlock(block: ManuscriptBlock): string {
  const prefix = block.align ? `[[align:${block.align}]]\n` : "";
  const text = block.type === "heading" ? "#".repeat(block.level) + " " + block.text :
    block.type === "paragraph" ? block.text :
    block.type === "ul" ? block.items.map(item => "- " + item).join("\n") :
    block.type === "ol" ? block.items.map((item, i) => `${i + 1}. ${item}`).join("\n") :
    block.type === "divider" ? "***" : block.type === "pagebreak" ? "[[pagebreak]]" :
    block.type === "quote" ? "> " + block.text : block.type === "note" ? "> [!NOTE] " + block.text :
    `[[illustration:${block.id}]]`;
  return prefix + text;
}
export const serializeVisualBlocks = (blocks: ManuscriptBlock[]) => blocks.map(encodeBlock).join("\n\n");
const inline = (value: string): JSONContent[] => inlineRuns(value).map(run => ({
  type: "text", text: run.text,
  marks: [...(run.bold ? [{ type: "bold" }] : []), ...(run.italic ? [{ type: "italic" }] : [])],
}));
export function manuscriptDocument(value: string): JSONContent {
  const content: JSONContent[] = parseManuscript(value).map(block => {
    const attrs = { textAlign: block.align || null };
    if (block.type === "illustration") return { type: "bookImage", attrs: { id: block.id, ...attrs } };
    if (block.type === "divider") return { type: "horizontalRule" };
    if (block.type === "pagebreak") return { type: "bookPageBreak" };
    if (block.type === "heading") return { type: "heading", attrs: { level: block.level, ...attrs }, content: inline(block.text) };
    if (block.type === "quote") return { type: "blockquote", attrs, content: [{ type: "paragraph", content: inline(block.text) }] };
    if (block.type === "note") return { type: "bookNote", attrs, content: inline(block.text) };
    if (block.type === "ul" || block.type === "ol") return {
      type: block.type === "ul" ? "bulletList" : "orderedList", attrs,
      content: block.items.map(item => ({ type: "listItem", content: [{ type: "paragraph", content: inline(item) }] })),
    };
    return { type: "paragraph", attrs, content: inline(block.text) };
  });
  return { type: "doc", content: content.length ? content : [{ type: "paragraph" }] };
}
export function richNodeSize(node: JSONContent): number {
  if (node.type === "text") return node.text?.length || 0;
  if (["bookImage", "horizontalRule", "bookPageBreak", "hardBreak"].includes(node.type || "")) return 1;
  return (node.type === "doc" ? 0 : 2) + (node.content || []).reduce((sum, n) => sum + richNodeSize(n), 0);
}
/** Maps actual editor positions to source positions, including identical passages and formatting. */
export function serializeRichDocument(doc: JSONContent) {
  let text = "";
  const starts = new Map<number, number>(), ends = new Map<number, number>();
  const writeInline = (children: JSONContent[], position: number) => {
    let stack: string[] = [];
    let pos = position;
    for (const child of children) {
      const marks = child.marks || [];
      const bold = marks.some(m => m.type === "bold");
      const next = [bold ? "**" : "", marks.some(m => m.type === "italic") ? bold ? "_" : "*" : ""].filter(Boolean);
      let same = 0;
      while (same < stack.length && same < next.length && stack[same] === next[same]) same++;
      for (let i = stack.length - 1; i >= same; i--) text += stack[i];
      for (let i = same; i < next.length; i++) text += next[i];
      stack = next;
      const value = child.text || "";
      for (let i = 0; i < value.length; i++) {
        starts.set(pos + i, text.length);
        text += /[\\*_]/.test(value[i]) ? "\\" + value[i] : value[i];
        ends.set(pos + i + 1, text.length);
      }
      if (child.type === "hardBreak") text += "\n\n";
      pos += richNodeSize(child);
    }
    for (let i = stack.length - 1; i >= 0; i--) text += stack[i];
    if (!children.length) { starts.set(position, text.length); ends.set(position, text.length); }
  };
  const writeBlock = (node: JSONContent, pos: number) => {
    const align = node.attrs?.textAlign;
    starts.set(pos, text.length);
    if (["left", "center", "right", "justify"].includes(align)) text += `[[align:${align}]]\n`;
    if (node.type === "bookImage") text += `[[illustration:${node.attrs?.id}]]`;
    else if (node.type === "horizontalRule") text += "***";
    else if (node.type === "bookPageBreak") text += "[[pagebreak]]";
    else if (node.type === "bulletList" || node.type === "orderedList") {
      let itemPos = pos + 1;
      (node.content || []).forEach((item, index) => {
        if (index) text += "\n";
        text += node.type === "bulletList" ? "- " : `${index + 1}. `;
        writeInline(item.content?.[0]?.content || [], itemPos + 2);
        itemPos += richNodeSize(item);
      });
    } else if (node.type === "blockquote") {
      let childPos = pos + 1;
      (node.content || []).forEach((child, index) => {
        if (index) text += "\n\n";
        text += "> "; writeInline(child.content || [], childPos + 1);
        childPos += richNodeSize(child);
      });
    } else {
      if (node.type === "heading") text += "#".repeat(node.attrs?.level || 2) + " ";
      if (node.type === "bookNote") text += "> [!NOTE] ";
      writeInline(node.content || [], pos + 1);
    }
    ends.set(pos + richNodeSize(node), text.length);
  };
  let pos = 0;
  (doc.content || []).forEach((node, index) => {
    if (index) text += "\n\n";
    writeBlock(node, pos); pos += richNodeSize(node);
  });
  const leading = text.length - text.trimStart().length;
  const canonical = text.trim();
  return {
    text: canonical,
    range(from: number, to: number) {
      const start = Math.max(0, Math.min(canonical.length, (starts.get(from) ?? ends.get(from) ?? 0) - leading));
      const end = Math.max(start, Math.min(canonical.length, (ends.get(to) ?? starts.get(to) ?? text.length) - leading));
      return { start, end, text: canonical.slice(start, end), content: canonical };
    },
  };
}
