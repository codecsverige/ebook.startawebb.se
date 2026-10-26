"use client";
import { useParams } from "next/navigation";
import { isLocale } from "@/lib/domain";
import { copy, errorMessage } from "@/lib/i18n";
export default function ErrorPage({ reset }: { reset: () => void }) {
  const p = useParams();
  const locale =
    typeof p.locale === "string" && isLocale(p.locale) ? p.locale : "en";
  return (
    <main id="main" className="container section empty-state">
      <h1>{copy[locale].errorTitle}</h1>
      <p>{errorMessage("service_error", locale)}</p>
      <button className="button button-primary" onClick={reset}>
        {copy[locale].retry}
      </button>
    </main>
  );
}
