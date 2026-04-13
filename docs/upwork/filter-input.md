# Filter input — `MarketplaceJobPostingsSearchFilter`

Filter criteria for `marketplaceJobPostingsSearch`. Only the fields this project uses (or might use) are listed here; the full type has ~30 fields.

## Fields we use

| Input field | Type | Notes |
|---|---|---|
| `searchExpression_eq` | `String` | Generic search filter; supports partial Lucene syntax. This project joins `search.terms` with spaces and passes as-is (implicit AND). |
| `experienceLevel_eq` | `ExperienceLevel` | `ENTRY_LEVEL` \| `INTERMEDIATE` \| `EXPERT`. |
| `clientHiresRange_eq` | `IntRange` | `{ rangeStart, rangeEnd }`. Project uses `{ rangeStart: N }` to express "≥ N client hires". |

## Fields we deliberately don't use

| Field | Why not |
|---|---|
| `categoryIds_any: [ID!]` | Takes Upwork category UIDs, not human names. Config uses `"Web Development"`-style names. Looking up IDs via `ontologyCategories` is out of scope for this phase. `search-profile.yaml`'s `category` key is informational only. |
| `jobType_eq: ContractType` | Takes a single value (`HOURLY` or `FIXED`). Our config lists both, which effectively means "don't filter by job type". |
| `searchTerm_eq: SearchTerm` | More structured than `searchExpression_eq` (andTerms_all, orTerms_any, etc.), but `searchExpression_eq` is simpler and matches existing behavior. Ignored when `searchExpression_eq` is set, per the docs. |
| `skillExpression_eq: String`, `titleExpression_eq: String` | Narrower search fields. We lean on `searchExpression_eq` instead. |
| `ontologySkills_all`, `occupationIds_any`, `subcategoryIds_any` | Need Upwork ontology UIDs (not the skill names in our config). |
| `workload_eq`, `budgetRange_eq`, `hourlyRate_eq`, `proposalRange_eq` | Not in the project scope; some overlap with client-side filtering we already do. |
| `verifiedPaymentOnly_eq`, `previousClients_eq`, `enterpriseOnly_eq`, `ptcIds_any`, `ptcOnly_eq` | Client-reputation / talent-cloud filters outside scope. |
| `locations_any`, `timezone_eq`, `area_eq`, `userLocationMatch_eq`, `visitorCountry_eq` | Location filters; not needed. |
| `preserveFacet_eq` | Pagination/faceting control; not needed. |

## `pagination_eq` is broken server-side

The schema declares `pagination_eq: Pagination` where `Pagination` is `{ first: Int!, after: String }`. Introspection confirms the shape. **However**, any request whose filter contains `pagination_eq` — even a minimal `{ first: 1 }` — causes Upwork's resolver to throw a generic `500 "Exception occurred"` error (reproducible via `bun run search:debug`, variants V1/V5/V12–V17). Omitting `pagination_eq` entirely (V4/V18/V19) works and returns a default page of ~10 `edges` with `hasNextPage: true` in `pageInfo`.

Until Upwork fixes this, this project **does not send `pagination_eq`** and only consumes the server's default first page per search. The 6-hour cron cadence plus dedup across runs compensates for the reduced page size.

## No posted-within filter

`MarketplaceJobPostingsSearchFilter` **does not expose** any "posted within N days" field (no `daysPosted_eq`, no date range). The older `MarketplaceJobFilter` accepted `daysPosted_eq`, but the current schema doesn't. This project filters by recency **client-side** against each job's `publishedDateTime`, using `filters.daysPosted` derived from `search-profile.yaml`'s `postedWithin`.

## Related input types

### `IntRange`

```graphql
input IntRange {
  rangeStart: Int
  rangeEnd: Int
}
```

Supply either or both. `{ rangeStart: 1 }` means ≥ 1, with no upper bound.

### `Pagination`

```graphql
input Pagination {
  first: Int!     # required; max page size per call
  after: String   # optional cursor from the previous page's pageInfo.endCursor
}
```

### `SearchTerm` (unused — for reference only)

```graphql
input SearchTerm {
  andTerms_all: [String!]
  orTerms_any: [String!]
  exactTerms_any: [String!]
  excludeTerms_any: [String!]
}
```
