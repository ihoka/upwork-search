import { describe, test, expect, mock, afterEach } from "bun:test";
import { UpworkSearchClient } from "../../src/search/client.ts";
import type {
  UpworkJobPosting,
  MarketplaceJobPostingsResponse,
  SearchConfig,
  SearchFilters,
} from "../../src/types.ts";

function makeJobNode(overrides: Partial<UpworkJobPosting> = {}): UpworkJobPosting {
  return {
    id: "1",
    ciphertext: "~01abc123",
    title: "Test Job",
    description: "A test job posting",
    publishedDateTime: "2026-04-09T14:30:00Z",
    hourlyBudgetMin: 60,
    hourlyBudgetMax: 120,
    budget: null,
    experienceLevel: "Expert",
    duration: "1 to 3 months",
    workload: "30+ hrs/week",
    skills: [{ name: "React" }],
    client: {
      totalHires: 5,
      totalSpent: 10000,
      totalReviews: 3,
      location: { country: "United States" },
    },
    occupations: [{ category: "Web Development" }],
    ...overrides,
  };
}

function makeApiResponse(
  jobs: UpworkJobPosting[],
  hasNextPage = false,
  endCursor: string | null = null,
): MarketplaceJobPostingsResponse {
  return {
    data: {
      marketplaceJobPostings: {
        totalCount: jobs.length,
        edges: jobs.map((node) => ({ node })),
        pageInfo: { hasNextPage, endCursor },
      },
    },
  };
}

const testFilters: SearchFilters = {
  experienceLevel: "EXPERT",
  hourlyBudgetMin: 50,
  jobType: ["HOURLY", "FIXED"],
  clientHiresCount_gte: 1,
  postedWithin: "24h",
};

describe("UpworkSearchClient", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    mock.restore();
  });

  test("fetchJobs returns jobs from API", async () => {
    const job = makeJobNode();
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response(JSON.stringify(makeApiResponse([job])), { status: 200 })),
    );

    const client = new UpworkSearchClient("https://api.example.com/graphql", "token-123");
    const search: SearchConfig = { terms: ["React"], category: "Web Development" };
    const jobs = await client.fetchJobs(search, testFilters);

    expect(jobs).toHaveLength(1);
    expect(jobs[0].ciphertext).toBe("~01abc123");
  });

  test("fetchJobs paginates up to max 2 pages", async () => {
    const job1 = makeJobNode({ id: "1", ciphertext: "~01" });
    const job2 = makeJobNode({ id: "2", ciphertext: "~02" });

    let callCount = 0;
    globalThis.fetch = mock(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve(
          new Response(JSON.stringify(makeApiResponse([job1], true, "cursor1")), { status: 200 }),
        );
      }
      return Promise.resolve(
        new Response(JSON.stringify(makeApiResponse([job2], false)), { status: 200 }),
      );
    });

    const client = new UpworkSearchClient("https://api.example.com/graphql", "token-123");
    const search: SearchConfig = { terms: ["React"], category: "Web Development" };
    const jobs = await client.fetchJobs(search, testFilters);

    expect(jobs).toHaveLength(2);
    expect(callCount).toBe(2);
  });

  test("fetchJobs throws on API error", async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response("Server Error", { status: 500 })),
    );

    const client = new UpworkSearchClient("https://api.example.com/graphql", "token-123");
    const search: SearchConfig = { terms: ["React"], category: "Web Development" };
    await expect(client.fetchJobs(search, testFilters)).rejects.toThrow("500");
  });

  test("filterJobs removes jobs below budget minimum", () => {
    const cheapJob = makeJobNode({ hourlyBudgetMax: 30 });
    const goodJob = makeJobNode({ hourlyBudgetMax: 80 });
    const fixedJob = makeJobNode({ hourlyBudgetMin: null, hourlyBudgetMax: null, budget: { amount: 5000 } });

    const client = new UpworkSearchClient("https://api.example.com/graphql", "token-123");
    const filtered = client.filterJobs([cheapJob, goodJob, fixedJob], testFilters);

    expect(filtered).toHaveLength(2);
    expect(filtered[0].hourlyBudgetMax).toBe(80);
    expect(filtered[1].budget?.amount).toBe(5000);
  });

  test("filterJobs removes jobs with zero client hires when filter requires >= 1", () => {
    const noHires = makeJobNode({ client: { totalHires: 0, totalSpent: 0, totalReviews: 0, location: null } });
    const hasHires = makeJobNode();

    const client = new UpworkSearchClient("https://api.example.com/graphql", "token-123");
    const filtered = client.filterJobs([noHires, hasHires], testFilters);

    expect(filtered).toHaveLength(1);
    expect(filtered[0].client?.totalHires).toBe(5);
  });

  test("filterJobs keeps jobs with null client (no data to filter on)", () => {
    const nullClient = makeJobNode({ client: null });

    const client = new UpworkSearchClient("https://api.example.com/graphql", "token-123");
    const filtered = client.filterJobs([nullClient], testFilters);

    expect(filtered).toHaveLength(1);
  });
});
