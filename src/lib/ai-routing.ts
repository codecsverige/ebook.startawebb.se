import { classifyAiFailure } from "./ai-errors";

export type AiBackend = "gateway" | "direct";
type Configuration = Readonly<Record<string, string | undefined>>;

/**
 * Temporary direct-OpenAI-only test for Ebook Studio.
 * Ignore all configured Vercel AI Gateway models.
 * This applies to outlines, chapters, edits, covers and illustrations.
 */
export function availableAiBackends(
  _operation: string,
  env: Configuration = process.env,
): AiBackend[] {
  return env.OPENAI_API_KEY?.trim() ? ["direct"] : [];
}

const failoverErrors = new Set([
  "ai_auth_failed",
  "ai_credits_exhausted",
  "ai_model_unavailable",
  "ai_provider_busy",
  "ai_provider_unavailable",
  "ai_generation_invalid",
  "ai_generation_incomplete",
]);

const known = new Set([
  ...failoverErrors,
  "content_not_allowed",
  "ai_wrong_language",
  "not_configured",
  "invalid_input",
  "insufficient_credits",
  "rate_limit",
  "ai_daily_limit",
  "ai_book_limit",
  "ai_image_daily_limit",
]);

export function aiErrorCode(error: unknown): string {
  const code = error instanceof Error ? error.message : "";
  return known.has(code) ? code : classifyAiFailure(error);
}

export function mayUseAiBackup(error: unknown): boolean {
  return failoverErrors.has(aiErrorCode(error));
}

/**
 * One paid request on success; at most one other backend on provider failure.
 * Never spend another request on an account quota or unsafe-content refusal.
 */
export async function callWithAiFallback<T>(
  backends: readonly AiBackend[],
  invoke: (backend: AiBackend) => Promise<T>,
  onFallback?: (from: AiBackend, code: string) => void,
): Promise<T> {
  if (backends.length === 0) throw new Error("not_configured");
  for (let i = 0; i < backends.length; i++) {
    try {
      return await invoke(backends[i]);
    } catch (error) {
      if (i === backends.length - 1 || !mayUseAiBackup(error)) throw error;
      onFallback?.(backends[i], aiErrorCode(error));
    }
  }
  throw new Error("ai_provider_unavailable");
}
