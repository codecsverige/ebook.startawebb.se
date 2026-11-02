import { test } from "node:test";
import assert from "node:assert/strict";
import {
  chapterContinuationPrompt,
  generateChapterContinuation,
  type ChapterBook,
} from "../src/lib/chapter-generation";
import { reviewManuscript, reviewIssueLabel } from "../src/lib/manuscript-review";
import type { Book } from "../src/lib/domain";

const ids = [
  "72f9e51d-52e9-481d-a2ca-0a3a27461210",
  "5c1cf2e7-b3d4-4ba6-8a7a-4eb09ed9b214",
];
function example(): ChapterBook {
  return {
    title: "A child and the forest",
    idea: "A child travels through a forest and learns to trust her friends.",
    audience: "Young readers",
    kind: "novel",
    tone: "literary",
    language: "en",
    outline: [
      { id: ids[0], title: "The arrival", summary: "The child arrives at the gate." },
      { id: ids[1], title: "The river", summary: "The child crosses a river." },
    ],
    chapters: {
      [ids[0]]: {
        content: "The child opened the old wooden gate. " .repeat(35),
        summary: "The child enters the forest.",
      },
    },
  };
}
const added = {
  content: "She crossed the clearing and listened carefully to her friend. ".repeat(50),
  summary: "The companions advance towards the river.",
};
test("continuation prompt explicitly preserves the saved chapter and context", () => {
  const result = chapterContinuationPrompt(example(), ids[0]);
  assert.match(result, /DO NOT output again/);
  assert.match(result, /old wooden gate/);
  assert.match(result, /ONLY the additional prose/);
  assert.doesNotMatch(result, /Write a vivid, original 650/);
});
test("chapter continuation returns only the new text", async () => {
  const book = example();
  const original = book.chapters[ids[0]].content;
  let calls = 0;
  assert.deepEqual(await generateChapterContinuation(book, ids[0], async () => {
    calls++;
    return added;
  }), added);
  assert.equal(calls, 1);
  assert.equal(book.chapters[ids[0]].content, original);
});
test("short AI continuations are repaired once but never silently accepted", async () => {
  let calls = 0;
  const result = await generateChapterContinuation(example(), ids[0], async (_op, _prompt, budget) => {
    calls++;
    assert.ok(budget >= 4500);
    return calls === 1
      ? { content: "A short answer.", summary: added.summary } : added;
  });
  assert.deepEqual(result, added);
  assert.equal(calls, 2);
});
test("a repeated opening is rejected, and budget errors never retry", async () => {
  const book = example();
  const repeated = {
    ...added,
    content: book.chapters[ids[0]].content.slice(0, 220) + added.content,
  };
  let calls = 0;
  await assert.rejects(generateChapterContinuation(book, ids[0], async () => {
    calls++; return repeated;
  }), /ai_generation_invalid/);
  assert.equal(calls, 2);
  calls = 0;
  await assert.rejects(generateChapterContinuation(book, ids[0], async () => {
    calls++; throw new Error("ai_credits_exhausted");
  }), /ai_credits_exhausted/);
  assert.equal(calls, 1);
});
test("continuation refuses missing text and overly long chapters", () => {
  const book = example();
  assert.throws(() => chapterContinuationPrompt(book, ids[1]), /invalid_input/);
  book.chapters[ids[0]].content = "A".repeat(26_001);
  assert.throws(() => chapterContinuationPrompt(book, ids[0]), /invalid_input/);
});
test("editorial review spots repeated, missing, short and broken-image chapters", () => {
  const repeat = "The old cedar tree towered over the quiet village and the travellers heard the distant bells of the monastery. ".repeat(2);
  const book = example();
  const missing = "ea497d92-b5cb-4305-890a-5540e02e0bf3";
  book.chapters[ids[0]].content = repeat + "\n\n" + repeat +
    "\n\n[[illustration:" + missing + "]]\n\n" + "Short extra passage.";
  const issues = reviewManuscript(book as Book);
  assert.ok(issues.some(i => i.kind === "repeated_paragraph" && i.chapterId === ids[0]));
  assert.ok(issues.some(i => i.kind === "missing_illustration"));
  assert.ok(issues.some(i => i.kind === "short_chapter"));
  assert.ok(issues.some(i => i.kind === "missing_chapter" && i.chapterId === ids[1]));
  assert.match(reviewIssueLabel("short_chapter", "ar"), /قصير/);
});
