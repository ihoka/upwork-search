# Job search query

Use **`marketplaceJobPostingsSearch`**. The older `marketplaceJobPostings` query is marked deprecated:

> `marketplaceJobPostings` will be removed in future release. Please use `marketplaceJobPostingsSearch` instead.

## Required permission

`Read marketplace Job Postings`

## Arguments

| Name | Type | Notes |
|---|---|---|
| `marketPlaceJobFilter` | [`MarketplaceJobPostingsSearchFilter`](./filter-input.md) | Use `searchExpression_eq`, `experienceLevel_eq`, `clientHiresRange_eq`, `pagination_eq`, etc. Note the quirky mixed-case argument name (`marketPlaceJobFilter`) — that's Upwork's spelling. The filter has **no** posted-within field; filter by recency client-side against `publishedDateTime`. |
| `searchType` | `MarketplaceJobPostingSearchType` | Always pass `USER_JOBS_SEARCH`. Per the docs: "searchType value will be ignored and always set to USER_JOBS_SEARCH". |
| `sortAttributes` | `[MarketplaceJobPostingSearchSortAttribute]` | List of `{ field: <enum> }`. No `sortOrder` — sort direction is implicit per field. |

Returns [`MarketplaceJobPostingSearchConnection`](./job-node.md) with `totalCount`, `edges[].node`, and `pageInfo { hasNextPage endCursor }`.

## Canonical query example (from the Upwork docs)

```graphql
query marketplaceJobPostingsSearch(
  $marketPlaceJobFilter: MarketplaceJobPostingsSearchFilter,
  $searchType: MarketplaceJobPostingSearchType,
  $sortAttributes: [MarketplaceJobPostingSearchSortAttribute]
) {
  marketplaceJobPostingsSearch(
    marketPlaceJobFilter: $marketPlaceJobFilter,
    searchType: $searchType,
    sortAttributes: $sortAttributes
  ) {
    totalCount
    edges {
      ...MarketplaceJobpostingSearchEdgeFragment
    }
    pageInfo {
      ...PageInfoFragment
    }
  }
}
```

## Example variables

```json
{
  "marketPlaceJobFilter": {
    "searchExpression_eq": "React TypeScript senior",
    "experienceLevel_eq": "EXPERT",
    "clientHiresRange_eq": { "rangeStart": 1 },
    "pagination_eq": { "first": 50 }
  },
  "searchType": "USER_JOBS_SEARCH",
  "sortAttributes": [{ "field": "RECENCY" }]
}
```

## Response shape (top level)

```json
{
  "data": {
    "marketplaceJobPostingsSearch": {
      "totalCount": 123,
      "edges": [{ "node": { /* MarketplaceJobPostingSearchResult */ } }],
      "pageInfo": { "hasNextPage": true, "endCursor": "…" }
    }
  }
}
```

Pagination uses `pagination_eq: { first: N, after: <endCursor> }` for subsequent pages.
