import "server-only";
import { getRun } from "workflow/api";
import { adminClient } from "./supabase";
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
  if (failed) {
    const { data } = await adminClient()
      .from("jobs")
      .update({
        status: "failed",
        error_code: "generation_failed",
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.id)
      .in("status", ["queued", "running"])
      .select("*")
      .maybeSingle();
    return (data as Job | null) || job;
  }
  return job;
}
