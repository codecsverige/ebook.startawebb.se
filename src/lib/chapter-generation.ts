import {
  type Book,
  type Chapter,
  languageNames,
  matchesBookLanguage,
  usableGeneratedChapter,
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
    // Bound context cost and never send a future chapter's manuscript.
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
    "Use earlier summaries and the previous chapter ending for continuity, without copying or recapping them. Do not bring future outline events forward.",
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
