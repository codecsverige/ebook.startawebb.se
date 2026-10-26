import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Header, Footer } from "@/components/brand";
import { BookCover } from "@/components/book-cover";
import { Markdown } from "@/components/markdown";
import { isLocale } from "@/lib/domain";
import { copy, tr } from "@/lib/i18n";
import { examples } from "@/lib/samples";
type Props = { params: Promise<{ locale: string; kind: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, kind } = await params;
  if (!isLocale(locale)) return {};
  const s = examples(locale).find((e) => e.kind === kind);
  return s
    ? {
        title: s.title,
        description: s.subtitle,
        alternates: {
          canonical: `/${locale}/examples/${kind}`,
          languages: {
            en: `/en/examples/${kind}`,
            ar: `/ar/examples/${kind}`,
            sv: `/sv/examples/${kind}`,
          },
        },
      }
    : {};
}
export default async function Sample({ params }: Props) {
  const { locale, kind } = await params;
  if (!isLocale(locale)) notFound();
  const s = examples(locale).find((e) => e.kind === kind);
  if (!s) notFound();
  const t = copy[locale];
  return (
    <>
      <Header locale={locale} />
      <main id="main" className="container sample-page">
        <aside>
          <Link className="text-link" href={`/${locale}/examples`}>
            ← {t.navExamples}
          </Link>
          <BookCover
            title={s.title}
            subtitle={s.subtitle}
            style={s.style}
            language={locale}
          />
          <p className="muted">
            {tr(
              locale,
              "Editorial example. A short excerpt showing the format.",
              "مثال تحريري. مقتطف قصير يوضّح شكل المحتوى.",
              "Redaktionellt exempel. Ett kort utdrag som visar formatet.",
            )}
          </p>
          <Link className="button button-primary" href={`/${locale}/studio`}>
            {t.start}
          </Link>
        </aside>
        <article className="reading-sheet">
          <span className="eyebrow">
            01 / {t[s.kind as "guide" | "ebook" | "workbook"]}
          </span>
          <h1>{s.chapter}</h1>
          <Markdown text={s.content} />
        </article>
      </main>
      <Footer locale={locale} />
    </>
  );
}
