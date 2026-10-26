import "server-only";
import { cookies } from "next/headers";
import { adminAuth, studioStore } from "./firebase-admin";
import { AppError } from "./http";

export const sessionName =
  process.env.NODE_ENV === "production"
    ? "__Host-ebook_session"
    : "ebook_session";
export const sessionOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
};
export async function sessionUser() {
  const value = (await cookies()).get(sessionName)?.value;
  if (!value) return null;
  try {
    const token = await adminAuth().verifySessionCookie(value, true);
    if (!token.email_verified || !token.email) return null;
    const profile = await studioStore().profile(token.uid);
    if (!profile || profile.deleting) return null;
    return { id: token.uid, email: token.email, auth_time: token.auth_time };
  } catch (error) {
    if (String((error as { code?: string }).code || "").startsWith("auth/"))
      return null;
    throw error;
  }
}
export async function requireUser() {
  const user = await sessionUser();
  if (!user) throw new AppError("unauthorized", 401);
  return { user };
}
export async function clearSession() {
  (await cookies()).set(sessionName, "", { ...sessionOptions, maxAge: 0 });
}
