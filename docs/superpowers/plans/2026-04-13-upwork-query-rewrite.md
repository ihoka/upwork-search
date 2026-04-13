# Upwork GraphQL Query Rewrite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite the Upwork GraphQL query and filter input to match the real schema so `bun run search` actually returns job results.

**Architecture:** Replace the deprecated `marketplaceJobPostings` query with `marketplaceJobPostingsSearch`. Fix filter input field names (`searchExpression_eq`, `experienceLevel_eq`, `daysPosted_eq`, `clientHiresRange_eq`, `pagination_eq`) and the node subselections for `Money` / `occupations` / `skills` / `client`. Refactor `types.ts` and `transform/markdown.ts` to read the new shapes. Document the manual Upwork API Center step to grant the `Read marketplace Job Postings` scope (scopes are configured on the API key, not via the authorize URL).

**Tech Stack:** Bun, TypeScript, `bun:test`, YAML config, Upwork GraphQL API.

---

## Reference material

All schema details this plan depends on are digested in `docs/upwork/`. Read those — do not try to grep the 14K-line `docs/Upwork API Documentation.md` unless you need something beyond what's in the digest.

- [`docs/upwork/README.md`](../../upwork/README.md) — index.
- [`docs/upwork/authentication-and-scopes.md`](../../upwork/authentication-and-scopes.md) — scopes live on the API key; not in the authorize URL.
- [`docs/upwork/query-job-search.md`](../../upwork/query-job-search.md) — the `marketplaceJobPostingsSearch` query and its arguments.
- [`docs/upwork/filter-input.md`](../../upwork/filter-input.md) — `MarketplaceJobFilter` fields we use and why we skip the others.
- [`docs/upwork/job-node.md`](../../upwork/job-node.md) — job node shape and nested types (`Money`, client, occupations, skills).
- [`docs/upwork/enums.md`](../../upwork/enums.md) — enum values.

## Context for implementer

This project has one broken subsystem: the search client's GraphQL query. The field names and filter input in `src/search/queries.ts` were written against an assumed schema and don't match the real one. Evidence gathered this session:

- Correct endpoint is `https://api.upwork.com/graphql` (already fixed in `src/config.ts`).
- `marketplaceJobPostings` still exists but is deprecated in favor of `marketplaceJobPostingsSearch`.
- Token used during investigation returned: `The client or authentication token doesn't have enough oauth2 permissions/scopes to access: [Money.currency, Money.rawValue, PageInfo.endCursor, PageInfo.hasNextPage]`. The required scope is `Read marketplace Job Postings` plus `Common Entities - Read-Only Access`. See `docs/upwork/authentication-and-scopes.md`.

### Decisions already locked in

- **Use `searchExpression_eq` (not `searchTerm_eq`)** — simpler, supports Lucene, takes a single string. Join `search.terms` with spaces (matches previous implicit-AND behavior).
- **Drop `categoryIds_any` server-side filtering** — the filter takes IDs, not names like `"Web Development"`. Category-name lookups via `ontologyCategories` are out of scope for this plan. `search-profile.yaml` keeps the `category` field for human reference only; the implementation ignores it.
- **Use `clientHiresRange_eq` server-side** — move `clientHiresCount_gte` from client-side filter into the GraphQL filter as `{ rangeStart: N }`. Removes the redundant client-side check.
- **Keep `hourlyBudgetMin` client-side** — the API has no "min hourly rate" filter. Filter returned jobs by parsing `hourlyBudgetMax.rawValue` (String → Number).
- **Pagination** — `pagination_eq: { first: 50, after: cursor }`. Default page size 50, max 2 pages (unchanged behavior).
- **Drop `jobType` filter** — spec says `["HOURLY", "FIXED"]` (both); `jobType_eq` only takes a single value, so filtering by both means not filtering at all.
- **Map `postedWithin: "24h"` → `daysPosted_eq: 1`**. Parse simple `Nh` / `Nd` / `Nw` strings.

### Files that will change

