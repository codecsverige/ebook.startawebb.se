import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowUpRight } from "lucide-react";
import { Header, Footer } from "@/components/brand";
import { BookCover } from "@/components/book-cover";
import { isLocale } from "@/lib/domain";
import { copy } from "@/lib/i18n";
import { examples } from "@/lib/samples";
export const metadata = { title: "Book examples" };
export default async function Examples({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = copy[locale];
  return (
    <>
      <Header locale={locale} />
      <main id="main" className="container section">
        <div className="section-heading">
          <div className="eyebrow">EBOOK STUDIO / {t.navExamples}</div>
          <h1>{t.examplesTitle}</h1>
          <p>{t.examplesBody}</p>
        </div>
        <div className="examples-grid">
          {examples(locale).map((s) => (
            <Link
              className="example-card"
              href={`/${locale}/examples/${s.kind}`}
              key={s.kind}
            >
              <div className={`example-cover-wrap wrap-${s.style}`}>
                <BookCover
                  title={s.title}
                  subtitle={s.subtitle}
                  style={s.style}
                  language={locale}
                />
              </div>
              <div className="example-description">
                <h2>{s.title}</h2>
                <ArrowUpRight size={20} />
              </div>
            </Link>
          ))}
        </div>
      </main>
      <Footer locale={locale} />
    </>
  );
}
