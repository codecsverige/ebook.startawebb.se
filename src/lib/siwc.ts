import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { adminAuth, studioDb } from "@/lib/firebase-admin";
import { sessionUser } from "@/lib/firebase-session";
import { STUDIO_PATH } from "@/lib/firebase-config";
import { appUrl } from "@/lib/config";
import type { Locale } from "@/lib/domain";

const issuer = "https://auth.openai.com";
const authorizationEndpoint = issuer + "/api/accounts/authorize";
const tokenEndpoint = issuer + "/api/accounts/oauth/token";
const jwksUrl = new URL(issuer + "/.well-known/jwks.json");
const jwks = createRemoteJWKSet(jwksUrl);
const stateCookie = process.env.NODE_ENV === "production"
  ? "__Host-ebook_siwc_state" : "ebook_siwc_state";
const ticketCookie = process.env.NODE_ENV === "production"
  ? "__Host-ebook_siwc_ticket" : "ebook_siwc_ticket";
const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
};

type Transaction = {
  state: string;
  codeVerifier: string;
  nonce: string;
  mode: "login" | "link";
  uid: string | null;
  locale: Locale;
  expiresAt: number;
};
type LinkedIdentity = { uid: string; subject: string; clientId: string; issuer: string };

function digest(value: string) {
  return createHash("sha256").update(value).digest("hex");
}
function randomValue(bytes = 32) {
  return randomBytes(bytes).toString("base64url");
}
export function chatgptClientId(): string | null {
  const id = process.env.OPENAI_SIWC_CLIENT_ID?.trim() || "";
  return /^oaiapp_[A-Za-z0-9_\-]{8,}$/.test(id) ? id : null;
}
export const chatgptCallbackUrl = () =>
  new URL("/api/auth/chatgpt/callback", process.env.APP_URL || appUrl()).toString();

