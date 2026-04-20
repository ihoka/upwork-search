import { UpworkSearchClient } from "../search/client.ts";
import { checkJobsBatch } from "./checker.ts";
import {
  scanJobFiles,
  applyRule1CloseInactive,
  applyRule2ExpireOld,
  applyRule3Decay,
  type MaintenanceResult,
} from "./updater.ts";

export interface MaintenanceOptions {
  client: UpworkSearchClient;
  jobsDir: string;
  maybeThreshold?: number;
}

export async function runMaintenance(options: MaintenanceOptions): Promise<MaintenanceResult> {
  const { client, jobsDir, maybeThreshold = 40 } = options;
  const now = new Date();

  const jobs = await scanJobFiles(jobsDir);
  if (jobs.length === 0) {
    return { closed: [], expired: [], decayed: [], unchanged: [] };
  }

  // Collect job IDs that need API checks:
  // - applied jobs (rule 1: check if still active)
  // - triaged jobs within 14-day window (rule 3: get totalApplicants)
  const needsCheck = jobs.filter(
    (j) => j.status === "applied" || j.status === "triaged",
  );
  const ciphertexts = needsCheck
    .map((j) => j.upwork_job_id!)
    .filter(Boolean);

  const checkResults = ciphertexts.length > 0
    ? await checkJobsBatch(client, ciphertexts)
    : new Map();

  // Apply rules in order
  const closed = await applyRule1CloseInactive(jobs, checkResults, now);
  const expired = await applyRule2ExpireOld(jobs, now);
  const decayed = await applyRule3Decay(jobs, checkResults, maybeThreshold, now);

  const affectedIds = new Set([...closed, ...expired, ...decayed]);
  const unchanged = jobs
    .filter((j) => j.upwork_job_id && !affectedIds.has(j.upwork_job_id))
    .map((j) => j.upwork_job_id!);

  return { closed, expired, decayed, unchanged };
}
