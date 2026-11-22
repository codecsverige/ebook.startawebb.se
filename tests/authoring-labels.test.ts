import { test } from "node:test";
import assert from "node:assert/strict";
import { partLabel } from "../src/lib/authoring-labels";

test("authoring labels reflect each selected structural unit in all supported languages", () => {
  assert.equal(partLabel("ar", "page"), "صفحة محتوى");
  assert.equal(partLabel("ar", "page", true), "صفحات محتوى");
  assert.equal(partLabel("ar", "chapter", true), "فصول");
  assert.equal(partLabel("ar", "section", true), "أقسام");
  assert.equal(partLabel("en", "page", true), "content pages");
  assert.equal(partLabel("sv", "section", true), "avsnitt");
  assert.equal(partLabel("sv", undefined, true), "kapitel");
});
