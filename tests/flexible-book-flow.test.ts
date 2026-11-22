import { test } from "node:test";
import assert from "node:assert/strict";
import { briefSchema, editBookSchema, type Book } from "../src/lib/domain";
import { chapterGenerationPrompt } from "../src/lib/chapter-generation";
import { pdfHtml } from "../src/lib/export";
import { makeEpub } from "../src/lib/epub";

const chapterId = "33333333-3333-4333-8333-333333333333";
const brief = {
  idea: "A short illustrated children's story about sharing toys with friends.",
  audience: "Children aged four",
  kind: "children_story" as const,
  language: "en" as const,
  tone: "friendly" as const,
  author: "",
  section_unit: "page" as const,
  chapter_count: 1,
};
const book: Book = {
  ...brief, id: "11111111-1111-4111-8111-111111111111", user_id: "user",
  title: "Sharing toys", subtitle: "", cover_style: "sky", cover_path: null,
  use_artwork: false, unlocked: true, revision: 0, created_at: "", updated_at: "",
  outline: [{ id: chapterId, title: "The game", summary: "Two friends play together." }],
  chapters: { [chapterId]: { content: "The rabbit offers his friend a bright blue toy. They take turns and smile.", summary: "Friends share a toy." } },
};
test("short page-based books are accepted without forcing three chapters", () => {
  assert.equal(briefSchema.safeParse(brief).success, true);
  assert.equal(briefSchema.safeParse({ ...brief, chapter_count: 0 }).success, false);
  assert.equal(briefSchema.safeParse({ ...brief, chapter_count: 11 }).success, false);
  const edited = {
    revision: book.revision, title: book.title, subtitle: book.subtitle, author: "",
    cover_style: book.cover_style, use_artwork: false, outline: book.outline,
    chapters: book.chapters, section_unit: "page",
    include_toc: false, show_section_titles: false, show_page_numbers: false,
  };
  assert.equal(editBookSchema.safeParse(edited).success, true);
});
test("page mode instructs the model to write concise content pages rather than chapters", () => {
  const prompt = chapterGenerationPrompt(book, chapterId);
  assert.match(prompt, /ONE concise finished content page/);
  assert.match(prompt, /no headings/i);
  assert.doesNotMatch(prompt, /650–1000 word narrative chapter/);
});
test("book export honors optional contents and visible section headings", async () => {
  const hidden = { ...book, include_toc: false, show_section_titles: false };
  const html = await pdfHtml(hidden);
  assert.doesNotMatch(html, /<section class="toc">/);
  assert.doesNotMatch(html, /<h2>The game<\/h2>/);
  assert.match(html, /The rabbit offers his friend/);
  const visible = await pdfHtml({ ...book, include_toc: true, show_section_titles: true });
  assert.match(visible, /<section class="toc">/);
  assert.match(visible, /<h2>The game<\/h2>/);
  const epub = makeEpub(hidden).toString("utf8");
  assert.doesNotMatch(epub, /<h1>The game<\/h1>/);
});
