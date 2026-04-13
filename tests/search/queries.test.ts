import { test, expect } from "bun:test";
import { buildQueryVariables, SEARCH_JOBS_QUERY } from "../../src/search/queries.ts";
import type { SearchConfig, SearchFilters } from "../../src/types.ts";

const search: SearchConfig = { terms: ["React", "TypeScript"], category: "Web Development" };
const filters: SearchFilters = {
  experienceLevel: "EXPERT",
  hourlyBudgetMin: 50,
  jobType: ["HOURLY", "FIXED"],
  clientHiresCount_gte: 1,
  postedWithin: "24h",
  daysPosted: 1,
};

test("buildQueryVariables produces real-schema filter inputs", () => {
  const vars = buildQueryVariables(search, filters);
  expect(vars.marketPlaceJobFilter.searchExpression_eq).toBe("React TypeScript");
  expect(vars.marketPlaceJobFilter.experienceLevel_eq).toBe("EXPERT");
  expect(vars.marketPlaceJobFilter.daysPosted_eq).toBe(1);
  expect(vars.marketPlaceJobFilter.clientHiresRange_eq).toEqual({ rangeStart: 1 });
  expect(vars.marketPlaceJobFilter.pagination_eq).toEqual({ first: 50 });
  expect(vars.searchType).toBe("USER_JOBS_SEARCH");
  expect(vars.sortAttributes).toEqual([{ field: "RECENCY" }]);

  const invalid = vars.marketPlaceJobFilter as Record<string, unknown>;
  expect(invalid.query).toBeUndefined();
  expect(invalid.occupations_category).toBeUndefined();
  expect(invalid.after).toBeUndefined();
});

test("buildQueryVariables threads cursor through pagination_eq.after", () => {
  const vars = buildQueryVariables(search, filters, "CURSOR-123");
  expect(vars.marketPlaceJobFilter.pagination_eq).toEqual({ first: 50, after: "CURSOR-123" });
});

test("buildQueryVariables omits clientHiresRange_eq when threshold is 0", () => {
  const vars = buildQueryVariables(search, { ...filters, clientHiresCount_gte: 0 });
  expect(vars.marketPlaceJobFilter.clientHiresRange_eq).toBeUndefined();
});

test("SEARCH_JOBS_QUERY uses marketplaceJobPostingsSearch and Money subselections", () => {
  expect(SEARCH_JOBS_QUERY).toContain("marketplaceJobPostingsSearch");
  // Must not use the deprecated root field:
  expect(SEARCH_JOBS_QUERY).not.toMatch(/marketplaceJobPostings\s*\(/);
  // Money subselections:
  expect(SEARCH_JOBS_QUERY).toMatch(/hourlyBudgetMin\s*{\s*rawValue/);
  expect(SEARCH_JOBS_QUERY).toMatch(/amount\s*{\s*rawValue/);
  // occupations.category subselection:
  expect(SEARCH_JOBS_QUERY).toMatch(/category\s*{\s*id[\s\S]*prefLabel/);
  // Removed fields:
  expect(SEARCH_JOBS_QUERY).not.toMatch(/\bbudget\s*{/);
  expect(SEARCH_JOBS_QUERY).not.toMatch(/\bworkload\b/);
});
