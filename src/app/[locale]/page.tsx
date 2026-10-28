import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import {
  ArrowUpRight,
  ArrowRight,
  Check,
  Sparkles,
  FileText,
  Languages,
  PencilLine,
  BookOpen,
  Quote,
} from "lucide-react";
import { Header, Footer } from "@/components/brand";
import { BookCover } from "@/components/book-cover";
import { isLocale } from "@/lib/domain";
import { copy, tr } from "@/lib/i18n";
import { examples } from "@/lib/samples";
import { configuration } from "@/lib/config";

type Props = { params: Promise<{ locale: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = copy[locale];
  return {
    title: tr(
      locale,
      "Create an ebook from your ideas",
      "حوّل أفكارك إلى كتاب إلكتروني",
      "Skapa en e-bok av dina idéer",
    ),
    description: t.heroBody,
    alternates: {
      canonical: `/${locale}`,
      languages: { en: "/en", ar: "/ar", sv: "/sv", "x-default": "/en" },
    },
    openGraph: {
      title: "Ebook Studio",
      description: t.heroBody,
      locale,
      type: "website",
    },
  };
}
export default async function Home({ params }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = copy[locale];
  const billing = configuration().billing;
  return (
    <>
      <Header locale={locale} />
      <main id="main">
        <section className="hero container">
          <div className="hero-copy">
            <div className="eyebrow">
              <span className="tiny-star">✳</span>
              {t.eyebrow}
            </div>
            <h1>
              {t.hero1}
              <br />
              <em>{t.hero2}</em>
            </h1>
            <p className="hero-description">{t.heroBody}</p>
            <div className="hero-buttons">
              <Link
                className="button button-primary"
                href={`/${locale}/studio`}
              >
                <Sparkles size={18} />
                {t.start}
                <ArrowUpRight size={18} />
              </Link>
              <Link className="text-link" href={`/${locale}/examples`}>
                {t.viewExample}
                <ArrowRight size={17} />
              </Link>
            </div>
            <p className="free-note">
              <Check size={14} />
              {t.freeNote}
            </p>
            <div className="hero-editor-note">
              <span className="note-line" />
              <PencilLine size={17} />
              <span>{t.human}</span>
            </div>
          </div>
          <div className="hero-visual">
            <div className="visual-cross cross-top">+</div>
            <div className="hero-backdrop" />
            <div className="hero-book">
              <BookCover
                title={t.heroBook}
                subtitle={t.heroSubtitle}
                author={t.heroAuthor}
                language={locale}
              />
            </div>
            <div className="floating-note">
              <span className="note-icon">
                <Check size={17} />
              </span>
              <div>
                <strong>
                  {tr(
                    locale,
                    "Your idea, taking shape.",
                    "فكرتك، تأخذ شكلها.",
                    "Din idé tar form.",
                  )}
                </strong>
                <span>
                  {tr(
                    locale,
                    "One chapter at a time.",
                    "فصلًا بعد فصل.",
                    "Ett kapitel i taget.",
                  )}
                </span>
              </div>
              <span className="note-spark">✧</span>
            </div>
            <div className="visual-cross cross-bottom">+</div>
            <span className="visual-caption">A LITTLE IDEA. A REAL BOOK.</span>
          </div>
        </section>
        <div className="benefit-strip">
          <div className="container benefit-inner">
            {[
              [FileText, t.formats],
              [Languages, t.languages],
              [PencilLine, t.editEverything],
              [BookOpen, t.ownWork],
            ].map(([Icon, label], i) => {
              const I = Icon as typeof FileText;
              return (
                <span key={i}>
                  <I size={18} />
                  {label as string}
                </span>
              );
            })}
          </div>
        </div>
        <section id="how" className="section container">
          <div className="section-heading">
            <div className="eyebrow">01 / {t.navHow}</div>
            <h2>{t.howTitle}</h2>
            <p>{t.howBody}</p>
          </div>
          <div className="steps-grid">
            {[
              [t.step1, t.step1Body, PencilLine],
              [t.step2, t.step2Body, FileText],
              [t.step3, t.step3Body, BookOpen],
            ].map(([title, body, Icon], i) => {
              const I = Icon as typeof BookOpen;
              return (
                <article className="step-card" key={i}>
                  <div className="step-top">
                    <span>0{i + 1}</span>
                    <I size={23} strokeWidth={1.4} />
                  </div>
                  <h3>{title as string}</h3>
                  <p>{body as string}</p>
                </article>
              );
            })}
          </div>
        </section>
        <section className="examples-section">
          <div className="container section">
            <div className="section-heading split-heading">
              <div>
                <div className="eyebrow">02 / {t.navExamples}</div>
                <h2>{t.examplesTitle}</h2>
                <p>{t.examplesBody}</p>
              </div>
              <Link className="text-link" href={`/${locale}/examples`}>
                {t.viewExample}
                <ArrowUpRight size={17} />
              </Link>
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
                      small
                    />
                  </div>
                  <div className="example-description">
                    <div>
                      <span className="small-label">
                        {t[s.kind as "guide" | "ebook" | "workbook"]}
                      </span>
                      <h3>{s.title}</h3>
                      <p>
                        {
                          t[
                            `${s.kind}Desc` as
                              "guideDesc" | "ebookDesc" | "workbookDesc"
                          ]
                        }
                      </p>
                    </div>
                    <span className="round-arrow">
                      <ArrowUpRight size={19} />
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
        {billing ? (
        <section className="section container" id="pricing">
          <div className="section-heading centered">
            <div className="eyebrow">03 / {t.navPricing}</div>
            <h2>{t.pricingTitle}</h2>
            <p>{t.pricingBody}</p>
          </div>
          <div className="pricing-grid">
            {[
              {
                name: t.free,
                price: "€0",
                features: [t.freeFeature1, t.freeFeature2, t.freeFeature3],
                pack: "",
              },
              {
                name: t.oneBook,
                price: "€9",
                features: [t.oneFeature, t.exportFeature, t.coverFeature],
                pack: "one",
              },
              {
                name: t.threeBooks,
                price: "€19",
                features: [t.oneFeature, t.exportFeature, t.coverFeature],
                pack: "three",
              },
            ].map((p, i) => (
              <article
                className={`price-card ${i === 1 ? "price-featured" : ""}`}
                key={p.name}
              >
                <div className="price-kicker">
                  {i === 1 ? <Sparkles size={19} /> : <BookOpen size={19} />}
                  <h3>{p.name}</h3>
                </div>
                <div className="price">{p.price}</div>
                <p className="price-note">
                  {i === 0 ? t.freeNote : t.noSubscription}
                </p>
                <ul>
                  {p.features.map((f) => (
                    <li key={f}>
                      <Check size={16} />
                      {f}
                    </li>
                  ))}
                </ul>
                <Link
                  className={`button ${i === 1 ? "button-primary" : "button-outline"}`}
                  href={`/${locale}/studio${p.pack ? `?pack=${p.pack}` : ""}`}
                >
                  {i === 0 ? t.start : t.buy}
                  <ArrowUpRight size={17} />
                </Link>
                {i > 0 && !billing && (
                  <small className="activation-note">{t.coming}</small>
                )}
              </article>
            ))}
          </div>
          <p className="pricing-tax">
            {tr(
              locale,
              "Prices in EUR. Applicable tax is shown at checkout.",
              "الأسعار باليورو. تُعرض الضرائب المطبّقة عند الدفع.",
              "Priser i EUR. Tillämplig skatt visas i kassan.",
            )}
          </p>
        </section>
        ) : (
          <section className="section container" id="pricing">
            <div className="section-heading centered">
              <div className="eyebrow">{tr(locale, "Testing phase", "مرحلة التجربة", "Testfas")}</div>
              <h2>{tr(locale, "Create and preview your first chapter", "أنشئ مخطط كتابك وعاين الفصل الأول", "Skapa och förhandsgranska ditt första kapitel")}</h2>
              <p>{tr(locale,
                "Checkout is not available during testing. Full-book generation is being tested privately before launch.",
                "الدفع غير متاح خلال التجربة. يجري اختبار توليد الكتب الكاملة بشكل خاص قبل الإطلاق.",
                "Betalning är inte tillgänglig under testningen. Generering av hela böcker testas privat före lansering."
              )}</p>
              <Link className="button button-primary" href={`/${locale}/studio`}>{t.start}<ArrowUpRight size={18} /></Link>
            </div>
          </section>
        )}
        <section className="faq-section container">
          <div className="faq-intro">
            <Quote size={34} strokeWidth={1} />
            <h2>{t.faqTitle}</h2>
          </div>
          <div className="faq-list">
            {[
              [t.faq1, t.faq1Body],
              [t.faq2, t.faq2Body],
              [t.faq3, t.faq3Body],
              [t.faq4, t.faq4Body],
            ].map(([q, a]) => (
              <details key={q}>
                <summary>
                  {q}
                  <span>+</span>
                </summary>
                <p>{a}</p>
              </details>
            ))}
          </div>
        </section>
        <section className="container">
          <div className="cta-panel">
            <span className="cta-flower">✳</span>
            <div>
              <h2>{t.ctaTitle}</h2>
              <p>{t.ctaBody}</p>
            </div>
            <Link className="button button-cream" href={`/${locale}/studio`}>
              {t.start}
              <ArrowUpRight size={18} />
            </Link>
          </div>
        </section>
      </main>
      <Footer locale={locale} />
    </>
  );
}
