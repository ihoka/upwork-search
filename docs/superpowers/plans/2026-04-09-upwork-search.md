# Upwork Job Search Automation Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a scheduled service that queries the Upwork GraphQL API, filters for relevant jobs, deduplicates across runs, and writes structured markdown files into an Obsidian vault inbox.

**Architecture:** A pipeline executed every 6 hours via macOS launchd: refresh OAuth token -> run ~7 GraphQL searches from a YAML profile -> client-side filter (budget/stack/experience) -> dedup against a JSON state file -> transform to markdown -> write files to output directory. Each pipeline stage is a separate module with clear interfaces and full test coverage.

**Tech Stack:** Bun (runtime + test runner), TypeScript, Upwork GraphQL API, OAuth 2.0, YAML config (`yaml` npm package), macOS launchd for scheduling.

---

## File Structure

```
src/
  types.ts                  # Shared types for API responses and config
  config.ts                 # Env vars, paths, constants
  auth/
    oauth.ts                # Token read/write/refresh/validate
    setup.ts                # One-time interactive OAuth setup flow
  search/
    queries.ts              # GraphQL query string + variable builders
    profile.ts              # Parse search-profile.yaml into search configs
    client.ts               # Execute GraphQL queries, paginate, client-side filter
  transform/
    markdown.ts             # API response -> structured markdown string
  dedup/
    state.ts                # JSON state file: read, write, check, prune
  main.ts                   # Entry point: orchestrate full fetch cycle
tests/
  config.test.ts
  auth/
    oauth.test.ts
  search/
    queries.test.ts
    profile.test.ts
    client.test.ts
  transform/
    markdown.test.ts
  dedup/
    state.test.ts
  main.test.ts              # Integration test: full pipeline with mocks
search-profile.yaml         # Search criteria config
.env.example                # Template without secrets
com.ihoka.upwork-search.plist  # launchd schedule definition
```

---

### Task 1: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.gitignore`
- Create: `.env.example`
- Create: `search-profile.yaml`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "upwork-search",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "search": "bun run src/main.ts",
    "setup": "bun run src/auth/setup.ts",
    "test": "bun test"
  },
  "dependencies": {
    "yaml": "^2.7.1"
  },
  "devDependencies": {
    "@types/bun": "latest"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "./dist",
    "rootDir": ".",
    "types": ["bun-types"]
  },
  "include": ["src/**/*.ts", "tests/**/*.ts"]
}
```

- [ ] **Step 3: Create .gitignore**

```
node_modules/
dist/
data/tokens.json
data/seen-jobs.json
.env
logs/
```

- [ ] **Step 4: Create .env.example**

```
UPWORK_CLIENT_ID=your_client_id
UPWORK_CLIENT_SECRET=your_client_secret
UPWORK_REDIRECT_URI=http://localhost:3000/callback
OUTPUT_DIR=~/Documents/Obsidian/Personal/+Inbox/Upwork/
```

- [ ] **Step 5: Create search-profile.yaml**

```yaml
searches:
  # Domain expertise (highest value)
  - terms: ["billing", "invoicing", "subscription"]
    category: "Web Development"
  - terms: ["e-commerce", "marketplace", "payments"]
    category: "Web Development"
  - terms: ["CMS", "content management"]
    category: "Web Development"

  # Core stack
  - terms: ["React", "TypeScript", "senior"]
    category: "Web Development"
  - terms: ["Ruby", "Rails", "full-stack"]
    category: "Web Development"
  - terms: ["Node.js", "backend", "API"]
    category: "Web Development"

  # AI/ML
  - terms: ["AI", "LLM", "machine learning"]
    category: "Web Development"

filters:
  experienceLevel: "EXPERT"
  hourlyBudgetMin: 50
  jobType: ["HOURLY", "FIXED"]
  clientHiresCount_gte: 1
  postedWithin: "24h"
```

- [ ] **Step 6: Install dependencies**

Run: `bun install`
Expected: `yaml` and `@types/bun` installed, `bun.lock` created.

- [ ] **Step 7: Create directory structure**

```bash
mkdir -p src/auth src/search src/transform src/dedup tests/auth tests/search tests/transform tests/dedup data logs
```

- [ ] **Step 8: Verify setup**

Run: `bun test`
Expected: "0 tests" or similar (no test files yet), exit 0.

- [ ] **Step 9: Commit**

```bash
git add package.json tsconfig.json .gitignore .env.example search-profile.yaml bun.lock src/ tests/ data/ logs/
git commit -m "chore: scaffold project with dependencies and directory structure"
```

---

### Task 2: Shared Types

**Files:**
- Create: `src/types.ts`

No tests needed — this is a pure type definition file with no runtime logic.

- [ ] **Step 1: Create src/types.ts**

```typescript
// Token storage shape (data/tokens.json)
export interface TokenStore {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // Unix timestamp in ms
}

// Search profile config (search-profile.yaml)
export interface SearchConfig {
  terms: string[];
  category: string;
}

export interface SearchFilters {
  experienceLevel: string;
  hourlyBudgetMin: number;
  jobType: string[];
  clientHiresCount_gte: number;
  postedWithin: string;
}

export interface SearchProfile {
  searches: SearchConfig[];
  filters: SearchFilters;
}

// Upwork GraphQL API response types
export interface UpworkClient {
  totalHires: number | null;
  totalSpent: number | null;
  totalReviews: number | null;
  location: { country: string } | null;
}

export interface UpworkJobPosting {
  id: string;
  ciphertext: string;
  title: string;
  description: string;
  publishedDateTime: string;
  hourlyBudgetMin: number | null;
  hourlyBudgetMax: number | null;
  budget: { amount: number } | null;
  experienceLevel: string | null;
  duration: string | null;
  workload: string | null;
  skills: { name: string }[];
  client: UpworkClient | null;
  occupations: { category: string }[] | null;
}

export interface JobPostingEdge {
  node: UpworkJobPosting;
}

export interface PageInfo {
  hasNextPage: boolean;
  endCursor: string | null;
}

