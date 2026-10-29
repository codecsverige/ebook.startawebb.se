import { test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import {
  DirectOpenAiError, directFormat, directModelFor,
  classifyOpenAiHttpFailure, generateDirectStructured, generateDirectCover,
} from "../src/lib/direct-openai";

test("uses the same proven economical model as BokaNära for planning and writing", () => {
  for (const operation of ["outline", "outline_recovery", "chapter", "chapter_recovery"]) {
    assert.equal(directModelFor(operation), "gpt-5-mini");
  }
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
      assert.equal(payload.reasoning, undefined);
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


test("keeps one paid attempt and preserves the exact reason of model refusal", async () => {
  const saved = globalThis.fetch;
  const previousKey = process.env.OPENAI_API_KEY;
  let calls = 0;
  process.env.OPENAI_API_KEY = "test-only";
  try {
    globalThis.fetch = async (_url, init) => {
      calls++;
      const request = JSON.parse(String(init?.body));
      assert.equal(request.model, "gpt-5-mini");
      return new Response(JSON.stringify({ error: { code: "model_not_found" } }), { status: 403 });
    };
    await assert.rejects(
      generateDirectStructured("outline", z.object({ allowed: z.boolean() }), "Editor", "An outline", 1000),
      (error: unknown) => error instanceof DirectOpenAiError && error.message === "ai_model_unavailable",
    );
    assert.equal(calls, 2); // Primary refused, one bounded existing-model fallback.
  } finally {
    globalThis.fetch = saved;
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousKey;
  }
});

test("separates invalid keys, restricted models and exhausted API quota", () => {
  assert.equal(classifyOpenAiHttpFailure(401, { error: { code: "invalid_api_key" } }), "ai_auth_failed");
  assert.equal(classifyOpenAiHttpFailure(403, { error: { code: "model_not_found" } }), "ai_model_unavailable");
  assert.equal(classifyOpenAiHttpFailure(429, { error: { code: "insufficient_quota" } }), "ai_credits_exhausted");
  assert.equal(classifyOpenAiHttpFailure(429, { error: { code: "rate_limit_exceeded" } }), "ai_provider_busy");
});

test("direct OpenAI recovers 403/404 model access with previously configured 4.1-mini", async () => {
  const savedFetch = globalThis.fetch;
  const previousKey = process.env.OPENAI_API_KEY;
  const models: string[] = [];
  process.env.OPENAI_API_KEY = "test-only";
  try {
    globalThis.fetch = async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      models.push(body.model);
      if (body.model === "gpt-5-mini")
        return new Response(JSON.stringify({ error: { code: "model_not_found" } }), { status: 404 });
      assert.equal(body.model, "gpt-4.1-mini");
      return new Response(JSON.stringify({
        status: "completed",
        output: [{ type: "message", content: [{
          type: "output_text", text: JSON.stringify({ content: "قصة عربية", summary: "ملخص" }),
        }] }],
      }), { status: 200 });
    };
    const result = await generateDirectStructured("chapter",
      z.object({ content: z.string(), summary: z.string() }), "Editor", "Arabic story", 500);
    assert.equal(result.output.content, "قصة عربية");
    assert.deepEqual(models, ["gpt-5-mini", "gpt-4.1-mini"]);
  } finally {
    globalThis.fetch = savedFetch;
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousKey;
  }
});

test("direct OpenAI never tries a different model for invalid credentials", async () => {
  const savedFetch = globalThis.fetch;
  const previousKey = process.env.OPENAI_API_KEY;
  let calls = 0;
  process.env.OPENAI_API_KEY = "test-only";
  try {
    globalThis.fetch = async () => {
      calls++;
      return new Response(JSON.stringify({ error: { code: "invalid_api_key" } }), { status: 401 });
    };
    await assert.rejects(
      generateDirectStructured("outline", z.object({ allowed: z.boolean() }),
        "Editor", "Outline", 500),
      /ai_auth_failed/,
    );
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = savedFetch;
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousKey;
  }
});
