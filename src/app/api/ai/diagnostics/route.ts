import { NextResponse } from "next/server";
import { sessionUser } from "@/lib/firebase-session";
import { directModelCandidates } from "@/lib/direct-openai";
import { availableAiBackends } from "@/lib/ai-routing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Non-billable, owner-only diagnostic. Never returns provider credentials. */
export async function GET() {
  const user = await sessionUser();
  const owner = process.env.EBOOK_TEST_ACCOUNT_EMAIL?.trim().toLowerCase();
  if (!user || !owner || user.email.trim().toLowerCase() !== owner) {
    return NextResponse.json({ error: "unauthorized" }, { status: 403 });
  }
  // The book now prefers the already deployed, authenticated BokaNära relay.
  // Its public GET endpoint verifies service configuration without sending a
  // book, any credentials, or an API request to OpenAI.
  if (availableAiBackends("chapter").includes("relay")) {
    try {
      const probe = await fetch("https://bokanara.se/api/internal/ebook-studio-ai", {
        method: "GET", cache: "no-store", signal: AbortSignal.timeout(8_000),
      });
      const data = await probe.json() as { status?: unknown; service?: unknown };
      const configured = probe.ok && data.service === "ebook-ai-relay"
        && data.status === "configured";
      return NextResponse.json({
        status: configured ? "bokanara_relay_public_configured" : "bokanara_relay_public_unavailable",
        signedGenerationNotTested: true, gatewayDisabled: true,
        billingTestPerformed: false,
      }, { headers: { "Cache-Control": "no-store" } });
    } catch {
      return NextResponse.json({
        status: "bokanara_relay_public_unreachable",
        signedGenerationNotTested: true, gatewayDisabled: true,
        billingTestPerformed: false,
      }, { headers: { "Cache-Control": "no-store" } });
    }
  }
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) return NextResponse.json({ status: "key_missing" }, {
    status: 503, headers: { "Cache-Control": "no-store" },
  });
  try {
    // Read-only model catalog: no prompt, no image request, no billing.
    const response = await fetch("https://api.openai.com/v1/models", {
      method: "GET",
      headers: { Authorization: "Bearer " + key },
      signal: AbortSignal.timeout(12_000),
      cache: "no-store",
    });
    const headers = { "Cache-Control": "no-store" };
    if (!response.ok) {
      // Only return provider error *codes*, never raw error messages, API keys,
      // request bodies or manuscript content. This endpoint is owner-only.
      let providerCode = "unknown";
      let providerType = "unknown";
      try {
        const body = await response.json() as {
          error?: { code?: unknown; type?: unknown };
        };
        const code = body.error?.code;
        const type = body.error?.type;
        if (typeof code === "string" && /^[a-z0-9_]{1,90}$/i.test(code)) providerCode = code;
        if (typeof type === "string" && /^[a-z0-9_]{1,90}$/i.test(type)) providerType = type;
      } catch { /* Unexpected provider response; do not reveal it. */ }
      const status = response.status === 401 ? "invalid_api_key"
        : response.status === 403 ? "model_catalog_forbidden"
        : response.status === 429 ? "rate_limited" : "provider_error";
      return NextResponse.json({
        status,
        httpStatus: response.status,
        providerCode,
        providerType,
        keyLastFour: key.slice(-4),
        gatewayDisabled: true,
        billingTestPerformed: false,
      }, { status: 503, headers });
    }
    const result = await response.json() as { data?: Array<{ id?: unknown }> };
    const catalog = new Set((result.data || []).map(item => item.id)
      .filter((id): id is string => typeof id === "string"));
    const candidates = directModelCandidates("chapter");
    return NextResponse.json({
      status: "api_key_accepted_for_model_listing",
      listedCompatibleModels: candidates.filter(name => catalog.has(name)),
      preferredModel: candidates[0],
      keyLastFour: key.slice(-4),
      modelListingIsNotProofOfGenerationAccess: true,
      gatewayDisabled: true,
      billingTestPerformed: false,
    }, { headers });
  } catch {
    return NextResponse.json({ status: "provider_unreachable", billingTestPerformed: false },
      { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
