import { z } from "zod";

export class DirectOpenAiError extends Error {
  constructor(readonly statusCode: number, readonly code: string) {
    super(code);
    this.name = "DirectOpenAiError";
  }
}

/** Direct OpenAI only. A project-specific model can be configured server-side.
 * Fallback models are tried ONLY on a provider-confirmed model access denial.
 * Never use AI Gateway or another provider.
 */
export function directModelFor(_operation: string): string {
  const configured = process.env.OPENAI_TEXT_MODEL?.trim();
  return configured && /^[a-z0-9][a-z0-9._-]{1,79}$/i.test(configured)
    ? configured
    : "gpt-5-mini";
}
export function directModelCandidates(operation: string): string[] {
  return [...new Set([directModelFor(operation), "gpt-4.1-mini", "gpt-4o-mini"])];
}

function providerErrorCode(body: unknown): string {
  if (!body || typeof body !== "object" || Array.isArray(body)) return "";
  const error = (body as { error?: unknown }).error;
  if (!error || typeof error !== "object" || Array.isArray(error)) return "";
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code.toLowerCase().slice(0, 80) : "";
}

function isModelSpecificDenial(status: number, body: unknown): boolean {
  if (status !== 403 && status !== 404) return false;
  return /^(model_not_found|model_not_available|model_unavailable|model_access_denied|model_not_enabled)$/.test(providerErrorCode(body));
}

/** Convert OpenAI HTTP errors to accurate, non-sensitive UI codes. */
export function classifyOpenAiHttpFailure(
  status: number,
  errorBody?: unknown,
): "ai_auth_failed" | "ai_credits_exhausted" | "ai_model_unavailable" |
   "ai_permission_denied" | "ai_provider_busy" | "ai_provider_unavailable" {
  const outer = errorBody && typeof errorBody === "object" && !Array.isArray(errorBody)
    ? errorBody as { error?: { code?: unknown; type?: unknown } } : {};
  const data = outer.error;
  const code = typeof data?.code === "string" ? data.code.toLowerCase() : "";
  const type = typeof data?.type === "string" ? data.type.toLowerCase() : "";
  if (status === 401 || code === "invalid_api_key") return "ai_auth_failed";
  if (status === 402 || /insufficient_quota|billing_hard_limit|billing_not_active|credits_exhausted|budget_exceeded/.test(code + " " + type))
    return "ai_credits_exhausted";
  if (status === 403 && /permission_denied|insufficient_permissions|verification_required|organization_verification_required/.test(code + " " + type))
    return "ai_permission_denied";
  if (status === 403 || status === 404 || /model_not_found|model_not_available|model_unavailable/.test(code + " " + type))
    return "ai_model_unavailable";
  if (status === 429 || status >= 500) return "ai_provider_busy";
  return "ai_provider_unavailable";
}

export function directFormat(operation: string) {
  const isChapter = operation.startsWith("chapter");
  const isEdit = operation === "text_edit";
  const item = {
    type: "object",
    properties: { title: { type: "string" }, summary: { type: "string" } },
    required: ["title", "summary"],
    additionalProperties: false,
  };
  const properties = isEdit ? { replacement: { type: "string" } } : isChapter
    ? { content: { type: "string" }, summary: { type: "string" } }
    : {
        allowed: { type: "boolean" },
        title: { type: "string" },
        subtitle: { type: "string" },
        chapters: { type: "array", items: item },
      };
  return {
    type: "json_schema",
    name: isEdit ? "ebook_text_edit" : isChapter ? "ebook_chapter" : "ebook_outline",
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
  const request = (model: string) => fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      store: false,
      instructions: system,
      input: [{ role: "user", content: prompt }],
      text: { format: directFormat(operation) },
      max_output_tokens: maxOutputTokens,
    }),
    signal: AbortSignal.timeout(120_000),
    cache: "no-store",
  });
  const candidates = directModelCandidates(operation);
  let response: Response | undefined;
  for (let i = 0; i < candidates.length; i++) {
    const model = candidates[i];
    response = await request(model);
    if (response.ok) break;
    let errorBody: unknown;
    try { errorBody = await response.json(); } catch { /* no response body */ }
    const code = providerErrorCode(errorBody);
    const canTryAnotherModel = i < candidates.length - 1 &&
      isModelSpecificDenial(response.status, errorBody);
    // Log only short provider error codes and HTTP status, never prompts or keys.
    console.warn("direct_openai_request_rejected", {
      model, status: response.status, providerCode: code || "unknown",
      tryingAnotherModel: canTryAnotherModel,
    });
    if (!canTryAnotherModel)
      throw new DirectOpenAiError(response.status, classifyOpenAiHttpFailure(response.status, errorBody));
  }
  if (!response || !response.ok) throw new DirectOpenAiError(503, "ai_provider_unavailable");
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
export async function generateDirectCover(
  prompt: string, model = "gpt-image-1-mini",
  size: "1024x1536" | "1536x1024" = "1024x1536",
): Promise<{
  image: { uint8Array: Uint8Array; mediaType: string };
  usage: { inputTokens: number; outputTokens: number };
}> {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) throw new DirectOpenAiError(401, "ai_auth_failed");
  const response = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" },
    body: JSON.stringify({
      model, prompt, n: 1, size,
      quality: "medium", output_format: "png",
    }),
    signal: AbortSignal.timeout(120_000),
    cache: "no-store",
  });
  if (!response.ok) {
    let errorBody: unknown;
    try { errorBody = await response.json(); } catch { /* no body */ }
    throw new DirectOpenAiError(response.status, classifyOpenAiHttpFailure(response.status, errorBody));
  }
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
