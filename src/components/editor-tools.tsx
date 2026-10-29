"use client";
import { useState } from "react";
import { Sparkles, Check, X, ShieldCheck, ArrowRight } from "lucide-react";
import {
  bookSettings,
  coverLayouts,
  type BookWithCover,
  type BookSettings,
  type Locale,
  type Job,
  type AssistantResult,
  type AssistantInput,
} from "@/lib/domain";
import { tr } from "@/lib/i18n";
import { publicationBody, publicationFontSize } from "@/lib/book-design";

type Generate = (
  kind: "assist" | "cover_ideas" | "review",
  chapter?: string,
  input?: Omit<AssistantInput, "revision">,
) => void;
export const layoutNames = {
  editorial: ["Editorial", "تحريري", "Redaktionell"],
  cinematic: ["Cinematic", "سينمائي", "Filmisk"],
  minimal: ["Minimal", "بسيط", "Minimalistisk"],
  frame: ["Framed", "بإطار", "Inramad"],
  split: ["Split", "مقسّم", "Delad"],
} as const;
function layoutName(locale: Locale, layout: BookSettings["cover_layout"]) {
  const [en, ar, sv] = layoutNames[layout];
  return tr(locale, en, ar, sv);
}

export function WritingAssistant({
  locale,
  chapterId,
  selection,
  job,
  disabled,
  available,
  generate,
  onApply,
  onDismiss,
}: {
  locale: Locale;
  chapterId: string;
  selection: { start: number; end: number } | null;
  job: Job | null;
  disabled: boolean;
  available: boolean;
  generate: Generate;
  onApply: (result: Extract<AssistantResult, { type: "edit" }>) => void;
  onDismiss: () => void;
}) {
  const [instruction, setInstruction] = useState("");
  const result =
    job?.status === "completed" &&
    job.result?.type === "edit" &&
    job.result.chapter_id === chapterId
      ? job.result
      : null;
  return (
    <aside
      className="writing-assistant"
      aria-label={tr(
        locale,
        "Writing assistant",
        "مساعد الكتابة",
        "Skrivassistent",
      )}
    >
      <div className="tool-heading">
        <Sparkles size={18} />
        <h3>
          {tr(
            locale,
            "Your writing partner",
            "مساعدك في التأليف",
            "Din skrivpartner",
          )}
        </h3>
      </div>
      <p className="muted">
        {tr(
          locale,
          "Ask for a change to this chapter, or select a passage first. Review the suggestion before applying it.",
          "اطلب تعديلًا لهذا الفصل، أو حدّد فقرة أولًا. راجع الاقتراح قبل اعتماده.",
          "Be om en ändring i kapitlet eller markera först ett stycke. Granska förslaget innan du använder det.",
        )}
      </p>
      <div className="assistant-presets">
        {[
          [
            "Polish the style while preserving meaning and voice.",
            "حسّن الأسلوب مع الحفاظ على المعنى وصوت الكاتب.",
            "Förbättra stilen och behåll innebörden och rösten.",
          ],
          [
            "Make this more concise and remove repetition.",
            "اختصر النص واحذف التكرار دون فقدان المعنى.",
            "Korta ner texten och ta bort upprepningar.",
          ],
          [
            "Expand with useful detail, without inventing facts.",
            "وسّع النص بتفاصيل مفيدة دون اختلاق معلومات.",
            "Utveckla med användbara detaljer utan att hitta på fakta.",
          ],
          [
            "Correct language and punctuation only.",
            "صحّح اللغة وعلامات الترقيم فقط.",
            "Rätta endast språk och skiljetecken.",
          ],
        ].map((p, i) => (
          <button
            key={i}
            type="button"
            disabled={disabled}
            onClick={() => setInstruction(tr(locale, p[0], p[1], p[2]))}
          >
            {tr(
              locale,
              ...([
                ["Polish", "تحسين", "Förbättra"],
                ["Shorten", "اختصار", "Korta ner"],
                ["Expand", "توسيع", "Utveckla"],
                ["Proofread", "تدقيق", "Korrekturläs"],
              ][i] as [string, string, string]),
            )}
          </button>
        ))}
      </div>
      <label>
        {tr(
          locale,
          "What would you like to change?",
          "ماذا تريد أن تعدّل؟",
          "Vad vill du ändra?",
        )}
        <textarea
          value={instruction}
          rows={4}
          maxLength={2000}
          disabled={disabled}
          onChange={(e) => setInstruction(e.target.value)}
          placeholder={tr(
            locale,
            "For example: make the dialogue more natural…",
            "مثلًا: اجعل الحوار طبيعيًا أكثر…",
            "Till exempel: gör dialogen naturligare…",
          )}
        />
      </label>
      <span className="selection-note">
        {selection
          ? tr(
              locale,
              `${selection.end - selection.start} selected characters`,
              `${selection.end - selection.start} حرفًا محدّدًا`,
              `${selection.end - selection.start} markerade tecken`,
            )
          : tr(
              locale,
              "Applies to the current chapter",
              "سيشمل الطلب الفصل الحالي",
              "Gäller det aktuella kapitlet",
            )}
      </span>
      <button
        className="button button-primary"
        type="button"
        disabled={disabled || !available || !instruction.trim()}
        onClick={() =>
          generate("assist", chapterId, {
            instruction,
            ...(selection ? { selection } : {}),
          })
        }
      >
        <Sparkles size={16} />
        {tr(locale, "Suggest an edit", "اقترح التعديل", "Föreslå ändring")}
      </button>
      {result && (
        <div className="assistant-proposal" role="status">
          <strong>
            {tr(locale, "Suggested text", "النص المقترح", "Föreslagen text")}
          </strong>
          <p className="muted">{result.note}</p>
          <pre dir="auto">{result.content}</pre>
          <div className="tool-actions">
            <button
              className="button button-primary button-small"
              disabled={disabled}
              onClick={() => onApply(result)}
            >
              <Check size={15} />
              {tr(
                locale,
                "Apply suggestion",
                "اعتماد التعديل",
                "Använd förslaget",
              )}
            </button>
            <button
              className="button button-outline button-small"
              disabled={disabled}
              onClick={onDismiss}
            >
              <X size={15} />
              {tr(locale, "Discard", "رفض", "Avvisa")}
            </button>
          </div>
        </div>
      )}
    </aside>
  );
}

