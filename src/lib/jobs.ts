import "server-only";
import { getRun } from "workflow/api";
import { studioStore } from "./firebase-admin";
import type { Job } from "./domain";

export async function reconcileJob(job: Job | null): Promise<Job | null> {
  if (!job || !["queued", "running"].includes(job.status)) return job;
  let failed = !job.run_id && Date.now() - Date.parse(job.created_at) > 120_000;
  if (job.run_id) {
    try {
      const status = await getRun(job.run_id).status;
      failed = status === "failed" || status === "cancelled";
    } catch {
      return job;
    }
  }
  return failed
    ? (await studioStore().finishJob(
        job.id,
        "generation_failed",
        !job.run_id,
      )) || job
    : job;
}
