import { NextResponse } from "next/server";
import { startChatgpt, safeLocale, chatgptClientId } from "@/lib/siwc";
import { appUrl } from "@/lib/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const locale = safeLocale(new URL(request.url).searchParams.get("locale"));
  if (!chatgptClientId())
    return NextResponse.redirect(new URL(`/${locale}/login?chatgpt=unavailable`, appUrl()));
  try {
    const destination = await startChatgpt(locale);
    const response = NextResponse.redirect(destination);
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("Referrer-Policy", "no-referrer");
    return response;
  } catch (error) {
    console.warn("siwc_start_failed", { kind: error instanceof Error ? error.name : "unknown" });
    return NextResponse.redirect(new URL(`/${locale}/login?chatgpt=failed`, appUrl()));
  }
}
