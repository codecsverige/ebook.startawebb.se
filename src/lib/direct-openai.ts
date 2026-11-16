import { z } from "zod";

export class DirectOpenAiError extends Error {
  constructor(readonly statusCode: number, readonly code: string) {
    super(code);
    this.name = "DirectOpenAiError";
  }
}

export type OpenAiFailureCode =
  | "ai_auth_failed" | "ai_permission_denied" | "ai_credits_exhausted"
  | "ai_model_unavailable" | "ai_request_invalid" | "ai_provider_busy"
  | "ai_provider_unavailable";

/** Direct OpenAI text models only; no AI Gateway, including on model fallback. */
export function directModelFor(_operation: string): string {
  const selected = process.env.OPENAI_TEXT_MODEL?.trim();
  return selected && /^gpt-[a-z0-9._-]{2,80}$/i.test(selected)
    ? selected : "gpt-5-mini";
}

/** Image generation uses OpenAI Images API, not Vercel's image gateway. */
export function directImageModelFor(): string {
  const selected = process.env.OPENAI_IMAGE_MODEL?.trim();
  return selected && /^gpt-image-[a-z0-9._-]{1,80}$/i.test(selected)
    ? selected : "gpt-image-1-mini";
}

function providerError(body: unknown): { code: string; type: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) return {code:"",type:""};
  const error = (body as { error?: unknown }).error;
  if (!error || typeof error !== "object" || Array.isArray(error)) return {code:"",type:""};
  const raw = error as { code?: unknown; type?: unknown };
  const clean = (value: unknown) => typeof value === "string" &&
    /^[a-z][a-z0-9_]{0,79}$/i.test(value) ? value.toLowerCase() : "";
  return { code: clean(raw.code), type: clean(raw.type) };
}

const modelDenial = /^(model_not_found|model_not_available|model_unavailable|model_access_denied|model_not_enabled)$/;
function isModelSpecificDenial(status: number, body: unknown): boolean {
  return [400, 403, 404].includes(status) && modelDenial.test(providerError(body).code);
}

/** Map actual provider response codes before generic HTTP statuses. */
export function classifyOpenAiHttpFailure(status: number, body?: unknown): OpenAiFailureCode {
  const {code,type} = providerError(body);
  const combined = code + " " + type;
  if (status === 401 || code === "invalid_api_key") return "ai_auth_failed";
  if (status === 402 || /insufficient_quota|credit_balance_exhausted|organization_usage_limit_exceeded|organization_spend_limit_exceeded|project_spend_limit_exceeded|billing_hard_limit|billing_not_active|credits_exhausted|budget_exceeded/.test(combined))
    return "ai_credits_exhausted";
  if (modelDenial.test(code)) return "ai_model_unavailable";
  if (status === 403 || /permission_denied|insufficient_permissions|verification_required|organization_verification_required|unsupported_country_region_territory/.test(combined))
    return "ai_permission_denied";
  if (status === 400 || status === 422) return "ai_request_invalid";
  if (status === 429 || status >= 500) return "ai_provider_busy";
  return "ai_provider_unavailable";
}

/** Log only provider-defined short codes and request IDs, never credentials or texts. */
function logRejection(response: Response, model: string, body: unknown, retry: boolean) {
  const error = providerError(body);
  const requestId = response.headers.get("x-request-id");
  console.warn("direct_openai_rejected", {
    model,
    httpStatus: response.status,
    providerCode: error.code || "unknown",
    providerType: error.type || "unknown",
    requestId: requestId && /^[a-z0-9_-]{1,80}$/i.test(requestId) ? requestId : undefined,
    nextModel: retry,
  });
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
  const primaryModel = directModelFor(operation);
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
  // Retry at most once, and ONLY if OpenAI specifically names a denied model.
  // Never retry on a generic 403, invalid API parameters, quota or authentication.
  let model = primaryModel;
  let response = await request(model);
  if (!response.ok) {
    let refusal: unknown;
    try { refusal = await response.json(); } catch { /* provider body omitted */ }
    const backup = "gpt-4.1-mini";
    const retry = model !== backup && isModelSpecificDenial(response.status, refusal);
    logRejection(response, model, refusal, retry);
    if (!retry) {
      throw new DirectOpenAiError(response.status, classifyOpenAiHttpFailure(response.status, refusal));
    }
    model = backup;
    response = await request(model);
    if (!response.ok) {
      let retryError: unknown;
      try { retryError = await response.json(); } catch { /* provider body omitted */ }
      logRejection(response, model, retryError, false);
      throw new DirectOpenAiError(response.status, classifyOpenAiHttpFailure(response.status, retryError));
    }
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
export async function generateDirectCover(
  prompt: string, model = directImageModelFor(),
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
    logRejection(response, model, errorBody, false);
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
