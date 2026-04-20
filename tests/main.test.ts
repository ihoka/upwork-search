import { describe, test, expect, mock, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, readdir } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import type { MarketplaceJobPostingsResponse, UpworkJobPosting } from "../src/types.ts";

function makeJobNode(overrides: Partial<UpworkJobPosting> = {}): UpworkJobPosting {
  return {
    id: "1",
    ciphertext: "~01abc123",
    title: "Senior React Developer",
    description: "Build amazing things.",
    publishedDateTime: new Date().toISOString(),
    experienceLevel: "EXPERT",
    duration: "MONTH",
    engagement: "30+ hrs/week",
    amount: { rawValue: "0", currency: "USD", displayValue: "$0" },
    hourlyBudgetMin: { rawValue: "80", currency: "USD", displayValue: "$80.00" },
    hourlyBudgetMax: { rawValue: "150", currency: "USD", displayValue: "$150.00" },
    skills: [{ name: "react", prettyName: "React" }],
    client: {
      totalHires: 5,
      totalReviews: 3,
      totalSpent: { rawValue: "10000", currency: "USD", displayValue: "$10,000" },
      location: { country: "United States" },
    },
    occupations: { category: { id: "531770282580668419", prefLabel: "Web Development" } },
    totalApplicants: null,
    applied: null,
    ...overrides,
  };
}

function makeApiResponse(jobs: UpworkJobPosting[]): MarketplaceJobPostingsResponse {
  return {
    data: {
      marketplaceJobPostingsSearch: {
        totalCount: jobs.length,
        edges: jobs.map((node) => ({ node })),
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    },
  };
}

describe("main: runSearchCycle", () => {
  let tempDir: string;
  let outputDir: string;
  let dataDir: string;
  const originalFetch = globalThis.fetch;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "main-test-"));
    outputDir = join(tempDir, "output");
    dataDir = join(tempDir, "data");
  });

  afterEach(async () => {
    globalThis.fetch = originalFetch;
    mock.restore();
    await rm(tempDir, { recursive: true, force: true });
  });

  test("full pipeline: fetches jobs, deduplicates, writes markdown", async () => {
    const job1 = makeJobNode({ id: "1", ciphertext: "~01abc" });
    const job2 = makeJobNode({
      id: "2",
      ciphertext: "~02def",
      title: "Rails Engineer",
      hourlyBudgetMin: { rawValue: "70", currency: "USD", displayValue: "$70.00" },
      hourlyBudgetMax: { rawValue: "120", currency: "USD", displayValue: "$120.00" },
    });

    globalThis.fetch = mock(() =>
      Promise.resolve(
        new Response(JSON.stringify(makeApiResponse([job1, job2])), { status: 200 }),
      ),
    );

    // Import after mocking
    const { runSearchCycle } = await import("../src/main.ts");

    const profilePath = join(tempDir, "profile.yaml");
    await Bun.write(
      profilePath,
      `
searches:
  - terms: ["React"]
    category: "Web Development"
filters:
  experienceLevel: "EXPERT"
  hourlyBudgetMin: 50
  jobType: ["HOURLY"]
  clientHiresCount_gte: 1
  postedWithin: "24h"
  daysPosted: 1
`,
    );

    const result = await runSearchCycle({
      accessToken: "test-token",
      apiBaseUrl: "https://api.example.com/graphql",
      outputDir,
      seenJobsPath: join(dataDir, "seen-jobs.json"),
      searchProfilePath: profilePath,
    });

    expect(result.saved).toBe(2);
    expect(result.skippedDuplicates).toBe(0);

    // Verify markdown files written
    const files = await readdir(outputDir);
    expect(files).toHaveLength(2);
    expect(files.some((f) => f.includes("~01abc"))).toBe(true);
    expect(files.some((f) => f.includes("~02def"))).toBe(true);

    // Verify file content has frontmatter
    const content = await Bun.file(join(outputDir, files[0])).text();
    expect(content).toContain("source: upwork-api");
  });

  test("skips already-seen jobs on second run", async () => {
    const job = makeJobNode({ id: "1", ciphertext: "~01abc" });

    globalThis.fetch = mock(() =>
      Promise.resolve(
        new Response(JSON.stringify(makeApiResponse([job])), { status: 200 }),
      ),
    );

    const { runSearchCycle } = await import("../src/main.ts");

    const profilePath = join(tempDir, "profile.yaml");
    await Bun.write(
      profilePath,
      `
searches:
  - terms: ["React"]
    category: "Web Development"
filters:
  experienceLevel: "EXPERT"
  hourlyBudgetMin: 50
  jobType: ["HOURLY"]
  clientHiresCount_gte: 1
  postedWithin: "24h"
  daysPosted: 1
`,
    );

    const opts = {
      accessToken: "test-token",
      apiBaseUrl: "https://api.example.com/graphql",
      outputDir,
      seenJobsPath: join(dataDir, "seen-jobs.json"),
      searchProfilePath: profilePath,
    };

    // First run
    const run1 = await runSearchCycle(opts);
    expect(run1.saved).toBe(1);

    // Second run — same job should be skipped
    const run2 = await runSearchCycle(opts);
    expect(run2.saved).toBe(0);
    expect(run2.skippedDuplicates).toBe(1);
  });
});
