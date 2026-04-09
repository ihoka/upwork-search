# Upwork Job Search Automation — Design Spec

## Context

Istvan has an existing Claude Code skill (`/upwork-triage`) that scores and drafts proposals for Upwork job postings saved as markdown in his Obsidian vault. Currently, jobs arrive only via manual web clipping or Upwork email notifications — meaning good-fit jobs are missed. This project automates the discovery side: a scheduled service that queries the Upwork GraphQL API, filters for relevant jobs, and writes structured markdown files into the Obsidian inbox for the triage skill to process.

## Goals

- Automatically discover Upwork jobs matching a freelancer's profile (stack, domains, rate)
- Run on a configurable schedule via macOS launchd
- Output structured markdown files to a configurable output directory
- Deduplicate across runs so jobs aren't saved twice
- Require zero ongoing maintenance — search criteria derived from profile config
- Open source — configurable for any freelancer's stack and preferences

## Non-Goals

- Automated proposal submission (violates Upwork ToS)
- Web dashboard or monitoring UI
- Multi-platform support (Upwork only)
- Real-time/push notifications

## Stack

- **Runtime:** Bun (native TypeScript, built-in test runner, native fetch)
- **API:** Upwork GraphQL API (`marketplaceJobPostings` query)
- **Auth:** OAuth 2.0 (authorization code grant)
- **Scheduling:** macOS launchd (6-hour interval)
- **Output:** Markdown files to configurable output directory (default: `~/Documents/Obsidian/Personal/+Inbox/Upwork/`)
- **State:** JSON file for dedup tracking

## Project Structure

```
~/ihoka/upwork-search/
├── src/
│   ├── auth/
│   │   ├── oauth.ts               # Token acquisition, refresh, storage
│   │   └── setup.ts               # One-time interactive OAuth setup flow
│   ├── search/
│   │   ├── client.ts              # GraphQL client, request handling
│   │   ├── queries.ts             # marketplaceJobPostings query + types
│   │   └── profile.ts             # Search criteria derived from profile config
│   ├── transform/
│   │   └── markdown.ts            # API response → structured markdown
│   ├── dedup/
│   │   └── state.ts               # JSON file tracking seen job IDs
│   ├── config.ts                  # Env vars, paths, constants
│   └── main.ts                    # Entry point: orchestrates fetch cycle
├── tests/                         # Unit tests (mirrors src/ structure)
│   ├── auth/
│   │   └── oauth.test.ts
│   ├── search/
│   │   ├── client.test.ts
│   │   ├── queries.test.ts
│   │   └── profile.test.ts
│   ├── transform/
│   │   └── markdown.test.ts
│   └── dedup/
│       └── state.test.ts
├── data/
│   └── seen-jobs.json             # Persisted dedup state
├── logs/                          # launchd stdout/stderr logs
├── search-profile.yaml            # Search criteria config
├── .env                           # API keys, vault path
├── .env.example                   # Template without secrets
├── bunfig.toml
├── tsconfig.json
├── package.json
├── .gitignore
├── README.md
└── com.ihoka.upwork-search.plist  # launchd schedule definition
```

## Authentication

### Initial Setup (One-Time)

```
bun run setup
```

1. Reads client ID and client secret from `.env`
2. Opens browser to Upwork OAuth2 authorization URL
3. Starts temporary local HTTP server on `http://localhost:3000/callback`
4. User grants permission on Upwork, browser redirects back with auth code
5. Exchanges authorization code for access token + refresh token
6. Stores tokens in `data/tokens.json`

### Token Lifecycle

- Access tokens expire in ~24 hours
- Before each run: check `expiresAt`, if within 5-minute buffer, refresh
- On refresh: persist new access token + refresh token (rotated on use)
- If refresh fails (revoked/expired): log error, exit with non-zero code

### Token Storage

```typescript
// data/tokens.json (gitignored)
interface TokenStore {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;  // Unix timestamp
}
```

Separate from `.env` so tokens can be refreshed without rewriting config. Written atomically (write to temp file, then rename).

## Search Strategy

### Profile-Based Search Criteria

Search terms derived from the scoring rubric's known stack and domain expertise. Stored in `search-profile.yaml`:

```yaml
searches:
  # Domain expertise (highest value — +10 boost in scoring)
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

  # AI/ML (+5 boost in scoring)
  - terms: ["AI", "LLM", "machine learning"]
    category: "Web Development"

filters:
  experienceLevel: "EXPERT"
  hourlyBudgetMin: 50            # Matches triage auto-skip threshold
  jobType: ["HOURLY", "FIXED"]
  clientHiresCount_gte: 1        # At least one past hire
  postedWithin: "24h"            # Recent posts only (overlaps 6h window for safety)
```

### GraphQL Query

```graphql
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
```

### Execution Per Run

- Iterate through all search configs (~7 queries)
- For each: execute query, paginate if needed (max 2 pages per search)
- ~10-15 API requests per run, well within 10 req/sec rate limit
- Each run completes in a few seconds

### Client-Side Filtering

Community reports indicate some Upwork API filter fields are buggy. As a fallback, apply filters client-side after fetching:

