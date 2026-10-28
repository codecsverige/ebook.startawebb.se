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
} from "lucide-react";
import { BookCover } from "./book-cover";
import { Dialog } from "./dialog";
import { CreditPacks } from "./credit-packs";
import { copy, errorMessage, tr } from "@/lib/i18n";
import {
  briefSchema,
  isArabicBrief,
  type BookshelfBook,
  type Locale,
  type Brief,
} from "@/lib/domain";
import { request, codeOf } from "@/lib/client";

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
  const [credits, setCredits] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modal, setModal] = useState<"new" | "credits" | "account" | null>(
    initialPack && config.billing ? "credits" : null,
  );
  const [pending, setPending] = useState(false);
  const [languageTouched, setLanguageTouched] = useState(false);
  const [brief, setBrief] = useState<Brief>({
    idea: "",
    audience: "",
    kind: "guide",
    language: locale,
    tone: "clear",
    author: "",
    chapter_count: 6,
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
        kind: (["guide", "ebook", "workbook", "novel", "short_story", "children_story"] as string[]).includes(saved.kind || "") ? saved.kind! : current.kind,
        language: (["ar", "en", "sv"] as string[]).includes(saved.language || "") ? saved.language! : current.language,
        tone: (["clear", "friendly", "professional", "literary", "dramatic", "playful"] as string[]).includes(saved.tone || "") ? saved.tone! : current.tone,
        chapter_count: typeof saved.chapter_count === "number" && saved.chapter_count >= 3 && saved.chapter_count <= 10 ? Math.floor(saved.chapter_count) : current.chapter_count,
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
      const d = await request<{ books: BookshelfBook[]; credits: number }>(
        "/api/books",
      );
      setBooks(d.books);
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
    const parsed = briefSchema.safeParse(brief);
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
    setBrief((b) => ({
      ...b,
      [key]: value,
      ...(key === "idea" && !languageTouched
        ? { language: isArabicBrief(String(value)) ? "ar" : locale }
        : {}),
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
            <Link
              className="shelf-book"
              key={book.id}
              href={`/${locale}/studio/${book.id}`}
            >
              <div className={`shelf-cover wrap-${book.cover_style}`}>
                <BookCover
                  title={book.title || clipIdea(book.idea)}
                  subtitle={book.subtitle}
                  author={book.author}
                  style={book.cover_style}
                  language={book.language}
                  image={book.use_artwork ? book.cover_url : null}
                  small
                />
              </div>
              <div className="shelf-book-meta">
                <span
                  className={`status-tag ${book.complete ? "tag-green" : ""}`}
                >
                  {book.complete
                    ? t.ready
                    : book.unlocked
                      ? t.unlocked
                      : t.draft}
                </span>
                <ArrowUpRight size={18} />
              </div>
              <h2>{book.title || clipIdea(book.idea)}</h2>
              <p>
                {book.completed_chapters}/{book.chapter_count} {t.chapters} ·{" "}
                {book.word_count.toLocaleString(locale)} {t.words}
              </p>
            </Link>
          ))}
        </div>
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
                {t.audience}
                <input
                  minLength={3}
                  maxLength={300}
                  required
                  placeholder={t.audiencePlaceholder}
                  value={brief.audience}
                  onChange={(e) => field("audience", e.target.value)}
                  disabled={pending}
                />
              </label>
              <div className="form-grid">
                <label>
                  {t.format}
                  <select
                    value={brief.kind}
                    onChange={(e) =>
                      field("kind", e.target.value as Brief["kind"])
                    }
                  >
                    {["guide", "ebook", "workbook", "novel", "short_story", "children_story"].map((k) => (
                      <option key={k} value={k}>
                        {t[k as Brief["kind"]]}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {t.bookLanguage}
                  <select
                    value={brief.language}
                    onChange={(e) =>
                      field("language", e.target.value as Locale)
                    }
                  >
                    <option value="en">English</option>
                    <option value="ar">العربية</option>
                    <option value="sv">Svenska</option>
                  </select>
                  {isArabicBrief(brief.idea) && brief.language !== "ar" && (
                    <span className="notice" role="alert">
                      {tr(locale, "Your brief is Arabic. Choose Arabic for the book or write the brief in the selected language.", "فكرتك بالعربية. اختر العربية كلغة للكتاب حتى لا يُنشأ بالإنجليزية.", "Din bokidé är på arabiska. Välj arabiska som bokens språk.")}
                    </span>
                  )}
                </label>
                <label>
                  {t.tone}
                  <select
                    value={brief.tone}
                    onChange={(e) =>
                      field("tone", e.target.value as Brief["tone"])
                    }
                  >
                    {["clear", "friendly", "professional", "literary", "dramatic", "playful"].map((k) => (
                      <option key={k} value={k}>
                        {t[k as Brief["tone"]]}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {t.chapters}
                  <select
                    value={brief.chapter_count}
                    onChange={(e) =>
                      field("chapter_count", Number(e.target.value))
                    }
                  >
                    {[3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                      <option key={n}>{n}</option>
                    ))}
                  </select>
                </label>
              </div>
              <label>
                {t.author}
                <input
                  maxLength={100}
                  value={brief.author}
                  onChange={(e) => field("author", e.target.value)}
                />
              </label>
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
