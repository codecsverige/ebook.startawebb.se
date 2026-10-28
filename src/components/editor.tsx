"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ListTree,
  FileText,
  Palette,
  Eye,
  Save,
  Loader2,
  Sparkles,
  Check,
  Download,
  RotateCcw,
  History,
  Trash2,
  Coins,
  BookOpen,
  ChevronRight,
  Bold as BoldIcon,
  Heading2,
  List as ListIcon,
  Maximize2,
  Minimize2,
} from "lucide-react";
import { BookCover } from "./book-cover";
import { Markdown } from "./markdown";
import { Dialog } from "./dialog";
import { CreditPacks } from "./credit-packs";
import { copy, errorMessage, tr } from "@/lib/i18n";
import { request, codeOf } from "@/lib/client";
import { allowStudioNavigation } from "@/lib/navigation";
import {
  bookWords,
  coverStyles,
  recommendedCoverStyles,
  type CoverStyle,
  isArabicBrief,
  languageNames,
  isComplete,
  filename,
  type BookWithCover,
  type Book,
  type Locale,
  type Job,
  type JobKind,
} from "@/lib/domain";

const coverNames: Record<CoverStyle, [string, string, string]> = {
  cobalt: ["Cobalt", "أزرق كلاسيكي", "Kobolt"],
  sage: ["Sage", "أخضر هادئ", "Salvia"],
  clay: ["Clay", "طيني", "Lera"],
  midnight: ["Midnight", "منتصف الليل", "Midnatt"],
  plum: ["Plum", "برقوقي", "Plommon"],
  ivory: ["Ivory", "عاجي", "Elfenben"],
  forest: ["Forest", "غابة", "Skog"],
  ember: ["Ember", "جمر", "Glöd"],
  lagoon: ["Lagoon", "بحيرة", "Lagun"],
  rose: ["Rose", "وردي", "Ros"],
  noir: ["Noir", "أسود فاخر", "Noir"],
  sky: ["Sky", "سماء", "Himmel"],
  gold: ["Gold", "ذهبي", "Guld"],
  teal: ["Teal", "تركوازي", "Petrol"],
  berry: ["Berry", "توتي", "Bär"],
  sand: ["Sand", "رملي", "Sand"],
  ink: ["Ink", "حبر", "Bläck"],
  sunrise: ["Sunrise", "شروق", "Soluppgång"],
};

