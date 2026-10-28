import { z } from "zod";
import { classifyAiFailure } from "./ai-errors";

export class DirectOpenAiError extends Error {
  constructor(readonly statusCode: number, readonly code: string) {
    super(code);
    this.name = "DirectOpenAiError";
  }
}

/** Like BokaNära, model IDs are selected automatically in server code.
 * A strong, moderately priced writer handles chapters; a cheap model plans.
 */
export function directModelFor(operation: string): string {
  return operation.startsWith("chapter") ? "gpt-6.1-terra" : "gpt-6-luna";
}

/** Used only if OpenAI says the preferred model is unavailable to this API key. */
export function economicalBackupModel(): string {
  return "gpt-5.4-mini";
}

function modelAccessError(status: number, errorBody: unknown): boolean {
  if (status === 404) return true;
  if (status !== 400 && status !== 403) return false;
  if (!errorBody || typeof errorBody !== "object") return false;
  const details = (errorBody as { error?: { code?: unknown; message?: unknown } }).error;
  const code = typeof details?.code === "string" ? details.code.toLowerCase() : "";
  const message = typeof details?.message === "string" ? details.message.toLowerCase() : "";
  return /model_(not_found|unavailable|not_available)/.test(code) ||
    (/model/.test(message) &&
      /not found|not available|no access|don't have access|do not have access|does not exist|unsupported/.test(message));
}

async function requestTextWithAutomaticBackup(
  token: string,
  params: Record<string, unknown>,
): Promise<Response> {
  const send = (body: Record<string, unknown>) =>
    fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120_000),
      cache: "no-store",
    });
  const first = await send(params);
  if (![400, 403, 404].includes(first.status)) return first;
  let errorBody: unknown = null;
  try { errorBody = await first.clone().json(); } catch { /* keep original error */ }
  if (!modelAccessError(first.status, errorBody)) return first;
  console.warn("ebook_primary_model_unavailable_using_automatic_backup", {
    primary: params.model,
    backup: economicalBackupModel(),
    status: first.status,
  });
  return send({ ...params, model: economicalBackupModel(), reasoning: { effort: "none" } });
}

export function canUseGatewayFallback(error: unknown): boolean {
  return error instanceof DirectOpenAiError &&
    [401, 402, 403, 404, 429, 500, 502, 503, 504].includes(error.statusCode);
}

export function directFormat(operation: string) {
  const isChapter = operation.startsWith("chapter");
  const item = {
    type: "object",
    properties: { title: { type: "string" }, summary: { type: "string" } },
    required: ["title", "summary"],
    additionalProperties: false,
  };
  const properties = isChapter
    ? { content: { type: "string" }, summary: { type: "string" } }
    : {
        allowed: { type: "boolean" },
        title: { type: "string" },
        subtitle: { type: "string" },
        chapters: { type: "array", items: item },
      };
  return {
    type: "json_schema",
    name: isChapter ? "ebook_chapter" : "ebook_outline",
    strict: true,
    schema: {
      type: "object",
      properties,
      required: Object.keys(properties),
      additionalProperties: false,
    },
  };
}

export async function generateDirectStructured<T>(
  operation: string,
  schema: z.ZodType<T>,
  system: string,
  prompt: string,
  maxOutputTokens: number,
): Promise<{ output: T; usage: { inputTokens: number; outputTokens: number }; finishReason: string }> {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) throw new DirectOpenAiError(401, "ai_auth_failed");
  const response = await requestTextWithAutomaticBackup(key, {
    model: directModelFor(operation),
    store: false,
    instructions: system,
    input: [{ role: "user", content: prompt }],
    text: { format: directFormat(operation) },
    reasoning: { effort: "none" },
    max_output_tokens: maxOutputTokens,
  });
  if (!response.ok) {
    // Do not expose service error bodies, credentials or manuscript in logs.
    throw new DirectOpenAiError(response.status, classifyAiFailure({ status: response.status }));
  }
  const data = await response.json() as {
    status?: string;
    incomplete_details?: { reason?: string };
    output?: Array<{
      type?: string;
      content?: Array<{ type?: string; text?: string }>;
    }>;
    usage?: { input_tokens?: number; output_tokens?: number };
  };
  if (data.status === "incomplete" || data.incomplete_details?.reason === "max_output_tokens") {
    throw new Error("ai_generation_incomplete");
  }
  const items = (data.output || []).flatMap(item =>
    item.type === "message" ? (item.content || []) : [],
  );
  if (items.some(item => item.type === "refusal")) {
    throw new Error("content_not_allowed");
  }
  const text = items
    .filter(item => item.type === "output_text" && typeof item.text === "string")
    .map(item => item.text).join("\n");
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("ai_generation_invalid");
  }
  const checked = schema.safeParse(parsed);
  if (!checked.success) throw new Error("ai_generation_invalid");
  return {
    output: checked.data,
    usage: {
      inputTokens: data.usage?.input_tokens ?? 0,
      outputTokens: data.usage?.output_tokens ?? 0,
    },
    finishReason: "stop",
  };
}


/** Generates a cover from the same direct OpenAI API, never Vercel AI Gateway. */
export async function generateDirectCover(prompt: string, model = "gpt-image-1-mini"): Promise<{
  image: { uint8Array: Uint8Array; mediaType: string };
  usage: { inputTokens: number; outputTokens: number };
}> {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) throw new DirectOpenAiError(401, "ai_auth_failed");
  const response = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" },
    body: JSON.stringify({
      model, prompt, n: 1, size: "1024x1536",
      quality: "medium", output_format: "png",
    }),
    signal: AbortSignal.timeout(120_000),
    cache: "no-store",
  });
  if (!response.ok) throw new DirectOpenAiError(
    response.status,
    classifyAiFailure({ status: response.status }),
  );
  const result = await response.json() as {
    data?: Array<{ b64_json?: string }>;
    usage?: { input_tokens?: number; output_tokens?: number };
  };
  const base64 = result.data?.[0]?.b64_json;
  if (!base64 || typeof base64 !== "string") throw new Error("ai_generation_invalid");
  const bytes = Buffer.from(base64, "base64");
  if (!bytes.length || bytes.length > 8_000_000) throw new Error("ai_generation_invalid");
  return {
    image: { uint8Array: bytes, mediaType: "image/png" },
    usage: {
      inputTokens: result.usage?.input_tokens ?? 0,
      outputTokens: result.usage?.output_tokens ?? 0,
    },
  };
}
