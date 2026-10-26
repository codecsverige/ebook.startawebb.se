import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import {
  briefSchema,
  editBookSchema,
  filename,
  wordCount,
} from "../src/lib/domain";
import { escapeHtml, markdownHtml } from "../src/lib/export-text";
import { validSignature } from "../src/lib/webhook";
import { matchesPackCatalog } from "../src/lib/commerce";

test("checkout refuses a different currency, price or recurring product", () => {
  const price = {
    category: "one_time",
    scheme: "standard",
    unit_price: 900,
    variant_id: 123,
  };
  assert.equal(
    matchesPackCatalog({ currency: "EUR" }, price, "123", "one"),
    true,
  );
  assert.equal(
    matchesPackCatalog({ currency: "USD" }, price, "123", "one"),
    false,
  );
  assert.equal(
    matchesPackCatalog(
      { currency: "EUR" },
      { ...price, category: "subscription" },
      "123",
      "one",
    ),
    false,
  );
  assert.equal(
    matchesPackCatalog(
      { currency: "EUR" },
      { ...price, unit_price: 9000 },
      "123",
      "one",
    ),
    false,
  );
  assert.equal(
    matchesPackCatalog({ currency: "EUR" }, price, "124", "one"),
    false,
  );
});

test("brief validates real bounds and rejects unbounded generation", () => {
  const brief = {
    idea: "A practical guide to improving daily focus.",
    audience: "New freelancers",
    kind: "guide",
    tone: "clear",
    language: "ar",
    author: "Riadh",
    chapter_count: 6,
  };
  assert.equal(briefSchema.safeParse(brief).success, true);
  for (const change of [
    { chapter_count: 100 },
    { language: "unknown" },
    { idea: "short" },
    { audience: "x" },
    { idea: "a".repeat(2001) },
  ])
    assert.equal(briefSchema.safeParse({ ...brief, ...change }).success, false);
});
test("safe filenames retain Arabic and Swedish without path traversal", () => {
  assert.equal(filename("../دليلي: الأول/"), "دليلي-الأول");
  assert.equal(filename("Börja smått!"), "Börja-smått");
  assert.equal(filename("!!!"), "ebook");
  assert.equal(wordCount("  كلمة أولى\n كلمة ثانية  "), 4);
});
test("manuscript HTML cannot execute model or user supplied markup", () => {
  const input =
    "<script>alert(1)</script>\n\n## A heading\n\n- **Useful** step\n- <img src=x onerror=alert(1)>";
  const html = markdownHtml(input);
  assert.ok(!html.includes("<script>"));
  assert.ok(!html.includes("<img"));
  assert.ok(html.includes("<h3>A heading</h3>"));
  assert.ok(html.includes("<strong>Useful</strong>"));
  assert.ok(html.includes("&lt;img"));
  assert.equal(escapeHtml('"<&'), "&quot;&lt;&amp;");
});
test("webhook HMAC checks exact bytes and rejects malformed signatures", () => {
  const body = '{"paid":true}';
  const secret = "test-only-secret";
  const signature = createHmac("sha256", secret).update(body).digest("hex");
  assert.equal(validSignature(body, signature, secret), true);
  assert.equal(validSignature(body + " ", signature, secret), false);
  assert.equal(validSignature(body, "", secret), false);
  assert.equal(validSignature(body, "z".repeat(64), secret), false);
});
test("editor prevents duplicate and unrelated chapter identifiers", () => {
  const ids = [
    "00000000-0000-4000-8000-000000000001",
    "00000000-0000-4000-8000-000000000002",
    "00000000-0000-4000-8000-000000000003",
  ];
  const edit = {
    revision: 1,
    title: "A book",
    subtitle: "",
    author: "",
    cover_style: "sage",
    use_artwork: false,
    outline: ids.map((id) => ({ id, title: "Title", summary: "Summary" })),
    chapters: {},
  };
  assert.equal(editBookSchema.safeParse(edit).success, true);
  assert.equal(
    editBookSchema.safeParse({
      ...edit,
      outline: [edit.outline[0], edit.outline[0], edit.outline[2]],
    }).success,
    false,
  );
});
