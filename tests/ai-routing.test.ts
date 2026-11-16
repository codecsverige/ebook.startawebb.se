import { test } from "node:test";
import assert from "node:assert/strict";
import { availableAiBackends, aiErrorCode, callWithAiFallback, mayUseAiBackup } from "../src/lib/ai-routing";

const signer = { EBOOK_FIREBASE_SERVICE_ACCOUNT_JSON: '{"project_id":"hyrnara"}' };

test("authenticated BokaNära relay is preferred for book work, even with Gateway variables", () => {
  for (const operation of [
    "outline", "outline_recovery", "chapter", "chapter_recovery",
    "text_edit", "cover", "back_cover",
  ]) {
    assert.deepEqual(availableAiBackends(operation, {
      ...signer, AI_GATEWAY_MODEL: "openai/gpt-6-luna",
      AI_GATEWAY_IMAGE_MODEL: "openai/gpt-image-1-mini",
      OPENAI_API_KEY: "different-direct-key",
    }), ["relay", "direct"]);
    assert.deepEqual(availableAiBackends(operation, signer), ["relay"]);
  }
});
test("landscape illustrations stay direct-only; Gateway is always disabled", () => {
  assert.deepEqual(availableAiBackends("illustration", {
    ...signer, OPENAI_API_KEY: "direct",
  }), ["direct"]);
  assert.deepEqual(availableAiBackends("outline", { AI_GATEWAY_MODEL: "gpt-5-mini" }), []);
  assert.deepEqual(availableAiBackends("chapter", {
    ...signer, EBOOK_BOKANARA_RELAY_DISABLED: "true", OPENAI_API_KEY: "direct",
  }), ["direct"]);
});
test("successful signed relay does not charge direct fallback", async () => {
  const seen: string[] = [];
  const output = await callWithAiFallback(["relay", "direct"], async backend => {
    seen.push(backend);
    return "Arabic book";
  });
  assert.equal(output, "Arabic book");
  assert.deepEqual(seen, ["relay"]);
});
test("transient relay outage tries direct only once", async () => {
  const calls: string[] = [];
  const result = await callWithAiFallback(["relay", "direct"], async backend => {
    calls.push(backend);
    if (backend === "relay") throw new Error("ai_provider_unavailable");
    return "chapter";
  });
  assert.equal(result, "chapter");
  assert.deepEqual(calls, ["relay", "direct"]);
});
test("two rejected providers stop without looping", async () => {
  const calls: string[] = [];
  await assert.rejects(callWithAiFallback(["relay", "direct"], async backend => {
    calls.push(backend);
    throw new Error("ai_model_unavailable");
  }), /ai_model_unavailable/);
  assert.deepEqual(calls, ["relay", "direct"]);
});
test("never retry quota, auth, policy, permissions or user limits", async () => {
  for (const code of [
    "ai_credits_exhausted", "ai_permission_denied", "ai_auth_failed",
    "ai_daily_limit", "ai_book_limit", "ai_image_daily_limit",
    "rate_limit", "content_not_allowed", "invalid_input",
  ]) {
    const calls: string[] = [];
    await assert.rejects(
      callWithAiFallback(["relay", "direct"], async backend => {
        calls.push(backend);
        throw new Error(code);
      }),
      new RegExp(code),
    );
    assert.deepEqual(calls, ["relay"], code);
    assert.equal(mayUseAiBackup(new Error(code)), false);
  }
  assert.equal(aiErrorCode(new Error("ai_model_unavailable")), "ai_model_unavailable");
  assert.equal(mayUseAiBackup(new Error("ai_model_unavailable")), true);
});
