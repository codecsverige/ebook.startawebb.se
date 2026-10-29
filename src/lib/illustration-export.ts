import "server-only";
import path from "node:path";
import sharp from "sharp";
import { readFile } from "node:fs/promises";
import type { Book, Illustration } from "./domain";
import { parseManuscript } from "./manuscript";
import { illustrationArtwork } from "./books";

export type ExportIllustration = {
  data: Uint8Array; type: string; meta: Illustration;
  dimensions?: { width: number; height: number };
};
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
      const m = await sharp(data).metadata();
      return [id, { data: new Uint8Array(data), type: "image/png", meta,
        dimensions: { width: m.width || 720, height: m.height || 408 } }] as const;
    }
    const image = await illustrationArtwork(book, id);
    if (image.type === "image/webp") {
      // Word/EPUB cannot reliably embed WebP. Convert once on the server.
      const png = await sharp(image.data, { limitInputPixels: 24_000_000 })
        .resize({ width: 1800, withoutEnlargement: true })
        .png({ compressionLevel: 8 }).toBuffer();
      const m = await sharp(png).metadata();
      return [id, { data: new Uint8Array(png), type: "image/png", meta,
        dimensions: { width: m.width || 720, height: m.height || 408 } }] as const;
    }
    const m = await sharp(image.data, { limitInputPixels: 24_000_000 }).metadata();
    return [id, { ...image, meta,
      dimensions: { width: m.width || 720, height: m.height || 408 } }] as const;
  }));
  return Object.fromEntries(entries.filter((item): item is NonNullable<typeof item> => item !== null));
}
