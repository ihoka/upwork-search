# Job node — `MarketplaceJobPostingSearchResult`

Returned as `edges[].node` from `marketplaceJobPostingsSearch`. Source: `docs/Upwork API Documentation.md:13196`.

## Fields this project reads

| Field | Type | Notes |
|---|---|---|
| `id` | `ID!` | Search-result identifier. Different from `ciphertext`. |
| `ciphertext` | `String!` | Encrypted posting ID; used to build `https://www.upwork.com/jobs/<ciphertext>`. This is what we key dedup on. |
| `title` | `String!` |  |
| `description` | `String!` |  |
| `publishedDateTime` | `String!` | ISO 8601. |
| `experienceLevel` | `FreelancerProfileExperienceLevel!` | `NONE` \| `ENTRY_LEVEL` \| `INTERMEDIATE` \| `EXPERT`. |
| `duration` | `JobDuration` | Nullable: `WEEK` \| `MONTH` \| `QUARTER` \| `SEMESTER` \| `ONGOING`. |
| `engagement` | `String` | Free-form engagement label (e.g. "30+ hrs/week"). **Replaces the non-existent `workload` field.** |
| `amount` | `Money!` | Fixed-price budget. Non-null in the schema but semantically zero for hourly jobs. Needs subselection. |
| `hourlyBudgetMin` | `Money` | Nullable — present only for hourly jobs. Needs subselection. |
| `hourlyBudgetMax` | `Money` | Nullable. Used client-side to enforce `filters.hourlyBudgetMin`. |
| `skills` | `[MarketplaceJobPostingSearchSkill]!` | List. Each skill has `name`, `prettyName`. |
| `client` | `MarketplaceJobPostingSearchClientInfo!` | See below. |
| `occupations` | `MarketplaceJobPostingSearchOccupations` | Nullable. Subselect `category { id prefLabel }`. |

| `totalApplicants` | `Int` | Nullable. Number of proposals submitted. Used by maintenance module for competition-based score decay. |
| `applied` | `Boolean` | Nullable. Whether the authenticated freelancer has applied. Used by maintenance module for status cross-referencing. |

## Fields we don't use (selection)

`hourlyBudgetType`, `weeklyBudget`, `engagementDuration`, `freelancersToHire`, `premium`, `enterprise`, `relevance`, `relevanceEncoded`, `preferredFreelancerLocation`, `freelancerClientRelation`, `recordNumber`, `category` (the deprecated String field), `subcategory`, `durationLabel`.

## `Money`

Always needs a subselection — it's an object, not a scalar.

```graphql
type Money {
  rawValue: String!     # numeric value as a string, e.g. "60" or "50000"
  currency: String!     # e.g. "USD"
  displayValue: String! # e.g. "$60.00"
}
```

The project parses `rawValue` for numeric comparisons (budget filtering) and emits `displayValue` in the markdown output. Both `Money.rawValue` and `Money.currency` are gated by the **Read marketplace Job Postings** scope.

## `MarketplaceJobPostingSearchClientInfo`

Fields we subselect:

| Field | Type | Notes |
|---|---|---|
| `totalHires` | `Int!` | Number of past hires. |
| `totalReviews` | `Int!` | |
| `totalSpent` | `Money` | Nullable. Lifetime spend. |
| `location` | `MarketPlaceJobSearchLocation` | Subselect `{ country }`. |

Full field list includes `totalPostedJobs`, `totalFeedback`, `verificationStatus`, `companyRid`, etc. — not used here.

## `MarketplaceJobPostingSearchOccupations`

```graphql
type MarketplaceJobPostingSearchOccupations {
  category: MarketplaceJobPostingSearchOccupation!  # { id: ID!, prefLabel: String! }
  subCategories: [MarketplaceJobPostingSearchOccupation]
  occupationService: MarketplaceJobPostingSearchOccupation
}
```

Project uses only `category { id prefLabel }`. `prefLabel` is the human-readable name like `"Web Development"`.

## `MarketplaceJobPostingSearchSkill`

```graphql
type MarketplaceJobPostingSearchSkill {
  id: ID          # legacy, deprecated
  name: String!   # canonical slug
  prettyName: String!
  highlighted: Boolean
}
```

## `MarketPlaceJobSearchLocation`

Note the capitalization — `MarketPlace…` (not `Marketplace…`).

```graphql
type MarketPlaceJobSearchLocation {
  city: String
  country: String
  timezone: String
  state: String
  offsetToUTC: String
}
```
