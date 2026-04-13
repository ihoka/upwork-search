# upwork-search

Automated Upwork job discovery. Queries the Upwork GraphQL API on a schedule, filters for jobs matching your profile, and saves them as structured markdown files.

Built to feed into a triage pipeline — you review and apply to jobs that matter, not scroll through hundreds of listings.

## How It Works

1. **Search** — Runs profile-based queries against the Upwork GraphQL API (skills, domains, budget thresholds)
2. **Filter** — Client-side filtering catches what the API misses (budget, stack match, experience level)
3. **Dedup** — Tracks seen job IDs so you never see the same posting twice
4. **Save** — Writes structured markdown files with YAML frontmatter to your output directory
5. **Schedule** — macOS launchd runs the whole thing every 6 hours automatically

## Prerequisites

- [Bun](https://bun.sh) runtime
- Upwork API key ([register here](https://www.upwork.com/developer))
- macOS (for launchd scheduling)

## Quick Start

```bash
# Clone and install
git clone https://github.com/ihoka/upwork-search.git
cd upwork-search
bun install

# Configure
cp .env.example .env
# Edit .env with your Upwork API credentials and output directory

# Authenticate with Upwork (one-time)
bun run setup

# Run manually
bun run search

# Run tests
bun test
```

## Configuration

### `.env`

```bash
UPWORK_CLIENT_ID=your_client_id
UPWORK_CLIENT_SECRET=your_client_secret
UPWORK_REDIRECT_URI=http://localhost:3000/callback
OUTPUT_DIR=~/Documents/Obsidian/Personal/+Inbox/Upwork
```

### Required API key scopes

Scopes on Upwork are configured **on the API key**, not requested in the authorize URL. If `bun run search` reports an error like:

> The client or authentication token doesn't have enough oauth2 permissions/scopes to access: [Money.currency, ...]

open the [Upwork API Center](https://www.upwork.com/developer/keys/), edit your key, and enable these scopes:

- **Common Entities - Read-Only Access** (required for all Upwork API calls)
- **Read marketplace Job Postings** (required for `marketplaceJobPostingsSearch` and its `Money` / `PageInfo` / nested fields)

After changing scopes, existing access tokens are invalidated — re-run `bun run setup` to obtain new ones. See [`docs/upwork/authentication-and-scopes.md`](docs/upwork/authentication-and-scopes.md) for more detail.

### `search-profile.yaml`

Define your search criteria — keywords, categories, and filters:

```yaml
searches:
  - terms: ["React", "TypeScript", "senior"]
    category: "Web Development"
  - terms: ["billing", "invoicing", "subscription"]
    category: "Web Development"

filters:
  experienceLevel: "EXPERT"
  hourlyBudgetMin: 50
  jobType: ["HOURLY", "FIXED"]
  clientHiresCount_gte: 1
  postedWithin: "24h"
```

## Scheduling

Install the launchd plist to run every 6 hours:

```bash
# Edit the plist to match your bun path and project directory
cp com.ihoka.upwork-search.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.ihoka.upwork-search.plist
```

Check logs:

```bash
tail -f logs/stdout.log
tail -f logs/stderr.log
```

Uninstall:

```bash
launchctl unload ~/Library/LaunchAgents/com.ihoka.upwork-search.plist
rm ~/Library/LaunchAgents/com.ihoka.upwork-search.plist
```

## Output Format

Each job is saved as a markdown file with structured frontmatter:

```markdown
---
source: upwork-api
upwork_job_id: "~01abc123def456"
upwork_fetched: 2026-04-09
upwork_url: "https://www.upwork.com/jobs/~01abc123def456"
---

#### Senior React/TypeScript Developer for SaaS Platform

**Posted:** 2026-04-09T14:30:00Z

**Summary**

[Job description]

- **30+ hrs/week**
    Hourly
- **Expert**
    Experience Level
- **$60.00 - $120.00**
    Hourly

**Skills:** React, TypeScript, Node.js, PostgreSQL

**Client History**
- Total hires: 12
- Total spent: $45,000
```

## Project Structure

```
src/
  auth/         # OAuth2 token management
  search/       # GraphQL client and query construction
  transform/    # API response to markdown conversion
  dedup/        # Duplicate detection via JSON state file
  config.ts     # Environment and path configuration
  main.ts       # Entry point
tests/          # Unit tests (mirrors src/)
data/           # Runtime state (tokens, seen jobs)
```

## Development

```bash
# Run tests
bun test

# Run tests in watch mode
bun test --watch

# Run a single search cycle
bun run search

# Run OAuth setup
bun run setup
```

## License

MIT
