import { start } from "workflow/api";
import { generateBook } from "@/workflows/generate-book";
import { requireUser, adminClient } from "@/lib/supabase";
import { ownedBook } from "@/lib/books";
import { jobRequestSchema, type Job } from "@/lib/domain";
import {
  assertOrigin,
  readJson,
  apiError,
  json,
  dbError,
  AppError,
} from "@/lib/http";
import { configuration } from "@/lib/config";

export const maxDuration = 60;
export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    assertOrigin(request);
    const { user } = await requireUser();
    const { id } = await ctx.params;
    await ownedBook(id, user.id);
    const input = await readJson(request, jobRequestSchema, 2000);
    const config = configuration();
    if (!config.ai || (input.kind === "cover" && !config.artwork))
      throw new AppError("not_configured", 503);
    const db = adminClient();
    const { data, error } = await db.rpc("prepare_job", {
      p_user: user.id,
      p_book: id,
      p_kind: input.kind,
      p_chapter: input.chapter_id ?? null,
      p_request: input.request_id,
    });
    dbError(error);
    const job = data as Job;
    if (job.run_id || job.status !== "queued") return json({ job });
    try {
      const run = await start(generateBook, [job.id]);
      const { error: saveError } = await db
        .from("jobs")
        .update({ run_id: run.runId })
        .eq("id", job.id)
        .is("run_id", null);
      dbError(saveError);
      return json({ job: { ...job, run_id: run.runId } }, 202);
    } catch (error) {
      // A step may already have claimed a successfully enqueued run. Do not fail it.
      const { data: current } = await db
        .from("jobs")
        .select("run_id,status")
        .eq("id", job.id)
        .single();
      if (current?.run_id) return json({ job: { ...job, ...current } }, 202);
      await db
        .from("jobs")
        .update({ status: "failed", error_code: "generation_failed" })
        .eq("id", job.id)
        .is("run_id", null);
      throw error;
    }
  } catch (e) {
    return apiError(e);
  }
}
