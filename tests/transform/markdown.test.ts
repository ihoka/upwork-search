import { describe, test, expect } from "bun:test";
import { jobToMarkdown, sanitizeFilename } from "../../src/transform/markdown.ts";
import type { UpworkJobPosting } from "../../src/types.ts";

const sampleJob: UpworkJobPosting = {
  id: "1",
  ciphertext: "~01abc123def456",
  title: "Senior React/TypeScript Developer for SaaS Platform",
  description: "We need an experienced React developer to build our SaaS dashboard.",
  publishedDateTime: "2026-04-09T14:30:00Z",
  hourlyBudgetMin: 60,
  hourlyBudgetMax: 120,
  budget: null,
  experienceLevel: "Expert",
  duration: "1 to 3 months",
  workload: "30+ hrs/week",
  skills: [{ name: "React" }, { name: "TypeScript" }, { name: "Node.js" }],
  client: {
    totalHires: 12,
    totalSpent: 45000,
    totalReviews: 8,
    location: { country: "United States" },
  },
  occupations: [{ category: "Web Development" }],
};

describe("jobToMarkdown", () => {
  test("includes YAML frontmatter with source: upwork-api", () => {
    const md = jobToMarkdown(sampleJob);
    expect(md).toContain("source: upwork-api");
    expect(md).toContain('upwork_job_id: "~01abc123def456"');
    expect(md).toContain('upwork_url: "https://www.upwork.com/jobs/~01abc123def456"');
    expect(md).toContain("upwork_fetched:");
  });

  test("includes job title as h4 heading", () => {
    const md = jobToMarkdown(sampleJob);
    expect(md).toContain("#### Senior React/TypeScript Developer for SaaS Platform");
  });

  test("includes posted date", () => {
    const md = jobToMarkdown(sampleJob);
    expect(md).toContain("**Posted:** 2026-04-09T14:30:00Z");
  });

  test("includes job description under Summary", () => {
    const md = jobToMarkdown(sampleJob);
    expect(md).toContain("**Summary**");
    expect(md).toContain("We need an experienced React developer");
  });

  test("includes hourly budget range", () => {
    const md = jobToMarkdown(sampleJob);
    expect(md).toContain("$60.00 - $120.00");
  });

  test("includes workload, duration, experience level", () => {
    const md = jobToMarkdown(sampleJob);
    expect(md).toContain("30+ hrs/week");
    expect(md).toContain("Workload");
    expect(md).toContain("1 to 3 months");
    expect(md).toContain("Expert");
  });

  test("includes skills list", () => {
    const md = jobToMarkdown(sampleJob);
    expect(md).toContain("**Skills:** React, TypeScript, Node.js");
  });

  test("includes client history", () => {
    const md = jobToMarkdown(sampleJob);
    expect(md).toContain("Total hires: 12");
    expect(md).toContain("Total spent: $45,000");
    expect(md).toContain("Total reviews: 8");
    expect(md).toContain("Location: United States");
  });

  test("includes activity section with not available values", () => {
    const md = jobToMarkdown(sampleJob);
    expect(md).toContain("##### Activity on this job");
    expect(md).toContain("Proposals: not available");
  });

  test("handles fixed-price job with budget amount", () => {
    const fixedJob: UpworkJobPosting = {
      ...sampleJob,
      hourlyBudgetMin: null,
      hourlyBudgetMax: null,
      budget: { amount: 5000 },
      workload: null,
    };
    const md = jobToMarkdown(fixedJob);
    expect(md).toContain("$5,000.00");
    expect(md).toContain("Fixed");
  });

  test("handles missing client data gracefully", () => {
    const noClientJob: UpworkJobPosting = { ...sampleJob, client: null };
    const md = jobToMarkdown(noClientJob);
    expect(md).toContain("**Client History**");
    expect(md).toContain("not available");
  });
});

describe("sanitizeFilename", () => {
  test("replaces special characters with hyphens", () => {
    const result = sanitizeFilename("Senior React/TypeScript Developer", "~01abc123");
    expect(result).toBe("Senior React-TypeScript Developer - ~01abc123.md");
  });

  test("trims long titles", () => {
    const longTitle = "A".repeat(200);
    const result = sanitizeFilename(longTitle, "~01abc");
    expect(result.length).toBeLessThanOrEqual(120);
    expect(result).toEndWith("~01abc.md");
  });
});