export function CoverWorkshop({
  book,
  locale,
  disabled,
  available,
  job,
  generate,
  update,
}: {
  book: BookWithCover;
  locale: Locale;
  disabled: boolean;
  available: boolean;
  job: Job | null;
  generate: Generate;
  update: (patch: Partial<BookSettings>) => void;
}) {
  const s = bookSettings(book),
    result =
      job?.status === "completed" && job.result?.type === "cover_ideas"
        ? job.result
        : null;
  return (
    <div className="cover-workshop stack">
      <div className="tool-heading">
        <Sparkles size={18} />
        <h3>
          {tr(
            locale,
            "Art direction for your book",
            "الفكرة البصرية لكتابك",
            "Bokens visuella uttryck",
          )}
        </h3>
      </div>
      <label>
        {tr(
          locale,
          "Describe the cover you imagine",
          "صف الغلاف الذي تتخيّله",
          "Beskriv omslaget du föreställer dig",
        )}
        <textarea
          rows={4}
          maxLength={1600}
          value={s.cover_brief}
          disabled={disabled}
          onChange={(e) => update({ cover_brief: e.target.value })}
          placeholder={tr(
            locale,
            "Subject, scene, mood, colors, and anything to avoid…",
            "الشخصية أو المشهد، الجوّ، الألوان وما تريد تجنّبه…",
            "Motiv, scen, stämning, färger och sådant att undvika…",
          )}
        />
      </label>
      <button
        className="button button-outline"
        disabled={disabled || !available}
        onClick={() => generate("cover_ideas", undefined, { instruction: "" })}
      >
        <Sparkles size={16} />
        {tr(
          locale,
          "Suggest three distinct concepts",
          "اقترح ثلاث أفكار مختلفة",
          "Föreslå tre olika idéer",
        )}
      </button>
      <p className="muted">
        {tr(
          locale,
          "Choose a concept before generating an image. Changing the layout or palette uses no AI.",
          "اختر الفكرة قبل توليد الصورة. تغيير التصميم أو الألوان لا يستهلك الذكاء الاصطناعي.",
          "Välj idé innan du skapar bilden. Layout- och färgändringar använder ingen AI.",
        )}
      </p>
      {result && (
        <div className="cover-concepts">
          {result.concepts.map((c, i) => (
            <button
              type="button"
              disabled={disabled}
              key={i}
              className={
                s.cover_brief === c.prompt
                  ? "concept-card is-selected"
                  : "concept-card"
              }
              onClick={() =>
                update({
                  cover_brief: c.prompt,
                  cover_layout: c.layout,
                  ...(!s.back_cover_text
                    ? { back_cover_text: result.back_cover_text }
                    : {}),
                })
              }
            >
              <span className="small-label">
                0{i + 1} / {layoutName(locale, c.layout)}
              </span>
              <strong>{c.title}</strong>
              <span>{c.description}</span>
              <span className="concept-use">
                {s.cover_brief === c.prompt ? (
                  <Check size={14} />
                ) : (
                  <ArrowRight size={14} />
                )}{" "}
                {tr(
                  locale,
                  "Use this concept",
                  "اختيار هذه الفكرة",
                  "Välj den här idén",
                )}
              </span>
            </button>
          ))}
        </div>
      )}
      <fieldset disabled={disabled}>
        <legend>
          {tr(locale, "Cover composition", "بناء الغلاف", "Omslagets layout")}
        </legend>
        <div className="layout-options">
          {coverLayouts.map((layout) => (
            <button
              type="button"
              key={layout}
              aria-pressed={s.cover_layout === layout}
              className={s.cover_layout === layout ? "selected" : ""}
              onClick={() => update({ cover_layout: layout })}
            >
              {layoutName(locale, layout)}
            </button>
          ))}
        </div>
      </fieldset>
      <label className="checkbox-label">
        <input
          type="checkbox"
          checked={s.back_cover}
          disabled={disabled}
          onChange={(e) => update({ back_cover: e.target.checked })}
        />
        {tr(
          locale,
          "Include a matching back cover",
          "إضافة غلاف خلفي متناسق",
          "Lägg till ett matchande baksidesomslag",
        )}
      </label>
      {s.back_cover && (
        <label>
          {tr(locale, "Back-cover blurb", "نبذة الغلاف الخلفي", "Baksidestext")}
          <textarea
            rows={6}
            maxLength={2500}
            value={s.back_cover_text}
            disabled={disabled}
            onChange={(e) => update({ back_cover_text: e.target.value })}
          />
        </label>
      )}
    </div>
  );
}

