import { createHash } from "node:crypto";
import { z } from "zod";
import { assertOrigin, readJson, apiError, json, AppError } from "@/lib/http";
import { clearSession } from "@/lib/firebase-session";
import { takeRate } from "@/lib/books";
import { configuration } from "@/lib/config";

export async function POST(request: Request) {
  try {
    assertOrigin(request);
    if (!configuration().accounts) throw new AppError("not_configured", 503);
    const { email } = await readJson(
      request,
      z.object({ email: z.string().trim().email().max(254) }),
      2000,
    );
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      "unknown";
    const hash = (s: string) => createHash("sha256").update(s).digest("hex");
    await takeRate(`login-ip:${hash(ip)}`, 15);
    await takeRate(`login-email:${hash(email.toLowerCase())}`, 4);
    return json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
export async function DELETE(request: Request) {
  try {
    assertOrigin(request);
    await clearSession();
    return json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
