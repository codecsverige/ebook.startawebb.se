"use client";

import { useMemo, useState } from "react";
import { BookOpen, CheckCircle2, ChevronDown, Pencil, RotateCcw, Sparkles } from "lucide-react";
import type { BookWithCover, Locale } from "@/lib/domain";
import { tr } from "@/lib/i18n";
import styles from "./studio-plan-tools.module.css";

type Props = {
  book: BookWithCover;
  locale: Locale;
  disabled: boolean;
  canGenerateAll: boolean;
  onIdeaChange: (idea: string) => void;
  onChapterSummaryChange: (chapterId: string, summary: string) => void;
  onChapterOpen: (chapterId: string) => void;
  onGenerateRemaining: () => void;
  onReplan: () => void;
};

export function StudioPlanTools({
  book, locale, disabled, canGenerateAll,
  onIdeaChange, onChapterSummaryChange, onChapterOpen,
  onGenerateRemaining, onReplan,
}: Props) {
  const [editing, setEditing] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const chapters = book.outline;
  const missing = chapters.filter(ch => !book.chapters[ch.id]?.content?.trim());
  const overview = useMemo(() => {
    const summaries = chapters.map(ch => ch.summary.trim()).filter(Boolean);
    return summaries.length ? summaries.join(" ").slice(0, 560) : book.idea;
  }, [book.idea, chapters]);
  if (!chapters.length) return null;
  const available = showAll ? chapters : chapters.slice(0, 4);
  const dir = book.language === "ar" ? "rtl" : "ltr";

  return (
    <section className={styles.panel} dir={dir} aria-label={tr(locale,
      "Book map and summaries", "خريطة الكتاب وملخصات الفصول", "Boköversikt och kapitelsammanfattningar")}>
      <div className={styles.heading}>
        <div>
          <h3>{tr(locale, "Your book, chapter by chapter", "كتابك أمامك، فصلًا فصلًا", "Din bok, kapitel för kapitel")}</h3>
          <p>{tr(locale,
            "Review the planned content before generating or editing the manuscript.",
            "راجع ما سيُكتب في كتابك، وعدّل الفكرة أو مخطط أي فصل قبل توليد نصه.",
            "Granska innehållet och justera planen innan du skapar texten.")}</p>
        </div>
        <span className={styles.count}>{chapters.length - missing.length} / {chapters.length}</span>
      </div>
      <div className={styles.overview}>
        <strong>{tr(locale, "What this book will cover", "عمّ سيتحدث هذا الكتاب؟", "Det här kommer boken att handla om")}</strong>
        <p>{overview}</p>
        <details className={styles.details}>
          <summary><Pencil size={15}/>{tr(locale, "Edit original idea and overall direction", "تعديل الفكرة والتوجه العام", "Redigera idé och övergripande inriktning")}</summary>
          <label className={styles.field}>
            {tr(locale, "Original idea", "الفكرة الأصلية", "Ursprunglig idé")}
            <textarea rows={4} maxLength={2000} value={book.idea} disabled={disabled}
              onChange={e => onIdeaChange(e.target.value)}/>
          </label>
          <small>{tr(locale,
            "Changing the idea guides future AI writing; it does not overwrite chapters already written.",
            "تعديل الفكرة يوجّه الكتابة المستقبلية فقط، ولا يغيّر النصوص المكتوبة تلقائيًا.",
            "En ändring påverkar kommande AI-text, inte redan skrivna kapitel.")}</small>
        </details>
      </div>
      <details className={styles.chapterCollapse}>
        <summary className={styles.chapterCollapseToggle}>{tr(locale,
          "Read or edit every chapter summary", "عرض ملخصات الفصول وتعديلها", "Läs eller redigera kapitelsammanfattningarna")}</summary>
      <div className={styles.chapterList}>
        {available.map((chapter, index) => {
          const written = Boolean(book.chapters[chapter.id]?.content?.trim());
          const isEditing = editing === chapter.id;
          return <article key={chapter.id} className={styles.chapter}>
            <div className={styles.chapterTitle}>
              <span className={styles.number}>{index + 1}</span>
              <div className={styles.chapterMeta}>
                <strong>{chapter.title}</strong>
                <small>{written
                  ? tr(locale, "Text already written", "تمت كتابة النص", "Text finns")
                  : tr(locale, "Planned · awaiting writing", "مخطط · ينتظر الكتابة", "Planerat · väntar på text")}</small>
              </div>
              {written && <CheckCircle2 size={18} className={styles.check}/>}
            </div>
            {isEditing
              ? <label className={styles.field}>
                  {tr(locale, "What should this chapter explain?", "ماذا يجب أن يتناول هذا الفصل؟", "Vad ska kapitlet ta upp?")}
                  <textarea rows={3} maxLength={600} value={chapter.summary} disabled={disabled}
                    onChange={e => onChapterSummaryChange(chapter.id, e.target.value)}/>
                </label>
              : <p className={styles.summary}>{chapter.summary || tr(locale,
                  "No chapter description yet.", "لم يُكتب ملخص هذا الفصل بعد.", "Ingen kapitelbeskrivning ännu.")}</p>}
            <div className={styles.chapterActions}>
              <button type="button" className={styles.action} disabled={disabled}
                onClick={() => setEditing(isEditing ? null : chapter.id)}>
                <Pencil size={14}/> {isEditing
                  ? tr(locale, "Finish editing", "إنهاء التعديل", "Klar")
                  : tr(locale, "Edit chapter plan", "تعديل الملخص", "Redigera plan")}
              </button>
              <button type="button" className={styles.action} disabled={disabled}
                onClick={() => onChapterOpen(chapter.id)}>
                <BookOpen size={14}/> {tr(locale, "Open chapter", "فتح الفصل", "Öppna kapitel")}
              </button>
            </div>
          </article>;
        })}
      </div>
      {chapters.length > 4 && <button className={styles.expand} type="button"
        onClick={() => setShowAll(v => !v)} aria-expanded={showAll}>
        <ChevronDown size={15}/> {showAll
          ? tr(locale, "Show fewer chapters", "عرض فصول أقل", "Visa färre kapitel")
          : tr(locale, "Show all chapters", "عرض جميع الفصول", "Visa alla kapitel")}
      </button>}
      </details>
      <div className={styles.footer}>
        <button type="button" className={styles.primary} disabled={disabled || !missing.length}
          onClick={() => onChapterOpen((missing[0] || chapters[0]).id)}>
          <BookOpen size={17}/> {tr(locale, "Write one chapter at a time", "الكتابة فصلًا فصلًا", "Skriv ett kapitel i taget")}
        </button>
        {canGenerateAll && <button type="button" className={styles.secondary}
          disabled={disabled || !missing.length}
          onClick={() => {
            if (window.confirm(tr(locale,
              "Generate all remaining chapters with AI? Existing chapters will be kept. This consumes AI usage.",
              "هل تريد توليد جميع الفصول غير المكتوبة؟ الفصول الموجودة لن تُستبدل، وستُحتسب تكلفة استخدام AI.",
              "Generera alla återstående kapitel? Befintliga kapitel behålls och AI-användning debiteras."))) onGenerateRemaining();
          }}>
          <Sparkles size={17}/> {tr(locale, "Generate remaining chapters", "توليد بقية الكتاب تلقائيًا", "Skapa återstående kapitel")}
        </button>}
      </div>
      <details className={styles.details}>
        <summary><RotateCcw size={15}/>{tr(locale,
          "Want a completely different outline?", "لم يعجبك الفهرس؟ أعد التخطيط", "Vill du ha en helt annan disposition?")}</summary>
        <p className={styles.warning}>{tr(locale,
          "Restarting archives the previous book in version history and resets the current manuscript and covers. Edit the idea, then generate a new outline. Restore the earlier version from history if needed.",
          "إعادة التخطيط تحفظ النسخة السابقة في سجل الإصدارات، لكنها تعيد تهيئة فصول النسخة الحالية وأغلفتها. عدّل الفكرة ثم ولّد فهرسًا جديدًا، ويمكنك استعادة النسخة السابقة من السجل.",
          "Omstart arkiverar föregående version men nollställer manus och omslag. Redigera idén och skapa sedan en ny disposition.")}</p>
        <button type="button" className={styles.danger} disabled={disabled} onClick={onReplan}>
          <RotateCcw size={15}/> {tr(locale, "Archive and replan", "حفظ نسخة وإعادة التخطيط", "Arkivera och planera om")}
        </button>
      </details>
    </section>
  );
}