export function PublicationControls({
  book,
  locale,
  disabled,
  update,
}: {
  book: BookWithCover;
  locale: Locale;
  disabled: boolean;
  update: (patch: Partial<BookSettings>) => void;
}) {
  const s = bookSettings(book);
  return (
    <details className="publication-settings">
      <summary>
        {tr(
          locale,
          "Book formatting and extra pages",
          "تنسيق الكتاب وصفحاته الإضافية",
          "Formatering och extrasidor",
        )}
      </summary>
      <div className="publication-form">
        <div className="publication-selects">
          <label>
            {tr(locale, "Page size", "حجم الصفحة", "Sidstorlek")}
            <select
              value={s.page_size}
              disabled={disabled}
              onChange={(e) =>
                update({
                  page_size: e.target.value as BookSettings["page_size"],
                })
              }
            >
              <option value="A5">A5</option>
              <option value="A4">A4</option>
              <option value="trade">6 × 9 in</option>
            </select>
          </label>
          <label>
            {tr(locale, "Typeface", "الخط", "Typsnitt")}
            <select
              value={s.font}
              disabled={disabled}
              onChange={(e) =>
                update({ font: e.target.value as BookSettings["font"] })
              }
            >
              <option value="serif">
                {tr(locale, "Literary", "أدبي", "Litterärt")}
              </option>
              <option value="sans">
                {tr(locale, "Modern", "حديث", "Modernt")}
              </option>
            </select>
          </label>
          <label>
            {tr(locale, "Text size", "حجم النص", "Textstorlek")}
            <select
              value={s.font_size}
              disabled={disabled}
              onChange={(e) =>
                update({
                  font_size: e.target.value as BookSettings["font_size"],
                })
              }
            >
              <option value="small">
                {tr(locale, "Small", "صغير", "Liten")}
              </option>
              <option value="medium">
                {tr(locale, "Medium", "متوسط", "Mellan")}
              </option>
              <option value="large">
                {tr(locale, "Large", "كبير", "Stor")}
              </option>
            </select>
          </label>
        </div>
        {(
          [
            [
              "copyright",
              "Copyright page (optional)",
              "صفحة حقوق النشر (اختيارية)",
              "Upphovsrättssida (valfri)",
            ],
            [
              "dedication",
              "Dedication (optional)",
              "الإهداء (اختياري)",
              "Dedikation (valfri)",
            ],
            [
              "author_bio",
              "About the author (optional)",
              "نبذة عن المؤلف (اختيارية)",
              "Om författaren (valfritt)",
            ],
          ] as const
        ).map(([key, en, ar, sv]) => (
          <label key={key}>
            {tr(locale, en, ar, sv)}
            <textarea
              rows={3}
              maxLength={2000}
              disabled={disabled}
              value={s[key]}
              onChange={(e) => update({ [key]: e.target.value })}
            />
          </label>
        ))}
      </div>
    </details>
  );
}

