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
    const input = await readJson(request, editBookSchema);
    // Refresh continuity summaries from the author's latest manuscript, not stale AI output.
    // Keep both opening and ending context so later chapters know how the scene concluded.
    for (const chapter of Object.values(input.chapters)) {
      const plain = chapter.content.replace(/^[#*> -]+/gm, "").trim();
      chapter.summary = plain.length <= 1000 ? plain :
        plain.slice(0, 650).trimEnd() + " … " + plain.slice(-345).trimStart();
    }
    return json({
      book: await withCover(await studioStore().saveBook(user.id, id, input)),
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
      ]),
      1200,
    );
    await takeRate(`book-actions:${user.id}`, 15);
    const book = input.action === "restart"
      ? await studioStore().restartBook(user.id, id, input.language, input.revision)
      : await studioStore().createManualOutline(user.id, id, input.revision);
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
    await store.lockBookDeletion(user.id, id);
    try {
      await deleteBookArtwork(user.id, id);
      await store.deleteBookRecords(user.id, id);
    } catch (e) {
      await store.unlockBookDeletion(user.id, id);
      throw e;
    }
    return json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
