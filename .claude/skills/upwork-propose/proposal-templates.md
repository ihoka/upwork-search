# Proposal Templates

All personal details (rate, CV highlights, word count target, voice) come from the triage profile loaded in Step 0 of SKILL.md. References like `profile.rate.hourly` mean "the value from the profile YAML."

## Voice & Tone

Use the voice described in `profile.proposal.voice` (default: "direct, professional, subtly authoritative").

The freelancer is an experienced professional who has built exactly this kind of system before. Lead with specific results and metrics from real projects. Short, punchy sentences. No filler, no hedging, no desperation.

Think: a senior consultant who knows they can solve this problem, stating what they've done and how they'd approach it. Not selling -- informing.

## Hourly Proposal Structure

### 1. Opening Hook (1 sentence)
Connect specific experience directly to their exact problem. Name the domain, not just the tech.

Example (from a specific user profile): "I built and maintained Blinksale's invoicing engine for 8 years -- subscription billing, proration, payment processing, the full lifecycle."

**Bad:** "I am an experienced full-stack developer who would love to work on your project."

The opening must reference the specific domain/problem from the job posting, drawing on the freelancer's actual experience from `profile.cv_highlights`.

### 2. Relevant Proof (2-3 bullets)
Concrete results with numbers. Pick the 2-3 most relevant entries from `profile.cv_highlights` -- each entry has a `domain` and `bullets`. Choose bullets that directly connect to the job's stated problem.

**Format:** What you built -> measurable result

### 3. Approach (2-3 sentences)
Brief, specific description of how you'd tackle their challenge. Reference their actual requirements -- show you read the posting. Mention any architectural decisions you'd make.

### 4. Availability & Rate
State: "`profile.rate.hourly` `profile.rate.currency`/h. Available to start immediately." or "`profile.rate.hourly` `profile.rate.currency`/h. Can start [specific timeframe]."

No negotiation language. No "my rate is negotiable." State the rate as a fact.

### 5. Closing (1 sentence)
Confident, forward-looking. Assume competence, not permission.

**Good:** "Happy to walk through my approach to [specific technical detail] on a quick call."
**Bad:** "I hope to hear from you soon and would be grateful for the opportunity."

## Fixed-Price Proposal Structure

### 1-2. Same Opening + Proof as Hourly

### 3. Milestone Breakdown Table

Break the work into logical milestones. Each milestone should be a deliverable the client can verify.

```markdown
### Estimated Breakdown

| Milestone | Deliverable | Est. Hours | Price |
|-----------|-------------|------------|-------|
| 1 | [Concrete deliverable] | Xh | $X,XXX |
| 2 | [Concrete deliverable] | Xh | $X,XXX |
| 3 | [Concrete deliverable] | Xh | $X,XXX |

**Total: $XX,XXX** *(XX hours @ profile.rate.hourly profile.rate.currency/h)*
```

**Pricing rules:**
- Calculate hours honestly, then multiply by `profile.rate.hourly`
- Round milestone prices to clean numbers ($4,800 not $4,680)
- Add 15-20% buffer for unknowns in scope -- build it into the estimates, don't list it separately
- If scope is ambiguous, note it: "Milestone 3 estimate assumes [specific assumption]. Happy to refine after a scope call."

### 4. Scope Clarification (if needed)
If the posting has vague areas, note 1-2 specific questions that would sharpen the estimate. Frame as "I'd want to clarify X before starting" not "I can't estimate without more info."

## Anti-Patterns -- NEVER Do These

- "Dear Hiring Manager" or any formal salutation
- "I am excited about this opportunity"
- "I would be a great fit for this role"
- "I have X years of experience in Y" as an opening line
- Listing every technology you've ever used
- Copy-pasting the job requirements back at them
- "I think I could possibly help with..." or any hedging
- "Looking forward to hearing from you" or any begging
- Mentioning other proposals or competing for the job
- Generic statements that could apply to any job posting

## CV Highlights

Pick the 2-3 most relevant entries from `profile.cv_highlights` for each specific job. Each entry in the profile has a `domain` and `bullets`. Choose bullets that directly connect to the job's stated problem.

Do not list all highlights. Relevance over volume.

## Proposal Length

- **Target:** the range in `profile.proposal.length_words` (default 150-250 words) for the cover letter portion (excluding milestone table)
- Shorter is better if you can make the same point
- The milestone table is additional -- it doesn't count toward word count
