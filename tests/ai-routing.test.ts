import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { availableAiBackends, aiErrorCode } from "../src/lib/ai-routing";

test("only direct OpenAI is selected, regardless of legacy Gateway environment", () => {
  const gateway = {
    AI_GATEWAY_MODEL: "openai/gpt-5.4",
    AI_GATEWAY_CHAPTER_MODEL: "openai/gpt-5.4",
    AI_GATEWAY_IMAGE_MODEL: "openai/gpt-image-1-mini",
  };
  for (const kind of ["outline", "chapter", "chapter_recovery", "text_edit",
    "cover", "back_cover", "illustration"]) {
    assert.deepEqual(availableAiBackends(kind, { ...gateway, OPENAI_API_KEY: "test-key" }), ["direct"]);
    assert.deepEqual(availableAiBackends(kind, gateway), []);
    assert.deepEqual(availableAiBackends(kind, {}), []);
  }
  assert.deepEqual(availableAiBackends("outline", { OPENAI_API_KEY: "  " }), []);
});

test("existing generation code cannot invoke AI Gateway for text or artwork", () => {
  const steps = readFileSync("src/workflows/steps.ts", "utf8");
  const route = readFileSync("src/lib/ai-routing.ts", "utf8");
  const config = readFileSync("src/lib/config.ts", "utf8");
  assert.doesNotMatch(steps, /generateText\(|generateImage\(|providerOptions\s*:\s*\{\s*gateway/);
  assert.doesNotMatch(steps, /AI_GATEWAY_|resolveAiTextModels|callWithAiFallback/);
  assert.doesNotMatch(route, /AI_GATEWAY_|"gateway"/);
  assert.doesNotMatch(config, /AI_GATEWAY_/);
  assert.match(steps, /generateDirectStructured\(/);
  assert.match(steps, /generateDirectCover\(/);
});

test("known provider failures retain only safe public codes", () => {
  assert.equal(aiErrorCode(new Error("ai_model_unavailable")), "ai_model_unavailable");
  assert.equal(aiErrorCode(new Error("ai_permission_denied")), "ai_permission_denied");
  assert.equal(aiErrorCode(new Error("ai_request_invalid")), "ai_request_invalid");
  assert.equal(aiErrorCode(new Error("not_configured")), "not_configured");
  assert.notEqual(aiErrorCode(new Error("sk-proj-secret-key")), "sk-proj-secret-key");
});
