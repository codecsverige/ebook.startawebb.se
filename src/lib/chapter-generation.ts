import {
  type Book,
  type Chapter,
  languageNames,
  matchesBookLanguage,
  usableGeneratedChapter,
  wordCount,
} from "./domain";

export type ChapterBook = Pick<
  Book,
  | "title"
  | "idea"
  | "audience"
  | "kind"
  | "tone"
  | "language"
  | "outline"
  | "chapters"
  | "story_notes"
>;
type WriteChapter = (
  operation: "chapter" | "chapter_recovery",
  prompt: string,
  maxOutputTokens: number,
) => Promise<Chapter>;

const repairable = new Set([
  "ai_generation_invalid",
  "ai_generation_incomplete",
  "ai_wrong_language",
]);

export function chapterGenerationPrompt(
  book: ChapterBook,
  chapterId: string,
): string {
  const index = book.outline.findIndex((chapter) => chapter.id === chapterId);
  if (index < 0) throw new Error("invalid_input");
  const fiction = ["novel", "short_story", "children_story"].includes(
    book.kind,
  );
  const writing = fiction
    ? "Write a vivid, original 650–1000 word narrative chapter. Use scenes, natural dialogue, character actions and sensory details. Preserve character names, viewpoint, chronology and unresolved threads. No Markdown headings or bullet points within the story. For children use age-appropriate language."
    : "Write a substantial 700–1100 word chapter. Use Markdown subheadings, short paragraphs and concrete examples as appropriate. Include exercises for workbooks. Avoid repetition.";
  const previous = book.outline.slice(0, index);
  const previousChapter = previous.at(-1);
  const previousDraft = previousChapter && book.chapters[previousChapter.id];
  const data = {
    title: book.title,
    idea: book.idea,
    audience: book.audience,
    kind: book.kind,
    tone: book.tone,
    authorContinuityNotes: book.story_notes?.slice(0, 2000) || undefined,
    outline: book.outline,
    currentChapter: book.outline[index],
    previousSummaries: previous
      .filter((chapter) => Boolean(book.chapters[chapter.id]))
      .map((chapter) => ({
        title: chapter.title,
        summary: book.chapters[chapter.id].summary,
      })),
    // Edited prose is the source of truth. Generated summaries can become stale
    // after a person changes a character, event or conclusion in the editor.
    // Keep the latest six finished chapters bounded for predictable AI cost.
    priorManuscriptExcerpts: previous
      .filter((chapter) => Boolean(book.chapters[chapter.id]?.content.trim()))
      .slice(-6)
      .map((chapter) => ({
        title: chapter.title,
        opening: book.chapters[chapter.id].content.slice(0, 450),
        ending: book.chapters[chapter.id].content.slice(-1350),
      })),
    // Never include the target or future chapter's manuscript.
    previousChapterEnding: previousDraft
      ? {
          title: previousChapter.title,
          content: previousDraft.content.slice(-2400),
        }
      : undefined,
  };
  return [
    writing,
    "Write only the current chapter. Do not repeat its title or restart the book's introduction.",
    "Use the preceding chapter manuscripts and endings for continuity, without copying or recapping them. If older generated summaries conflict with edited chapter text, trust the actual manuscript. Do not bring future outline events forward.",
    "End with a complete sentence at a natural chapter stopping point, never an unfinished paragraph or a promise to continue later.",
    "Return content (the full chapter) and summary (a factual 30–90 word continuity summary).",
    "Write both fields entirely in " + languageNames[book.language] + ".",
    "Data: " + JSON.stringify(data),
  ].join(" ");
}

export async function generateCompleteChapter(
  book: ChapterBook,
  chapterId: string,
  write: WriteChapter,
  onRecovery?: (reason: string) => void,
): Promise<Chapter> {
  const prompt = chapterGenerationPrompt(book, chapterId);
  function validate(chapter: Chapter): Chapter {
    if (!usableGeneratedChapter(chapter.content))
      throw new Error("ai_generation_incomplete");
    if (
      !matchesBookLanguage(
        chapter.content + " " + chapter.summary,
        book.language,
      )
    )
      throw new Error("ai_wrong_language");
    return chapter;
  }
  try {
    return validate(await write("chapter", prompt, 6500));
  } catch (error) {
    const reason = error instanceof Error ? error.message : "";
    // Authentication, budget, network and policy errors must not trigger another paid request.
    if (!repairable.has(reason)) throw error;
    onRecovery?.(reason);
    return validate(
      await write(
        "chapter_recovery",
        "The previous attempt failed: " +
          reason +
          ". Return a complete replacement chapter using the original requirements below. Keep the SAME target word count; do not shorten, summarize or replace the chapter with an introduction. " +
          prompt,
        8500,
      ),
    );
  }
}


/**
 * Continue the saved manuscript rather than regenerating it.
 * The response contains ONLY new prose; the existing text remains authoritative.
 * Keep each extension bounded so a single AI call cannot exceed Firestore limits.
 */
export function chapterContinuationPrompt(book: ChapterBook, chapterId: string): string {
  const existing = book.chapters[chapterId]?.content?.trim();
  if (!existing || existing.length > 26_000) throw new Error("invalid_input");
  const base = chapterGenerationPrompt(book, chapterId);
  const context = base.slice(base.indexOf("Data: ") + 6);
  const fiction = ["novel", "short_story", "children_story"].includes(book.kind);
  return [
    fiction
      ? "Write 400–650 NEW words continuing the current narrative scene. Maintain the narrator, time, setting, characters and their motives. Continue naturally instead of restarting or summarizing."
      : "Write 400–650 NEW words expanding the unfinished material with specific explanations, examples or exercises. Do not restart the chapter or duplicate existing sections.",
    "Return ONLY the additional prose in content, followed by a brief factual summary of the NEW material in summary.",
    "Never return the previous manuscript, a chapter description, an outline, a proposal, a preface, an introductory greeting or a promise to write later.",
    "Start at the precise stopping point of the existing text, without repeating its last sentences, and end with complete sentences.",
    "Use the exact language and tone of the existing manuscript. Do not invent citations, quotes, sources or factual statistics.",
    "EXISTING CHAPTER END (authoritative; DO NOT output again): " + existing.slice(-6000),
    "EXISTING CHAPTER OPENING (context only): " + existing.slice(0, 800),
    "Data: " + context,
  ].join("\n\n");
}

export async function generateChapterContinuation(
  book: ChapterBook,
  chapterId: string,
  write: WriteChapter,
  onRecovery?: (reason: string) => void,
): Promise<Chapter> {
  const existing = book.chapters[chapterId]?.content || "";
  const prompt = chapterContinuationPrompt(book, chapterId);
  function validate(next: Chapter): Chapter {
    if (wordCount(next.content) < 220 || next.content.length + existing.length + 2 > 30_000)
      throw new Error("ai_generation_incomplete");
    if (!matchesBookLanguage(next.content + " " + next.summary, book.language))
      throw new Error("ai_wrong_language");
    const beginning = next.content.trim().slice(0, 140).replace(/\s+/gu, " ");
    if (beginning.length >= 90 && existing.replace(/\s+/gu, " ").includes(beginning))
      throw new Error("ai_generation_invalid");
    return next;
  }
  try {
    return validate(await write("chapter", prompt, 4500));
  } catch (error) {
    const reason = error instanceof Error ? error.message : "";
    if (!repairable.has(reason)) throw error;
    onRecovery?.(reason);
    return validate(await write(
      "chapter_recovery",
      "The extension failed validation: " + reason +
        ". Write only NEW continuation text, do not repeat or replace any saved material. " + prompt,
      5200,
    ));
  }
}
