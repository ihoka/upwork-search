import type { SearchConfig, SearchFilters } from "../types.ts";

export const SEARCH_JOBS_QUERY = `
query searchJobs($filter: MarketplaceJobFilter, $sort: [MarketplaceJobPostingSearchSortAttribute]) {
  marketplaceJobPostings(
    marketPlaceJobFilter: $filter
    searchType: USER_JOBS_SEARCH
    sortAttributes: $sort
  ) {
    totalCount
    edges {
      node {
        id
        ciphertext
        title
        description
        publishedDateTime
        hourlyBudgetMin
        hourlyBudgetMax
        budget { amount }
        experienceLevel
        duration
        workload
        skills { name }
        client {
          totalHires
          totalSpent
          totalReviews
          location { country }
        }
        occupations { category }
      }
    }
    pageInfo { hasNextPage endCursor }
  }
}
`;

export interface QueryVariables {
  filter: Record<string, unknown>;
  sort: { field: string; sortOrder: string }[];
}

export function buildQueryVariables(
  search: SearchConfig,
  filters: SearchFilters,
  cursor?: string,
): QueryVariables {
  const filter: Record<string, unknown> = {
    query: search.terms.join(" "),
    occupations_category: search.category,
    experienceLevel: filters.experienceLevel,
  };

  if (cursor) {
    filter.after = cursor;
  }

  return {
    filter,
    sort: [{ field: "RECENCY", sortOrder: "DESC" }],
  };
}
