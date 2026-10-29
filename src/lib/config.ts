import "server-only";

export function appUrl(): string {
  const raw =
    process.env.APP_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL}`
      : "http://localhost:3000");
  return new URL(raw).origin;
}
export function configuration() {
  return {
    accounts: !!(
      process.env.EBOOK_FIREBASE_SERVICE_ACCOUNT_JSON ||
      process.env.FIREBASE_SERVICE_ACCOUNT_HYRNARA ||
      (process.env.EBOOK_FIREBASE_CLIENT_EMAIL &&
        process.env.EBOOK_FIREBASE_PRIVATE_KEY)
    ),
    // Use the existing Vercel AI Gateway first; the direct OpenAI project
    // remains a completely separate fallback if the Gateway request fails.
    ai: !!(process.env.AI_GATEWAY_MODEL?.trim() ||
      process.env.OPENAI_API_KEY?.trim()),
    artwork: !!(process.env.AI_GATEWAY_IMAGE_MODEL?.trim() ||
      process.env.OPENAI_API_KEY?.trim()),
    chatgpt: /^oaiapp_[A-Za-z0-9_-]{8,}$/.test(process.env.OPENAI_SIWC_CLIENT_ID || ""),
    // Payments stay disabled until the owner explicitly enables them.
    billing: process.env.EBOOK_PAYMENTS_ENABLED === "true" && !!(
      process.env.LEMON_SQUEEZY_API_KEY &&
      process.env.LEMON_SQUEEZY_STORE_ID &&
      process.env.LEMON_SQUEEZY_VARIANT_ONE &&
      process.env.LEMON_SQUEEZY_VARIANT_THREE &&
      process.env.LEMON_SQUEEZY_WEBHOOK_SECRET &&
      process.env.SUPPORT_EMAIL &&
      process.env.OPERATOR_NAME
    ),
  };
}
