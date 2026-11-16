import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash, createVerify, generateKeyPairSync } from "node:crypto";
import { z } from "zod";
import {
  generateRelayStructured, generateRelayCover, signedRelayProof,
  relayCredentialsConfigured,
} from "../src/lib/bokanara-relay";
import { DirectOpenAiError } from "../src/lib/direct-openai";

const pair = generateKeyPairSync("rsa", { modulusLength: 2048 });
const account = "ebook@hyrnara.iam.gserviceaccount.com";
const privateKey = pair.privateKey.export({ format: "pem", type: "pkcs8" }).toString();
const publicKey = pair.publicKey.export({ format: "pem", type: "spki" }).toString();

function withRelay<T>(handler: (url: string, request: RequestInit) => Promise<Response>,
  action: () => Promise<T>): Promise<T> {
  const originalFetch = globalThis.fetch;
  const originalEmail = process.env.EBOOK_FIREBASE_CLIENT_EMAIL;
  const originalPrivateKey = process.env.EBOOK_FIREBASE_PRIVATE_KEY;
  const originalJson = process.env.EBOOK_FIREBASE_SERVICE_ACCOUNT_JSON;
  const originalHyr = process.env.FIREBASE_SERVICE_ACCOUNT_HYRNARA;
  const originalModel = process.env.OPENAI_TEXT_MODEL;
  process.env.EBOOK_FIREBASE_CLIENT_EMAIL = account;
  process.env.EBOOK_FIREBASE_PRIVATE_KEY = privateKey;
  delete process.env.EBOOK_FIREBASE_SERVICE_ACCOUNT_JSON;
  delete process.env.FIREBASE_SERVICE_ACCOUNT_HYRNARA;
  delete process.env.OPENAI_TEXT_MODEL;
  globalThis.fetch = (input, init) => handler(String(input), init || {});
  return action().finally(() => {
    globalThis.fetch = originalFetch;
    for (const [key, value] of [
      ["EBOOK_FIREBASE_CLIENT_EMAIL", originalEmail],
      ["EBOOK_FIREBASE_PRIVATE_KEY", originalPrivateKey],
      ["EBOOK_FIREBASE_SERVICE_ACCOUNT_JSON", originalJson],
      ["FIREBASE_SERVICE_ACCOUNT_HYRNARA", originalHyr],
      ["OPENAI_TEXT_MODEL", originalModel],
    ] as Array<[string, string | undefined]>) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
}

test("signed BokaNära proof has intended audience, 60-second expiry, exact body hash and valid RSA", () => {
  const body = JSON.stringify({ kind: "text", params: { model: "gpt-5-mini" } });
  const token = signedRelayProof(body, account, privateKey, 1_800_000_000);
  const [h, p, signature] = token.split(".");
  const header = JSON.parse(Buffer.from(h, "base64url").toString());
  const claims = JSON.parse(Buffer.from(p, "base64url").toString());
  assert.equal(header.alg, "RS256");
  assert.equal(claims.iss, account);
  assert.equal(claims.sub, account);
  assert.equal(claims.aud, "bokanara:ebook-studio-openai");
  assert.equal(claims.exp - claims.iat, 60);
  assert.equal(claims.purpose, "ebook-generation");
  assert.equal(claims.hash, createHash("sha256").update(body).digest("hex"));
  assert.equal(createVerify("RSA-SHA256").update(h + "." + p).end()
    .verify(publicKey, Buffer.from(signature, "base64url")), true);
});

test("relay uses a private signed server request and validates generated chapters", async () => {
  await withRelay(async (url, options) => {
    assert.equal(url, "https://bokanara.se/api/internal/ebook-studio-ai");
    assert.equal(options.method, "POST");
    const body = JSON.parse(String(options.body));
    assert.equal(body.kind, "text");
    assert.equal(body.params.model, "gpt-5-mini");
    assert.equal(body.params.store, false);
    assert.equal(body.params.text.format.name, "ebook_chapter");
    const bearer = String((options.headers as Record<string,string>).Authorization);
    assert.match(bearer, /^Bearer eyJ/);
    const signature = bearer.slice(7).split(".");
    assert.equal(createVerify("RSA-SHA256").update(signature.slice(0,2).join(".")).end()
      .verify(publicKey, Buffer.from(signature[2], "base64url")), true);
    return new Response(JSON.stringify({
      status: "completed", output: [{ type: "message", content: [
        { type: "output_text", text: JSON.stringify({ content: "A full chapter", summary: "Summary" }) },
      ] }], usage: { input_tokens: 40, output_tokens: 33 },
    }), { status: 200 });
  }, async () => {
    const response = await generateRelayStructured("chapter",
      z.object({ content: z.string(), summary: z.string() }), "Writer", "Write book", 6500);
    assert.equal(response.output.content, "A full chapter");
    assert.equal(response.usage.inputTokens, 40);
  });
});

test("BokaNära chapter JSON contract safely adapts editor replacements", async () => {
  await withRelay(async (_url, options) => {
    const body = JSON.parse(String(options.body));
    assert.equal(body.params.text.format.name, "ebook_chapter");
    assert.match(body.params.input[0].content, /rewritten selection/);
    return new Response(JSON.stringify({
      status: "completed", output: [{ type: "message", content: [
        { type: "output_text", text: JSON.stringify({ content: "Replacement", summary: "Short" }) },
      ] }],
    }), { status: 200 });
  }, async () => {
    const result = await generateRelayStructured("text_edit",
      z.object({ replacement: z.string() }), "Editor", "Rewrite", 500);
    assert.equal(result.output.replacement, "Replacement");
  });
});

test("BokaNära relay handles covers without exposing its OpenAI key", async () => {
  await withRelay(async (_url, options) => {
    const body = JSON.parse(String(options.body));
    assert.equal(body.kind, "image");
    assert.equal(body.params.size, "1024x1536");
    assert.equal(body.params.model, "gpt-image-1-mini");
    return new Response(JSON.stringify({
      data: [{ b64_json: Buffer.from("image-bytes").toString("base64") }],
    }), { status: 200 });
  }, async () => {
    const result = await generateRelayCover("Original book cover concept");
    assert.equal(Buffer.from(result.image.uint8Array).toString(), "image-bytes");
  });
});

test("Relay rejects unauthorized calls without falling back to another credential", async () => {
  await withRelay(async () => new Response(JSON.stringify({ error: { code: "unauthorized" } }), { status: 403 }),
    async () => {
      await assert.rejects(
        generateRelayStructured("chapter", z.object({ content: z.string() }), "Writer", "Write", 1200),
        (e: unknown) => e instanceof DirectOpenAiError && e.code === "ai_permission_denied",
      );
    });
});

test("Relay availability requires a private signer and is explicitly disableable", () => {
  assert.equal(relayCredentialsConfigured({}), false);
  assert.equal(relayCredentialsConfigured({ EBOOK_FIREBASE_SERVICE_ACCOUNT_JSON: "{test}" }), true);
  assert.equal(relayCredentialsConfigured({
    EBOOK_FIREBASE_SERVICE_ACCOUNT_JSON: "{test}",
    EBOOK_BOKANARA_RELAY_DISABLED: "true",
  }), false);
});
