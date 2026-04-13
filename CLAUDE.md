# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Automated Upwork job discovery service. Queries the Upwork GraphQL API on a schedule, filters jobs matching a freelancer's profile, deduplicates across runs, and saves structured markdown files to an Obsidian vault for downstream triage by the `/upwork-triage` skill.

## Commands

```bash
bun install          # Install dependencies
bun test             # Run all tests
bun test --watch     # Run tests in watch mode
bun test tests/search/client.test.ts  # Run a single test file
bun run search       # Run a single search cycle
bun run setup        # One-time OAuth2 setup (opens browser)
```

## Architecture

**Runtime:** Bun (TypeScript, built-in test runner, native fetch)

**Pipeline per run:** Refresh OAuth token → Execute ~7 GraphQL queries from `search-profile.yaml` → Client-side filter (budget/stack/experience) → Dedup against `data/seen-jobs.json` → Transform to markdown → Write to output directory.

**Key modules (`src/`):**
- `auth/` — OAuth2 token acquisition, refresh, and storage (`data/tokens.json`). Tokens refresh automatically when within 5-min expiry buffer.
- `search/` — GraphQL client hitting Upwork's `marketplaceJobPostingsSearch` query. Search criteria loaded from `search-profile.yaml`. Paginates max 2 pages per search.
- `transform/` — Converts API responses to markdown with YAML frontmatter (`source: upwork-api` distinguishes these from web-clipped files).
- `dedup/` — JSON state file (`data/seen-jobs.json`) mapping job IDs to timestamps. Prunes entries older than 30 days. Uses atomic writes (temp file + rename).
- `config.ts` — Env vars and path constants.
- `main.ts` — Entry point orchestrating the full fetch cycle.

**Scheduling:** macOS launchd plist (`com.ihoka.upwork-search.plist`) runs every 6 hours. Logs to `logs/`.

## Output Format

Markdown files with YAML frontmatter containing `source: upwork-api`, `upwork_job_id`, `upwork_fetched`, `upwork_url`. Filename: sanitized title + job ID suffix (e.g., `Senior React Developer - ~01abc123.md`).

## Testing

Uses `bun:test`. Tests mirror `src/` structure under `tests/`. API calls are mocked — auth mocks OAuth endpoints, search mocks GraphQL responses, transform uses snapshot tests.

## Configuration

- `.env` — API credentials (`UPWORK_CLIENT_ID`, `UPWORK_CLIENT_SECRET`, `UPWORK_REDIRECT_URI`) and `OUTPUT_DIR`
- `search-profile.yaml` — Search terms, categories, and filters (experience level, budget minimum, job type, client hire count, recency)
