---
name: upwork-propose
description: Draft tailored Upwork proposals for jobs already evaluated with verdict apply. Triggers on /upwork-propose.
---

# Upwork Proposal Drafting

You are drafting Upwork proposals for jobs that have already been evaluated and received an `apply` verdict. All personal context (name, rate, stack, CV highlights, proposal settings) is loaded from a **triage profile** file. Do not assume any identity, rate, or technology preference without reading the profile first.

This skill does NOT score or evaluate jobs. Evaluation is handled by the `/upwork-evaluate` skill. This skill only drafts proposals for files that already have `upwork_verdict: apply`.

## Step 0: Load Triage Profile

Resolve the profile file using this priority order:

1. If the invoker's prompt includes a profile path (e.g. `using profile at <path>`), use that.
2. Else check `$UPWORK_TRIAGE_PROFILE` env var.
3. Else look for `./triage-profile.yaml` in the current working directory.
4. Else look for `~/.config/upwork-triage/profile.yaml`.
5. If none found, tell the user: "No triage profile found. Create one based on `triage-profile.example.yaml`." and stop.

Read the profile YAML into memory. All subsequent steps reference it as `profile.<field>`.

## Command: Propose (`/upwork-propose`)

### Step 1: Discover Files

Use the Glob tool to find all `.md` files in `<profile.paths.jobs_dir>/*.md`. If the invoker's prompt specifies a jobs directory, use that instead.

### Step 2: Filter Candidate Files

For each file found, use Read to check the frontmatter. Keep only files where `upwork_verdict: apply`.

Then, for each candidate file, use Grep or Read to check whether the file already contains a `## Draft Proposal` section. Skip any file that already has a draft proposal.

If no candidate files are found, tell the user: "No apply-verdict jobs awaiting proposals."

### Step 3: Load Proposal Templates

Read the file `proposal-templates.md` from this skill's directory. This contains:
- Voice and tone guidelines
- Hourly proposal structure (hook, proof, approach, rate, closing)
- Fixed-price proposal structure (same + milestone table)
- Anti-patterns to avoid
- CV highlight selection guidance
- Word count targets

### Step 4: Draft Proposals

For each candidate file:

#### 4a. Read Full Content
Read the full file content -- both frontmatter and job description. Use the frontmatter fields (`upwork_engagement`, `upwork_rate_range`, `upwork_stack_match`, `upwork_reasoning`) to inform the proposal alongside the original posting content.

#### 4b. Select CV Highlights
Pick the 2-3 most relevant entries from `profile.cv_highlights` for THIS specific job. Each entry has a `domain` and `bullets`. Choose bullets that directly connect to the job's stated problem. Relevance over volume.

#### 4c. Draft the Proposal
Follow the template structure from `proposal-templates.md`:
- For hourly jobs: Opening hook -> Relevant proof -> Approach -> Rate -> Closing
- For fixed-price jobs OR jobs that explicitly request hour/scope breakdowns: Same + milestone table with hours x `profile.rate.hourly`/h
- Keep the cover letter within the word range specified by `profile.proposal.length_words` (default 150-250 words)
- Make sure the opening hook references the specific domain/problem, not generic skills

#### 4d. Append to File
Append the proposal to the end of the file in this exact format:

```markdown

***

## Draft Proposal

[The drafted proposal text]
```

If the proposal includes a milestone/hour breakdown, include it as a subsection within the proposal.

**IMPORTANT:** Do NOT modify existing frontmatter or job description content. Only append the proposal section at the bottom.

### Step 5: Display Summary

After processing all files, display a summary:

```markdown
| Job | Word Count | CV Highlights Used |
|-----|------------|--------------------|
| [title] | [word count] | [chosen highlight domains] |
```
