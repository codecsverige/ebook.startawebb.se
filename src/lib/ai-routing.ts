import { classifyAiFailure } from "./ai-errors";

type Configuration = Readonly<Record<string, string | undefined>>;

/**
 * EbookStudio runs AI exclusively through its server-side OpenAI API key.
 * Never inspect or call Vercel AI Gateway, even if legacy env vars are present.
 */
export function availableAiBackends(
  _operation: string,
  env: Configuration = process.env,
): Array<"direct"> {
  return env.OPENAI_API_KEY?.trim() ? ["direct"] : [];
}

const known = new Set([
  "ai_auth_failed",
  "ai_permission_denied",
  "ai_credits_exhausted",
  "ai_model_unavailable",
  "ai_request_invalid",
  "ai_provider_busy",
  "ai_provider_unavailable",
  "ai_generation_invalid",
  "ai_generation_incomplete",
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

/** Return an approved public error code, never an upstream response or secret. */
export function aiErrorCode(error: unknown): string {
  const code = error instanceof Error ? error.message : "";
  return known.has(code) ? code : classifyAiFailure(error);
}