- `src/types.ts` — update `UpworkJobPosting`, add `Money`, rework `client`, `occupations`, `skills` shapes, extend `SearchFilters`.
- `src/search/queries.ts` — new query text, new `buildQueryVariables`.
- `src/search/client.ts` — use new response field `marketplaceJobPostingsSearch`, drop client-side `clientHiresCount_gte` (now server-side), update budget check to parse `Money.rawValue`.
- `src/search/profile.ts` — parse `postedWithin` to days; expose to filters.
- `src/transform/markdown.ts` — read `amount.rawValue`, `hourlyBudgetMin/Max.rawValue`, `occupations.category.prefLabel`, `skills[].name`, `client.totalSpent.rawValue`.
- `tests/search/client.test.ts`, `tests/search/queries.test.ts`, `tests/search/profile.test.ts`, `tests/transform/markdown.test.ts`, `tests/main.test.ts` — update fixtures to new shapes.
- `README.md` — document the scope configuration step.

---

### Task 1: Update types to match real schema

**Files:**
- Modify: `src/types.ts`

- [ ] **Step 1: Read current types**

Run: `cat src/types.ts`

- [ ] **Step 2: Replace the job-posting-related interfaces**

Keep `TokenStore` and `SearchConfig` as-is. Replace `UpworkJobPosting` and anything it references, and extend `SearchFilters`, with:

```typescript
export interface Money {
  rawValue: string;    // numeric as string, e.g. "60"
  currency: string;    // e.g. "USD"
  displayValue: string; // e.g. "$60.00"
}

export interface UpworkJobPostingClient {
  totalHires: number;
  totalReviews: number;
  totalSpent: Money | null;
  location: { country: string | null } | null;
}

export interface UpworkJobPostingOccupation {
  id: string;
  prefLabel: string;
}

export interface UpworkJobPostingOccupations {
  category: UpworkJobPostingOccupation | null;
}

export interface UpworkJobPostingSkill {
  name: string;
  prettyName: string;
}

export interface UpworkJobPosting {
  id: string;
  ciphertext: string;
  title: string;
  description: string;
  publishedDateTime: string;
  experienceLevel: "ENTRY_LEVEL" | "INTERMEDIATE" | "EXPERT" | "NONE";
  duration: "WEEK" | "MONTH" | "QUARTER" | "SEMESTER" | "ONGOING" | null;
  engagement: string | null;
  amount: Money;
  hourlyBudgetMin: Money | null;
  hourlyBudgetMax: Money | null;
  skills: UpworkJobPostingSkill[];
  client: UpworkJobPostingClient;
  occupations: UpworkJobPostingOccupations | null;
}

export interface SearchFilters {
  experienceLevel: "ENTRY_LEVEL" | "INTERMEDIATE" | "EXPERT";
  hourlyBudgetMin: number;
  jobType: string[];         // retained for documentation; unused at runtime
  clientHiresCount_gte: number;
  postedWithin: string;      // raw YAML value, e.g. "24h"
  daysPosted: number;        // derived; min 1
}
```

- [ ] **Step 3: Commit**

```bash
git add src/types.ts
git commit -m "refactor(types): align job-posting types with real Upwork schema"
```

---

### Task 2: Parse `postedWithin` into days in the profile loader

**Files:**
- Modify: `src/search/profile.ts`
- Test: `tests/search/profile.test.ts`

- [ ] **Step 1: Read current profile loader and any existing test**

Run: `cat src/search/profile.ts; [ -f tests/search/profile.test.ts ] && cat tests/search/profile.test.ts || echo "(no profile test yet)"`

- [ ] **Step 2: Add a failing test for `parsePostedWithin`**

Append (or create) `tests/search/profile.test.ts`:

```typescript
import { test, expect } from "bun:test";
import { parsePostedWithin } from "../../src/search/profile.ts";

test("parsePostedWithin handles hours, days, weeks", () => {
  expect(parsePostedWithin("24h")).toBe(1);
  expect(parsePostedWithin("1h")).toBe(1);  // rounds up to minimum 1 day
  expect(parsePostedWithin("3d")).toBe(3);
  expect(parsePostedWithin("2w")).toBe(14);
  expect(parsePostedWithin("")).toBe(1);    // default
  expect(parsePostedWithin("bogus")).toBe(1);
});
```

