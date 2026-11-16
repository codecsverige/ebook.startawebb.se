import { createHash, createSign } from "node:crypto";
import { z } from "zod";
import { DirectOpenAiError, directFormat, directModelFor } from "./direct-openai";

/**
 * Existing, deployed BokaNära endpoint. It verifies a short-lived RSA proof
 * against HyrNära's public Google service-account certificate, and uses its
 * own server-side OpenAI credential. No OpenAI key crosses between projects.
 * This is NOT Vercel AI Gateway.
 */
const RELAY_URL = "https://bokanara.se/api/internal/ebook-studio-ai";
const AUDIENCE = "bokanara:ebook-studio-openai";

type Settings = Readonly<Record<string, string | undefined>>;
type RelayKind = "text" | "image";

export function relayCredentialsConfigured(env: Settings = process.env): boolean {
  return env.EBOOK_BOKANARA_RELAY_DISABLED !== "true" && Boolean(
    env.EBOOK_FIREBASE_SERVICE_ACCOUNT_JSON?.trim() ||
    env.FIREBASE_SERVICE_ACCOUNT_HYRNARA?.trim() ||
    (env.EBOOK_FIREBASE_CLIENT_EMAIL?.trim() && env.EBOOK_FIREBASE_PRIVATE_KEY?.trim()),
  );
}

function serviceAccount(env: Settings = process.env): { email: string; key: string } {
  let email = env.EBOOK_FIREBASE_CLIENT_EMAIL?.trim();
  let key = env.EBOOK_FIREBASE_PRIVATE_KEY;
  const raw = env.EBOOK_FIREBASE_SERVICE_ACCOUNT_JSON ||
    env.FIREBASE_SERVICE_ACCOUNT_HYRNARA;
  if (raw) {
    try {
      const account = JSON.parse(raw) as {
        project_id?: unknown; client_email?: unknown; private_key?: unknown;
      };
      if (account.project_id !== "hyrnara" ||
          typeof account.client_email !== "string" ||
          typeof account.private_key !== "string")
        throw new Error("invalid_service_account");
      email = account.client_email;
      key = account.private_key;
    } catch {
      throw new DirectOpenAiError(503, "ai_provider_unavailable");
    }
  }
  if (!email || !key || !/^[a-z0-9._-]+@hyrnara\.iam\.gserviceaccount\.com$/i.test(email))
    throw new DirectOpenAiError(503, "ai_provider_unavailable");
  return { email, key: key.replace(/\\n/g, "\n") };
}

export function signedRelayProof(raw: string, email: string, privateKey: string, at = Math.floor(Date.now() / 1000)): string {
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const claims = {
    iss: email, sub: email, aud: AUDIENCE,
    iat: at, exp: at + 60, purpose: "ebook-generation",
    hash: createHash("sha256").update(raw).digest("hex"),
  };
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  const data = header + "." + payload;
  const signature = createSign("RSA-SHA256").update(data).end().sign(privateKey).toString("base64url");
  return data + "." + signature;
}

async function relayRequest(kind: RelayKind, params: Record<string, unknown>): Promise<unknown> {
  const { email, key } = serviceAccount();
  const raw = JSON.stringify({ kind, params });
  if (Buffer.byteLength(raw, "utf8") > 45_000)
    throw new DirectOpenAiError(413, "ai_generation_invalid");
  let response: Response;
  try {
    response = await fetch(RELAY_URL, {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + signedRelayProof(raw, email, key),
        "Content-Type": "application/json",
      },
      body: raw,
      cache: "no-store",
      signal: AbortSignal.timeout(120_000),
    });
  } catch {
    throw new DirectOpenAiError(503, "ai_provider_unavailable");
  }
  if (!response.ok) {
    // Never forward raw provider responses. Preserve actionable error classes.
    const code = response.status === 400 || response.status === 413 ? "ai_generation_invalid"
      : response.status === 401 || response.status === 403 ? "ai_permission_denied"
      : response.status === 429 ? "ai_daily_limit"
      : "ai_provider_unavailable";
    console.warn("ebook_relay_rejected", { status: response.status, kind });
    throw new DirectOpenAiError(response.status, code);
  }
  try { return await response.json(); }
  catch { throw new DirectOpenAiError(502, "ai_generation_invalid"); }
}

export async function generateRelayStructured<T>(
  operation: string, schema: z.ZodType<T>, system: string,
  prompt: string, maxOutputTokens: number,
): Promise<{ output: T; usage: { inputTokens: number; outputTokens: number } }> {
  if (!/^(outline|outline_recovery|chapter|chapter_recovery)$/.test(operation) ||
      prompt.length > 28_000 || system.length > 2500 ||
      !Number.isInteger(maxOutputTokens) || maxOutputTokens > 8500)
    throw new DirectOpenAiError(400, "ai_generation_invalid");
  const data = await relayRequest("text", {
    model: directModelFor(operation),
    store: false, instructions: system,
    input: [{ role: "user", content: prompt }],
    text: { format: directFormat(operation) },
    max_output_tokens: maxOutputTokens,
  }) as {
    status?: string;
    incomplete_details?: { reason?: string };
    output?: Array<{ type?: string; content?: Array<{ type?: string; text?: string }> }>;
    usage?: { input_tokens?: number; output_tokens?: number };
  };
  if (data.status === "incomplete" || data.incomplete_details?.reason === "max_output_tokens")
    throw new DirectOpenAiError(502, "ai_generation_incomplete");
  const content = (data.output || []).flatMap(item => item.type === "message" ? (item.content || []) : []);
  if (content.some(item => item.type === "refusal"))
    throw new DirectOpenAiError(403, "content_not_allowed");
  const text = content.filter(item => item.type === "output_text" && typeof item.text === "string")
    .map(item => item.text).join("\n");
  let parsed: unknown;
  try { parsed = JSON.parse(text); }
  catch { throw new DirectOpenAiError(502, "ai_generation_invalid"); }
  const checked = schema.safeParse(parsed);
  if (!checked.success) throw new DirectOpenAiError(502, "ai_generation_invalid");
  return { output: checked.data, usage: {
    inputTokens: data.usage?.input_tokens ?? 0,
    outputTokens: data.usage?.output_tokens ?? 0,
  }};
}

export async function generateRelayCover(
  prompt: string,
): Promise<{ image: { uint8Array: Uint8Array; mediaType: string }; usage: { inputTokens: number; outputTokens: number } }> {
  if (prompt.length < 10 || prompt.length > 5000)
    throw new DirectOpenAiError(400, "ai_generation_invalid");
  const result = await relayRequest("image", {
    model: "gpt-image-1-mini", prompt, n: 1,
    size: "1024x1536", quality: "medium", output_format: "png",
  }) as {
    data?: Array<{ b64_json?: string }>;
    usage?: { input_tokens?: number; output_tokens?: number };
  };
  const base64 = result.data?.[0]?.b64_json;
  if (!base64 || typeof base64 !== "string")
    throw new DirectOpenAiError(502, "ai_generation_invalid");
  const bytes = Buffer.from(base64, "base64");
  if (!bytes.length || bytes.length > 8_000_000)
    throw new DirectOpenAiError(502, "ai_generation_invalid");
  return { image: { uint8Array: bytes, mediaType: "image/png" }, usage: {
    inputTokens: result.usage?.input_tokens ?? 0,
    outputTokens: result.usage?.output_tokens ?? 0,
  }};
}
