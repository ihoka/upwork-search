import { dirname } from "path";
import { mkdir, rename } from "fs/promises";
import type { SeenJobs } from "../types.ts";

export class DeduplicationState {
  private jobs: SeenJobs = {};

  constructor(private readonly filePath: string) {}

  async load(): Promise<void> {
    const file = Bun.file(this.filePath);
    if (!(await file.exists())) {
      this.jobs = {};
      return;
    }

    try {
      this.jobs = await file.json();
    } catch (error) {
      if (error instanceof SyntaxError) {
        console.error(
          `Corrupted dedup state at ${this.filePath}, starting fresh. Previously seen jobs will be re-saved.`,
        );
        this.jobs = {};
      } else {
        throw error;
      }
    }
  }

  hasSeen(jobId: string): boolean {
    return jobId in this.jobs;
  }

  markSeen(jobId: string): void {
    this.jobs[jobId] = new Date().toISOString();
  }

  /** Exposed for testing — set a specific entry with a specific timestamp */
  setEntry(jobId: string, timestamp: string): void {
    this.jobs[jobId] = timestamp;
  }

  prune(maxAgeDays: number): void {
    const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
    for (const [jobId, timestamp] of Object.entries(this.jobs)) {
      if (new Date(timestamp).getTime() < cutoff) {
        delete this.jobs[jobId];
      }
    }
  }

  async save(): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    const tempPath = this.filePath + ".tmp";
    await Bun.write(tempPath, JSON.stringify(this.jobs, null, 2));
    await rename(tempPath, this.filePath);
  }
}
