import Link from "next/link";
import { BookOpen, ArrowUpRight } from "lucide-react";
import { copy } from "@/lib/i18n";
import type { Locale } from "@/lib/domain";
import { LanguageSwitch } from "./language-switch";

export function Brand({ locale }: { locale: Locale }) {
  return (
    <Link className="brand" href={`/${locale}`} aria-label="Ebook Studio">
      <span className="brand-mark">
        <BookOpen size={22} strokeWidth={1.7} />
      </span>
      <span>
        ebook<span className="brand-light">studio</span>
        <small>BY STARTAWEBB</small>
      </span>
    </Link>
  );
}
export function Header({
  locale,
  compact = false,
}: {
  locale: Locale;
  compact?: boolean;
}) {
  const t = copy[locale];
  return (
    <header className="site-header">
      <div className="container header-inner">
        <Brand locale={locale} />
        {!compact && (
          <nav className="desktop-nav" aria-label={t.navHow}>
            <Link href={`/${locale}#how`}>{t.navHow}</Link>
            <Link href={`/${locale}/examples`}>{t.navExamples}</Link>
            <Link href={`/${locale}#pricing`}>{t.navPricing}</Link>
          </nav>
        )}
        <div className="header-actions">
          <LanguageSwitch locale={locale} />
          <Link
            className="button button-small button-ink"
            href={`/${locale}/studio`}
          >
            {t.studio}
            <ArrowUpRight size={15} />
          </Link>
        </div>
      </div>
    </header>
  );
}
export function Footer({ locale }: { locale: Locale }) {
  const t = copy[locale];
  return (
    <footer className="site-footer">
      <div className="container footer-inner">
        <div>
          <Brand locale={locale} />
          <p>{t.footer}</p>
        </div>
        <nav>
          <Link href={`/${locale}/privacy`}>{t.privacy}</Link>
          <Link href={`/${locale}/terms`}>{t.terms}</Link>
          <a href="https://startawebb.se" target="_blank" rel="noreferrer">
            {t.support}
            <ArrowUpRight size={14} />
          </a>
        </nav>
        <span className="footer-year">
          © {new Date().getFullYear()} Ebook Studio
        </span>
      </div>
    </footer>
  );
}
