"use client";
import { useCallback, useEffect, useRef, useState, type SetStateAction } from "react";
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
import { VisualChapterEditor, type VisualSelection } from "./visual-chapter-editor";
import { DraftHistory } from "@/lib/draft-history";
import { draftKey, editableBook, readDraft, restoreDraft, writeDraft } from "@/lib/draft-storage";
import { BookSectionReader } from "./book-section-reader";
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
type Tab = "brief" | "outline" | "write" | "design" | "preview";
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
  const [draft, setDraftState] = useState<BookWithCover | null>(null);
  const draftRef = useRef<BookWithCover | null>(null);
  const setDraft = useCallback((value: SetStateAction<BookWithCover | null>) => {
    const next = typeof value === "function" ? value(draftRef.current) : value;
    draftRef.current = next;
    setDraftState(next);
  }, []);
  const undoHistory = useRef(new DraftHistory());
  const [historyState, setHistoryState] = useState({ canUndo: false, canRedo: false });
  const [job, setJob] = useState<Job | null>(null);
  const [credits, setCredits] = useState(0);
  const [tab, setTab] = useState<Tab>("brief");
  const [chapterId, setChapterId] = useState("");
  const [chapterWorkspaceOpen, setChapterWorkspaceOpen] = useState(false);
  const lastAIReviewRef = useRef<string | null>(null);
  useEffect(() => {
    const candidate = book?.text_edit_candidate;
    if (!candidate) {lastAIReviewRef.current = null; return;}
    if (!chapterWorkspaceOpen || candidate.chapter_id !== chapterId) return;
    const key = candidate.chapter_id + ":" + candidate.original + ":" + candidate.replacement;
    if (lastAIReviewRef.current === key) return;
    lastAIReviewRef.current = key;
    requestAnimationFrame(() =>
      document.querySelector(".ai-edit-candidate")?.scrollIntoView({block:"center",behavior:"smooth"}));
  }, [book?.text_edit_candidate, chapterWorkspaceOpen, chapterId]);

  const [restartLanguage, setRestartLanguage] = useState<Locale>(locale);
  const [coverCandidate, setCoverCandidate] = useState<File | null>(null);
  const [coverSide, setCoverSide] = useState<"front" | "back">("front");
  const [showAllCoverTemplates, setShowAllCoverTemplates] = useState(false);
  const [coverPreviewUrl, setCoverPreviewUrl] = useState<string | null>(null);
  const [read, setRead] = useState(false);
  const [selectedCount, setSelectedCount] = useState(0);
  const [aiInstruction, setAiInstruction] = useState("");
  const [importError, setImportError] = useState("");
  const [visualMode, setVisualMode] = useState(true);
  const [readerMode, setReaderMode] = useState(true);
  const visualSelectedRef = useRef("");
  const visualRangeRef = useRef<VisualSelection | null>(null);
  const [showIllustrations, setShowIllustrations] = useState(false);
  const [imageFocusId,setImageFocusId]=useState<string | null>(null);
  const imageStartedRef=useRef<string | null>(null);
  const [imageSource, setImageSource] = useState<"library"|"upload"|"ai">("library");
  const [imageCaption, setImageCaption] = useState("");
  const [imageEdits, setImageEdits] = useState<Record<string, { caption: string; size: "small" | "medium" | "full" }>>({});
  const [imagePrompt, setImagePrompt] = useState("");
  const [imageSize, setImageSize] = useState<"small" | "medium" | "full">("medium");
  const [imagePlacement, setImagePlacement] = useState<"cursor" | "start" | "end">("cursor");
  const [replaceImageId, setReplaceImageId] = useState<string | null>(null);
  const cursorRef = useRef(0);
  const [fullscreenEditor, setFullscreenEditor] = useState(false);
  const chapterEditorRef = useRef<HTMLTextAreaElement | null>(null);
  const [pending, setPending] = useState("");
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [dirty, setDirty] = useState(false);
  const [recoveryDraft, setRecoveryDraft] = useState<BookWithCover | null>(null);
  const recoveryCheckedRef = useRef(false);
  const backupKey = draftKey(id);
  const [localSaved, setLocalSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState("");
  const [retryTick, setRetryTick] = useState(0);
  const [online, setOnline] = useState(true);
  const saveFailuresRef = useRef(0);
  const savingRef = useRef(false);
  const saveWaitersRef = useRef<(() => void)[]>([]);
  const generatingRef = useRef(false);
  const editSequenceRef = useRef(0);
  const dirtyRef = useRef(false);
  const mounted = useRef(true);
  const [modal, setModal] = useState<"credits" | "history" | null>(null);
  const [versions, setVersions] = useState<Version[]>([]);
  const busy = !!job && ["queued", "running"].includes(job.status);
  useEffect(()=>{
    if(!imageFocusId)return;
    const focus=()=>{
      const figure=Array.from(document.querySelectorAll<HTMLElement>(".rich-studio [data-book-image-id]"))
        .find(element=>element.dataset.bookImageId===imageFocusId);
      if(!figure)return;
      figure.scrollIntoView({behavior:"smooth",block:"center"});
      setImageFocusId(null);
    };
    requestAnimationFrame(()=>requestAnimationFrame(focus));
  },[imageFocusId,draft?.chapters,chapterWorkspaceOpen]);

  const disabled = busy || !!pending || !!recoveryDraft;
  const persistDraft = useCallback((value: BookWithCover) => {
    try { writeDraft(localStorage, value); setLocalSaved(true); }
    catch { setLocalSaved(false); try { writeDraft(sessionStorage, value); } catch {} }
  }, []);
  const clearBackup = useCallback(() => {
    try { localStorage.removeItem(backupKey); } catch {}
    try { sessionStorage.removeItem(backupKey); } catch {}
    setLocalSaved(false);
  }, [backupKey]);
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
          const saved = readDraft(localStorage, d.book) || readDraft(sessionStorage, d.book);
          if (saved) setRecoveryDraft(saved.book);
        } catch {
          // Private mode or malformed browser storage: cloud save continues normally.
        }
      }
      if(d.job?.kind==="illustration" && d.job.status==="completed" &&
          imageStartedRef.current===d.job.chapter_id){
        const inserted=Object.keys(d.book.illustrations||{}).find(assetId=>!draftRef.current?.illustrations?.[assetId]);
        if(inserted)setImageFocusId(inserted);
        imageStartedRef.current=null;
        setShowIllustrations(false);
      }
      setBook(d.book);
      setLastSavedAt(d.book.updated_at);
      if (!dirtyRef.current) setDraft(d.book);
      setRestartLanguage(isArabicBrief(d.book.idea) ? "ar" : d.book.language);
      setJob(d.job);
      setCredits(d.credits);
      setChapterId(old=>d.book.outline.some(c=>c.id===old)?old:
      (d.book.outline.find(c=>!d.book.chapters[c.id]?.content?.trim())||d.book.outline[0])?.id||"");
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
    const flush = () => { if (dirtyRef.current && draftRef.current) persistDraft(draftRef.current); };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", flush);
    return () => { window.removeEventListener("pagehide", flush); document.removeEventListener("visibilitychange", flush); };
  }, [persistDraft]);

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
      if (navigator.onLine) setRetryTick(value => value + 1);
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
    if (!dirty || !online || disabled || saving || !draft ||
        draft.idea.trim().length<20 || draft.audience.trim().length<3 ||
        (draft.outline.length>0 && !draft.title.trim()) || error === "conflict") return;
    // Debounce saves and back off if the network is unavailable.
    const delay = error === "rate_limit" ? 60_000 : Math.min(30_000, 1_500 * (2 ** Math.min(5, saveFailuresRef.current)));
    const timer = window.setTimeout(() => void save(), delay);
    return () => window.clearTimeout(timer);
  }, [draft, dirty, online, disabled, saving, pending, error, retryTick]);

  function change(fn: (b: BookWithCover) => BookWithCover, typing = false) {
    const before = draftRef.current;
    if (!before) return;
    const next = fn(before);
    undoHistory.current.record(before, next, typing);
    setHistoryState({ canUndo: undoHistory.current.canUndo, canRedo: undoHistory.current.canRedo });
    editSequenceRef.current += 1;
    setDraft(next);
    dirtyRef.current = true;
    setDirty(true);
    persistDraft(next);
  }
  function travelHistory(direction: "undo" | "redo") {
    if (!draftRef.current || disabled) return;
    const next = undoHistory.current[direction](draftRef.current);
    if (!next) return;
    editSequenceRef.current++;
    setDraft(next); dirtyRef.current = true; setDirty(true); persistDraft(next);
    setHistoryState({ canUndo: undoHistory.current.canUndo, canRedo: undoHistory.current.canRedo });
    visualRangeRef.current = null; visualSelectedRef.current = ""; setSelectedCount(0);
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
    setPending("illustration"); setError("");
    if ((wasDirty || savingRef.current) && !(await save())) { setPending(""); return; }
    try {
      const d = await request<{ book: BookWithCover }>(`/api/books/${id}/illustrations`, {
        method: "POST", body: JSON.stringify({
          revision: draftRef.current!.revision,
          chapter_id: active.id, position, preset,
          ...(replaceImageId ? { replace_id: replaceImageId } : {}),
          size: imageSize, caption: imageCaption,
        }),
      });
      const newAsset=Object.keys(d.book.illustrations||{}).find(assetId=>!draftRef.current?.illustrations?.[assetId]);
      if(newAsset)setImageFocusId(newAsset);
      if (draftRef.current) undoHistory.current.record(draftRef.current, d.book);
      setHistoryState({ canUndo: undoHistory.current.canUndo, canRedo: undoHistory.current.canRedo });
      setBook(d.book); setDraft(d.book); clearBackup(); setReplaceImageId(null);
      dirtyRef.current = false; setDirty(false); setShowIllustrations(false);
    } catch (e) { setError(codeOf(e)); }
    finally { setPending(""); }
  }
  async function uploadIllustration(file: File, asLogo = false) {
    if (!draft || !active || !current || disabled) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
        file.size > 3_000_000) { setError("invalid_input"); return; }
    const position = imagePosition(current.content);
    const wasDirty = dirtyRef.current;
    setPending("illustration"); setError("");
    if ((wasDirty || savingRef.current) && !(await save())) { setPending(""); return; }
    try {
      const params = new URLSearchParams({
        revision: String(draftRef.current!.revision),
        chapter_id: active.id, position: String(position),
        size: asLogo ? "small" : imageSize,
        caption: asLogo ? (imageCaption.trim() || tr(locale, "Logo", "الشعار", "Logotyp")) : imageCaption,
      });
      if (replaceImageId) params.set("replace_id", replaceImageId);
      const response = await fetch(`/api/books/${id}/illustrations/upload?${params}`, {
        method: "POST", headers: { "Content-Type": file.type }, body: file,
      });
      const payload = await response.json().catch(() => ({ error: "service_error" }));
      if (!response.ok) throw new Error(payload.error || "service_error");
      const newAsset=Object.keys(payload.book.illustrations||{}).find(assetId=>!draftRef.current?.illustrations?.[assetId]);
      if(newAsset)setImageFocusId(newAsset);
      if (draftRef.current) undoHistory.current.record(draftRef.current, payload.book);
      setHistoryState({ canUndo: undoHistory.current.canUndo, canRedo: undoHistory.current.canRedo });
      setBook(payload.book); setDraft(payload.book); clearBackup(); setReplaceImageId(null);
      dirtyRef.current = false; setDirty(false); setShowIllustrations(false);
    } catch (e) { setError(e instanceof Error ? e.message : "service_error"); }
    finally { setPending(""); }
  }
  async function changeExistingImage(imageId: string, remove = false, override?: {caption:string;size:"small"|"medium"|"full"}) {
    const illustration = draft?.illustrations?.[imageId];
    if (!illustration || disabled) return;
    if (remove && !window.confirm(tr(locale,
      "Remove this illustration from the current book? Previous saved versions will keep it.",
      "حذف هذه الصورة من النسخة الحالية؟ ستبقى في الإصدارات القديمة المحفوظة.",
      "Ta bort bilden från aktuell bok? Tidigare versioner behåller den."))) return;
    const wasDirty = dirtyRef.current;
    setPending("illustration"); setError("");
    if ((wasDirty || savingRef.current) && !(await save())) { setPending(""); return; }
    try {
      const updated = override || imageEdits[imageId];
      const result = await request<{ book: BookWithCover }>(
        `/api/books/${id}/illustrations/${imageId}`, {
          method: remove ? "DELETE" : "PATCH",
          body: JSON.stringify({ revision: draftRef.current!.revision,
            ...(!remove ? { caption: updated?.caption ?? illustration.caption,
              size: updated?.size ?? illustration.size } : {}) }),
        });
      setBook(result.book); setDraft(result.book); clearBackup();
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
  async function importManuscript(file: File, mode: "chapter" | "book" = "chapter") {
    if (!draft || disabled || (mode === "chapter" && !active)) return;
    const docx=/\.docx$/i.test(file.name);
    const text=/\.(txt|md)$/i.test(file.name);
    if ((!docx && !text) || file.size > (docx ? 4_000_000 : 450_000)) {
      setImportError(tr(locale, "Choose a TXT, MD or Word DOCX file under the size limit.",
        "اختر TXT أو MD أو Word DOCX ضمن الحجم المسموح.",
        "Välj TXT, MD eller DOCX inom storleksgränsen."));return;
    }
    setImportError("");setPending("import");
    try {
      const contentType=docx
        ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        : "text/plain";
      const res=await fetch(`/api/books/${id}/import`, {
        method:"POST",headers:{"Content-Type":contentType},body:file,
      });
      const data=await res.json().catch(()=>({error:"invalid_input"}));
      if(!res.ok)throw new Error(data.error || "invalid_input");
      const sections=(data.sections||[]) as {title:string;content:string}[];
      if(!sections.length || sections.length>30)throw new Error("invalid_input");
      if(mode==="book") {
        if(!window.confirm(tr(locale,
          "Replace the book outline and chapters with this imported manuscript? A saved earlier version remains available.",
          "استبدال فصول الكتاب الحالي بالمخطوط المستورد؟ يمكن استعادة النسخة القديمة.",
          "Ersätta bokens kapitel med den importerade texten? En äldre version kan återställas.")))return;
        const outline=sections.map(section=>({
          id:crypto.randomUUID(),title:section.title.slice(0,160) || tr(locale,"Chapter","الفصل","Kapitel"),
          summary:(section.content.trim().slice(0,550)||tr(locale,"Imported chapter.","فصل مستورد.","Importerat kapitel.")),
        }));
        const chapters=Object.fromEntries(outline.map((item,i)=>[item.id,{
          content:sections[i].content,
          summary:sections[i].content.trim().slice(0,750),
        }]));
        change(b=>({...b,outline,chapters,chapter_count:outline.length}));
        setChapterId(outline[0].id);
        setTab("write");
      } else {
        const whole=sections.map(x=>x.content).join("\n\n");
        if(whole.length>30000)throw new Error("too_large");
        const target=active!;
        if(draft.chapters[target.id]?.content && !window.confirm(tr(locale,
          "Replace the current chapter with imported content?",
          "استبدال محتوى الفصل الحالي بالنص المستورد؟",
          "Ersätta det här kapitlet med importerad text?")))return;
        change(b=>({...b,chapters:{...b.chapters,[target.id]:{
          content:whole,summary:whole.slice(0,750),
        }}}));
      }
    } catch(e) {
      setImportError(tr(locale,"Could not import this file. Check its contents and size.",
        "تعذّر استيراد الملف، تحقق من المحتوى والحجم.",
        "Kunde inte importera filen. Kontrollera innehåll och storlek."));
      setError(codeOf(e));
    } finally{setPending("");}
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
  async function openChapterWorkspace(targetId: string) {
    if (!draftRef.current?.outline.some(chapter => chapter.id === targetId)) return;
    if ((dirtyRef.current || savingRef.current) && !(await save(true))) return;
    setChapterId(targetId);
    setChapterWorkspaceOpen(true);
    setRead(false);
    setVisualMode(true);
    setSelectedCount(0);
    visualSelectedRef.current = "";
    visualRangeRef.current = null;
    requestAnimationFrame(() =>
      document.getElementById("chapter-workspace-top")?.scrollIntoView({block:"start",behavior:"smooth"}));
  }
  async function leaveChapterWorkspace() {
    if ((dirtyRef.current || savingRef.current) && !(await save(true))) return;
    setChapterWorkspaceOpen(false);
    setRead(false);
    requestAnimationFrame(() =>
      document.querySelector(".chapter-flow-list")?.scrollIntoView({block:"start",behavior:"smooth"}));
  }
  async function save(checkpoint = false): Promise<boolean> {
    if (savingRef.current) {
      await new Promise<void>(resolve => saveWaitersRef.current.push(resolve));
      return dirtyRef.current ? save(checkpoint) : true;
    }
    const source = draftRef.current;
    if (!source || !dirtyRef.current) return true;
    if (!navigator.onLine) {
      setError("offline");
      return false;
    }
    savingRef.current = true;
    const savingSequence = editSequenceRef.current;
    setSaving(true);
    setError("");
    try {
      const d = await request<{ book: BookWithCover }>(`/api/books/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ ...editableBook(source), checkpoint }),
        signal: AbortSignal.timeout(25_000),
      });
      setBook(d.book);
      setLastSavedAt(d.book.updated_at);
      const editedWhileSaving = editSequenceRef.current !== savingSequence;
      if (editedWhileSaving) {
        // Never replace a newer on-screen draft with the older request body.
        // Advance only the optimistic revision so autosave can persist it next.
        setDraft((current) => current
          ? { ...current, revision: d.book.revision }
          : d.book);
        dirtyRef.current = true;
        setDirty(true);
        if (draftRef.current) persistDraft(draftRef.current);
      } else {
        setDraft(d.book);
        dirtyRef.current = false;
        setDirty(false);
        clearBackup();
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
      setSaving(false);
      const waiters = saveWaitersRef.current.splice(0);
      waiters.forEach(resolve => resolve());
    }
  }
  async function generate(kind: JobKind, chapter?: string,
    edit?: {start:number;end:number;action:"improve"|"shorten"|"expand"|"proofread"|"tone"|"simplify"|"custom";instruction?:string}) {
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
    generatingRef.current = true;
    setPending("generate");
    if ((dirtyRef.current || savingRef.current) && !(await save())) {
      generatingRef.current = false; setPending(""); return;
    }
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
    if(kind==="illustration"){imageStartedRef.current=chapter||null;}
    try {
      const d = await request<{ job: Job }>(`/api/books/${id}/generate`, {
        method: "POST",
        body: JSON.stringify({
          kind,
          chapter_id: chapter,
          request_id: requestId,
          ...(kind === "text_edit" && edit ? {
            text_action: edit.action, text_start: edit.start, text_end: edit.end,
            ...(edit.action==="custom" ? {text_instruction:edit.instruction?.trim().slice(0,500)} : {}),
          } : {}),
          ...(kind === "illustration" ? {
            image_prompt: imagePrompt.trim(), image_caption: imageCaption.trim(),
            image_position: imageInsertPosition, image_size: imageSize,
          } : {}),
        }),
      });
      try { sessionStorage.removeItem(requestKey); } catch {}
      setJob(d.job);
      if(kind==="illustration")setShowIllustrations(false);
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
      clearBackup();
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
    if (dirtyRef.current && !(await save(true))) return;
    setPending("restart");
    setError("");
    try {
      const latest = await request<{ book: BookWithCover }>("/api/books/" + id);
      const { book: fresh } = await request<{ book: BookWithCover }>("/api/books/" + id, {
        method: "POST",
        body: JSON.stringify({
          action: "restart",
          revision: latest.book.revision,
          language: restartLanguage,
        }),
      });
      setBook(fresh);
      setDraft(fresh);
      clearBackup();
      setRecoveryDraft(null);
      setJob(null);
      setChapterId("");
      setTab("brief");
      setCoverCandidate(null);
      dirtyRef.current = false;
      setDirty(false);
    } catch (e) {
      setError(codeOf(e));
    } finally {
      setPending("");
    }
  }
  function proposeTextEdit(action:"improve"|"shorten"|"expand"|"proofread"|"tone"|"simplify"|"custom", range?: VisualSelection) {
    if (!draft || !active || !current || disabled || !book?.unlocked) return;
    if (action === "custom" && aiInstruction.trim().length < 5) {
      setImportError(tr(locale,"Write an instruction first.","اكتب تعليمات التعديل أولًا.","Skriv en instruktion först."));return;
    }
    let start=0,end=0;
    if (visualMode && !read) {
      const precise = range || visualRangeRef.current;
      if (precise && precise.content !== draftRef.current?.chapters[active.id]?.content) {
        change(b => ({ ...b, chapters: { ...b.chapters, [active.id]: { ...b.chapters[active.id], content: precise.content } } }));
      }
      if (precise) { start = precise.start; end = precise.end; }
      else {
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
    void generate("text_edit",active.id,{start,end,action,instruction:action==="custom"?aiInstruction.trim():undefined});
  }
  async function decideTextEdit(accept:boolean) {
    if (!book?.text_edit_candidate || disabled) return;
    setPending(accept?"apply-ai-edit":"reject-ai-edit");setError("");
    if ((dirtyRef.current || savingRef.current) && !(await save())) {setPending("");return;}
    const revision=draftRef.current!.revision;
    try {
      const d=await request<{book:BookWithCover}>(`/api/books/${id}/text-edit`,{
        method:"POST",body:JSON.stringify({revision,accept}),
      });
      if (draftRef.current) undoHistory.current.record(draftRef.current,d.book);
      setHistoryState({canUndo:undoHistory.current.canUndo,canRedo:undoHistory.current.canRedo});
      setBook(d.book);setDraft(d.book);dirtyRef.current=false;setDirty(false);clearBackup();
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
      clearBackup();
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
    <div className={chapterWorkspaceOpen && (tab==="write"||tab==="outline") ? "editor-shell is-chapter-workspace" : "editor-shell"}>
      <div className="editor-topbar">
        <Link className="text-link" href={`/${locale}/studio`}>
          <ArrowLeft size={17} />
          <span>{t.back}</span>
        </Link>
        <div className="editor-top-actions">
          <span className={`save-status ${dirty ? "is-dirty" : ""}`}>
            {saving ? (
              <Loader2 size={14} className="spin" />
            ) : dirty ? (
              <span className="dirty-dot" />
            ) : (
              <Check size={14} />
            )}{" "}
            {saving ? t.saving : dirty ? localSaved
              ? tr(locale,"Saved on this device · waiting to sync","محفوظ على الجهاز · بانتظار المزامنة","Sparat på enheten · väntar på synk")
              : t.unsaved : tr(locale,"Saved to cloud","محفوظ في السحابة","Sparat i molnet")}
            {!dirty && lastSavedAt && <time dateTime={lastSavedAt}>{new Date(lastSavedAt).toLocaleTimeString(locale,{hour:"2-digit",minute:"2-digit"})}</time>}
          </span>
          <button className="button button-small button-outline"
            type="button" onClick={()=>setTab("preview")} disabled={!draft?.outline.length}
            title={tr(locale,"Preview your book","معاينة كتابك","Förhandsgranska din bok")}>
            <Eye size={16}/>{tr(locale,"Preview","معاينة","Förhandsvisa")}
          </button>
          <button
            className="icon-button"
            onClick={history}
            disabled={disabled}
            aria-label={t.savedHistory}
          >
            <History size={18} />
          </button>
          <button type="button" className="button button-small button-outline"
            onClick={()=>setTab("brief")} disabled={disabled}
            title={tr(locale,"Edit idea, restart or delete project","تعديل الفكرة أو إعادة البدء أو حذف المشروع","Ändra idé, starta om eller radera")}>
            <BookOpen size={16}/>
            {tr(locale,"Manage book","إدارة الكتاب","Hantera bok")}
          </button>
          <button
            className="button button-small button-ink"
            onClick={() => void save(true)}
            disabled={disabled || saving || !dirty}
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
          <button type="button" className="studio-sidebar-home" onClick={()=>setTab("brief")}>
            <BookOpen size={17}/>{tr(locale,"Project overview","ملخص المشروع","Projektöversikt")}
          </button>
          {draft.outline.length > 0 && <div className="studio-chapter-nav">
            <strong>{tr(locale,"Chapters","الفصول","Kapitel")}</strong>
            <div className="studio-chapter-links">{draft.outline.map((c,i)=><button type="button" key={c.id}
              className={tab==="write" && active?.id===c.id?"active":""}
              onClick={()=>{setChapterId(c.id);setTab("write");}}>
              <span>{i+1}</span><span className="studio-chapter-label">{c.title}</span>{draft.chapters[c.id]&&<Check size={14}/>}
            </button>)}</div>
          </div>}
          <div className="sidebar-stats">
            <BookOpen size={18} />
            <div>
              <strong>
                {draft.outline.filter(c=>draft.chapters[c.id]?.content.trim()).length}/{draft.outline.length || draft.chapter_count}
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
            <span className="status-tag sidebar-credits">{tr(locale, "Free private testing", "اختبار مجاني خاص", "Gratis privat test")}</span>
          ) : null}
          <p className="sidebar-note">{t.reviewNote}</p>
        </aside>
        <div className="editor-main">
          <nav className="studio-progress-steps guided-four" aria-label={tr(locale,"Book creation stages","مراحل صناعة الكتاب","Bokens steg")}>
            {(["brief","outline","design","preview"] as const).map((step,i)=>{
              const labels={
                brief:tr(locale,"Idea","الفكرة","Idé"),
                outline:tr(locale,"Chapters + Writing","الفصول والكتابة","Kapitel och skrivning"),
                design:tr(locale,"Design","التصميم","Design"),
                preview:tr(locale,"Review","المراجعة","Granska"),
              };
              const locked=(!draft.outline.length && !["brief","outline"].includes(step));
              return <button type="button" key={step} className={(tab===step || (tab==="write" && step==="outline"))?"active":""}
                disabled={locked} onClick={()=>setTab(step==="outline" && draft.outline.length ? "write" : step)} aria-current={(tab===step || (tab==="write" && step==="outline"))?"step":undefined}>
                <span>{i+1}</span><span>{labels[step]}</span>
              </button>;
            })}
          </nav>
          <div className="guided-progress-intro" role="status">
            <div>
              <strong>{tr(locale,"From your idea to a finished book","من الفكرة إلى كتاب جاهز","Från idé till färdig bok")}</strong>
              <p>{tab==="brief"
                ? tr(locale,"Check your book idea and settings, then create a chapter plan.","راجع فكرة كتابك وإعداداته، ثم أنشئ مخطط الفصول.","Granska din idé och skapa en kapitelplan.")
                :(tab==="outline"||tab==="write")
                ? tr(locale,"Plan each chapter and write or generate the text directly underneath.","خطّط كل فصل واكتب أو ولّد النص تحته مباشرة.","Planera varje kapitel och skriv eller generera direkt under.")
                :tab==="design"
                ? tr(locale,"Choose your cover and interior layout.","اختر الغلاف وتنسيق الصفحات.","Välj omslag och inlaga.")
                :tr(locale,"Check missing parts, preview and download your book.","افحص الأجزاء الناقصة وعاين الكتاب ثم نزّله.","Kontrollera, förhandsgranska och ladda ner.")}</p>
            </div>
            <span>{draft.outline.filter(c=>draft.chapters[c.id]?.content?.trim()).length}/{draft.outline.length} {tr(locale,"chapters ready","فصل جاهز","färdiga kapitel")}</span>
          </div>
          {draft.outline.length>0 && tab!=="write" && tab!=="outline" && <details className="studio-document-map">
            <summary>{tr(locale,"Book contents · choose a section","أجزاء الكتاب · اختر القسم الذي تريد العمل عليه","Bokens innehåll · välj avsnitt")}</summary>
            <div>
              <button type="button" onClick={()=>{setCoverSide("front");setTab("design");}}>{tr(locale,"Front cover","الغلاف الأمامي","Framsida")}</button>
              <button type="button" onClick={()=>{setTab("design");requestAnimationFrame(()=>document.getElementById("book-preface")?.focus());}}>{tr(locale,"Preface and opening pages","المقدمة والصفحات الأولى","Förord och inledning")}</button>
              {draft.outline.map((chapter,i)=><button type="button" key={chapter.id} className="document-map-chapter" onClick={()=>{setChapterId(chapter.id);setTab("write");visualRangeRef.current=null;setSelectedCount(0);}}>
                <span>{i+1}</span>{chapter.title}
              </button>)}
              <button type="button" onClick={()=>{setCoverSide("back");setTab("design");}}>{tr(locale,"Back cover","الغلاف الخلفي","Baksida")}</button>
              <button type="button" onClick={()=>setTab("preview")}>{tr(locale,"Review and export","المراجعة والتنزيل","Granska och exportera")}</button>
            </div>
          </details>}
          {!online && (
            <div className="notice offline-warning" role="status">
              {tr(locale,
                "You are offline. Your changes are not saved to the cloud yet. Keep this page open; automatic saving resumes when the connection returns.",
                "الاتصال مقطوع. تعديلاتك لم تُحفظ على السحابة بعد. اترك الصفحة مفتوحة، وسيُستأنف الحفظ تلقائيًا عند عودة الإنترنت.",
                "Du är offline. Ändringarna har inte sparats i molnet ännu. Låt sidan vara öppen. Automatisk sparning återupptas när anslutningen återkommer.")}
            </div>
          )}
          {recoveryDraft && (
            <div className="notice draft-recovery" role="status">
              <strong>{tr(locale, "Recover unsaved changes?", "هل تريد استعادة التعديلات غير المحفوظة؟", "Återställa osparade ändringar?")}</strong>
              <p>{tr(locale,
                "An unsynced draft was found on this device. Restore it or keep the cloud version.",
                "وُجدت تعديلات غير متزامنة محفوظة على هذا الجهاز. يمكنك استعادتها أو الاحتفاظ بالنسخة السحابية.",
                "Ett utkast från den här webbläsarfliken hittades. Återställ det eller behåll den senast molnsparade versionen.")}</p>
              <div className="cover-confirm-buttons">
                <button type="button" className="button button-primary button-small" onClick={() => {
                  const recovered = restoreDraft(book, recoveryDraft);
                  change(() => recovered);
                  setRecoveryDraft(null);
                }}>{tr(locale, "Restore draft", "استعادة المسودة", "Återställ utkast")}</button>
                <button type="button" className="button button-outline button-small" onClick={() => {
                  clearBackup();
                  setRecoveryDraft(null);
                }}>{tr(locale, "Keep saved version", "الإبقاء على النسخة المحفوظة", "Behåll sparad version")}</button>
              </div>
            </div>
          )}
          {(error || loadError) && (
            <div className="error-message" role="alert">
              {errorMessage(error || loadError, locale)}
              {error==="conflict" && <div className="save-conflict-actions">
                <button type="button" className="button button-small button-outline" disabled={!!pending} onClick={async()=>{
                  const local=draftRef.current;if(!local)return;
                  persistDraft(local);setPending("resolve-conflict");
                  try{const result=await request<{book:BookWithCover;job:Job|null;credits:number}>(`/api/books/${id}`);
                    setBook(result.book);setDraft(result.book);setJob(result.job);setRecoveryDraft(local);dirtyRef.current=false;setDirty(false);setError("");
                  }catch(e){setError(codeOf(e));}finally{setPending("");}
                }}>{tr(locale,"Review cloud version and recover draft","مراجعة النسخة السحابية واستعادة المسودة","Granska molnversion och återställ utkast")}</button>
              </div>}
            </div>
          )}
          {busy && (
            <div className="generation-banner studio-generation-dock" role="status">
              <div>
                <span className="generation-icon">
                  <Loader2 size={19} className="spin" />
                </span>
                <div>
                  <strong>{job.kind==="illustration"?tr(locale,"Creating image at the chosen position","جارٍ إنشاء الصورة في مكانها المحدد","Skapar bild på vald plats"):t.generating}</strong>
                  <p>{tr(locale,"The chapter remains safe while this finishes.","يبقى نص الفصل محفوظًا أثناء هذه العملية.","Kapitlet förblir sparat under arbetet.")}</p>
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
          {tab==="brief" && <section className="editor-panel guided-brief-panel">
            <div className="panel-heading">
              <span className="eyebrow">{tr(locale,"Step 1 of 5","المرحلة 1 من 5","Steg 1 av 5")}</span>
              <h2>{tr(locale,"What book do you want to make?","ما الكتاب الذي تريد صنعه؟","Vilken bok vill du skapa?")}</h2>
              <p>{tr(locale,"Describe your book. You can change the idea without automatically deleting any chapter.",
                "عرّف كتابك. يمكنك تغيير الفكرة دون أن تُحذف الفصول الموجودة تلقائيًا.",
                "Beskriv boken. Att ändra idén raderar inte befintliga kapitel.")}</p>
            </div>
            <div className="guided-brief-form" dir={locale==="ar"?"rtl":"ltr"}>
              <label>{tr(locale,"Idea and purpose of the book","فكرة الكتاب وماذا سيقدم","Bokens idé och syfte")}
                <textarea rows={5} minLength={20} maxLength={2000} disabled={disabled}
                  value={draft.idea} onChange={e=>change(b=>({...b,idea:e.target.value}),true)}/>
                <small>{draft.idea.length}/2000</small>
              </label>
              <label>{tr(locale,"Who will read the book?","لمن تكتب هذا الكتاب؟","Vem ska läsa boken?")}
                <input minLength={3} maxLength={300} disabled={disabled}
                  value={draft.audience} onChange={e=>change(b=>({...b,audience:e.target.value}),true)}/>
              </label>
              <div className="guided-brief-grid">
                <label>{tr(locale,"Book type","نوع الكتاب","Boktyp")}
                  <select disabled={disabled} value={draft.kind}
                    onChange={e=>change(b=>({...b,kind:e.target.value as Book["kind"]}))}>
                    {(["guide","ebook","workbook","report","research","novel","short_story","children_story"] as const).map(k=>
                      <option key={k} value={k}>{t[k]}</option>)}
                  </select>
                </label>
                <label>{tr(locale,"Writing style","أسلوب الكتابة","Skrivstil")}
                  <select disabled={disabled} value={draft.tone}
                    onChange={e=>change(b=>({...b,tone:e.target.value as Book["tone"]}))}>
                    {(["clear","friendly","professional","literary","dramatic","playful"] as const).map(k=>
                      <option value={k} key={k}>{t[k]}</option>)}
                  </select>
                </label>
                <label>{tr(locale,"Book language","لغة الكتاب","Bokens språk")}
                  <input readOnly value={languageNames[draft.language]}/>
                  <small>{tr(locale,"Use project management below to change language and restart.",
                    "لتغيير اللغة وبدء كتاب جديد استخدم إدارة المشروع بالأسفل.",
                    "Använd projekthantering för att byta språk och starta om.")}</small>
                </label>
                {draft.outline.length===0 && <label>{tr(locale,"Number of chapters","عدد الفصول","Antal kapitel")}
                  <select disabled={disabled} value={draft.chapter_count}
                    onChange={e=>change(b=>({...b,chapter_count:Number(e.target.value)}))}>
                    {[3,4,5,6,7,8,9,10].map(n=><option key={n} value={n}>{n}</option>)}
                  </select>
                </label>}
                <label>{tr(locale,"Author name (optional)","اسم المؤلف (اختياري)","Författare (valfritt)")}
                  <input maxLength={100} disabled={disabled} value={draft.author}
                    onChange={e=>change(b=>({...b,author:e.target.value}),true)}/>
                </label>
              </div>
            </div>
            {draft.outline.length>0 && <p className="guided-retain-warning">
              {tr(locale,"Idea changes guide future AI writing. The existing outline and chapters remain unchanged until you explicitly restart.",
                "تعديل الفكرة يوجّه كتابة AI القادمة؛ أما المخطط والفصول الموجودة فتبقى كما هي حتى تطلب إعادة البدء صراحةً.",
                "Idéändringar påverkar framtida AI-skrivande. Befintlig plan och kapitel förblir oförändrade.")}
            </p>}
            <div className="guided-brief-actions">
              <button type="button" className="button button-primary"
                disabled={disabled || draft.idea.trim().length<20 || draft.audience.trim().length<3 || saving}
                onClick={async()=>{
                  if(dirtyRef.current && !(await save(true)))return;
                  setTab("outline");
                }}>
                {draft.outline.length
                  ? tr(locale,"Next: Plan and write chapters","التالي: تخطيط الفصول وكتابتها","Nästa: Planera och skriv kapitel")
                  : tr(locale,"Next: Create chapter plan","التالي: إنشاء مخطط الفصول","Nästa: Skapa kapitelplan")}
                <ChevronRight size={18}/>
              </button>
              {draft.outline.length>0 && <button type="button" className="button button-outline"
                disabled={disabled}
                onClick={async()=>{
                  if(dirtyRef.current && !(await save(true)))return;
                  const missing=draft.outline.find(c=>!draft.chapters[c.id]?.content?.trim());
                  if(missing){setChapterId(missing.id);setRead(false);setTab("write");}
                  else setTab(!draft.back_blurb?.trim()?"design":"preview");
                }}>
                {tr(locale,"Continue where I left off","تابع من حيث توقفت","Fortsätt där jag slutade")}
                <ChevronRight size={17}/>
              </button>}
            </div>
            <details className="guided-project-management">
              <summary>{tr(locale,"Project management · restart, restore or delete","إدارة المشروع · البدء من جديد أو الاستعادة أو الحذف","Projekthantering · omstart, återställning, radering")}</summary>
              <p>{tr(locale,"Restarting archives your current manuscript first. Deleting the entire project is irreversible.",
                "البدء من جديد يحفظ النسخة الحالية في سجل الإصدارات. حذف المشروع نهائي ولا يمكن التراجع عنه.",
                "Omstart sparar föregående version. Radering är permanent.")}</p>
              <label>{tr(locale,"Language for the restarted book","اللغة عند إعادة البدء","Språk vid omstart")}
                <select value={restartLanguage} disabled={disabled} onChange={e=>setRestartLanguage(e.target.value as Locale)}>
                  <option value="ar">العربية</option><option value="en">English</option><option value="sv">Svenska</option>
                </select>
              </label>
              <div className="guided-brief-actions">
                <button type="button" className="button button-outline" disabled={disabled}
                  onClick={()=>void restartManuscript()}><RotateCcw size={17}/>
                  {tr(locale,"Archive and restart from this idea","حفظ نسخة والبدء من الفكرة من جديد","Arkivera och starta om från idén")}
                </button>
                <button type="button" className="button button-outline" disabled={disabled}
                  onClick={history}><History size={17}/>
                  {tr(locale,"Restore earlier version","استعادة نسخة سابقة","Återställ tidigare version")}
                </button>
                <button type="button" className="button button-danger" disabled={disabled}
                  onClick={remove}><Trash2 size={17}/>
                  {tr(locale,"Delete project permanently","حذف المشروع نهائيًا","Radera projektet permanent")}
                </button>
              </div>
            </details>
          </section>}
          {tab === "outline" && draft.outline.length === 0 && (
            <section className="editor-panel">
              <div className="panel-heading">
                <span className="eyebrow">{tr(locale,"Step 2 of 4","المرحلة 2 من 4","Steg 2 av 4")}</span>
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
                    <label className="button button-outline">
                      {tr(locale,"Import entire manuscript (Word/TXT/MD)","استيراد كتاب كامل (Word/TXT/MD)","Importera helt manus (Word/TXT/MD)")}
                      <input type="file" accept=".txt,.md,.docx" hidden disabled={disabled}
                        onChange={e=>{const file=e.currentTarget.files?.[0];e.currentTarget.value="";if(file)void importManuscript(file,"book");}}/>
                    </label>
                    <button type="button" className="button button-outline" disabled={disabled || draft.outline.length >= 30}
                      onClick={() => addChapter()}>
                      <Plus size={17}/>{tr(locale,"Add chapter","إضافة فصل جديد","Lägg till kapitel")}
                    </button>
                    <button type="button" className="button button-primary"
                      disabled={disabled || !draft.title.trim()} onClick={()=>setTab("write")}>
                      <BookOpen size={17}/>
                      {tr(locale,"Approve outline and start writing","اعتماد المخطط والبدء بالكتابة","Godkänn planen och börja skriva")}
                    </button>
                  </div>
                </>
              )}
            </section>
          )}
          {(tab === "write" || (tab === "outline" && draft.outline.length > 0)) && (
            <section className="editor-panel chapter-panel chapter-flow">
              {!chapterWorkspaceOpen && <div className="panel-heading">
                <span className="eyebrow">{tr(locale,"Step 2 of 4","المرحلة 2 من 4","Steg 2 av 4")}</span>
                <h2>{tr(locale,"Plan and write your chapters","خطّط فصول كتابك واكتبها","Planera och skriv dina kapitel")}</h2>
                <p>{tr(locale,"Open any chapter to adjust its plan, generate or write the text, and edit it right here. Continue chapter by chapter.","افتح أي فصل لتعديل خطته وتوليد نصه أو كتابته وتحريره هنا، ثم انتقل للفصل التالي.","Öppna ett kapitel, ändra planen, skriv eller generera texten och gå sedan vidare.")}</p>
              </div>}
              {!chapterWorkspaceOpen && <div className="chapter-flow-overview">
                <strong>{draft.outline.filter(c=>draft.chapters[c.id]?.content?.trim()).length} / {draft.outline.length} {tr(locale,"chapters with text","فصول مكتوبة","skrivna kapitel")}</strong>
                <span>{bookWords(draft).toLocaleString(locale)} {t.words} · {tr(locale,"Approx.","نحو","Cirka")} {Math.ceil(bookWords(draft)/300)} {tr(locale,"pages","صفحة","sidor")}</span>
                <div className="chapter-flow-track"><span style={{width:(draft.outline.filter(c=>draft.chapters[c.id]?.content?.trim()).length/draft.outline.length*100)+"%"}} /></div>
                <small>{tr(locale,"Target for this outline: approximately","التقدير الأولي لهذا المخطط: نحو","För denna plan: ungefär")} {draft.outline.length*2}–{draft.outline.length*4} {tr(locale,"pages after writing. The final count depends on words, formatting and images.","صفحة بعد الكتابة. العدد النهائي يعتمد على الكلمات والتنسيق والصور.","sidor när boken skrivits. Slutligt antal beror på ord, layout och bilder.")}</small>
              </div>}
              {!chapterWorkspaceOpen && <details className="chapter-flow-book-settings">
                <summary>{tr(locale,"Edit book title and subtitle","تعديل عنوان الكتاب والعنوان الفرعي","Ändra boktitel och undertitel")}</summary>
                <label>{t.title}<input maxLength={180} value={draft.title} disabled={disabled} onChange={e=>change(b=>({...b,title:e.target.value}))}/></label>
                <label>{t.subtitle}<input maxLength={240} value={draft.subtitle} disabled={disabled} onChange={e=>change(b=>({...b,subtitle:e.target.value}))}/></label>
              </details>}
              {chapterWorkspaceOpen && active && <header className="chapter-workspace-header" id="chapter-workspace-top">
                <button type="button" className="chapter-workspace-back" onClick={()=>void leaveChapterWorkspace()}>
                  <ListTree size={18}/>{tr(locale,"All chapters","كل الفصول","Alla kapitel")}
                </button>
                <div className="chapter-workspace-heading">
                  <strong>{active.title}</strong>
                  <small>{draft.outline.findIndex(c=>c.id===active.id)+1} / {draft.outline.length} · {current?.content?.trim().split(/\s+/u).filter(Boolean).length||0} {t.words}</small>
                </div>
                <span className="chapter-workspace-save" role="status">
                  {saving?<Loader2 size={15} className="spin"/>:dirty?<Save size={15}/>:<Check size={15}/>}
                  {saving?t.saving:dirty?(localSaved?tr(locale,"Saved on device","محفوظ على الجهاز","Sparat på enheten"):t.unsaved):tr(locale,"Saved to cloud","محفوظ بالسحابة","Sparat i molnet")}
                </span>
              </header>}
              <div className={chapterWorkspaceOpen?"chapter-flow-list is-workspace":"chapter-flow-list"}>
                {draft.outline.map((c,i)=>(!chapterWorkspaceOpen || active?.id===c.id) && (
                  <article key={c.id} id={`chapter-${c.id}`} className={`chapter-flow-card ${active?.id===c.id?"is-open":""}`}>
                    <div className="chapter-flow-head">
                      <button type="button" className="chapter-flow-open" aria-expanded={active?.id===c.id}
                        onClick={()=>void openChapterWorkspace(c.id)}>
                        <span className="chapter-flow-num">{i+1}</span>
                        <span className="chapter-flow-title">
                          <strong>{c.title}</strong>
                          <small>{draft.chapters[c.id]?.content?.trim()
                            ? draft.chapters[c.id].content.trim().split(/\s+/u).length.toLocaleString(locale)+" "+t.words
                            : tr(locale,"Not written · AI target ~2–4 pages","لم يُكتب بعد · هدف AI نحو صفحتين إلى أربع","Inte skrivet · AI-mål ca 2–4 sidor")}</small>
                        </span>
                        {draft.chapters[c.id]?.content?.trim()?<Check size={18} className="chapter-flow-check"/>:<ChevronRight size={18}/>}
                      </button>
                      <button type="button" className="button button-outline button-small chapter-flow-ai"
                        disabled={disabled || !config.ai || !draft.title.trim()}
                        onClick={()=>{setChapterId(c.id);setChapterWorkspaceOpen(true);setRead(false);if(draft.chapters[c.id]?.content?.trim() && !window.confirm(tr(locale,"Regenerate this chapter? The previous text may be replaced. Save a version first.","هل تريد إعادة توليد هذا الفصل؟ قد يُستبدل النص القديم؛ احفظ نسخة أولًا.","Generera om kapitlet? Texten kan ersättas. Spara en version först.")))return;void generate(
                          !book.unlocked && i===0 && !draft.chapters[c.id]?"sample":"chapter",c.id);}}>
                        <Sparkles size={16}/>{draft.chapters[c.id]?.content?.trim()
                          ? tr(locale,"Regenerate","إعادة التوليد","Generera om")
                          : tr(locale,"Generate chapter","توليد الفصل AI","Generera kapitel")}
                      </button>
                    </div>
                    {chapterWorkspaceOpen && active?.id===c.id && <div className="chapter-flow-body">
                      <details className="chapter-flow-plan" dir={draft.language==="ar"?"rtl":"ltr"}>
                        <summary>{tr(locale,"Chapter title and plan","عنوان الفصل ومخططه","Kapitelrubrik och plan")}</summary>
                        <label>{tr(locale,"Chapter title","عنوان الفصل","Kapitelrubrik")}
                          <input maxLength={160} value={c.title} disabled={disabled}
                            onChange={e=>change(b=>({...b,outline:b.outline.map(x=>x.id===c.id?{...x,title:e.target.value}:x)}))}/>
                        </label>
                        <label>{tr(locale,"Chapter plan: what happens or what readers learn","مخطط الفصل: ماذا يحدث أو ماذا سيتعلم القارئ؟","Kapitelplan: vad händer eller lär sig läsaren?")}
                          <textarea maxLength={600} rows={2} value={c.summary} disabled={disabled}
                            onChange={e=>change(b=>({...b,outline:b.outline.map(x=>x.id===c.id?{...x,summary:e.target.value}:x)}))}/>
                        </label>
                        <div className="chapter-flow-controls">
                          <button type="button" className="button button-outline button-small" disabled={disabled||i===0}
                            onClick={()=>change(b=>{const a=[...b.outline];[a[i-1],a[i]]=[a[i],a[i-1]];return {...b,outline:a};})}>
                            <ArrowUp size={14}/>{tr(locale,"Up","أعلى","Upp")}</button>
                          <button type="button" className="button button-outline button-small" disabled={disabled||i===draft.outline.length-1}
                            onClick={()=>change(b=>{const a=[...b.outline];[a[i],a[i+1]]=[a[i+1],a[i]];return {...b,outline:a};})}>
                            <ArrowDown size={14}/>{tr(locale,"Down","أسفل","Ner")}</button>
                          <button type="button" className="button button-outline button-small" disabled={disabled||draft.outline.length>=30}
                            onClick={()=>addChapter(c.id)}><Plus size={14}/>{tr(locale,"Add after","إضافة بعده","Lägg till efter")}</button>
                          <button type="button" className="button button-outline button-small" disabled={disabled||draft.outline.length<=1}
                            onClick={()=>deleteChapter(c.id)}><Trash2 size={14}/>{tr(locale,"Delete","حذف","Ta bort")}</button>
                        </div>
                      </details>
                      <div className="chapter-flow-workspace">

                <details className="chapter-workspace-extra"><summary>{tr(locale,"More chapter options","المزيد من خيارات الفصل","Fler kapitelalternativ")}</summary>
                {(["novel","short_story","children_story"] as const).some(kind=>kind===draft.kind) && <details className="studio-story-notes">
                  <summary>{tr(locale,"Story notebook","دفتر القصة والشخصيات","Berättelsens anteckningsbok")}</summary>
                  <label>{tr(locale,"Characters, setting and continuity notes","الشخصيات والمكان وتسلسل الأحداث","Karaktärer, miljö och kontinuitet")}
                    <textarea rows={4} maxLength={2000} disabled={disabled} value={draft.story_notes||""}
                      placeholder={tr(locale,"Names, ages, character traits and facts AI must preserve.","اكتب أسماء الشخصيات وأعمارها وصفاتها والأحداث التي يجب الحفاظ عليها.","Namn, åldrar, egenskaper och fakta som AI ska bevara.")}
                      onChange={e=>change(b=>({...b,story_notes:e.target.value}),true)}/>
                  </label>
                  <p>{tr(locale,"These notes guide future chapters and text improvements.","تُستخدم هذه الملاحظات عند توليد الفصول وتحسين النصوص التالية.","Anteckningarna vägleder kommande kapitel och textförbättringar.")}</p>
                </details>}
              <details className="studio-chapter-management">
                <summary>{tr(locale,"Chapter options: new, split, merge, import","خيارات الفصل: إضافة وتقسيم ودمج واستيراد","Kapitelalternativ: nytt, dela, slå ihop, importera")}</summary>
                <div className="chapter-author-actions">
                 <button type="button" className="button button-outline button-small"
                   disabled={disabled || draft.outline.length >= 30} onClick={() => addChapter(active?.id)}>
                   <Plus size={15}/>{tr(locale,"New chapter","فصل جديد","Nytt kapitel")}
                 </button>
                 {current && <button type="button" className="button button-outline button-small"
                   disabled={disabled || visualMode || draft.outline.length >= 30} onClick={splitChapter}>
                   {tr(locale,"Split at cursor","تقسيم عند المؤشر","Dela vid markören")}</button>}
                 {current && <button type="button" className="button button-outline button-small"
                   disabled={disabled || !draft.chapters[draft.outline[draft.outline.findIndex(c => c.id === active?.id)+1]?.id]}
                   onClick={mergeNextChapter}>{tr(locale,"Merge next","دمج مع التالي","Slå ihop nästa")}</button>}
                 <label className="button button-outline button-small">
                   {tr(locale,"Import Word / TXT / MD","استيراد Word / TXT / MD","Importera Word / TXT / MD")}
                   <input type="file" accept=".txt,.md,.docx,text/plain,text/markdown,application/vnd.openxmlformats-officedocument.wordprocessingml.document" hidden disabled={disabled || !active}
                     onChange={e=>{const file=e.currentTarget.files?.[0];e.currentTarget.value="";if(file)void importManuscript(file,"chapter");}}/>
                 </label>
                 {importError && <p className="error-message" role="alert">{importError}</p>}
               </div>
              </details>
               </details>
               {book.text_edit_candidate?.chapter_id === active?.id && (
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
               <details className="chapter-workspace-modes"><summary>{tr(locale,"Reading and advanced editing","القراءة والتحرير المتقدم","Läsning och avancerad redigering")}</summary>
               <div className="chapter-toolbar">
                <div className="segmented studio-edit-modes" role="group" aria-label={tr(locale,"Editing mode","وضع التحرير","Redigeringsläge")}>
                  <button type="button" className={!read && visualMode ? "selected" : ""}
                    onClick={()=>{setRead(false);setVisualMode(true);}}>
                    {tr(locale,"Write in book","تحرير الكتاب","Redigera bok")}
                  </button>
                  <button type="button" className={read ? "selected" : ""}
                    onClick={()=>setRead(true)}>{tr(locale,"Read","قراءة","Läs")}</button>
                  <button type="button" className={!read && !visualMode ? "selected" : ""}
                    onClick={()=>{setRead(false);setVisualMode(false);}}>
                    {tr(locale,"Advanced text","نص متقدم","Avancerad text")}
                  </button>
                </div>
              </div></details>
              {current && showIllustrations && (
                <Dialog title={tr(locale,"Insert image or logo","إدراج صورة أو شعار","Infoga bild eller logotyp")}
                  closeLabel={tr(locale,"Close","إغلاق","Stäng")}
                  onClose={()=>{setShowIllustrations(false);setReplaceImageId(null);}}>
                <div className="illustration-inserter studio-image-dialog"
                  dir={locale === "ar" ? "rtl" : "ltr"}>
                  {error && <p className="error-message" role="alert">{errorMessage(error,locale)}</p>}
                  {pending==="illustration" && <p role="status">{tr(locale,"Saving image…","جارٍ حفظ الصورة…","Sparar bilden…")}</p>}
                  <p className="studio-image-location">{tr(locale,
                    "You chose a specific point in your chapter. The image will be inserted there.",
                    "حددت موضع الصورة داخل الفصل. ستُضاف الصورة هنا بالضبط.",
                    "Du valde en plats i kapitlet. Bilden läggs in just där.")}</p>
                  <p className="muted">{tr(locale, "Place images between paragraphs or at chapter boundaries. Pages adapt to each reader's screen.", "أدرج الصور بين الفقرات أو في بداية الفصل أو نهايته. صفحات الكتاب تتغير بحسب شاشة القارئ.", "Lägg till bilder mellan stycken eller vid kapitelgränser. Sidor anpassas efter skärmen.")}</p>
                  <div className="illustration-fields">
                    <label>{tr(locale, "Insert at", "موضع الصورة", "Placering")}
                      <select value={imagePlacement} onChange={e => setImagePlacement(e.target.value as "cursor"|"start"|"end")}>
                        <option value="cursor">{tr(locale, "Selected + position", "المكان المحدد بزر +", "Vald infogningspunkt")}</option>
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
                  <div className="insert-source-tabs" role="group" aria-label={tr(locale,"Choose source","اختر مصدر الصورة","Välj bildkälla")}>
                    {(["library","upload","ai"] as const).filter(source=>!replaceImageId||source!=="ai").map(source=><button type="button" key={source}
                      className={imageSource===source?"active":""} onClick={()=>setImageSource(source)}>
                      {source==="library"?tr(locale,"Library","المكتبة","Bibliotek"):
                       source==="upload"?tr(locale,"Upload / logo","رفع صورة أو شعار","Bild eller logotyp"):
                       tr(locale,"AI illustration","رسم AI","AI-bild")}
                    </button>)}
                  </div>
                  {imageSource==="library" && <div className="image-source-content">
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
                  </div>}
                  {imageSource==="upload" && <div className="image-source-content">
                  <label className="cover-upload-label">
                    {tr(locale, "Upload an image (PNG, JPG, WebP · max 3 MB)", "ارفع صورة من جهازك (PNG أو JPG أو WebP · حتى 3 ميغابايت)", "Ladda upp bild (PNG, JPG, WebP · max 3 MB)")}
                    <span className="studio-select-file"><ImagePlus size={16}/>{tr(locale,"Choose an image","اختيار صورة من الهاتف","Välj en bild")}</span>
                    <input type="file" accept="image/png,image/jpeg,image/webp" disabled={disabled}
                      onChange={e => { const file = e.currentTarget.files?.[0]; e.currentTarget.value = ""; if (file) void uploadIllustration(file); }} />
                  </label>
                  <label className="cover-upload-label">
                    {tr(locale,"Or upload a company logo (transparent PNG recommended)","أو ارفع شعار الشركة (يُفضّل PNG شفاف)","Eller ladda upp företagets logotyp (helst transparent PNG)")}
                    <span className="studio-select-file"><ImagePlus size={16}/>{tr(locale,"Choose a logo","اختيار شعار","Välj logotyp")}</span>
                    <input type="file" accept="image/png,image/jpeg,image/webp"
                      disabled={disabled || !book.unlocked}
                      onChange={e=>{const file=e.currentTarget.files?.[0];e.currentTarget.value="";if(file)void uploadIllustration(file,true);}}/>
                  </label>
                  </div>}
                  {imageSource==="ai" && <div className="image-source-content">
                  <button type="button" className="button button-outline button-small"
                    disabled={disabled || !current}
                    onClick={()=>setImagePrompt(tr(locale,
                      "An original, clear, professional book illustration connected to this text: ",
                      "رسم أصلي واحترافي مرتبط مباشرة بهذا النص: ",
                      "En originell, professionell illustration som passar denna text: ")+
                      current.content.slice(Math.max(0,cursorRef.current-250),cursorRef.current+350).slice(0,530))}>
                    <Sparkles size={16}/>{tr(locale,"Suggest from the paragraph (free)","اقترح من الفقرة (مجاني)","Föreslå utifrån stycket (gratis)")}
                  </button>
                  <label>{tr(locale, "Describe the AI illustration", "صف الصورة التي تريد توليدها بالذكاء الاصطناعي", "Beskriv AI-illustrationen")}
                    <textarea rows={3} maxLength={700} value={imagePrompt} onChange={e => setImagePrompt(e.target.value)}
                      placeholder={tr(locale, "A scene from this chapter, a character, or a visual explanation…", "مشهد من هذا الفصل أو شخصية أو رسم يوضح فكرة...", "En scen, en karaktär eller en förklarande bild…")} />
                  </label>
                  <button type="button" className="button button-primary"
                    disabled={disabled || !config.artwork || !config.ai || imagePrompt.trim().length < 10}
                    onClick={() => void generate("illustration", active?.id)}>
                    <Sparkles size={17} /> {tr(locale, "Generate and insert AI image", "توليد الصورة وإدراجها في الفصل", "Skapa och infoga AI-bild")}
                  </button>
                  </div>}
                </div>
                </Dialog>
              )}
              {current && !read && !visualMode && selectedCount>=4 && <div className="studio-inline-ai" role="group"
                aria-label={tr(locale,"AI editing for the selected text","تحرير النص المحدد بالذكاء الاصطناعي","AI för markerad text")}>
                <div className="studio-inline-ai-heading"><Sparkles size={17}/>
                  <strong>{tr(locale,"Selected text","النص المحدد","Markerad text")}</strong>
                  <span>{selectedCount} {tr(locale,"characters","حرف","tecken")}</span>
                </div>
                <p>{tr(locale,"Choose one action, then review and approve the suggestion. Your original is kept.",
                  "اختر إجراءً ثم راجع الاقتراح واعتمده. لن يُستبدل النص تلقائيًا.",
                  "Välj en åtgärd och granska förslaget innan du godkänner.")}</p>
                <div className="studio-inline-ai-actions">
                  {([
                    ["proofread",tr(locale,"Correct","تصحيح","Korrekturläs")],
                    ["improve",tr(locale,"Improve","تحسين","Förbättra")],
                    ["simplify",tr(locale,"Simplify","تبسيط","Förenkla")],
                    ["shorten",tr(locale,"Shorten","اختصار","Förkorta")],
                    ["expand",tr(locale,"Expand","توسيع","Utöka")],
                    ["tone",tr(locale,"Change style","تغيير الأسلوب","Ändra stil")],
                  ] as const).map(([action,label])=><button type="button" key={action}
                    disabled={disabled||!config.ai||!book.unlocked||!!book.text_edit_candidate||selectedCount>1800}
                    onClick={()=>proposeTextEdit(action)}>{label}</button>)}
                </div>
                <details className="studio-custom-ai">
                  <summary>{tr(locale,"Other instruction","تعليمات أخرى","Egen instruktion")}</summary>
                  <textarea value={aiInstruction} rows={2} maxLength={500} onChange={e=>setAiInstruction(e.target.value)}
                    placeholder={tr(locale,"What should AI improve?","ماذا تريد من AI أن يعدّل؟","Vad ska AI ändra?")}/>
                  <button type="button" className="button button-outline button-small"
                    disabled={disabled||!book.unlocked||!config.ai||selectedCount>1800||aiInstruction.trim().length<5}
                    onClick={()=>proposeTextEdit("custom")}>{tr(locale,"Get a suggestion","اقتراح تعديل","Få förslag")}</button>
                </details>
              </div>}
              <h3
                className="current-chapter-title"
                dir={draft.language === "ar" ? "rtl" : "ltr"}
              >
                {active?.title}
              </h3>
              {importError && <p className="error-message" role="alert">{importError}</p>}
              {current || (visualMode && active) ? (
                read ? (
                  <div
                    className="chapter-read"
                    dir={draft.language === "ar" ? "rtl" : "ltr"}
                    lang={draft.language}
                  >
                    <Markdown text={current?.content || ""} illustrations={draft.illustrations} bookId={id} />
                  </div>
                ) : visualMode && active ? (
                  <VisualChapterEditor key={active.id} chapterId={active.id} locale={locale}
                    content={current?.content || ""} language={draft.language} bookId={id} illustrations={draft.illustrations}
                    disabled={disabled}
                    onChange={(content,typing) => change(b=>({...b,chapters:{
                      ...b.chapters,[active.id]:{...(b.chapters[active.id] || {summary:active.summary}),content}
                    }}),typing)}
                    onSelection={range=>{visualRangeRef.current=range;visualSelectedRef.current=range.text;setSelectedCount(range.text.length);}}
                    onUndo={()=>travelHistory("undo")} onRedo={()=>travelHistory("redo")} canUndo={historyState.canUndo} canRedo={historyState.canRedo}
                    aiEnabled={config.ai&&book.unlocked&&!book.text_edit_candidate}
                    onAI={(range,action)=>proposeTextEdit(action,range)}
                    chapters={draft.outline}
                    onMoveToChapter={(block,remaining,target)=>{
                      const targetChapter=draftRef.current?.chapters[target];
                      const targetContent=[targetChapter?.content,block].filter(Boolean).join("\n\n");
                      if(targetContent.length>30000){setImportError(tr(locale,"The destination chapter is full.","الفصل الذي اخترته بلغ الحد الأقصى للنص.","Målkapitlet är fullt."));return false;}
                      change(b=>({...b,chapters:{...b.chapters,
                        [active.id]:{...(b.chapters[active.id] || {summary:active.summary}),content:remaining},
                        [target]:{...(b.chapters[target] || {summary:b.outline.find(c=>c.id===target)?.summary||""}),content:targetContent},
                      }}));return true;
                    }}
                    onSaveImage={(imageId,size,caption)=>{void changeExistingImage(imageId,false,{size,caption});}}
                    onDeleteImage={imageId=>{void changeExistingImage(imageId,true);}}
                    imageDialogOpen={showIllustrations}
                    imageOperationPending={pending==="illustration" || (busy && job?.kind==="illustration")}
                    onInsertImage={(position,canonicalContent,replaceId)=>{
                      if (canonicalContent !== current?.content && active)
                        change(b=>({...b,chapters:{...b.chapters,[active.id]:{
                          ...(b.chapters[active.id] || {summary:active.summary}),content:canonicalContent}}}));
                      setReplaceImageId(replaceId||null);
                      setImageSource("library");
                      cursorRef.current=position;
                      visualSelectedRef.current="";
                      setSelectedCount(0);
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
                      <span className="chapter-word-count">{(current?.content || "").trim().split(/\s+/u).filter(Boolean).length.toLocaleString(locale)} {t.words}</span>
                      <button type="button" aria-label={fullscreenEditor ? tr(locale, "Close full-screen editor", "إغلاق وضع الشاشة الكاملة", "Stäng helskärm") : tr(locale, "Full-screen editor", "تحرير بملء الشاشة", "Helskärmsredigering")} title={tr(locale, "Full-screen editor", "تحرير بملء الشاشة", "Helskärmsredigering")} onClick={() => setFullscreenEditor(v => !v)}>{fullscreenEditor ? <Minimize2 size={18}/> : <Maximize2 size={18}/>}</button>
                    </span>
                    <textarea
                      ref={chapterEditorRef}
                      className="chapter-editor"
                      dir={draft.language === "ar" ? "rtl" : "ltr"}
                      lang={draft.language}
                      value={current?.content || ""}
                      maxLength={30000}
                      disabled={disabled}
                      onClick={e => { cursorRef.current = e.currentTarget.selectionStart; }}
                      onKeyUp={e => { cursorRef.current = e.currentTarget.selectionStart; }}
                      onSelect={e => { cursorRef.current = e.currentTarget.selectionStart;setSelectedCount(e.currentTarget.selectionEnd-e.currentTarget.selectionStart); }}
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
                  {active && <label className="manual-first-chapter" dir={draft.language === "ar" ? "rtl" : "ltr"}>
                    <strong>{tr(locale, "Write this chapter yourself, without AI", "اكتب هذا الفصل بنفسك دون ذكاء اصطناعي", "Skriv kapitlet själv utan AI")}</strong>
                    <textarea rows={5} maxLength={30000} disabled={disabled}
                      placeholder={tr(locale,
                        "Start typing your chapter here. You can continue in the editor and insert pictures later.",
                        "ابدأ كتابة الفصل هنا. يمكنك إكماله في المحرر وإضافة الصور لاحقًا.",
                        "Börja skriva kapitlet här. Fortsätt sedan i redigeraren och lägg till bilder.")}
                      onChange={e=>{
                        const content=e.currentTarget.value;
                        if(!content.trim())return;
                        change(b=>({...b,chapters:{...b.chapters,[active.id]:{
                          content,
                          summary:active.summary,
                        }}}));
                        setVisualMode(false);
                        requestAnimationFrame(()=>{
                          const editor=chapterEditorRef.current;
                          if(editor){editor.focus();editor.setSelectionRange(content.length,content.length);}
                        });
                      }}/>
                  </label>}
                </div>
              )}
              {current && (!visualMode || read) && Object.values(draft.illustrations || {}).some(asset => current.content.includes(`[[illustration:${asset.id}]]`)) && (
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

                      </div>
                      <nav className="chapter-flow-next chapter-workspace-dock" aria-label={tr(locale,"Chapter navigation","التنقل بين الفصول","Kapitelnavigering")}>
                        <button type="button" className="chapter-workspace-dock-side" disabled={disabled || saving || i===0}
                          onClick={()=>void openChapterWorkspace(draft.outline[i-1].id)}>
                          <ChevronRight size={19}/><span>{tr(locale,"Previous","السابق","Föregående")}</span>
                        </button>
                        <button type="button" className="chapter-workspace-dock-overview" onClick={()=>void leaveChapterWorkspace()}
                          aria-label={tr(locale,"All chapters","كل الفصول","Alla kapitel")}><ListTree size={20}/></button>
                        <span className="chapter-workspace-dock-count">{i+1} / {draft.outline.length}</span>
                        <button type="button" className="chapter-workspace-dock-next" disabled={disabled || saving}
                          onClick={async()=>{
                            if(i<draft.outline.length-1) await openChapterWorkspace(draft.outline[i+1].id);
                            else if((!dirtyRef.current && !savingRef.current) || await save(true)){setTab("design");setChapterWorkspaceOpen(false);}
                          }}>
                          <span>{i<draft.outline.length-1?tr(locale,"Next chapter","الفصل التالي","Nästa kapitel"):tr(locale,"Design","التصميم","Design")}</span><ChevronRight size={19}/>
                        </button>
                      </nav>
                    </div>}
                  </article>
                ))}
              </div>
              {!chapterWorkspaceOpen && <div className="chapter-flow-footer">
                <button type="button" className="button button-outline" disabled={disabled||draft.outline.length>=30}
                  onClick={()=>addChapter()}><Plus size={16}/>{tr(locale,"Add chapter","إضافة فصل","Lägg till kapitel")}</button>
                <label className="button button-outline">{tr(locale,"Import full manuscript (Word/TXT/MD)","استيراد كتاب كامل (Word/TXT/MD)","Importera helt manus (Word/TXT/MD)")}
                  <input type="file" accept=".txt,.md,.docx" hidden disabled={disabled}
                    onChange={e=>{const f=e.currentTarget.files?.[0];e.currentTarget.value="";if(f)void importManuscript(f,"book");}}/>
                </label>
                <button type="button" className="button button-primary" disabled={disabled}
                  onClick={()=>{const missing=draft.outline.find(c=>!draft.chapters[c.id]?.content?.trim());
                    if(missing){setChapterId(missing.id);requestAnimationFrame(()=>document.getElementById(`chapter-${missing.id}`)?.scrollIntoView({behavior:"smooth",block:"start"}));}
                    else setTab("design");}}>
                  {draft.outline.some(c=>!draft.chapters[c.id]?.content?.trim())
                    ?tr(locale,"Continue unfinished chapters","استكمال الفصول الناقصة","Fortsätt ofärdiga kapitel")
                    :tr(locale,"Next: Design the book","التالي: تصميم الكتاب","Nästa: Designa boken")}<ChevronRight size={16}/>
                </button>
              </div>}
            </section>
          )}
          {tab === "design" && (
            <section className="editor-panel">
              <div className="panel-heading">
                <span className="eyebrow">{tr(locale,"Step 3 of 4","المرحلة 3 من 4","Steg 3 av 4")}</span>
                <h2>{t.designTitle}</h2>
                <p>{t.designBody}</p>
              </div>
              <div className="studio-cover-option">
                <label className="studio-cover-option-label">
                  <input type="checkbox" checked={draft.include_cover !== false} disabled={disabled}
                    onChange={e=>change(b=>({...b,include_cover:e.target.checked}))}/>
                  <span><strong>{tr(locale,"Include front and back covers","تضمين الغلاف الأمامي والخلفي","Inkludera fram- och baksida")}</strong>
                    <small>{tr(locale,"Turn off for reports or research. Designs remain saved and can be restored later.","يمكن إيقافه للتقارير والبحوث. تبقى تصاميم الغلاف محفوظة ويمكن إعادتها لاحقًا.","Stäng av för rapporter. Omslagen sparas och kan återaktiveras senare.")}</small></span>
                </label>
              </div>
              {draft.include_cover === false && <p className="notice" role="status">
                {tr(locale,"This document will export without front or back covers. Its body, sections, images and styles remain intact.","سيُصدّر هذا المستند دون غلاف أمامي أو خلفي، مع الاحتفاظ بالنص والأقسام والصور وتنسيقها.","Dokumentet exporteras utan omslag, men med innehåll, bilder och formatering.")}
              </p>}
              <div className="studio-design-steps">
                <div><span>01</span><strong>{tr(locale,"Describe the mood and visual idea","صف الجو والفكرة البصرية","Beskriv känsla och motiv")}</strong></div>
                <div><span>02</span><strong>{tr(locale,"Choose one of the suggested covers","اختر تصميم الغلاف المناسب","Välj omslag")}</strong></div>
                <div><span>03</span><strong>{tr(locale,"Review front and back covers","راجع الغلاف الأمامي والخلفي","Granska framsida och baksida")}</strong></div>
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
                        placeholder={tr(locale, "Mood? Main scene or symbol? What must never appear? The AI also reads your book's topic.", "١. ما الجو المطلوب؟ ٢. ما الرمز أو المشهد؟ ٣. ما الذي تريد تجنبه؟ يقرأ AI فكرة الكتاب أيضًا.", "Vilken stämning? Motiv? Vad ska undvikas? AI läser också bokens idé.")}
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
                      <textarea id="book-preface" rows={5} maxLength={5000} disabled={disabled} value={draft.preface || ""}
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
                    <span className="studio-select-file"><ImagePlus size={16}/>{tr(locale,"Choose cover image","اختيار صورة الغلاف","Välj omslagsbild")}</span>
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
                <span className="eyebrow">{tr(locale,"Step 4 of 4","المرحلة 4 من 4","Steg 4 av 4")}</span>
                <h2>{t.previewTitle}</h2>
                <p>{config.ownerTrial
                  ? tr(locale,
                      "Complete every chapter, then download your book in PDF, Word or EPUB. No site payment is required for your private test.",
                      "أكمل كل الفصول ثم نزّل كتابك بصيغة PDF أو Word أو EPUB. لا يلزم أي دفع داخل الموقع أثناء تجربتك.",
                      "Slutför alla kapitel och ladda sedan ner boken som PDF, Word eller EPUB. Ingen betalning krävs i ditt privata test.")
                  : t.exportHint}</p>
              </div>
              <div className="studio-readiness" role="group" aria-label={tr(locale,"Publication readiness","جاهزية الكتاب","Publiceringskontroll")}>
                <div className="studio-readiness-heading">
                  <Check size={18}/><strong>{tr(locale,"Ready to publish?","هل كتابك جاهز؟","Redo att publicera?")}</strong>
                  <span>{draft.outline.filter(c=>draft.chapters[c.id]?.content.trim()).length}/{draft.outline.length} {tr(locale,"chapters written","فصل مكتمل","skrivna kapitel")}</span>
                </div>
                <div className="studio-readiness-items">
                  {([
                    [Boolean(draft.title.trim()),tr(locale,"Book title","عنوان الكتاب","Boktitel"),"outline"],
                    [Boolean(draft.outline.length && draft.outline.every(c=>draft.chapters[c.id]?.content.trim())),tr(locale,"All chapters finished","كتابة جميع الفصول","Alla kapitel klara"),"write"],
                    [Boolean(draft.author.trim()),tr(locale,"Author's name (recommended)","اسم المؤلف (مستحسن)","Författarnamn (rekommenderas)"),"design"],
                    [draft.include_cover===false || Boolean(draft.back_blurb?.trim()),tr(locale,"Back cover description when enabled","نبذة الغلاف الخلفي عند تفعيله","Baksidestext när omslag används"),"design"],
                    [!dirty && !pending,tr(locale,"All changes saved","حفظ جميع التعديلات","Alla ändringar sparade"),"preview"],
                  ] as const).map(([done,label,step],i)=>
                    <button type="button" key={i} className={done?"is-ready":"needs-attention"}
                      onClick={()=>setTab(step)}><span>{done?<Check size={15}/>:i+1}</span>{label}</button>)}
                </div>
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
              <div className="preview-mode-toggle" role="group" aria-label={tr(locale,"Reader mode","وضع القراءة","Läsläge")}>
                <button type="button" className={readerMode ? "active" : ""} onClick={()=>setReaderMode(true)}>
                  {tr(locale,"Section reader","قارئ تفاعلي","Avsnittsläsare")}
                </button>
                <button type="button" className={!readerMode ? "active" : ""} onClick={()=>setReaderMode(false)}>
                  {tr(locale,"Full book","الكتاب كاملًا","Hela boken")}
                </button>
              </div>
              {readerMode && <BookSectionReader book={draft} bookId={id}/>}
              {!readerMode && <div
                className={`book-preview theme-${draft.layout_theme || "classic"}`}
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
                {draft.copyright_notice && <section className="preview-toc"><h2>{tr(draft.language,"Copyright","حقوق النشر","Upphovsrätt")}</h2><p>{draft.copyright_notice}</p></section>}
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
                {draft.acknowledgments && <section className="preview-toc"><h2>{tr(draft.language,"Acknowledgments","الشكر والتقدير","Tack")}</h2><Markdown text={draft.acknowledgments}/></section>}
                <div className="preview-cover">
                  <BookBackCover title={draft.title} author={draft.author}
                    style={draft.cover_style} language={draft.language}
                    blurb={draft.back_blurb || draft.idea}
                    authorBio={draft.author_bio || ""}
                    image={draft.back_cover_url} />
                </div>
              </div>}
              <p className="review-note">{t.reviewNote}</p>
            </section>
          )}
          {tab==="design" && <div className="studio-next-step">
            <span>{tr(locale,"Continue one step at a time. Your changes save automatically.","تقدّم خطوة بخطوة. تُحفظ تعديلاتك تلقائيًا.","Fortsätt stegvis. Ändringarna sparas automatiskt.")}</span>
            <button type="button" className="button button-primary"
              disabled={disabled}
              onClick={()=>setTab("preview")}>
              {tr(locale,"Next: Review and export","التالي: مراجعة وتنزيل","Nästa: Granska och exportera")}
              <ChevronRight size={16}/>
            </button>
          </div>}
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
