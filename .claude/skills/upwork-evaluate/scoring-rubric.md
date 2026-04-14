# Scoring Rubric

All numeric thresholds and stack lists in this rubric are resolved from the triage profile loaded in Step 0 of SKILL.md. References like `profile.rate.hourly` mean "the value from the profile YAML."

## Parsing Instructions

Files come from one of two sources. Detect which by checking the YAML frontmatter:

- **`source: upwork-api`** -> structured API export (see "API Format" below)
- **No frontmatter, or no `source` field** -> web-clipped (see "Web-Clipper Format" below)

If a field cannot be found in either format, note it as "not available" and use fallback scoring.

### API Format (`source: upwork-api`)

The body has predictable structure. Extract:

- **Title:** First H4 (`####`) heading
- **Posted:** Line starting with `**Posted:**` (ISO timestamp)
- **Country:** Bold line directly under Posted (e.g. `**United States**`)
- **Description:** Single paragraph after `**Summary**`
- **Engagement type:** Bullet `- **{value}**` followed by `    Engagement` (e.g. "Hourly: 30+ hrs/week")
- **Duration:** Bullet `- **{value}**` followed by `    Duration`
- **Experience level:** Bullet `- **{value}**` followed by `    Experience Level` (e.g. "Expert", "Intermediate", "Entry")
- **Rate range / Budget:** Bullet `- **Hourly: $min - $max**` or `- **Fixed: $amount**` followed by `    Budget`
- **Tech stack:** The `**Skills:** ...` comma-separated line. Also scan description body for additional tech.
- **Client History:** Bullet block under `**Client History**` with `Client hires`, `Client spent`, `Total reviews`, `Location`, `Category`. Use these directly -- there is NO list of past projects with feedback.
- **Activity:** The API does not expose proposal/interview counts. The `##### Activity on this job` section will say "not available" -- use the fallback score (5) for Competition Level.

### Web-Clipper Format (no `source: upwork-api`)

Semi-structured -- use these hints:

- **Title:** First H4 (`####`) heading
- **Description:** Large text block after `**Summary**`
- **Engagement type:** Line containing "hrs/week" followed by "Hourly", or "Fixed-price"
- **Duration:** Line like "X to Y months" or "Duration"
- **Experience level:** Line containing "Expert", "Intermediate", or "Entry" -- often followed by willingness-to-pay language
- **Rate range:** Dollar amounts near "Hourly" or "Fixed-price" (e.g. "$25.00 - $120.00 Hourly")
- **Tech stack:** Extract from description body text -- NOT in structured fields
- **Proposal count:** Under "Activity on this job" -- line like "Proposals: 50+"
- **Interviewing count:** Line like "Interviewing: 3"
- **Bid range:** Line starting with "Bid range" with High/Avg/Low values
- **Client history:** Everything after the bid range -- past jobs with freelancer names, dates, rates, amounts billed, feedback text

## Scoring Dimensions

Each dimension is scored 0-10.

### 1. Client History (Weight: 25%)

| Score | Criteria |
|-------|----------|
| 9-10 | 5+ past projects, $5k+ total spend, positive feedback on most |
| 7-8 | 3-4 past projects, $2k+ spend, mostly positive feedback |
| 5-6 | 1-2 past projects, some spend, feedback is mixed or absent |
| 3-4 | 1 past project with low spend, or no feedback |
| 0-2 | No prior projects (first-time client) |

Look at: number of past jobs listed, amounts billed, feedback text, duration of engagements (longer = more committed client).

**API format:** Past project detail is not available -- score from the `Client History` aggregates (`Client hires`, `Client spent`, `Total reviews`). A first-time client (`Client hires: 0`) still scores 0-2.

### 2. Budget Reasonableness (Weight: 20%)

Budget scoring is relative to the freelancer's hourly rate from the profile (`profile.rate.hourly`). Let `R` = `profile.rate.hourly`.

**Hourly jobs:**

| Score | Criteria |
|-------|----------|
| 9-10 | Upper range >= R (100%+ of profile rate) |
| 7-8 | Upper range is 67-99% of R |
| 5-6 | Upper range is 42-66% of R |
| 3-4 | Upper range is 25-41% of R |
| 0-2 | Upper range is below 25% of R |

**Fixed-price jobs:** Assess whether the budget is reasonable for the described scope at `profile.rate.hourly`/h. A budget that covers the estimated hours at the profile rate scores 9-10. A budget that would require working at less than 25% of the profile rate for the estimated scope scores 0-2.

### 3. Expert Seeking (Weight: 15%)

