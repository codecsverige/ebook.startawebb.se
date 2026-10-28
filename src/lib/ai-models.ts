/**
 * Keep planning economical while allowing a stronger paid model to write chapters.
 * An unset chapter model preserves the existing production behavior.
 * Fallback selection is handled within one AI Gateway request.
 */
export function resolveAiTextModels(
  operation: string,
  env: Readonly<Record<string, string | undefined>> = process.env,
): { model: string; fallbackModels: string[] } {
  const standard = env.AI_GATEWAY_MODEL?.trim() || "";
  const premium = env.AI_GATEWAY_CHAPTER_MODEL?.trim() || "";
  const chapter = operation === "chapter" || operation === "chapter_recovery";
  const model = chapter && premium ? premium : standard;
  const configuredFallback = env.AI_GATEWAY_FALLBACK_MODEL?.trim() || "";
  const fallback = configuredFallback || (chapter && premium ? standard : "");
  return {
    model,
    fallbackModels: fallback && fallback !== model ? [fallback] : [],
  };
}
