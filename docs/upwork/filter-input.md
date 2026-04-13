# Filter input — `MarketplaceJobFilter`

The full type has ~40 fields. Only the ones this project uses (or might use) are listed here. See `docs/Upwork API Documentation.md:12804` for the complete list.

## Fields we use

| Input field | Type | Notes |
|---|---|---|
| `searchExpression_eq` | `String` | Generic search filter; supports partial Lucene syntax. This project joins `search.terms` with spaces and passes as-is (implicit AND). |
| `experienceLevel_eq` | `ExperienceLevel` enum | `ENTRY_LEVEL` \| `INTERMEDIATE` \| `EXPERT`. |
| `daysPosted_eq` | `Int` | "Number of days. Constrains the search to jobs posted within last N days". Project maps `postedWithin: "24h"` → `1`. |
| `clientHiresRange_eq` | `IntRange` | `{ rangeStart, rangeEnd }`. Project uses `{ rangeStart: N }` to express "≥ N client hires". |
| `pagination_eq` | `Pagination` | `{ first: Int!, after: String }`. Required for paging; `after` comes from `pageInfo.endCursor` of the previous page. |

## Fields we deliberately don't use

| Field | Why not |
|---|---|
| `categoryIds_any: [ID!]` | Takes Upwork category UIDs, not human names. Config uses `"Web Development"`-style names. Looking up IDs via `ontologyCategories` is out of scope for this phase. `search-profile.yaml`'s `category` key is informational only. |
| `jobType_eq: ContractType` | Takes a single value (`HOURLY` or `FIXED`). Our config lists both, which effectively means "don't filter by job type". |
| `searchTerm_eq: SearchTerm` | More structured than `searchExpression_eq` (andTerms_all, orTerms_any, etc.), but `searchExpression_eq` is simpler and matches existing behavior. Ignored when `searchExpression_eq` is set, per the docs. |
| `ontologySkillIds_all`, `occupationIds_any` | Need Upwork ontology UIDs (not the skill names in our config). |
| Location / enterprise / PTC / budget-range filters | Not in the project scope. |

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
