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
function fail(code: string): never {
  throw new AppError(
    code,
    ["busy", "conflict"].includes(code)
      ? 409
      : code === "rate_limit"
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
        cover_path: null,
        use_artwork: true,
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
        outline: [],
        chapters: {},
        cover_path: null,
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
      if (!book.cover_path) return bookOnly(book);
      const versions = await this.versionPlan(tx, ref);
      const next: StoredBook = {
        ...book, cover_path: null, use_artwork: false,
        revision: book.revision + 1, updated_at: new Date().toISOString(),
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
        ...book, cover_path: coverPath, use_artwork: true,
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
  ): Promise<WorkerJob> {
    if (!uuid(id) || !uuid(requestId)) fail("invalid_input");
    const jobId = digest(`${uid}:${requestId}`);
    return this.db.runTransaction(async (tx) => {
      const pRef = this.userRef(uid),
        bRef = this.books().doc(id),
        jRef = this.jobs().doc(jobId);
      const [p, b, j] = await tx.getAll(pRef, bRef, jRef);
      // Private owner trial is authorized by the verified session in the API.
      // No credit is charged while payments are explicitly disabled.
      const profile = this.checkedProfile(p.data() as Profile | undefined);
      const book = this.checkedBook(b.data() as StoredBook | undefined, uid);
      if (j.exists) {
        const old = j.data() as WorkerJob;
        if (
          old.book_id !== id ||
          old.kind !== kind ||
          old.chapter_id !== chapter
        )
          fail("invalid_input");
        return old;
      }
      if (book.state.active_job) fail("busy");
      const now = Date.now(),
        times = recent(profile.job_times, now);
      if (times.length >= 30 || book.state.jobs >= 50) fail("rate_limit");
      if (kind === "outline" && book.outline.length) fail("invalid_input");
      if (kind !== "outline" && !book.outline.length) fail("no_outline");
      if (kind === "sample" && book.chapters[book.outline[0].id])
        fail("invalid_input");
      if (kind === "chapter" && !book.outline.some((c) => c.id === chapter))
        fail("invalid_input");
      if (kind === "cover" && book.state.covers >= 5) fail("rate_limit");
      if (kind === "chapter" && (book.state.rewrites[chapter!] || 0) >= 3)
        fail("rate_limit");
      let credits = profile.credits,
        free = profile.free_book_id;
      if (!book.unlocked) {
        if (
          ["book", "chapter", "cover"].includes(kind) ||
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
        request_id: requestId,
        book_id: id,
        user_id: uid,
        kind,
        chapter_id: chapter,
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
        job_times: [...times, now],
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
      const gRef = this.root
        .collection("rates")
        .doc(`ai-${Math.floor(now / day)}`);
      const [p, b, g] = await tx.getAll(pRef, bRef, gRef);
      const profile = this.checkedProfile(p.data() as Profile | undefined);
      const book = this.checkedBook(
        b.data() as StoredBook | undefined,
        job.user_id,
      );
      const times = recent(profile.ai_times, now),
        global = g.get("hits") || 0;
      if (
        book.state.active_job !== id ||
        times.length >= 100 ||
        book.state.ai_calls >= (book.unlocked ? 80 : 8) ||
        global >= 500
      )
        fail("rate_limit");
      tx.update(pRef, { ai_times: [...times, now] });
      tx.update(bRef, { "state.ai_calls": book.state.ai_calls + 1 });
      tx.set(gRef, { hits: global + 1, expires_at: new Date(now + day) });
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
    },
    progress: number,
  ) {
    await this.db.runTransaction(async (tx) => {
      const jRef = this.jobs().doc(id),
        j = await tx.get(jRef),
        job = j.data() as WorkerJob | undefined;
      if (!job || !active(job)) fail("not_found");
      const unit = patch.outline ? "outline" : patch.chapter_id || "cover";
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
      } else if (patch.cover_path) {
        next.cover_path = patch.cover_path;
        next.use_artwork = true;
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
        if (!error && job.kind === "cover") state.covers++;
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
      const next = {
        ...job,
        status: error ? ("failed" as const) : ("completed" as const),
        error_code: error,
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
