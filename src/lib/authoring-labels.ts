import type { Locale, SectionUnit } from "./domain";

/** Authored content units are not the same as physical printed pages. */
const labels: Record<SectionUnit, Record<Locale, readonly [string, string]>> = {
  chapter: {
    en: ["chapter", "chapters"], ar: ["فصل", "فصول"], sv: ["kapitel", "kapitel"],
  },
  page: {
    en: ["content page", "content pages"], ar: ["صفحة محتوى", "صفحات محتوى"], sv: ["innehållssida", "innehållssidor"],
  },
  section: {
    en: ["section", "sections"], ar: ["قسم", "أقسام"], sv: ["avsnitt", "avsnitt"],
  },
};
export function partLabel(locale: Locale, unit?: SectionUnit, plural = false): string {
  return labels[unit || "chapter"][locale][plural ? 1 : 0];
}
