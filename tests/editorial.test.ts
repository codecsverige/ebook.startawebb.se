import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  bookSettings,
  bookSettingsSchema,
  jobRequestSchema,
  type Book,
} from "../src/lib/domain";
import {
  continuityExcerpt,
  applyTextSuggestion,
  editorialContext,
  coverIdeasSchema,
} from "../src/lib/editorial";
import { coverMarkup, publicationBody } from "../src/lib/book-design";
import { directFormat } from "../src/lib/direct-openai";
import { makeEpub } from "../src/lib/epub";

const id = randomUUID();
const book: Book = {
  id: randomUUID(),
  user_id: "test",
  title: "A book <script>",
  subtitle: "A real subtitle",
  author: "Author",
  idea: "A clear, useful book about everyday focus.",
  audience: "Readers",
  kind: "guide",
  language: "en",
  tone: "clear",
  chapter_count: 1,
  outline: [{ id, title: "One", summary: "An outline" }],
  chapters: {
    [id]: {
      content: "## Real heading\nUseful content",
      summary: "Accurate chapter summary.",
    },
  },
  cover_style: "cobalt",
  cover_path: null,
  use_artwork: false,
  unlocked: true,
  revision: 2,
  created_at: "2026-10-29",
  updated_at: "2026-10-29",
};
test("old books retain a valid design without migration and settings reject arbitrary markup as enum values", () => {
  assert.equal(bookSettings(book).cover_layout, "editorial");
  assert.equal(bookSettings(book).back_cover, false);
  assert.equal(
    bookSettingsSchema.safeParse({ cover_layout: 'x\" onmouseover=\"alert(1)' })
      .success,
    false,
  );
});
test("text suggestions replace only the original selection and refuse stale text or overlong edits", () => {
  const result = { start: 6, end: 11, original: "world", content: "reader" };
  assert.equal(applyTextSuggestion("Hello world!", result), "Hello reader!");
  assert.equal(applyTextSuggestion("Hello earth!", result), null);
  assert.equal(
    applyTextSuggestion("Hello world!", { ...result, end: 200 }),
    null,
  );
  assert.equal(
    applyTextSuggestion("Hello world!", {
      ...result,
      content: "x".repeat(30000),
    }),
    null,
  );
});
test("manual-edit continuity retains the ending and stays within the stored summary size", () => {
  const summary = continuityExcerpt(
    "Beginning " + "middle ".repeat(400) + "The character is now called Nora.",
  );
  assert.ok(summary.startsWith("Beginning"));
  assert.ok(summary.endsWith("called Nora."));
  assert.ok(summary.length <= 1000);
});
test("assistant requests require a revision and editing instructions", () => {
  const base = { kind: "assist", chapter_id: id, request_id: randomUUID() };
  assert.equal(jobRequestSchema.safeParse(base).success, false);
  assert.equal(
    jobRequestSchema.safeParse({
      ...base,
      assistant: { revision: 2, instruction: "Fix punctuation" },
    }).success,
    true,
  );
  assert.equal(
    jobRequestSchema.safeParse({
      ...base,
      assistant: { revision: 2, instruction: "" },
    }).success,
    false,
  );
  assert.equal(
    jobRequestSchema.safeParse({
      ...base,
      assistant: {
        revision: 2,
        instruction: "Fix",
        selection: { start: -1, end: 10 },
      },
    }).success,
    false,
  );
});
test("cover ideas require three distinct slots and direct-provider formats support every editorial operation", () => {
  for (const operation of ["assist", "cover_ideas", "review"]) {
    const format = directFormat(operation);
    assert.equal(format.strict, true);
    assert.equal(format.schema.additionalProperties, false);
  }
  assert.equal(
    coverIdeasSchema.safeParse({ concepts: [], back_cover_text: "A blurb" })
      .success,
    false,
  );
});
test("cover and publication renderers escape author text and include optional pages without leaking raw HTML", () => {
  const modified = {
    ...book,
    settings: bookSettingsSchema.parse({
      back_cover: true,
      back_cover_text: "Back <img src=x onerror=alert(1)>",
      copyright: "Copyright 2026",
      dedication: "For my family",
      author_bio: "An actual author biography.",
    }),
  };
  const cover = coverMarkup({
    title: book.title,
    subtitle: '\" onload=\"x',
    image: '/safe-image\" onerror=\"x',
  });
  assert.doesNotMatch(cover, /<script>|src="\/safe-image" onerror=/);
  assert.match(cover, /&lt;script&gt;/);
  const body = publicationBody(modified);
  assert.match(body, /Copyright 2026/);
  assert.match(body, /For my family/);
  assert.match(body, /pub-back-cover/);
  assert.match(body, /&lt;img/);
  const epub = makeEpub(modified).toString("utf8");
  assert.match(epub, /<itemref idref="nav"\/>/);
  assert.match(epub, /<itemref idref="back-cover"\/>/);
  assert.match(epub, /about-author.xhtml/);
});
test("long-book review context has a bounded manuscript budget and uses only actual chapter IDs", () => {
  const long = {
    ...book,
    outline: Array.from({ length: 30 }, (_, i) => ({
      id: randomUUID(),
      title: "Chapter " + i,
      summary: "Specific plan",
    })),
    chapters: {},
  } as Book;
  for (const c of long.outline)
    long.chapters[c.id] = {
      content: "word ".repeat(6000),
      summary: "Actual summary.",
    };
  const context = editorialContext(long);
  assert.ok(context.chapters.reduce((n, c) => n + c.excerpt.length, 0) < 49000);
  assert.deepEqual(
    context.chapters.map((c) => c.id),
    long.outline.map((c) => c.id),
  );
});