type Version = {
  id: string;
  created_at: string;
  title: string;
  has_outline: boolean;
};
type Tab = "outline" | "write" | "design" | "preview";
export function Editor({
  id,
  locale,
  config,
}: {
  id: string;
  locale: Locale;
  config: { ai: boolean; billing: boolean; artwork: boolean; ownerTrial: boolean };
}) {
  const t = copy[locale];
  const [book, setBook] = useState<BookWithCover | null>(null);
  const [draft, setDraft] = useState<BookWithCover | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [credits, setCredits] = useState(0);
  const [tab, setTab] = useState<Tab>("outline");
  const [chapterId, setChapterId] = useState("");
  const [restartLanguage, setRestartLanguage] = useState<Locale>(locale);
  const [coverCandidate, setCoverCandidate] = useState<File | null>(null);
  const [read, setRead] = useState(false);
  const [fullscreenEditor, setFullscreenEditor] = useState(false);
  const chapterEditorRef = useRef<HTMLTextAreaElement | null>(null);
  const [pending, setPending] = useState("");
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [dirty, setDirty] = useState(false);
  const dirtyRef = useRef(false);
  const mounted = useRef(true);
  const [modal, setModal] = useState<"credits" | "history" | null>(null);
  const [versions, setVersions] = useState<Version[]>([]);
  const busy = !!job && ["queued", "running"].includes(job.status);
  const disabled = busy || !!pending;
  const load = useCallback(async () => {
    try {
      const d = await request<{
        book: BookWithCover;
        job: Job | null;
        credits: number;
      }>(`/api/books/${id}`);
      if (!mounted.current) return;
      setBook(d.book);
      if (!dirtyRef.current) setDraft(d.book);
      setRestartLanguage(isArabicBrief(d.book.idea) ? "ar" : d.book.language);
      setJob(d.job);
      setCredits(d.credits);
      setChapterId((old) => old || d.book.outline[0]?.id || "");
      setLoadError("");
    } catch (e) {
      if (mounted.current) setLoadError(codeOf(e));
    }
  }, [id]);
  useEffect(() => {
    mounted.current = true;
    void load();
    return () => {
      mounted.current = false;
    };
  }, [load]);
  useEffect(() => {
    if (!busy) return;
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 2500);
    const visible = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", visible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [busy, load]);
  useEffect(() => {
    const guard = (e: BeforeUnloadEvent) => {
      if (dirtyRef.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    const askBeforeNavigation = (e: Event) => {
      if (
        dirtyRef.current &&
        !window.confirm(
          tr(
            locale,
            "Leave without saving your changes?",
            "المغادرة دون حفظ تعديلاتك؟",
            "Lämna utan att spara ändringarna?",
          ),
        )
      )
        e.preventDefault();
    };
    const guardLink = (e: MouseEvent) => {
      if (
        !dirtyRef.current ||
        e.defaultPrevented ||
        e.button !== 0 ||
        e.metaKey ||
        e.ctrlKey ||
        e.shiftKey ||
        e.altKey
      )
        return;
      const anchor =
        e.target instanceof Element
          ? e.target.closest<HTMLAnchorElement>("a[href]")
          : null;
      if (
        !anchor ||
        anchor.target === "_blank" ||
        anchor.hasAttribute("download")
      )
        return;
      const destination = new URL(anchor.href, window.location.href);
      if (!["https:", "http:"].includes(destination.protocol)) return;
      if (
        destination.origin === location.origin &&
        destination.pathname === location.pathname &&
        destination.search === location.search
      )
        return;
      if (!allowStudioNavigation()) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", guard);
    window.addEventListener("ebook:before-navigation", askBeforeNavigation);
    document.addEventListener("click", guardLink, true);
    return () => {
      window.removeEventListener("beforeunload", guard);
      window.removeEventListener(
        "ebook:before-navigation",
        askBeforeNavigation,
      );
      document.removeEventListener("click", guardLink, true);
    };
  }, [locale]);
  function change(fn: (b: BookWithCover) => BookWithCover) {
    setDraft((b) => (b ? fn(b) : b));
    dirtyRef.current = true;
    setDirty(true);
  }
  function formatSelection(kind: "bold" | "heading" | "list") {
    const editor = chapterEditorRef.current;
    const selectedChapter = draft?.outline.find((item) => item.id === chapterId)
      || draft?.outline[0];
    if (!editor || !selectedChapter || !draft?.chapters[selectedChapter.id]) return;
    const value = draft.chapters[selectedChapter.id].content;
    const from = editor.selectionStart;
    const to = editor.selectionEnd;
    const selected = value.slice(from, to);
    let prefix = "";
    let suffix = "";
    if (kind === "bold") {
      prefix = "**";
      suffix = "**";
    } else if (kind === "heading") {
      prefix = (from > 0 && value[from - 1] !== "\n" ? "\n" : "") + "## ";
    } else {
      prefix = (from > 0 && value[from - 1] !== "\n" ? "\n" : "") + "- ";
    }
    const updated = value.slice(0, from) + prefix + (selected || " ") + suffix + value.slice(to);
    if (updated.length > 30000) return;
    change((b) => ({
      ...b,
      chapters: {
        ...b.chapters,
        [selectedChapter.id]: { ...b.chapters[selectedChapter.id], content: updated },
      },
    }));
    requestAnimationFrame(() => {
      editor.focus();
      editor.setSelectionRange(from + prefix.length, from + prefix.length + (selected || " ").length);
    });
  }
  async function save(): Promise<boolean> {
    if (!draft || !dirtyRef.current) return true;
    setPending("save");
    setError("");
    try {
      const d = await request<{ book: BookWithCover }>(`/api/books/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          revision: draft.revision,
          title: draft.title,
          subtitle: draft.subtitle,
          author: draft.author,
          cover_style: draft.cover_style,
          use_artwork: draft.use_artwork,
          outline: draft.outline,
          chapters: draft.chapters,
        }),
      });
      setBook(d.book);
      setDraft(d.book);
      dirtyRef.current = false;
      setDirty(false);
      return true;
    } catch (e) {
      setError(codeOf(e));
      return false;
    } finally {
      setPending("");
    }
  }
  async function generate(kind: JobKind, chapter?: string) {
    if (!draft) return;
    if (
      kind === "chapter" &&
      draft.chapters[chapter || ""] &&
      !window.confirm(t.regenerateConfirm)
    )
      return;
    if (dirtyRef.current && !(await save())) return;
    setPending("generate");
    setError("");
    try {
      const d = await request<{ job: Job }>(`/api/books/${id}/generate`, {
        method: "POST",
        body: JSON.stringify({
          kind,
          chapter_id: chapter,
          request_id: crypto.randomUUID(),
        }),
      });
      setJob(d.job);
      await load();
    } catch (e) {
      const code = codeOf(e);
      setError(code);
      if (config.billing && (code === "insufficient_credits" || code === "free_preview_used"))
        setModal("credits");
      if (code === "busy") await load();
    } finally {
      setPending("");
    }
  }
  async function restartManuscript() {
    if (!book || !draft || disabled) return;
    const message = tr(
      locale,
      "Start this book again in the selected language? Existing chapters, title and cover will be replaced. Your current manuscript is kept in version history.",
      "هل تريد البدء من جديد باللغة المختارة؟ سيُمسح العنوان والفصول والغلاف من النسخة الحالية، وتبقى نسختك السابقة محفوظة في سجل الإصدارات.",
      "Starta om boken på valt språk? Befintlig titel, kapitel och omslag ersätts. Den gamla versionen finns kvar i versionshistoriken.",
    );
    if (!window.confirm(message)) return;
    setPending("restart");
    setError("");
    try {
      const { book: fresh } = await request<{ book: BookWithCover }>(`/api/books/${id}`, {
        method: "POST",
        body: JSON.stringify({
          action: "restart",
          revision: book.revision,
          language: restartLanguage,
        }),
      });
      setBook(fresh);
      setDraft(fresh);
      setJob(null);
      setChapterId("");
      setTab("outline");
      setCoverCandidate(null);
      dirtyRef.current = false;
      setDirty(false);
    } catch (e) {
      setError(codeOf(e));
    } finally {
      setPending("");
    }
  }
  async function clearCoverArtwork() {
    if (!book || disabled || !book.cover_path) return;
    let revision = book.revision;
    if (dirtyRef.current) {
      if (!(await save())) return;
      revision++;
    }
    setPending("clear-cover");
    setError("");
    try {
      const { book: updated } = await request<{ book: BookWithCover }>(
        `/api/books/${id}/cover`,
        { method: "DELETE", body: JSON.stringify({ revision }) },
      );
      setBook(updated);
      setDraft(updated);
      setCoverCandidate(null);
      dirtyRef.current = false;
      setDirty(false);
    } catch (e) {
      setError(codeOf(e));
    } finally {
      setPending("");
    }
  }
  async function remove() {
    if (!window.confirm(t.deleteBook)) return;
    setPending("delete");
    setError("");
    try {
      await request(`/api/books/${id}`, { method: "DELETE" });
      window.location.assign(`/${locale}/studio`);
    } catch (e) {
      setError(codeOf(e));
      setPending("");
    }
  }
  async function history() {
    setPending("history");
    setError("");
    try {
      const d = await request<{ versions: Version[] }>(
        `/api/books/${id}/versions`,
      );
      setVersions(d.versions.filter((v) => v.has_outline));
      setModal("history");
    } catch (e) {
      setError(codeOf(e));
    } finally {
      setPending("");
    }
  }
  async function restore(version: Version) {
    if (
      !window.confirm(
        tr(
          locale,
          "Restore this saved text and outline? Save to apply it. Current artwork stays in place.",
          "استعادة النص والفهرس المحفوظين؟ اضغط حفظ لتطبيقهما. تبقى صورة الغلاف الحالية.",
          "Återställa sparad text och disposition? Spara för att tillämpa. Nuvarande omslagsbild behålls.",
        ),
      )
    )
      return;
    setPending("restore");
    setError("");
    try {
      const { snapshot } = await request<{ snapshot: Book }>(
        `/api/books/${id}/versions?version=${version.id}`,
      );
      change((b) => ({
        ...b,
        title: snapshot.title,
        subtitle: snapshot.subtitle,
        author: snapshot.author,
        cover_style: snapshot.cover_style,
        outline: snapshot.outline,
        chapters: snapshot.chapters,
      }));
      setModal(null);
    } catch (e) {
      setError(codeOf(e));
    } finally {
      setPending("");
    }
  }
  async function uploadCover(file: File) {
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
        file.size > 3_000_000) {
      setError("invalid_input");
      return;
    }
    if (dirtyRef.current && !(await save())) return;
    setPending("upload-cover");
    setError("");
    try {
      const response = await fetch("/api/books/" + id + "/cover/upload", {
        method: "POST", cache: "no-store",
        headers: { "Content-Type": file.type },
        body: file,
      });
      const payload = await response.json().catch(() => ({ error: "service_error" }));
      if (!response.ok) {
        setError(payload.error || "service_error");
        return;
      }
      setBook(payload.book as BookWithCover);
      setDraft(payload.book as BookWithCover);
      setCoverCandidate(null);
    } catch {
      setError("service_error");
    } finally {
      setPending("");
    }
  }
  async function download(format: "pdf" | "docx" | "epub") {
    if (dirtyRef.current && !(await save())) return;
    setPending(format);
    setError("");
    try {
      const res = await fetch(`/api/books/${id}/export?format=${format}`, {
        cache: "no-store",
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "service_error");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${filename(draft?.title || "ebook")}.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "service_error");
    } finally {
      setPending("");
    }
  }
  if (!book || !draft)
    return (
      <div className="container empty-state">
        {loadError ? (
          <>
            <p className="error-message" role="alert">
              {errorMessage(loadError, locale)}
            </p>
            <button
              className="button button-outline"
              onClick={() => void load()}
            >
              {t.retry}
            </button>
            <Link href={`/${locale}/studio`}>{t.back}</Link>
          </>
        ) : (
          <>
            <Loader2 className="spin" />
            <p>{t.loading}</p>
          </>
        )}
      </div>
    );
  const active =
    draft.outline.find((c) => c.id === chapterId) || draft.outline[0];
  const current = active ? draft.chapters[active.id] : null;
  const complete = isComplete(book);
  const canExport = complete && book.unlocked && !busy;
  return (
    <div className="editor-shell">
      <div className="editor-topbar">
        <Link className="text-link" href={`/${locale}/studio`}>
          <ArrowLeft size={17} />
          <span>{t.back}</span>
        </Link>
        <div className="editor-top-actions">
          <span className={`save-status ${dirty ? "is-dirty" : ""}`}>
            {pending === "save" ? (
              <Loader2 size={14} className="spin" />
            ) : dirty ? (
              <span className="dirty-dot" />
            ) : (
              <Check size={14} />
            )}{" "}
            {pending === "save" ? t.saving : dirty ? t.unsaved : t.saved}
          </span>
          <button
            className="icon-button"
            onClick={history}
            disabled={disabled}
            aria-label={t.savedHistory}
          >
            <History size={18} />
          </button>
          <button
            className="icon-button danger-icon"
            onClick={remove}
            disabled={disabled}
            aria-label={t.delete}
          >
            <Trash2 size={17} />
          </button>
          <button
            className="button button-small button-ink"
            onClick={() => void save()}
            disabled={disabled || !dirty}
          >
            <Save size={15} />
            {t.save}
          </button>
        </div>
      </div>
      <div className="editor-layout">
        <aside className="editor-sidebar">
          <div className="sidebar-book-title">
            <span className="small-label">{t[draft.kind]}</span>
            <h1>
              {draft.title ||
                tr(locale, "Your next book", "كتابك القادم", "Din nästa bok")}
            </h1>
            <span className="status-tag">
              {book.unlocked ? t.unlocked : config.ownerTrial ? tr(locale, "Free trial", "تجربة مجانية", "Gratis test") : t.sampleBadge}
            </span>
          </div>
          <nav className="editor-tabs" aria-label={t.studio}>
            {(
              [
                { id: "outline", icon: ListTree },
                { id: "write", icon: FileText },
                { id: "design", icon: Palette },
                { id: "preview", icon: Eye },
              ] as const
            ).map(({ id: tabId, icon: Icon }, i) => (
              <button
                className={tab === tabId ? "active" : ""}
                key={tabId}
                onClick={() => setTab(tabId)}
                disabled={!draft.outline.length && tabId !== "outline"}
                aria-current={tab === tabId ? "page" : undefined}
              >
                <span className="tab-number">0{i + 1}</span>
                <Icon size={17} />
                <span>{t[tabId]}</span>
                <ChevronRight className="tab-chevron" size={15} />
              </button>
            ))}
          </nav>
          <div className="sidebar-stats">
            <BookOpen size={18} />
            <div>
              <strong>
                {Object.keys(book.chapters).length}/{book.chapter_count}
              </strong>{" "}
              {t.chapters}
              <small>
                {bookWords(book).toLocaleString(locale)} {t.words}
              </small>
            </div>
          </div>
          {config.billing ? (
            <button
              className="credit-pill sidebar-credits"
              onClick={() => setModal("credits")}
            >
              <Coins size={16} />
              <b>{credits}</b> {t.credits}
            </button>
          ) : config.ownerTrial ? (
            <span className="status-tag sidebar-credits">{tr(locale, "Free private testing", "اختبار مجاني خاص", "Gratis privat test")}</span>
          ) : null}
          <p className="sidebar-note">{t.reviewNote}</p>
        </aside>
        <div className="editor-main">
          {(error || loadError) && (
            <div className="error-message" role="alert">
              {errorMessage(error || loadError, locale)}
            </div>
          )}
          {busy && (
            <div className="generation-banner" role="status">
              <div>
                <span className="generation-icon">
                  <Sparkles size={19} />
                </span>
                <div>
                  <strong>{t.generating}</strong>
                  <p>{t.background}</p>
                </div>
                <b>{job.progress}%</b>
              </div>
              <div
                className="progress-track"
                role="progressbar"
                aria-label={t.progress}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={job.progress}
              >
                <span style={{ width: `${Math.max(4, job.progress)}%` }} />
              </div>
            </div>
          )}
          {job?.status === "failed" && !busy && (
            <div className="notice" role="alert">
              <p>{errorMessage(job.error_code || "generation_failed", locale)}</p>
              {config.ai && ["chapter", "book", "sample", "outline"].includes(job.kind) && (
                <button
                  type="button"
                  className="button button-small button-outline"
                  disabled={disabled}
                  onClick={() => void generate(job.kind, job.chapter_id || undefined)}
                >
                  <RotateCcw size={15} />
                  {tr(locale, "Retry generation", "إعادة محاولة التوليد", "Försök generera igen")}
                </button>
              )}
            </div>
          )}
          {tab === "outline" && (
            <section className="editor-panel">
              <div className="panel-heading">
                <span className="eyebrow">01 / {t.outline}</span>
                <h2>
                  {draft.outline.length
                    ? t.outline
                    : tr(
                        locale,
                        "Let’s give your idea a structure.",
                        "لنمنح فكرتك شكلًا واضحًا.",
                        "Ge din idé en struktur.",
                      )}
                </h2>
                <p>{draft.outline.length ? t.outlineHint : t.briefBody}</p>
              </div>

              <div className="restart-tools" dir={locale === "ar" ? "rtl" : "ltr"}>
                <div>
                  <strong>{tr(locale, "Book language", "لغة الكتاب", "Bokens språk")}</strong>
                  <p>{tr(locale, "Current language", "اللغة الحالية", "Nuvarande språk")}: {languageNames[book.language]}</p>
                  {isArabicBrief(book.idea) && book.language !== "ar" && (
                    <p className="language-warning" role="alert">
                      {tr(locale, "Your idea is Arabic but this book is set to another language. Restart it in Arabic to correct its contents.", "طلبك مكتوب بالعربية لكن لغة هذا الكتاب ليست العربية. اختر العربية وأعد إنشاء الفهرس والفصول.", "Bokidén är på arabiska men bokens språk är ett annat. Starta om den på arabiska.")}
                    </p>
                  )}
                </div>
                <label>
                  <span className="sr-only">{t.bookLanguage}</span>
                  <select value={restartLanguage} disabled={disabled} onChange={(e) => setRestartLanguage(e.target.value as Locale)}>
                    <option value="ar">العربية</option>
                    <option value="en">English</option>
                    <option value="sv">Svenska</option>
                  </select>
                </label>
                <button
                  type="button"
                  className="button button-outline button-small"
                  disabled={disabled}
                  onClick={() => void restartManuscript()}
                >
                  <RotateCcw size={17} />
                  {tr(locale, "Restart this book", "إعادة إنشاء الكتاب من البداية", "Starta om boken")}
                </button>
              </div>
              {draft.outline.length === 0 ? (
                <div className="brief-summary">
                  <span className="small-label">{t.idea}</span>
                  <p>{draft.idea}</p>
                  <dl>
                    <div>
                      <dt>{t.audience}</dt>
                      <dd>{draft.audience}</dd>
                    </div>
                    <div>
                      <dt>{t.chapters}</dt>
                      <dd>{draft.chapter_count}</dd>
                    </div>
                  </dl>
                  <button
                    className="button button-primary"
                    onClick={() => generate("outline")}
                    disabled={disabled || !config.ai}
                  >
                    {pending === "generate" ? (
                      <Loader2 size={17} className="spin" />
                    ) : (
                      <Sparkles size={17} />
                    )}{" "}
                    {t.createOutline}
                  </button>
                  {!config.ai && <p className="notice">{t.setupBody}</p>}
                </div>
              ) : (
                <>
                  <div
                    className="stack book-title-fields"
                    dir={draft.language === "ar" ? "rtl" : "ltr"}
                  >
                    <label>
                      {t.title}
                      <input
                        value={draft.title}
                        maxLength={180}
                        required
                        disabled={disabled}
                        onChange={(e) =>
                          change((b) => ({ ...b, title: e.target.value }))
                        }
                      />
                    </label>
                    <label>
                      {t.subtitle}
                      <input
                        value={draft.subtitle}
                        maxLength={240}
                        disabled={disabled}
                        onChange={(e) =>
                          change((b) => ({ ...b, subtitle: e.target.value }))
                        }
                      />
                    </label>
                  </div>
                  <div className="outline-list">
                    {draft.outline.map((c, i) => (
                      <div className="outline-item" key={c.id}>
                        <span className="outline-number">
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        <div
                          className="stack"
                          dir={draft.language === "ar" ? "rtl" : "ltr"}
                        >
                          <label>
                            <span className="sr-only">
                              {t.chapterTitle} {i + 1}
                            </span>
                            <input
                              value={c.title}
                              maxLength={160}
                              disabled={disabled}
                              onChange={(e) =>
                                change((b) => ({
                                  ...b,
                                  outline: b.outline.map((x) =>
                                    x.id === c.id
                                      ? { ...x, title: e.target.value }
                                      : x,
                                  ),
                                }))
                              }
                            />
                          </label>
                          <label>
                            <span className="sr-only">
                              {t.chapterBrief} {i + 1}
                            </span>
                            <textarea
                              value={c.summary}
                              maxLength={600}
                              rows={4}
                              disabled={disabled}
                              onChange={(e) =>
                                change((b) => ({
                                  ...b,
                                  outline: b.outline.map((x) =>
                                    x.id === c.id
                                      ? { ...x, summary: e.target.value }
                                      : x,
                                  ),
                                }))
                              }
                            />
                          </label>
                        </div>
                        {draft.chapters[c.id] && (
                          <Check className="chapter-check" size={17} />
                        )}
                      </div>
                    ))}
                  </div>
                  <div className="editor-bottom-actions">
                    {!draft.chapters[draft.outline[0].id] && (
                      <button
                        className="button button-outline"
                        disabled={disabled || !config.ai}
                        onClick={() => {
                          setTab("write");
                          void generate("sample");
                        }}
                      >
                        <Sparkles size={17} />
                        {t.sample}
                      </button>
                    )}
                    <button
                      className="button button-primary"
                      disabled={disabled || !config.ai || complete}
                      onClick={() => {
                        setTab("write");
                        void generate("book");
                      }}
                    >
                      <BookOpen size={17} />
                      {book.unlocked
                        ? Object.keys(book.chapters).length
                          ? t.resume
                          : t.generateBook
                        : config.ownerTrial ? tr(locale, "Generate complete book for free", "توليد الكتاب كاملًا مجانًا", "Skapa hela boken gratis") : t.unlock}
                    </button>
                  </div>
                </>
              )}
            </section>
          )}
          {tab === "write" && (
            <section className="editor-panel chapter-panel">
              <div className="panel-heading">
                <span className="eyebrow">02 / {t.write}</span>
                <h2>{t.write}</h2>
              </div>
              <label className="chapter-selector">
                <span className="sr-only">{t.chapters}</span>
                <select
                  value={active?.id || ""}
                  onChange={(e) => setChapterId(e.target.value)}
                >
                  {draft.outline.map((c, i) => (
                    <option key={c.id} value={c.id}>
                      {i + 1}. {c.title} {draft.chapters[c.id] ? "✓" : ""}
                    </option>
                  ))}
                </select>
              </label>
              <div className="chapter-toolbar">
                <div className="segmented">
                  <button
                    className={!read ? "selected" : ""}
                    onClick={() => setRead(false)}
                  >
                    {t.editing}
                  </button>
                  <button
                    className={read ? "selected" : ""}
                    onClick={() => setRead(true)}
                  >
                    {t.reading}
                  </button>
                </div>
                {active && (
                  <button
                    className="text-link"
                    disabled={disabled || !config.ai}
                    onClick={() =>
                      generate(
                        book.unlocked
                          ? "chapter"
                          : !current && active.id === draft.outline[0]?.id
                            ? "sample"
                            : "book",
                        active.id,
                      )
                    }
                  >
                    <RotateCcw size={15} />
                    {!book.unlocked &&
                    (current || active.id !== draft.outline[0]?.id)
                      ? t.unlock
                      : current
                        ? t.regenerate
                        : t.generate}
                  </button>
                )}
              </div>
              <h3
                className="current-chapter-title"
                dir={draft.language === "ar" ? "rtl" : "ltr"}
              >
                {active?.title}
              </h3>
              {current ? (
                read ? (
                  <div
                    className="chapter-read"
                    dir={draft.language === "ar" ? "rtl" : "ltr"}
                    lang={draft.language}
                  >
                    <Markdown text={current.content} />
                  </div>
                ) : (
                  <label className={fullscreenEditor ? "chapter-edit-wrap is-fullscreen" : "chapter-edit-wrap"}>
                    <span className="sr-only">{t.content}</span>
                    <span className="chapter-format-toolbar" role="toolbar" aria-label={tr(locale, "Text formatting", "تنسيق النص", "Textformatering")}>
                      <button type="button" disabled={disabled} aria-label={tr(locale, "Bold", "غامق", "Fetstil")} title={tr(locale, "Bold", "غامق", "Fetstil")} onClick={() => formatSelection("bold")}><BoldIcon size={18}/></button>
                      <button type="button" disabled={disabled} aria-label={tr(locale, "Heading", "عنوان فرعي", "Rubrik")} title={tr(locale, "Heading", "عنوان فرعي", "Rubrik")} onClick={() => formatSelection("heading")}><Heading2 size={18}/></button>
                      <button type="button" disabled={disabled} aria-label={tr(locale, "List", "قائمة", "Lista")} title={tr(locale, "List", "قائمة", "Lista")} onClick={() => formatSelection("list")}><ListIcon size={18}/></button>
                      <span className="chapter-format-spacer"/>
                      <span className="chapter-word-count">{current.content.trim().split(/\s+/u).filter(Boolean).length.toLocaleString(locale)} {t.words}</span>
                      <button type="button" aria-label={fullscreenEditor ? tr(locale, "Close full-screen editor", "إغلاق وضع الشاشة الكاملة", "Stäng helskärm") : tr(locale, "Full-screen editor", "تحرير بملء الشاشة", "Helskärmsredigering")} title={tr(locale, "Full-screen editor", "تحرير بملء الشاشة", "Helskärmsredigering")} onClick={() => setFullscreenEditor(v => !v)}>{fullscreenEditor ? <Minimize2 size={18}/> : <Maximize2 size={18}/>}</button>
                    </span>
                    <textarea
                      ref={chapterEditorRef}
                      className="chapter-editor"
                      dir={draft.language === "ar" ? "rtl" : "ltr"}
                      lang={draft.language}
                      value={current.content}
                      maxLength={30000}
                      disabled={disabled}
                      onChange={(e) => {
                        if (active)
                          change((b) => ({
                            ...b,
                            chapters: {
                              ...b.chapters,
                              [active.id]: {
                                ...b.chapters[active.id],
                                content: e.target.value,
                              },
                            },
                          }));
                      }}
                    />
                  </label>
                )
              ) : (
                <div className="chapter-empty">
                  <PencilIcon />
                  <p>{t.chapterEmpty}</p>
                  <button
                    className="button button-primary"
                    disabled={disabled || !config.ai}
                    onClick={() =>
                      generate(
                        book.unlocked
                          ? "chapter"
                          : active?.id === draft.outline[0]?.id
                            ? "sample"
                            : "book",
                        active?.id,
                      )
                    }
                  >
                    <Sparkles size={17} />
                    {book.unlocked || active?.id === draft.outline[0]?.id
                      ? t.generate
                      : t.unlock}
                  </button>
                </div>
              )}
              <div className="editor-bottom-actions">
                <p className="muted">
                  {book.unlocked ? t.background : config.ownerTrial ? tr(locale, "Your private test: generate a full book without buying credits.", "تجربتك الخاصة: أنشئ كتابًا كاملًا دون شراء رصيد.", "Din privata test: skapa en hel bok utan att köpa krediter.") : t.unlockBody}
                </p>
                {!complete && (
                  <button
                    className="button button-primary"
                    disabled={disabled || !config.ai}
                    onClick={() => generate("book")}
                  >
                    <BookOpen size={17} />
                    {book.unlocked ? t.resume : config.ownerTrial ? tr(locale, "Generate complete book for free", "توليد الكتاب كاملًا مجانًا", "Skapa hela boken gratis") : t.unlock}
                  </button>
                )}
              </div>
            </section>
          )}
          {tab === "design" && (
            <section className="editor-panel">
              <div className="panel-heading">
                <span className="eyebrow">03 / {t.design}</span>
                <h2>{t.designTitle}</h2>
                <p>{t.designBody}</p>
              </div>
              <div className="design-layout">
                <div className="design-cover">
                  <BookCover
                    title={draft.title}
                    subtitle={draft.subtitle}
                    author={draft.author}
                    style={draft.cover_style}
                    language={draft.language}
                    image={draft.use_artwork ? draft.cover_url : null}
                  />
                </div>
                <div className="stack">
                  <fieldset className="cover-gallery" disabled={disabled}>
                    <legend>{tr(locale, "Choose a professionally designed cover", "اختر تصميم الغلاف المناسب لكتابك", "Välj ett professionellt bokomslag")}</legend>
                    <p className="muted">{tr(locale, "18 templates. Suggested designs for your book type come first. No AI credits needed.", "18 تصميمًا. تظهر التصاميم المناسبة لنوع كتابك أولًا، وتغييرها لا يستهلك الذكاء الاصطناعي.", "18 omslagsmallar. Rekommendationerna för din boktyp visas först. Ingen AI-kostnad.")}</p>
                    <div className="cover-template-grid">
                      {[...recommendedCoverStyles(draft.kind), ...coverStyles.filter((style) => !recommendedCoverStyles(draft.kind).includes(style))].map((style, index) => (
                        <button
                          type="button"
                          className={`cover-template-card ${draft.cover_style === style ? "is-selected" : ""}`}
                          key={style}
                          aria-pressed={draft.cover_style === style}
                          aria-label={tr(locale, ...coverNames[style])}
                          disabled={disabled}
                          onClick={() => change((b) => ({ ...b, cover_style: style }))}
                        >
                          <BookCover
                            title={draft.title || tr(locale, "Your book", "كتابك", "Din bok")}
                            subtitle=""
                            author=""
                            style={style}
                            language={draft.language}
                            small
                          />
                          <span className="cover-template-name">{tr(locale, ...coverNames[style])}</span>
                          {index < 5 && (
                            <span className="cover-template-hint">{tr(locale, "Suggested", "مقترح", "Förslag")}</span>
                          )}
                          {draft.cover_style === style && <Check className="cover-template-selected" size={18} />}
                        </button>
                      ))}
                    </div>
                  </fieldset>
                  <label>
                    {t.author}
                    <input
                      maxLength={100}
                      value={draft.author}
                      disabled={disabled}
                      onChange={(e) =>
                        change((b) => ({ ...b, author: e.target.value }))
                      }
                    />
                  </label>
                  <button
                    className="button button-outline"
                    disabled={
                      disabled ||
                      !config.ai ||
                      !config.artwork ||
                      !book.unlocked
                    }
                    onClick={() => generate("cover")}
                  >
                    <Sparkles size={17} />
                    {t.aiCover}
                  </button>
                  <p className="muted">{t.artworkNote}</p>
                  <label className="cover-upload-label">
                    <span>{tr(locale, "Or upload your own cover image (PNG, JPG or WebP, max 3 MB)", "أو ارفع صورة غلاف من هاتفك (PNG أو JPG أو WebP، بحد 3 ميغابايت)", "Eller ladda upp en egen omslagsbild (PNG, JPG eller WebP, max 3 MB)")}</span>
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      disabled={disabled || !book.unlocked}
                      onChange={(e) => {
                        const file = e.currentTarget.files?.[0];
                        e.currentTarget.value = "";
                        if (file) {
                          if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
                              file.size > 3_000_000) {
                            setError("invalid_input");
                          } else {
                            setCoverCandidate(file);
                          }
                        }
                      }}
                    />
                  </label>
                  {coverCandidate && (
                    <div className="cover-confirm">
                      <strong>{tr(locale, "Review your selected image", "راجع الصورة قبل اعتمادها", "Granska vald bild")}</strong>
                      <p>{coverCandidate.name}</p>
                      <p className="muted">{tr(locale, "Choose an illustration or photo for your own book, not a screenshot of a webpage or social media.", "استخدم رسمة أو صورة مناسبة للكتاب، لا لقطة شاشة من موقع أو تطبيق.", "Välj en illustration eller bild som passar boken, inte en skärmbild från en webbplats.")}</p>
                      <div className="cover-confirm-buttons">
                        <button type="button" className="button button-primary button-small" disabled={disabled} onClick={() => void uploadCover(coverCandidate)}>
                          <Check size={15} /> {tr(locale, "Apply this image", "اعتماد هذه الصورة", "Använd bilden")}
                        </button>
                        <button type="button" className="button button-outline button-small" disabled={disabled} onClick={() => setCoverCandidate(null)}>
                          {t.cancel}
                        </button>
                      </div>
                    </div>
                  )}
                  {draft.cover_path && (
                    <button
                      type="button"
                      className="button button-outline button-small"
                      disabled={disabled}
                      onClick={() => void clearCoverArtwork()}
                    >
                      <Trash2 size={16} />
                      {tr(locale, "Remove cover image and use a clean design", "حذف صورة الغلاف واستعمال تصميم نظيف", "Ta bort omslagsbilden och använd ett rent omslag")}
                    </button>
                  )}
                  {draft.cover_path && (
                    <label className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={!draft.use_artwork}
                        disabled={disabled}
                        onChange={(e) =>
                          change((b) => ({
                            ...b,
                            use_artwork: !e.target.checked,
                          }))
                        }
                      />
                      <span>{t.removeArtwork}</span>
                    </label>
                  )}
                  {!book.unlocked && (
                    <button
                      className="text-link"
                      onClick={() => generate("book")}
                      disabled={disabled || !config.ai}
                    >
                      {config.ownerTrial ? tr(locale, "Generate book for free", "توليد الكتاب مجانًا", "Skapa boken gratis") : t.unlock}
                    </button>
                  )}
                </div>
              </div>
            </section>
          )}
          {tab === "preview" && (
            <section className="editor-panel preview-panel">
              <div className="panel-heading">
                <span className="eyebrow">04 / {t.preview}</span>
                <h2>{t.previewTitle}</h2>
                <p>{t.exportHint}</p>
              </div>
              <div className="export-buttons">
                <button
                  className="button button-primary"
                  disabled={!canExport || !!pending}
                  onClick={() => download("pdf")}
                >
                  {pending === "pdf" ? (
                    <Loader2 size={17} className="spin" />
                  ) : (
                    <Download size={17} />
                  )}{" "}
                  {t.exportPdf}
                </button>
                <button
                  className="button button-outline"
                  disabled={!canExport || !!pending}
                  onClick={() => download("docx")}
                >
                  {pending === "docx" ? (
                    <Loader2 size={17} className="spin" />
                  ) : (
                    <Download size={17} />
                  )}{" "}
                  {t.exportDocx}
                </button>
                <button
                  className="button button-outline"
                  disabled={!canExport || !!pending}
                  onClick={() => download("epub")}
                >
                  {pending === "epub" ? <Loader2 size={17} className="spin" /> : <Download size={17} />}{" "}
                  {t.exportEpub}
                </button>
              </div>
              <div
                className="book-preview"
                dir={draft.language === "ar" ? "rtl" : "ltr"}
                lang={draft.language}
              >
                <div className="preview-cover">
                  <BookCover
                    title={draft.title}
                    subtitle={draft.subtitle}
                    author={draft.author}
                    style={draft.cover_style}
                    language={draft.language}
                    image={draft.use_artwork ? draft.cover_url : null}
                  />
                </div>
                <section className="preview-toc">
                  <h2>
                    {tr(draft.language, "Contents", "الفهرس", "Innehåll")}
                  </h2>
                  {draft.outline.map((c, i) => (
                    <p key={c.id}>
                      <span>{String(i + 1).padStart(2, "0")}</span>
                      {c.title}
                    </p>
                  ))}
                </section>
                {draft.outline.map((c, i) => (
                  <article className="preview-chapter" key={c.id}>
                    <span className="small-label">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <h2>{c.title}</h2>
                    {draft.chapters[c.id] ? (
                      <Markdown text={draft.chapters[c.id].content} />
                    ) : (
                      <p className="muted">{t.chapterEmpty}</p>
                    )}
                  </article>
                ))}
              </div>
              <p className="review-note">{t.reviewNote}</p>
            </section>
          )}
        </div>
      </div>
      {modal && (
        <Dialog
          title={modal === "credits" ? t.buyCredits : t.savedHistory}
          closeLabel={t.cancel}
          onClose={() => setModal(null)}
        >
          {modal === "credits" ? (
            <CreditPacks locale={locale} enabled={config.billing} />
          ) : (
            <div className="version-list">
              {versions.length === 0 ? (
                <p>{t.noHistory}</p>
              ) : (
                versions.map((v) => (
                  <div key={v.id}>
                    <div>
                      <strong>
                        {new Date(v.created_at).toLocaleString(locale)}
                      </strong>
                      <p>{v.title}</p>
                    </div>
                    <button
                      className="button button-small button-outline"
                      disabled={pending === "restore"}
                      onClick={() => void restore(v)}
                    >
                      {t.restore}
                    </button>
                  </div>
                ))
              )}
            </div>
          )}
        </Dialog>
      )}
    </div>
  );
}
function PencilIcon() {
  return <FileText size={36} strokeWidth={1.2} />;
}
