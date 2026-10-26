import Link from "next/link";
import { notFound } from "next/navigation";
import { Header, Footer } from "@/components/brand";
import { LoginForm } from "@/components/login-form";
import { isLocale } from "@/lib/domain";
import { copy } from "@/lib/i18n";
import { configuration } from "@/lib/config";
export const metadata = {
  title: "Sign in",
  robots: { index: false, follow: false },
};
export default async function Login({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = copy[locale];
  const { error } = await searchParams;
  return (
    <>
      <Header locale={locale} compact />
      <main id="main" className="login-page container">
        <div className="login-intro">
          <span className="eyebrow">EBOOK STUDIO</span>
          <h1>{t.loginTitle}</h1>
          <p>{t.loginBody}</p>
          <span className="login-decoration" aria-hidden="true">
            ✳
          </span>
        </div>
        <div className="login-card">
          <LoginForm
            locale={locale}
            enabled={configuration().accounts}
            expired={!!error}
          />
          <p className="legal-note">
            <Link href={`/${locale}/terms`}>{t.terms}</Link> ·{" "}
            <Link href={`/${locale}/privacy`}>{t.privacy}</Link>
          </p>
        </div>
      </main>
      <Footer locale={locale} />
    </>
  );
}
