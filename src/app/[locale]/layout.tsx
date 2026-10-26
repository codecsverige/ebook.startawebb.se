import "@fontsource-variable/inter";
import "@fontsource/noto-naskh-arabic/400.css";
import "@fontsource/noto-naskh-arabic/700.css";
import "@fontsource/dm-serif-display/400.css";
import "@/app/globals.css";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isLocale, locales } from "@/lib/domain";
import { appUrl } from "@/lib/config";

export const metadata: Metadata = {
  metadataBase: new URL(appUrl()),
  title: {
    default: "Ebook Studio — StartaWebb",
    template: "%s | Ebook Studio",
  },
  applicationName: "Ebook Studio",
  icons: { icon: "/icon.svg" },
  robots: { index: true, follow: true },
};
export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}
export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return (
    <html lang={locale} dir={locale === "ar" ? "rtl" : "ltr"}>
      <body>
        <a className="skip-link" href="#main">
          {locale === "ar"
            ? "انتقل إلى المحتوى"
            : locale === "sv"
              ? "Hoppa till innehållet"
              : "Skip to content"}
        </a>
        {children}
      </body>
    </html>
  );
}
