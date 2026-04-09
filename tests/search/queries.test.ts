import { describe, test, expect } from "bun:test";
import { SEARCH_JOBS_QUERY, buildQueryVariables } from "../../src/search/queries.ts";
import type { SearchConfig, SearchFilters } from "../../src/types.ts";

describe("SEARCH_JOBS_QUERY", () => {
  test("contains marketplaceJobPostings query", () => {
    expect(SEARCH_JOBS_QUERY).toContain("marketplaceJobPostings");
    expect(SEARCH_JOBS_QUERY).toContain("edges");
    expect(SEARCH_JOBS_QUERY).toContain("node");
    expect(SEARCH_JOBS_QUERY).toContain("pageInfo");
  });
});

describe("buildQueryVariables", () => {
  const search: SearchConfig = {
    terms: ["React", "TypeScript", "senior"],
    category: "Web Development",
  };

  const filters: SearchFilters = {
    experienceLevel: "EXPERT",
    hourlyBudgetMin: 50,
    jobType: ["HOURLY", "FIXED"],
    clientHiresCount_gte: 1,
    postedWithin: "24h",
  };

  test("builds variables with search terms as query string", () => {
    const vars = buildQueryVariables(search, filters);
    expect(vars.filter.query).toBe("React TypeScript senior");
  });

  test("includes category in occupations filter", () => {
    const vars = buildQueryVariables(search, filters);
    expect(vars.filter.occupations_category).toBe("Web Development");
  });

  test("includes experience level filter", () => {
    const vars = buildQueryVariables(search, filters);
    expect(vars.filter.experienceLevel).toBe("EXPERT");
  });

  test("supports cursor for pagination", () => {
    const vars = buildQueryVariables(search, filters, "cursor123");
    expect(vars.filter.after).toBe("cursor123");
  });

  test("omits cursor when not provided", () => {
    const vars = buildQueryVariables(search, filters);
    expect(vars.filter.after).toBeUndefined();
  });

  test("includes sort by recency", () => {
    const vars = buildQueryVariables(search, filters);
    expect(vars.sort).toBeDefined();
    expect(vars.sort[0].field).toBe("RECENCY");
  });
});
