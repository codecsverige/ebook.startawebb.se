import { z } from "zod";
import { classifyAiFailure } from "./ai-errors";

export class DirectOpenAiError extends Error {
  constructor(readonly statusCode: number, readonly code: string) {
    super(code);
    this.name = "DirectOpenAiError";
  }
}

export function directModelFor(operation: string): string {
  return operation.startsWith("chapter")
    ? process.env.OPENAI_EBOOK_CHAPTER_MODEL?.trim() || "gpt-6.1-terra"
    : process.env.OPENAI_EBOOK_OUTLINE_MODEL?.trim() || "gpt-6-luna";
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
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + key,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: directModelFor(operation),
      store: false,
      instructions: system,
      input: [{ role: "user", content: prompt }],
      text: { format: directFormat(operation) },
      reasoning: { effort: "none" },
      max_output_tokens: maxOutputTokens,
    }),
    signal: AbortSignal.timeout(120_000),
    cache: "no-store",
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
