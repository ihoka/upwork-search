import { SEARCH_JOBS_QUERY, buildQueryVariables } from "./queries.ts";
import type {
  UpworkJobPosting,
  SearchConfig,
  SearchFilters,
} from "../types.ts";

const MAX_PAGES = 2;

export class UpworkSearchClient {
  constructor(
    private readonly apiUrl: string,
    private readonly accessToken: string,
  ) {}

  async fetchJobs(search: SearchConfig, filters: SearchFilters): Promise<UpworkJobPosting[]> {
    const allJobs: UpworkJobPosting[] = [];
    let cursor: string | undefined;

    for (let page = 0; page < MAX_PAGES; page++) {
      const variables = buildQueryVariables(search, filters, cursor);
      const response = await fetch(this.apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.accessToken}`,
        },
        body: JSON.stringify({ query: SEARCH_JOBS_QUERY, variables }),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Upwork API error (${response.status}): ${text}`);
      }

      const json = await response.json();

      if (json.errors?.length) {
        const messages = json.errors.map((e: { message: string }) => e.message).join("; ");
        throw new Error(`Upwork GraphQL error: ${messages}`);
      }

      if (!json.data?.marketplaceJobPostings) {
        throw new Error(
          `Upwork API returned unexpected response: ${JSON.stringify(json).slice(0, 500)}`,
        );
      }

      const { edges, pageInfo } = json.data.marketplaceJobPostings;

      for (const edge of edges) {
        allJobs.push(edge.node);
      }

      if (!pageInfo.hasNextPage || !pageInfo.endCursor) break;
      cursor = pageInfo.endCursor;
    }

    return allJobs;
  }

  filterJobs(jobs: UpworkJobPosting[], filters: SearchFilters): UpworkJobPosting[] {
    return jobs.filter((job) => {
      // Budget check: skip if hourly max is below minimum threshold
      if (job.hourlyBudgetMax != null && job.hourlyBudgetMax < filters.hourlyBudgetMin) {
        return false;
      }

      // Client hires check
      if (
        filters.clientHiresCount_gte > 0 &&
        job.client != null &&
        (job.client.totalHires ?? 0) < filters.clientHiresCount_gte
      ) {
        return false;
      }

      return true;
    });
  }
}
