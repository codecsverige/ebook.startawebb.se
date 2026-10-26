"use client";
import { useState } from "react";
import { ArrowUpRight, Mail, CheckCircle2, Loader2 } from "lucide-react";
import {
  GoogleAuthProvider,
  sendSignInLinkToEmail,
  signInWithPopup,
  signOut,
} from "firebase/auth";
import {
  browserAuth,
  authErrorCode,
  emailStorageKey,
} from "@/lib/firebase-browser";
import { copy, errorMessage, tr } from "@/lib/i18n";
import type { Locale } from "@/lib/domain";
import { request } from "@/lib/client";

export function LoginForm({
  locale,
  enabled,
}: {
  locale: Locale;
  enabled: boolean;
}) {
  const t = copy[locale];
  const [email, setEmail] = useState(""),
    [pending, setPending] = useState(""),
    [sent, setSent] = useState(false),
    [error, setError] = useState("");
  async function google() {
    setPending("google");
    setError("");
    try {
      // Open synchronously from the click. Awaiting a network preflight first
      // makes mobile browsers block the authentication popup.
      const auth = browserAuth();
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      auth.languageCode = locale;
      const result = await signInWithPopup(auth, provider);
      try {
        await request("/api/auth/session", {
          method: "POST",
          body: JSON.stringify({ idToken: await result.user.getIdToken() }),
        });
      } finally {
        await signOut(auth);
      }
      window.location.assign(`/${locale}/studio`);
    } catch (e) {
      const code = authErrorCode(e);
      if (code !== "cancelled") setError(code);
      setPending("");
    }
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending("email");
    setError("");
    try {
      await request("/api/auth", {
        method: "POST",
        body: JSON.stringify({ email }),
      });
      const auth = browserAuth();
      auth.languageCode = locale;
      await sendSignInLinkToEmail(auth, email, {
        url: `${window.location.origin}/auth/callback?locale=${locale}`,
        handleCodeInApp: true,
      });
      try {
        window.localStorage.setItem(emailStorageKey, email);
      } catch {
        /* Can re-enter it on the callback page. */
      }
      setSent(true);
    } catch (e) {
      setError(authErrorCode(e));
    } finally {
      setPending("");
    }
  }
  if (!enabled)
    return (
      <div className="notice">
        <h2>{t.setupTitle}</h2>
        <p>{t.setupBody}</p>
      </div>
    );
  if (sent)
    return (
      <div className="login-sent" role="status">
        <CheckCircle2 size={34} />
        <h2>{t.checkEmail}</h2>
        <p>{t.checkEmailBody}</p>
        <strong dir="ltr">{email}</strong>
        <button
          className="button button-outline"
          onClick={() => setSent(false)}
        >
          {t.retry}
        </button>
      </div>
    );
  return (
    <div className="stack">
      <button
        type="button"
        className="button button-outline"
        disabled={!!pending}
        onClick={google}
      >
        {pending === "google" ? (
          <Loader2 size={18} className="spin" />
        ) : (
          <span aria-hidden="true">G</span>
        )}
        {tr(
          locale,
          "Continue with Google",
          "المتابعة بحساب Google",
          "Fortsätt med Google",
        )}
      </button>
      <p className="muted">
        {tr(
          locale,
          "Or receive a sign-in link by email",
          "أو احصل على رابط دخول بالبريد",
          "Eller få en inloggningslänk via e-post",
        )}
      </p>
      <form className="stack" onSubmit={submit}>
        <label>
          {t.email}
          <input
            type="email"
            dir="ltr"
            autoComplete="email"
            required
            maxLength={254}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            disabled={!!pending}
          />
        </label>
        {error && (
          <p className="error-message" role="alert">
            {errorMessage(error, locale)}
          </p>
        )}
        <button className="button button-primary" disabled={!!pending}>
          {pending === "email" ? (
            <Loader2 size={18} className="spin" />
          ) : (
            <Mail size={18} />
          )}{" "}
          {t.sendLink}
          <ArrowUpRight size={18} />
        </button>
      </form>
    </div>
  );
}
