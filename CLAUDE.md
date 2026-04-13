# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Automated Upwork job discovery and triage service. Queries the Upwork GraphQL API on a schedule, filters jobs matching a freelancer's profile, deduplicates across runs, saves structured markdown files to an Obsidian vault, then spawns `claude` headlessly to run two skills sequentially: `/upwork-evaluate` (scores and assigns verdicts) and `/upwork-propose` (drafts cover letters for apply-verdict jobs).

## Commands

```bash
bun install          # Install dependencies
bun test             # Run all tests
bun test --watch     # Run tests in watch mode
bun test tests/search/client.test.ts   # Run a single test file
bun test tests/triage/runner.test.ts   # Run triage runner tests
bun run search       # Run a single search cycle
bun run setup        # One-time OAuth2 setup (opens browser)
```

## Architecture

**Runtime:** Bun (TypeScript, built-in test runner, native fetch)

**Pipeline per run:** Refresh OAuth token → Execute ~7 GraphQL queries from `search-profile.yaml` → Client-side filter (budget/stack/experience) → Dedup against `data/seen-jobs.json` → Transform to markdown → Write to output directory.

**Key modules (`src/`):**
- `auth/` — OAuth2 token acquisition, refresh, and storage (`data/tokens.json`). Tokens refresh automatically when within 5-min expiry buffer.
- `search/` — GraphQL client hitting Upwork's `marketplaceJobPostingsSearch` query. Search criteria loaded from `search-profile.yaml`. Fetches a single default page per search (~10 jobs) — Upwork's `pagination_eq` input crashes the resolver, see `docs/upwork/filter-input.md`.
- `transform/` — Converts API responses to markdown with YAML frontmatter (`source: upwork-api` distinguishes these from web-clipped files).
- `dedup/` — JSON state file (`data/seen-jobs.json`) mapping job IDs to timestamps. Prunes entries older than 30 days. Uses atomic writes (temp file + rename).
- `triage/` — Spawns `claude -p` headlessly to run `/upwork-evaluate` then `/upwork-propose` against newly written job files. Uses `Bun.spawn` with configurable timeout.
- `config.ts` — Env vars and path constants.
- `main.ts` — Entry point orchestrating the full fetch-then-triage cycle.

**Scheduling:** macOS launchd plist (`com.ihoka.upwork-search.plist`) runs every 6 hours. Logs to `logs/`.

## Output Format

Markdown files with YAML frontmatter containing `source: upwork-api`, `upwork_job_id`, `upwork_fetched`, `upwork_url`. Filename: sanitized title + job ID suffix (e.g., `Senior React Developer - ~01abc123.md`).

## Testing

Uses `bun:test`. Tests mirror `src/` structure under `tests/`. API calls are mocked — auth mocks OAuth endpoints, search mocks GraphQL responses, transform uses snapshot tests.

## Configuration

- `.env` — API credentials (`UPWORK_CLIENT_ID`, `UPWORK_CLIENT_SECRET`, `UPWORK_REDIRECT_URI`) and `OUTPUT_DIR`
- `search-profile.yaml` — Search terms, categories, and filters (experience level, budget minimum, job type, client hire count, recency)

## Triage

Two skills handle triage, run sequentially after each search cycle:
- `/upwork-evaluate` — scores jobs and assigns verdicts (`upwork_verdict` in frontmatter). Lives at `.claude/skills/upwork-evaluate/`.
- `/upwork-propose` — drafts cover letters for jobs where `upwork_verdict: apply` and no draft proposal exists yet. Lives at `.claude/skills/upwork-propose/`.

Both share `triage-profile.yaml` and are spawned via `runSkill()` in `src/triage/runner.ts`. Each invocation runs `claude -p` headlessly with `--permission-mode bypassPermissions` and scoped `--allowed-tools "Read,Write,Edit,Glob"` (no Bash, no network). The orchestrator passes `--add-dir` pointing to the output directory so the headless session can read and edit job files outside the project root.

**Configuration env vars:**
- `TRIAGE_ENABLED` — `true`/`false` (default: `true` if `triage-profile.yaml` exists on disk)
- `UPWORK_TRIAGE_PROFILE` — path to triage profile (default: `<project_root>/triage-profile.yaml`)
- `CLAUDE_BIN` — path to `claude` binary (default: `claude`)
- `TRIAGE_TIMEOUT_MS` — timeout in milliseconds (default: `600000` / 10 min)

**Profile:** Schema lives in `triage-profile.example.yaml` (committed); real values in `triage-profile.yaml` (gitignored).
