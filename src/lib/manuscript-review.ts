import type { Book } from "./domain";
import { wordCount } from "./domain";

export type ReviewIssueKind =
  | "missing_chapter"
  | "short_chapter"
  | "repeated_paragraph"
  | "long_paragraph"
  | "missing_illustration";

export type ManuscriptReviewIssue = {
  kind: ReviewIssueKind;
  chapterId: string;
  chapterTitle: string;
};

/**
 * Fast, local review that never calls AI and never mutates the manuscript.
 * These are editorial warnings, NOT claims that facts have been verified.
 */
export function reviewManuscript(book: Pick<Book, "outline" | "chapters" | "illustrations">): ManuscriptReviewIssue[] {
  const issues: ManuscriptReviewIssue[] = [];
  const seen = new Map<string, string>();
  const illustrations = book.illustrations || {};
  for (const chapter of book.outline) {
    const content = book.chapters[chapter.id]?.content?.trim() || "";
    const add = (kind: ReviewIssueKind) => {
      if (!issues.some(issue => issue.chapterId === chapter.id && issue.kind === kind))
        issues.push({ kind, chapterId: chapter.id, chapterTitle: chapter.title });
    };
    if (!content) { add("missing_chapter"); continue; }
    if (wordCount(content) < 350) add("short_chapter");

    // Markdown/image markers are not natural-language paragraphs.
    const paragraphs = content.split(/\n\s*\n/u);
    for (const raw of paragraphs) {
      const paragraph = raw.trim().replace(/\s+/gu, " ");
      const normalized = paragraph
        .replace(/^[#>*\-0-9.\s]+/u, "")
        .replace(/[*_~]/gu, "")
        .trim().toLocaleLowerCase();
      if (normalized.length >= 120 && wordCount(normalized) >= 15) {
        if (seen.has(normalized)) add("repeated_paragraph");
        else seen.set(normalized, chapter.id);
      }
      if (paragraph.length > 1800 && wordCount(paragraph) > 200)
        add("long_paragraph");
    }
    for (const image of content.matchAll(/\[\[illustration:([0-9a-f-]{36})\]\]/gi)) {
      if (!illustrations[image[1]]) add("missing_illustration");
    }
  }
  return issues;
}

export function reviewIssueLabel(kind: ReviewIssueKind, locale: "ar" | "sv" | "en"): string {
  const labels: Record<ReviewIssueKind, { en: string; ar: string; sv: string }> = {
    missing_chapter: {
      en: "This chapter is empty",
      ar: "الفصل فارغ",
      sv: "Kapitlet saknar text",
    },
    short_chapter: {
      en: "This chapter is very short; check whether it is complete",
      ar: "الفصل قصير جدًا، تحقق من اكتماله",
      sv: "Kapitlet är mycket kort, kontrollera att det är färdigt",
    },
    repeated_paragraph: {
      en: "A long paragraph is repeated in the manuscript",
      ar: "توجد فقرة طويلة مكررة في المخطوط",
      sv: "Ett längre stycke upprepas i manuset",
    },
    long_paragraph: {
      en: "A very long paragraph may need splitting for readability",
      ar: "هناك فقرة طويلة جدًا، يُفضّل تقسيمها",
      sv: "Ett mycket långt stycke kan behöva delas upp",
    },
    missing_illustration: {
      en: "An illustration in the text is missing from the book assets",
      ar: "هناك صورة مشار إليها في النص لكنها غير موجودة",
      sv: "En illustration i texten saknas bland bilderna",
    },
  };
  return labels[kind][locale];
}
