"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BookOpen,
  Plus,
  ArrowUpRight,
  LogOut,
  Loader2,
  Coins,
  Settings2,
  MoreHorizontal,
  Trash2,
  RotateCcw,
  Pencil,
} from "lucide-react";
import { BookCover } from "./book-cover";
import { Dialog } from "./dialog";
import { CreditPacks } from "./credit-packs";
import { copy, errorMessage, tr } from "@/lib/i18n";
import {
  briefSchema,
  isArabicBrief,
  suggestedSectionUnit,
  type BookshelfBook,
  type Locale,
  type Brief,
} from "@/lib/domain";
import { request, codeOf } from "@/lib/client";
import { partLabel } from "@/lib/authoring-labels";

function inferIdeaKind(idea: string): Brief["kind"] {
  const text = idea.toLowerCase();
  const story = /قصة|قصّة|حكاية|story|tale|saga|berättelse/i.test(text);
  const young = /طفل|أطفال|الصغار|children|kids|barn/i.test(text);
  if (story && young) return "children_story";
  if (/رواية|\bnovel\b|\broman\b/i.test(text)) return "novel";
  if (/بحث علمي|دراسة بحثية|\bresearch\b|\bforskning\b/i.test(text)) return "research";
  if (/تقرير|\breport\b|\brapport\b/i.test(text)) return "report";
  if (story) return "short_story";
  return "guide";
}

