"use client";
import { useState } from "react";
import { ArrowUpRight, Mail, CheckCircle2, Loader2 } from "lucide-react";
import { copy, errorMessage, tr } from "@/lib/i18n";
import type { Locale } from "@/lib/domain";
import { request, codeOf } from "@/lib/client";

export function LoginForm({
  locale,
  enabled,
  expired,
}: {
  locale: Locale;
  enabled: boolean;
  expired: boolean;
}) {
  const t = copy[locale];
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError("");
    try {
      await request("/api/auth", {
        method: "POST",
        body: JSON.stringify({ email, locale }),
      });
      setSent(true);
    } catch (e) {
      setError(codeOf(e));
    } finally {
      setPending(false);
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
    <form className="stack" onSubmit={submit}>
      {expired && (
        <p className="notice">
          {tr(
            locale,
            "This sign-in link has expired or was opened in a different browser. Request a new link.",
            "انتهت صلاحية الرابط أو فُتح في متصفّح آخر. اطلب رابطًا جديدًا.",
            "Länken har gått ut eller öppnats i en annan webbläsare. Begär en ny länk.",
          )}
        </p>
      )}
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
          disabled={pending}
        />
      </label>
      {error && (
        <p className="error-message" role="alert">
          {errorMessage(error, locale)}
        </p>
      )}
      <button className="button button-primary" disabled={pending}>
        {pending ? <Loader2 size={18} className="spin" /> : <Mail size={18} />}{" "}
        {t.sendLink}
        <ArrowUpRight size={18} />
      </button>
    </form>
  );
}
