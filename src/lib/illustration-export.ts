import "server-only";
import path from "node:path";
import { readFile } from "node:fs/promises";
import type { Book, Illustration } from "./domain";
import { parseManuscript } from "./manuscript";
import { illustrationArtwork } from "./books";

export type ExportIllustration = { data: Uint8Array; type: string; meta: Illustration };
/** Only load illustrations actually referenced by the manuscript. Never fetch remote URLs. */
export async function exportIllustrations(book: Book): Promise<Record<string, ExportIllustration>> {
  const used = new Set(book.outline.flatMap(c =>
    parseManuscript(book.chapters[c.id]?.content || "")
      .filter(block => block.type === "illustration")
      .map(block => block.type === "illustration" ? block.id : "")
  ));
  const entries = await Promise.all([...used].map(async id => {
    const meta = book.illustrations?.[id];
    if (!meta) return null;
    if (meta.source === "library" && meta.preset) {
      const presets = ["mountain", "botanical", "stars", "waves"];
      if (!presets.includes(meta.preset)) return null;
      const data = await readFile(path.join(process.cwd(), "public", "illustrations", meta.preset + ".png"));
      return [id, { data: new Uint8Array(data), type: "image/png", meta }] as const;
    }
    const image = await illustrationArtwork(book, id);
    return [id, { ...image, meta }] as const;
  }));
  return Object.fromEntries(entries.filter((item): item is NonNullable<typeof item> => item !== null));
}
