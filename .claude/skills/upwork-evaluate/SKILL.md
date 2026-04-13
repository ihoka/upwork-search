---
name: upwork-evaluate
description: Score Upwork job postings against a freelancer profile and decide apply/maybe/skip. Triggers on /upwork-evaluate.
---

# Upwork Job Evaluation

You are evaluating Upwork job postings for a freelancer. All personal context (name, rate, stack, CV highlights, scoring parameters) is loaded from a **triage profile** file. Do not assume any identity, rate, or technology preference without reading the profile first.

This skill does NOT draft proposals. Drafts are handled by the `/upwork-propose` skill which runs against files with `upwork_verdict: apply`.

## Step 0: Load Triage Profile

Resolve the profile file using this priority order:

1. If the invoker's prompt includes a profile path (e.g. `using profile at <path>`), use that.
2. Else check `$UPWORK_TRIAGE_PROFILE` env var.
3. Else look for `./triage-profile.yaml` in the current working directory.
4. Else look for `~/.config/upwork-triage/profile.yaml`.
5. If none found, tell the user: "No triage profile found. Create one based on `triage-profile.example.yaml`." and stop.

Read the profile YAML into memory. All subsequent steps reference it as `profile.<field>`.

## Layout

All Upwork job postings live in a single flat folder specified by `profile.paths.jobs_dir` (overridable if the invoker's prompt includes a jobs directory path). Lifecycle stage is tracked via a `status` frontmatter property.

Status values:
- `new` -- raw postings, not yet evaluated. Two sources land here:
  - **Web-clipped** files (no frontmatter, or frontmatter without a `source` field)
  - **API-fetched** files written by the `upwork-search` service (frontmatter contains `source: upwork-api`)
- `triaged` -- evaluated postings (apply/maybe verdicts)
- `applied` -- jobs that have been applied to on Upwork
- `skipped` -- evaluated postings with skip verdict

## Command: Evaluate (`/upwork-evaluate`)

### Step 1: Discover Files

Use the Glob tool to find all `.md` files in `<profile.paths.jobs_dir>/*.md`. If the invoker's prompt specifies a jobs directory, use that instead.

### Step 2: Filter Processed Files

For each file found, use Read to check the frontmatter. Keep only files where `status: new`. Skip anything with another status or already containing `upwork_score:`.

If no unprocessed files are found, tell the user: "No new job postings to evaluate in the jobs directory."

### Step 3: Load Scoring Rubric

Read the file `scoring-rubric.md` from this skill's directory. This contains:
- Parsing instructions for the web-clipper format
- 6 scoring dimensions with weights and score tables
- Score formula, auto-rules, and verdict thresholds

### Step 4: Evaluate Each File

For each unprocessed file:

#### 4a. Read and Parse
Read the full file content. Determine the source by checking for `source: upwork-api` in the frontmatter, then follow the matching format section in `scoring-rubric.md` (API Format vs. Web-Clipper Format) to extract:
- Title, description, engagement type, duration, experience level
- Rate range (min and max), tech stack
- Client history (aggregates for API; past projects + feedback for web-clipped)
- Proposal count, interviewing count, bid range (web-clipped only -- not present in API files)

#### 4b. Check Auto-Rules
Apply auto-rules FIRST:
- If client's maximum offered rate < `profile.rate.min_acceptable` -> auto-skip
- If tech stack has zero overlap with the union of `profile.stack.core`, `profile.stack.adjacent`, and `profile.stack.transferable` -> auto-skip

If auto-skip triggers, set score to 0 and skip to Step 4e.

#### 4c. Score Each Dimension
Score each of the 6 dimensions (0-10) using the rubric tables. Be specific in your reasoning -- reference actual data from the posting. Use profile values for all thresholds (see `scoring-rubric.md`).

#### 4d. Calculate Final Score
```
final_score = (sum of dimension_score x weight_as_decimal) x 10 + boosts
```

Apply boosts from `profile.boosts`: for each entry, if the job description mentions any keyword in that entry's `keywords` list, add that entry's `points`. Sum all matching boosts. Cap final score at 100.

#### 4e. Determine Verdict
- `profile.verdict_thresholds.apply` to 100 -> **apply** (default threshold: 70)
- `profile.verdict_thresholds.maybe` to apply-1 -> **maybe** (default threshold: 40)
- 0 to maybe-1 -> **skip**

#### 4f. Edit the File

**Frontmatter:** If the file already has YAML frontmatter (starts with `---`), merge the `upwork_` fields into the existing frontmatter. If no frontmatter exists, prepend a new block.

Add these fields (and update `status` from `new` to its new value -- see Step 4g):
```yaml
status: [triaged or skipped -- see 4g]
upwork_score: [calculated score]
upwork_verdict: [apply/maybe/skip]
upwork_evaluated: [today's date YYYY-MM-DD]
upwork_engagement: [hourly/fixed-price]
upwork_rate_range: "[extracted range]"
upwork_stack_match: [list of matching technologies]
upwork_reasoning:
  - "[specific reason 1]"
  - "[specific reason 2]"
  - "[etc.]"
```

**IMPORTANT:** Do not modify the original posting content below the frontmatter. It must remain exactly as clipped.

#### 4g. Update Status

After editing the file, set `status` in frontmatter based on verdict:

- **apply** or **maybe** -> `status: triaged`
- **skip** -> `status: skipped`

### Step 5: Display Summary

After processing all files, display a summary table:

```markdown
| Job | Score | Verdict | Key Reason |
|-----|-------|---------|------------|
| [title] | [score] | [APPLY/MAYBE/SKIP] | [1-line summary] |
```
