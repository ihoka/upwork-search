import { readdir, readFile, writeFile } from "fs/promises";
import { join } from "path";
import type { JobCheckResult } from "./checker.ts";

export interface JobFrontmatter {
  filePath: string;
  status?: string;
  upwork_job_id?: string;
  upwork_fetched?: string;
  upwork_evaluated?: string;
  upwork_score?: number;
  upwork_verdict?: string;
  upwork_decayed_score?: number;
  upwork_proposals?: number;
  [key: string]: unknown;
}

export interface MaintenanceResult {
  closed: string[];
  expired: string[];
  decayed: string[];
  unchanged: string[];
}

const EXPIRY_DAYS = 14;
const MAX_DECAY_POINTS = 20;
const AGE_WEIGHT = 0.6;
const COMPETITION_WEIGHT = 0.4;

export function parseFrontmatter(content: string): Record<string, unknown> | null {
  if (!content.startsWith("---")) return null;
  const endIdx = content.indexOf("---", 3);
  if (endIdx === -1) return null;

  const yamlBlock = content.slice(3, endIdx).trim();
  const fields: Record<string, unknown> = {};

  for (const line of yamlBlock.split("\n")) {
    // Skip continuation lines (arrays, multiline values)
    if (line.startsWith("  ") || line.startsWith("\t")) continue;
    if (line.startsWith("- ")) continue;

    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;

    const key = line.slice(0, colonIdx).trim();
    let value: unknown = line.slice(colonIdx + 1).trim();

    // Parse basic types
    if (value === "true") value = true;
    else if (value === "false") value = false;
    else if (typeof value === "string" && /^\d+$/.test(value)) value = Number(value);
    else if (typeof value === "string" && value.startsWith('"') && value.endsWith('"'))
      value = value.slice(1, -1);

    if (key) fields[key] = value;
  }

  return fields;
}

export function updateFrontmatterField(
  content: string,
  key: string,
  value: string | number,
): string {
  const endIdx = content.indexOf("---", 3);
  if (endIdx === -1) return content;

  const yamlBlock = content.slice(3, endIdx);
  const rest = content.slice(endIdx);

  const pattern = new RegExp(`^${key}:.*$`, "m");
  const newLine = `${key}: ${value}`;

  if (pattern.test(yamlBlock)) {
    return `---${yamlBlock.replace(pattern, newLine)}${rest}`;
  } else {
    // Add before closing ---
    return `---${yamlBlock.trimEnd()}\n${newLine}\n${rest}`;
  }
}

export async function scanJobFiles(jobsDir: string): Promise<JobFrontmatter[]> {
  const entries = await readdir(jobsDir);
  const mdFiles = entries.filter((f) => f.endsWith(".md"));
  const jobs: JobFrontmatter[] = [];

  for (const file of mdFiles) {
    const filePath = join(jobsDir, file);
    const content = await readFile(filePath, "utf-8");
    const fm = parseFrontmatter(content);
    if (fm && fm.upwork_job_id) {
      jobs.push({ filePath, ...fm } as JobFrontmatter);
    }
  }

  return jobs;
}

function daysBetween(dateStr: string, now: Date): number {
  const date = new Date(dateStr);
  return (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24);
}

function competitionFactor(totalApplicants: number | null): number {
  if (totalApplicants == null) return 0.5; // neutral when unknown
  if (totalApplicants <= 5) return 0;
  if (totalApplicants <= 15) return 0.25;
  if (totalApplicants <= 30) return 0.5;
  if (totalApplicants <= 50) return 0.75;
  return 1.0;
}

export async function applyRule1CloseInactive(
  jobs: JobFrontmatter[],
  checkResults: Map<string, JobCheckResult>,
  now: Date,
): Promise<string[]> {
  const closed: string[] = [];
  const today = now.toISOString().split("T")[0];

  const appliedJobs = jobs.filter((j) => j.status === "applied");

  for (const job of appliedJobs) {
    const jobId = job.upwork_job_id!;
    const result = checkResults.get(jobId);
    if (!result || result.active) continue;

    let content = await readFile(job.filePath, "utf-8");
    content = updateFrontmatterField(content, "status", "closed");
    content = updateFrontmatterField(content, "upwork_closed", today);
    content = updateFrontmatterField(content, "upwork_last_maintained", today);
    await writeFile(job.filePath, content);
    closed.push(jobId);
  }

  return closed;
}

export async function applyRule2ExpireOld(
  jobs: JobFrontmatter[],
  now: Date,
): Promise<string[]> {
  const expired: string[] = [];
  const today = now.toISOString().split("T")[0];

  const triagedJobs = jobs.filter((j) => j.status === "triaged");

  for (const job of triagedJobs) {
    const dateStr = (job.upwork_evaluated ?? job.upwork_fetched) as string | undefined;
    if (!dateStr) continue;

    const age = daysBetween(dateStr, now);
    if (age < EXPIRY_DAYS) continue;

    let content = await readFile(job.filePath, "utf-8");
    content = updateFrontmatterField(content, "status", "expired");
    content = updateFrontmatterField(content, "upwork_expired", today);
    content = updateFrontmatterField(content, "upwork_last_maintained", today);
    await writeFile(job.filePath, content);
    expired.push(job.upwork_job_id!);
  }

  return expired;
}

export async function applyRule3Decay(
  jobs: JobFrontmatter[],
  checkResults: Map<string, JobCheckResult>,
  maybeThreshold: number,
  now: Date,
): Promise<string[]> {
  const decayed: string[] = [];
  const today = now.toISOString().split("T")[0];

  const triagedJobs = jobs.filter((j) => j.status === "triaged");

  for (const job of triagedJobs) {
    const dateStr = (job.upwork_evaluated ?? job.upwork_fetched) as string | undefined;
    if (!dateStr) continue;

    const age = daysBetween(dateStr, now);
    if (age >= EXPIRY_DAYS) continue; // handled by rule 2
    if (age <= 0) continue;

    const originalScore = job.upwork_score;
    if (originalScore == null || typeof originalScore !== "number") continue;

    const result = checkResults.get(job.upwork_job_id!);
    const proposals = result?.totalApplicants ?? null;

    const ageFactor = Math.min(age / EXPIRY_DAYS, 1);
    const compFactor = competitionFactor(proposals);
    const decayPoints = Math.round(
      MAX_DECAY_POINTS * (AGE_WEIGHT * ageFactor + COMPETITION_WEIGHT * compFactor),
    );
    const decayedScore = Math.max(0, originalScore - decayPoints);

    // Only update if there's meaningful decay
    if (decayPoints < 1) continue;

    let content = await readFile(job.filePath, "utf-8");
    content = updateFrontmatterField(content, "upwork_decayed_score", decayedScore);
    content = updateFrontmatterField(content, "upwork_last_maintained", today);

    if (proposals != null) {
      content = updateFrontmatterField(content, "upwork_proposals", proposals);
    }

    // Downgrade verdict if decayed score drops below threshold
    if (decayedScore < maybeThreshold && job.upwork_verdict !== "skip") {
      content = updateFrontmatterField(content, "upwork_verdict", "skip");
      content = updateFrontmatterField(content, "status", "skipped");
    }

    await writeFile(job.filePath, content);
    decayed.push(job.upwork_job_id!);
  }

  return decayed;
}
