import { test } from "node:test";
import assert from "node:assert/strict";
import { editBookSchema, type Book } from "../src/lib/domain";
import { makeEpub } from "../src/lib/epub";
import { pdfHtml } from "../src/lib/export";

const chapterId = "22222222-2222-4222-8222-222222222222";
const validOutline = [
  { id: chapterId, title: "First steps", summary: "Starting out" },
  { id: "33333333-3333-4333-8333-333333333333", title: "Second steps", summary: "Practice" },
  { id: "44444444-4444-4444-8444-444444444444", title: "Third steps", summary: "Finishing" },
];
const manuscript: Book = {
  id: "11111111-1111-4111-8111-111111111111",
  user_id: "user", idea: "A detailed book idea about overcoming uncertainty.",
  kind: "guide", audience: "Readers", language: "en", tone: "friendly",
  author: "A. Writer", title: "New Paths", subtitle: "A practical guide",
  chapter_count: 3, cover_style: "forest", cover_path: null,
  cover_direction: "One lantern in a wide forest", back_blurb: "A useful guide for everyone.",
  author_bio: "A writer who helps readers.", dedication: "For you.",
  preface: "A warm welcome to the book.", use_artwork: false,
  unlocked: true, revision: 2, created_at: "2026-10-29", updated_at: "2026-10-29",
  outline: [{ id: chapterId, title: "First steps", summary: "Starting out" }],
  chapters: { [chapterId]: { content: "Practical steps.", summary: "A first step." } },
};

test("older manuscripts are still valid when new cover fields are absent", () => {
  const input = editBookSchema.parse({
    revision: 1, title: manuscript.title, subtitle: manuscript.subtitle,
    author: manuscript.author, cover_style: manuscript.cover_style,
    use_artwork: false, outline: validOutline, chapters: manuscript.chapters,
  });
  assert.equal(input.cover_direction, "");
  assert.equal(input.back_blurb, "");
});

test("new cover fields are bounded by server validation", () => {
  const input = {
    revision: 1, title: manuscript.title, subtitle: manuscript.subtitle,
    author: manuscript.author, cover_style: manuscript.cover_style,
    use_artwork: false, outline: validOutline, chapters: manuscript.chapters,
    cover_direction: "A unique scene", back_blurb: "Back cover blurb",
    author_bio: "Biography", dedication: "", preface: "",
  };
  assert.equal(editBookSchema.parse(input).cover_direction, "A unique scene");
  assert.equal(editBookSchema.safeParse({ ...input, cover_direction: "x".repeat(801) }).success, false);
});

test("PDF exports the same back-cover content after chapters, with optional front matter", async () => {
  const html = await pdfHtml(manuscript);
  const cover = html.indexOf('class="cover');
  const dedication = html.indexOf('class="front-matter');
  const toc = html.indexOf('class="toc');
  const chapter = html.indexOf('class="chapter');
  const back = html.indexOf('class="back-cover');
  assert.ok(cover >= 0 && cover < dedication);
  assert.ok(dedication < toc && toc < chapter && chapter < back);
  assert.match(html, /A useful guide for everyone/);
  assert.match(html, /A writer who helps readers/);
});

test("EPUB includes cover, optional front matter, chapters and back in order", () => {
  const xml = makeEpub(manuscript).toString("utf8");
  assert.match(xml, /OEBPS\/back.xhtml/);
  assert.match(xml, /OEBPS\/dedication.xhtml/);
  assert.match(xml, /OEBPS\/preface.xhtml/);
  assert.match(xml, /A useful guide for everyone/);
  assert.match(xml, /<itemref idref="cover"\/>.*<itemref idref="dedication"\/>.*<itemref idref="preface"\/>.*<itemref idref="ch1"\/>.*<itemref idref="back"\/>/);
});


test("report and research documents can omit covers without losing their chapters", async () => {
  const report = {...manuscript,kind:"report" as const,include_cover:false};
  const parsed = editBookSchema.parse({
    revision:1,title:report.title,subtitle:report.subtitle,author:report.author,
    cover_style:report.cover_style,use_artwork:false,include_cover:false,
    kind:"report",outline:validOutline,chapters:report.chapters,
  });
  assert.equal(parsed.include_cover,false);
  const html = await pdfHtml(report);
  assert.doesNotMatch(html, /<section class="cover(?:\s|")/);
  assert.doesNotMatch(html, /<section class="back-cover/);
  assert.match(html, /<section class="toc"/);
  assert.match(html, /Practical steps/);
  const xml = makeEpub(report).toString("utf8");
  assert.doesNotMatch(xml, /OEBPS\/cover.xhtml/);
  assert.doesNotMatch(xml, /OEBPS\/back.xhtml/);
  assert.match(xml, /OEBPS\/chapter-1.xhtml/);
});

test("pre-existing books retain their cover unless explicitly disabled", () => {
  const value = editBookSchema.parse({
    revision:1,title:manuscript.title,subtitle:manuscript.subtitle,author:manuscript.author,
    cover_style:manuscript.cover_style,use_artwork:false,outline:validOutline,chapters:manuscript.chapters,
  });
  assert.equal(value.include_cover,true);
});
