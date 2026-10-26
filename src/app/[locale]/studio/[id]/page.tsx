import { notFound, redirect } from "next/navigation";
import { Header } from "@/components/brand";
import { Editor } from "@/components/editor";
import { isLocale } from "@/lib/domain";
import { configuration } from "@/lib/config";
import { sessionUser } from "@/lib/firebase-session";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "Book editor",
  robots: { index: false, follow: false },
};
export default async function BookEditor({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  if (!isLocale(locale) || !/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const config = configuration();
  if (!config.accounts) redirect(`/${locale}/login`);
  const user = await sessionUser();
  if (!user) redirect(`/${locale}/login`);
  return (
    <>
      <Header locale={locale} compact />
      <main id="main">
        <Editor id={id} locale={locale} config={config} />
      </main>
    </>
  );
}