| Score | Criteria |
|-------|----------|
| 9-10 | "Expert" level + "willing to pay higher rates" + job description emphasizes quality/reliability |
| 7-8 | "Expert" level, or description emphasizes experience and quality |
| 5-6 | "Intermediate" level but description suggests they want senior work |
| 3-4 | "Intermediate" level, generic requirements |
| 0-2 | "Entry level", or description suggests they want cheap labor |

### 4. Engagement Type (Weight: 15%)

| Score | Criteria |
|-------|----------|
| 9-10 | Hourly, 30+ hrs/week, 3+ months, ongoing project |
| 7-8 | Hourly, 20-30 hrs/week, 1-3 months |
| 5-6 | Hourly, under 20 hrs/week, or fixed-price with clear scope and milestones |
| 3-4 | Fixed-price with somewhat vague scope |
| 0-2 | Fixed-price with very vague scope, unclear deliverables, or one-off tiny task |

### 5. Tech Stack Match (Weight: 15%)

Scoring is based on the freelancer's stack categories from the profile:

| Score | Criteria |
|-------|----------|
| 9-10 | Core stack match -- job requires technologies listed in `profile.stack.core` (direct daily-use match) |
| 7-8 | Adjacent stack -- job requires technologies listed in `profile.stack.adjacent` |
| 5-6 | Partially matching -- some familiar tech (core or adjacent) mixed with unfamiliar |
| 3-4 | Mostly unfamiliar but transferable -- job tech overlaps with `profile.stack.transferable` |
| 0-2 | Technologies are in `profile.stack.avoid` or entirely unknown -- no overlap with any profile stack list |

### 6. Competition Level (Weight: 10%)

| Score | Criteria |
|-------|----------|
| 9-10 | Under 10 proposals, client actively interviewing |
| 7-8 | 10-20 proposals, client interviewing or inviting |
| 5-6 | 20-30 proposals, some interview activity |
| 3-4 | 30-50 proposals, limited interview activity |
| 0-2 | 50+ proposals, no interviews happening |

**Fallback:** If activity data is missing (always the case for API-sourced files), score at 5 (neutral).

## Score Formula

```
final_score = (sum of dimension_score x weight_as_decimal) x 10 + boosts
```

Example: if all dimensions score 8:
`(8 x 0.25 + 8 x 0.20 + 8 x 0.15 + 8 x 0.15 + 8 x 0.15 + 8 x 0.10) x 10 = 80`

Boosts are added after the weighted calculation.

## Auto-Rules

Rules are applied at two stages:

**Pre-scoring (apply BEFORE normal scoring):**

- **Auto-skip (low rate):** Client's maximum offered rate is below `profile.rate.min_acceptable` (the upper bound of their stated range). Score as 0, verdict "skip", reason: "Max rate below minimum acceptable threshold."
- **Auto-skip (no stack overlap):** Tech stack is entirely outside the union of `profile.stack.core`, `profile.stack.adjacent`, and `profile.stack.transferable` -- zero overlap. If the only overlap is with `profile.stack.avoid`, that still counts as zero overlap. Score as 0, verdict "skip", reason: "No tech stack overlap."

**Post-scoring (apply AFTER weighted scoring and boosts, BEFORE verdict):**

- **Boosts:** Apply each entry in `profile.boosts`. For each entry, if the job description mentions any keyword in that entry's `keywords` list, add the entry's `points` to the final score. Sum all matching boosts. Cap final score at 100.
- **Score cap (disqualifying requirements):** After scoring, scan the job description for **explicitly stated hard requirements** -- look for sections like "ideal candidate has", "must have", "required experience", "you should have", "looking for someone with", or equivalent phrasing that signals non-negotiable qualifications. For each hard requirement found, check whether the freelancer's profile covers it by matching against `profile.stack.core`, `profile.stack.adjacent`, `profile.stack.transferable`, and the domains and bullets in `profile.cv_highlights`. If one or more hard requirements fall entirely outside the freelancer's profile, cap the final score at `profile.verdict_thresholds.apply - 1` (just below the apply threshold, forcing a "maybe" at best). Add a reasoning line for each unmet requirement: `"Score capped: job requires [requirement] which is outside profile expertise."`

## Verdict Thresholds

Read thresholds from `profile.verdict_thresholds`. Defaults if missing: apply = 70, maybe = 40.

| Score Range | Verdict | Action |
|-------------|---------|--------|
| apply threshold to 100 | **apply** | File stays in inbox for proposal drafting by `/upwork-propose` |
| maybe threshold to apply-1 | **maybe** | Add frontmatter + reasoning only, stays in inbox |
| 0 to maybe-1 | **skip** | Add frontmatter + brief reasoning, move to skipped |