export function PublicationPreview({ book }: { book: BookWithCover }) {
  const s = bookSettings(book);
  return (
    <div
      className={`publication-document publication-screen pub-font-${s.font}`}
      lang={book.language}
      dir={book.language === "ar" ? "rtl" : "ltr"}
      style={{ fontSize: `${publicationFontSize(book)}pt` }}
      dangerouslySetInnerHTML={{
        __html: publicationBody(
          book,
          book.use_artwork ? book.cover_url || undefined : undefined,
        ),
      }}
    />
  );
}

export function ReviewPanel({
  locale,
  job,
  disabled,
  available,
  generate,
  onChapter,
}: {
  locale: Locale;
  job: Job | null;
  disabled: boolean;
  available: boolean;
  generate: Generate;
  onChapter: (id: string) => void;
}) {
  const result =
    job?.status === "completed" && job.result?.type === "review"
      ? job.result
      : null;
  return (
    <section className="editorial-review">
      <div className="review-heading">
        <div>
          <h3>
            <ShieldCheck size={19} />
            {tr(
              locale,
              "Editorial review",
              "مراجعة الكتاب",
              "Redaktionell granskning",
            )}
          </h3>
          <p className="muted">
            {tr(
              locale,
              "Check structure, repetition and continuity. For long chapters, the review uses summaries and excerpts.",
              "راجع البناء والتكرار والاستمرارية. تعتمد مراجعة الفصول الطويلة على ملخصات ومقتطفات.",
              "Granska struktur, upprepningar och kontinuitet. Långa kapitel granskas med sammanfattningar och utdrag.",
            )}
          </p>
        </div>
        <button
          className="button button-outline button-small"
          disabled={disabled || !available}
          onClick={() => generate("review", undefined, { instruction: "" })}
        >
          <Sparkles size={15} />
          {tr(locale, "Review book", "مراجعة الكتاب", "Granska boken")}
        </button>
      </div>
      {result && (
        <div className="review-results" role="status">
          <p>{result.overview}</p>
          {result.issues.map((issue, i) => (
            <article className={`review-issue ${issue.severity}`} key={i}>
              <strong>{issue.title}</strong>
              <p>{issue.detail}</p>
              {issue.chapter_id && (
                <button
                  className="text-link"
                  onClick={() => onChapter(issue.chapter_id)}
                >
                  {tr(locale, "Open chapter", "فتح الفصل", "Öppna kapitlet")}{" "}
                  <ArrowRight size={14} />
                </button>
              )}
            </article>
          ))}
          {result.strengths.length > 0 && (
            <ul>
              {result.strengths.map((value, i) => (
                <li key={i}>{value}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
