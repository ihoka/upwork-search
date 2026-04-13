import { SEARCH_JOBS_QUERY, buildQueryVariables } from "./queries.ts";
import type {
  UpworkJobPosting,
  SearchConfig,
  SearchFilters,
} from "../types.ts";

const MAX_PAGES = 2;

/**
 * Summarize an error response body for logging. Upwork's error pages can be
 * multi-KB HTML blobs — not useful in logs. With DEBUG=1, return the full body.
 * Otherwise, extract a short human-readable hint (HTML <title>, first line of
 * text, or truncated body).
 */
function summarizeBody(body: string): string {
  if (process.env.DEBUG === "1") return body;

  const trimmed = body.trim();
  if (trimmed.startsWith("<") || trimmed.toLowerCase().includes("<!doctype")) {
    const title = trimmed.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim();
    return title
      ? `[HTML response: ${title}] (set DEBUG=1 for full body)`
      : `[HTML response, ${body.length} bytes] (set DEBUG=1 for full body)`;
  }

  const max = 300;
  return trimmed.length > max ? `${trimmed.slice(0, max)}… (set DEBUG=1 for full body)` : trimmed;
}

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
        throw new Error(`Upwork API error (${response.status}): ${summarizeBody(text)}`);
      }

      const json = await response.json();

      if (json.errors?.length) {
        const messages = json.errors.map((e: { message: string }) => e.message).join("; ");
        throw new Error(`Upwork GraphQL error: ${messages}`);
      }

      if (!json.data?.marketplaceJobPostingsSearch) {
        throw new Error(
          `Upwork API returned unexpected response: ${summarizeBody(JSON.stringify(json))}`,
        );
      }

      const { edges, pageInfo } = json.data.marketplaceJobPostingsSearch;

      for (const edge of edges) {
        allJobs.push(edge.node);
      }

      if (!pageInfo.hasNextPage || !pageInfo.endCursor) break;
      cursor = pageInfo.endCursor;
    }

    return allJobs;
  }

  filterJobs(jobs: UpworkJobPosting[], filters: SearchFilters): UpworkJobPosting[] {
    // Upwork's MarketplaceJobPostingsSearchFilter has no posted-within field, so
    // apply recency filtering client-side against publishedDateTime.
    const cutoffMs =
      filters.daysPosted > 0 ? Date.now() - filters.daysPosted * 24 * 60 * 60 * 1000 : null;

    return jobs.filter((job) => {
      if (cutoffMs != null) {
        const publishedMs = Date.parse(job.publishedDateTime);
        if (Number.isFinite(publishedMs) && publishedMs < cutoffMs) return false;
      }

      // Only hourly jobs have an hourly budget. Fixed-price jobs pass through.
      const rawMax = job.hourlyBudgetMax?.rawValue;
      if (rawMax != null) {
        const max = Number(rawMax);
        if (Number.isFinite(max) && max < filters.hourlyBudgetMin) return false;
      }
      return true;
    });
  }
}
