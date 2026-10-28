import { NextResponse } from "next/server";
import { appUrl } from "@/lib/config";
import {
  consumeChatgptTransaction,
  verifyChatgptCode,
  resolveChatgptAccount,
  createChatgptSignInTicket,
} from "@/lib/siwc";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  try {
    const transaction = await consumeChatgptTransaction(url.searchParams.get("state"));
    if (url.searchParams.has("error"))
      return NextResponse.redirect(new URL(`/${transaction.locale}/login?chatgpt=cancelled`, appUrl()));
    const code = url.searchParams.get("code");
    if (!code || code.length > 4000) throw new Error("missing_code");
    const identity = await verifyChatgptCode(code, transaction);
    const account = await resolveChatgptAccount(transaction, identity);
    if (account.linked) {
      return NextResponse.redirect(new URL(`/${transaction.locale}/studio?chatgpt=linked`, appUrl()));
    }
    await createChatgptSignInTicket(account.uid);
    return NextResponse.redirect(new URL(`/${transaction.locale}/chatgpt/complete`, appUrl()));
  } catch (error) {
    const reason = error instanceof Error ? error.message : "unknown";
    // Never log provider tokens, subject identifiers, emails or authorization codes.
    console.warn("siwc_callback_failed", { reason: ["invalid_state", "link_existing_account_first", "unverified_email"].includes(reason) ? reason : "oauth_failure" });
    const code = reason === "link_existing_account_first" ? "link" : "failed";
    return NextResponse.redirect(new URL(`/ar/login?chatgpt=${code}`, appUrl()));
  }
}