- [ ] **Step 3: Run and verify failure**

Run: `bun test tests/search/profile.test.ts`
Expected: FAIL — `parsePostedWithin is not a function`.

- [ ] **Step 4: Implement `parsePostedWithin` and thread `daysPosted` into loaded filters**

Add to `src/search/profile.ts`:

```typescript
export function parsePostedWithin(value: string): number {
  const m = /^\s*(\d+)\s*([hdw])\s*$/i.exec(value ?? "");
  if (!m) return 1;
  const n = parseInt(m[1], 10);
  const unit = m[2].toLowerCase();
  if (unit === "h") return Math.max(1, Math.ceil(n / 24));
  if (unit === "d") return Math.max(1, n);
  if (unit === "w") return Math.max(1, n * 7);
  return 1;
}
```

In `loadSearchProfile`, after the filters object is constructed from YAML and before returning, set:

```typescript
filters.daysPosted = parsePostedWithin(filters.postedWithin ?? "");
```

(Read the existing `loadSearchProfile` to see exactly where the filters object is built; put the assignment immediately before returning.)

- [ ] **Step 5: Run test**

Run: `bun test tests/search/profile.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/search/profile.ts tests/search/profile.test.ts
git commit -m "feat(profile): parse postedWithin into daysPosted"
```

---

### Task 3: Rewrite the GraphQL query and filter variables

**Files:**
- Modify: `src/search/queries.ts`
- Test: `tests/search/queries.test.ts` (create if absent)

- [ ] **Step 1: Read current query module**

Run: `cat src/search/queries.ts; ls tests/search/`

- [ ] **Step 2: Write failing tests for `buildQueryVariables` and the query text**

Create or replace `tests/search/queries.test.ts`:

```typescript
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
```

- [ ] **Step 3: Run and verify failure**

