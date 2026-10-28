import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveAiTextModels } from "../src/lib/ai-models";

test("existing installations keep their selected model without extra requests", () => {
  const vars = { AI_GATEWAY_MODEL: "openai/gpt-4.1-mini" };
  assert.deepEqual(resolveAiTextModels("outline", vars), {
    model: "openai/gpt-4.1-mini",
    fallbackModels: [],
  });
  assert.deepEqual(resolveAiTextModels("chapter", vars), {
    model: "openai/gpt-4.1-mini",
    fallbackModels: [],
  });
});

test("paid chapters use a stronger model and fall back to the existing economical model", () => {
  const vars = {
    AI_GATEWAY_MODEL: "openai/gpt-4.1-mini",
    AI_GATEWAY_CHAPTER_MODEL: "openai/gpt-4.1",
  };
  assert.deepEqual(resolveAiTextModels("outline", vars), {
    model: "openai/gpt-4.1-mini",
    fallbackModels: [],
  });
  for (const operation of ["chapter", "chapter_recovery"]) {
    assert.deepEqual(resolveAiTextModels(operation, vars), {
      model: "openai/gpt-4.1",
      fallbackModels: ["openai/gpt-4.1-mini"],
    });
  }
});

test("an optional configured backup works for outlines and never duplicates the primary", () => {
  assert.deepEqual(resolveAiTextModels("outline", {
    AI_GATEWAY_MODEL: "openai/gpt-4.1",
    AI_GATEWAY_FALLBACK_MODEL: "openai/gpt-4.1-mini",
  }), {
    model: "openai/gpt-4.1",
    fallbackModels: ["openai/gpt-4.1-mini"],
  });
  assert.deepEqual(resolveAiTextModels("chapter", {
    AI_GATEWAY_MODEL: "openai/gpt-4.1-mini",
    AI_GATEWAY_CHAPTER_MODEL: "openai/gpt-4.1",
    AI_GATEWAY_FALLBACK_MODEL: "openai/gpt-4.1",
  }), {
    model: "openai/gpt-4.1",
    fallbackModels: [],
  });
});
