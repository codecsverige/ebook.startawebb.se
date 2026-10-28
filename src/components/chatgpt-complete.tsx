"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { signInWithCustomToken, signOut } from "firebase/auth";
import { browserAuth } from "@/lib/firebase-browser";
import type { Locale } from "@/lib/domain";
import { tr } from "@/lib/i18n";
import { request } from "@/lib/client";

export function ChatgptComplete({ locale }: { locale: Locale }) {
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    const complete = async () => {
      const auth = browserAuth();
      try {
        const result = await request<{ customToken: string }>("/api/auth/chatgpt/complete", {
          method: "POST",
          body: JSON.stringify({}),
        });
        const user = await signInWithCustomToken(auth, result.customToken);
        try {
          await request("/api/auth/session", {
            method: "POST",
            body: JSON.stringify({ idToken: await user.user.getIdToken() }),
          });
        } finally {
          await signOut(auth).catch(() => {});
        }
        if (active) window.location.replace(`/${locale}/studio?chatgpt=linked`);
      } catch {
        if (active) setError(true);
      }
    };
    void complete();
    return () => { active = false; };
  }, [locale]);
  return (
    <main className="container login-page" role="status">
      <div className="login-card">
        <h1>{error
          ? tr(locale, "Could not complete ChatGPT sign-in", "تعذر إكمال تسجيل الدخول عبر ChatGPT", "Kunde inte slutföra ChatGPT-inloggning")
          : tr(locale, "Connecting your ChatGPT account", "جارٍ ربط حساب ChatGPT", "Ansluter ditt ChatGPT-konto")}</h1>
        <p>{error
          ? tr(locale, "Try again or use Google or email. Your existing books are safe.", "حاول مرة أخرى أو ادخل عبر Google أو البريد. كتبك محفوظة.", "Försök igen eller använd Google eller e-post. Dina böcker finns kvar.")
          : tr(locale, "Your secure session is being created.", "يجري إنشاء جلسة دخول آمنة.", "En säker session skapas.")}</p>
        {error && <Link className="button button-primary" href={`/${locale}/login`}>{tr(locale, "Back to sign in", "العودة إلى تسجيل الدخول", "Tillbaka till inloggning")}</Link>}
      </div>
    </main>
  );
}
