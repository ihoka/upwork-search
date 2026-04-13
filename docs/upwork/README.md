# Upwork API — project-relevant digest

Source: `docs/Upwork API Documentation.md` (14K lines — the full Upwork GraphQL reference). This folder extracts only what this project needs.

## Endpoint

- GraphQL: `https://api.upwork.com/graphql`
- OAuth2 token: `https://www.upwork.com/api/v3/oauth2/token`
- Authorize: `https://www.upwork.com/ab/account-security/oauth2/authorize`

## Index

- [`authentication-and-scopes.md`](./authentication-and-scopes.md) — OAuth2 flow, where scopes are configured, required scopes for job search.
- [`query-job-search.md`](./query-job-search.md) — The `marketplaceJobPostingsSearch` query (the current, non-deprecated job-search entry point) and its arguments.
- [`filter-input.md`](./filter-input.md) — `MarketplaceJobFilter` input fields this project uses.
- [`job-node.md`](./job-node.md) — `MarketplaceJobPostingSearchResult` node shape and nested types (`Money`, client, occupations, skills, location).
- [`enums.md`](./enums.md) — Enum values for `ExperienceLevel`, `JobDuration`, `ContractType`, `EngagementType`, `MarketplaceJobPostingSearchSortField`, `MarketplaceJobPostingSearchType`, `JobPostingHourlyBudgetType`.

## What to ignore

The source doc covers applications, proposals, contracts, time tracking, reviews, custom fields, payments, etc. — **none of that is relevant here**. This service only reads the job-search endpoint.

## Rate limits

300 requests/minute/IP. Cache allowed up to 24h (ToS). This project stays well under that (7 queries × 2 pages every 6 hours).
