import { test } from "node:test";
import assert from "node:assert/strict";
import {
  availableAiBackends, aiErrorCode, callWithAiFallback,
  mayUseAiBackup,
} from "../src/lib/ai-routing";

test("Gateway is primary and the pre-existing OpenAI key is an independent fallback", () => {
  assert.deepEqual(availableAiBackends("outline", {
    AI_GATEWAY_MODEL: "openai/gpt-5.4",
    OPENAI_API_KEY: "test-only",
  }), ["gateway", "direct"]);
  assert.deepEqual(availableAiBackends("chapter", {
    AI_GATEWAY_MODEL: "openai/gpt-5.4",
    OPENAI_API_KEY: "test-only",
  }), ["gateway", "direct"]);
  assert.deepEqual(availableAiBackends("cover", {
    AI_GATEWAY_IMAGE_MODEL: "openai/gpt-image-1-mini",
    OPENAI_API_KEY: "test-only",
  }), ["gateway", "direct"]);
  assert.deepEqual(availableAiBackends("outline", {
    AI_GATEWAY_MODEL: "openai/gpt-5.4",
  }), ["gateway"]);
  assert.deepEqual(availableAiBackends("outline", {
    OPENAI_API_KEY: "test-only",
  }), ["direct"]);
  assert.deepEqual(availableAiBackends("outline", {}), []);
});

test("successful Gateway generation never calls or bills the direct API", async () => {
  const calls: string[] = [];
  const result = await callWithAiFallback(["gateway", "direct"], async (backend) => {
    calls.push(backend);
    return "Arabic outline";
  });
  assert.equal(result, "Arabic outline");
  assert.deepEqual(calls, ["gateway"]);
});

test("403 or 404 model access failures switch exactly once to direct OpenAI", async () => {
  for (const status of [403, 404]) {
    const calls: string[] = [];
    const notices: string[] = [];
    const result = await callWithAiFallback(["gateway", "direct"], async (backend) => {
      calls.push(backend);
      if (backend === "gateway") {
        throw { statusCode: status, message: "Model not available" };
      }
      return "Written Arabic chapter";
    }, (backend, code) => notices.push(backend + ":" + code));
    assert.equal(result, "Written Arabic chapter");
    assert.deepEqual(calls, ["gateway", "direct"]);
    assert.equal(notices.length, 1);
  }
});

test("one provider failure and a second provider failure stop without looping", async () => {
  const calls: string[] = [];
  await assert.rejects(
    callWithAiFallback(["gateway", "direct"], async (backend) => {
      calls.push(backend);
      throw new Error("ai_model_unavailable");
    }),
    /ai_model_unavailable/,
  );
  assert.deepEqual(calls, ["gateway", "direct"]);
});

test("never retry or spend against account quota, policy, or input errors", async () => {
  for (const code of [
    "ai_daily_limit", "ai_book_limit", "ai_image_daily_limit",
    "rate_limit", "content_not_allowed", "invalid_input",
  ]) {
    const calls: string[] = [];
    await assert.rejects(
      callWithAiFallback(["gateway", "direct"], async (backend) => {
        calls.push(backend);
        throw new Error(code);
      }),
      new RegExp(code),
    );
    assert.deepEqual(calls, ["gateway"]);
    assert.equal(mayUseAiBackup(new Error(code)), false);
  }
});

test("the model refusal shown to the user is classified as recoverable", () => {
  assert.equal(aiErrorCode(new Error("ai_model_unavailable")), "ai_model_unavailable");
  assert.equal(mayUseAiBackup(new Error("ai_model_unavailable")), true);
  assert.equal(mayUseAiBackup(new Error("ai_credits_exhausted")), true);
});
