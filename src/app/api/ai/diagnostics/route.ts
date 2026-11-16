import { NextResponse } from "next/server";
import { sessionUser } from "@/lib/firebase-session";

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
    // Read-only model metadata, no generation and no token usage.
    const response = await fetch("https://api.openai.com/v1/models/gpt-5-mini", {
      method: "GET",
      headers: { Authorization: "Bearer " + key },
      signal: AbortSignal.timeout(12_000),
      cache: "no-store",
    });
    let status = "upstream_error";
    if (response.ok) status = "api_key_and_model_access_ok";
    else if (response.status === 401) status = "invalid_api_key";
    else if (response.status === 403 || response.status === 404) status = "model_access_denied";
    else if (response.status === 429) status = "rate_limited";
    return NextResponse.json({
      status,
      httpStatus: response.status,
      checkedModel: "gpt-5-mini",
      billingTestPerformed: false,
    }, { status: response.ok ? 200 : 503, headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ status: "provider_unreachable", billingTestPerformed: false },
      { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
