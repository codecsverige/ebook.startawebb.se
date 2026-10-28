import { notFound, redirect } from "next/navigation";
import { Header } from "@/components/brand";
import { Dashboard } from "@/components/dashboard";
import { isLocale } from "@/lib/domain";
import { configuration } from "@/lib/config";
import { sessionUser } from "@/lib/firebase-session";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "Workspace",
  robots: { index: false, follow: false },
};
export default async function Studio({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ pack?: string; checkout?: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const config = configuration();
  if (!config.accounts) redirect(`/${locale}/login`);
  const user = await sessionUser();
  if (!user) redirect(`/${locale}/login`);
  const ownerTrial = !config.billing && !!process.env.EBOOK_TEST_ACCOUNT_EMAIL &&
    user.email.toLowerCase() === process.env.EBOOK_TEST_ACCOUNT_EMAIL.trim().toLowerCase();
  const q = await searchParams;
  return (
    <>
      <Header locale={locale} compact />
      <main id="main">
        <Dashboard
          locale={locale}
          email={user.email || ""}
          config={{ ...config, ownerTrial }}
          initialPack={q.pack === "one" || q.pack === "three"}
          checkoutReturned={q.checkout === "returned"}
        />
      </main>
    </>
  );
}