function transactions() {
  return studioDb().collection(STUDIO_PATH + "/siwcTransactions");
}
function identities() {
  return studioDb().collection(STUDIO_PATH + "/siwcIdentities");
}
function connections() {
  return studioDb().collection(STUDIO_PATH + "/siwcUserConnections");
}
function tickets() {
  return studioDb().collection(STUDIO_PATH + "/siwcTickets");
}
function identityKey(clientId: string, subject: string) {
  return digest(issuer + ":" + clientId + ":" + subject);
}
export async function chatgptLinked(uid: string): Promise<boolean> {
  const snapshot = await connections().doc(uid).get();
  return snapshot.exists;
}
export function safeLocale(input: string | null): Locale {
  return input === "sv" || input === "ar" ? input : "en";
}
export async function startChatgpt(
  locale: Locale,
): Promise<string> {
  const clientId = chatgptClientId();
  if (!clientId) throw new Error("not_configured");
  const existing = await sessionUser();
  const state = randomValue();
  const codeVerifier = randomValue(64);
  const nonce = randomValue();
  const transaction: Transaction = {
    state, codeVerifier, nonce,
    mode: existing ? "link" : "login",
    uid: existing?.id || null,
    locale,
    expiresAt: Date.now() + 10 * 60_000,
  };
  await transactions().doc(digest(state)).create(transaction);
  (await cookies()).set(stateCookie, state, { ...cookieOptions, maxAge: 600 });
  const url = new URL(authorizationEndpoint);
  url.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: chatgptCallbackUrl(),
    response_type: "code",
    scope: "openid profile email",
    state,
    code_challenge: createHash("sha256").update(codeVerifier).digest("base64url"),
    code_challenge_method: "S256",
    nonce,
  }).toString();
  return url.toString();
}
export async function consumeChatgptTransaction(
  state: string | null,
): Promise<Transaction> {
  const cookieStore = await cookies();
  const expected = cookieStore.get(stateCookie)?.value;
  cookieStore.delete(stateCookie);
  if (!state || !expected || state !== expected || state.length > 256)
    throw new Error("invalid_state");
  const ref = transactions().doc(digest(state));
  return studioDb().runTransaction(async (tx) => {
    const snapshot = await tx.get(ref);
    const data = snapshot.data() as Transaction | undefined;
    if (!data || data.state !== state || data.expiresAt < Date.now())
      throw new Error("invalid_state");
    tx.delete(ref); // Atomic one-time use across serverless instances.
    return data;
  });
}
export async function verifyChatgptCode(code: string, transaction: Transaction) {
  const clientId = chatgptClientId();
  if (!clientId) throw new Error("not_configured");
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: clientId,
    code,
    code_verifier: transaction.codeVerifier,
    redirect_uri: chatgptCallbackUrl(),
  });
  const headers: Record<string, string> = {
    accept: "application/json",
    "content-type": "application/x-www-form-urlencoded",
  };
  const authMethod = process.env.OPENAI_SIWC_AUTH_METHOD || "none";
  if (authMethod === "client_secret_basic") {
    const secret = process.env.OPENAI_SIWC_CLIENT_SECRET;
    if (!secret) throw new Error("missing_client_secret");
    const encode = (s: string) =>
      new URLSearchParams({ value: s }).toString().slice(6);
    headers.authorization = "Basic " +
      Buffer.from(encode(clientId) + ":" + encode(secret)).toString("base64");
  } else if (authMethod !== "none") {
    throw new Error("unsupported_auth_method");
  }
  const response = await fetch(tokenEndpoint, {
    method: "POST", headers, body, cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    console.warn("siwc_token_exchange_failed", { status: response.status });
    throw new Error("oauth_exchange_failed");
  }
  const tokens = await response.json() as { id_token?: unknown };
  if (typeof tokens.id_token !== "string") throw new Error("missing_id_token");
  const { payload } = await jwtVerify(tokens.id_token, jwks, {
    issuer, audience: clientId, requiredClaims: ["sub", "exp", "iat"],
    clockTolerance: 5,
  });
  if (!payload.sub || payload.nonce !== transaction.nonce)
    throw new Error("invalid_identity");
  if (typeof payload.email !== "string" || !payload.email.includes("@") ||
      payload.email_verified !== true)
    throw new Error("unverified_email");
  return {
    clientId,
    subject: payload.sub,
    email: payload.email,
    name: typeof payload.name === "string" ? payload.name : "",
  };
}
export async function resolveChatgptAccount(
  transaction: Transaction,
  identity: { clientId: string; subject: string; email: string; name: string },
): Promise<{ uid: string; linked: boolean }> {
  const identityRef = identities().doc(identityKey(identity.clientId, identity.subject));
  if (transaction.mode === "link") {
    const current = await sessionUser();
    if (!current || current.id !== transaction.uid)
      throw new Error("session_changed");
    await studioDb().runTransaction(async (tx) => {
      const connectionRef = connections().doc(current.id);
      const [existing, linked] = await Promise.all([
        tx.get(identityRef), tx.get(connectionRef),
      ]);
      if (existing.exists && existing.get("uid") !== current.id)
        throw new Error("identity_already_linked");
      if (linked.exists && linked.get("subject") !== identity.subject)
        throw new Error("different_account_linked");
      const record: LinkedIdentity = {
        uid: current.id, issuer, clientId: identity.clientId,
        subject: identity.subject,
      };
      tx.set(identityRef, record);
      tx.set(connectionRef, {
        ...record, email: identity.email, connectedAt: new Date().toISOString(),
      });
    });
    return { uid: current.id, linked: true };
  }
  const existing = await identityRef.get();
  if (existing.exists) {
    const uid = existing.get("uid") as string;
    const user = await adminAuth().getUser(uid);
    if (!user.emailVerified || !user.email) throw new Error("invalid_local_account");
    return { uid, linked: false };
  }
  try {
    const userWithEmail = await adminAuth().getUserByEmail(identity.email);
    if (userWithEmail) throw new Error("link_existing_account_first");
  } catch (error) {
    if ((error as { code?: string })?.code !== "auth/user-not-found")
      throw error;
  }
  const uid = "siwc_" + digest(identity.clientId + ":" + identity.subject).slice(0, 48);
  try {
    await adminAuth().createUser({
      uid, email: identity.email, emailVerified: true,
      ...(identity.name ? { displayName: identity.name.slice(0, 100) } : {}),
    });
  } catch (error) {
    if ((error as { code?: string })?.code !== "auth/uid-already-exists")
      throw error;
    const user = await adminAuth().getUser(uid);
    if (user.email?.toLowerCase() !== identity.email.toLowerCase())
      throw new Error("invalid_local_account");
  }
  await studioDb().runTransaction(async (tx) => {
    const connectionRef = connections().doc(uid);
    const snapshot = await tx.get(identityRef);
    if (snapshot.exists && snapshot.get("uid") !== uid)
      throw new Error("identity_already_linked");
    const record: LinkedIdentity = {
      uid, issuer, clientId: identity.clientId, subject: identity.subject,
    };
    tx.set(identityRef, record);
    tx.set(connectionRef, {
      ...record, email: identity.email, connectedAt: new Date().toISOString(),
    });
  });
  return { uid, linked: false };
}
export async function createChatgptSignInTicket(uid: string) {
  const value = randomValue();
  await tickets().doc(digest(value)).create({
    uid, expiresAt: Date.now() + 3 * 60_000,
  });
  (await cookies()).set(ticketCookie, value, { ...cookieOptions, maxAge: 180 });
}
export async function consumeChatgptSignInTicket(): Promise<string> {
  const store = await cookies();
  const cookie = store.get(ticketCookie)?.value;
  store.delete(ticketCookie);
  if (!cookie || cookie.length > 256) throw new Error("missing_ticket");
  return studioDb().runTransaction(async (tx) => {
    const ref = tickets().doc(digest(cookie));
    const snapshot = await tx.get(ref);
    const data = snapshot.data() as { uid: string; expiresAt: number } | undefined;
    if (!data || data.expiresAt < Date.now()) throw new Error("expired_ticket");
    tx.delete(ref);
    return data.uid;
  });
}
