import { test } from "node:test";
import assert from "node:assert/strict";
import {
  type ChapterBook,
  chapterGenerationPrompt,
  generateCompleteChapter,
} from "../src/lib/chapter-generation";

function book(language: "en" | "ar" = "en"): ChapterBook {
  return {
    title: "A journey",
    idea: "A child finds the courage to explore the forest.",
    audience: "Young readers",
    kind: "novel",
    tone: "literary",
    language,
    outline: [
      { id: "first", title: "Arrival", summary: "They reach the forest." },
      { id: "second", title: "The bridge", summary: "They cross the bridge." },
      { id: "third", title: "Home", summary: "They return home." },
    ],
    chapters: {},
  };
}
const english = {
  content: "A complete scene. ".repeat(150),
  summary: "The child crosses the bridge safely.",
};
const arabic = {
  content: "عاد الطفل إلى البيت سالمًا. ".repeat(100),
  summary: "عبر الطفل الجسر ووصل إلى بيته بأمان.",
};

test("a usable chapter completes after one request", async () => {
  let calls = 0;
  assert.equal(
    await generateCompleteChapter(book(), "first", async () => {
      calls++;
      return english;
    }),
    english,
  );
  assert.equal(calls, 1);
});

test("repairing a short draft retains the full chapter length and has more output room", async () => {
  const calls: { operation: string; prompt: string; tokens: number }[] = [];
  const result = await generateCompleteChapter(
    book(),
    "first",
    async (operation, prompt, tokens) => {
      calls.push({ operation, prompt, tokens });
      return calls.length === 1
        ? { ...english, content: "Only an introduction." }
        : english;
    },
  );
  assert.equal(result, english);
  assert.deepEqual(
    calls.map((call) => call.operation),
    ["chapter", "chapter_recovery"],
  );
  assert.match(calls[1].prompt, /650–1000/);
  assert.doesNotMatch(calls[1].prompt, /450–650/);
  assert.ok(calls[1].tokens >= calls[0].tokens);
});

test("a chapter in the wrong language is repaired in the selected book language", async () => {
  let calls = 0;
  const result = await generateCompleteChapter(book("ar"), "first", async () =>
    ++calls === 1 ? english : arabic,
  );
  assert.equal(result, arabic);
  assert.equal(calls, 2);
});

test("two incomplete drafts stop without saving a shortened chapter or retrying indefinitely", async () => {
  let calls = 0;
  await assert.rejects(
    generateCompleteChapter(book(), "first", async () => {
      calls++;
      return { ...english, content: "Still incomplete." };
    }),
    /ai_generation_incomplete/,
  );
  assert.equal(calls, 2);
});

test("authentication and spend failures never trigger a repair request", async () => {
  for (const code of [
    "ai_auth_failed",
    "ai_credits_exhausted",
    "ai_provider_busy",
    "content_not_allowed",
  ]) {
    let calls = 0;
    const failure = new Error(code);
    await assert.rejects(
      generateCompleteChapter(book(), "first", async () => {
        calls++;
        throw failure;
      }),
      (error) => error === failure,
    );
    assert.equal(calls, 1);
  }
});

test("continuity context includes the previous ending, is bounded and excludes future manuscripts", () => {
  const draft = book();
  draft.chapters.first = {
    content: "old ".repeat(2000) + "PREVIOUS_END",
    summary: "PREVIOUS_SUMMARY",
  };
  draft.chapters.third = {
    content: "FUTURE_MANUSCRIPT",
    summary: "FUTURE_SUMMARY",
  };
  const prompt = chapterGenerationPrompt(draft, "second");
  const context = JSON.parse(prompt.slice(prompt.indexOf("Data: ") + 6));
  assert.match(context.previousChapterEnding.content, /PREVIOUS_END$/);
  assert.ok(context.previousChapterEnding.content.length <= 2400);
  assert.equal(context.previousSummaries[0].summary, "PREVIOUS_SUMMARY");
  assert.doesNotMatch(prompt, /FUTURE_MANUSCRIPT|FUTURE_SUMMARY/);
});

test("new chapters honor updated text over stale generated summaries", () => {
  const draft = book();
  draft.chapters.first = {
    content: "The child chooses a blue coat and leaves the old map behind. ".repeat(30) + "FINAL_EDITED_FACT",
    summary: "The child wears a red coat and still holds the map.",
  };
  const prompt = chapterGenerationPrompt(draft, "second");
  const context = JSON.parse(prompt.slice(prompt.indexOf("Data: ") + 6));
  assert.match(context.priorManuscriptExcerpts[0].ending, /FINAL_EDITED_FACT$/);
  assert.match(prompt, /trust the actual manuscript/);
  assert.doesNotMatch(prompt, /FUTURE_MANUSCRIPT/);
});
