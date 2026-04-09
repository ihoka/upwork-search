import type { UpworkJobPosting } from "../types.ts";

function formatCurrency(amount: number): string {
  return `$${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function jobToMarkdown(job: UpworkJobPosting): string {
  const today = new Date().toISOString().split("T")[0];
  const url = `https://www.upwork.com/jobs/${job.ciphertext}`;
  const country = job.client?.location?.country ?? "Worldwide";

  // Budget section
  let budgetLine: string;
  let budgetLabel: string;
  if (job.hourlyBudgetMin != null || job.hourlyBudgetMax != null) {
    const min = job.hourlyBudgetMin ?? 0;
    const max = job.hourlyBudgetMax ?? 0;
    budgetLine = `${formatCurrency(min)} - ${formatCurrency(max)}`;
    budgetLabel = "Hourly";
  } else if (job.budget?.amount != null) {
    budgetLine = formatCurrency(job.budget.amount);
    budgetLabel = "Fixed";
  } else {
    budgetLine = "not available";
    budgetLabel = "Budget";
  }

  // Client history
  const clientHires = job.client?.totalHires != null ? String(job.client.totalHires) : "not available";
  const clientSpent = job.client?.totalSpent != null ? formatCurrency(job.client.totalSpent) : "not available";
  const clientReviews = job.client?.totalReviews != null ? String(job.client.totalReviews) : "not available";
  const clientLocation = job.client?.location?.country ?? "not available";

  const skills = job.skills.map((s) => s.name).join(", ");

  return `---
source: upwork-api
upwork_job_id: "${job.ciphertext}"
upwork_fetched: ${today}
upwork_url: "${url}"
---

#### ${job.title}

**Posted:** ${job.publishedDateTime}

**${country}**

**Summary**

${job.description}

- **${job.workload ?? "not available"}**
    Workload
- **${job.duration ?? "not available"}**
    Duration
- **${job.experienceLevel ?? "not available"}**
    Experience Level
- **${budgetLine}**
    ${budgetLabel}

**Skills:** ${skills || "not available"}

**Client History**
- Total hires: ${clientHires}
- Total spent: ${clientSpent}
- Total reviews: ${clientReviews}
- Location: ${clientLocation}

##### Activity on this job

- Proposals: not available
- Interviewing: not available
`;
}

export function sanitizeFilename(title: string, jobId: string): string {
  const maxTitleLength = 100;
  const sanitized = title.replace(/[\/\\:*?"<>|]/g, "-");
  const truncated = sanitized.length > maxTitleLength ? sanitized.slice(0, maxTitleLength) : sanitized;
  return `${truncated.trim()} - ${jobId}.md`;
}
