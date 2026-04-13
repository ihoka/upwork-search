import type { SearchConfig, SearchFilters } from "../types.ts";

export const SEARCH_JOBS_QUERY = `
query searchJobs(
  $marketPlaceJobFilter: MarketplaceJobPostingsSearchFilter,
  $searchType: MarketplaceJobPostingSearchType,
  $sortAttributes: [MarketplaceJobPostingSearchSortAttribute]
) {
  marketplaceJobPostingsSearch(
    marketPlaceJobFilter: $marketPlaceJobFilter
    searchType: $searchType
    sortAttributes: $sortAttributes
  ) {
    totalCount
    edges {
      node {
        id
        ciphertext
        title
        description
        publishedDateTime
        experienceLevel
        duration
        engagement
        amount { rawValue currency displayValue }
        hourlyBudgetMin { rawValue currency displayValue }
        hourlyBudgetMax { rawValue currency displayValue }
        skills { name prettyName }
        client {
          totalHires
          totalReviews
          totalSpent { rawValue currency displayValue }
          location { country }
        }
        occupations {
          category { id prefLabel }
        }
      }
    }
    pageInfo { hasNextPage endCursor }
  }
}
`;

export interface QueryVariables {
  marketPlaceJobFilter: Record<string, unknown>;
  searchType: "USER_JOBS_SEARCH";
  sortAttributes: { field: "RECENCY" | "RELEVANCE" | "CLIENT_TOTAL_CHARGE" | "CLIENT_RATING" }[];
}

export function buildQueryVariables(
  search: SearchConfig,
  filters: SearchFilters,
): QueryVariables {
  // NOTE: We deliberately do NOT send `pagination_eq`. Upwork's resolver
  // throws a 500 "Exception occurred" whenever the filter contains
  // `pagination_eq` — confirmed via `bun run search:debug`. Omitting it
  // returns a default page of ~10 edges sorted by RECENCY, which is enough
  // for this project given we run every 6 hours and dedup across runs.
  const marketPlaceJobFilter: Record<string, unknown> = {
    searchExpression_eq: search.terms.join(" "),
    experienceLevel_eq: filters.experienceLevel,
  };

  if (filters.clientHiresCount_gte > 0) {
    marketPlaceJobFilter.clientHiresRange_eq = { rangeStart: filters.clientHiresCount_gte };
  }

  return {
    marketPlaceJobFilter,
    searchType: "USER_JOBS_SEARCH",
    sortAttributes: [{ field: "RECENCY" }],
  };
}
