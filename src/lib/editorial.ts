import { z } from "zod";
import { coverLayouts, languageNames, type Book } from "./domain";

export const editSuggestionSchema = z.object({
  content: z.string().trim().min(1).max(30000),
  summary: z.string().trim().min(20).max(1000),
  note: z.string().trim().min(1).max(1600),
});
export const coverIdeasSchema = z.object({
  concepts: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(120),
        description: z.string().trim().min(1).max(700),
        prompt: z.string().trim().min(10).max(1600),
        layout: z.enum(coverLayouts),
      }),
    )
    .length(3),
  back_cover_text: z.string().trim().min(1).max(2500),
});
export const editorialReviewSchema = z.object({
  overview: z.string().trim().min(1).max(2000),
  issues: z
    .array(
      z.object({
        severity: z.enum(["warning", "suggestion"]),
        chapter_id: z.string().max(36),
        title: z.string().trim().min(1).max(180),
        detail: z.string().trim().min(1).max(1200),
      }),
    )
    .max(12),
  strengths: z.array(z.string().trim().min(1).max(400)).max(4),
});

/** Keep existing AI summaries intact. After manual edits, include the beginning
 * AND ending instead of silently retaining an outdated story summary. */
export function continuityExcerpt(content: string): string {
  const plain = content.replace(/[#*_]/g, "").replace(/\s+/g, " ").trim();
  return plain.length <= 1000
    ? plain
    : plain.slice(0, 580) + " … " + plain.slice(-410);
}
export function editorialContext(book: Book) {
  const perChapter = Math.min(
    4000,
    Math.floor(48000 / Math.max(1, book.outline.length)),
  );
  return {
    title: book.title,
    idea: book.idea,
    audience: book.audience,
    kind: book.kind,
    tone: book.tone,
    language: languageNames[book.language],
    chapters: book.outline.map((c) => {
      const draft = book.chapters[c.id];
      const text = draft?.content || "";
      return {
        id: c.id,
        title: c.title,
        plan: c.summary,
        summary: draft?.summary || "",
        written: Boolean(text),
        excerpt:
          text.length <= perChapter
            ? text
            : text.slice(0, Math.floor(perChapter * 0.6)) +
              "\n[…]\n" +
              text.slice(-Math.floor(perChapter * 0.4)),
      };
    }),
  };
}
export function applyTextSuggestion(
  current: string,
  result: { start: number; end: number; original: string; content: string },
): string | null {
  if (
    result.start < 0 ||
    result.end < result.start ||
    result.end > current.length ||
    current.slice(result.start, result.end) !== result.original
  )
    return null;
  const next =
    current.slice(0, result.start) + result.content + current.slice(result.end);
  return next.length <= 30000 ? next : null;
}
