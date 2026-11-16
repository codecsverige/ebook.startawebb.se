"use client";
import { useEffect, useState } from "react";
import type { Locale } from "@/lib/domain";

type Probe = {
  status?: string;
  httpStatus?: number;
  providerCode?: string;
  providerType?: string;
  keyLastFour?: string;
  preferredModel?: string;
  listedCompatibleModels?: string[];
  billingTestPerformed?: boolean;
};

/** Read-only owner diagnostic. No prompts, secrets or paid generation requests. */
export function OwnerAiDiagnostics({ jobId, locale }: { jobId: string; locale: Locale }) {
  const [result, setResult] = useState<Probe | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    setResult(null);
    fetch("/api/ai/diagnostics", {
      method: "GET",
      cache: "no-store",
      credentials: "same-origin",
      signal: controller.signal,
    }).then(async response => {
      const data: unknown = await response.json();
      if (controller.signal.aborted || !data || typeof data !== "object") return;
      setResult(data as Probe);
    }).catch(() => {
      // Diagnostics must not interfere with manuscript editing or retries.
    });
    return () => controller.abort();
  }, [jobId]);

  if (!result?.status || result.status === "unauthorized") return null;

  const text = locale === "ar"
    ? "فحص اتصال OpenAI (دون تكلفة توليد)"
    : locale === "sv" ? "OpenAI-kontroll (utan genereringskostnad)"
    : "OpenAI connection check (no generation charge)";
  const relayStates: Record<string, [string, string, string]> = {
    bokanara_relay_authenticated: [
      "اتصال BokaNära الآمن موثّق. لم يُختبر توليد فصل فعلي بعد.",
      "Säker anslutning till BokaNära verifierad. Ingen faktisk kapitelgenerering har testats.",
      "Secure BokaNära connection authenticated. Chapter generation has not been tested yet.",
    ],
    bokanara_relay_signature_rejected: [
      "رفض BokaNära توقيع الخادم. لا تُكرر محاولات التوليد حتى يُصحّح الاتصال.",
      "BokaNära nekade serverns signatur. Generering är inte redo.",
      "BokaNära rejected the server signature. Generation is not ready.",
    ],
    bokanara_relay_unavailable: [
      "تعذّر فحص الاتصال بخادم BokaNära. التوليد عبره غير مؤكد.",
      "BokaNära-anslutningen kunde inte kontrolleras. Generering är obekräftad.",
      "BokaNära connection could not be checked. Generation remains unverified.",
    ],
  };
  const relayMessage = relayStates[result.status];
  if (relayMessage) {
    return (
      <div className="muted" style={{ fontSize: 12, overflowWrap: "anywhere" }}>
        <strong>{text}</strong>
        <div>{relayMessage[locale === "ar" ? 0 : locale === "sv" ? 1 : 2]}</div>
      </div>
    );
  }
  return (
    <div className="muted" style={{ fontSize: 12, overflowWrap: "anywhere" }}>
      <strong>{text}</strong>
      <div dir="ltr">
        {result.status}
        {result.httpStatus ? ` · HTTP ${result.httpStatus}` : ""}
        {result.providerCode ? ` · ${result.providerCode}` : ""}
        {result.keyLastFour ? ` · key …${result.keyLastFour}` : ""}
      </div>
      {Array.isArray(result.listedCompatibleModels) && (
        <div dir="ltr">Models in API catalog: {result.listedCompatibleModels.length
          ? result.listedCompatibleModels.join(", ") : "none"}</div>
      )}
    </div>
  );
}
