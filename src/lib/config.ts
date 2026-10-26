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
      process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY
    ),
    ai: !!(
      process.env.AI_GATEWAY_MODEL &&
      (process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN)
    ),
    artwork: !!process.env.AI_GATEWAY_IMAGE_MODEL,
    billing: !!(
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
