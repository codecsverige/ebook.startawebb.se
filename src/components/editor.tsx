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
  Plus,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { BookCover } from "./book-cover";
import {
  WritingAssistant,
  CoverWorkshop,
  PublicationControls,
  PublicationPreview,
  ReviewPanel,
} from "./editor-tools";
import { applyTextSuggestion } from "@/lib/editorial";
import { Markdown } from "./markdown";
import { Dialog } from "./dialog";
import { CreditPacks } from "./credit-packs";
import { copy, errorMessage, tr } from "@/lib/i18n";
import { request, codeOf } from "@/lib/client";
import { allowStudioNavigation } from "@/lib/navigation";
import {
  bookWords,
  bookSettings,
  type BookSettings,
  type AssistantInput,
  type AssistantResult,
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
  config: {
    ai: boolean;
    billing: boolean;
    artwork: boolean;
    ownerTrial: boolean;
  };
}) {
  const t = copy[locale];
  const [book, setBook] = useState<BookWithCover | null>(null);
  const [draft, setDraft] = useState<BookWithCover | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [credits, setCredits] = useState(0);
  const [tab, setTab] = useState<Tab>("outline");
  const [chapterId, setChapterId] = useState("");
  const [selection, setSelection] = useState<{
    start: number;
    end: number;
  } | null>(null);
  const [dismissedJob, setDismissedJob] = useState("");
  const [pdfPreview, setPdfPreview] = useState<{
    url: string;
    revision: number;
  } | null>(null);
  const revisionRef = useRef(0);
  const [restartLanguage, setRestartLanguage] = useState<Locale>(locale);
  const [coverCandidate, setCoverCandidate] = useState<File | null>(null);
  const [showAllCoverTemplates, setShowAllCoverTemplates] = useState(false);
  const [coverPreviewUrl, setCoverPreviewUrl] = useState<string | null>(null);
  const [read, setRead] = useState(false);
  const [fullscreenEditor, setFullscreenEditor] = useState(false);
  const chapterEditorRef = useRef<HTMLTextAreaElement | null>(null);
  const [pending, setPending] = useState("");
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [dirty, setDirty] = useState(false);
  const [recoveryDraft, setRecoveryDraft] = useState<BookWithCover | null>(
    null,
  );
  const recoveryCheckedRef = useRef(false);
  const backupKey = `ebook-studio:draft:${id}`;
  const [online, setOnline] = useState(true);
  useEffect(() => {
    setSelection(null);
  }, [chapterId]);
  useEffect(
    () => () => {
      if (pdfPreview) URL.revokeObjectURL(pdfPreview.url);
    },
    [pdfPreview],
  );
  useEffect(() => {
    setPdfPreview((current) =>
      current && current.revision !== book?.revision ? null : current,
    );
  }, [book?.revision]);
  const saveFailuresRef = useRef(0);
  const savingRef = useRef(false);
  const generatingRef = useRef(false);
  const editSequenceRef = useRef(0);
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
      if (!recoveryCheckedRef.current && !dirtyRef.current) {
        recoveryCheckedRef.current = true;
        try {
          const data = sessionStorage.getItem(backupKey);
          if (data) {
            const saved = JSON.parse(data) as BookWithCover;
            if (
              saved.id === id &&
              saved.revision === d.book.revision &&
              Array.isArray(saved.outline) &&
              typeof saved.chapters === "object" &&
              saved.title !== undefined
            ) {
              setRecoveryDraft(saved);
            }
          }
        } catch {
          // Private mode or malformed browser storage: cloud save continues normally.
        }
      }
      setBook(d.book);
      if (!dirtyRef.current) {
        setDraft(d.book);
        revisionRef.current = d.book.revision;
      }
      setRestartLanguage(isArabicBrief(d.book.idea) ? "ar" : d.book.language);
      setJob(d.job);
      setCredits(d.credits);
      setChapterId((old) => old || d.book.outline[0]?.id || "");
      setLoadError("");
    } catch (e) {
      if (mounted.current) setLoadError(codeOf(e));
    }
  }, [id, backupKey]);
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
  useEffect(() => {
    if (!dirty || !draft) return;
    try {
      sessionStorage.setItem(backupKey, JSON.stringify(draft));
    } catch {
      // Browser storage is best effort. The unsaved changes warning remains visible.
    }
  }, [backupKey, draft, dirty]);

  useEffect(() => {
    if (!coverCandidate) {
      setCoverPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(coverCandidate);
    setCoverPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [coverCandidate]);
  useEffect(() => {
    const sync = () => {
      if (navigator.onLine) saveFailuresRef.current = 0;
      setOnline(navigator.onLine);
    };
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);
  useEffect(() => {
    if (
      !dirty ||
      !online ||
      disabled ||
      !draft?.outline.length ||
      error === "conflict" ||
      error === "rate_limit" ||
      saveFailuresRef.current >= 4
    )
      return;
    // Debounce saves and back off if the network is unavailable.
    const delay = Math.min(
      30_000,
      2_200 * 2 ** Math.min(4, saveFailuresRef.current),
    );
    const timer = window.setTimeout(() => void save(), delay);
    return () => window.clearTimeout(timer);
  }, [draft, dirty, online, disabled, pending, error]);

  function change(fn: (b: BookWithCover) => BookWithCover) {
    editSequenceRef.current += 1;
    setDraft((b) => (b ? fn(b) : b));
    dirtyRef.current = true;
    setDirty(true);
  }
  function formatSelection(kind: "bold" | "heading" | "list") {
    const editor = chapterEditorRef.current;
    const selectedChapter =
      draft?.outline.find((item) => item.id === chapterId) || draft?.outline[0];
    if (!editor || !selectedChapter || !draft?.chapters[selectedChapter.id])
      return;
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
    const updated =
      value.slice(0, from) +
      prefix +
      (selected || " ") +
      suffix +
      value.slice(to);
    if (updated.length > 30000) return;
    change((b) => ({
      ...b,
      chapters: {
        ...b.chapters,
        [selectedChapter.id]: {
          ...b.chapters[selectedChapter.id],
          content: updated,
        },
      },
    }));
    requestAnimationFrame(() => {
      editor.focus();
      editor.setSelectionRange(
        from + prefix.length,
        from + prefix.length + (selected || " ").length,
      );
    });
  }
  async function save(): Promise<boolean> {
    if (!draft || !dirtyRef.current) return true;
    if (savingRef.current) return false;
    if (!online) {
      setError("offline");
      return false;
    }
    savingRef.current = true;
    const savingSequence = editSequenceRef.current;
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
          settings: draft.settings,
          chapter_length: draft.chapter_length,
        }),
      });
      setBook(d.book);
      const editedWhileSaving = editSequenceRef.current !== savingSequence;
      revisionRef.current = d.book.revision;
      if (editedWhileSaving) {
        // Never replace a newer on-screen draft with the older request body.
        // Advance only the optimistic revision so autosave can persist it next.
        setDraft((current) =>
          current ? { ...current, revision: d.book.revision } : d.book,
        );
        dirtyRef.current = true;
        setDirty(true);
      } else {
        setDraft(d.book);
        dirtyRef.current = false;
        setDirty(false);
        try {
          sessionStorage.removeItem(backupKey);
        } catch {}
        setRecoveryDraft(null);
      }
      saveFailuresRef.current = 0;
      return !editedWhileSaving;
    } catch (e) {
      saveFailuresRef.current++;
      setError(online ? codeOf(e) : "offline");
      return false;
    } finally {
      savingRef.current = false;
      setPending("");
    }
  }
  async function generate(
    kind: JobKind,
    chapter?: string,
    input?: Omit<AssistantInput, "revision">,
  ) {
    if (!draft || generatingRef.current || disabled) return;
    if (!online) {
      setError("offline");
      return;
    }
    if (
      kind === "chapter" &&
      draft.chapters[chapter || ""] &&
      !window.confirm(t.regenerateConfirm)
    )
      return;
    if (dirtyRef.current && !(await save())) return;
    // A lost HTTP response must not trigger a second (billable) AI job.
    // Reuse the same request ID on uncertain network errors, even after reload.
    const assistant = input
      ? { ...input, revision: revisionRef.current }
      : undefined;
    const requestKey = `ebook-studio:generate:${id}:${kind}:${chapter || "all"}:${assistant ? JSON.stringify(assistant) : ""}`;
    let requestId = "";
    try {
      requestId = sessionStorage.getItem(requestKey) || "";
    } catch {}
    if (!/^[0-9a-f-]{36}$/i.test(requestId)) requestId = crypto.randomUUID();
    try {
      sessionStorage.setItem(requestKey, requestId);
    } catch {}
    generatingRef.current = true;
    setPending("generate");
    setError("");
    try {
      const d = await request<{ job: Job }>(`/api/books/${id}/generate`, {
        method: "POST",
        body: JSON.stringify({
          kind,
          chapter_id: chapter,
          request_id: requestId,
          assistant,
        }),
      });
      try {
        sessionStorage.removeItem(requestKey);
      } catch {}
      setJob(d.job);
      setDismissedJob("");
      await load();
    } catch (e) {
      const code = codeOf(e);
      // On an unknown failure the request might have started server-side.
      // Retain its idempotency key for a safe retry rather than double billing.
      if (code !== "service_error" && code !== "offline") {
        try {
          sessionStorage.removeItem(requestKey);
        } catch {}
      }
      setError(code);
      if (
        config.billing &&
        (code === "insufficient_credits" || code === "free_preview_used")
      )
        setModal("credits");
      if (code === "busy") await load();
    } finally {
      generatingRef.current = false;
      setPending("");
    }
  }
  function updateSettings(patch: Partial<BookSettings>) {
    change((b) => ({ ...b, settings: { ...bookSettings(b), ...patch } }));
  }
  function applySuggestion(result: Extract<AssistantResult, { type: "edit" }>) {
    if (!draft || disabled || result.revision !== draft.revision) {
      setError("conflict");
      return;
    }
    const chapter = draft.chapters[result.chapter_id];
    const content = chapter && applyTextSuggestion(chapter.content, result);
    if (!content) {
      setError("conflict");
      return;
    }
    change((b) => ({
      ...b,
      chapters: {
        ...b.chapters,
        [result.chapter_id]: { content, summary: result.summary },
      },
    }));
    setDismissedJob(job?.id || "");
    setSelection(null);
  }
  function moveChapter(chapter: string, offset: number) {
    change((b) => {
      const outline = [...b.outline],
        from = outline.findIndex((c) => c.id === chapter),
        to = from + offset;
      if (from < 0 || to < 0 || to >= outline.length) return b;
      [outline[from], outline[to]] = [outline[to], outline[from]];
      return { ...b, outline };
    });
  }
  function deleteChapter(chapter: string) {
    if (!draft || draft.outline.length <= 1 || disabled) return;
    if (
      !window.confirm(
        tr(
          locale,
          "Remove this chapter? You can restore the saved manuscript from version history.",
          "حذف هذا الفصل؟ يمكنك استعادة النسخة المحفوظة من سجل النسخ.",
          "Ta bort kapitlet? Du kan återställa det sparade manuset från versionshistoriken.",
        ),
      )
    )
      return;
    change((b) => {
      const chapters = { ...b.chapters };
      delete chapters[chapter];
      const outline = b.outline.filter((c) => c.id !== chapter);
      return { ...b, outline, chapters, chapter_count: outline.length };
    });
    setChapterId("");
  }
  function addChapter() {
    if (!draft || disabled || draft.outline.length >= 30) return;
    const chapter = {
      id: crypto.randomUUID(),
      title: tr(locale, "New chapter", "فصل جديد", "Nytt kapitel"),
      summary: tr(
        locale,
        "Describe what this chapter should cover.",
        "اكتب ما تريد أن يتناوله هذا الفصل.",
        "Beskriv vad kapitlet ska handla om.",
      ),
    };
    change((b) => ({
      ...b,
      outline: [...b.outline, chapter],
      chapter_count: b.outline.length + 1,
    }));
    setChapterId(chapter.id);
    setTab("outline");
  }
  async function showPdfPreview() {
    if (!draft || disabled) return;
    if (dirtyRef.current && !(await save())) return;
    setPending("pdf-preview");
    setError("");
    try {
      const response = await fetch(`/api/books/${id}/export?format=pdf`, {
        cache: "no-store",
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "service_error");
      }
      const blob = await response.blob();
      if (!mounted.current) return;
      setPdfPreview({
        url: URL.createObjectURL(blob),
        revision: revisionRef.current,
      });
    } catch (error) {
      setError(codeOf(error));
    } finally {
      if (mounted.current) setPending("");
    }
  }
  async function createManualOutline() {
    if (!book || !draft || disabled || draft.outline.length) return;
    if (
      !window.confirm(
        tr(
          locale,
          "Create an editable chapter outline without AI? Nothing will be charged. You will write the titles and summaries yourself.",
          "هل تريد إنشاء فهرس يدوي قابل للتعديل دون ذكاء اصطناعي ودون أي تكلفة؟ ستكتب عناوين الفصول وملخصاتها بنفسك.",
          "Skapa en redigerbar disposition utan AI och utan kostnad? Du skriver själv rubriker och sammanfattningar.",
        ),
      )
    )
      return;
    setPending("manual-outline");
    setError("");
    try {
      const { book: result } = await request<{ book: BookWithCover }>(
        `/api/books/${id}`,
        {
          method: "POST",
          body: JSON.stringify({
            action: "manual_outline",
            revision: book.revision,
          }),
        },
      );
      setBook(result);
      setDraft(result);
      setJob(null);
      setChapterId(result.outline[0]?.id || "");
      setDirty(false);
      dirtyRef.current = false;
      try {
        sessionStorage.removeItem(backupKey);
      } catch {}
    } catch (error) {
      setError(codeOf(error));
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
      const { book: fresh } = await request<{ book: BookWithCover }>(
        `/api/books/${id}`,
        {
          method: "POST",
          body: JSON.stringify({
            action: "restart",
            revision: book.revision,
            language: restartLanguage,
          }),
        },
      );
      setBook(fresh);
      setDraft(fresh);
      try {
        sessionStorage.removeItem(backupKey);
      } catch {}
      setRecoveryDraft(null);
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
  async function decideCoverSuggestion(accept: boolean) {
    if (!book?.cover_candidate_path || disabled) return;
    let revision = book.revision;
    if (dirtyRef.current) {
      if (!(await save())) return;
      revision++;
    }
    setPending(accept ? "accept-cover" : "reject-cover");
    setError("");
    try {
      const { book: updated } = await request<{ book: BookWithCover }>(
        `/api/books/${id}/cover`,
        {
          method: "POST",
          body: JSON.stringify({
            action: accept ? "accept" : "reject",
            revision,
          }),
        },
      );
      setBook(updated);
      setDraft(updated);
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
    if (!book || disabled) return;
    if (
      !window.confirm(
        tr(
          locale,
          "Restore this saved book and its language? Your current version will be archived and can be restored later.",
          "هل تريد استعادة هذا الإصدار بلغته وفصوله؟ ستُحفظ نسختك الحالية أيضًا في السجل ويمكن استعادتها لاحقًا.",
          "Återställa den sparade boken och dess språk? Den aktuella versionen arkiveras och kan återställas senare.",
        ),
      )
    )
      return;
    // Save the draft first, then restore from the new server revision.
    let revision = book.revision;
    if (dirtyRef.current) {
      if (!(await save())) return;
      revision++;
    }
    setPending("restore");
    setError("");
    try {
      const { book: restored } = await request<{ book: BookWithCover }>(
        `/api/books/${id}/versions`,
        {
          method: "POST",
          body: JSON.stringify({ version_id: version.id, revision }),
        },
      );
      setBook(restored);
      setDraft(restored);
      setJob(null);
      setRestartLanguage(
        isArabicBrief(restored.idea) ? "ar" : restored.language,
      );
      setChapterId(restored.outline[0]?.id || "");
      dirtyRef.current = false;
      setDirty(false);
      setModal(null);
      try {
        sessionStorage.removeItem(backupKey);
      } catch {}
    } catch (e) {
      setError(codeOf(e));
    } finally {
      setPending("");
    }
  }
  async function uploadCover(file: File) {
    if (
      !["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
      file.size > 3_000_000
    ) {
      setError("invalid_input");
      return;
    }
    if (dirtyRef.current && !(await save())) return;
    setPending("upload-cover");
    setError("");
    try {
      const response = await fetch("/api/books/" + id + "/cover/upload", {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": file.type },
        body: file,
      });
      const payload = await response
        .json()
        .catch(() => ({ error: "service_error" }));
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
  async function download(
    format: "pdf" | "docx" | "epub" | "cover" | "back-cover",
  ) {
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
      const coverOnly = format === "cover" || format === "back-cover";
      a.download = `${filename(draft?.title || "ebook")}${coverOnly ? "-" + format : ""}.${coverOnly ? "png" : format}`;
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
  const complete = isComplete(draft);
  const settings = bookSettings(draft);
  const visibleJob = job?.id === dismissedJob ? null : job;
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
              {book.unlocked
                ? config.ownerTrial
                  ? tr(
                      locale,
                      "Ready to test",
                      "جاهز للتجربة",
                      "Redo att testa",
                    )
                  : t.unlocked
                : config.ownerTrial
                  ? tr(locale, "Free trial", "تجربة مجانية", "Gratis test")
                  : t.sampleBadge}
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
          {draft.outline.length > 0 && (
            <nav
              className="manuscript-nav"
              aria-label={tr(locale, "Chapters", "فصول الكتاب", "Kapitel")}
            >
              <div className="manuscript-nav-heading">
                <span className="small-label">
                  {tr(locale, "Manuscript", "المخطوط", "Manus")}
                </span>
                <button
                  className="icon-button"
                  type="button"
                  disabled={disabled || draft.outline.length >= 30}
                  onClick={addChapter}
                  aria-label={tr(
                    locale,
                    "Add chapter",
                    "إضافة فصل",
                    "Lägg till kapitel",
                  )}
                >
                  <Plus size={16} />
                </button>
              </div>
              {draft.outline.map((c, i) => (
                <button
                  key={c.id}
                  type="button"
                  className={
                    tab === "write" && active?.id === c.id ? "is-current" : ""
                  }
                  onClick={() => {
                    setChapterId(c.id);
                    setTab("write");
                  }}
                >
                  <span>{String(i + 1).padStart(2, "0")}</span>
                  <span>{c.title}</span>
                  {draft.chapters[c.id] && <Check size={13} />}
                </button>
              ))}
            </nav>
          )}
          <div className="sidebar-stats">
            <BookOpen size={18} />
            <div>
              <strong>
                {Object.keys(draft.chapters).length}/
                {draft.outline.length || draft.chapter_count}
              </strong>{" "}
              {t.chapters}
              <small>
                {bookWords(draft).toLocaleString(locale)} {t.words}
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
            <span className="status-tag sidebar-credits">
              {tr(
                locale,
                "Free private testing",
                "اختبار مجاني خاص",
                "Gratis privat test",
              )}
            </span>
          ) : null}
          <p className="sidebar-note">{t.reviewNote}</p>
        </aside>
        <div className="editor-main">
          {draft.outline.length > 0 && (
            <div className="studio-next-step">
              <div>
                <span className="small-label">
                  {tr(
                    locale,
                    "Your book, taking shape",
                    "كتابك يتشكّل",
                    "Din bok tar form",
                  )}
                </span>
                <p>
                  {!complete
                    ? tr(
                        locale,
                        "Build your manuscript chapter by chapter, with a clear view of the whole book.",
                        "اكتب فصولك وراجعها مع رؤية واضحة للكتاب كاملًا.",
                        "Skriv och granska kapitlen med hela boken i blick.",
                      )
                    : tr(
                        locale,
                        "Your chapters are ready. Finish the cover, review, and export your book.",
                        "فصولك مكتملة. أكمل الغلاف والمراجعة ثم نزّل كتابك.",
                        "Kapitlen är klara. Slutför omslaget, granska och exportera boken.",
                      )}
                </p>
              </div>
              <button
                className="button button-outline button-small"
                onClick={() =>
                  setTab(
                    !complete
                      ? "write"
                      : tab === "design"
                        ? "preview"
                        : "design",
                  )
                }
              >
                {!complete ? t.write : tab === "design" ? t.preview : t.design}
                <ChevronRight size={15} />
              </button>
            </div>
          )}

          {!online && (
            <div className="notice offline-warning" role="status">
              {tr(
                locale,
                "You are offline. Your changes are not saved to the cloud yet. Keep this page open; automatic saving resumes when the connection returns.",
                "الاتصال مقطوع. تعديلاتك لم تُحفظ على السحابة بعد. اترك الصفحة مفتوحة، وسيُستأنف الحفظ تلقائيًا عند عودة الإنترنت.",
                "Du är offline. Ändringarna har inte sparats i molnet ännu. Låt sidan vara öppen. Automatisk sparning återupptas när anslutningen återkommer.",
              )}
            </div>
          )}
          {recoveryDraft && !dirty && (
            <div className="notice draft-recovery" role="status">
              <strong>
                {tr(
                  locale,
                  "Recover unsaved changes?",
                  "هل تريد استعادة التعديلات غير المحفوظة؟",
                  "Återställa osparade ändringar?",
                )}
              </strong>
              <p>
                {tr(
                  locale,
                  "A draft from this browser tab was found. You can restore it or keep the last cloud-saved version.",
                  "وُجدت مسودة من هذا المتصفح. يمكنك استعادتها أو الإبقاء على آخر نسخة محفوظة على السحابة.",
                  "Ett utkast från den här webbläsarfliken hittades. Återställ det eller behåll den senast molnsparade versionen.",
                )}
              </p>
              <div className="cover-confirm-buttons">
                <button
                  type="button"
                  className="button button-primary button-small"
                  onClick={() => {
                    editSequenceRef.current += 1;
                    setDraft(recoveryDraft);
                    dirtyRef.current = true;
                    setDirty(true);
                    setRecoveryDraft(null);
                  }}
                >
                  {tr(
                    locale,
                    "Restore draft",
                    "استعادة المسودة",
                    "Återställ utkast",
                  )}
                </button>
                <button
                  type="button"
                  className="button button-outline button-small"
                  onClick={() => {
                    try {
                      sessionStorage.removeItem(backupKey);
                    } catch {}
                    setRecoveryDraft(null);
                  }}
                >
                  {tr(
                    locale,
                    "Keep saved version",
                    "الإبقاء على النسخة المحفوظة",
                    "Behåll sparad version",
                  )}
                </button>
              </div>
            </div>
          )}
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
              <p>
                {config.ownerTrial &&
                [
                  "ai_daily_limit",
                  "ai_image_daily_limit",
                  "ai_book_limit",
                  "rate_limit",
                ].includes(job.error_code || "")
                  ? tr(
                      locale,
                      "This error came from an earlier test limit. Your private test account is now exempt. Retry generation.",
                      "هذا خطأ قديم من حدود التجربة السابقة. رُفعت حدود التوليد عن حسابك الخاص؛ اضغط إعادة محاولة التوليد.",
                      "Felet kommer från en tidigare testgräns. Ditt privata testkonto är nu undantaget. Försök generera igen.",
                    )
                  : errorMessage(job.error_code || "generation_failed", locale)}
              </p>
              <p className="muted" dir="ltr" style={{ fontSize: 12 }}>
                {tr(
                  locale,
                  "Support reference",
                  "رقم الخطأ للدعم",
                  "Felreferens",
                )}
                : {job.id.slice(0, 12)}
              </p>
              {config.ai &&
                ["chapter", "book", "sample", "outline"].includes(job.kind) && (
                  <button
                    type="button"
                    className="button button-small button-outline"
                    disabled={disabled}
                    onClick={() =>
                      void generate(job.kind, job.chapter_id || undefined)
                    }
                  >
                    <RotateCcw size={15} />
                    {tr(
                      locale,
                      "Retry generation",
                      "إعادة محاولة التوليد",
                      "Försök generera igen",
                    )}
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

              <div
                className="restart-tools"
                dir={locale === "ar" ? "rtl" : "ltr"}
              >
                <div>
                  <strong>
                    {tr(locale, "Book language", "لغة الكتاب", "Bokens språk")}
                  </strong>
                  <p>
                    {tr(
                      locale,
                      "Current language",
                      "اللغة الحالية",
                      "Nuvarande språk",
                    )}
                    : {languageNames[book.language]}
                  </p>
                  {isArabicBrief(book.idea) && book.language !== "ar" && (
                    <p className="language-warning" role="alert">
                      {tr(
                        locale,
                        "Your idea is Arabic but this book is set to another language. Restart it in Arabic to correct its contents.",
                        "طلبك مكتوب بالعربية لكن لغة هذا الكتاب ليست العربية. اختر العربية وأعد إنشاء الفهرس والفصول.",
                        "Bokidén är på arabiska men bokens språk är ett annat. Starta om den på arabiska.",
                      )}
                    </p>
                  )}
                </div>
                <label>
                  <span className="sr-only">{t.bookLanguage}</span>
                  <select
                    value={restartLanguage}
                    disabled={disabled}
                    onChange={(e) =>
                      setRestartLanguage(e.target.value as Locale)
                    }
                  >
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
                  {tr(
                    locale,
                    "Restart this book",
                    "إعادة إنشاء الكتاب من البداية",
                    "Starta om boken",
                  )}
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
                  <button
                    type="button"
                    className="button button-outline"
                    disabled={disabled}
                    onClick={() => void createManualOutline()}
                  >
                    <BookOpen size={17} />
                    {tr(
                      locale,
                      "Create editable outline without AI (free)",
                      "إنشاء فهرس يدوي دون ذكاء اصطناعي (مجاني)",
                      "Skapa redigerbar disposition utan AI (gratis)",
                    )}
                  </button>
                  {!config.ai && (
                    <p className="notice" role="status">
                      {tr(
                        locale,
                        "AI generation is unavailable because the OpenAI API connection is not configured. Your saved books are safe. You can create an editable outline without AI below.",
                        "إنشاء الفهرس بالذكاء الاصطناعي غير متاح لأن اتصال OpenAI API غير مفعّل حاليًا. كتبك المحفوظة آمنة، ويمكنك إنشاء فهرس يدوي قابل للتعديل من الزر أعلاه.",
                        "AI-generering är inte tillgänglig eftersom anslutningen till OpenAI API inte är konfigurerad. Dina sparade böcker finns kvar. Du kan skapa en redigerbar disposition utan AI ovan.",
                      )}
                    </p>
                  )}
                </div>
              ) : (
                <>
                  <label className="chapter-length-control">
                    {tr(
                      locale,
                      "Length of new chapters",
                      "طول الفصول الجديدة",
                      "Nya kapitels längd",
                    )}
                    <select
                      disabled={disabled}
                      value={draft.chapter_length || "standard"}
                      onChange={(e) =>
                        change((b) => ({
                          ...b,
                          chapter_length: e.target
                            .value as Book["chapter_length"],
                        }))
                      }
                    >
                      <option value="short">
                        {tr(
                          locale,
                          "Short · 400–650 words",
                          "قصير · 400–650 كلمة",
                          "Kort · 400–650 ord",
                        )}
                      </option>
                      <option value="standard">
                        {tr(
                          locale,
                          "Standard · about 1,000 words",
                          "متوسط · نحو 1,000 كلمة",
                          "Standard · cirka 1 000 ord",
                        )}
                      </option>
                      <option value="long">
                        {tr(
                          locale,
                          "Detailed · 1,400–2,000 words",
                          "مفصّل · 1,400–2,000 كلمة",
                          "Utförligt · 1 400–2 000 ord",
                        )}
                      </option>
                    </select>
                  </label>
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
                        <div className="outline-item-tools">
                          <button
                            type="button"
                            className="icon-button"
                            disabled={disabled || i === 0}
                            onClick={() => moveChapter(c.id, -1)}
                            aria-label={tr(
                              locale,
                              "Move chapter up",
                              "نقل الفصل إلى الأعلى",
                              "Flytta kapitlet uppåt",
                            )}
                          >
                            <ArrowUp size={16} />
                          </button>
                          <button
                            type="button"
                            className="icon-button"
                            disabled={
                              disabled || i === draft.outline.length - 1
                            }
                            onClick={() => moveChapter(c.id, 1)}
                            aria-label={tr(
                              locale,
                              "Move chapter down",
                              "نقل الفصل إلى الأسفل",
                              "Flytta kapitlet nedåt",
                            )}
                          >
                            <ArrowDown size={16} />
                          </button>
                          <button
                            type="button"
                            className="icon-button danger-icon"
                            disabled={disabled || draft.outline.length === 1}
                            onClick={() => deleteChapter(c.id)}
                            aria-label={tr(
                              locale,
                              "Remove chapter",
                              "حذف الفصل",
                              "Ta bort kapitlet",
                            )}
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                        {draft.chapters[c.id] && (
                          <Check className="chapter-check" size={17} />
                        )}
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    className="button button-outline button-small add-chapter"
                    disabled={disabled || draft.outline.length >= 30}
                    onClick={addChapter}
                  >
                    <Plus size={16} />
                    {tr(
                      locale,
                      "Add a chapter",
                      "إضافة فصل",
                      "Lägg till ett kapitel",
                    )}
                  </button>
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
                        : config.ownerTrial
                          ? tr(
                              locale,
                              "Generate complete book for free",
                              "توليد الكتاب كاملًا مجانًا",
                              "Skapa hela boken gratis",
                            )
                          : t.unlock}
                    </button>
                  </div>
                </>
              )}
            </section>
          )}
          {tab === "write" && (
            <div className="writing-workspace">
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
                    <label
                      className={
                        fullscreenEditor
                          ? "chapter-edit-wrap is-fullscreen"
                          : "chapter-edit-wrap"
                      }
                    >
                      <span className="sr-only">{t.content}</span>
                      <span
                        className="chapter-format-toolbar"
                        role="toolbar"
                        aria-label={tr(
                          locale,
                          "Text formatting",
                          "تنسيق النص",
                          "Textformatering",
                        )}
                      >
                        <button
                          type="button"
                          disabled={disabled}
                          aria-label={tr(locale, "Bold", "غامق", "Fetstil")}
                          title={tr(locale, "Bold", "غامق", "Fetstil")}
                          onClick={() => formatSelection("bold")}
                        >
                          <BoldIcon size={18} />
                        </button>
                        <button
                          type="button"
                          disabled={disabled}
                          aria-label={tr(
                            locale,
                            "Heading",
                            "عنوان فرعي",
                            "Rubrik",
                          )}
                          title={tr(locale, "Heading", "عنوان فرعي", "Rubrik")}
                          onClick={() => formatSelection("heading")}
                        >
                          <Heading2 size={18} />
                        </button>
                        <button
                          type="button"
                          disabled={disabled}
                          aria-label={tr(locale, "List", "قائمة", "Lista")}
                          title={tr(locale, "List", "قائمة", "Lista")}
                          onClick={() => formatSelection("list")}
                        >
                          <ListIcon size={18} />
                        </button>
                        <span className="chapter-format-spacer" />
                        <span className="chapter-word-count">
                          {current.content
                            .trim()
                            .split(/\s+/u)
                            .filter(Boolean)
                            .length.toLocaleString(locale)}{" "}
                          {t.words}
                        </span>
                        <button
                          type="button"
                          aria-label={
                            fullscreenEditor
                              ? tr(
                                  locale,
                                  "Close full-screen editor",
                                  "إغلاق وضع الشاشة الكاملة",
                                  "Stäng helskärm",
                                )
                              : tr(
                                  locale,
                                  "Full-screen editor",
                                  "تحرير بملء الشاشة",
                                  "Helskärmsredigering",
                                )
                          }
                          title={tr(
                            locale,
                            "Full-screen editor",
                            "تحرير بملء الشاشة",
                            "Helskärmsredigering",
                          )}
                          onClick={() => setFullscreenEditor((v) => !v)}
                        >
                          {fullscreenEditor ? (
                            <Minimize2 size={18} />
                          ) : (
                            <Maximize2 size={18} />
                          )}
                        </button>
                      </span>
                      <textarea
                        ref={chapterEditorRef}
                        onSelect={(e) => {
                          const el = e.currentTarget;
                          setSelection(
                            el.selectionEnd > el.selectionStart
                              ? {
                                  start: el.selectionStart,
                                  end: el.selectionEnd,
                                }
                              : null,
                          );
                        }}
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
                    {book.unlocked
                      ? t.background
                      : config.ownerTrial
                        ? tr(
                            locale,
                            "Your private test: generate a full book without buying credits.",
                            "تجربتك الخاصة: أنشئ كتابًا كاملًا دون شراء رصيد.",
                            "Din privata test: skapa en hel bok utan att köpa krediter.",
                          )
                        : t.unlockBody}
                  </p>
                  {!complete && (
                    <button
                      className="button button-primary"
                      disabled={disabled || !config.ai}
                      onClick={() => generate("book")}
                    >
                      <BookOpen size={17} />
                      {book.unlocked
                        ? t.resume
                        : config.ownerTrial
                          ? tr(
                              locale,
                              "Generate complete book for free",
                              "توليد الكتاب كاملًا مجانًا",
                              "Skapa hela boken gratis",
                            )
                          : t.unlock}
                    </button>
                  )}
                </div>
              </section>
              {active && current && (
                <WritingAssistant
                  key={active.id}
                  locale={locale}
                  chapterId={active.id}
                  selection={selection}
                  job={visibleJob}
                  disabled={disabled}
                  available={config.ai}
                  generate={(kind, chapter, input) =>
                    void generate(kind, chapter, input)
                  }
                  onApply={applySuggestion}
                  onDismiss={() => setDismissedJob(job?.id || "")}
                />
              )}
            </div>
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
                  <span className="small-label">
                    {tr(locale, "Front cover", "الغلاف الأمامي", "Framsida")}
                  </span>
                  <BookCover
                    title={draft.title}
                    subtitle={draft.subtitle}
                    author={draft.author}
                    style={draft.cover_style}
                    layout={settings.cover_layout}
                    language={draft.language}
                    image={
                      draft.cover_candidate_url ||
                      (draft.use_artwork ? draft.cover_url : null)
                    }
                  />
                  {settings.back_cover && (
                    <div className="back-cover-preview">
                      <span className="small-label">
                        {tr(locale, "Back cover", "الغلاف الخلفي", "Baksida")}
                      </span>
                      <BookCover
                        title={draft.title}
                        author={draft.author}
                        style={draft.cover_style}
                        layout={settings.cover_layout}
                        language={draft.language}
                        image={draft.use_artwork ? draft.cover_url : null}
                        back
                        blurb={settings.back_cover_text}
                      />
                    </div>
                  )}
                </div>
                <div className="stack">
                  <CoverWorkshop
                    book={draft}
                    locale={locale}
                    disabled={disabled}
                    available={config.ai}
                    job={visibleJob}
                    generate={(kind, chapter, input) =>
                      void generate(kind, chapter, input)
                    }
                    update={updateSettings}
                  />
                  <fieldset className="cover-gallery" disabled={disabled}>
                    <legend>
                      {tr(
                        locale,
                        "Choose a professionally designed cover",
                        "اختر تصميم الغلاف المناسب لكتابك",
                        "Välj ett professionellt bokomslag",
                      )}
                    </legend>
                    <p className="muted">
                      {tr(
                        locale,
                        "18 templates. Suggested designs for your book type come first. No AI credits needed.",
                        "18 تصميمًا. تظهر التصاميم المناسبة لنوع كتابك أولًا، وتغييرها لا يستهلك الذكاء الاصطناعي.",
                        "18 omslagsmallar. Rekommendationerna för din boktyp visas först. Ingen AI-kostnad.",
                      )}
                    </p>
                    <div className="cover-template-grid">
                      {(showAllCoverTemplates
                        ? [
                            ...recommendedCoverStyles(draft.kind),
                            ...coverStyles.filter(
                              (style) =>
                                !recommendedCoverStyles(draft.kind).includes(
                                  style,
                                ),
                            ),
                          ]
                        : recommendedCoverStyles(draft.kind)
                      ).map((style, index) => (
                        <button
                          type="button"
                          className={`cover-template-card ${draft.cover_style === style ? "is-selected" : ""}`}
                          key={style}
                          aria-pressed={draft.cover_style === style}
                          aria-label={tr(locale, ...coverNames[style])}
                          disabled={disabled}
                          onClick={() =>
                            change((b) => ({ ...b, cover_style: style }))
                          }
                        >
                          <BookCover
                            title={
                              draft.title ||
                              tr(locale, "Your book", "كتابك", "Din bok")
                            }
                            subtitle=""
                            author=""
                            style={style}
                            language={draft.language}
                            layout={settings.cover_layout}
                            small
                          />
                          <span className="cover-template-name">
                            {tr(locale, ...coverNames[style])}
                          </span>
                          {index < 5 && (
                            <span className="cover-template-hint">
                              {tr(locale, "Suggested", "مقترح", "Förslag")}
                            </span>
                          )}
                          {draft.cover_style === style && (
                            <Check
                              className="cover-template-selected"
                              size={18}
                            />
                          )}
                        </button>
                      ))}
                    </div>
                    <button
                      type="button"
                      className="text-link"
                      disabled={disabled}
                      onClick={() =>
                        setShowAllCoverTemplates((value) => !value)
                      }
                    >
                      {showAllCoverTemplates
                        ? tr(
                            locale,
                            "Show the five recommendations",
                            "عرض المقترحات الخمسة فقط",
                            "Visa bara fem förslag",
                          )
                        : tr(
                            locale,
                            "Explore all 18 cover designs",
                            "استكشف جميع تصاميم الأغلفة الـ18",
                            "Utforska alla 18 omslagsmallar",
                          )}
                    </button>
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
                  <div className="tool-actions">
                    <button
                      type="button"
                      className="button button-outline button-small"
                      disabled={disabled || !book.unlocked}
                      onClick={() => void download("cover")}
                    >
                      <Download size={15} />
                      {tr(
                        locale,
                        "Download front PNG",
                        "تنزيل الغلاف الأمامي PNG",
                        "Ladda ner framsida PNG",
                      )}
                    </button>
                    {settings.back_cover && (
                      <button
                        type="button"
                        className="button button-outline button-small"
                        disabled={disabled || !book.unlocked}
                        onClick={() => void download("back-cover")}
                      >
                        <Download size={15} />
                        {tr(
                          locale,
                          "Download back PNG",
                          "تنزيل الغلاف الخلفي PNG",
                          "Ladda ner baksida PNG",
                        )}
                      </button>
                    )}
                  </div>
                  <p className="muted">
                    {tr(
                      locale,
                      "Generated cover art appears here for your review. It is never included in exports until you approve it.",
                      "ستظهر صورة الغلاف المقترحة هنا لمراجعتها. لن تُستخدم في التنزيل قبل موافقتك.",
                      "Den genererade omslagsbilden visas här för granskning. Den används inte i exporten förrän du godkänner den.",
                    )}
                  </p>
                  {draft.cover_candidate_url && (
                    <div
                      className="cover-confirm"
                      role="group"
                      aria-label={tr(
                        locale,
                        "Review AI cover image",
                        "مراجعة الغلاف المقترح",
                        "Granska AI-omslag",
                      )}
                    >
                      <strong>
                        {tr(
                          locale,
                          "AI cover suggestion",
                          "غلاف مقترح بالذكاء الاصطناعي",
                          "Förslag på AI-omslag",
                        )}
                      </strong>
                      <p>
                        {tr(
                          locale,
                          "The preview on the left shows the suggestion. Accept it, or discard it without changing your current book cover.",
                          "المعاينة على اليسار تُظهر الصورة المقترحة. وافق عليها أو ارفضها دون تغيير الغلاف الحالي.",
                          "Förhandsvisningen till vänster visar förslaget. Godkänn eller avvisa det utan att ändra ditt aktuella omslag.",
                        )}
                      </p>
                      <div className="cover-confirm-buttons">
                        <button
                          type="button"
                          className="button button-primary button-small"
                          disabled={disabled}
                          onClick={() => void decideCoverSuggestion(true)}
                        >
                          <Check size={15} />{" "}
                          {tr(
                            locale,
                            "Use this cover",
                            "اعتماد هذا الغلاف",
                            "Använd detta omslag",
                          )}
                        </button>
                        <button
                          type="button"
                          className="button button-outline button-small"
                          disabled={disabled}
                          onClick={() => void decideCoverSuggestion(false)}
                        >
                          <Trash2 size={15} />{" "}
                          {tr(
                            locale,
                            "Discard suggestion",
                            "رفض الصورة المقترحة",
                            "Avvisa förslag",
                          )}
                        </button>
                      </div>
                    </div>
                  )}
                  <label className="cover-upload-label">
                    <span>
                      {tr(
                        locale,
                        "Or upload your own cover image (PNG, JPG or WebP, max 3 MB)",
                        "أو ارفع صورة غلاف من هاتفك (PNG أو JPG أو WebP، بحد 3 ميغابايت)",
                        "Eller ladda upp en egen omslagsbild (PNG, JPG eller WebP, max 3 MB)",
                      )}
                    </span>
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      disabled={disabled || !book.unlocked}
                      onChange={(e) => {
                        const file = e.currentTarget.files?.[0];
                        e.currentTarget.value = "";
                        if (file) {
                          if (
                            !["image/png", "image/jpeg", "image/webp"].includes(
                              file.type,
                            ) ||
                            file.size > 3_000_000
                          ) {
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
                      <strong>
                        {tr(
                          locale,
                          "Review your selected image",
                          "راجع الصورة قبل اعتمادها",
                          "Granska vald bild",
                        )}
                      </strong>
                      <p>{coverCandidate.name}</p>
                      {coverPreviewUrl && (
                        <img
                          className="cover-candidate-thumb"
                          src={coverPreviewUrl}
                          alt={tr(
                            locale,
                            "Preview of your chosen image",
                            "معاينة الصورة التي اخترتها",
                            "Förhandsvisning av vald bild",
                          )}
                        />
                      )}
                      <p className="muted">
                        {tr(
                          locale,
                          "Choose an illustration or photo for your own book, not a screenshot of a webpage or social media.",
                          "استخدم رسمة أو صورة مناسبة للكتاب، لا لقطة شاشة من موقع أو تطبيق.",
                          "Välj en illustration eller bild som passar boken, inte en skärmbild från en webbplats.",
                        )}
                      </p>
                      <div className="cover-confirm-buttons">
                        <button
                          type="button"
                          className="button button-primary button-small"
                          disabled={disabled}
                          onClick={() => void uploadCover(coverCandidate)}
                        >
                          <Check size={15} />{" "}
                          {tr(
                            locale,
                            "Apply this image",
                            "اعتماد هذه الصورة",
                            "Använd bilden",
                          )}
                        </button>
                        <button
                          type="button"
                          className="button button-outline button-small"
                          disabled={disabled}
                          onClick={() => setCoverCandidate(null)}
                        >
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
                      {tr(
                        locale,
                        "Remove cover image and use a clean design",
                        "حذف صورة الغلاف واستعمال تصميم نظيف",
                        "Ta bort omslagsbilden och använd ett rent omslag",
                      )}
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
                      {config.ownerTrial
                        ? tr(
                            locale,
                            "Generate book for free",
                            "توليد الكتاب مجانًا",
                            "Skapa boken gratis",
                          )
                        : t.unlock}
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
                <p>
                  {config.ownerTrial
                    ? tr(
                        locale,
                        "Complete every chapter, then download your book in PDF, Word or EPUB. No site payment is required for your private test.",
                        "أكمل كل الفصول ثم نزّل كتابك بصيغة PDF أو Word أو EPUB. لا يلزم أي دفع داخل الموقع أثناء تجربتك.",
                        "Slutför alla kapitel och ladda sedan ner boken som PDF, Word eller EPUB. Ingen betalning krävs i ditt privata test.",
                      )
                    : t.exportHint}
                </p>
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
                  {pending === "epub" ? (
                    <Loader2 size={17} className="spin" />
                  ) : (
                    <Download size={17} />
                  )}{" "}
                  {t.exportEpub}
                </button>
              </div>
              <PublicationControls
                book={draft}
                locale={locale}
                disabled={disabled}
                update={updateSettings}
              />
              <ReviewPanel
                locale={locale}
                job={visibleJob}
                disabled={disabled}
                available={config.ai}
                generate={(kind, chapter, input) =>
                  void generate(kind, chapter, input)
                }
                onChapter={(chapter) => {
                  setChapterId(chapter);
                  setTab("write");
                }}
              />
              <div className="pdf-preview-tools">
                <button
                  type="button"
                  className="button button-outline"
                  disabled={!canExport || disabled}
                  onClick={() => void showPdfPreview()}
                >
                  {pending === "pdf-preview" ? (
                    <Loader2 className="spin" size={16} />
                  ) : (
                    <Eye size={16} />
                  )}{" "}
                  {tr(
                    locale,
                    "Preview final PDF",
                    "معاينة ملف PDF النهائي",
                    "Förhandsgranska färdig PDF",
                  )}
                </button>
                <p className="muted">
                  {tr(
                    locale,
                    "The PDF preview is the actual export, including page breaks and typography.",
                    "معاينة PDF تعرض ملف التنزيل نفسه، بخطوطه وفواصل صفحاته.",
                    "PDF-förhandsvisningen visar den faktiska exporten med sidbrytningar och typsnitt.",
                  )}
                </p>
              </div>
              {pdfPreview ? (
                <div className="pdf-preview">
                  <a
                    href={pdfPreview.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-link"
                  >
                    {tr(
                      locale,
                      "Open PDF in a separate tab",
                      "فتح PDF في نافذة مستقلة",
                      "Öppna PDF i en egen flik",
                    )}
                  </a>
                  <iframe
                    title={tr(
                      locale,
                      "Final book PDF",
                      "ملف الكتاب النهائي",
                      "Bokens slutliga PDF",
                    )}
                    src={pdfPreview.url}
                  />
                  <button
                    type="button"
                    className="text-link"
                    onClick={() => setPdfPreview(null)}
                  >
                    {tr(
                      locale,
                      "Return to reading preview",
                      "العودة إلى معاينة القراءة",
                      "Tillbaka till läsvyn",
                    )}
                  </button>
                </div>
              ) : (
                <PublicationPreview book={draft} />
              )}
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
