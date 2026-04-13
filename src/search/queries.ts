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

const PAGE_SIZE = 50;

export function buildQueryVariables(
  search: SearchConfig,
  filters: SearchFilters,
  cursor?: string,
): QueryVariables {
  const marketPlaceJobFilter: Record<string, unknown> = {
    searchExpression_eq: search.terms.join(" "),
    experienceLevel_eq: filters.experienceLevel,
    daysPosted_eq: filters.daysPosted,
    pagination_eq: cursor ? { first: PAGE_SIZE, after: cursor } : { first: PAGE_SIZE },
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
