import {
  claimJob,
  loadPlan,
  createOutline,
  createChapter,
  createCover,
  finishJob,
  failJob,
} from "./steps";

export async function generateBook(jobId: string) {
  "use workflow";
  if (!(await claimJob(jobId))) return;
  try {
    const plan = await loadPlan(jobId);
    if (plan.kind === "outline") await createOutline(jobId);
    else if (plan.kind === "cover") await createCover(jobId);
    else {
      for (let i = 0; i < plan.chapters.length; i++) {
        await createChapter(
          jobId,
          plan.chapters[i],
          Math.round(((i + 1) / plan.chapters.length) * 95),
        );
      }
    }
    await finishJob(jobId);
  } catch (error) {
    await failJob(
      jobId,
      error instanceof Error ? error.message : "generation_failed",
    );
  }
}
