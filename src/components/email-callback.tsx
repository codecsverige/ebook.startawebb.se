"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  isSignInWithEmailLink,
  signInWithEmailLink,
  signOut,
} from "firebase/auth";
import { Loader2 } from "lucide-react";
import {
  browserAuth,
  authErrorCode,
  emailStorageKey,
} from "@/lib/firebase-browser";
import { copy, errorMessage, tr } from "@/lib/i18n";
import type { Locale } from "@/lib/domain";
import { request } from "@/lib/client";

export function EmailCallback({ locale }: { locale: Locale }) {
  const [email, setEmail] = useState(""),
    [pending, setPending] = useState(true),
    [error, setError] = useState("");
  const started = useRef(false),
    t = copy[locale];
  async function complete(value: string) {
    setPending(true);
    setError("");
    let auth: ReturnType<typeof browserAuth> | undefined;
    try {
      auth = browserAuth();
      if (!isSignInWithEmailLink(auth, window.location.href))
        throw new Error("invalid_login_link");
      const result = await signInWithEmailLink(
        auth,
        value,
        window.location.href,
      );
      await request("/api/auth/session", {
        method: "POST",
        body: JSON.stringify({ idToken: await result.user.getIdToken() }),
      });
      try {
        window.localStorage.removeItem(emailStorageKey);
      } catch {}
      window.location.replace(`/${locale}/studio`);
    } catch (e) {
      setError(authErrorCode(e));
      setPending(false);
    } finally {
      if (auth) await signOut(auth).catch(() => {});
    }
  }
  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = locale === "ar" ? "rtl" : "ltr";
    if (started.current) return;
    started.current = true;
    let value = "";
    try {
      value = window.localStorage.getItem(emailStorageKey) || "";
    } catch {}
    if (value) {
      setEmail(value);
      void complete(value);
    } else setPending(false);
  }, []); // Consume an email action code only once, including React strict mode.
  return (
    <div className="login-card stack">
      <h1>{t.loginTitle}</h1>
      {pending ? (
        <div role="status">
          <Loader2 className="spin" />
          <p>{t.loading}</p>
        </div>
      ) : (
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            void complete(email);
          }}
        >
          <p>
            {tr(
              locale,
              "Confirm the email address that received your sign-in link.",
              "أدخل البريد الذي استلمت عليه رابط الدخول.",
              "Bekräfta e-postadressen som fick din inloggningslänk.",
            )}
          </p>
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
            />
          </label>
          {error && (
            <p className="error-message" role="alert">
              {errorMessage(error, locale)}
            </p>
          )}
          <button className="button button-primary">
            {tr(locale, "Sign in", "تسجيل الدخول", "Logga in")}
          </button>
          <Link href={`/${locale}/login`}>{t.retry}</Link>
        </form>
      )}
    </div>
  );
}
