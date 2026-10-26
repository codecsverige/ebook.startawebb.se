import { requireUser, adminClient } from "@/lib/supabase";
import {
  assertOrigin,
  readJson,
  apiError,
  json,
  dbError,
  AppError,
} from "@/lib/http";
import { ownedBook, withCover, takeRate } from "@/lib/books";
import { editBookSchema, type Book, type Job } from "@/lib/domain";
import { reconcileJob } from "@/lib/jobs";

type Context = { params: Promise<{ id: string }> };
export async function GET(_: Request, ctx: Context) {
  try {
    const { id } = await ctx.params;
    const { user, db } = await requireUser();
    const book = await ownedBook(id, user.id);
    const [{ data: jobs, error }, { data: profile, error: pError }] =
      await Promise.all([
        db
          .from("jobs")
          .select(
            "id,book_id,user_id,kind,chapter_id,status,progress,error_code,run_id,created_at",
          )
          .eq("book_id", id)
          .order("created_at", { ascending: false })
          .limit(1),
        db.from("profiles").select("credits").eq("id", user.id).single(),
      ]);
    dbError(error);
    dbError(pError);
    return json({
      book: await withCover(book),
      job: await reconcileJob((jobs?.[0] as Job) ?? null),
      credits: profile?.credits ?? 0,
    });
  } catch (e) {
    return apiError(e);
  }
}
export async function PATCH(request: Request, ctx: Context) {
  try {
    assertOrigin(request);
    const { id } = await ctx.params;
    const { user } = await requireUser();
    await ownedBook(id, user.id);
    await takeRate(`save:${user.id}`, 1000);
    const input = await readJson(request, editBookSchema);
    // Manual edits must also update the continuity context used by later chapters.
    for (const chapter of Object.values(input.chapters)) {
      chapter.summary = chapter.content.replace(/[#*]/g, "").slice(0, 1000);
    }
    const { data, error } = await adminClient().rpc("save_book", {
      p_user: user.id,
      p_book: id,
      p_edit: input,
    });
    dbError(error);
    return json({ book: await withCover(data as Book) });
  } catch (e) {
    return apiError(e);
  }
}
export async function DELETE(request: Request, ctx: Context) {
  try {
    assertOrigin(request);
    const { id } = await ctx.params;
    const { user } = await requireUser();
    await ownedBook(id, user.id);
    const db = adminClient();
    const { data: active, error: jError } = await db
      .from("jobs")
      .select("id")
      .eq("book_id", id)
      .in("status", ["queued", "running"])
      .limit(1);
    dbError(jError);
    if (active?.length) throw new AppError("busy", 409);
    const { data: files, error: fError } = await db.storage
      .from("covers")
      .list(`${user.id}/${id}`, { limit: 100 });
    dbError(fError);
    if (files?.length) {
      const { error } = await db.storage
        .from("covers")
        .remove(files.map((f) => `${user.id}/${id}/${f.name}`));
      dbError(error);
    }
    const { error } = await db
      .from("books")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);
    dbError(error);
    return json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
