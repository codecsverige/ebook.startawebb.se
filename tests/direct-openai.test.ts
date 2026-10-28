import { test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import {
  DirectOpenAiError, directFormat, directModelFor,
  economicalBackupModel, generateDirectStructured, generateDirectCover,
} from "../src/lib/direct-openai";

test("selects the appropriate model automatically, without Vercel model variables", () => {
  assert.equal(directModelFor("outline"), "gpt-6-luna");
  assert.equal(directModelFor("outline_recovery"), "gpt-6-luna");
  assert.equal(directModelFor("chapter"), "gpt-6.1-terra");
  assert.equal(directModelFor("chapter_recovery"), "gpt-6.1-terra");
});

test("strict JSON formats match outline and chapter contracts", () => {
  const outline = directFormat("outline");
  const chapter = directFormat("chapter");
  assert.deepEqual(outline.schema.required, ["allowed", "title", "subtitle", "chapters"]);
  assert.deepEqual(chapter.schema.required, ["content", "summary"]);
  assert.equal(outline.schema.additionalProperties, false);
  assert.equal(chapter.schema.additionalProperties, false);
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


test("cover uses the OpenAI Images API directly, not Gateway", async () => {
  const originalFetch = globalThis.fetch;
  const previousKey = process.env.OPENAI_API_KEY;
  try {
    process.env.OPENAI_API_KEY = "unit-test-key";
    globalThis.fetch = async (url, init) => {
      assert.equal(url, "https://api.openai.com/v1/images/generations");
      const body = JSON.parse(String(init?.body));
      assert.equal(body.model, "gpt-image-1-mini");
      assert.equal(body.size, "1024x1536");
      return new Response(JSON.stringify({
        data: [{ b64_json: Buffer.from("test image bytes").toString("base64") }],
      }), { status: 200 });
    };
    const result = await generateDirectCover("Original book cover prompt");
    assert.equal(result.image.mediaType, "image/png");
    assert.equal(Buffer.from(result.image.uint8Array).toString(), "test image bytes");
  } finally {
    globalThis.fetch = originalFetch;
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousKey;
  }
});


test("falls back automatically only when a stronger model is unavailable", async () => {
  const original = globalThis.fetch;
  const keyBefore = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "unit-test-key";
  let calls = 0;
  try {
    globalThis.fetch = async (_url, init) => {
      calls++;
      const body = JSON.parse(String(init?.body));
      if (calls === 1) {
        assert.equal(body.model, "gpt-6.1-terra");
        return new Response(JSON.stringify({
          error: { code: "model_not_found", message: "The model does not exist or is not available" },
        }), { status: 404 });
      }
      assert.equal(body.model, economicalBackupModel());
      return new Response(JSON.stringify({
        status: "completed",
        output: [{ type: "message", content: [{
          type: "output_text", text: JSON.stringify({
            content: "A complete story chapter.", summary: "Summary of the chapter.",
          }),
        }] }],
        usage: { input_tokens: 90, output_tokens: 55 },
      }), { status: 200 });
    };
    const result = await generateDirectStructured("chapter",
      z.object({ content: z.string(), summary: z.string() }),
      "You are an editor.", "Write a chapter", 6500);
    assert.equal(calls, 2);
    assert.equal(result.output.summary, "Summary of the chapter.");
  } finally {
    globalThis.fetch = original;
    if (keyBefore === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = keyBefore;
  }
});
