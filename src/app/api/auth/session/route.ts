import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import { z } from "zod";
import { adminAuth, studioStore } from "@/lib/firebase-admin";
import { sessionName, sessionOptions } from "@/lib/firebase-session";
import { assertOrigin, readJson, json, apiError, AppError } from "@/lib/http";

export async function POST(request: Request) {
  try {
    assertOrigin(request);
    const { idToken } = await readJson(
      request,
      z.object({ idToken: z.string().min(20).max(12000) }),
      14000,
    );
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      "unknown";
    const store = studioStore();
    await store.takeRate(
      `session:${createHash("sha256").update(ip).digest("hex")}`,
      30,
    );
    let token;
    try {
      token = await adminAuth().verifyIdToken(idToken, true);
    } catch {
      throw new AppError("unauthorized", 401);
    }
    const age = Date.now() / 1000 - token.auth_time;
    if (age > 300 || age < -30 || !token.email_verified || !token.email)
      throw new AppError("unauthorized", 401);
    const expiresIn = 5 * 24 * 60 * 60 * 1000;
    const cookie = await adminAuth().createSessionCookie(idToken, {
      expiresIn,
    });
    await store.ensureProfile(token.uid);
    (await cookies()).set(sessionName, cookie, {
      ...sessionOptions,
      maxAge: expiresIn / 1000,
    });
    // Best-effort garbage collection in this application's namespace only.
    await store.cleanupRates().catch(() => {});
    return json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
