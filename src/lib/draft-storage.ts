import { z } from "zod";
import { editBookSchema, outlineItemSchema, type BookWithCover } from "./domain";

const localDraftSchema = editBookSchema.safeExtend({
  title: z.string().max(180),
  outline: z.array(outlineItemSchema.extend({ title: z.string().max(160), summary: z.string().max(600) })).max(30),
});

export const draftKey = (id: string) => `ebook-studio:draft:${id}`;
type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export type SavedDraft = { version: 2; savedAt: string; book: BookWithCover };

/** Only author-editable data may be restored; server ownership, media and credits stay authoritative. */
export function editableBook(book: BookWithCover) {
  const { revision, title, subtitle, author, cover_style, use_artwork, outline, chapters, idea, audience, kind, tone, chapter_count } = book;
  return {
    revision, title, subtitle, author, cover_style, use_artwork, outline, chapters,
    idea, audience, kind, tone, ...(outline.length ? {} : {chapter_count}),
    cover_direction: book.cover_direction || "", back_blurb: book.back_blurb || "",
    author_bio: book.author_bio || "", dedication: book.dedication || "",
    preface: book.preface || "", acknowledgments: book.acknowledgments || "",
    copyright_notice: book.copyright_notice || "", layout_theme: book.layout_theme || "classic",
    story_notes: book.story_notes || "",
  };
}
export function sameManuscript(a: BookWithCover, b: BookWithCover): boolean {
  const normalized = (book: BookWithCover) => {
    const value = editableBook(book);
    return { ...value, revision: 0, chapters: value.outline.map(c =>
      [c.id, value.chapters[c.id]?.content || ""]) };
  };
  return JSON.stringify(normalized(a)) === JSON.stringify(normalized(b));
}
export function writeDraft(storage: StorageLike, book: BookWithCover): SavedDraft {
  const entry: SavedDraft = { version: 2, savedAt: new Date().toISOString(), book };
  storage.setItem(draftKey(book.id), JSON.stringify(entry));
  return entry;
}
export function readDraft(storage: StorageLike, cloud: BookWithCover): SavedDraft | null {
  try {
    const raw = storage.getItem(draftKey(cloud.id));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const book = parsed.version === 2 ? parsed.book : parsed;
    if (!book || book.id !== cloud.id || book.user_id !== cloud.user_id ||
        !localDraftSchema.safeParse(editableBook(book)).success || sameManuscript(book, cloud)) return null;
    return { version: 2, savedAt: parsed.savedAt || book.updated_at, book };
  } catch { return null; }
}
export function restoreDraft(cloud: BookWithCover, saved: BookWithCover): BookWithCover {
  if (saved.id !== cloud.id || saved.user_id !== cloud.user_id) throw new Error("not_found");
  return { ...cloud, ...localDraftSchema.parse(editableBook(saved)), revision: cloud.revision };
}
