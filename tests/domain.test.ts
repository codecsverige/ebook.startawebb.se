import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import {
  briefSchema,
  editBookSchema,
  filename,
  wordCount,
  usableGeneratedChapter,
  coverStyles,
  recommendedCoverStyles,
  isArabicBrief,
  matchesBookLanguage,
  coverStyles,
  recommendedCoverStyles,
  isArabicBrief,
  matchesBookLanguage,
} from "../src/lib/domain";
import { escapeHtml, markdownHtml } from "../src/lib/export-text";
import { validSignature } from "../src/lib/webhook";
import { matchesPackCatalog } from "../src/lib/commerce";

test("a short chapter is not accepted as a complete generated draft", () => {
  assert.equal(
    usableGeneratedChapter("This is only a short introduction."),
    false,
  );
  assert.equal(usableGeneratedChapter("useful ".repeat(349)), false);
  assert.equal(usableGeneratedChapter("كلمة ".repeat(350)), true);
});

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

test("genre-aware covers provide 18 valid templates and sensible defaults", () => {
  assert.equal(coverStyles.length, 18);
  assert.equal(new Set(coverStyles).size, coverStyles.length);
  for (const kind of ["novel", "short_story", "children_story", "workbook", "guide", "ebook"] as const) {
    const suggested = recommendedCoverStyles(kind);
    assert.equal(suggested.length, 5);
    assert.ok(suggested.every((style) => coverStyles.includes(style)));
  }
  assert.equal(recommendedCoverStyles("novel")[0], "noir");
  assert.equal(recommendedCoverStyles("children_story")[0], "sky");
});

test("Arabic text detection and generated language safeguards", () => {
  const arabic = "مغامرة زهراء والكنز المفقود تدور أحداثها في قرية عربية جميلة وسط الغابات والوديان.";
  const english = "Zahra explores a distant magical kingdom and finds a hidden map.";
  assert.equal(isArabicBrief(arabic), true);
  assert.equal(isArabicBrief(english), false);
  assert.equal(matchesBookLanguage(arabic, "ar"), true);
  assert.equal(matchesBookLanguage(english, "ar"), false);
  assert.equal(matchesBookLanguage(arabic, "en"), false);
  assert.equal(matchesBookLanguage(english, "en"), true);
});

test("every genre has valid suggested cover templates without duplicate palette names", () => {
  assert.equal(coverStyles.length, 18);
  assert.equal(new Set(coverStyles).size, coverStyles.length);
  for (const kind of ["guide", "ebook", "workbook", "novel", "short_story", "children_story"] as const) {
    const suggested = recommendedCoverStyles(kind);
    assert.ok(suggested.length >= 4);
    assert.equal(new Set(suggested).size, suggested.length);
    assert.ok(suggested.every((name) => coverStyles.includes(name)));
  }
});

test("Arabic content detection prevents English books from Arabic briefs", () => {
  assert.equal(isArabicBrief("أريد كتابا عربيا عن الحياة والأمل ومغامرات الطفل في الغابة"), true);
  assert.equal(isArabicBrief("A professional guide for creating websites and building an audience"), false);
  assert.equal(matchesBookLanguage("هذا نص عربي واضح ومتصل يكتب باللغة العربية دون ترجمة إلى لغة مختلفة", "ar"), true);
  assert.equal(matchesBookLanguage("This text is written in English and should not be saved as Arabic content.", "ar"), false);
  assert.equal(matchesBookLanguage("This is a clear English-language manuscript with useful examples.", "en"), true);
});
