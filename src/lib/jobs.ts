import "server-only";
import { getRun } from "workflow/api";
import { studioStore } from "./firebase-admin";
import type { Job } from "./domain";

/** Recover interrupted jobs without risking active long-running chapter workflows. */
export async function reconcileJob(job: Job | null): Promise<Job | null> {
  if (!job || !["queued", "running"].includes(job.status)) return job;
  const ageMs = Date.now() - Date.parse(job.created_at);
  const maxAgeMs = 90 * 60_000;
  let failed = !job.run_id && ageMs > 3 * 60_000;
  if (job.run_id) {
    try {
      const status = await getRun(job.run_id).status;
      failed = status === "failed" || status === "cancelled" ||
        (status === "completed" && ageMs > 3 * 60_000) ||
        ageMs > maxAgeMs;
    } catch {
      // Temporary Workflow API outages must not leave a book locked indefinitely.
      if (ageMs <= maxAgeMs) return job;
      failed = true;
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
