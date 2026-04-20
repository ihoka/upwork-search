import { SEARCH_JOBS_QUERY, buildQueryVariables, buildJobCheckVariables } from "./queries.ts";
import type {
  UpworkJobPosting,
  SearchConfig,
  SearchFilters,
} from "../types.ts";

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
    // Upwork's `pagination_eq` input crashes the resolver (confirmed via
    // `bun run search:debug`), so we only fetch the default first page
    // (~10 edges sorted by RECENCY). Dedup across runs compensates.
    const variables = buildQueryVariables(search, filters);
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
      // Upwork's error messages are often unhelpfully terse ("Exception occurred").
      // The useful details live in `extensions`, `path`, and `locations` — include
      // them so logs point at the actual problem. Full payload is available with
      // DEBUG=1 (logged alongside the request variables for correlation).
      const formatted = json.errors
        .map((e: Record<string, unknown>) => {
          const parts: string[] = [String(e.message ?? "(no message)")];
          if (Array.isArray(e.path) && e.path.length) parts.push(`path=${e.path.join(".")}`);
          if (Array.isArray(e.locations) && e.locations.length) {
            parts.push(`locations=${JSON.stringify(e.locations)}`);
          }
          if (e.extensions) parts.push(`extensions=${JSON.stringify(e.extensions)}`);
          return parts.join(" ");
        })
        .join(" | ");

      if (process.env.DEBUG === "1") {
        console.error("[upwork] GraphQL request variables:", JSON.stringify(variables));
        console.error("[upwork] GraphQL full error payload:", JSON.stringify(json.errors));
      }

      throw new Error(`Upwork GraphQL error: ${formatted}`);
    }

    if (!json.data?.marketplaceJobPostingsSearch) {
      throw new Error(
        `Upwork API returned unexpected response: ${summarizeBody(JSON.stringify(json))}`,
      );
    }

    const { edges } = json.data.marketplaceJobPostingsSearch;
    return edges.map((edge: { node: UpworkJobPosting }) => edge.node);
  }

  async checkJob(ciphertext: string): Promise<UpworkJobPosting | null> {
    const variables = buildJobCheckVariables(ciphertext);
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
      if (process.env.DEBUG === "1") {
        console.error("[upwork] checkJob error:", JSON.stringify(json.errors));
      }
      throw new Error(`Upwork GraphQL error checking job ${ciphertext}`);
    }

    const edges = json.data?.marketplaceJobPostingsSearch?.edges ?? [];
    const match = edges.find(
      (edge: { node: UpworkJobPosting }) => edge.node.ciphertext === ciphertext,
    );
    return match?.node ?? null;
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
