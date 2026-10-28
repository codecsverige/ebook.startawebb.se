import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import {
  initializeTestEnvironment,
  assertFails,
} from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { FirestoreStudio } from "../src/lib/firestore-store";
import { STUDIO_PATH } from "../src/lib/firebase-config";
import type { Brief } from "../src/lib/domain";

const emulator = process.env.FIRESTORE_EMULATOR_HOST;
test(
  "Firestore emulator: ownership, shared-project isolation, credits, jobs, retries, versions, refunds and deletion",
  { skip: !emulator, timeout: 120000 },
  async () => {
    assert.match(
      emulator!,
      /^(127\.0\.0\.1|localhost):\d+$/,
      "Never run the database suite against a live project",
    );
    const projectId = "demo-ebook-studio";
    const app = initializeApp({ projectId }, `test-${randomUUID()}`),
      db = getFirestore(app),
      store = new FirestoreStudio(db);
    const uid = `firebaseUser-${randomUUID()}`,
      other = `firebaseUser-${randomUUID()}`;
    const brief: Brief = {
      idea: "A practical guide to improving daily focus.",
      audience: "Freelancers",
      kind: "guide",
      language: "en",
      tone: "clear",
      author: "",
      chapter_count: 3,
    };
    let env: Awaited<ReturnType<typeof initializeTestEnvironment>> | undefined;
    try {
      await Promise.all([store.ensureProfile(uid), store.ensureProfile(other)]);
      const foreign = db.doc(`users/${uid}`);
      await foreign.set({
        role: "admin",
        credits: 999,
        marker: "belongs-to-HyrNara",
      });
      const foreignListing = db.doc(`listings/${randomUUID()}`);
      await foreignListing.set({
        ownerId: uid,
        title: "Existing business listing",
      });
      const book = await store.createBook(uid, brief),
        book2 = await store.createBook(uid, brief);
      await assert.rejects(store.ownedBook(book, other), /not_found/);
      await assert.rejects(store.saveBook(other, book, {}));
      const request = randomUUID();
      const [job, duplicate] = await Promise.all([
        store.prepareJob(uid, book, "outline", null, request),
        store.prepareJob(uid, book, "outline", null, request),
      ]);
      assert.equal(job.id, duplicate.id);
      await assert.rejects(
        store.prepareJob(uid, book2, "outline", null, request),
        /invalid_input/,
      );
      assert.equal(await store.claimJob(job.id, "first-run"), true);
      assert.equal(await store.claimJob(job.id, "duplicate-run"), false);
      assert.equal(
        (await store.attachRun(job.id, "duplicate-run")).run_id,
        "first-run",
      );
      const outline = [1, 2, 3].map((n) => ({
        id: randomUUID(),
        title: `Chapter ${n}`,
        summary: "Specific practical guidance.",
      }));
      await Promise.all([
        store.commitGenerated(
          job.id,
          { title: "Test book", subtitle: "Subtitle", outline },
          95,
        ),
        store.commitGenerated(
          job.id,
          { title: "Test book", subtitle: "Subtitle", outline },
          95,
        ),
      ]);
      assert.equal((await store.ownedBook(book, uid)).revision, 1);
      await store.finishJob(job.id);
      await assert.rejects(
        store.prepareJob(uid, book2, "outline", null, randomUUID()),
        /insufficient_credits/,
      );
      await Promise.all([
        store.applyOrder("store:order1", uid, 3, false, false),
        store.applyOrder("store:order1", uid, 3, false, false),
      ]);
      assert.equal((await store.profile(uid))!.credits, 3);
      const paidRequest = randomUUID();
      const [paid, repeated] = await Promise.all([
        store.prepareJob(uid, book, "book", null, paidRequest),
        store.prepareJob(uid, book, "book", null, paidRequest),
      ]);
      assert.equal(paid.id, repeated.id);
      assert.equal((await store.profile(uid))!.credits, 2);
      const edit = {
        ...(await store.ownedBook(book, uid)),
        title: "Edited title",
      };
      await assert.rejects(store.saveBook(uid, book, edit), /busy/);
      await store.finishJob(paid.id, "generation_failed");
      const saved = await store.saveBook(uid, book, edit);
      await assert.rejects(store.saveBook(uid, book, edit), /conflict/);
      const history = await store.versions(uid, book);
      assert.equal(history.length, 2);
      assert.equal(
        (await store.version(uid, book, history[0].id)).title,
        "Test book",
      );
      await assert.rejects(
        store.version(other, book, history[0].id),
        /not_found/,
      );
      const resumed = await store.prepareJob(
        uid,
        book,
        "book",
        null,
        randomUUID(),
      );
      assert.equal((await store.profile(uid))!.credits, 2);
      await assert.rejects(store.lockBookDeletion(uid, book), /busy/);
      await assert.rejects(store.lockAccountDeletion(uid), /busy/);
      const chapter = {
        content: "Useful original paragraph. ".repeat(350),
        summary: "A useful chapter summary for continuity.",
      };
      await Promise.all([
        store.commitGenerated(
          resumed.id,
          { chapter_id: outline[0].id, chapter },
          50,
        ),
        store.commitGenerated(
          resumed.id,
          { chapter_id: outline[0].id, chapter },
          50,
        ),
      ]);
      assert.equal(
        (await store.ownedBook(book, uid)).chapters[outline[0].id].content,
        chapter.content,
      );
      assert.equal("state" in (await store.ownedBook(book, uid)), false);
      await store.finishJob(resumed.id);
      // A generated cover is a suggestion, not automatically published artwork.
      const coverJob = await store.prepareJob(uid, book, "cover", null, randomUUID());
      const candidatePath = "test/covers/" + randomUUID() + ".png";
      await store.commitGenerated(coverJob.id, { cover_path: candidatePath }, 95);
      await store.finishJob(coverJob.id);
      let currentBook = await store.ownedBook(book, uid);
      assert.equal(currentBook.cover_path, null);
      assert.equal(currentBook.cover_candidate_path, candidatePath);
      currentBook = await store.decideCoverCandidate(uid, book, currentBook.revision, true);
      assert.equal(currentBook.cover_path, candidatePath);
      assert.equal(currentBook.cover_candidate_path, null);
      const restarted = await store.restartBook(uid, book, "ar", currentBook.revision);
      assert.equal(restarted.language, "ar");
      assert.equal(restarted.outline.length, 0);
      assert.equal(Object.keys(restarted.chapters).length, 0);
      const versionsAfterRestart = await store.versions(uid, book);
      const restored = await store.restoreBookVersion(uid, book, versionsAfterRestart[0].id, restarted.revision);
      assert.equal(restored.language, "en");
      assert.equal(restored.outline.length, 3);
      assert.equal(restored.chapters[outline[0].id].content, chapter.content);
      await assert.rejects(store.restoreBookVersion(other, book, versionsAfterRestart[0].id, restored.revision), /not_found/);
      for (let n = 0; n < 22; n++) {
        const current = await store.ownedBook(book, uid);
        await store.saveBook(uid, book, { ...current, title: `Save ${n}` });
      }
      assert.equal((await store.versions(uid, book)).length, 20);
      await store.applyOrder("store:order1", uid, 3, true, false);
      await store.applyOrder("store:order1", uid, 3, true, false);
      assert.equal((await store.profile(uid))!.credits, -1);
      await store.applyOrder("store:order1", uid, 3, false, false);
      assert.equal((await store.profile(uid))!.credits, -1);
      await store.applyOrder("store:refund-first", uid, 1, true, false);
      await store.applyOrder("store:refund-first", uid, 1, false, false);
      assert.equal((await store.profile(uid))!.credits, -1);
      await assert.rejects(
        store.applyOrder("store:order1", other, 3, false, false),
        /invalid_input/,
      );
      await store.takeRate("test-rate", 1);
      await assert.rejects(store.takeRate("test-rate", 1), /rate_limit/);
      const trial = await store.createBook(other, brief),
        free = await store.prepareJob(
          other,
          trial,
          "outline",
          null,
          randomUUID(),
        );
      await Promise.all(
        Array.from({ length: 8 }, () =>
          store.reserveAi(free.id, "outline", "test/model"),
        ),
      );
      await assert.rejects(
        store.reserveAi(free.id, "outline", "test/model"),
        /rate_limit/,
      );
      await store.finishJob(free.id, "generation_failed");
      await assert.rejects(
        store.prepareJob(other, trial, "outline", null, randomUUID()),
        /insufficient_credits/,
      );
      await store.applyOrder("store:recovery", other, 1, false, false);
      const recovered = await store.prepareJob(
        other,
        trial,
        "outline",
        null,
        randomUUID(),
      );
      assert.equal((await store.profile(other))!.credits, 0);
      assert.equal((await store.ownedBook(trial, other)).unlocked, true);
      await store.reserveAi(recovered.id, "outline", "test/model");
      await store.finishJob(recovered.id);
      await store.lockBookDeletion(other, trial);
      await assert.rejects(
        store.prepareJob(other, trial, "outline", null, randomUUID()),
        /not_found/,
      );
      await store.deleteBookRecords(other, trial);
      assert.equal((await store.profile(other))!.free_book_id, trial);
      assert.equal((await store.profile(other))!.book_count, 0);

      // Cost protection: image attempts are counted BEFORE an image request.
      // An aggressive client cannot exceed three generated images per day.
      const artist = `coverTester-${randomUUID()}`;
      await store.ensureProfile(artist);
      const artworkBook = await store.createBook(artist, brief);
      const outlineJob = await store.prepareJob(
        artist, artworkBook, "outline", null, randomUUID(),
      );
      await store.commitGenerated(outlineJob.id, {
        title: "Test protected cover",
        subtitle: "",
        outline: [1, 2, 3].map((number) => ({
          id: randomUUID(), title: `Chapter ${number}`, summary: "Details",
        })),
      }, 95);
      await store.finishJob(outlineJob.id);
      const protectedCover = await store.prepareJob(
        artist, artworkBook, "cover", null, randomUUID(), true,
      );
      for (let i = 0; i < 3; i++)
        await store.reserveAi(protectedCover.id, "cover", "test/model");
      await assert.rejects(
        store.reserveAi(protectedCover.id, "cover", "test/model"),
        /ai_image_daily_limit/,
      );
      assert.equal((await store.profile(artist))?.image_times?.length, 3);
      await store.finishJob(protectedCover.id, "generation_failed");
      assert.equal((await store.ownedBook(artworkBook, artist)).cover_path, null);

      // Load the actual HyrNära rules when available; do not modify/deploy them.
      const rules = await readFile(
        process.env.EBOOK_SHARED_RULES_PATH ||
          new URL("../firebase/emulator.firestore.rules", import.meta.url),
        "utf8",
      );
      const [host, port] = emulator!.split(":");
      env = await initializeTestEnvironment({
        projectId,
        firestore: { host, port: Number(port), rules },
      });
      const client = env.authenticatedContext(uid).firestore(),
        anonymous = env.unauthenticatedContext().firestore();
      await assertFails(getDoc(doc(client, `${STUDIO_PATH}/books/${book}`)));
      await assertFails(
        setDoc(doc(client, `${STUDIO_PATH}/profiles/forged`), {
          credits: 1000,
        }),
      );
      await assertFails(getDoc(doc(anonymous, `${STUDIO_PATH}/books/${book}`)));
      if (process.env.EBOOK_SHARED_RULES_PATH) {
        const own = await getDoc(doc(client, `users/${uid}`));
        assert.equal(own.get("marker"), "belongs-to-HyrNara");
      }
      let sharedAuth;
      if (process.env.FIREBASE_AUTH_EMULATOR_HOST) {
        const auth = getAuth(app),
          email = `${randomUUID()}@example.test`;
        await auth.createUser({
          uid,
          email,
          emailVerified: true,
          password: "Emulator-only-password-482!",
        });
        const signIn = await fetch(
          `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=emulator-test`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              email,
              password: "Emulator-only-password-482!",
              returnSecureToken: true,
            }),
          },
        );
        assert.equal(signIn.ok, true);
        const token = await signIn.json();
        assert.equal((await auth.verifyIdToken(token.idToken, true)).uid, uid);
        const cookie = await auth.createSessionCookie(token.idToken, {
          expiresIn: 86400000,
        });
        const verified = await auth.verifySessionCookie(cookie, true);
        assert.equal(verified.uid, uid);
        assert.equal(verified.email_verified, true);
        sharedAuth = auth;
      }
      await store.lockAccountDeletion(uid);
      await assert.rejects(store.createBook(uid, brief), /not_found/);
      for (const id of await store.accountBooks(uid)) {
        await store.lockBookDeletion(uid, id);
        await store.deleteBookRecords(uid, id);
      }
      await store.deleteAccountRecords(uid);
      assert.equal(await store.profile(uid), null);
      if (sharedAuth) assert.equal((await sharedAuth.getUser(uid)).uid, uid);
      assert.equal((await foreign.get()).get("marker"), "belongs-to-HyrNara");
      assert.equal((await foreignListing.get()).exists, true);
      await store.ensureProfile(uid);
      // An old detached order cannot charge a newly recreated studio profile.
      await store.applyOrder("store:order1", uid, 3, true, false);
      assert.equal((await store.profile(uid))!.credits, 0);
    } finally {
      await env?.cleanup();
      await db.terminate();
      await deleteApp(app);
    }
  },
);
