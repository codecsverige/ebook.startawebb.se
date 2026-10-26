import { EmailCallback } from "@/components/email-callback";
import { Header, Footer } from "@/components/brand";
import { isLocale } from "@/lib/domain";
export const metadata = {
  title: "Sign in",
  robots: { index: false, follow: false },
  referrer: "no-referrer" as const,
};
export default async function Callback({
  searchParams,
}: {
  searchParams: Promise<{ locale?: string }>;
}) {
  const q = await searchParams,
    locale = q.locale && isLocale(q.locale) ? q.locale : "en";
  return (
    <>
      <Header locale={locale} compact />
      <main id="main" className="login-page container">
        <EmailCallback locale={locale} />
      </main>
      <Footer locale={locale} />
    </>
  );
}
