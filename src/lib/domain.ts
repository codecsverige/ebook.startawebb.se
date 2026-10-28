import { z } from "zod";

export const locales = ["en", "ar", "sv"] as const;
export type Locale = (typeof locales)[number];
export const isLocale = (value: string): value is Locale =>
  locales.includes(value as Locale);
export const languageNames: Record<Locale, string> = {
  en: "English",
  ar: "العربية",
  sv: "Svenska",
};
/** Detect Arabic-language briefs to avoid accidentally creating English books. */
export function isArabicBrief(value: string): boolean {
  const arabic = (value.match(/[\u0621-\u064a\u0671-\u06d3]/g) || []).length;
  const latin = (value.match(/[A-Za-zÀ-ÿ]/g) || []).length;
  return arabic >= 18 && arabic >= latin * 0.6;
}

/** Guard saved AI output; never persist a largely non-Arabic Arabic manuscript. */
export function matchesBookLanguage(value: string, language: Locale): boolean {
  const letters = (value.match(/\p{L}/gu) || []).length;
  if (letters < 18) return true;
  const arabic = (value.match(/[\u0621-\u064a\u0671-\u06d3]/g) || []).length;
  return language === "ar" ? arabic / letters >= 0.52 : arabic / letters < 0.45;
}

export const kinds = ["guide", "ebook", "workbook", "novel", "short_story", "children_story"] as const;
export const tones = ["clear", "friendly", "professional", "literary", "dramatic", "playful"] as const;
export const coverStyles = [
  "cobalt", "sage", "clay", "midnight", "plum", "ivory",
  "forest", "ember", "lagoon", "rose", "noir", "sky",
  "gold", "teal", "berry", "sand", "ink", "sunrise",
] as const;
export type CoverStyle = (typeof coverStyles)[number];

/** Genre-aware suggestions use real templates, without spending AI credits. */
export function recommendedCoverStyles(kind: (typeof kinds)[number]): CoverStyle[] {
  switch (kind) {
    case "novel": return ["noir", "midnight", "berry", "forest", "plum"];
    case "short_story": return ["ember", "rose", "ink", "forest", "sky"];
    case "children_story": return ["sky", "sunrise", "berry", "rose", "lagoon"];
    case "workbook": return ["sage", "sand", "teal", "ivory", "cobalt"];
    case "guide": return ["cobalt", "teal", "ivory", "ink", "lagoon"];
    default: return ["ivory", "lagoon", "gold", "plum", "sand"];
  }
}

const cleanText = (min: number, max: number) =>
  z.string().trim().min(min).max(max);
export const briefSchema = z.object({
  idea: cleanText(20, 2000),
  audience: cleanText(3, 300),
  kind: z.enum(kinds),
  language: z.enum(locales),
  tone: z.enum(tones),
  author: z.string().trim().max(100).default(""),
  chapter_count: z.number().int().min(3).max(10),
});
export type Brief = z.infer<typeof briefSchema>;
export const outlineItemSchema = z.object({
  id: z.string().uuid(),
  title: cleanText(1, 160),
  summary: cleanText(1, 600),
});
export const outlineSchema = z.object({
  title: cleanText(1, 180),
  subtitle: z.string().trim().max(240),
  chapters: z
    .array(z.object({ title: cleanText(1, 160), summary: cleanText(1, 600) }))
    .min(3)
    .max(10),
});
export type OutlineItem = z.infer<typeof outlineItemSchema>;
export const chapterSchema = z.object({
  content: cleanText(150, 30000),
  summary: cleanText(20, 1000),
});
export type Chapter = z.infer<typeof chapterSchema>;
export const editBookSchema = z
  .object({
    revision: z.number().int().nonnegative(),
    title: cleanText(1, 180),
    subtitle: z.string().trim().max(240),
    author: z.string().trim().max(100),
    cover_style: z.enum(coverStyles),
    use_artwork: z.boolean(),
    outline: z.array(outlineItemSchema).min(3).max(10),
    chapters: z.record(
      z.string().uuid(),
      z.object({
        content: cleanText(1, 30000),
        summary: z.string().trim().max(1000),
      }),
    ),
  })
  .superRefine((v, ctx) => {
    const ids = new Set(v.outline.map((c) => c.id));
    if (
      ids.size !== v.outline.length ||
      Object.keys(v.chapters).some((id) => !ids.has(id))
    )
      ctx.addIssue({ code: "custom", message: "Invalid chapter identifiers" });
  });
export const jobKinds = [
  "outline",
  "sample",
  "book",
  "chapter",
  "cover",
] as const;
export type JobKind = (typeof jobKinds)[number];
export const jobRequestSchema = z.object({
  kind: z.enum(jobKinds),
  chapter_id: z.string().uuid().optional(),
  request_id: z.string().uuid(),
});
export type Book = Brief & {
  id: string;
  user_id: string;
  title: string;
  subtitle: string;
  outline: OutlineItem[];
  chapters: Record<string, Chapter>;
  cover_style: (typeof coverStyles)[number];
  cover_path: string | null;
  use_artwork: boolean;
  unlocked: boolean;
  revision: number;
  created_at: string;
  updated_at: string;
};
export type Job = {
  id: string;
  book_id: string;
  user_id: string;
  kind: JobKind;
  chapter_id: string | null;
  status: "queued" | "running" | "completed" | "failed";
  progress: number;
  error_code: string | null;
  run_id: string | null;
  created_at: string;
};
export type BookWithCover = Book & { cover_url?: string | null };
export type BookshelfBook = Omit<BookWithCover, "chapters"> & {
  word_count: number;
  completed_chapters: number;
  complete: boolean;
};
export function wordCount(text: string): number {
  return text.trim().split(/\s+/u).filter(Boolean).length;
}
export function usableGeneratedChapter(text: string): boolean {
  return wordCount(text) >= 350;
}
export function bookWords(book: Book): number {
  return Object.values(book.chapters).reduce(
    (n, c) => n + wordCount(c.content),
    0,
  );
}
export function isComplete(book: Book): boolean {
  return (
    book.outline.length > 0 &&
    book.outline.every((c) => !!book.chapters[c.id]?.content)
  );
}
export function filename(title: string): string {
  return (
    title
      .normalize("NFKC")
      .replace(/[^\p{L}\p{N}\s_-]/gu, "")
      .trim()
      .replace(/\s+/g, "-")
      .slice(0, 70) || "ebook"
  );
}
export function clip(value: string, length: number): string {
  return value.length > length ? `${value.slice(0, length)}…` : value;
}