- **Budget check:** Skip jobs where max hourly rate < $50 (auto-skip threshold)
- **Stack match:** Check job title, description, and skills array against known stack
- **Experience level:** Verify expert level if API filter didn't apply

This is more reliable than relying solely on server-side filters and lets us apply our own scoring rubric logic early.

## Markdown Output Format

Structured format distinct from web-clipped files, with a `source: upwork-api` field for format detection:

```markdown
---
source: upwork-api
upwork_job_id: "~01abc123def456"
upwork_fetched: 2026-04-09
upwork_url: "https://www.upwork.com/jobs/~01abc123def456"
---

#### Senior React/TypeScript Developer for SaaS Platform

**Posted:** 2026-04-09T14:30:00Z

**Worldwide**

**Summary**

[Full job description from API]

- **30+ hrs/week**
    Hourly
- **1 to 3 months**
    Duration
- **Expert**
    Experience Level
- **$60.00 - $120.00**
    Hourly

**Skills:** React, TypeScript, Node.js, PostgreSQL

**Client History**
- Total hires: 12
- Total spent: $45,000
- Total reviews: 8
- Location: United States

##### Activity on this job

- Proposals: not available
- Interviewing: not available
```

### Format Decisions

- `source: upwork-api` frontmatter lets triage skill detect format and parse structured fields directly
- Mirrors web-clipper heading structure (`####` title, `**Summary**`, activity section) for visual consistency in Obsidian
- Fields the API doesn't provide (proposal count, bid range, interviewing) marked "not available" — scoring rubric already handles missing data (Competition Level defaults to 5)
- `upwork_job_id` enables dedup and URL construction
- Filename: sanitized job title + job ID suffix (e.g., `Senior React Developer - ~01abc123.md`)

## Dedup & State Management

### State File

```json
// data/seen-jobs.json
{
  "~01abc123def456": "2026-04-09T08:00:00Z",
  "~01xyz789ghi012": "2026-04-09T08:00:00Z"
}
```

### Logic

- Before saving a markdown file, check if job ID exists in `seen-jobs.json`
- After saving, add job ID with current timestamp
- On each run, prune entries older than 30 days (jobs that old have expired on Upwork)
- Atomic writes: write to temp file then rename to prevent corruption on crash

No database needed — expected volume is 50-200 jobs per day across all searches.

## Scheduling with launchd

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

- **StartInterval:** 21600 seconds (6 hours)
- **RunAtLoad:** Runs immediately when loaded (first fetch on install)
- **Logs:** stdout/stderr in project `logs/` directory
- **Sleep handling:** If laptop is asleep at scheduled time, launchd runs on wake
- **Install:** `cp com.ihoka.upwork-search.plist ~/Library/LaunchAgents/ && launchctl load ~/Library/LaunchAgents/com.ihoka.upwork-search.plist`

## Triage Skill Update

One change needed to the existing `/upwork-triage` skill's parsing step in `SKILL.md`:

When processing a file, check for `source: upwork-api` in frontmatter. If present:
- Read `upwork_job_id`, `upwork_url`, `upwork_fetched` directly from frontmatter
- Parse structured fields from the known markdown layout (more reliable than web-clipper heuristic parsing)
- Client history fields are already in a parseable format

If `source` is absent or not `upwork-api`, fall back to the existing web-clipper parsing logic.

## End-to-End Flow

```
[Every 6 hours — launchd]
        │
        ▼
  1. Refresh OAuth token if needed
        │
        ▼
  2. Run 7 profile-based GraphQL queries
        │
        ▼
  3. Client-side filter (budget, stack, experience)
        │
        ▼
  4. Dedup against seen-jobs.json
        │
        ▼
  5. Transform → structured markdown files
        │
        ▼
  6. Write to ~/Documents/Obsidian/Personal/+Inbox/Upwork/
        │
        ▼
  [User runs /upwork-triage when ready]
        │
        ▼
  7. Score, verdict, draft proposals
```

## Testing Strategy

- **Unit tests** for each module using `bun:test`
- **Auth:** Mock OAuth endpoints, test token refresh logic, expiry detection, error paths (revoked token, network failure)
- **Search:** Mock GraphQL responses, test query construction, pagination, client-side filtering
- **Transform:** Snapshot tests for markdown generation from known API responses
- **Dedup:** Test state file read/write, pruning, atomic writes, concurrent access safety
- **Integration test:** Full pipeline with mocked API — verify end-to-end from API response to markdown file on disk

## Prerequisites

1. Register for Upwork API key at the [Upwork API Center](https://www.upwork.com/developer)
2. Request `marketplace` scope (for job search access)
3. Set redirect URI to `http://localhost:3000/callback`
4. Run `bun run setup` to complete OAuth flow
5. Verify with `bun run src/main.ts` before installing launchd plist

## Verification

1. Run `bun test` — all unit tests pass
2. Run `bun run setup` — completes OAuth flow, tokens saved
3. Run `bun run src/main.ts` — fetches jobs, writes markdown to Obsidian vault
4. Verify markdown files are valid: frontmatter parseable, structure matches spec
5. Run `/upwork-triage` on API-sourced files — scoring works, proposals generated
6. Install launchd plist — verify it runs on load and on schedule
7. Run twice — verify no duplicate files created