export function Dashboard({
  locale,
  email,
  config,
  initialPack,
  checkoutReturned,
}: {
  locale: Locale;
  email: string;
  config: { ai: boolean; billing: boolean; ownerTrial: boolean };
  initialPack: boolean;
  checkoutReturned: boolean;
}) {
  const t = copy[locale];
  const router = useRouter();
  const [books, setBooks] = useState<BookshelfBook[]>([]);
  const [trash, setTrash] = useState<BookshelfBook[]>([]);
  const [bookAction, setBookAction] = useState<{ book: BookshelfBook; action: "trash" | "purge" | "rename" } | null>(null);
  const [actionPending, setActionPending] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");
  const [renameTitle, setRenameTitle] = useState("");
  const [credits, setCredits] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modal, setModal] = useState<"new" | "credits" | "account" | null>(
    initialPack && config.billing ? "credits" : null,
  );
  const [pending, setPending] = useState(false);
  const [languageTouched, setLanguageTouched] = useState(false);
  const [kindTouched, setKindTouched] = useState(false);
  const [unitTouched, setUnitTouched] = useState(false);
  const [brief, setBrief] = useState<Brief>({
    idea: "",
    audience: "",
    kind: "guide",
    language: locale,
    tone: "clear",
    author: "",
    chapter_count: 6,
    section_unit: "section",
  });
  const draftStorageKey = `ebook-studio:new-book:${locale}`;
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(draftStorageKey);
      if (!raw) return;
      const saved = JSON.parse(raw) as Partial<Brief>;
      setBrief((current) => ({
        ...current,
        idea: typeof saved.idea === "string" ? saved.idea.slice(0, 2000) : current.idea,
        audience: typeof saved.audience === "string" ? saved.audience.slice(0, 300) : current.audience,
        author: typeof saved.author === "string" ? saved.author.slice(0, 100) : current.author,
        kind: (["guide", "ebook", "workbook", "report", "research", "novel", "short_story", "children_story"] as string[]).includes(saved.kind || "") ? saved.kind! : current.kind,
        language: (["ar", "en", "sv"] as string[]).includes(saved.language || "") ? saved.language! : current.language,
        tone: (["clear", "friendly", "professional", "literary", "dramatic", "playful"] as string[]).includes(saved.tone || "") ? saved.tone! : current.tone,
        chapter_count: typeof saved.chapter_count === "number" && saved.chapter_count >= 1 && saved.chapter_count <= 10 ? Math.floor(saved.chapter_count) : current.chapter_count,
        section_unit: (["chapter", "page", "section"] as string[]).includes(saved.section_unit || "") ? saved.section_unit : current.section_unit,
      }));
    } catch {
      // Browsers that disable session storage still support the cloud editor.
    }
  }, [draftStorageKey]);
  useEffect(() => {
    if (!brief.idea && !brief.audience) return;
    try { sessionStorage.setItem(draftStorageKey, JSON.stringify(brief)); } catch {}
  }, [brief, draftStorageKey]);

  async function load() {
    try {
      const d = await request<{ books: BookshelfBook[]; trash: BookshelfBook[]; credits: number }>(
        "/api/books",
      );
      setBooks(d.books);
      setTrash(d.trash || []);
      setCredits(d.credits);
      setError("");
    } catch (e) {
      setError(codeOf(e));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
    if (!checkoutReturned) return;
    let n = 0;
    const timer = setInterval(() => {
      void load();
      if (++n >= 20) clearInterval(timer);
    }, 3000);
    return () => clearInterval(timer);
  }, [checkoutReturned]); // Account is fixed by the server session for this mounted workspace.
  async function create(e: React.FormEvent) {
    e.preventDefault();
    const parsed = briefSchema.safeParse({
      ...brief,
      audience: brief.audience.trim() || tr(locale, "General readers", "القراء المهتمون بالموضوع", "Allmänna läsare"),
    });
    if (!parsed.success) {
      setError("invalid_input");
      return;
    }
    setPending(true);
    setError("");
    try {
      const d = await request<{ id: string }>("/api/books", {
        method: "POST",
        body: JSON.stringify(parsed.data),
      });
      try { sessionStorage.removeItem(draftStorageKey); } catch {}
      router.push(`/${locale}/studio/${d.id}`);
    } catch (e) {
      setError(codeOf(e));
      setPending(false);
    }
  }
  function openBookAction(book: BookshelfBook, action: "trash" | "purge" | "rename") {
    setActionError("");
    setRenameTitle(book.title || clipIdea(book.idea));
    setBookAction({ book, action });
  }
  async function runBookAction(book: BookshelfBook, action: "trash" | "purge" | "rename" | "restore") {
    if (actionPending) return;
    setActionPending(book.id);
    setActionError("");
    try {
      if (action === "restore" || action === "rename") {
        await request(`/api/books/${book.id}`, {
          method: "POST",
          body: JSON.stringify(action === "restore"
            ? { action: "restore" }
            : { action: "rename", revision: book.revision, title: renameTitle.trim() }),
        });
      } else {
        await request(`/api/books/${book.id}${action === "purge" ? "?permanent=1" : ""}`, { method: "DELETE" });
      }
      setBookAction(null);
      await load();
    } catch (e) {
      const code = codeOf(e);
      setActionError(code);
      if (action === "restore") setError(code);
      if (code === "conflict") void load();
    } finally {
      setActionPending(null);
    }
  }
  async function logout() {
    setPending(true);
    try {
      await request("/api/auth", { method: "DELETE" });
      window.location.assign(`/${locale}`);
    } catch (e) {
      setError(codeOf(e));
      setPending(false);
    }
  }
  async function deleteAccount() {
    if (!window.confirm(t.deleteAccountConfirm)) return;
    setPending(true);
    try {
      await request("/api/account", {
        method: "DELETE",
        body: JSON.stringify({ confirm: "DELETE" }),
      });
      window.location.assign(`/${locale}`);
    } catch (e) {
      setError(codeOf(e));
      setPending(false);
    }
  }
  function field<K extends keyof Brief>(key: K, value: Brief[K]) {
    if (key === "language") setLanguageTouched(true);
    if (key === "kind") setKindTouched(true);
    if (key === "section_unit") setUnitTouched(true);
    const guessed = key === "idea" && !kindTouched ? inferIdeaKind(String(value)) : null;
    setBrief((b) => ({
      ...b,
      [key]: value,
      ...(key === "idea" && !languageTouched
        ? { language: isArabicBrief(String(value)) ? "ar" : locale }
        : {}),
      ...(guessed ? { kind: guessed, ...(!unitTouched ? {section_unit: suggestedSectionUnit(guessed)} : {}) } : {}),
      ...(key === "kind" && !unitTouched ? { section_unit: suggestedSectionUnit(value as Brief["kind"]) } : {}),
    }));
  }
  return (
    <div className="workspace container">
      <div className="workspace-toolbar">
        <span className="workspace-email" dir="ltr">
          {email}
        </span>
        <div className="workspace-tools">
          {config.billing ? (
            <button className="credit-pill" onClick={() => setModal("credits")}>
              <Coins size={16} />
              <b>{credits}</b> {t.credits}
              <Plus size={14} />
            </button>
          ) : config.ownerTrial ? (
            <span className="status-tag" role="status">
              {tr(locale, "Private free trial", "تجربة مجانية خاصة", "Privat gratis test")}
            </span>
          ) : null}
          <button
            className="icon-button"
            aria-label={t.settings}
            onClick={() => setModal("account")}
          >
            <Settings2 size={20} />
          </button>
          <button
            className="icon-button"
            aria-label={t.signOut}
            onClick={logout}
            disabled={pending}
          >
            <LogOut size={20} />
          </button>
        </div>
      </div>
      <div className="workspace-heading">
        <div>
          <div className="eyebrow">EBOOK STUDIO / {t.studio}</div>
          <h1>{t.workspaceTitle}</h1>
          <p>{t.workspaceBody}</p>
        </div>
        <button
          className="button button-primary"
          onClick={() => {
            setError("");
            setModal("new");
          }}
        >
          <Plus size={18} />
          {t.newBook}
        </button>
      </div>
      {!config.ai && (
        <p className="notice">
          {tr(
            locale,
            "AI generation is awaiting service activation. You can explore the workspace and save a brief.",
            "التوليد ينتظر تفعيل الخدمة. يمكنك استكشاف مساحة العمل وحفظ فكرة كتاب.",
            "AI-generering väntar på aktivering. Du kan utforska arbetsytan och spara ett bokunderlag.",
          )}
        </p>
      )}
      {checkoutReturned && (
        <div className="notice">
          {t.checkoutNote}{" "}
          <button className="text-link" onClick={() => void load()}>
            {t.retry}
          </button>
        </div>
      )}
      {error && (
        <div role="alert" className="error-message">
          {errorMessage(error, locale)}{" "}
          <button className="text-link" onClick={() => void load()}>
            {t.retry}
          </button>
        </div>
      )}
      {loading ? (
        <div className="empty-state">
          <Loader2 className="spin" />
          <p>{t.loading}</p>
        </div>
      ) : books.length === 0 ? (
        <div className="empty-state">
          <span className="empty-icon">
            <BookOpen size={34} strokeWidth={1.3} />
          </span>
          <h2>{t.emptyTitle}</h2>
          <p>{t.emptyBody}</p>
          <button className="button button-ink" onClick={() => setModal("new")}>
            <Plus size={17} />
            {t.newBook}
          </button>
        </div>
      ) : (
        <div className="bookshelf">
          {books.map((book) => (
            <div className="shelf-book" key={book.id}>
              <Link className="shelf-book-link" href={`/${locale}/studio/${book.id}`}>
                <div className={`shelf-cover wrap-${book.cover_style}`}>
                  <BookCover title={book.title || clipIdea(book.idea)}
                    subtitle={book.subtitle} author={book.author} style={book.cover_style}
                    language={book.language} image={book.use_artwork ? book.cover_url : null} small/>
                </div>
                <div className="shelf-book-meta">
                  <span className={`status-tag ${book.complete ? "tag-green" : ""}`}>
                    {book.complete ? t.ready : book.unlocked ? t.unlocked : t.draft}
                  </span>
                  <ArrowUpRight size={18}/>
                </div>
                <h2>{book.title || clipIdea(book.idea)}</h2>
                <p>{book.completed_chapters}/{book.outline.length || book.chapter_count} {partLabel(locale, book.section_unit, true)}
                  {" · "}{book.word_count.toLocaleString(locale)} {t.words}</p>
              </Link>
              <details className="shelf-book-actions">
                <summary aria-label={tr(locale, "Book options", "خيارات الكتاب", "Bokalternativ")}
                  title={tr(locale, "Manage this book", "إدارة هذا الكتاب", "Hantera boken")}>
                  <MoreHorizontal size={21}/>
                </summary>
                <div className="shelf-book-action-menu">
                  <button type="button" onClick={() => openBookAction(book, "rename")}>
                    <Pencil size={16}/>{tr(locale, "Rename", "إعادة التسمية", "Byt namn")}
                  </button>
                  <button type="button" className="action-danger" onClick={() => openBookAction(book, "trash")}>
                    <Trash2 size={16}/>{tr(locale, "Move to trash", "نقل إلى المحذوفات", "Flytta till papperskorgen")}
                  </button>
                </div>
              </details>
            </div>
          ))}
        </div>
      )}
      {!loading && trash.length > 0 && (
        <details className="bookshelf-trash">
          <summary><Trash2 size={18}/>{tr(locale, "Deleted books", "الكتب المحذوفة", "Borttagna böcker")} <span>({trash.length})</span></summary>
          <p>{tr(locale, "You can restore books here until you choose to permanently delete them. Restoring requires an available library slot.",
            "يمكنك استعادة الكتب هنا إلى أن تختار حذفها نهائيًا. تتطلب الاستعادة مكانًا متاحًا في المكتبة.",
            "Här kan du återställa böcker tills du väljer att radera dem permanent. Återställning kräver en ledig plats.")}</p>
          <div className="bookshelf-trash-list">
            {trash.map(book => <div className="bookshelf-trash-row" key={book.id}>
              <div><strong>{book.title || clipIdea(book.idea)}</strong><span>{book.language.toUpperCase()}</span></div>
              <div className="bookshelf-trash-actions">
                <button type="button" className="button button-outline button-small"
                  disabled={!!actionPending} onClick={() => void runBookAction(book, "restore")}>
                  {actionPending === book.id ? <Loader2 className="spin" size={15}/> : <RotateCcw size={15}/>}
                  {tr(locale, "Restore", "استعادة", "Återställ")}
                </button>
                <button type="button" className="button button-outline button-small bookshelf-purge"
                  disabled={!!actionPending} onClick={() => openBookAction(book, "purge")}>
                  <Trash2 size={15}/>{tr(locale, "Delete forever", "حذف نهائي", "Radera permanent")}
                </button>
              </div>
            </div>)}
          </div>
        </details>
      )}
      {bookAction && (
        <Dialog
          title={bookAction.action === "rename"
            ? tr(locale, "Rename book", "إعادة تسمية الكتاب", "Byt namn på boken")
            : bookAction.action === "purge"
              ? tr(locale, "Permanently delete book", "حذف الكتاب نهائيًا", "Radera boken permanent")
              : tr(locale, "Move book to trash", "نقل الكتاب إلى المحذوفات", "Flytta boken till papperskorgen")}
          closeLabel={t.cancel}
          onClose={() => { if (!actionPending) { setBookAction(null); setActionError(""); } }}>
          <div className="stack">
            <p><strong>{bookAction.book.title || clipIdea(bookAction.book.idea)}</strong></p>
            {bookAction.action === "rename" ? (
              <label>{tr(locale, "Book title", "عنوان الكتاب", "Boktitel")}
                <input value={renameTitle} onChange={e => setRenameTitle(e.target.value)}
                  maxLength={180} disabled={!!actionPending}/>
              </label>
            ) : <p>{bookAction.action === "purge"
              ? tr(locale, "The manuscript, saved versions and illustrations will be deleted permanently. This cannot be undone.",
                "سيُحذف النص وجميع النسخ والصور نهائيًا. لا يمكن التراجع عن هذه العملية.",
                "Manuskript, versioner och bilder raderas permanent. Åtgärden kan inte ångras.")
              : tr(locale, "The book leaves your library but can be restored from the trash.",
                "سيختفي الكتاب من المكتبة ويمكنك استعادته من المحذوفات.",
                "Boken flyttas från biblioteket och kan återställas från papperskorgen.")}</p>}
            {actionError && <p role="alert" className="error-message">{errorMessage(actionError, locale)}</p>}
            <button type="button" className={`button ${bookAction.action === "purge" ? "button-danger" : "button-primary"}`}
              disabled={!!actionPending || (bookAction.action === "rename" && !renameTitle.trim())}
              onClick={() => void runBookAction(bookAction.book, bookAction.action)}>
              {actionPending ? <Loader2 size={17} className="spin"/> :
                bookAction.action === "rename" ? <Pencil size={17}/> : <Trash2 size={17}/>}
              {bookAction.action === "rename" ? tr(locale, "Save name", "حفظ الاسم", "Spara namn") :
                bookAction.action === "purge" ? tr(locale, "Delete permanently", "حذف نهائي", "Radera permanent") :
                  tr(locale, "Move to trash", "نقل إلى المحذوفات", "Flytta till papperskorgen")}
            </button>
          </div>
        </Dialog>
      )}
      {modal && (
        <Dialog
          title={
            modal === "new"
              ? t.briefTitle
              : modal === "credits"
                ? t.buyCredits
                : t.settings
          }
          closeLabel={t.cancel}
          onClose={() => {
            if (!pending) {
              setModal(null);
              setError("");
            }
          }}
        >
          {modal === "new" ? (
            <form className="stack" onSubmit={create}>
              <p className="muted">{t.briefBody}</p>
              <label>
                {t.idea}
                <textarea
                  minLength={20}
                  maxLength={2000}
                  rows={4}
                  required
                  placeholder={t.ideaPlaceholder}
                  value={brief.idea}
                  onChange={(e) => field("idea", e.target.value)}
                  disabled={pending}
                />
                <small className="field-count">{brief.idea.length}/2000</small>
              </label>
              <label>
                {t.bookLanguage}
                <select value={brief.language} onChange={(e) => field("language", e.target.value as Locale)}>
                  <option value="en">English</option><option value="ar">العربية</option><option value="sv">Svenska</option>
                </select>
                {isArabicBrief(brief.idea) && brief.language !== "ar" && <span className="notice" role="alert">
                  {tr(locale, "Your idea is Arabic. Choose Arabic for the final text.", "فكرتك بالعربية. اختر العربية كي يُكتب المحتوى بالعربية.", "Din idé är på arabiska. Välj arabiska för texten.")}
                </span>}
              </label>
              <div className="form-grid">
                <label>
                  {tr(locale, "Organize content by", "طريقة تقسيم المحتوى", "Dela upp innehållet i")}
                  <select value={brief.section_unit || "chapter"} onChange={e=>field("section_unit", e.target.value as Brief["section_unit"])}>
                    <option value="section">{tr(locale, "Sections", "أقسام", "Avsnitt")}</option>
                    <option value="chapter">{tr(locale, "Chapters", "فصول", "Kapitel")}</option>
                    <option value="page">{tr(locale, "Content pages", "صفحات المحتوى", "Innehållssidor")}</option>
                  </select>
                </label>
                <label>
                  {brief.section_unit === "page"
                    ? tr(locale, "Content pages (covers separate)", "عدد صفحات المحتوى (الغلاف منفصل)", "Innehållssidor (omslag separat)")
                    : tr(locale, "Number of parts", "عدد الأجزاء", "Antal delar")}
                  <select value={brief.chapter_count} onChange={e=>field("chapter_count", Number(e.target.value))}>
                    {Array.from({length:10},(_,i)=>i+1).map(n=><option key={n} value={n}>{n}</option>)}
                  </select>
                </label>
              </div>
              <details className="studio-optional-settings">
                <summary>{tr(locale, "More options (optional)", "تخصيص إضافي (اختياري)", "Fler val (frivilligt)")}</summary>
                <div className="stack">
                  <label>
                    {t.audience}
                    <input maxLength={300} placeholder={t.audiencePlaceholder}
                      value={brief.audience} onChange={e=>field("audience",e.target.value)} disabled={pending}/>
                  </label>
                  <label>
                    {t.format}
                    <select value={brief.kind} onChange={e=>field("kind",e.target.value as Brief["kind"])}>
                      {(["guide","ebook","workbook","report","research","novel","short_story","children_story"] as const).map(k=>
                        <option key={k} value={k}>{t[k]}</option>
                      )}
                    </select>
                  </label>
                  <label>
                    {t.tone}
                    <select value={brief.tone} onChange={e=>field("tone",e.target.value as Brief["tone"])}>
                      {(["clear","friendly","professional","literary","dramatic","playful"] as const).map(k=>
                        <option key={k} value={k}>{t[k]}</option>
                      )}
                    </select>
                  </label>
                  <label>{t.author}
                    <input maxLength={100} value={brief.author} onChange={e=>field("author",e.target.value)}/>
                  </label>
                </div>
              </details>
              {error && (
                <p className="error-message" role="alert">
                  {errorMessage(error, locale)}
                </p>
              )}
              <button disabled={pending} className="button button-primary">
                {pending ? (
                  <Loader2 size={18} className="spin" />
                ) : (
                  <Plus size={18} />
                )}{" "}
                {tr(
                  locale,
                  "Save brief & continue",
                  "احفظ الفكرة وتابع",
                  "Spara underlag och fortsätt",
                )}
              </button>
            </form>
          ) : modal === "credits" ? (
            <CreditPacks locale={locale} enabled={config.billing} />
          ) : (
            <div className="stack">
              <p dir="ltr">{email}</p>
              <p>{t.checkoutNote}</p>
              <button
                className="button button-danger"
                disabled={pending}
                onClick={deleteAccount}
              >
                {t.deleteAccount}
              </button>
              {error && (
                <p className="error-message" role="alert">
                  {errorMessage(error, locale)}
                </p>
              )}
            </div>
          )}
        </Dialog>
      )}
    </div>
  );
}
function clipIdea(text: string) {
  return text.length > 60 ? `${text.slice(0, 60)}…` : text;
}
