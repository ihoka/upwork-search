import { describe, test, expect, afterEach } from "bun:test";
import { UpworkSearchClient } from "../../src/search/client.ts";
import { checkJobStatus, checkJobsBatch } from "../../src/maintenance/checker.ts";
import type { UpworkJobPosting } from "../../src/types.ts";

const sampleJob: UpworkJobPosting = {
  id: "1",
  ciphertext: "~01abc",
  title: "Test Job",
  description: "Test",
  publishedDateTime: "2026-04-13T10:00:00Z",
  experienceLevel: "EXPERT",
  duration: "MONTH",
  engagement: "30+ hrs/week",
  amount: { rawValue: "0", currency: "USD", displayValue: "$0" },
  hourlyBudgetMin: null,
  hourlyBudgetMax: null,
  skills: [],
  client: { totalHires: 1, totalReviews: 0, totalSpent: null, location: null },
  occupations: null,
  totalApplicants: 25,
  applied: false,
};

function mockFetch(response: unknown) {
  globalThis.fetch = () =>
    Promise.resolve(new Response(JSON.stringify(response), { status: 200 }));
}

describe("checkJobStatus", () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => { globalThis.fetch = originalFetch; });

  test("returns active with totalApplicants when job found", async () => {
    mockFetch({
      data: {
        marketplaceJobPostingsSearch: {
          totalCount: 1,
          edges: [{ node: sampleJob }],
          pageInfo: { hasNextPage: false, endCursor: null },
        },
      },
    });

    const client = new UpworkSearchClient("https://api.upwork.com/graphql", "token");
    const result = await checkJobStatus(client, "~01abc");

    expect(result.active).toBe(true);
    expect(result.totalApplicants).toBe(25);
  });

  test("returns inactive when job not found", async () => {
    mockFetch({
      data: {
        marketplaceJobPostingsSearch: {
          totalCount: 0,
          edges: [],
          pageInfo: { hasNextPage: false, endCursor: null },
        },
      },
    });

    const client = new UpworkSearchClient("https://api.upwork.com/graphql", "token");
    const result = await checkJobStatus(client, "~01abc");

    expect(result.active).toBe(false);
    expect(result.totalApplicants).toBeNull();
  });
});

describe("checkJobsBatch", () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => { globalThis.fetch = originalFetch; });

  test("checks multiple jobs and handles errors gracefully", async () => {
    let callCount = 0;
    globalThis.fetch = () => {
      callCount++;
      if (callCount === 2) {
        return Promise.resolve(new Response("Server Error", { status: 500 }));
      }
      return Promise.resolve(
        new Response(
          JSON.stringify({
            data: {
              marketplaceJobPostingsSearch: {
                totalCount: 1,
                edges: [{ node: { ...sampleJob, ciphertext: callCount === 1 ? "~01" : "~03" } }],
                pageInfo: { hasNextPage: false, endCursor: null },
              },
            },
          }),
          { status: 200 },
        ),
      );
    };

    const client = new UpworkSearchClient("https://api.upwork.com/graphql", "token");
    const results = await checkJobsBatch(client, ["~01", "~02", "~03"], 0);

    expect(results.size).toBe(3);
    expect(results.get("~01")!.active).toBe(true);
    // API error → treated as active (safe default)
    expect(results.get("~02")!.active).toBe(true);
    expect(results.get("~03")!.active).toBe(true);
  });
});
