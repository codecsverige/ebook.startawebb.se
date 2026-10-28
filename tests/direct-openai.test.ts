import { test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import {
  DirectOpenAiError, canUseGatewayFallback, directFormat, directModelFor,
  generateDirectStructured,
} from "../src/lib/direct-openai";

test("selects inexpensive outlines and stronger book chapters", () => {
  assert.equal(directModelFor("outline"), process.env.OPENAI_EBOOK_OUTLINE_MODEL?.trim() || "gpt-6-luna");
  assert.equal(directModelFor("outline_recovery"), process.env.OPENAI_EBOOK_OUTLINE_MODEL?.trim() || "gpt-6-luna");
  assert.equal(directModelFor("chapter"), process.env.OPENAI_EBOOK_CHAPTER_MODEL?.trim() || "gpt-6.1-terra");
  assert.equal(directModelFor("chapter_recovery"), process.env.OPENAI_EBOOK_CHAPTER_MODEL?.trim() || "gpt-6.1-terra");
});

test("strict JSON formats match outline and chapter contracts", () => {
  const outline = directFormat("outline");
  const chapter = directFormat("chapter");
  assert.deepEqual(outline.schema.required, ["allowed", "title", "subtitle", "chapters"]);
  assert.deepEqual(chapter.schema.required, ["content", "summary"]);
  assert.equal(outline.schema.additionalProperties, false);
  assert.equal(chapter.schema.additionalProperties, false);
});

test("only definitive upstream failures trigger backup provider", () => {
  assert.equal(canUseGatewayFallback(new DirectOpenAiError(429, "ai_provider_busy")), true);
  assert.equal(canUseGatewayFallback(new DirectOpenAiError(401, "ai_auth_failed")), true);
  assert.equal(canUseGatewayFallback(new DirectOpenAiError(422, "ai_generation_invalid")), false);
  assert.equal(canUseGatewayFallback(new Error("fetch failed")), false);
});

test("direct API parses and validates generated text without touching real API", async () => {
  const originalFetch = globalThis.fetch;
  const previousKey = process.env.OPENAI_API_KEY;
  let checkedRequest = false;
  try {
    process.env.OPENAI_API_KEY = "unit-test-key";
    globalThis.fetch = async (_input, init) => {
      const payload = JSON.parse(String(init?.body));
      assert.equal(payload.model, directModelFor("chapter"));
      assert.equal(payload.store, false);
      assert.equal(payload.reasoning.effort, "none");
      assert.equal(payload.text.format.type, "json_schema");
      checkedRequest = true;
      return new Response(JSON.stringify({
        status: "completed",
        output: [{ type: "message", content: [{
          type: "output_text", text: JSON.stringify({ content: "A full scene.", summary: "A short summary." }),
        }] }],
        usage: { input_tokens: 102, output_tokens: 58 },
      }), { status: 200 });
    };
    const result = await generateDirectStructured("chapter",
      z.object({ content: z.string(), summary: z.string() }), "editor", "write", 6500);
    assert.equal(checkedRequest, true);
    assert.equal(result.output.content, "A full scene.");
    assert.deepEqual(result.usage, { inputTokens: 102, outputTokens: 58 });
  } finally {
    globalThis.fetch = originalFetch;
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousKey;
  }
});
