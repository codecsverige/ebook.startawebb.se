import { createHash } from "node:crypto";
import { z } from "zod";
import { assertOrigin, readJson, apiError, json, AppError } from "@/lib/http";
import { sessionClient } from "@/lib/supabase";
import { takeRate } from "@/lib/books";
import { appUrl, configuration } from "@/lib/config";

export async function POST(request: Request) {
  try {
    assertOrigin(request);
    if (!configuration().accounts) throw new AppError("not_configured", 503);
    const input = await readJson(
      request,
      z.object({
        email: z.string().trim().email().max(254),
        locale: z.enum(["en", "ar", "sv"]),
      }),
      2000,
    );
    const email = input.email.toLowerCase();
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      "unknown";
    const hash = (s: string) => createHash("sha256").update(s).digest("hex");
    await takeRate(`login-ip:${hash(ip)}`, 15);
    await takeRate(`login-email:${hash(email)}`, 4);
    const db = await sessionClient();
    const { error } = await db.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${appUrl()}/auth/callback?locale=${input.locale}`,
        shouldCreateUser: true,
      },
    });
    if (error) {
      console.warn("login_email_failed", { code: error.code });
      throw new AppError(
        error.status === 429 ? "rate_limit" : "service_error",
        error.status === 429 ? 429 : 503,
      );
    }
    return json({ sent: true });
  } catch (e) {
    return apiError(e);
  }
}
export async function DELETE(request: Request) {
  try {
    assertOrigin(request);
    const db = await sessionClient();
    await db.auth.signOut();
    return json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
