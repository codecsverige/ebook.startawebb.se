import { createHash, randomUUID } from "node:crypto";
import type {
  DocumentReference,
  Firestore,
  Transaction,
} from "firebase-admin/firestore";
import {
  briefSchema,
  recommendedCoverStyles,
  editBookSchema,
  type Book,
  type Brief,
  type Job,
  type JobKind,
  type Chapter,
  type OutlineItem,
  type Illustration,
  illustrationMarker,
} from "./domain";
import { AppError } from "./http";
import { STUDIO_PATH } from "./firebase-config";

export type Profile = {
  id: string;
  credits: number;
  free_book_id: string | null;
  book_count: number;
  active_jobs: number;
  job_times: number[];
  ai_times: number[];
  image_times?: number[];
  deleting: boolean;
};
type BookState = {
  active_job: string | null;
  latest_job: string | null;
  jobs: number;
  ai_calls: number;
  covers: number;
  rewrites: Record<string, number>;
  deleting: boolean;
};
type StoredBook = Book & { state: BookState };
export type WorkerJob = Job & {
  owner_trial?: boolean;
  request_id: string;
  result_units: Record<string, boolean>;
  updated_at: string;
};
export type VersionSummary = {
  id: string;
  created_at: string;
  title: string;
  has_outline: boolean;
};
const active = (job: Job) =>
  job.status === "queued" || job.status === "running";
const digest = (key: string) => createHash("sha256").update(key).digest("hex");
const day = 86_400_000;
const recent = (values: number[], now: number) =>
  values.filter((n) => n > now - day);
