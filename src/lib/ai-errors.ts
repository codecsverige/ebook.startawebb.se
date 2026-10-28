/** Distill provider errors to safe user-facing codes, without exposing payloads. */
export type AiFailureCode =
  | "ai_credits_exhausted"
  | "ai_auth_failed"
  | "ai_provider_busy"
  | "ai_generation_invalid"
  | "ai_provider_unavailable";

export function classifyAiFailure(error: unknown): AiFailureCode {
  const visited = new Set<unknown>();
  const nested: unknown[] = [error];
  const statuses: number[] = [];
  const messages: string[] = [];
  for (let i = 0; i < nested.length && i < 6; i++) {
    const item = nested[i];
    if (!item || typeof item !== "object" || visited.has(item)) continue;
    visited.add(item);
    const value = item as {
      statusCode?: unknown;
      status?: unknown;
      name?: unknown;
      message?: unknown;
      cause?: unknown;
      error?: unknown;
      response?: { status?: unknown; error?: unknown };
      data?: { error?: unknown };
    };
    for (const status of [value.statusCode, value.status, value.response?.status])
      if (typeof status === "number") statuses.push(status);
    if (typeof value.name === "string") messages.push(value.name.slice(0, 120));
    if (typeof value.message === "string") messages.push(value.message.slice(0, 2000));
    nested.push(value.cause, value.error, value.response?.error, value.data?.error);
  }
  const message = messages.join(" ").toLowerCase();
  if (statuses.includes(402) || /insufficient.funds|quota_for_entity_exceeded|payment required|billing.*(limit|exhaust)|budget.*(exhaust|exceed)|credit.*(exhaust|balance)|no funds/.test(message))
    return "ai_credits_exhausted";
  if (statuses.includes(401) || statuses.includes(403) ||
      /invalid (api )?key|unauthori[sz]ed|invalid.*token|authentication.*failed/.test(message))
    return "ai_auth_failed";
  if (statuses.includes(429) || statuses.some((s) => s >= 500) ||
      /rate.?limit|too many requests|timeout|timed out|abort|network|fetch failed|connection.*(lost|reset)/.test(message))
    return "ai_provider_busy";
  if (/noobjectgenerated|jsonparse|invalid.*(output|object|json)|schema validation|failed.*validation/.test(message))
    return "ai_generation_invalid";
  return "ai_provider_unavailable";
}