export interface MarketplaceJobPostingsResponse {
  data: {
    marketplaceJobPostings: {
      totalCount: number;
      edges: JobPostingEdge[];
      pageInfo: PageInfo;
    };
  };
}

// Dedup state shape (data/seen-jobs.json)
export type SeenJobs = Record<string, string>; // jobId -> ISO timestamp
```

- [ ] **Step 2: Commit**

```bash
git add src/types.ts
git commit -m "feat: add shared type definitions for API responses and config"
```

---

### Task 3: Config Module

**Files:**
- Create: `src/config.ts`
- Test: `tests/config.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/config.test.ts`:

```typescript
import { describe, test, expect, beforeEach, afterEach } from "bun:test";

describe("config", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.UPWORK_CLIENT_ID = "test-client-id";
    process.env.UPWORK_CLIENT_SECRET = "test-client-secret";
    process.env.UPWORK_REDIRECT_URI = "http://localhost:3000/callback";
    process.env.OUTPUT_DIR = "/tmp/test-output";
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  test("getConfig returns env vars and computed paths", async () => {
    const { getConfig } = await import("../src/config.ts");
    const config = getConfig();

    expect(config.clientId).toBe("test-client-id");
    expect(config.clientSecret).toBe("test-client-secret");
    expect(config.redirectUri).toBe("http://localhost:3000/callback");
    expect(config.outputDir).toBe("/tmp/test-output");
    expect(config.tokensPath).toContain("data/tokens.json");
    expect(config.seenJobsPath).toContain("data/seen-jobs.json");
    expect(config.searchProfilePath).toContain("search-profile.yaml");
  });

  test("getConfig throws when required env vars are missing", async () => {
    delete process.env.UPWORK_CLIENT_ID;
    // Re-import to get fresh module
    const { getConfig } = await import("../src/config.ts");
    expect(() => getConfig()).toThrow("UPWORK_CLIENT_ID");
  });

  test("getConfig uses default OUTPUT_DIR when not set", async () => {
    delete process.env.OUTPUT_DIR;
    const { getConfig } = await import("../src/config.ts");
    const config = getConfig();
    expect(config.outputDir).toContain("Obsidian");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/config.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

Create `src/config.ts`:

```typescript
import { resolve, join } from "path";

export interface AppConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  outputDir: string;
  tokensPath: string;
  seenJobsPath: string;
  searchProfilePath: string;
  apiBaseUrl: string;
}

const PROJECT_ROOT = resolve(import.meta.dir, "..");

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export function getConfig(): AppConfig {
  const homeDir = process.env.HOME || "~";
  return {
    clientId: requireEnv("UPWORK_CLIENT_ID"),
    clientSecret: requireEnv("UPWORK_CLIENT_SECRET"),
    redirectUri: process.env.UPWORK_REDIRECT_URI || "http://localhost:3000/callback",
    outputDir: process.env.OUTPUT_DIR || join(homeDir, "Documents/Obsidian/Personal/+Inbox/Upwork"),
    tokensPath: join(PROJECT_ROOT, "data/tokens.json"),
    seenJobsPath: join(PROJECT_ROOT, "data/seen-jobs.json"),
    searchProfilePath: join(PROJECT_ROOT, "search-profile.yaml"),
    apiBaseUrl: "https://www.upwork.com/api/graphql",
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/config.test.ts`
Expected: PASS (all 3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/config.ts tests/config.test.ts
git commit -m "feat: add config module with env var loading and path resolution"
```

---

### Task 4: Dedup State Module

**Files:**
- Create: `src/dedup/state.ts`
- Test: `tests/dedup/state.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/dedup/state.test.ts`:

```typescript
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { DeduplicationState } from "../../src/dedup/state.ts";

describe("DeduplicationState", () => {
  let tempDir: string;
  let statePath: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "dedup-test-"));
    statePath = join(tempDir, "seen-jobs.json");
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  test("load returns empty state when file does not exist", async () => {
    const state = new DeduplicationState(statePath);
    await state.load();
    expect(state.hasSeen("~01abc")).toBe(false);
  });

  test("markSeen and hasSeen track job IDs", async () => {
    const state = new DeduplicationState(statePath);
    await state.load();

    state.markSeen("~01abc");
    expect(state.hasSeen("~01abc")).toBe(true);
    expect(state.hasSeen("~02xyz")).toBe(false);
  });

  test("save persists state to disk and load reads it back", async () => {
    const state1 = new DeduplicationState(statePath);
    await state1.load();
    state1.markSeen("~01abc");
    await state1.save();

    const state2 = new DeduplicationState(statePath);
    await state2.load();
    expect(state2.hasSeen("~01abc")).toBe(true);
  });

  test("prune removes entries older than maxAgeDays", async () => {
    const state = new DeduplicationState(statePath);
    await state.load();

    // Add an old entry (31 days ago)
    const oldDate = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString();
    state.setEntry("~old-job", oldDate);
    state.markSeen("~new-job");

    state.prune(30);

    expect(state.hasSeen("~old-job")).toBe(false);
    expect(state.hasSeen("~new-job")).toBe(true);
  });

  test("save uses atomic write (temp file + rename)", async () => {
    const state = new DeduplicationState(statePath);
    await state.load();
    state.markSeen("~01abc");
    await state.save();

    // Verify file exists and is valid JSON
    const content = await Bun.file(statePath).json();
    expect(content["~01abc"]).toBeDefined();
  });

  test("load handles corrupted JSON gracefully", async () => {
    await Bun.write(statePath, "not valid json{{{");
    const state = new DeduplicationState(statePath);
    await state.load();
    // Should start fresh rather than crash
    expect(state.hasSeen("anything")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/dedup/state.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

Create `src/dedup/state.ts`:

```typescript
import { join, dirname } from "path";
import { mkdir } from "fs/promises";
import type { SeenJobs } from "../types.ts";

export class DeduplicationState {
  private jobs: SeenJobs = {};

  constructor(private readonly filePath: string) {}

  async load(): Promise<void> {
    try {
      const file = Bun.file(this.filePath);
      if (await file.exists()) {
        this.jobs = await file.json();
      }
    } catch {
      // Corrupted file — start fresh
      this.jobs = {};
    }
  }

  hasSeen(jobId: string): boolean {
    return jobId in this.jobs;
  }

  markSeen(jobId: string): void {
    this.jobs[jobId] = new Date().toISOString();
  }

  /** Exposed for testing — set a specific entry with a specific timestamp */
  setEntry(jobId: string, timestamp: string): void {
    this.jobs[jobId] = timestamp;
  }

  prune(maxAgeDays: number): void {
    const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
    for (const [jobId, timestamp] of Object.entries(this.jobs)) {
      if (new Date(timestamp).getTime() < cutoff) {
        delete this.jobs[jobId];
      }
    }
  }

  async save(): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    const tempPath = this.filePath + ".tmp";
    await Bun.write(tempPath, JSON.stringify(this.jobs, null, 2));
    const { rename } = await import("fs/promises");
    await rename(tempPath, this.filePath);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/dedup/state.test.ts`
Expected: PASS (all 6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/dedup/state.ts tests/dedup/state.test.ts
git commit -m "feat: add dedup state module with atomic writes and pruning"
```

---

### Task 5: Search Profile Module

**Files:**
- Create: `src/search/profile.ts`
- Test: `tests/search/profile.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/search/profile.test.ts`:

```typescript
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { loadSearchProfile } from "../../src/search/profile.ts";

describe("loadSearchProfile", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "profile-test-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  test("parses valid search-profile.yaml", async () => {
    const yamlContent = `
searches:
  - terms: ["React", "TypeScript"]
    category: "Web Development"
  - terms: ["AI", "LLM"]
    category: "Web Development"

filters:
  experienceLevel: "EXPERT"
  hourlyBudgetMin: 50
  jobType: ["HOURLY", "FIXED"]
  clientHiresCount_gte: 1
  postedWithin: "24h"
`;
    const profilePath = join(tempDir, "search-profile.yaml");
    await Bun.write(profilePath, yamlContent);

    const profile = await loadSearchProfile(profilePath);

    expect(profile.searches).toHaveLength(2);
    expect(profile.searches[0].terms).toEqual(["React", "TypeScript"]);
    expect(profile.searches[0].category).toBe("Web Development");
    expect(profile.filters.experienceLevel).toBe("EXPERT");
    expect(profile.filters.hourlyBudgetMin).toBe(50);
    expect(profile.filters.jobType).toEqual(["HOURLY", "FIXED"]);
    expect(profile.filters.clientHiresCount_gte).toBe(1);
    expect(profile.filters.postedWithin).toBe("24h");
  });

  test("throws when file does not exist", async () => {
    const badPath = join(tempDir, "nonexistent.yaml");
    await expect(loadSearchProfile(badPath)).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/search/profile.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

Create `src/search/profile.ts`:

```typescript
import { parse } from "yaml";
import type { SearchProfile } from "../types.ts";

export async function loadSearchProfile(filePath: string): Promise<SearchProfile> {
  const file = Bun.file(filePath);
  const content = await file.text();
  const parsed = parse(content) as SearchProfile;
  return parsed;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/search/profile.test.ts`
Expected: PASS (all 2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/search/profile.ts tests/search/profile.test.ts
git commit -m "feat: add search profile YAML parser"
```

---

### Task 6: Search Queries Module

**Files:**
- Create: `src/search/queries.ts`
- Test: `tests/search/queries.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/search/queries.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/search/queries.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

Create `src/search/queries.ts`:

```typescript
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/search/queries.test.ts`
Expected: PASS (all 6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/search/queries.ts tests/search/queries.test.ts
git commit -m "feat: add GraphQL query definition and variable builder"
```

---

### Task 7: Transform Markdown Module

**Files:**
- Create: `src/transform/markdown.ts`
- Test: `tests/transform/markdown.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/transform/markdown.test.ts`:

```typescript
import { describe, test, expect } from "bun:test";
import { jobToMarkdown, sanitizeFilename } from "../../src/transform/markdown.ts";
import type { UpworkJobPosting } from "../../src/types.ts";

const sampleJob: UpworkJobPosting = {
  id: "1",
  ciphertext: "~01abc123def456",
  title: "Senior React/TypeScript Developer for SaaS Platform",
  description: "We need an experienced React developer to build our SaaS dashboard.",
  publishedDateTime: "2026-04-09T14:30:00Z",
  hourlyBudgetMin: 60,
  hourlyBudgetMax: 120,
  budget: null,
  experienceLevel: "Expert",
  duration: "1 to 3 months",
  workload: "30+ hrs/week",
  skills: [{ name: "React" }, { name: "TypeScript" }, { name: "Node.js" }],
  client: {
    totalHires: 12,
    totalSpent: 45000,
    totalReviews: 8,
    location: { country: "United States" },
  },
  occupations: [{ category: "Web Development" }],
};

describe("jobToMarkdown", () => {
  test("includes YAML frontmatter with source: upwork-api", () => {
    const md = jobToMarkdown(sampleJob);
    expect(md).toContain("source: upwork-api");
    expect(md).toContain('upwork_job_id: "~01abc123def456"');
    expect(md).toContain('upwork_url: "https://www.upwork.com/jobs/~01abc123def456"');
    expect(md).toContain("upwork_fetched:");
  });

  test("includes job title as h4 heading", () => {
    const md = jobToMarkdown(sampleJob);
    expect(md).toContain("#### Senior React/TypeScript Developer for SaaS Platform");
  });

  test("includes posted date", () => {
    const md = jobToMarkdown(sampleJob);
    expect(md).toContain("**Posted:** 2026-04-09T14:30:00Z");
  });

  test("includes job description under Summary", () => {
    const md = jobToMarkdown(sampleJob);
    expect(md).toContain("**Summary**");
    expect(md).toContain("We need an experienced React developer");
  });

  test("includes hourly budget range", () => {
    const md = jobToMarkdown(sampleJob);
    expect(md).toContain("$60.00 - $120.00");
  });

  test("includes workload, duration, experience level", () => {
    const md = jobToMarkdown(sampleJob);
    expect(md).toContain("30+ hrs/week");
    expect(md).toContain("1 to 3 months");
    expect(md).toContain("Expert");
  });

  test("includes skills list", () => {
    const md = jobToMarkdown(sampleJob);
    expect(md).toContain("**Skills:** React, TypeScript, Node.js");
  });

  test("includes client history", () => {
    const md = jobToMarkdown(sampleJob);
    expect(md).toContain("Total hires: 12");
    expect(md).toContain("Total spent: $45,000");
    expect(md).toContain("Total reviews: 8");
    expect(md).toContain("Location: United States");
  });

  test("includes activity section with not available values", () => {
    const md = jobToMarkdown(sampleJob);
    expect(md).toContain("##### Activity on this job");
    expect(md).toContain("Proposals: not available");
  });

  test("handles fixed-price job with budget amount", () => {
    const fixedJob: UpworkJobPosting = {
      ...sampleJob,
      hourlyBudgetMin: null,
      hourlyBudgetMax: null,
      budget: { amount: 5000 },
      workload: null,
    };
    const md = jobToMarkdown(fixedJob);
    expect(md).toContain("$5,000.00");
    expect(md).toContain("Fixed");
  });

  test("handles missing client data gracefully", () => {
    const noClientJob: UpworkJobPosting = { ...sampleJob, client: null };
    const md = jobToMarkdown(noClientJob);
    expect(md).toContain("**Client History**");
    expect(md).toContain("not available");
  });
});

describe("sanitizeFilename", () => {
  test("replaces special characters with hyphens", () => {
    const result = sanitizeFilename("Senior React/TypeScript Developer", "~01abc123");
    expect(result).toBe("Senior React-TypeScript Developer - ~01abc123.md");
  });

  test("trims long titles", () => {
    const longTitle = "A".repeat(200);
    const result = sanitizeFilename(longTitle, "~01abc");
    expect(result.length).toBeLessThanOrEqual(120);
    expect(result).toEndWith("~01abc.md");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/transform/markdown.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

Create `src/transform/markdown.ts`:

```typescript
import type { UpworkJobPosting } from "../types.ts";

function formatCurrency(amount: number): string {
  return `$${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function jobToMarkdown(job: UpworkJobPosting): string {
  const today = new Date().toISOString().split("T")[0];
  const url = `https://www.upwork.com/jobs/${job.ciphertext}`;
  const country = job.client?.location?.country ?? "Worldwide";

  // Budget section
  let budgetLine: string;
  let budgetLabel: string;
  if (job.hourlyBudgetMin != null || job.hourlyBudgetMax != null) {
    const min = job.hourlyBudgetMin ?? 0;
    const max = job.hourlyBudgetMax ?? 0;
    budgetLine = `${formatCurrency(min)} - ${formatCurrency(max)}`;
    budgetLabel = "Hourly";
  } else if (job.budget?.amount != null) {
    budgetLine = formatCurrency(job.budget.amount);
    budgetLabel = "Fixed";
  } else {
    budgetLine = "not available";
    budgetLabel = "Budget";
  }

  // Client history
  const clientHires = job.client?.totalHires != null ? String(job.client.totalHires) : "not available";
  const clientSpent = job.client?.totalSpent != null ? formatCurrency(job.client.totalSpent) : "not available";
  const clientReviews = job.client?.totalReviews != null ? String(job.client.totalReviews) : "not available";
  const clientLocation = job.client?.location?.country ?? "not available";

  const skills = job.skills.map((s) => s.name).join(", ");

  return `---
source: upwork-api
upwork_job_id: "${job.ciphertext}"
upwork_fetched: ${today}
upwork_url: "${url}"
---

#### ${job.title}

**Posted:** ${job.publishedDateTime}

**${country}**

**Summary**

${job.description}

- **${job.workload ?? "not available"}**
    ${budgetLabel}
- **${job.duration ?? "not available"}**
    Duration
- **${job.experienceLevel ?? "not available"}**
    Experience Level
- **${budgetLine}**
    ${budgetLabel}

**Skills:** ${skills || "not available"}

**Client History**
- Total hires: ${clientHires}
- Total spent: ${clientSpent}
- Total reviews: ${clientReviews}
- Location: ${clientLocation}

##### Activity on this job

- Proposals: not available
- Interviewing: not available
`;
}

export function sanitizeFilename(title: string, jobId: string): string {
  const maxTitleLength = 100;
  const sanitized = title.replace(/[\/\\:*?"<>|]/g, "-");
  const truncated = sanitized.length > maxTitleLength ? sanitized.slice(0, maxTitleLength) : sanitized;
  return `${truncated.trim()} - ${jobId}.md`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/transform/markdown.test.ts`
Expected: PASS (all 12 tests).

- [ ] **Step 5: Commit**

```bash
git add src/transform/markdown.ts tests/transform/markdown.test.ts
git commit -m "feat: add markdown transformation with frontmatter and filename sanitization"
```

---

### Task 8: Auth OAuth Module

**Files:**
- Create: `src/auth/oauth.ts`
- Test: `tests/auth/oauth.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/auth/oauth.test.ts`:

```typescript
import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";
import { mkdtemp, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { TokenManager } from "../../src/auth/oauth.ts";
import type { TokenStore } from "../../src/types.ts";

describe("TokenManager", () => {
  let tempDir: string;
  let tokensPath: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "oauth-test-"));
    tokensPath = join(tempDir, "tokens.json");
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
    mock.restore();
  });

  function writeTokens(tokens: TokenStore): Promise<number> {
    return Bun.write(tokensPath, JSON.stringify(tokens));
  }

  test("loadTokens reads tokens from disk", async () => {
    const tokens: TokenStore = {
      accessToken: "access-123",
      refreshToken: "refresh-456",
      expiresAt: Date.now() + 3600_000,
    };
    await writeTokens(tokens);

    const manager = new TokenManager(tokensPath, "client-id", "client-secret");
    const loaded = await manager.loadTokens();

    expect(loaded.accessToken).toBe("access-123");
    expect(loaded.refreshToken).toBe("refresh-456");
  });

  test("loadTokens throws when file does not exist", async () => {
    const manager = new TokenManager(
      join(tempDir, "nonexistent.json"),
      "client-id",
      "client-secret",
    );
    await expect(manager.loadTokens()).rejects.toThrow();
  });

  test("isExpired returns true when token is within 5-minute buffer", () => {
    const manager = new TokenManager(tokensPath, "client-id", "client-secret");
    const fiveMinutes = 5 * 60 * 1000;
    // Expires in 4 minutes — should be "expired" (within buffer)
    expect(manager.isExpired(Date.now() + fiveMinutes - 60_000)).toBe(true);
    // Expires in 6 minutes — should not be expired
    expect(manager.isExpired(Date.now() + fiveMinutes + 60_000)).toBe(false);
  });

  test("saveTokens writes tokens atomically", async () => {
    const manager = new TokenManager(tokensPath, "client-id", "client-secret");
    const tokens: TokenStore = {
      accessToken: "new-access",
      refreshToken: "new-refresh",
      expiresAt: Date.now() + 3600_000,
    };
    await manager.saveTokens(tokens);

    const saved = await Bun.file(tokensPath).json();
    expect(saved.accessToken).toBe("new-access");
  });

  test("refreshAccessToken calls Upwork token endpoint", async () => {
    const mockResponse = {
      access_token: "refreshed-access",
      refresh_token: "refreshed-refresh",
      expires_in: 86400,
    };

    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response(JSON.stringify(mockResponse), { status: 200 })),
    );

    const tokens: TokenStore = {
      accessToken: "old-access",
      refreshToken: "old-refresh",
      expiresAt: Date.now() - 1000,
    };
    await writeTokens(tokens);

    const manager = new TokenManager(tokensPath, "test-client-id", "test-client-secret");
    const refreshed = await manager.refreshAccessToken("old-refresh");

    expect(refreshed.accessToken).toBe("refreshed-access");
    expect(refreshed.refreshToken).toBe("refreshed-refresh");

    // Verify fetch was called with correct params
    const fetchMock = globalThis.fetch as ReturnType<typeof mock>;
    expect(fetchMock).toHaveBeenCalledTimes(1);

    globalThis.fetch = originalFetch;
  });

  test("refreshAccessToken throws on non-200 response", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response("Unauthorized", { status: 401 })),
    );

    const manager = new TokenManager(tokensPath, "client-id", "client-secret");
    await expect(manager.refreshAccessToken("bad-token")).rejects.toThrow();

    globalThis.fetch = originalFetch;
  });

  test("getValidToken refreshes expired token", async () => {
    // Set up an expired token
    const expired: TokenStore = {
      accessToken: "expired-access",
      refreshToken: "valid-refresh",
      expiresAt: Date.now() - 1000,
    };
    await writeTokens(expired);

    const mockResponse = {
      access_token: "new-access",
      refresh_token: "new-refresh",
      expires_in: 86400,
    };

    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response(JSON.stringify(mockResponse), { status: 200 })),
    );

    const manager = new TokenManager(tokensPath, "client-id", "client-secret");
    const token = await manager.getValidToken();
    expect(token).toBe("new-access");

    globalThis.fetch = originalFetch;
  });

  test("getValidToken returns existing token when not expired", async () => {
    const valid: TokenStore = {
      accessToken: "valid-access",
      refreshToken: "valid-refresh",
      expiresAt: Date.now() + 3600_000,
    };
    await writeTokens(valid);

    const manager = new TokenManager(tokensPath, "client-id", "client-secret");
    const token = await manager.getValidToken();
    expect(token).toBe("valid-access");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/auth/oauth.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

Create `src/auth/oauth.ts`:

```typescript
import { mkdir } from "fs/promises";
import { dirname } from "path";
import type { TokenStore } from "../types.ts";

const EXPIRY_BUFFER_MS = 5 * 60 * 1000; // 5 minutes
const TOKEN_ENDPOINT = "https://www.upwork.com/api/v3/oauth2/token";

export class TokenManager {
  constructor(
    private readonly tokensPath: string,
    private readonly clientId: string,
    private readonly clientSecret: string,
  ) {}

  async loadTokens(): Promise<TokenStore> {
    const file = Bun.file(this.tokensPath);
    if (!(await file.exists())) {
      throw new Error(
        `Token file not found at ${this.tokensPath}. Run 'bun run setup' first.`,
      );
    }
    return await file.json();
  }

  async saveTokens(tokens: TokenStore): Promise<void> {
    await mkdir(dirname(this.tokensPath), { recursive: true });
    const tempPath = this.tokensPath + ".tmp";
    await Bun.write(tempPath, JSON.stringify(tokens, null, 2));
    const { rename } = await import("fs/promises");
    await rename(tempPath, this.tokensPath);
  }

  isExpired(expiresAt: number): boolean {
    return Date.now() + EXPIRY_BUFFER_MS >= expiresAt;
  }

  async refreshAccessToken(refreshToken: string): Promise<TokenStore> {
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: this.clientId,
      client_secret: this.clientSecret,
    });

    const response = await fetch(TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Token refresh failed (${response.status}): ${text}`);
    }

    const data = await response.json();
    const tokens: TokenStore = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: Date.now() + data.expires_in * 1000,
    };

    await this.saveTokens(tokens);
    return tokens;
  }

  async getValidToken(): Promise<string> {
    const tokens = await this.loadTokens();

    if (!this.isExpired(tokens.expiresAt)) {
      return tokens.accessToken;
    }

    const refreshed = await this.refreshAccessToken(tokens.refreshToken);
    return refreshed.accessToken;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/auth/oauth.test.ts`
Expected: PASS (all 7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/auth/oauth.ts tests/auth/oauth.test.ts
git commit -m "feat: add OAuth token manager with refresh and atomic persistence"
```

---

### Task 9: Search Client Module

**Files:**
- Create: `src/search/client.ts`
- Test: `tests/search/client.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/search/client.test.ts`:

```typescript
import { describe, test, expect, mock, afterEach } from "bun:test";
import { UpworkSearchClient } from "../../src/search/client.ts";
import type {
  UpworkJobPosting,
  MarketplaceJobPostingsResponse,
  SearchConfig,
  SearchFilters,
} from "../../src/types.ts";

function makeJobNode(overrides: Partial<UpworkJobPosting> = {}): UpworkJobPosting {
  return {
    id: "1",
    ciphertext: "~01abc123",
    title: "Test Job",
    description: "A test job posting",
    publishedDateTime: "2026-04-09T14:30:00Z",
    hourlyBudgetMin: 60,
    hourlyBudgetMax: 120,
    budget: null,
    experienceLevel: "Expert",
    duration: "1 to 3 months",
    workload: "30+ hrs/week",
    skills: [{ name: "React" }],
    client: {
      totalHires: 5,
      totalSpent: 10000,
      totalReviews: 3,
      location: { country: "United States" },
    },
    occupations: [{ category: "Web Development" }],
    ...overrides,
  };
}

function makeApiResponse(
  jobs: UpworkJobPosting[],
  hasNextPage = false,
  endCursor: string | null = null,
): MarketplaceJobPostingsResponse {
  return {
    data: {
      marketplaceJobPostings: {
        totalCount: jobs.length,
        edges: jobs.map((node) => ({ node })),
        pageInfo: { hasNextPage, endCursor },
      },
    },
  };
}

const testFilters: SearchFilters = {
  experienceLevel: "EXPERT",
  hourlyBudgetMin: 50,
  jobType: ["HOURLY", "FIXED"],
  clientHiresCount_gte: 1,
  postedWithin: "24h",
};

describe("UpworkSearchClient", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    mock.restore();
  });

  test("fetchJobs returns jobs from API", async () => {
    const job = makeJobNode();
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response(JSON.stringify(makeApiResponse([job])), { status: 200 })),
    );

    const client = new UpworkSearchClient("https://api.example.com/graphql", "token-123");
    const search: SearchConfig = { terms: ["React"], category: "Web Development" };
    const jobs = await client.fetchJobs(search, testFilters);

    expect(jobs).toHaveLength(1);
    expect(jobs[0].ciphertext).toBe("~01abc123");
  });

  test("fetchJobs paginates up to max 2 pages", async () => {
    const job1 = makeJobNode({ id: "1", ciphertext: "~01" });
    const job2 = makeJobNode({ id: "2", ciphertext: "~02" });

    let callCount = 0;
    globalThis.fetch = mock(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve(
          new Response(JSON.stringify(makeApiResponse([job1], true, "cursor1")), { status: 200 }),
        );
      }
      return Promise.resolve(
        new Response(JSON.stringify(makeApiResponse([job2], false)), { status: 200 }),
      );
    });

    const client = new UpworkSearchClient("https://api.example.com/graphql", "token-123");
    const search: SearchConfig = { terms: ["React"], category: "Web Development" };
    const jobs = await client.fetchJobs(search, testFilters);

    expect(jobs).toHaveLength(2);
    expect(callCount).toBe(2);
  });

  test("fetchJobs throws on API error", async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response("Server Error", { status: 500 })),
    );

    const client = new UpworkSearchClient("https://api.example.com/graphql", "token-123");
    const search: SearchConfig = { terms: ["React"], category: "Web Development" };
    await expect(client.fetchJobs(search, testFilters)).rejects.toThrow("500");
  });

  test("filterJobs removes jobs below budget minimum", () => {
    const cheapJob = makeJobNode({ hourlyBudgetMax: 30 });
    const goodJob = makeJobNode({ hourlyBudgetMax: 80 });
    const fixedJob = makeJobNode({ hourlyBudgetMin: null, hourlyBudgetMax: null, budget: { amount: 5000 } });

    const client = new UpworkSearchClient("https://api.example.com/graphql", "token-123");
    const filtered = client.filterJobs([cheapJob, goodJob, fixedJob], testFilters);

    expect(filtered).toHaveLength(2);
    expect(filtered[0].hourlyBudgetMax).toBe(80);
    expect(filtered[1].budget?.amount).toBe(5000);
  });

  test("filterJobs removes jobs with zero client hires when filter requires >= 1", () => {
    const noHires = makeJobNode({ client: { totalHires: 0, totalSpent: 0, totalReviews: 0, location: null } });
    const hasHires = makeJobNode();

    const client = new UpworkSearchClient("https://api.example.com/graphql", "token-123");
    const filtered = client.filterJobs([noHires, hasHires], testFilters);

    expect(filtered).toHaveLength(1);
    expect(filtered[0].client?.totalHires).toBe(5);
  });

  test("filterJobs keeps jobs with null client (no data to filter on)", () => {
    const nullClient = makeJobNode({ client: null });

    const client = new UpworkSearchClient("https://api.example.com/graphql", "token-123");
    const filtered = client.filterJobs([nullClient], testFilters);

    expect(filtered).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/search/client.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

Create `src/search/client.ts`:

```typescript
import { SEARCH_JOBS_QUERY, buildQueryVariables } from "./queries.ts";
import type {
  UpworkJobPosting,
  MarketplaceJobPostingsResponse,
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

      const data: MarketplaceJobPostingsResponse = await response.json();
      const { edges, pageInfo } = data.data.marketplaceJobPostings;

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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/search/client.test.ts`
Expected: PASS (all 6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/search/client.ts tests/search/client.test.ts
git commit -m "feat: add search client with pagination and client-side filtering"
```

---

### Task 10: Auth Setup (Interactive OAuth Flow)

**Files:**
- Create: `src/auth/setup.ts`

No tests — this is an interactive script that opens a browser and starts a local HTTP server. It's verified manually as described in the spec's Verification section.

- [ ] **Step 1: Create src/auth/setup.ts**

```typescript
import { getConfig } from "../config.ts";
import { TokenManager } from "./oauth.ts";
import type { TokenStore } from "../types.ts";

const config = getConfig();

const authUrl = new URL("https://www.upwork.com/ab/account-security/oauth2/authorize");
authUrl.searchParams.set("response_type", "code");
authUrl.searchParams.set("client_id", config.clientId);
authUrl.searchParams.set("redirect_uri", config.redirectUri);

console.log("Opening browser for Upwork OAuth authorization...");
console.log(`URL: ${authUrl.toString()}\n`);

// Open browser
const proc = Bun.spawn(["open", authUrl.toString()]);
await proc.exited;

// Start local callback server
const server = Bun.serve({
  port: 3000,
  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname !== "/callback") {
      return new Response("Not found", { status: 404 });
    }

    const code = url.searchParams.get("code");
    if (!code) {
      return new Response("Missing authorization code", { status: 400 });
    }

    console.log("Received authorization code. Exchanging for tokens...");

    try {
      // Exchange code for tokens
      const body = new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: config.redirectUri,
        client_id: config.clientId,
        client_secret: config.clientSecret,
      });

      const response = await fetch("https://www.upwork.com/api/v3/oauth2/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Token exchange failed (${response.status}): ${text}`);
      }

      const data = await response.json();
      const tokens: TokenStore = {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresAt: Date.now() + data.expires_in * 1000,
      };

      const manager = new TokenManager(config.tokensPath, config.clientId, config.clientSecret);
      await manager.saveTokens(tokens);

      console.log(`\nTokens saved to ${config.tokensPath}`);
      console.log("Setup complete! You can now run: bun run search");

      // Shut down server after short delay
      setTimeout(() => {
        server.stop();
        process.exit(0);
      }, 1000);

      return new Response(
        "<html><body><h1>Authorization successful!</h1><p>You can close this tab.</p></body></html>",
        { headers: { "Content-Type": "text/html" } },
      );
    } catch (error) {
      console.error("Setup failed:", error);
      server.stop();
      process.exit(1);
      return new Response("Setup failed", { status: 500 });
    }
  },
});

console.log(`Waiting for callback on ${config.redirectUri}...`);
```

- [ ] **Step 2: Commit**

```bash
git add src/auth/setup.ts
git commit -m "feat: add interactive OAuth setup flow"
```

---

### Task 11: Main Orchestrator

**Files:**
- Create: `src/main.ts`
- Test: `tests/main.test.ts`

- [ ] **Step 1: Write the failing integration test**

Create `tests/main.test.ts`:

```typescript
import { describe, test, expect, mock, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, readdir } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import type { MarketplaceJobPostingsResponse, UpworkJobPosting } from "../src/types.ts";

function makeJobNode(overrides: Partial<UpworkJobPosting> = {}): UpworkJobPosting {
  return {
    id: "1",
    ciphertext: "~01abc123",
    title: "Senior React Developer",
    description: "Build amazing things.",
    publishedDateTime: "2026-04-09T14:30:00Z",
    hourlyBudgetMin: 80,
    hourlyBudgetMax: 150,
    budget: null,
    experienceLevel: "Expert",
    duration: "1 to 3 months",
    workload: "30+ hrs/week",
    skills: [{ name: "React" }],
    client: {
      totalHires: 5,
      totalSpent: 10000,
      totalReviews: 3,
      location: { country: "United States" },
    },
    occupations: [{ category: "Web Development" }],
    ...overrides,
  };
}

function makeApiResponse(jobs: UpworkJobPosting[]): MarketplaceJobPostingsResponse {
  return {
    data: {
      marketplaceJobPostings: {
        totalCount: jobs.length,
        edges: jobs.map((node) => ({ node })),
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    },
  };
}

describe("main: runSearchCycle", () => {
  let tempDir: string;
  let outputDir: string;
  let dataDir: string;
  const originalFetch = globalThis.fetch;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "main-test-"));
    outputDir = join(tempDir, "output");
    dataDir = join(tempDir, "data");
  });

  afterEach(async () => {
    globalThis.fetch = originalFetch;
    mock.restore();
    await rm(tempDir, { recursive: true, force: true });
  });

  test("full pipeline: fetches jobs, deduplicates, writes markdown", async () => {
    const job1 = makeJobNode({ id: "1", ciphertext: "~01abc" });
    const job2 = makeJobNode({ id: "2", ciphertext: "~02def", title: "Rails Engineer" });

    globalThis.fetch = mock(() =>
      Promise.resolve(
        new Response(JSON.stringify(makeApiResponse([job1, job2])), { status: 200 }),
      ),
    );

    // Import after mocking
    const { runSearchCycle } = await import("../src/main.ts");

    const profilePath = join(tempDir, "profile.yaml");
    await Bun.write(
      profilePath,
      `
searches:
  - terms: ["React"]
    category: "Web Development"
filters:
  experienceLevel: "EXPERT"
  hourlyBudgetMin: 50
  jobType: ["HOURLY"]
  clientHiresCount_gte: 1
  postedWithin: "24h"
`,
    );

    const result = await runSearchCycle({
      accessToken: "test-token",
      apiBaseUrl: "https://api.example.com/graphql",
      outputDir,
      seenJobsPath: join(dataDir, "seen-jobs.json"),
      searchProfilePath: profilePath,
    });

    expect(result.saved).toBe(2);
    expect(result.skippedDuplicates).toBe(0);

    // Verify markdown files written
    const files = await readdir(outputDir);
    expect(files).toHaveLength(2);
    expect(files.some((f) => f.includes("~01abc"))).toBe(true);
    expect(files.some((f) => f.includes("~02def"))).toBe(true);

    // Verify file content has frontmatter
    const content = await Bun.file(join(outputDir, files[0])).text();
    expect(content).toContain("source: upwork-api");
  });

  test("skips already-seen jobs on second run", async () => {
    const job = makeJobNode({ id: "1", ciphertext: "~01abc" });

    globalThis.fetch = mock(() =>
      Promise.resolve(
        new Response(JSON.stringify(makeApiResponse([job])), { status: 200 }),
      ),
    );

    const { runSearchCycle } = await import("../src/main.ts");

    const profilePath = join(tempDir, "profile.yaml");
    await Bun.write(
      profilePath,
      `
searches:
  - terms: ["React"]
    category: "Web Development"
filters:
  experienceLevel: "EXPERT"
  hourlyBudgetMin: 50
  jobType: ["HOURLY"]
  clientHiresCount_gte: 1
  postedWithin: "24h"
`,
    );

    const opts = {
      accessToken: "test-token",
      apiBaseUrl: "https://api.example.com/graphql",
      outputDir,
      seenJobsPath: join(dataDir, "seen-jobs.json"),
      searchProfilePath: profilePath,
    };

    // First run
    const run1 = await runSearchCycle(opts);
    expect(run1.saved).toBe(1);

    // Second run — same job should be skipped
    const run2 = await runSearchCycle(opts);
    expect(run2.saved).toBe(0);
    expect(run2.skippedDuplicates).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/main.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

Create `src/main.ts`:

```typescript
import { join } from "path";
import { mkdir } from "fs/promises";
import { getConfig } from "./config.ts";
import { TokenManager } from "./auth/oauth.ts";
import { UpworkSearchClient } from "./search/client.ts";
import { loadSearchProfile } from "./search/profile.ts";
import { DeduplicationState } from "./dedup/state.ts";
import { jobToMarkdown, sanitizeFilename } from "./transform/markdown.ts";
import type { UpworkJobPosting } from "./types.ts";

export interface RunOptions {
  accessToken: string;
  apiBaseUrl: string;
  outputDir: string;
  seenJobsPath: string;
  searchProfilePath: string;
}

export interface RunResult {
  saved: number;
  skippedDuplicates: number;
  skippedFiltered: number;
  totalFetched: number;
}

export async function runSearchCycle(options: RunOptions): Promise<RunResult> {
  const { accessToken, apiBaseUrl, outputDir, seenJobsPath, searchProfilePath } = options;

  // Load search profile
  const profile = await loadSearchProfile(searchProfilePath);

  // Load dedup state
  const dedup = new DeduplicationState(seenJobsPath);
  await dedup.load();

  // Create search client
  const client = new UpworkSearchClient(apiBaseUrl, accessToken);

  // Ensure output directory exists
  await mkdir(outputDir, { recursive: true });

  let totalFetched = 0;
  let saved = 0;
  let skippedDuplicates = 0;
  let skippedFiltered = 0;

  // Run all searches
  const allJobs = new Map<string, UpworkJobPosting>();

  for (const search of profile.searches) {
    const jobs = await client.fetchJobs(search, profile.filters);
    totalFetched += jobs.length;

    // Client-side filter
    const filtered = client.filterJobs(jobs, profile.filters);
    skippedFiltered += jobs.length - filtered.length;

    // Deduplicate within this run (same job can match multiple searches)
    for (const job of filtered) {
      if (!allJobs.has(job.ciphertext)) {
        allJobs.set(job.ciphertext, job);
      }
    }
  }

  // Write new jobs
  for (const [jobId, job] of allJobs) {
    if (dedup.hasSeen(jobId)) {
      skippedDuplicates++;
      continue;
    }

    const markdown = jobToMarkdown(job);
    const filename = sanitizeFilename(job.title, jobId);
    const filePath = join(outputDir, filename);

    await Bun.write(filePath, markdown);
    dedup.markSeen(jobId);
    saved++;
  }

  // Prune old entries and persist state
  dedup.prune(30);
  await dedup.save();

  return { saved, skippedDuplicates, skippedFiltered, totalFetched };
}

// CLI entry point — only runs when executed directly
const isMainModule = import.meta.main;
if (isMainModule) {
  try {
    const config = getConfig();
    const tokenManager = new TokenManager(config.tokensPath, config.clientId, config.clientSecret);
    const accessToken = await tokenManager.getValidToken();

    console.log("Starting Upwork job search...");
    const result = await runSearchCycle({
      accessToken,
      apiBaseUrl: config.apiBaseUrl,
      outputDir: config.outputDir,
      seenJobsPath: config.seenJobsPath,
      searchProfilePath: config.searchProfilePath,
    });

    console.log(
      `Done. Fetched: ${result.totalFetched}, Saved: ${result.saved}, ` +
        `Duplicates: ${result.skippedDuplicates}, Filtered: ${result.skippedFiltered}`,
    );
  } catch (error) {
    console.error("Search cycle failed:", error);
    process.exit(1);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/main.test.ts`
Expected: PASS (all 2 tests).

- [ ] **Step 5: Run full test suite**

Run: `bun test`
Expected: All tests pass across all modules.

- [ ] **Step 6: Commit**

```bash
git add src/main.ts tests/main.test.ts
git commit -m "feat: add main orchestrator with full pipeline integration"
```

---

### Task 12: launchd Plist and Final Configuration

**Files:**
- Create: `com.ihoka.upwork-search.plist`

No tests — this is a macOS system configuration file verified manually.

- [ ] **Step 1: Create com.ihoka.upwork-search.plist**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.ihoka.upwork-search</string>
    <key>ProgramArguments</key>
    <array>
        <string>/Users/ihoka/.bun/bin/bun</string>
        <string>run</string>
        <string>/Users/ihoka/ihoka/upwork-search/src/main.ts</string>
    </array>
    <key>StartInterval</key>
    <integer>21600</integer>
    <key>StandardOutPath</key>
    <string>/Users/ihoka/ihoka/upwork-search/logs/stdout.log</string>
    <key>StandardErrorPath</key>
    <string>/Users/ihoka/ihoka/upwork-search/logs/stderr.log</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/Users/ihoka/.bun/bin:/usr/local/bin:/usr/bin:/bin</string>
    </dict>
    <key>RunAtLoad</key>
    <true/>
    <key>WorkingDirectory</key>
    <string>/Users/ihoka/ihoka/upwork-search</string>
</dict>
</plist>
```

- [ ] **Step 2: Verify full test suite**

Run: `bun test`
Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add com.ihoka.upwork-search.plist
git commit -m "chore: add launchd plist for 6-hour scheduled execution"
```

---

## Post-Implementation Verification

After all tasks are complete, verify end-to-end:

1. `bun test` — all tests pass
2. `bun run setup` — completes OAuth flow (requires Upwork API credentials in `.env`)
3. `bun run search` — fetches jobs and writes markdown to output directory
4. Run `bun run search` twice — verify no duplicate files
5. Inspect output markdown files — valid frontmatter, correct structure
