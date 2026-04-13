import { describe, test, expect, mock, afterEach } from "bun:test";
import { UpworkSearchClient } from "../../src/search/client.ts";
import type {
  UpworkJobPosting,
  MarketplaceJobPostingsResponse,
  SearchConfig,
  SearchFilters,
} from "../../src/types.ts";

const sampleJob: UpworkJobPosting = {
  id: "search-result-1",
  ciphertext: "~01abc",
  title: "Senior React Dev",
  description: "Build stuff",
  publishedDateTime: "2026-04-13T10:00:00Z",
  experienceLevel: "EXPERT",
  duration: "MONTH",
  engagement: "30+ hrs/week",
  amount: { rawValue: "0", currency: "USD", displayValue: "$0" },
  hourlyBudgetMin: { rawValue: "60", currency: "USD", displayValue: "$60.00" },
  hourlyBudgetMax: { rawValue: "90", currency: "USD", displayValue: "$90.00" },
  skills: [{ name: "react", prettyName: "React" }],
  client: {
    totalHires: 12,
    totalReviews: 8,
    totalSpent: { rawValue: "50000", currency: "USD", displayValue: "$50,000" },
    location: { country: "United States" },
  },
  occupations: { category: { id: "531770282580668419", prefLabel: "Web Development" } },
};

function makeApiResponse(
  jobs: UpworkJobPosting[],
  hasNextPage = false,
  endCursor: string | null = null,
): MarketplaceJobPostingsResponse {
  return {
    data: {
      marketplaceJobPostingsSearch: {
        totalCount: jobs.length,
        edges: jobs.map((node) => ({ node })),
        pageInfo: { hasNextPage, endCursor },
      },
    },
  };
}

const baseFilters: SearchFilters = {
  experienceLevel: "EXPERT",
  hourlyBudgetMin: 50,
  jobType: [],
  clientHiresCount_gte: 0,
  postedWithin: "24h",
  daysPosted: 1,
};

describe("UpworkSearchClient", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    mock.restore();
  });

  test("fetchJobs returns jobs from API", async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response(JSON.stringify(makeApiResponse([sampleJob])), { status: 200 })),
    );

    const client = new UpworkSearchClient("https://api.example.com/graphql", "token-123");
    const search: SearchConfig = { terms: ["React"], category: "Web Development" };
    const jobs = await client.fetchJobs(search, baseFilters);

    expect(jobs).toHaveLength(1);
    expect(jobs[0].ciphertext).toBe("~01abc");
  });

  test("fetchJobs fetches only the first page (Upwork pagination_eq is broken)", async () => {
    // Upwork's resolver crashes with 500 "Exception occurred" when
    // pagination_eq is present, so we only issue a single request per search
    // and accept the server's default page. hasNextPage=true from the server
    // is intentionally ignored.
    const job1 = { ...sampleJob, id: "1", ciphertext: "~01" };
    const job2 = { ...sampleJob, id: "2", ciphertext: "~02" };

    let callCount = 0;
    globalThis.fetch = mock(() => {
      callCount++;
      return Promise.resolve(
        new Response(
          JSON.stringify(makeApiResponse([job1, job2], true, "cursor1")),
          { status: 200 },
        ),
      );
    });

    const client = new UpworkSearchClient("https://api.example.com/graphql", "token-123");
    const search: SearchConfig = { terms: ["React"], category: "Web Development" };
    const jobs = await client.fetchJobs(search, baseFilters);

    expect(callCount).toBe(1);
    expect(jobs).toHaveLength(2);
  });

  test("fetchJobs throws on API error", async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response("Server Error", { status: 500 })),
    );

    const client = new UpworkSearchClient("https://api.example.com/graphql", "token-123");
    const search: SearchConfig = { terms: ["React"], category: "Web Development" };
    await expect(client.fetchJobs(search, baseFilters)).rejects.toThrow("500");
  });

  test("fetchJobs throws on GraphQL errors in 200 response", async () => {
    const errorResponse = {
      errors: [{ message: "Rate limit exceeded" }],
      data: null,
    };
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response(JSON.stringify(errorResponse), { status: 200 })),
    );

    const client = new UpworkSearchClient("https://api.example.com/graphql", "token-123");
    const search: SearchConfig = { terms: ["React"], category: "Web Development" };
    await expect(client.fetchJobs(search, baseFilters)).rejects.toThrow("GraphQL error");
  });

  test("filterJobs drops hourly jobs whose hourlyBudgetMax is below minimum", () => {
    const client = new UpworkSearchClient("https://x", "tok");
    const lowPay = {
      ...sampleJob,
      hourlyBudgetMax: { rawValue: "25", currency: "USD", displayValue: "$25" },
    };
    expect(client.filterJobs([sampleJob, lowPay], baseFilters)).toEqual([sampleJob]);
  });

  test("filterJobs keeps fixed-price jobs (no hourly budget)", () => {
    const client = new UpworkSearchClient("https://x", "tok");
    const fixed = { ...sampleJob, hourlyBudgetMax: null, hourlyBudgetMin: null };
    expect(client.filterJobs([fixed], baseFilters)).toEqual([fixed]);
  });
});
