---
name: upwork-maintain
description: Expire stale Upwork job postings and apply time-decay scoring. Triggers on /upwork-maintain.
---

# Upwork Job Maintenance

You are maintaining Upwork job postings for a freelancer. This skill handles offline maintenance — expiring old jobs and degrading scores based on age. It does NOT check job availability on Upwork (that requires API access and runs in the TypeScript pipeline).

## Step 0: Load Triage Profile

Resolve the profile file using this priority order:

1. If the invoker's prompt includes a profile path (e.g. `using profile at <path>`), use that.
2. Else check `$UPWORK_TRIAGE_PROFILE` env var.
3. Else look for `./triage-profile.yaml` in the current working directory.
4. Else look for `~/.config/upwork-triage/profile.yaml`.
5. If none found, tell the user: "No triage profile found." and stop.

Read the profile YAML into memory. Extract `profile.verdict_thresholds.maybe` (default: 40).

## Step 1: Discover Files

Use the Glob tool to find all `.md` files in `<profile.paths.jobs_dir>/*.md`. If the invoker's prompt specifies a jobs directory, use that instead.

## Step 2: Apply Rule 2 — Expire Old Unapplied Jobs

For each file with `status: triaged` in frontmatter:

1. Read `upwork_evaluated` (or `upwork_fetched` as fallback) from frontmatter
2. Calculate the age in days from today
3. If age >= 14 days:
   - Set `status: expired`
   - Add `upwork_expired: <today's date YYYY-MM-DD>`
   - Add `upwork_last_maintained: <today's date YYYY-MM-DD>`

## Step 3: Apply Rule 3 — Time-Decay Scoring

For each file with `status: triaged` and age < 14 days:

1. Read `upwork_score` from frontmatter (skip if missing)
2. Read `upwork_proposals` from frontmatter if available (set by the TypeScript pipeline)
3. Calculate decay:
   - `age_factor = days_old / 14` (linear 0→1)
   - `competition_factor`:
     - If `upwork_proposals` is missing: 0.5 (neutral)
     - 0-5 proposals: 0
     - 6-15: 0.25
     - 16-30: 0.5
     - 31-50: 0.75
     - 51+: 1.0
   - `decay_points = round(20 * (0.6 * age_factor + 0.4 * competition_factor))`
   - `decayed_score = max(0, upwork_score - decay_points)`
4. If `decay_points >= 1`:
   - Set `upwork_decayed_score: <decayed_score>`
   - Set `upwork_last_maintained: <today's date YYYY-MM-DD>`
5. If `decayed_score < profile.verdict_thresholds.maybe`:
   - Set `upwork_verdict: skip`
   - Set `status: skipped`

**IMPORTANT:** Do not modify the original `upwork_score` — it records the evaluation-time score. Only write `upwork_decayed_score`.

## Step 4: Display Summary

After processing all files, display a summary table:

```markdown
| Job | Original Score | Decayed Score | Action |
|-----|---------------|---------------|--------|
| [title] | [score] | [decayed] | [expired/decayed/skipped/unchanged] |
```

Include counts: X expired, Y decayed, Z downgraded to skip.
