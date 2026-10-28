import { notFound } from "next/navigation";
import { isLocale } from "@/lib/domain";
import { ChatgptComplete } from "@/components/chatgpt-complete";

export const dynamic = "force-dynamic";
export const metadata = { title: "Completing ChatGPT sign-in", robots: { index: false, follow: false } };
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <ChatgptComplete locale={locale} />;
}
