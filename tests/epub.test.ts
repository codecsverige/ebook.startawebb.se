import { test } from "node:test";
import assert from "node:assert/strict";
import { makeEpub } from "../src/lib/epub";
import type { Book } from "../src/lib/domain";

test("EPUB has an uncompressed mimetype first, XHTML chapters and Arabic metadata", () => {
  const id = "11111111-1111-4111-8111-111111111111";
  const chapterId = "22222222-2222-4222-8222-222222222222";
  const book: Book = {
    id, user_id: "test-user", idea: "قصة إنسانية عن الحب والحياة والخبرة",
    audience: "القراء العرب", kind: "novel", language: "ar",
    tone: "literary", author: "كاتب", chapter_count: 3,
    title: "الحب والحياة", subtitle: "حكاية", cover_style: "midnight",
    cover_path: null, use_artwork: false, unlocked: true,
    revision: 1, created_at: "2026-10-28", updated_at: "2026-10-28",
    outline: [{ id: chapterId, title: "الفصل الأول", summary: "بداية الأحداث" }],
    chapters: { [chapterId]: { content: "### عنوان فرعي\nمقدمة القصة.", summary: "مقدمة" } },
  };
  const output = makeEpub(book);
  assert.equal(output.readUInt32LE(0), 0x04034b50);
  const nameSize = output.readUInt16LE(26);
  assert.equal(output.toString("utf8", 30, 30 + nameSize), "mimetype");
  assert.equal(output.toString("utf8", 30 + nameSize, 30 + nameSize + 20), "application/epub+zip");
  const xml = output.toString("utf8");
  assert.match(xml, /OEBPS\/content.opf/);
  assert.match(xml, /page-progression-direction="rtl"/);
  assert.match(xml, /<h4>عنوان فرعي<\/h4>/);
  assert.doesNotMatch(xml, /### عنوان فرعي/);
});
