import { start } from "workflow/api";
import { generateBook } from "@/workflows/generate-book";
import { requireUser } from "@/lib/firebase-session";
import { studioStore } from "@/lib/firebase-admin";
import { ownedBook } from "@/lib/books";
import { jobRequestSchema } from "@/lib/domain";
import { assertOrigin, readJson, apiError, json, AppError } from "@/lib/http";
import { configuration } from "@/lib/config";
export const maxDuration = 60;
export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    assertOrigin(request);
    const { user } = await requireUser(),
      { id } = await ctx.params;
    await ownedBook(id, user.id);
    const input = await readJson(request, jobRequestSchema, 2000),
      config = configuration();
    if (!config.ai || (input.kind === "cover" && !config.artwork))
      throw new AppError("not_configured", 503);
    const store = studioStore();
    const job = await store.prepareJob(
      user.id,
      id,
      input.kind,
      input.chapter_id || null,
      input.request_id,
      Boolean(
        process.env.EBOOK_TEST_ACCOUNT_EMAIL &&
          user.email.toLowerCase() ===
            process.env.EBOOK_TEST_ACCOUNT_EMAIL.trim().toLowerCase()
      ),
    );
    if (job.run_id || job.status !== "queued") return json({ job });
    try {
      const run = await start(generateBook, [job.id]);
      return json({ job: await store.attachRun(job.id, run.runId) }, 202);
    } catch (e) {
      const current = await store.job(job.id);
      if (current?.run_id) return json({ job: current }, 202);
      const result = await store.finishJob(job.id, "generation_failed", true);
      if (result?.run_id) return json({ job: result }, 202);
      throw e;
    }
  } catch (e) {
    return apiError(e);
  }
}
