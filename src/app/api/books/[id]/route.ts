import { z } from "zod";
import { requireUser } from "@/lib/firebase-session";
import { studioStore } from "@/lib/firebase-admin";
import { assertOrigin, readJson, apiError, json } from "@/lib/http";
import { ownedBook, withCover, takeRate, deleteBookArtwork } from "@/lib/books";
import { editBookSchema } from "@/lib/domain";
import { reconcileJob } from "@/lib/jobs";
type Context = { params: Promise<{ id: string }> };
export async function GET(_: Request, ctx: Context) {
  try {
    const { id } = await ctx.params,
      { user } = await requireUser(),
      store = studioStore();
    const book = await ownedBook(id, user.id);
    const [job, profile] = await Promise.all([
      store.latestJob(id),
      store.profile(user.id),
    ]);
    return json({
      book: await withCover(book),
      job: await reconcileJob(job),
      credits: profile?.credits || 0,
    });
  } catch (e) {
    return apiError(e);
  }
}
export async function PATCH(request: Request, ctx: Context) {
  try {
    assertOrigin(request);
    const { id } = await ctx.params,
      { user } = await requireUser();
    await takeRate(`save:${user.id}`, 1000);
    const { checkpoint, ...input } = await readJson(request, editBookSchema.safeExtend({ checkpoint: z.boolean().optional() }));
    // Refresh continuity summaries from the author's latest manuscript, not stale AI output.
    // Keep both opening and ending context so later chapters know how the scene concluded.
    for (const chapter of Object.values(input.chapters)) {
      const plain = chapter.content.replace(/^[#*> -]+/gm, "").trim();
      chapter.summary = plain.length <= 1000 ? plain :
        plain.slice(0, 650).trimEnd() + " … " + plain.slice(-345).trimStart();
    }
    return json({
      book: await withCover(await studioStore().saveBook(user.id, id, input, checkpoint ?? true)),
    });
  } catch (e) {
    return apiError(e);
  }
}
/** The restart action archives the current manuscript and keeps the book and its credits. */
export async function POST(request: Request, ctx: Context) {
  try {
    assertOrigin(request);
    const { id } = await ctx.params,
      { user } = await requireUser();
    const input = await readJson(
      request,
      z.discriminatedUnion("action", [
        z.object({
          action: z.literal("restart"),
          revision: z.number().int().nonnegative(),
          language: z.enum(["en", "ar", "sv"]),
        }),
        z.object({
          action: z.literal("manual_outline"),
          revision: z.number().int().nonnegative(),
        }),
        z.object({
          action: z.literal("rename"),
          revision: z.number().int().nonnegative(),
          title: z.string().trim().min(1).max(180),
        }),
        z.object({ action: z.literal("restore") }),
      ]),
      1200,
    );
    if (input.action === "restart" || input.action === "manual_outline")
      await takeRate(`book-actions:${user.id}`, 15);
    const store = studioStore();
    const book = input.action === "restart"
      ? await store.restartBook(user.id, id, input.language, input.revision)
      : input.action === "manual_outline"
        ? await store.createManualOutline(user.id, id, input.revision)
        : input.action === "rename"
          ? await store.renameBook(user.id, id, input.revision, input.title)
          : await store.restoreTrashedBook(user.id, id);
    return json({ book: await withCover(book) });
  } catch (e) {
    return apiError(e);
  }
}
export async function DELETE(request: Request, ctx: Context) {
  try {
    assertOrigin(request);
    const { id } = await ctx.params,
      { user } = await requireUser(),
      store = studioStore();
    if (new URL(request.url).searchParams.get("permanent") !== "1") {
      await store.trashBook(user.id, id);
      return json({ ok: true, trashed: true });
    }
    // A permanent purge is available only after the owner moved the book to trash.
    await store.lockBookDeletion(user.id, id, true);
    try {
      await deleteBookArtwork(user.id, id);
      await store.deleteBookRecords(user.id, id);
    } catch (e) {
      await store.unlockBookDeletion(user.id, id);
      throw e;
    }
    return json({ ok: true, permanent: true });
  } catch (e) {
    return apiError(e);
  }
}
