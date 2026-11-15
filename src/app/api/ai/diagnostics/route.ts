import { NextResponse } from "next/server";
import { sessionUser } from "@/lib/firebase-session";
import { directModelCandidates } from "@/lib/direct-openai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Non-billable, owner-only diagnostic. Never returns provider credentials. */
export async function GET() {
  const user = await sessionUser();
  const owner = process.env.EBOOK_TEST_ACCOUNT_EMAIL?.trim().toLowerCase();
  if (!user || !owner || user.email.trim().toLowerCase() !== owner) {
    return NextResponse.json({ error: "unauthorized" }, { status: 403 });
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
      const status = response.status === 401 ? "invalid_api_key"
        : response.status === 403 ? "model_catalog_forbidden"
        : response.status === 429 ? "rate_limited" : "provider_error";
      return NextResponse.json({
        status, httpStatus: response.status, billingTestPerformed: false,
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
      modelListingIsNotProofOfGenerationAccess: true,
      gatewayDisabled: true,
      billingTestPerformed: false,
    }, { headers });
  } catch {
    return NextResponse.json({ status: "provider_unreachable", billingTestPerformed: false },
      { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
