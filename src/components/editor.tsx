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
  ImagePlus,
  SeparatorHorizontal,
  ArrowUp,
  ArrowDown,
  Plus,
} from "lucide-react";
import { BookCover, BookBackCover } from "./book-cover";
import { Markdown } from "./markdown";
import { VisualChapterEditor } from "./visual-chapter-editor";
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
  const [coverSide, setCoverSide] = useState<"front" | "back">("front");
  const [showAllCoverTemplates, setShowAllCoverTemplates] = useState(false);
  const [coverPreviewUrl, setCoverPreviewUrl] = useState<string | null>(null);
  const [read, setRead] = useState(false);
  const [importError, setImportError] = useState("");
  const [visualMode, setVisualMode] = useState(true);
  const visualSelectedRef = useRef("");
  const [showIllustrations, setShowIllustrations] = useState(false);
  const [imageCaption, setImageCaption] = useState("");
  const [imageEdits, setImageEdits] = useState<Record<string, { caption: string; size: "small" | "medium" | "full" }>>({});
  const [imagePrompt, setImagePrompt] = useState("");
  const [imageSize, setImageSize] = useState<"small" | "medium" | "full">("medium");
  const [imagePlacement, setImagePlacement] = useState<"cursor" | "start" | "end">("cursor");
  const cursorRef = useRef(0);
  const [fullscreenEditor, setFullscreenEditor] = useState(false);
  const chapterEditorRef = useRef<HTMLTextAreaElement | null>(null);
  const [pending, setPending] = useState("");
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [dirty, setDirty] = useState(false);
  const [recoveryDraft, setRecoveryDraft] = useState<BookWithCover | null>(null);
  const recoveryCheckedRef = useRef(false);
  const backupKey = `ebook-studio:draft:${id}`;
  const [online, setOnline] = useState(true);
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
            if (saved.id === id && saved.revision === d.book.revision &&
                Array.isArray(saved.outline) && typeof saved.chapters === "object" &&
                saved.title !== undefined) {
              setRecoveryDraft(saved);
            }
          }
        } catch {
          // Private mode or malformed browser storage: cloud save continues normally.
        }
      }
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
    if (!dirty || !online || disabled || !draft?.outline.length ||
        error === "conflict" || error === "rate_limit" ||
        saveFailuresRef.current >= 4) return;
    // Debounce saves and back off if the network is unavailable.
    const delay = Math.min(30_000, 2_200 * (2 ** Math.min(4, saveFailuresRef.current)));
    const timer = window.setTimeout(() => void save(), delay);
    return () => window.clearTimeout(timer);
  }, [draft, dirty, online, disabled, pending, error]);

  function change(fn: (b: BookWithCover) => BookWithCover) {
    editSequenceRef.current += 1;
    setDraft((b) => (b ? fn(b) : b));
    dirtyRef.current = true;
    setDirty(true);
  }
  const imagePosition = (text: string) => imagePlacement === "start" ? 0 :
    imagePlacement === "end" ? text.length : Math.min(cursorRef.current, text.length);
  function addDivider() {
    if (!active || !current || disabled) return;
    const pos = imagePosition(current.content);
    change(b => {
      const ch = b.chapters[active.id];
      const content = ch.content.slice(0, pos) + "\n\n***\n\n" + ch.content.slice(pos);
      return content.length <= 30000 ? { ...b, chapters: {
        ...b.chapters, [active.id]: { ...ch, content },
      }} : b;
    });
  }
  async function insertLibrary(preset: "mountain" | "botanical" | "stars" | "waves") {
    if (!draft || !active || !current || disabled) return;
    const position = imagePosition(current.content);
    const wasDirty = dirtyRef.current;
    if (wasDirty && !(await save())) return;
    setPending("illustration"); setError("");
    try {
      const d = await request<{ book: BookWithCover }>(`/api/books/${id}/illustrations`, {
        method: "POST", body: JSON.stringify({
          revision: draft.revision + (wasDirty ? 1 : 0),
          chapter_id: active.id, position, preset,
          size: imageSize, caption: imageCaption,
        }),
      });
      setBook(d.book); setDraft(d.book);
      dirtyRef.current = false; setDirty(false); setShowIllustrations(false);
    } catch (e) { setError(codeOf(e)); }
    finally { setPending(""); }
  }
  async function uploadIllustration(file: File) {
    if (!draft || !active || !current || disabled) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
        file.size > 3_000_000) { setError("invalid_input"); return; }
    const position = imagePosition(current.content);
    const wasDirty = dirtyRef.current;
    if (wasDirty && !(await save())) return;
    setPending("illustration"); setError("");
    try {
      const params = new URLSearchParams({
        revision: String(draft.revision + (wasDirty ? 1 : 0)),
        chapter_id: active.id, position: String(position),
        size: imageSize, caption: imageCaption,
      });
      const response = await fetch(`/api/books/${id}/illustrations/upload?${params}`, {
        method: "POST", headers: { "Content-Type": file.type }, body: file,
      });
      const payload = await response.json().catch(() => ({ error: "service_error" }));
      if (!response.ok) throw new Error(payload.error || "service_error");
      setBook(payload.book); setDraft(payload.book);
      dirtyRef.current = false; setDirty(false); setShowIllustrations(false);
    } catch (e) { setError(e instanceof Error ? e.message : "service_error"); }
    finally { setPending(""); }
  }
  async function changeExistingImage(imageId: string, remove = false) {
    const illustration = draft?.illustrations?.[imageId];
    if (!illustration || disabled) return;
    if (remove && !window.confirm(tr(locale,
      "Remove this illustration from the current book? Previous saved versions will keep it.",
      "حذف هذه الصورة من النسخة الحالية؟ ستبقى في الإصدارات القديمة المحفوظة.",
      "Ta bort bilden från aktuell bok? Tidigare versioner behåller den."))) return;
    const wasDirty = dirtyRef.current;
    if (wasDirty && !(await save())) return;
    setPending("illustration"); setError("");
    try {
      const updated = imageEdits[imageId];
      const result = await request<{ book: BookWithCover }>(
        `/api/books/${id}/illustrations/${imageId}`, {
          method: remove ? "DELETE" : "PATCH",
          body: JSON.stringify({ revision: draft!.revision + (wasDirty ? 1 : 0),
            ...(!remove ? { caption: updated?.caption ?? illustration.caption,
              size: updated?.size ?? illustration.size } : {}) }),
        });
      setBook(result.book); setDraft(result.book);
      dirtyRef.current = false; setDirty(false);
      setImageEdits(state => { const next = { ...state }; delete next[imageId]; return next; });
    } catch (e) { setError(codeOf(e)); }
    finally { setPending(""); }
  }
  function addChapter(after?: string) {
    if (!draft || draft.outline.length >= 30 || disabled) return;
    const item = { id: crypto.randomUUID(),
      title: tr(draft.language, "New chapter", "فصل جديد", "Nytt kapitel"),
      summary: tr(draft.language,
        "Explain what happens or what the reader learns in this chapter.",
        "اشرح ما يحدث أو ما سيتعلمه القارئ في هذا الفصل.",
        "Beskriv vad som händer eller vad läsaren lär sig i kapitlet.") };
    change(b => { const outline = [...b.outline];
      const i = outline.findIndex(c => c.id === after);
      outline.splice(i < 0 ? outline.length : i + 1, 0, item);
      return { ...b, outline, chapter_count: outline.length };
    });
    setChapterId(item.id);
  }
  function deleteChapter(target: string) {
    if (!draft || draft.outline.length <= 1 || disabled ||
        !window.confirm(tr(locale,
          "Delete this chapter? You can recover an earlier version.",
          "حذف هذا الفصل؟ يمكنك استعادة نسخة أقدم.",
          "Ta bort kapitlet? En äldre version kan återställas."))) return;
    change(b => { const outline = b.outline.filter(c => c.id !== target);
      const chapters = { ...b.chapters }; delete chapters[target];
      return { ...b, outline, chapters, chapter_count: outline.length };
    });
    if (target === chapterId) setChapterId(draft.outline.find(c => c.id !== target)?.id || "");
  }
  function splitChapter() {
    if (!draft || !active || !current || draft.outline.length >= 30 || disabled) return;
    const pos = chapterEditorRef.current?.selectionStart ?? Math.floor(current.content.length / 2);
    const boundary = current.content.lastIndexOf("\n", pos);
    if (boundary < 120 || current.content.length - boundary < 120) { setError("invalid_input"); return; }
    const newId = crypto.randomUUID();
    change(b => { const chapter = b.chapters[active.id];
      const outline = [...b.outline];
      outline.splice(outline.findIndex(c => c.id === active.id)+1,0,{
        id: newId, title: tr(locale,"Next section","القسم التالي","Nästa del"),
        summary: tr(locale,"Continue the previous chapter's ideas.","تكملة أفكار الفصل السابق.","Fortsätt på föregående kapitel.") });
      return { ...b, outline, chapter_count: outline.length,
        chapters: { ...b.chapters,
          [active.id]: { ...chapter, content: chapter.content.slice(0,boundary).trim() },
          [newId]: { content: chapter.content.slice(boundary).trim(), summary: chapter.summary },
        } };
    });
    setChapterId(newId);
  }
  function mergeNextChapter() {
    if (!draft || !active || !current || disabled) return;
    const next = draft.outline[draft.outline.findIndex(c => c.id === active.id)+1];
    if (!next || !draft.chapters[next.id]) return;
    const merged = current.content + "\n\n" + draft.chapters[next.id].content;
    if (merged.length > 30000) { setError("too_large"); return; }
    if (!window.confirm(tr(locale, "Merge the next chapter into this one?",
      "هل تريد دمج الفصل التالي في هذا الفصل؟","Slå ihop nästa kapitel med detta?"))) return;
    change(b => {const chapters = {...b.chapters}; chapters[active.id] = { ...chapters[active.id], content: merged };
      delete chapters[next.id];const outline=b.outline.filter(c=>c.id!==next.id);
      return {...b,chapters,outline,chapter_count:outline.length};
    });
  }
  async function importManuscript(file: File) {
    if (!draft || !active || disabled) return;
    if (!/\.(txt|md)$/i.test(file.name) || file.size > 450000) {
      setImportError(tr(locale,"Choose a TXT or Markdown file (max 450 KB).",
        "اختر ملف TXT أو Markdown حتى 450 كيلوبايت.",
        "Välj TXT eller Markdown (högst 450 kB)."));return;
    }
    const text=(await file.text()).replace(/\r\n?/g,"\n").replace(/\u0000/g,"").trim();
    if (!text || text.length > 30000) {
      setImportError(tr(locale,"File must contain 1–30,000 characters.",
        "يجب أن يحتوي الملف على 1 إلى 30 ألف حرف.",
        "Filen måste innehålla 1–30 000 tecken."));return;
    }
    setImportError("");
    if (current?.content && !window.confirm(tr(locale,
      "Replace this chapter with the imported text?","استبدال نص الفصل بالنص المستورد؟",
      "Ersätt kapitlet med den importerade texten?"))) return;
    change(b=>({...b,chapters:{...b.chapters,[active.id]:{
      content:text,summary:b.chapters[active.id]?.summary ||
      b.outline.find(c=>c.id===active.id)?.summary || text.slice(0,200),
    }}}));
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
          cover_direction: draft.cover_direction || "",
          back_blurb: draft.back_blurb || "",
          author_bio: draft.author_bio || "",
          dedication: draft.dedication || "",
          preface: draft.preface || "",
          acknowledgments: draft.acknowledgments || "",
          copyright_notice: draft.copyright_notice || "",
          layout_theme: draft.layout_theme || "classic",
          outline: draft.outline,
          chapters: draft.chapters,
        }),
      });
      setBook(d.book);
      const editedWhileSaving = editSequenceRef.current !== savingSequence;
      if (editedWhileSaving) {
        // Never replace a newer on-screen draft with the older request body.
        // Advance only the optimistic revision so autosave can persist it next.
        setDraft((current) => current
          ? { ...current, revision: d.book.revision }
          : d.book);
        dirtyRef.current = true;
        setDirty(true);
      } else {
        setDraft(d.book);
        dirtyRef.current = false;
        setDirty(false);
        try { sessionStorage.removeItem(backupKey); } catch {}
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
  async function generate(kind: JobKind, chapter?: string,
    edit?: {start:number;end:number;action:"improve"|"shorten"|"expand"|"proofread"|"tone"}) {
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
    if (kind === "illustration" && (!chapter || !draft.chapters[chapter] || imagePrompt.trim().length < 10)) {
      setError("invalid_input"); return;
    }
    const imageInsertPosition = kind === "illustration" && chapter ?
      imagePosition(draft.chapters[chapter].content) : 0;
    if (dirtyRef.current && !(await save())) return;
    // A lost HTTP response must not trigger a second (billable) AI job.
    // Reuse the same request ID on uncertain network errors, even after reload.
    const requestKey = `ebook-studio:generate:${id}:${kind}:${chapter || "all"}`;
    let requestId = "";
    try { requestId = sessionStorage.getItem(requestKey) || ""; } catch {}
    if (!/^[0-9a-f-]{36}$/i.test(requestId)) requestId = crypto.randomUUID();
    try { sessionStorage.setItem(requestKey, requestId); } catch {}
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
          ...(kind === "text_edit" && edit ? {
            text_action: edit.action, text_start: edit.start, text_end: edit.end,
          } : {}),
          ...(kind === "illustration" ? {
            image_prompt: imagePrompt.trim(), image_caption: imageCaption.trim(),
            image_position: imageInsertPosition, image_size: imageSize,
          } : {}),
        }),
      });
      try { sessionStorage.removeItem(requestKey); } catch {}
      setJob(d.job);
      await load();
    } catch (e) {
      const code = codeOf(e);
      // On an unknown failure the request might have started server-side.
      // Retain its idempotency key for a safe retry rather than double billing.
      if (code !== "service_error" && code !== "offline") {
        try { sessionStorage.removeItem(requestKey); } catch {}
      }
      setError(code);
      if (config.billing && (code === "insufficient_credits" || code === "free_preview_used"))
        setModal("credits");
      if (code === "busy") await load();
    } finally {
      generatingRef.current = false;
      setPending("");
    }
  }
  async function createManualOutline() {
    if (!book || !draft || disabled || draft.outline.length) return;
    if (!window.confirm(tr(
      locale,
      "Create an editable chapter outline without AI? Nothing will be charged. You will write the titles and summaries yourself.",
      "هل تريد إنشاء فهرس يدوي قابل للتعديل دون ذكاء اصطناعي ودون أي تكلفة؟ ستكتب عناوين الفصول وملخصاتها بنفسك.",
      "Skapa en redigerbar disposition utan AI och utan kostnad? Du skriver själv rubriker och sammanfattningar.",
    ))) return;
    setPending("manual-outline");
    setError("");
    try {
      const { book: result } = await request<{ book: BookWithCover }>(
        `/api/books/${id}`,
        { method: "POST", body: JSON.stringify({
          action: "manual_outline", revision: book.revision,
        }) },
      );
      setBook(result);
      setDraft(result);
      setJob(null);
      setChapterId(result.outline[0]?.id || "");
      setDirty(false);
      dirtyRef.current = false;
      try { sessionStorage.removeItem(backupKey); } catch {}
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
      try { sessionStorage.removeItem(backupKey); } catch {}
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
  function proposeTextEdit(action:"improve"|"shorten"|"expand"|"proofread"|"tone") {
    if (!draft || !active || !current || disabled || !book?.unlocked) return;
    let start=0,end=0;
    if (visualMode && !read) {
      const selection=visualSelectedRef.current.trim();
      if (selection.length < 4) {
        setImportError(tr(locale,"Select a passage in the visual editor first.",
          "حدد فقرة في المحرر البصري أولًا.","Markera en text i den visuella redigeraren."));return;
      }
      start=current.content.indexOf(selection);
      end=start+selection.length;
      if(start<0 || current.content.indexOf(selection,start+1)!==-1) {
        setImportError(tr(locale,"Select a unique passage, or use Markdown mode for precise selection.",
          "اختر نصًا غير متكرر أو استخدم وضع النص الأصلي للتحديد بدقة.",
          "Markera unik text eller använd källtextläget."));return;
      }
    } else {
      const el=chapterEditorRef.current;
      if (!el) return;
      start=el.selectionStart;end=el.selectionEnd;
    }
    if (end-start<4 || end-start>1800) {
      setImportError(tr(locale,"Select 4 to 1,800 characters.",
        "حدد نصًا من 4 إلى 1800 حرف.","Markera 4–1800 tecken."));return;
    }
    setImportError("");
    void generate("text_edit",active.id,{start,end,action});
  }
  async function decideTextEdit(accept:boolean) {
    if (!book?.text_edit_candidate || disabled) return;
    let revision=book.revision;
    if(dirtyRef.current) {if(!(await save()))return;revision++;}
    setPending(accept?"apply-ai-edit":"reject-ai-edit");setError("");
    try {
      const d=await request<{book:BookWithCover}>(`/api/books/${id}/text-edit`,{
        method:"POST",body:JSON.stringify({revision,accept}),
      });
      setBook(d.book);setDraft(d.book);dirtyRef.current=false;setDirty(false);
    } catch(e){setError(codeOf(e));}
    finally{setPending("");}
  }
  async function decideCoverSuggestion(accept: boolean, side: "front" | "back" = "front") {
    if (!(side === "back" ? book?.back_cover_candidate_path : book?.cover_candidate_path) || disabled) return;
    let revision = book!.revision;
    if (dirtyRef.current) {
      if (!(await save())) return;
      revision++;
    }
    setPending(accept ? "accept-cover" : "reject-cover");
    setError("");
    try {
      const { book: updated } = await request<{ book: BookWithCover }>(
        `/api/books/${id}/cover`,
        { method: "POST", body: JSON.stringify({ action: accept ? "accept" : "reject", revision, side }) },
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
    if (!window.confirm(tr(
      locale,
      "Restore this saved book and its language? Your current version will be archived and can be restored later.",
      "هل تريد استعادة هذا الإصدار بلغته وفصوله؟ ستُحفظ نسختك الحالية أيضًا في السجل ويمكن استعادتها لاحقًا.",
      "Återställa den sparade boken och dess språk? Den aktuella versionen arkiveras och kan återställas senare.",
    ))) return;
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
        { method: "POST", body: JSON.stringify({ version_id: version.id, revision }) },
      );
      setBook(restored);
      setDraft(restored);
      setJob(null);
      setRestartLanguage(isArabicBrief(restored.idea) ? "ar" : restored.language);
      setChapterId(restored.outline[0]?.id || "");
      dirtyRef.current = false;
      setDirty(false);
      setModal(null);
      try { sessionStorage.removeItem(backupKey); } catch {}
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
              {book.unlocked ? (config.ownerTrial ? tr(locale, "Ready to test", "جاهز للتجربة", "Redo att testa") : t.unlocked) : config.ownerTrial ? tr(locale, "Free trial", "تجربة مجانية", "Gratis test") : t.sampleBadge}
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
          {!online && (
            <div className="notice offline-warning" role="status">
              {tr(locale,
                "You are offline. Your changes are not saved to the cloud yet. Keep this page open; automatic saving resumes when the connection returns.",
                "الاتصال مقطوع. تعديلاتك لم تُحفظ على السحابة بعد. اترك الصفحة مفتوحة، وسيُستأنف الحفظ تلقائيًا عند عودة الإنترنت.",
                "Du är offline. Ändringarna har inte sparats i molnet ännu. Låt sidan vara öppen. Automatisk sparning återupptas när anslutningen återkommer.")}
            </div>
          )}
          {recoveryDraft && !dirty && (
            <div className="notice draft-recovery" role="status">
              <strong>{tr(locale, "Recover unsaved changes?", "هل تريد استعادة التعديلات غير المحفوظة؟", "Återställa osparade ändringar?")}</strong>
              <p>{tr(locale,
                "A draft from this browser tab was found. You can restore it or keep the last cloud-saved version.",
                "وُجدت مسودة من هذا المتصفح. يمكنك استعادتها أو الإبقاء على آخر نسخة محفوظة على السحابة.",
                "Ett utkast från den här webbläsarfliken hittades. Återställ det eller behåll den senast molnsparade versionen.")}</p>
              <div className="cover-confirm-buttons">
                <button type="button" className="button button-primary button-small" onClick={() => {
                  editSequenceRef.current += 1;
                  setDraft(recoveryDraft);
                  dirtyRef.current = true;
                  setDirty(true);
                  setRecoveryDraft(null);
                }}>{tr(locale, "Restore draft", "استعادة المسودة", "Återställ utkast")}</button>
                <button type="button" className="button button-outline button-small" onClick={() => {
                  try { sessionStorage.removeItem(backupKey); } catch {}
                  setRecoveryDraft(null);
                }}>{tr(locale, "Keep saved version", "الإبقاء على النسخة المحفوظة", "Behåll sparad version")}</button>
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
              <p>{config.ownerTrial &&
                ["ai_daily_limit", "ai_image_daily_limit", "ai_book_limit", "rate_limit"].includes(job.error_code || "")
                ? tr(locale,
                  "This error came from an earlier test limit. Your private test account is now exempt. Retry generation.",
                  "هذا خطأ قديم من حدود التجربة السابقة. رُفعت حدود التوليد عن حسابك الخاص؛ اضغط إعادة محاولة التوليد.",
                  "Felet kommer från en tidigare testgräns. Ditt privata testkonto är nu undantaget. Försök generera igen.")
                : errorMessage(job.error_code || "generation_failed", locale)}</p>
              <p className="muted" dir="ltr" style={{ fontSize: 12 }}>
                {tr(locale, "Support reference", "رقم الخطأ للدعم", "Felreferens")}: {job.id.slice(0, 12)}
              </p>
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
                  <button
                    type="button"
                    className="button button-outline"
                    disabled={disabled}
                    onClick={() => void createManualOutline()}
                  >
                    <BookOpen size={17} />
                    {tr(locale,
                      "Create editable outline without AI (free)",
                      "إنشاء فهرس يدوي دون ذكاء اصطناعي (مجاني)",
                      "Skapa redigerbar disposition utan AI (gratis)")}
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
                        <div className="chapter-move-actions">
                          <button type="button" aria-label={tr(locale, "Move chapter up", "نقل الفصل للأعلى", "Flytta kapitlet upp")}
                            title={tr(locale, "Move up", "أعلى", "Flytta upp")} disabled={disabled || i === 0}
                            onClick={() => change((b) => {
                              const outline = [...b.outline];
                              [outline[i - 1], outline[i]] = [outline[i], outline[i - 1]];
                              return { ...b, outline };
                            })}><ArrowUp size={16} /></button>
                          <button type="button" aria-label={tr(locale, "Move chapter down", "نقل الفصل للأسفل", "Flytta kapitlet ned")}
                            title={tr(locale, "Move down", "أسفل", "Flytta ned")} disabled={disabled || i === draft.outline.length - 1}
                            onClick={() => change((b) => {
                              const outline = [...b.outline];
                              [outline[i], outline[i + 1]] = [outline[i + 1], outline[i]];
                              return { ...b, outline };
                            })}><ArrowDown size={16} /></button>
                          <button type="button" disabled={disabled || draft.outline.length >= 30}
  title={tr(locale,"Add chapter after","إضافة فصل بعده","Lägg till efter")}
  onClick={() => addChapter(c.id)}><Plus size={16}/></button>
<button type="button" disabled={disabled || draft.outline.length <= 1}
  title={tr(locale,"Delete chapter","حذف الفصل","Ta bort kapitel")}
  onClick={() => deleteChapter(c.id)}><Trash2 size={16}/></button>
{draft.chapters[c.id] && <Check className="chapter-check" size={17} />}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="editor-bottom-actions">
                    <button type="button" className="button button-outline" disabled={disabled || draft.outline.length >= 30}
                      onClick={() => addChapter()}>
                      <Plus size={17}/>{tr(locale,"Add chapter","إضافة فصل جديد","Lägg till kapitel")}
                    </button>
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
              <div className="chapter-author-actions">
                 <button type="button" className="button button-outline button-small"
                   disabled={disabled || draft.outline.length >= 30} onClick={() => addChapter(active?.id)}>
                   <Plus size={15}/>{tr(locale,"New chapter","فصل جديد","Nytt kapitel")}
                 </button>
                 {current && <button type="button" className="button button-outline button-small"
                   disabled={disabled || draft.outline.length >= 30} onClick={splitChapter}>
                   {tr(locale,"Split at cursor","تقسيم عند المؤشر","Dela vid markören")}</button>}
                 {current && <button type="button" className="button button-outline button-small"
                   disabled={disabled || !draft.chapters[draft.outline[draft.outline.findIndex(c => c.id === active?.id)+1]?.id]}
                   onClick={mergeNextChapter}>{tr(locale,"Merge next","دمج مع التالي","Slå ihop nästa")}</button>}
                 <label className="button button-outline button-small">
                   {tr(locale,"Import TXT / MD","استيراد TXT / MD","Importera TXT / MD")}
                   <input type="file" accept=".txt,.md,text/plain,text/markdown" hidden disabled={disabled || !active}
                     onChange={e=>{const file=e.currentTarget.files?.[0];e.currentTarget.value="";if(file)void importManuscript(file);}}/>
                 </label>
                 {importError && <p className="error-message" role="alert">{importError}</p>}
               </div>
               {current && book.unlocked && config.ai && (
                 <div className="ai-writing-toolbar" role="group" aria-label={tr(locale,"AI writing assistant","مساعد الكتابة بالذكاء الاصطناعي","AI-skrivhjälp")}>
                   <span><Sparkles size={16}/>{tr(locale,"AI on selected text","AI للنص المحدد","AI på markerad text")}</span>
                   {([
                     ["improve",tr(locale,"Improve","تحسين","Förbättra")],
                     ["shorten",tr(locale,"Shorten","اختصار","Förkorta")],
                     ["expand",tr(locale,"Expand","توسيع","Utöka")],
                     ["proofread",tr(locale,"Correct","تصحيح","Korrekturläs")],
                     ["tone",tr(locale,"Style","تغيير الأسلوب","Anpassa tonen")],
                   ] as const).map(([action,label])=><button type="button" key={action}
                     disabled={disabled || !!book.text_edit_candidate}
                     onClick={()=>proposeTextEdit(action)}>{label}</button>)}
                 </div>
               )}
               {book.text_edit_candidate && (
                 <section className="ai-edit-candidate" aria-label={tr(locale,"AI edit proposal","اقتراح AI","AI-förslag")}>
                   <strong>{tr(locale,"AI rewrite to review","راجع النص المقترح من AI","Granska AI-förslaget")}</strong>
                   <div className="ai-edit-compare">
                     <div><b>{tr(locale,"Original","الأصل","Original")}</b><p>{book.text_edit_candidate.original}</p></div>
                     <div><b>{tr(locale,"Suggestion","الاقتراح","Förslag")}</b><p>{book.text_edit_candidate.replacement}</p></div>
                   </div>
                   <div className="cover-confirm-buttons">
                     <button type="button" className="button button-primary button-small" disabled={disabled}
                       onClick={()=>void decideTextEdit(true)}><Check size={16}/>{tr(locale,"Apply","اعتماد التعديل","Använd")}</button>
                     <button type="button" className="button button-outline button-small" disabled={disabled}
                       onClick={()=>void decideTextEdit(false)}>{tr(locale,"Keep original","الاحتفاظ بالأصل","Behåll original")}</button>
                   </div>
                 </section>
               )}
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
                  {!read && <button type="button" className={visualMode ? "selected" : ""}
                    onClick={()=>setVisualMode(true)}>
                    {tr(locale,"Visual","محرر بصري","Visuell")}
                  </button>}
                  {!read && <button type="button" className={!visualMode ? "selected" : ""}
                    onClick={()=>setVisualMode(false)}>
                    {tr(locale,"Markdown","النص الأصلي","Källtext")}
                  </button>}
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
              {current && (
                <div className="illustration-toolbar">
                  <button type="button" className="button button-outline button-small"
                    disabled={disabled || !book.unlocked}
                    onClick={() => setShowIllustrations(value => !value)}>
                    <ImagePlus size={17} /> {tr(locale, "Insert image", "إضافة صورة داخل الفصل", "Infoga bild")}
                  </button>
                  <button type="button" className="button button-outline button-small"
                    disabled={disabled} onClick={addDivider}>
                    <SeparatorHorizontal size={17} /> {tr(locale, "Scene divider", "فاصل زخرفي صغير", "Scenavdelare")}
                  </button>
                </div>
              )}
              {current && showIllustrations && (
                <div className="illustration-inserter" dir={locale === "ar" ? "rtl" : "ltr"}>
                  <strong>{tr(locale, "Illustrations inside your book", "صور ورسومات داخل كتابك", "Illustrationer i din bok")}</strong>
                  <p className="muted">{tr(locale, "Place images between paragraphs or at chapter boundaries. Pages adapt to each reader's screen.", "أدرج الصور بين الفقرات أو في بداية الفصل أو نهايته. صفحات الكتاب تتغير بحسب شاشة القارئ.", "Lägg till bilder mellan stycken eller vid kapitelgränser. Sidor anpassas efter skärmen.")}</p>
                  <div className="illustration-fields">
                    <label>{tr(locale, "Insert at", "موضع الصورة", "Placering")}
                      <select value={imagePlacement} onChange={e => setImagePlacement(e.target.value as "cursor"|"start"|"end")}>
                        <option value="cursor">{tr(locale, "Text cursor", "موضع المؤشر", "Textmarkören")}</option>
                        <option value="start">{tr(locale, "Chapter start", "بداية الفصل", "Kapitelstart")}</option>
                        <option value="end">{tr(locale, "Chapter end", "نهاية الفصل", "Kapitelslut")}</option>
                      </select>
                    </label>
                    <label>{tr(locale, "Image size", "حجم الصورة", "Bildstorlek")}
                      <select value={imageSize} onChange={e => setImageSize(e.target.value as "small"|"medium"|"full")}>
                        <option value="small">{tr(locale, "Small", "صغير", "Liten")}</option>
                        <option value="medium">{tr(locale, "Medium", "متوسط", "Mellan")}</option>
                        <option value="full">{tr(locale, "Full width", "عرض كامل", "Full bredd")}</option>
                      </select>
                    </label>
                  </div>
                  <label>{tr(locale, "Caption (optional)", "وصف أسفل الصورة (اختياري)", "Bildtext (valfritt)")}
                    <input maxLength={240} value={imageCaption} onChange={e => setImageCaption(e.target.value)} />
                  </label>
                  <strong>{tr(locale, "Built-in illustration library · free", "مكتبة الرسومات الداخلية · مجانية", "Inbyggt bildbibliotek · gratis")}</strong>
                  <div className="illustration-library-grid">
                    {(["mountain", "botanical", "stars", "waves"] as const).map(name => (
                      <button type="button" key={name} disabled={disabled}
                        onClick={() => void insertLibrary(name)}>
                        <img src={`/illustrations/${name}.png`} alt={name} loading="lazy" />
                        <span>{tr(locale,
                          ({mountain:"Landscape",botanical:"Botanical",stars:"Night sky",waves:"Ocean"} as const)[name],
                          ({mountain:"طبيعة",botanical:"نباتات",stars:"سماء ليلية",waves:"بحر"} as const)[name],
                          ({mountain:"Landskap",botanical:"Botanik",stars:"Stjärnhimmel",waves:"Hav"} as const)[name])}</span>
                      </button>
                    ))}
                  </div>
                  <label className="cover-upload-label">
                    {tr(locale, "Upload an image (PNG, JPG, WebP · max 3 MB)", "ارفع صورة من جهازك (PNG أو JPG أو WebP · حتى 3 ميغابايت)", "Ladda upp bild (PNG, JPG, WebP · max 3 MB)")}
                    <input type="file" accept="image/png,image/jpeg,image/webp" disabled={disabled}
                      onChange={e => { const file = e.currentTarget.files?.[0]; e.currentTarget.value = ""; if (file) void uploadIllustration(file); }} />
                  </label>
                  <label>{tr(locale, "Describe the AI illustration", "صف الصورة التي تريد توليدها بالذكاء الاصطناعي", "Beskriv AI-illustrationen")}
                    <textarea rows={3} maxLength={700} value={imagePrompt} onChange={e => setImagePrompt(e.target.value)}
                      placeholder={tr(locale, "A scene from this chapter, a character, or a visual explanation…", "مشهد من هذا الفصل أو شخصية أو رسم يوضح فكرة...", "En scen, en karaktär eller en förklarande bild…")} />
                  </label>
                  <button type="button" className="button button-primary"
                    disabled={disabled || !config.artwork || !config.ai || imagePrompt.trim().length < 10}
                    onClick={() => void generate("illustration", active?.id)}>
                    <Sparkles size={17} /> {tr(locale, "Generate and insert AI image", "توليد الصورة وإدراجها في الفصل", "Skapa och infoga AI-bild")}
                  </button>
                </div>
              )}
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
                    <Markdown text={current.content} illustrations={draft.illustrations} bookId={id} />
                  </div>
                ) : visualMode && active ? (
                  <VisualChapterEditor key={active.id} chapterId={active.id}
                    content={current.content} bookId={id} illustrations={draft.illustrations}
                    disabled={disabled}
                    onChange={content => change(b=>({...b,chapters:{
                      ...b.chapters,[active.id]:{...b.chapters[active.id],content}
                    }}))}
                    onSelection={value=>{visualSelectedRef.current=value;}}
                    onInsertImage={position=>{
                      cursorRef.current=position;
                      setImagePlacement("cursor");
                      setShowIllustrations(true);
                    }} />
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
                      onClick={e => { cursorRef.current = e.currentTarget.selectionStart; }}
                      onKeyUp={e => { cursorRef.current = e.currentTarget.selectionStart; }}
                      onSelect={e => { cursorRef.current = e.currentTarget.selectionStart; }}
                      onChange={(e) => {
                        cursorRef.current = e.currentTarget.selectionStart;
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
              {current && Object.values(draft.illustrations || {}).some(asset => current.content.includes(`[[illustration:${asset.id}]]`)) && (
                <div className="illustration-manager">
                  <strong>{tr(locale, "Images in this chapter", "صور هذا الفصل", "Bilder i detta kapitel")}</strong>
                  {Object.values(draft.illustrations || {}).filter(asset => current.content.includes(`[[illustration:${asset.id}]]`)).map(asset => (
                    <div className="illustration-manager-row" key={asset.id}>
                      <img src={asset.source === "library" && asset.preset
                        ? `/illustrations/${asset.preset}.png`
                        : `/api/books/${id}/illustrations/${asset.id}`}
                        alt={asset.alt || asset.caption} loading="lazy" />
                      <div className="illustration-manager-fields">
                        <input aria-label={tr(locale, "Image caption", "وصف الصورة", "Bildtext")}
                          maxLength={240} disabled={disabled}
                          value={imageEdits[asset.id]?.caption ?? asset.caption}
                          onChange={e => setImageEdits(prev => ({
                            ...prev, [asset.id]: { caption: e.target.value, size: prev[asset.id]?.size ?? asset.size },
                          }))} />
                        <select aria-label={tr(locale, "Image size", "حجم الصورة", "Bildstorlek")}
                          disabled={disabled} value={imageEdits[asset.id]?.size ?? asset.size}
                          onChange={e => setImageEdits(prev => ({
                            ...prev, [asset.id]: { caption: prev[asset.id]?.caption ?? asset.caption,
                              size: e.target.value as "small" | "medium" | "full" },
                          }))}>
                          <option value="small">{tr(locale, "Small", "صغير", "Liten")}</option>
                          <option value="medium">{tr(locale, "Medium", "متوسط", "Mellan")}</option>
                          <option value="full">{tr(locale, "Full", "كامل", "Full")}</option>
                        </select>
                        <div className="cover-confirm-buttons">
                          <button type="button" className="button button-small button-outline"
                            disabled={disabled} onClick={() => void changeExistingImage(asset.id)}>
                            <Save size={14}/>{tr(locale, "Apply", "تطبيق", "Spara")}
                          </button>
                          <button type="button" className="button button-small button-outline"
                            disabled={disabled} onClick={() => void changeExistingImage(asset.id, true)}>
                            <Trash2 size={14}/>{tr(locale, "Remove", "حذف", "Ta bort")}
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
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
                  <div className="cover-side-switch" role="group" aria-label={tr(locale, "Cover side", "جهة الغلاف", "Omslagssida")}>
                    <button type="button" className={coverSide === "front" ? "active" : ""} aria-pressed={coverSide === "front"} onClick={() => setCoverSide("front")}>{tr(locale, "Front", "الأمام", "Framsida")}</button>
                    <button type="button" className={coverSide === "back" ? "active" : ""} aria-pressed={coverSide === "back"} onClick={() => setCoverSide("back")}>{tr(locale, "Back", "الخلف", "Baksida")}</button>
                  </div>
                  {coverSide === "front" ? (
                    <BookCover
                      title={draft.title}
                      subtitle={draft.subtitle}
                      author={draft.author}
                      style={draft.cover_style}
                      language={draft.language}
                      image={draft.cover_candidate_url || (draft.use_artwork ? draft.cover_url : null)}
                    />
                  ) : (
                    <BookBackCover title={draft.title} author={draft.author}
                      style={draft.cover_style} language={draft.language}
                      blurb={draft.back_blurb || draft.idea}
                      authorBio={draft.author_bio || ""}
                      image={draft.back_cover_candidate_url || draft.back_cover_url} />
                  )}
                </div>
                <div className="stack">
                  <fieldset className="cover-gallery" disabled={disabled}>
                    <legend>{tr(locale, "Choose a professionally designed cover", "اختر تصميم الغلاف المناسب لكتابك", "Välj ett professionellt bokomslag")}</legend>
                    <p className="muted">{tr(locale, "18 templates. Suggested designs for your book type come first. No AI credits needed.", "18 تصميمًا. تظهر التصاميم المناسبة لنوع كتابك أولًا، وتغييرها لا يستهلك الذكاء الاصطناعي.", "18 omslagsmallar. Rekommendationerna för din boktyp visas först. Ingen AI-kostnad.")}</p>
                    <div className="cover-template-grid">
                      {(showAllCoverTemplates ? [...recommendedCoverStyles(draft.kind), ...coverStyles.filter((style) => !recommendedCoverStyles(draft.kind).includes(style))] : recommendedCoverStyles(draft.kind)).map((style, index) => (
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
                    <button
                      type="button"
                      className="text-link"
                      disabled={disabled}
                      onClick={() => setShowAllCoverTemplates((value) => !value)}
                    >
                      {showAllCoverTemplates
                        ? tr(locale, "Show the five recommendations", "عرض المقترحات الخمسة فقط", "Visa bara fem förslag")
                        : tr(locale, "Explore all 18 cover designs", "استكشف جميع تصاميم الأغلفة الـ18", "Utforska alla 18 omslagsmallar")}
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
                  <div className="cover-content-fields" dir={draft.language === "ar" ? "rtl" : "ltr"}>
                    <label>
                      {tr(locale, "Describe your ideal AI cover", "صف للذكاء الاصطناعي الغلاف الذي تتخيله", "Beskriv ditt drömomslag för AI")}
                      <textarea rows={4} maxLength={800} disabled={disabled} value={draft.cover_direction || ""}
                        placeholder={tr(locale, "Scene, main character, symbol, atmosphere, colors... The AI will use this alongside your book's idea.", "ما المشهد أو الشخصية أو الرمز أو الجو والألوان التي تريدها؟ سيقرأ الذكاء الاصطناعي وصفك مع فكرة الكتاب.", "Scen, huvudperson, symbol, stämning, färger... AI kombinerar detta med bokens idé.")}
                        onChange={(e) => change((b) => ({ ...b, cover_direction: e.target.value }))} />
                    </label>
                    <p className="muted">{tr(locale,
                      "Need an idea? Choose a starting direction below, then edit it before generating. These starters are free and do not call AI.",
                      "لست متأكدًا من شكل الغلاف؟ اختر فكرة أولية وعدّلها قبل التوليد. هذه المقترحات مجانية ولا تطلب الذكاء الاصطناعي.",
                      "Behöver du en idé? Välj ett gratis förslag och redigera det innan du genererar. Dessa förslag använder inte AI.")}</p>
                    <div className="cover-concept-list">
                      {[
                        tr(locale, "Symbolic: a single distinctive object representing the central theme, generous negative space, editorial lighting.", "رمزي: عنصر واحد مميز يرمز إلى فكرة الكتاب الأساسية مع إضاءة فنية ومساحة هادئة للعنوان.", "Symbolisk: ett föremål som fångar bokens kärna, gott om utrymme och redaktionellt ljus."),
                        tr(locale, "Cinematic: a compelling scene from the book's central situation, depth, atmosphere and dramatic composition.", "سينمائي: مشهد مؤثر من موضوع الكتاب الأساسي، بعمق وأجواء وتكوين بصري درامي.", "Filmisk: en stark scen från bokens huvudtema, djup och dramatisk komposition."),
                        tr(locale, "Minimalist: original geometric shapes and a striking visual metaphor specific to this story or subject.", "بسيط وأنيق: أشكال هندسية أصلية واستعارة بصرية قوية مرتبطة بقصة الكتاب أو موضوعه.", "Minimalistisk: originella geometriska former och en tydlig visuell metafor för ämnet."),
                      ].map((idea, index) => (
                        <button type="button" key={index} className="cover-concept-chip" disabled={disabled}
                          onClick={() => change((b) => ({ ...b, cover_direction: idea }))}>{index + 1}. {idea}</button>
                      ))}
                    </div>
                    <label>
                      {tr(locale, "Back cover description", "نبذة الغلاف الخلفي", "Baksidestext")}
                      <textarea rows={5} maxLength={1800} disabled={disabled} value={draft.back_blurb || ""}
                        placeholder={tr(locale, "Write the description a reader sees on the back cover.", "اكتب نصًا يشجّع القارئ على قراءة كتابك.", "Skriv en lockande baksidestext.")}
                        onChange={(e) => change((b) => ({ ...b, back_blurb: e.target.value }))} />
                    </label>
                    <label>
                      {tr(locale, "About the author (back cover)", "نبذة عن المؤلف (الغلاف الخلفي)", "Om författaren (baksida)")}
                      <textarea rows={3} maxLength={800} disabled={disabled} value={draft.author_bio || ""}
                        onChange={(e) => change((b) => ({ ...b, author_bio: e.target.value }))} />
                    </label>
                    <label>
                      {tr(locale, "Dedication (optional)", "الإهداء (اختياري)", "Dedikation (valfritt)")}
                      <textarea rows={2} maxLength={500} disabled={disabled} value={draft.dedication || ""}
                        onChange={(e) => change((b) => ({ ...b, dedication: e.target.value }))} />
                    </label>
                    <label>
                      {tr(locale, "Preface (optional)", "المقدمة (اختيارية)", "Förord (valfritt)")}
                      <textarea rows={5} maxLength={5000} disabled={disabled} value={draft.preface || ""}
                        onChange={(e) => change((b) => ({ ...b, preface: e.target.value }))} />
                    </label>
                    <label>{tr(locale, "Copyright page", "صفحة حقوق النشر", "Upphovsrätt")}
                      <textarea rows={3} maxLength={1000} disabled={disabled}
                        value={draft.copyright_notice || ""}
                        placeholder={tr(locale,"© Author. All rights reserved.","© المؤلف. جميع الحقوق محفوظة.","© Författaren. Alla rättigheter förbehållna.")}
                        onChange={e=>change(b=>({...b,copyright_notice:e.target.value}))}/>
                    </label>
                    <label>{tr(locale, "Acknowledgments", "الشكر والتقدير", "Tack")}
                      <textarea rows={3} maxLength={5000} disabled={disabled} value={draft.acknowledgments || ""}
                        onChange={e=>change(b=>({...b,acknowledgments:e.target.value}))}/>
                    </label>
                    <label>{tr(locale, "Interior layout style", "نمط صفحات الكتاب", "Inlagans stil")}
                      <select disabled={disabled} value={draft.layout_theme || "classic"}
                        onChange={e=>change(b=>({...b,layout_theme:e.target.value as "classic"|"modern"|"literary"}))}>
                        <option value="classic">{tr(locale,"Classic","كلاسيكي","Klassisk")}</option>
                        <option value="modern">{tr(locale,"Modern","حديث","Modern")}</option>
                        <option value="literary">{tr(locale,"Literary","أدبي","Litterär")}</option>
                      </select>
                    </label>
                  </div>
                  <button
                    className="button button-outline"
                    disabled={
                      disabled ||
                      !config.ai ||
                      !config.artwork ||
                      !book.unlocked
                    }
                    onClick={() => { setCoverSide("front"); void generate("cover"); }}
                  >
                    <Sparkles size={17} />
                    {t.aiCover}
                  </button>
                  <p className="muted">{tr(locale,
                    "Generated cover art appears here for your review. It is never included in exports until you approve it.",
                    "ستظهر صورة الغلاف المقترحة هنا لمراجعتها. لن تُستخدم في التنزيل قبل موافقتك.",
                    "Den genererade omslagsbilden visas här för granskning. Den används inte i exporten förrän du godkänner den.")}</p>
                  {draft.cover_candidate_url && (
                    <div className="cover-confirm" role="group" aria-label={tr(locale, "Review AI cover image", "مراجعة الغلاف المقترح", "Granska AI-omslag")}>
                      <strong>{tr(locale, "AI cover suggestion", "غلاف مقترح بالذكاء الاصطناعي", "Förslag på AI-omslag")}</strong>
                      <p>{tr(locale, "The preview on the left shows the suggestion. Accept it, or discard it without changing your current book cover.", "المعاينة على اليسار تُظهر الصورة المقترحة. وافق عليها أو ارفضها دون تغيير الغلاف الحالي.", "Förhandsvisningen till vänster visar förslaget. Godkänn eller avvisa det utan att ändra ditt aktuella omslag.")}</p>
                      <div className="cover-confirm-buttons">
                        <button type="button" className="button button-primary button-small" disabled={disabled} onClick={() => void decideCoverSuggestion(true)}>
                          <Check size={15} /> {tr(locale, "Use this cover", "اعتماد هذا الغلاف", "Använd detta omslag")}
                        </button>
                        <button type="button" className="button button-outline button-small" disabled={disabled} onClick={() => void decideCoverSuggestion(false)}>
                          <Trash2 size={15} /> {tr(locale, "Discard suggestion", "رفض الصورة المقترحة", "Avvisa förslag")}
                        </button>
                      </div>
                    </div>
                  )}
                  {draft.back_cover_candidate_url && (
                    <div className="cover-confirm">
                      <strong>{tr(locale, "AI back cover proposal", "صورة مقترحة للغلاف الخلفي", "AI-förslag för baksidan")}</strong>
                      <div className="cover-confirm-buttons">
                        <button type="button" className="button button-primary button-small" disabled={disabled} onClick={() => void decideCoverSuggestion(true, "back")}><Check size={15} />{tr(locale, "Accept back cover", "اعتماد الغلاف الخلفي", "Godkänn baksidan")}</button>
                        <button type="button" className="button button-outline button-small" disabled={disabled} onClick={() => void decideCoverSuggestion(false, "back")}>{tr(locale, "Discard", "رفض", "Avvisa")}</button>
                      </div>
                    </div>
                  )}
                  <button type="button" className="button button-outline"
                    disabled={disabled || !config.ai || !config.artwork || !book.unlocked}
                    onClick={() => { setCoverSide("back"); void generate("back_cover"); }}>
                    <Sparkles size={17} />{tr(locale, "Generate AI back cover image", "توليد صورة الغلاف الخلفي بالذكاء الاصطناعي", "Generera AI-bild för baksidan")}
                  </button>
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
                      {coverPreviewUrl && (
                        <img className="cover-candidate-thumb" src={coverPreviewUrl} alt={tr(locale, "Preview of your chosen image", "معاينة الصورة التي اخترتها", "Förhandsvisning av vald bild")} />
                      )}
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
                <p>{config.ownerTrial
                  ? tr(locale,
                      "Complete every chapter, then download your book in PDF, Word or EPUB. No site payment is required for your private test.",
                      "أكمل كل الفصول ثم نزّل كتابك بصيغة PDF أو Word أو EPUB. لا يلزم أي دفع داخل الموقع أثناء تجربتك.",
                      "Slutför alla kapitel och ladda sedan ner boken som PDF, Word eller EPUB. Ingen betalning krävs i ditt privata test.")
                  : t.exportHint}</p>
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
              {canExport && !dirty && !pending && (
                <a className="button button-outline button-small" href={`/api/books/${id}/export?format=pdf&preview=1`}
                  target="_blank" rel="noopener noreferrer">
                  <Eye size={16} /> {tr(locale, "View the real exported PDF", "معاينة ملف PDF النهائي الحقيقي", "Förhandsgranska den riktiga PDF-filen")}
                </a>
              )}
              <div
                className="book-preview"
                dir={draft.language === "ar" ? "rtl" : "ltr"}
                lang={draft.language}
              >
                <div className="preview-cover">
                  <BookCover
                    title={draft.title} subtitle={draft.subtitle} author={draft.author}
                    style={draft.cover_style} language={draft.language}
                    image={draft.use_artwork ? draft.cover_url : null}
                  />
                </div>
                {draft.dedication && <section className="preview-toc"><h2>{tr(draft.language, "Dedication", "الإهداء", "Dedikation")}</h2><p>{draft.dedication}</p></section>}
                {draft.preface && <section className="preview-toc"><h2>{tr(draft.language, "Preface", "المقدمة", "Förord")}</h2><Markdown text={draft.preface} /></section>}
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
                      <Markdown text={draft.chapters[c.id].content} illustrations={draft.illustrations} bookId={id} />
                    ) : (
                      <p className="muted">{t.chapterEmpty}</p>
                    )}
                  </article>
                ))}
                <div className="preview-cover">
                  <BookBackCover title={draft.title} author={draft.author}
                    style={draft.cover_style} language={draft.language}
                    blurb={draft.back_blurb || draft.idea}
                    authorBio={draft.author_bio || ""}
                    image={draft.back_cover_url} />
                </div>
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
