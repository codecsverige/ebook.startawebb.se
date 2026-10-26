"use client";
import { useState } from "react";
import Link from "next/link";
import { Check, Loader2, ArrowUpRight } from "lucide-react";
import type { Locale } from "@/lib/domain";
import { copy, errorMessage } from "@/lib/i18n";
import { request, codeOf } from "@/lib/client";
export function CreditPacks({
  locale,
  enabled,
}: {
  locale: Locale;
  enabled: boolean;
}) {
  const t = copy[locale];
  const [consent, setConsent] = useState(false);
  const [pending, setPending] = useState("");
  const [error, setError] = useState("");
  async function buy(pack: string) {
    setPending(pack);
    setError("");
    try {
      const data = await request<{ url: string }>("/api/billing/checkout", {
        method: "POST",
        body: JSON.stringify({ pack, locale, consent }),
      });
      window.location.assign(data.url);
    } catch (e) {
      setError(codeOf(e));
      setPending("");
    }
  }
  return (
    <div className="stack">
      {!enabled && <div className="notice">{t.coming}</div>}
      <div className="credit-pack-grid">
        {[
          { id: "one", name: t.oneBook, price: "€9" },
          { id: "three", name: t.threeBooks, price: "€19" },
        ].map((p) => (
          <div className="credit-pack" key={p.id}>
            <h3>{p.name}</h3>
            <strong>{p.price}</strong>
            <p>{t.noSubscription}</p>
            <span>
              <Check size={15} />
              {t.exportFeature}
            </span>
            <button
              className="button button-primary"
              disabled={!enabled || !consent || !!pending}
              onClick={() => buy(p.id)}
            >
              {pending === p.id ? (
                <Loader2 size={16} className="spin" />
              ) : (
                t.buy
              )}
              <ArrowUpRight size={16} />
            </button>
          </div>
        ))}
      </div>
      <label className="checkbox-label">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
        />
        <span>
          {t.consent}{" "}
          <Link href={`/${locale}/terms`} target="_blank">
            {t.terms}
          </Link>
        </span>
      </label>
      <p className="muted">{t.checkoutNote}</p>
      {error && (
        <p role="alert" className="error-message">
          {errorMessage(error, locale)}
        </p>
      )}
    </div>
  );
}