Run: `bun test tests/search/queries.test.ts`
Expected: FAIL (query string and variable shape don't match).

- [ ] **Step 4: Replace `src/search/queries.ts`**

```typescript
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
```

- [ ] **Step 5: Run test**

Run: `bun test tests/search/queries.test.ts`
Expected: PASS (all four tests).

- [ ] **Step 6: Commit**

```bash
git add src/search/queries.ts tests/search/queries.test.ts
git commit -m "refactor(search): use marketplaceJobPostingsSearch with correct filter inputs"
```

---

### Task 4: Update `UpworkSearchClient` for the new response and client-side filter

**Files:**
- Modify: `src/search/client.ts`
- Test: `tests/search/client.test.ts`

- [ ] **Step 1: Read current client and its test**

Run: `cat src/search/client.ts tests/search/client.test.ts`

- [ ] **Step 2: Update test fixtures to match the new node shape**

In `tests/search/client.test.ts`, wherever a sample job is constructed, use this shape (replace the existing fixture in place — do not introduce a second fixture):

```typescript
const sampleJob = {
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
```

Mock GraphQL responses must use `marketplaceJobPostingsSearch` (not `marketplaceJobPostings`) as the top-level data key:

```typescript
const ok = {
  data: {
    marketplaceJobPostingsSearch: {
      totalCount: 1,
      edges: [{ node: sampleJob }],
      pageInfo: { hasNextPage: false, endCursor: null },
    },
  },
};
```

Add two tests exercising the new client-side budget filter:

```typescript
import type { SearchFilters } from "../../src/types.ts";

const baseFilters: SearchFilters = {
  experienceLevel: "EXPERT",
  hourlyBudgetMin: 50,
  jobType: [],
  clientHiresCount_gte: 0,
  postedWithin: "24h",
  daysPosted: 1,
};

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
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `bun test tests/search/client.test.ts`
Expected: FAIL — client reads `json.data.marketplaceJobPostings` and the old filter compares `hourlyBudgetMax` (now an object) to a number.

- [ ] **Step 4: Update `src/search/client.ts`**

Replace the response-shape guard and destructure to use the new field. In the existing `fetchJobs` method:

```typescript
      if (!json.data?.marketplaceJobPostingsSearch) {
        throw new Error(
          `Upwork API returned unexpected response: ${summarizeBody(JSON.stringify(json))}`,
        );
      }

      const { edges, pageInfo } = json.data.marketplaceJobPostingsSearch;
```

Rewrite `filterJobs` — drop the now-server-side hires check and parse `Money.rawValue`:

```typescript
  filterJobs(jobs: UpworkJobPosting[], filters: SearchFilters): UpworkJobPosting[] {
    return jobs.filter((job) => {
      // Only hourly jobs have an hourly budget. Fixed-price jobs pass through.
      const rawMax = job.hourlyBudgetMax?.rawValue;
      if (rawMax != null) {
        const max = Number(rawMax);
        if (Number.isFinite(max) && max < filters.hourlyBudgetMin) return false;
      }
      return true;
    });
  }
```

- [ ] **Step 5: Run all search tests**

Run: `bun test tests/search/`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/search/client.ts tests/search/client.test.ts
git commit -m "refactor(search-client): read marketplaceJobPostingsSearch and parse Money.rawValue"
```

---

### Task 5: Update markdown transform for the new node shape

**Files:**
- Modify: `src/transform/markdown.ts`
- Test: `tests/transform/markdown.test.ts`

- [ ] **Step 1: Read current transform and test**

Run: `cat src/transform/markdown.ts tests/transform/markdown.test.ts`

- [ ] **Step 2: Update the test fixture to the new shape**

Replace the existing sample job in `tests/transform/markdown.test.ts` with the same `sampleJob` shape as in Task 4. Update each `expect(md).toContain(...)` assertion to use the new values. Frontmatter expectations that must remain unchanged:

```typescript
expect(md).toContain('source: upwork-api');
expect(md).toContain('upwork_job_id: "~01abc"');
expect(md).toContain('upwork_url: "https://www.upwork.com/jobs/~01abc"');
```

Body-content expectations to align with the new output format (adjust wording below to match whatever the emitter renders — the point is every assertion must read from the *new* field paths):

```typescript
expect(md).toContain("Hourly: $60.00 – $90.00");  // from Money.displayValue
expect(md).toContain("Client hires: 12");
expect(md).toContain("Client spent: $50,000");
expect(md).toContain("Category: Web Development");
expect(md).toContain("react");                     // from skills[].name
```

- [ ] **Step 3: Run to see failures**

Run: `bun test tests/transform/markdown.test.ts`
Expected: FAIL — transform reads old paths (`job.budget.amount`, `job.occupations[0].category`, `job.workload`, `job.hourlyBudgetMin` as number, `job.client.totalSpent` as number).

- [ ] **Step 4: Update `src/transform/markdown.ts`**

Read the current emitter top-to-bottom. For each old field access, apply the mapping:

| Old access | New access |
|---|---|
| `job.budget?.amount` | `job.amount?.displayValue` (fixed-price; emit only if non-zero `rawValue`) |
| `job.hourlyBudgetMin` / `Max` as number | `job.hourlyBudgetMin?.displayValue` / `.hourlyBudgetMax?.displayValue` |
| `job.workload` | `job.engagement` |
| `job.occupations?.[0]?.category` (or similar array access) | `job.occupations?.category?.prefLabel` |
| `job.client.totalSpent` as number | `job.client.totalSpent?.displayValue` |
| `job.skills.map(s => s.name)` | unchanged — `name` still exists |

Do **not** change frontmatter keys (`source`, `upwork_job_id`, `upwork_fetched`, `upwork_url`) — those are consumed by the `/upwork-triage` skill.

- [ ] **Step 5: Run test**

Run: `bun test tests/transform/markdown.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/transform/markdown.ts tests/transform/markdown.test.ts
git commit -m "refactor(transform): read new Money/occupations/engagement shape"
```

---

### Task 6: Fix main integration test and run full suite

**Files:**
- Modify: `tests/main.test.ts`

- [ ] **Step 1: Read main test**

Run: `cat tests/main.test.ts`

- [ ] **Step 2: Update mocked GraphQL responses**

Anywhere the test constructs a fake response body with `data.marketplaceJobPostings`, change the top-level key to `marketplaceJobPostingsSearch` and use the new node shape (same `sampleJob` as Task 4). Preserve existing test intent (counts of saved/filtered/duplicates).

- [ ] **Step 3: Run the full test suite**

Run: `bun test`
Expected: all tests PASS. The previous run reported `50 pass / 0 fail`; the new profile test and the new queries tests bring the count up.

- [ ] **Step 4: Commit**

```bash
git add tests/main.test.ts
git commit -m "test(main): update fixtures for marketplaceJobPostingsSearch shape"
```

---

### Task 7: Document API-key scope configuration in README

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Read README**

Run: `cat README.md`

- [ ] **Step 2: Add a "Required API key scopes" subsection**

Find the setup / OAuth section. Insert (or append) this block:

```markdown
### Required API key scopes

Scopes on Upwork are configured **on the API key**, not requested in the authorize URL. If `bun run search` reports an error like:

> The client or authentication token doesn't have enough oauth2 permissions/scopes to access: [Money.currency, ...]

open the [Upwork API Center](https://www.upwork.com/developer/keys/), edit your key, and enable these scopes:

- **Common Entities - Read-Only Access** (required for all Upwork API calls)
- **Read marketplace Job Postings** (required for `marketplaceJobPostingsSearch` and its `Money` / `PageInfo` / nested fields)

After changing scopes, existing access tokens are invalidated — re-run `bun run setup` to obtain new ones. See [`docs/upwork/authentication-and-scopes.md`](docs/upwork/authentication-and-scopes.md) for more detail.
```

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: explain required API key scopes for job search"
```

---

### Task 8: End-to-end verification against the live API

Manual — requires a working OAuth token with the correct scopes.

- [ ] **Step 1: Confirm scopes are set in the Upwork API Center**

Log into <https://www.upwork.com/developer/keys/>. Confirm the key has `Common Entities - Read-Only Access` and `Read marketplace Job Postings` checked. If either was just added, proceed to Step 2 (tokens are invalidated on scope change).

- [ ] **Step 2: Re-authorize if needed**

Run: `bun run setup`
Complete the browser auth flow. Verify `data/tokens.json` is written.

- [ ] **Step 3: Run the search**

Run: `bun run search`
Expected: `Done. Fetched: N, Saved: N, Duplicates: 0, Filtered: M` with N > 0 and no error lines above it. No raw HTML in stdout.

- [ ] **Step 4: Verify output files**

Run: `ls -lt "$OUTPUT_DIR" | head -10` (or the default `~/Documents/Obsidian/Personal/+Inbox/Upwork`).
Expected: Markdown files with sanitized titles and `~01…` suffix. Open one and confirm frontmatter has `source: upwork-api`, non-empty `upwork_url`, and the body renders budget / engagement / category from the new fields.

- [ ] **Step 5: Sanity-check DEBUG gating**

Re-read `summarizeBody()` in `src/search/client.ts` and confirm that without `DEBUG=1` it returns the `[HTML response: <title>]` shape. Visual-only — the earlier logging fix should not have regressed through this refactor.

- [ ] **Step 6: Only commit if a tweak was needed**

```bash
git add -p
git commit -m "fix: <describe tweak>"
```

---

## Self-review notes

- **Spec coverage** — tasks cover the two gaps from the debugging session: broken query schema (1–6) and OAuth scope discovery (7–8).
- **Type consistency** — types defined in Task 1 (`UpworkJobPosting`, `Money`, …) are the exact shapes consumed in Tasks 3–6. Field names match (`hourlyBudgetMax.rawValue`, `occupations.category.prefLabel`, `client.totalSpent.displayValue`). `QueryVariables.marketPlaceJobFilter` uses Upwork's idiosyncratic mixed-case (confirmed by `docs/upwork/query-job-search.md`).
- **No placeholders** — every code block is complete. Where `markdown.ts` contains repo-specific rendering logic that wasn't readable at plan-writing time, the mapping table tells the implementer exactly which paths to swap; the emitter strings remain the author's choice.
- **Category-ID lookup explicitly out of scope** — called out under "Decisions already locked in" and in `docs/upwork/filter-input.md`.
