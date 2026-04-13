# Relevant enum values

## `FreelancerProfileExperienceLevel` (on `node.experienceLevel`)

`NONE`, `ENTRY_LEVEL`, `INTERMEDIATE`, `EXPERT`.

## `ExperienceLevel` (filter input `experienceLevel_eq`)

`ENTRY_LEVEL`, `INTERMEDIATE`, `EXPERT`.

> Note: the filter enum has no `NONE`, but the node enum does.

## `JobDuration` (on `node.duration` and filter `duration_any`)

`WEEK`, `MONTH`, `QUARTER`, `SEMESTER`, `ONGOING`.

## `ContractType` (filter `jobType_eq`)

`HOURLY`, `FIXED`.

## `EngagementType` (filter `workload_eq`; unused here)

`FULL_TIME`, `PART_TIME`, `AS_NEEDED`, `NOT_SURE`.

## `MarketplaceJobPostingSearchSortField` (inside `sortAttributes`)

`RECENCY`, `RELEVANCE`, `CLIENT_TOTAL_CHARGE`, `CLIENT_RATING`.

Sort attribute shape: `{ field: <enum> }` — there is no `sortOrder`.

## `MarketplaceJobPostingSearchType` (query argument `searchType`)

`USER_JOBS_SEARCH` (only value that actually works; others are "No longer supported" per docs).

## `JobPostingHourlyBudgetType` (on `node.hourlyBudgetType`; unused here)

`DEFAULT`, `MANUAL`, `NOT_PROVIDED`.