// Each AI request is reserved before calling the existing provider. Keep these
// application limits conservative even when a client retries aggressively.
// Environment values may LOWER a limit, never raise it above its safe ceiling.
function aiLimit(key: string, fallback: number): number {
  const raw = process.env[key];
  const parsed = raw === undefined ? NaN : Number(raw);
  return Number.isInteger(parsed) && parsed > 0
    ? Math.min(fallback, parsed)
    : fallback;
}
const aiDailyLimits = () => ({
  global: aiLimit("EBOOK_AI_GLOBAL_DAILY_LIMIT", 80),
  user: aiLimit("EBOOK_AI_USER_DAILY_LIMIT", 32),
  book: aiLimit("EBOOK_AI_BOOK_LIFETIME_LIMIT", 40),
  imagesGlobal: aiLimit("EBOOK_AI_IMAGE_GLOBAL_DAILY_LIMIT", 8),
  imagesUser: aiLimit("EBOOK_AI_IMAGE_USER_DAILY_LIMIT", 3),
});
function fail(code: string): never {
  throw new AppError(
    code,
    ["busy", "conflict"].includes(code)
      ? 409
      : ["rate_limit", "ai_book_limit", "ai_daily_limit", "ai_image_daily_limit"].includes(code)
        ? 429
        : code === "not_found"
          ? 404
          : 400,
  );
}
const uuid = (id: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
const bookOnly = ({ state: _state, ...book }: StoredBook): Book => book;
function assertBookSize(book: Book) {
  // Firestore has a 1 MiB document limit. Leave room for field names, internal
  // state and a version wrapper; refuse oversize edits without truncation.
  if (Buffer.byteLength(JSON.stringify(book), "utf8") > 850_000)
    fail("too_large");
}

export class FirestoreStudio {
  readonly root: DocumentReference;
  constructor(readonly db: Firestore) {
    this.root = db.doc(STUDIO_PATH);
  }
  profiles() {
    return this.root.collection("profiles");
  }
  books() {
    return this.root.collection("books");
  }
  jobs() {
    return this.root.collection("jobs");
  }
  userRef(uid: string) {
    return this.profiles().doc(digest(uid));
  }
  async ensureProfile(uid: string) {
    const ref = this.userRef(uid);
    await this.db.runTransaction(async (tx) => {
      const old = await tx.get(ref);
      if (old.exists) {
        if (old.get("deleting")) fail("busy");
        return;
      }
      tx.create(ref, {
        id: uid,
        credits: 0,
        free_book_id: null,
        book_count: 0,
        active_jobs: 0,
        job_times: [],
        ai_times: [],
        image_times: [],
        deleting: false,
      } satisfies Profile);
    });
  }
  async profile(uid: string): Promise<Profile | null> {
    return ((await this.userRef(uid).get()).data() as Profile) || null;
  }
  private checkedProfile(data: Profile | undefined): Profile {
    if (!data || data.deleting) fail("not_found");
    return data;
  }
  private checkedBook(data: StoredBook | undefined, uid?: string): StoredBook {
    if (!data || data.state.deleting || (uid && data.user_id !== uid))
      fail("not_found");
    return data;
  }
  async ownedBook(id: string, uid: string): Promise<Book> {
    if (!uuid(id)) fail("not_found");
    return bookOnly(
      this.checkedBook(
        (await this.books().doc(id).get()).data() as StoredBook | undefined,
        uid,
      ),
    );
  }
  async listBooks(uid: string): Promise<Book[]> {
    const result = await this.books()
      .where("user_id", "==", uid)
      .limit(31)
      .get();
    return result.docs
      .map((d) => d.data() as StoredBook)
      .filter((b) => !b.state.deleting)
      .map(bookOnly)
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
      .slice(0, 30);
  }
  async createBook(uid: string, raw: Brief): Promise<string> {
    const brief = briefSchema.parse(raw);
    const id = randomUUID();
    const now = new Date().toISOString();
    await this.db.runTransaction(async (tx) => {
      const pRef = this.userRef(uid);
      const profile = this.checkedProfile(
        (await tx.get(pRef)).data() as Profile | undefined,
      );
      if (profile.book_count >= 30) fail("rate_limit");
      const book: StoredBook = {
        ...brief,
        id,
        user_id: uid,
        title: "",
        subtitle: "",
        outline: [],
        chapters: {},
        cover_style: recommendedCoverStyles(brief.kind)[0],
        cover_direction: "",
        back_blurb: "",
        author_bio: "",
        dedication: "",
        preface: "",
        cover_path: null,
        cover_candidate_path: null,
        back_cover_path: null,
        back_cover_candidate_path: null,
        illustrations: {},
        use_artwork: false,
        unlocked: false,
        revision: 0,
        created_at: now,
        updated_at: now,
        state: {
          active_job: null,
          latest_job: null,
          jobs: 0,
          ai_calls: 0,
          covers: 0,
          rewrites: {},
          deleting: false,
        },
      };
      tx.create(this.books().doc(id), book);
      tx.update(pRef, { book_count: profile.book_count + 1 });
    });
    return id;
  }
  private async versionPlan(tx: Transaction, ref: DocumentReference) {
    // Read only IDs while pruning. Large manuscripts are never fetched just
    // to decide which historical snapshot to delete.
    return (
      await tx.get(
        ref.collection("versions").orderBy("revision", "desc").select(),
      )
    ).docs;
  }
  private writeVersion(
    tx: Transaction,
    ref: DocumentReference,
    book: StoredBook,
    old: Awaited<ReturnType<FirestoreStudio["versionPlan"]>>,
  ) {
    tx.create(ref.collection("versions").doc(randomUUID()), {
      created_at: new Date().toISOString(),
      revision: book.revision,
      title: book.title,
      has_outline: book.outline.length > 0,
      snapshot: bookOnly(book),
    });
    for (const version of old.slice(19)) tx.delete(version.ref);
  }
  async saveBook(uid: string, id: string, raw: unknown): Promise<Book> {
    const input = editBookSchema.parse(raw);
    if (!uuid(id)) fail("not_found");
    return this.db.runTransaction(async (tx) => {
      const ref = this.books().doc(id);
      const [p, b] = await tx.getAll(this.userRef(uid), ref);
      this.checkedProfile(p.data() as Profile | undefined);
      const book = this.checkedBook(b.data() as StoredBook | undefined, uid);
      if (book.state.active_job) fail("busy");
      if (book.revision !== input.revision) fail("conflict");
      if (
        input.outline.length !== book.chapter_count ||
        input.outline.some((c) => !book.outline.some((old) => old.id === c.id))
      )
        fail("invalid_input");
      const previous = await this.versionPlan(tx, ref);
      const next = {
        ...book,
        ...input,
        revision: book.revision + 1,
        updated_at: new Date().toISOString(),
      };
      assertBookSize(bookOnly(next));
      this.writeVersion(tx, ref, book, previous);
      tx.set(ref, next);
      return bookOnly(next);
    });
  }
  /** A zero-AI fallback when the external model is offline.
   * The author receives editable placeholder chapters, never fake generated text.
   */
  async createManualOutline(uid: string, id: string, revision: number): Promise<Book> {
    if (!uuid(id)) fail("not_found");
    return this.db.runTransaction(async (tx) => {
      const ref = this.books().doc(id);
      const [p, b] = await tx.getAll(this.userRef(uid), ref);
      this.checkedProfile(p.data() as Profile | undefined);
      const book = this.checkedBook(b.data() as StoredBook | undefined, uid);
      if (book.state.active_job) fail("busy");
      if (book.revision !== revision) fail("conflict");
      if (book.outline.length) fail("invalid_input");
      const labels = {
        ar: ["الفصل", "اكتب ملخص هذا الفصل، ثم عدّله بحسب قصتك"],
        en: ["Chapter", "Write and edit the plan for this chapter"],
        sv: ["Kapitel", "Skriv och redigera planen för detta kapitel"],
      }[book.language];
      const outline = Array.from({ length: book.chapter_count }, (_, i) => ({
        id: randomUUID(),
        title: `${labels[0]} ${i + 1}`,
        summary: labels[1],
      }));
      const versions = await this.versionPlan(tx, ref);
      const next: StoredBook = {
        ...book,
        outline,
        state: { ...book.state, latest_job: null },
        title: book.title || (book.language === "ar"
          ? "عنوان كتابك" : book.language === "sv" ? "Din boktitel" : "Your book title"),
        revision: book.revision + 1,
        updated_at: new Date().toISOString(),
      };
      assertBookSize(bookOnly(next));
      this.writeVersion(tx, ref, book, versions);
      tx.set(ref, next);
      return bookOnly(next);
    });
  }

  /** Restart a manuscript in the selected language without deleting the original snapshot. */
  async restartBook(uid: string, id: string, language: Book["language"], revision: number): Promise<Book> {
    if (!uuid(id)) fail("not_found");
    return this.db.runTransaction(async (tx) => {
      const ref = this.books().doc(id);
      const [p, b] = await tx.getAll(this.userRef(uid), ref);
      this.checkedProfile(p.data() as Profile | undefined);
      const book = this.checkedBook(b.data() as StoredBook | undefined, uid);
      if (book.state.active_job) fail("busy");
      if (book.revision !== revision) fail("conflict");
      const versions = await this.versionPlan(tx, ref);
      const next: StoredBook = {
        ...book,
        language,
        title: "",
        subtitle: "",
        cover_direction: "",
        back_blurb: "",
        author_bio: "",
        dedication: "",
        preface: "",
        outline: [],
        chapters: {},
        cover_path: null,
        cover_candidate_path: null,
        back_cover_path: null,
        back_cover_candidate_path: null,
        illustrations: {},
        use_artwork: false,
        revision: book.revision + 1,
        updated_at: new Date().toISOString(),
        state: { ...book.state, latest_job: null, rewrites: {}, covers: 0 },
      };
      this.writeVersion(tx, ref, book, versions);
      tx.set(ref, next);
      return bookOnly(next);
    });
  }

  /** Remove an unsuitable background illustration while preserving manuscript and history. */
  async clearCover(uid: string, id: string, revision: number): Promise<Book> {
    if (!uuid(id)) fail("not_found");
    return this.db.runTransaction(async (tx) => {
      const ref = this.books().doc(id);
      const [p, b] = await tx.getAll(this.userRef(uid), ref);
      this.checkedProfile(p.data() as Profile | undefined);
      const book = this.checkedBook(b.data() as StoredBook | undefined, uid);
      if (book.state.active_job) fail("busy");
      if (book.revision !== revision) fail("conflict");
      if (!book.cover_path && !book.cover_candidate_path) return bookOnly(book);
      const versions = await this.versionPlan(tx, ref);
      const next: StoredBook = {
        ...book, cover_path: null, cover_candidate_path: null, use_artwork: false,
        revision: book.revision + 1, updated_at: new Date().toISOString(),
      };
      this.writeVersion(tx, ref, book, versions);
      tx.set(ref, next);
      return bookOnly(next);
    });
  }

  /** Approve or discard an AI cover suggestion without touching saved chapters. */
  async decideCoverCandidate(uid: string, id: string, revision: number, accept: boolean, side: "front" | "back" = "front"): Promise<Book> {
    if (!uuid(id)) fail("not_found");
    return this.db.runTransaction(async (tx) => {
      const ref = this.books().doc(id);
      const [p, b] = await tx.getAll(this.userRef(uid), ref);
      this.checkedProfile(p.data() as Profile | undefined);
      const book = this.checkedBook(b.data() as StoredBook | undefined, uid);
      if (book.state.active_job) fail("busy");
      if (book.revision !== revision) fail("conflict");
      const candidate = side === "back" ? book.back_cover_candidate_path : book.cover_candidate_path;
      if (!candidate) fail("not_found");
      const versions = await this.versionPlan(tx, ref);
      const next: StoredBook = {
        ...book,
        ...(side === "back"
          ? { back_cover_path: accept ? candidate : book.back_cover_path, back_cover_candidate_path: null }
          : { cover_path: accept ? candidate : book.cover_path, cover_candidate_path: null,
              use_artwork: accept ? true : book.use_artwork }),
        revision: book.revision + 1,
        updated_at: new Date().toISOString(),
      };
      this.writeVersion(tx, ref, book, versions);
      tx.set(ref, next);
      return bookOnly(next);
    });
  }

  async setUploadedCover(uid: string, id: string, coverPath: string): Promise<Book> {
    if (!uuid(id) || !coverPath.startsWith(STUDIO_PATH + "/covers/")) fail("invalid_input");
    return this.db.runTransaction(async (tx) => {
      const ref = this.books().doc(id);
      const [p, b] = await tx.getAll(this.userRef(uid), ref);
      this.checkedProfile(p.data() as Profile | undefined);
      const book = this.checkedBook(b.data() as StoredBook | undefined, uid);
      if (!book.unlocked) fail("insufficient_credits");
      if (book.state.active_job) fail("busy");
      const versions = await this.versionPlan(tx, ref);
      const next: StoredBook = {
        ...book, cover_path: coverPath, cover_candidate_path: null, use_artwork: true,
        revision: book.revision + 1, updated_at: new Date().toISOString(),
      };
      this.writeVersion(tx, ref, book, versions);
      tx.set(ref, next);
      return bookOnly(next);
    });
  }
  async versions(uid: string, id: string): Promise<VersionSummary[]> {
    await this.ownedBook(id, uid);
    const result = await this.books()
      .doc(id)
      .collection("versions")
      .orderBy("revision", "desc")
      .limit(20)
      .select("created_at", "title", "has_outline")
      .get();
    return result.docs.map(
      (d) => ({ id: d.id, ...d.data() }) as VersionSummary,
    );
  }
  async version(uid: string, id: string, versionId: string): Promise<Book> {
    await this.ownedBook(id, uid);
    if (!uuid(versionId)) fail("not_found");
    const result = await this.books()
      .doc(id)
      .collection("versions")
      .doc(versionId)
      .get();
    if (!result.exists) fail("not_found");
    return result.get("snapshot") as Book;
  }
  /** Restore a previous manuscript atomically, including after a language restart. */
  async restoreBookVersion(uid: string, id: string, versionId: string, revision: number): Promise<Book> {
    if (!uuid(id) || !uuid(versionId)) fail("not_found");
    return this.db.runTransaction(async (tx) => {
      const ref = this.books().doc(id);
      const oldRef = ref.collection("versions").doc(versionId);
      const [p, b, saved] = await tx.getAll(this.userRef(uid), ref, oldRef);
      this.checkedProfile(p.data() as Profile | undefined);
      const book = this.checkedBook(b.data() as StoredBook | undefined, uid);
      if (book.state.active_job) fail("busy");
      if (book.revision !== revision) fail("conflict");
      if (!saved.exists) fail("not_found");
      const snapshot = saved.get("snapshot") as Book | undefined;
      if (!snapshot || snapshot.id !== id || snapshot.user_id !== uid ||
          snapshot.chapter_count !== book.chapter_count)
        fail("invalid_input");
      const versions = await this.versionPlan(tx, ref);
      const next: StoredBook = {
        ...book,
        title: snapshot.title,
        subtitle: snapshot.subtitle,
        author: snapshot.author,
        language: snapshot.language,
        outline: structuredClone(snapshot.outline),
        chapters: structuredClone(snapshot.chapters),
        cover_style: snapshot.cover_style,
        cover_direction: snapshot.cover_direction || "",
        back_blurb: snapshot.back_blurb || "",
        author_bio: snapshot.author_bio || "",
        dedication: snapshot.dedication || "",
        preface: snapshot.preface || "",
        cover_path: snapshot.cover_path,
        cover_candidate_path: null,
        back_cover_path: snapshot.back_cover_path || null,
        back_cover_candidate_path: null,
        illustrations: structuredClone(snapshot.illustrations || {}),
        use_artwork: snapshot.use_artwork,
        revision: book.revision + 1,
        updated_at: new Date().toISOString(),
        state: { ...book.state, latest_job: null, rewrites: {} },
      };
      assertBookSize(bookOnly(next));
      this.writeVersion(tx, ref, book, versions);
      tx.set(ref, next);
      return bookOnly(next);
    });
  }

  /** Atomically attach a reviewed image at a manuscript cursor position. */
  async insertIllustration(
    uid: string, bookId: string, revision: number, chapterId: string,
    position: number, illustration: Illustration,
  ): Promise<Book> {
    if (!uuid(bookId) || !uuid(chapterId) || !uuid(illustration.id) ||
        !Number.isInteger(position) || position < 0)
      fail("invalid_input");
    return this.db.runTransaction(async (tx) => {
      const ref = this.books().doc(bookId);
      const [p, b] = await tx.getAll(this.userRef(uid), ref);
      this.checkedProfile(p.data() as Profile | undefined);
      const book = this.checkedBook(b.data() as StoredBook | undefined, uid);
      if (!book.unlocked) fail("insufficient_credits");
      if (book.state.active_job) fail("busy");
      if (book.revision !== revision) fail("conflict");
      const chapter = book.chapters[chapterId];
      if (!chapter || position > chapter.content.length ||
          Object.keys(book.illustrations || {}).length >= 24)
        fail("invalid_input");
      const mark = illustrationMarker(illustration.id);
      const content = chapter.content.slice(0, position) + "\n\n" + mark +
        "\n\n" + chapter.content.slice(position);
      if (content.length > 30000) fail("too_large");
      const versions = await this.versionPlan(tx, ref);
      const next: StoredBook = {
        ...book,
        chapters: { ...book.chapters, [chapterId]: { ...chapter, content } },
        illustrations: { ...book.illustrations, [illustration.id]: illustration },
        revision: book.revision + 1,
        updated_at: new Date().toISOString(),
      };
      assertBookSize(bookOnly(next));
      this.writeVersion(tx, ref, book, versions);
      tx.set(ref, next);
      return bookOnly(next);
    });
  }
  async takeRate(key: string, limit: number, seconds = 3600) {
    const now = Date.now();
    const ref = this.root
      .collection("rates")
      .doc(digest(`${key}:${Math.floor(now / (seconds * 1000))}`));
    await this.db.runTransaction(async (tx) => {
      const value = await tx.get(ref);
      const hits = (value.get("hits") || 0) + 1;
      if (hits > limit) fail("rate_limit");
      tx.set(ref, { hits, expires_at: new Date(now + seconds * 1000) });
    });
  }
  async prepareJob(
    uid: string,
    id: string,
    kind: JobKind,
    chapter: string | null,
    requestId: string,
    ownerTrial = false,
    image?: { prompt: string; position: number; caption: string; size: "small" | "medium" | "full" },
  ): Promise<WorkerJob> {
    if (!uuid(id) || !uuid(requestId)) fail("invalid_input");
    const jobId = digest(`${uid}:${requestId}`);
    return this.db.runTransaction(async (tx) => {
      const pRef = this.userRef(uid),
        bRef = this.books().doc(id),
        jRef = this.jobs().doc(jobId);
      const currentDay = Math.floor(Date.now() / day);
      const gRef = this.root.collection("rates").doc(`ai-${currentDay}`);
      const imageRef = this.root.collection("rates").doc(`ai-image-${currentDay}`);
      const [p, b, j, global, images] = await tx.getAll(
        pRef, bRef, jRef, gRef, imageRef,
      );
      // Private owner trial is authorized by the verified session in the API.
      // No credit is charged while payments are explicitly disabled.
      const profile = this.checkedProfile(p.data() as Profile | undefined);
      const book = this.checkedBook(b.data() as StoredBook | undefined, uid);
      if (j.exists) {
        const old = j.data() as WorkerJob;
        if (
          old.book_id !== id ||
          old.kind !== kind ||
          old.chapter_id !== chapter ||
          (kind === "illustration" && (old.image_prompt !== image?.prompt || old.image_position !== image?.position))
        )
          fail("invalid_input");
        return old;
      }
      if (book.state.active_job) fail("busy");
      const now = Date.now(),
        times = recent(profile.job_times, now);
      // Surface known budget exhaustion BEFORE queueing a workflow or taking
      // credits. The per-call reserveAi transaction remains the final guard.
      const limits = aiDailyLimits();
      if (!ownerTrial && (recent(profile.ai_times || [], now).length >= limits.user ||
          (global.get("hits") || 0) >= limits.global))
        fail("ai_daily_limit");
      if (!ownerTrial && ["cover", "back_cover", "illustration"].includes(kind) &&
          (recent(profile.image_times || [], now).length >= limits.imagesUser ||
          (images.get("hits") || 0) >= limits.imagesGlobal))
        fail("ai_image_daily_limit");
      if (!ownerTrial && (times.length >= 30 || book.state.jobs >= 50)) fail("rate_limit");
      if (kind === "outline" && book.outline.length) fail("invalid_input");
      if (kind !== "outline" && !book.outline.length) fail("no_outline");
      if (kind === "sample" && book.chapters[book.outline[0].id])
        fail("invalid_input");
      if (kind === "chapter" && !book.outline.some((c) => c.id === chapter))
        fail("invalid_input");
      if (kind === "illustration") {
        const draft = chapter ? book.chapters[chapter] : undefined;
        if (!image || !draft || !book.unlocked || image.position > draft.content.length ||
            Object.keys(book.illustrations || {}).length >= 24)
          fail("invalid_input");
      }
      if (!ownerTrial && ["cover", "back_cover"].includes(kind) && book.state.covers >= 5) fail("rate_limit");
      if (!ownerTrial && kind === "chapter" && (book.state.rewrites[chapter!] || 0) >= 3)
        fail("rate_limit");
      let credits = profile.credits,
        free = profile.free_book_id;
      if (!book.unlocked) {
        if (
          ["book", "chapter", "cover", "back_cover", "illustration"].includes(kind) ||
          book.state.ai_calls >= 8 ||
          (kind === "outline" && free && free !== id)
        ) {
          if (!ownerTrial) {
            if (credits < 1) fail("insufficient_credits");
            credits--;
          }
          book.unlocked = true;
          book.revision++;
          book.updated_at = new Date(now).toISOString();
        } else if (!free) free = id;
        else if (free !== id) fail("free_preview_used");
      }
      const job: WorkerJob = {
        id: jobId,
        owner_trial: ownerTrial,
        request_id: requestId,
        book_id: id,
        user_id: uid,
        kind,
        chapter_id: chapter,
        ...(kind === "illustration" ? {
          image_prompt: image!.prompt,
          image_position: image!.position,
          image_caption: image!.caption,
          image_size: image!.size,
        } : {}),
        status: "queued",
        progress: 0,
        error_code: null,
        run_id: null,
        result_units: {},
        created_at: new Date(now).toISOString(),
        updated_at: new Date(now).toISOString(),
      };
      book.state = {
        ...book.state,
        active_job: jobId,
        latest_job: jobId,
        jobs: book.state.jobs + 1,
      };
      tx.set(bRef, book);
      tx.update(pRef, {
        credits,
        free_book_id: free,
        job_times: ownerTrial ? times : [...times, now],
        active_jobs: profile.active_jobs + 1,
      });
      tx.create(jRef, job);
      return job;
    });
  }
  async job(id: string): Promise<WorkerJob | null> {
    return ((await this.jobs().doc(id).get()).data() as WorkerJob) || null;
  }
  async latestJob(bookId: string): Promise<WorkerJob | null> {
    const book = (await this.books().doc(bookId).get()).data() as
      StoredBook | undefined;
    return book?.state.latest_job ? this.job(book.state.latest_job) : null;
  }
  async claimJob(id: string, runId: string): Promise<boolean> {
    return this.db.runTransaction(async (tx) => {
      const ref = this.jobs().doc(id),
        job = (await tx.get(ref)).data() as WorkerJob | undefined;
      if (!job || !active(job) || (job.run_id && job.run_id !== runId))
        return false;
      tx.update(ref, {
        run_id: runId,
        status: "running",
        updated_at: new Date().toISOString(),
      });
      return true;
    });
  }
  async attachRun(id: string, runId: string): Promise<WorkerJob> {
    return this.db.runTransaction(async (tx) => {
      const ref = this.jobs().doc(id),
        job = (await tx.get(ref)).data() as WorkerJob | undefined;
      if (!job) fail("not_found");
      if (!job.run_id && active(job)) {
        tx.update(ref, { run_id: runId });
        return { ...job, run_id: runId };
      }
      return job;
    });
  }
  async reserveAi(
    id: string,
    operation: string,
    model: string,
  ): Promise<string> {
    const usageId = randomUUID(),
      now = Date.now();
    return this.db.runTransaction(async (tx) => {
      const job = (await tx.get(this.jobs().doc(id))).data() as
        WorkerJob | undefined;
      if (!job || !active(job)) fail("not_found");
      const pRef = this.userRef(job.user_id),
        bRef = this.books().doc(job.book_id);
      const dayId = Math.floor(now / day);
      const gRef = this.root.collection("rates").doc(`ai-${dayId}`);
      const imageRef = this.root.collection("rates").doc(`ai-image-${dayId}`);
      const imageRequest = ["cover", "back_cover", "illustration"].some(
        (kind) => operation === kind || operation.startsWith(kind + ":")
      );
      const [p, b, g, imageCount] = await tx.getAll(pRef, bRef, gRef, imageRef);
      const limits = aiDailyLimits();
      const profile = this.checkedProfile(p.data() as Profile | undefined);
      const book = this.checkedBook(
        b.data() as StoredBook | undefined,
        job.user_id,
      );
      const times = recent(profile.ai_times || [], now);
      const imageTimes = recent(profile.image_times || [], now);
      const global = g.get("hits") || 0;
      const globalImages = imageCount.get("hits") || 0;
      if (book.state.active_job !== id) fail("conflict");
      const isOwnerTest = job.owner_trial === true;
      if (!isOwnerTest) {
        if (book.state.ai_calls >= (book.unlocked ? limits.book : 8))
          fail("ai_book_limit");
        if (times.length >= limits.user || global >= limits.global)
          fail("ai_daily_limit");
        if (imageRequest && (imageTimes.length >= limits.imagesUser ||
            globalImages >= limits.imagesGlobal))
          fail("ai_image_daily_limit");
        tx.update(pRef, {
          ai_times: [...times, now],
          ...(imageRequest ? { image_times: [...imageTimes, now] } : {}),
        });
        tx.set(gRef, { hits: global + 1, expires_at: new Date(now + day) });
        if (imageRequest) tx.set(imageRef, {
          hits: globalImages + 1, expires_at: new Date(now + day),
        });
      }
      // Keep usage accounting during tests without consuming public quota.
      tx.update(bRef, { "state.ai_calls": book.state.ai_calls + 1 });
      tx.create(this.root.collection("aiUsage").doc(usageId), {
        id: usageId,
        user_id: job.user_id,
        book_id: job.book_id,
        job_id: id,
        operation,
        model,
        input_tokens: 0,
        output_tokens: 0,
        created_at: new Date(now).toISOString(),
      });
      return usageId;
    });
  }
  /**
   * Persist only a safe, application-defined failure code while a workflow is
   * running. Workflow runtimes can wrap or lose the original error message;
   * this is the authoritative fallback when finalizing a failed job.
   */
  async noteJobFailure(id: string, code: string): Promise<void> {
    const ref = this.jobs().doc(id);
    await this.db.runTransaction(async (tx) => {
      const snapshot = await tx.get(ref);
      const job = snapshot.data() as WorkerJob | undefined;
      if (!job || !active(job)) return;
      tx.update(ref, {
        error_code: code,
        updated_at: new Date().toISOString(),
      });
    });
  }

  async recordUsage(id: string, input: number, output: number) {
    await this.root
      .collection("aiUsage")
      .doc(id)
      .update({ input_tokens: input, output_tokens: output });
  }
  async context(id: string) {
    const job = await this.job(id);
    if (!job || !active(job)) fail("not_found");
    return { job, book: await this.ownedBook(job.book_id, job.user_id) };
  }
  async commitGenerated(
    id: string,
    patch: {
      title?: string;
      subtitle?: string;
      outline?: OutlineItem[];
      chapter_id?: string;
      chapter?: Chapter;
      cover_path?: string;
      back_cover_path?: string;
      illustration_path?: string;
    },
    progress: number,
  ) {
    await this.db.runTransaction(async (tx) => {
      const jRef = this.jobs().doc(id),
        j = await tx.get(jRef),
        job = j.data() as WorkerJob | undefined;
      if (!job || !active(job)) fail("not_found");
      const unit = patch.outline ? "outline" : job.kind === "illustration" ? "illustration" :
        job.kind === "back_cover" ? "back_cover" : patch.chapter_id || "cover";
      if (job.result_units[unit]) return;
      const bRef = this.books().doc(job.book_id),
        pRef = this.userRef(job.user_id);
      const [b, p] = await tx.getAll(bRef, pRef);
      this.checkedProfile(p.data() as Profile | undefined);
      const book = this.checkedBook(
        b.data() as StoredBook | undefined,
        job.user_id,
      );
      if (book.state.active_job !== id) fail("conflict");
      const previous = await this.versionPlan(tx, bRef);
      const next = structuredClone(book);
      if (patch.outline) {
        if (
          job.kind !== "outline" ||
          patch.outline.length !== book.chapter_count
        )
          fail("invalid_input");
        next.title = patch.title!;
        next.subtitle = patch.subtitle!;
        next.outline = patch.outline;
      } else if (patch.chapter_id && patch.chapter) {
        if (
          !book.outline.some((c) => c.id === patch.chapter_id) ||
          (!book.unlocked && patch.chapter_id !== book.outline[0].id)
        )
          fail("invalid_input");
        next.chapters[patch.chapter_id] = patch.chapter;
      } else if (patch.cover_path && job.kind === "cover") {
        next.cover_candidate_path = patch.cover_path;
      } else if (patch.back_cover_path && job.kind === "back_cover") {
        next.back_cover_candidate_path = patch.back_cover_path;
      } else if (patch.illustration_path && job.kind === "illustration") {
        const chapter = job.chapter_id ? next.chapters[job.chapter_id] : undefined;
        if (!chapter || Object.keys(next.illustrations || {}).length >= 24)
          fail("invalid_input");
        const position = job.image_position ?? chapter.content.length;
        if (position > chapter.content.length) fail("conflict");
        const id = job.request_id;
        const mark = illustrationMarker(id);
        const content = chapter.content.slice(0, position) + "\n\n" + mark +
          "\n\n" + chapter.content.slice(position);
        if (content.length > 30000) fail("too_large");
        chapter.content = content;
        next.illustrations = {
          ...next.illustrations,
          [id]: { id, source: "ai", path: patch.illustration_path,
            alt: job.image_prompt || "", caption: job.image_caption || "",
            size: job.image_size || "medium" },
        };
      } else fail("invalid_input");
      next.revision++;
      next.updated_at = new Date().toISOString();
      assertBookSize(bookOnly(next));
      this.writeVersion(tx, bRef, book, previous);
      tx.set(bRef, next);
      tx.update(jRef, {
        progress: Math.min(99, Math.max(0, progress)),
        status: "running",
        result_units: { ...job.result_units, [unit]: true },
        updated_at: new Date().toISOString(),
      });
    });
  }
  async finishJob(
    id: string,
    error: string | null = null,
    onlyWithoutRun = false,
  ) {
    return this.db.runTransaction(async (tx) => {
      const jRef = this.jobs().doc(id),
        job = (await tx.get(jRef)).data() as WorkerJob | undefined;
      if (!job || !active(job) || (onlyWithoutRun && job.run_id))
        return job || null;
      const bRef = this.books().doc(job.book_id),
        pRef = this.userRef(job.user_id);
      const [b, p] = await tx.getAll(bRef, pRef);
      const book = b.data() as StoredBook | undefined,
        profile = p.data() as Profile | undefined;
      if (book?.state.active_job === id) {
        const state = { ...book.state, active_job: null };
        if (!error && ["cover", "back_cover"].includes(job.kind)) state.covers++;
        if (!error && job.kind === "chapter")
          state.rewrites = {
            ...state.rewrites,
            [job.chapter_id!]: (state.rewrites[job.chapter_id!] || 0) + 1,
          };
        tx.update(bRef, { state });
        if (profile)
          tx.update(pRef, {
            active_jobs: Math.max(0, profile.active_jobs - 1),
          });
      }
      const finalError = error === "generation_failed" && job.error_code
        ? job.error_code
        : error;
      const next = {
        ...job,
        status: finalError ? ("failed" as const) : ("completed" as const),
        error_code: finalError,
        progress: error ? job.progress : 100,
        updated_at: new Date().toISOString(),
      };
      tx.set(jRef, next);
      return next;
    });
  }
  async applyOrder(
    orderId: string,
    uid: string,
    credits: 1 | 3,
    refunded: boolean,
    test: boolean,
  ) {
    const ref = this.root.collection("orders").doc(digest(orderId));
    await this.db.runTransaction(async (tx) => {
      const old = await tx.get(ref),
        o = old.data();
      if (
        o &&
        (o.credits !== credits ||
          o.test_mode !== test ||
          (o.user_id && o.user_id !== uid))
      )
        fail("invalid_input");
      if (o && (!refunded || o.status === "refunded")) return;
      const pRef = this.userRef(o?.user_id || uid),
        profile = (await tx.get(pRef)).data() as Profile | undefined;
      if (!o) this.checkedProfile(profile);
      if (profile?.deleting) fail("busy");
      if (o) {
        if (o.user_id && profile)
          tx.update(pRef, { credits: profile.credits - credits });
        tx.update(ref, {
          status: "refunded",
          updated_at: new Date().toISOString(),
        });
        return;
      }
      tx.create(ref, {
        id: orderId,
        user_id: uid,
        credits,
        status: refunded ? "refunded" : "paid",
        test_mode: test,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      if (!refunded) tx.update(pRef, { credits: profile!.credits + credits });
    });
  }
  async lockBookDeletion(uid: string, id: string): Promise<void> {
    if (!uuid(id)) fail("not_found");
    await this.db.runTransaction(async (tx) => {
      const ref = this.books().doc(id),
        b = (await tx.get(ref)).data() as StoredBook | undefined;
      if (!b || b.user_id !== uid) fail("not_found");
      if (b.state.active_job) fail("busy");
      tx.update(ref, { "state.deleting": true });
    });
  }
  async unlockBookDeletion(uid: string, id: string) {
    const ref = this.books().doc(id);
    await this.db.runTransaction(async (tx) => {
      const b = await tx.get(ref);
      if (b.exists && b.get("user_id") === uid)
        tx.update(ref, { "state.deleting": false });
    });
  }
  async unlockAccountDeletion(uid: string) {
    const ref = this.userRef(uid);
    await this.db.runTransaction(async (tx) => {
      const p = await tx.get(ref);
      if (p.exists) tx.update(ref, { deleting: false });
    });
  }
  private async deleteQuery(collection: string, field: string, value: string) {
    for (;;) {
      const rows = await this.root
        .collection(collection)
        .where(field, "==", value)
        .limit(100)
        .get();
      if (rows.empty) break;
      const batch = this.db.batch();
      for (const row of rows.docs) batch.delete(row.ref);
      await batch.commit();
    }
  }
  async deleteBookRecords(uid: string, id: string) {
    const ref = this.books().doc(id);
    await this.db.recursiveDelete(ref.collection("versions"));
    await this.deleteQuery("jobs", "book_id", id);
    await this.deleteQuery("aiUsage", "book_id", id);
    await this.db.runTransaction(async (tx) => {
      const pRef = this.userRef(uid),
        [p, b] = await tx.getAll(pRef, ref);
      if (!b.exists) return;
      if (b.get("user_id") !== uid || !b.get("state.deleting"))
        fail("forbidden");
      tx.delete(ref);
      if (p.exists)
        tx.update(pRef, { book_count: Math.max(0, p.get("book_count") - 1) });
    });
  }
  async lockAccountDeletion(uid: string) {
    await this.db.runTransaction(async (tx) => {
      const ref = this.userRef(uid),
        p = (await tx.get(ref)).data() as Profile | undefined;
      if (!p) fail("not_found");
      if (p.active_jobs > 0) fail("busy");
      tx.update(ref, { deleting: true });
    });
  }
  async accountBooks(uid: string): Promise<string[]> {
    return (
      await this.books().where("user_id", "==", uid).select().get()
    ).docs.map((d) => d.id);
  }
  async deleteAccountRecords(uid: string) {
    // Never delete or revoke the shared Firebase identity. Other applications
    // may still need it. Retained order records lose the application user link.
    const orders = await this.root
      .collection("orders")
      .where("user_id", "==", uid)
      .get();
    for (let i = 0; i < orders.docs.length; i += 100) {
      const batch = this.db.batch();
      for (const order of orders.docs.slice(i, i + 100))
        batch.update(order.ref, { user_id: null });
      await batch.commit();
    }
    await this.deleteQuery("jobs", "user_id", uid);
    await this.deleteQuery("aiUsage", "user_id", uid);
    await this.userRef(uid).delete();
  }
  async cleanupRates() {
    const rows = await this.root
      .collection("rates")
      .where("expires_at", "<", new Date(Date.now() - day))
      .limit(100)
      .get();
    if (rows.empty) return;
    const batch = this.db.batch();
    for (const row of rows.docs) batch.delete(row.ref);
    await batch.commit();
  }
}
