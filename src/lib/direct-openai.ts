import { z } from "zod";

export class DirectOpenAiError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
  ) {
    super(code);
    this.name = "DirectOpenAiError";
  }
}

/** Confirmed, cost-conscious default already used by BokaNära.
 * One provider request per generation. No model probing via paid requests.
 */
export function directModelFor(_operation: string): string {
  return "gpt-5-mini";
}

/** Convert OpenAI HTTP errors to accurate, non-sensitive UI codes. */
export function classifyOpenAiHttpFailure(
  status: number,
  errorBody?: unknown,
):
  | "ai_auth_failed"
  | "ai_credits_exhausted"
  | "ai_model_unavailable"
  | "ai_provider_busy"
  | "ai_provider_unavailable" {
  const outer =
    errorBody && typeof errorBody === "object" && !Array.isArray(errorBody)
      ? (errorBody as { error?: { code?: unknown; type?: unknown } })
      : {};
  const data = outer.error;
  const code = typeof data?.code === "string" ? data.code.toLowerCase() : "";
  const type = typeof data?.type === "string" ? data.type.toLowerCase() : "";
  if (status === 401 || code === "invalid_api_key") return "ai_auth_failed";
  if (
    status === 402 ||
    /insufficient_quota|billing_hard_limit|billing_not_active|credits_exhausted|budget_exceeded/.test(
      code + " " + type,
    )
  )
    return "ai_credits_exhausted";
  if (
    status === 403 ||
    status === 404 ||
    /model_not_found|model_not_available|model_unavailable|permission_denied|verification_required/.test(
      code + " " + type,
    )
  )
    return "ai_model_unavailable";
  if (status === 429 || status >= 500) return "ai_provider_busy";
  return "ai_provider_unavailable";
}

export function directFormat(operation: string) {
  const string = { type: "string" };
  const object = (properties: Record<string, unknown>) => ({
    type: "object",
    properties,
    required: Object.keys(properties),
    additionalProperties: false,
  });
  const extra =
    operation === "assist"
      ? object({ content: string, summary: string, note: string })
      : operation === "cover_ideas"
        ? object({
            concepts: {
              type: "array",
              items: object({
                title: string,
                description: string,
                prompt: string,
                layout: {
                  type: "string",
                  enum: ["editorial", "cinematic", "minimal", "frame", "split"],
                },
              }),
            },
            back_cover_text: string,
          })
        : operation === "review"
          ? object({
              overview: string,
              issues: {
                type: "array",
                items: object({
                  severity: { type: "string", enum: ["warning", "suggestion"] },
                  chapter_id: string,
                  title: string,
                  detail: string,
                }),
              },
              strengths: { type: "array", items: string },
            })
          : null;
  if (extra)
    return {
      type: "json_schema",
      name: "ebook_" + operation,
      strict: true,
      schema: extra,
    };
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
): Promise<{
  output: T;
  usage: { inputTokens: number; outputTokens: number };
  finishReason: string;
}> {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) throw new DirectOpenAiError(401, "ai_auth_failed");
  const primaryModel = directModelFor(operation);
  const request = (model: string) =>
    fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + key,
        "Content-Type": "application/json",
      },
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
  let response = await request(primaryModel);
  // API project model permissions differ from Gateway permissions.
  // 403/404 does not necessarily mean a bad API key. Retry once using the
  // ALREADY configured Gateway model (4.1-mini), never an untested new model.
  // Refused model requests cannot produce billable generations; a successful
  // primary attempt never triggers a second paid request.
  if (
    (response.status === 403 || response.status === 404) &&
    primaryModel !== "gpt-4.1-mini"
  ) {
    let refusal: unknown;
    try {
      refusal = await response.clone().json();
    } catch {
      /* no body */
    }
    if (
      classifyOpenAiHttpFailure(response.status, refusal) ===
      "ai_model_unavailable"
    ) {
      console.warn("direct_model_access_fallback", {
        from: primaryModel,
        to: "gpt-4.1-mini",
        status: response.status,
      });
      response = await request("gpt-4.1-mini");
    }
  }
  if (!response.ok) {
    let errorBody: unknown;
    try {
      errorBody = await response.json();
    } catch {
      /* no response body */
    }
    throw new DirectOpenAiError(
      response.status,
      classifyOpenAiHttpFailure(response.status, errorBody),
    );
  }
  const data = (await response.json()) as {
    status?: string;
    incomplete_details?: { reason?: string };
    output?: Array<{
      type?: string;
      content?: Array<{ type?: string; text?: string }>;
    }>;
    usage?: { input_tokens?: number; output_tokens?: number };
  };
  if (
    data.status === "incomplete" ||
    data.incomplete_details?.reason === "max_output_tokens"
  ) {
    throw new Error("ai_generation_incomplete");
  }
  const items = (data.output || []).flatMap((item) =>
    item.type === "message" ? item.content || [] : [],
  );
  if (items.some((item) => item.type === "refusal")) {
    throw new Error("content_not_allowed");
  }
  const text = items
    .filter(
      (item) => item.type === "output_text" && typeof item.text === "string",
    )
    .map((item) => item.text)
    .join("\n");
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
  prompt: string,
  model = "gpt-image-1-mini",
): Promise<{
  image: { uint8Array: Uint8Array; mediaType: string };
  usage: { inputTokens: number; outputTokens: number };
}> {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) throw new DirectOpenAiError(401, "ai_auth_failed");
  const response = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + key,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      prompt,
      n: 1,
      size: "1024x1536",
      quality: "medium",
      output_format: "png",
    }),
    signal: AbortSignal.timeout(120_000),
    cache: "no-store",
  });
  if (!response.ok) {
    let errorBody: unknown;
    try {
      errorBody = await response.json();
    } catch {
      /* no body */
    }
    throw new DirectOpenAiError(
      response.status,
      classifyOpenAiHttpFailure(response.status, errorBody),
    );
  }
  const result = (await response.json()) as {
    data?: Array<{ b64_json?: string }>;
    usage?: { input_tokens?: number; output_tokens?: number };
  };
  const base64 = result.data?.[0]?.b64_json;
  if (!base64 || typeof base64 !== "string")
    throw new Error("ai_generation_invalid");
  const bytes = Buffer.from(base64, "base64");
  if (!bytes.length || bytes.length > 8_000_000)
    throw new Error("ai_generation_invalid");
  return {
    image: { uint8Array: bytes, mediaType: "image/png" },
    usage: {
      inputTokens: result.usage?.input_tokens ?? 0,
      outputTokens: result.usage?.output_tokens ?? 0,
    },
  };
}
