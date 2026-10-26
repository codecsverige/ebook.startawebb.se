import { NextResponse } from "next/server";
import { sessionClient } from "@/lib/supabase";
import { appUrl } from "@/lib/config";
import { isLocale } from "@/lib/domain";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const raw = url.searchParams.get("locale") || "en";
  const locale = isLocale(raw) ? raw : "en";
  const code = url.searchParams.get("code");
  if (code) {
    try {
      const db = await sessionClient();
      const { error } = await db.auth.exchangeCodeForSession(code);
      if (!error) return NextResponse.redirect(`${appUrl()}/${locale}/studio`);
    } catch {
      /* Redirect to a retryable sign-in screen. */
    }
  }
  return NextResponse.redirect(`${appUrl()}/${locale}/login?error=expired`);
}
