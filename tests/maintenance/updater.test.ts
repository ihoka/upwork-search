import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, writeFile, readFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import {
  parseFrontmatter,
  updateFrontmatterField,
  scanJobFiles,
  applyRule1CloseInactive,
  applyRule2ExpireOld,
  applyRule3Decay,
} from "../../src/maintenance/updater.ts";
import type { JobCheckResult } from "../../src/maintenance/checker.ts";

describe("parseFrontmatter", () => {
  test("parses basic frontmatter", () => {
    const content = `---
source: upwork-api
upwork_job_id: "~01abc"
status: triaged
upwork_score: 72
---

# Content`;
    const fm = parseFrontmatter(content);
    expect(fm).not.toBeNull();
    expect(fm!.source).toBe("upwork-api");
    expect(fm!.upwork_job_id).toBe("~01abc");
    expect(fm!.status).toBe("triaged");
    expect(fm!.upwork_score).toBe(72);
  });

  test("returns null for non-frontmatter content", () => {
    expect(parseFrontmatter("# Just a heading")).toBeNull();
  });
});

describe("updateFrontmatterField", () => {
  test("updates existing field", () => {
    const content = `---
status: triaged
upwork_score: 72
---

# Content`;
    const result = updateFrontmatterField(content, "status", "closed");
    expect(result).toContain("status: closed");
    expect(result).not.toContain("status: triaged");
  });

  test("adds new field before closing ---", () => {
    const content = `---
status: triaged
---

# Content`;
    const result = updateFrontmatterField(content, "upwork_closed", "2026-04-20");
    expect(result).toContain("upwork_closed: 2026-04-20");
    expect(result).toContain("status: triaged");
  });
});

describe("rule application", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "maint-test-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true });
  });

  function writeJob(filename: string, frontmatter: Record<string, unknown>) {
    const lines = Object.entries(frontmatter).map(([k, v]) =>
      typeof v === "string" && !v.startsWith("[") ? `${k}: "${v}"` : `${k}: ${v}`,
    );
    const content = `---\n${lines.join("\n")}\n---\n\n# Job posting`;
    return writeFile(join(tmpDir, filename), content);
  }

  test("scanJobFiles finds markdown files with upwork_job_id", async () => {
    await writeJob("job1.md", { upwork_job_id: "~01", status: "triaged" });
    await writeJob("job2.md", { upwork_job_id: "~02", status: "applied" });
    await writeFile(join(tmpDir, "not-a-job.md"), "# Random notes");

    const jobs = await scanJobFiles(tmpDir);
    expect(jobs.length).toBe(2);
  });

  test("rule 1: closes inactive applied jobs", async () => {
    await writeJob("applied-job.md", {
      upwork_job_id: "~01",
      status: "applied",
      source: "upwork-api",
    });

    const jobs = await scanJobFiles(tmpDir);
    const checkResults = new Map<string, JobCheckResult>([
      ["~01", { ciphertext: "~01", active: false, totalApplicants: null }],
    ]);

    const closed = await applyRule1CloseInactive(jobs, checkResults, new Date("2026-04-20"));
    expect(closed).toEqual(["~01"]);

    const content = await readFile(join(tmpDir, "applied-job.md"), "utf-8");
    expect(content).toContain("status: closed");
    expect(content).toContain("upwork_closed: 2026-04-20");
  });

  test("rule 1: keeps active applied jobs", async () => {
    await writeJob("applied-job.md", {
      upwork_job_id: "~01",
      status: "applied",
      source: "upwork-api",
    });

    const jobs = await scanJobFiles(tmpDir);
    const checkResults = new Map<string, JobCheckResult>([
      ["~01", { ciphertext: "~01", active: true, totalApplicants: 10 }],
    ]);

    const closed = await applyRule1CloseInactive(jobs, checkResults, new Date("2026-04-20"));
    expect(closed).toEqual([]);
  });

  test("rule 2: expires triaged jobs older than 14 days", async () => {
    await writeJob("old-job.md", {
      upwork_job_id: "~01",
      status: "triaged",
      upwork_evaluated: "2026-04-01",
      upwork_score: 55,
    });

    const jobs = await scanJobFiles(tmpDir);
    const expired = await applyRule2ExpireOld(jobs, new Date("2026-04-20"));
    expect(expired).toEqual(["~01"]);

    const content = await readFile(join(tmpDir, "old-job.md"), "utf-8");
    expect(content).toContain("status: expired");
    expect(content).toContain("upwork_expired: 2026-04-20");
  });

  test("rule 2: keeps recent triaged jobs", async () => {
    await writeJob("recent-job.md", {
      upwork_job_id: "~01",
      status: "triaged",
      upwork_evaluated: "2026-04-15",
      upwork_score: 55,
    });

    const jobs = await scanJobFiles(tmpDir);
    const expired = await applyRule2ExpireOld(jobs, new Date("2026-04-20"));
    expect(expired).toEqual([]);
  });

  test("rule 3: decays score based on age and competition", async () => {
    await writeJob("aging-job.md", {
      upwork_job_id: "~01",
      status: "triaged",
      upwork_evaluated: "2026-04-10",
      upwork_score: 75,
      upwork_verdict: "apply",
    });

    const jobs = await scanJobFiles(tmpDir);
    const checkResults = new Map<string, JobCheckResult>([
      ["~01", { ciphertext: "~01", active: true, totalApplicants: 40 }],
    ]);

    const decayed = await applyRule3Decay(jobs, checkResults, 40, new Date("2026-04-20"));
    expect(decayed).toEqual(["~01"]);

    const content = await readFile(join(tmpDir, "aging-job.md"), "utf-8");
    expect(content).toContain("upwork_decayed_score:");
    expect(content).toContain("upwork_proposals: 40");

    // 10 days old → age_factor = 10/14 ≈ 0.714
    // 40 proposals → comp_factor = 0.75
    // decay = 20 * (0.6 * 0.714 + 0.4 * 0.75) = 20 * (0.429 + 0.3) = 20 * 0.729 ≈ 15
    // decayed = 75 - 15 = 60
    const fm = parseFrontmatter(content);
    expect(fm!.upwork_decayed_score).toBe(60);
  });

  test("rule 3: downgrades verdict when score drops below threshold", async () => {
    await writeJob("borderline-job.md", {
      upwork_job_id: "~01",
      status: "triaged",
      upwork_evaluated: "2026-04-08",
      upwork_score: 45,
      upwork_verdict: "maybe",
    });

    const jobs = await scanJobFiles(tmpDir);
    const checkResults = new Map<string, JobCheckResult>([
      ["~01", { ciphertext: "~01", active: true, totalApplicants: 50 }],
    ]);

    await applyRule3Decay(jobs, checkResults, 40, new Date("2026-04-20"));

    const content = await readFile(join(tmpDir, "borderline-job.md"), "utf-8");
    // 12 days old → age_factor = 12/14 ≈ 0.857
    // 50 proposals → comp_factor = 0.75
    // decay = 20 * (0.6 * 0.857 + 0.4 * 0.75) = 20 * (0.514 + 0.3) = 20 * 0.814 ≈ 16
    // decayed = 45 - 16 = 29 → below 40 threshold
    expect(content).toContain("upwork_verdict: skip");
    expect(content).toContain("status: skipped");
  });
});
