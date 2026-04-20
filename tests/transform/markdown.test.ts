import { describe, test, expect } from "bun:test";
import { jobToMarkdown, sanitizeFilename } from "../../src/transform/markdown.ts";
import type { UpworkJobPosting } from "../../src/types.ts";

const sampleJob: UpworkJobPosting = {
  id: "search-result-1",
  ciphertext: "~01abc",
  title: "Senior React Dev",
  description: "Build stuff",
  publishedDateTime: "2026-04-13T10:00:00Z",
  experienceLevel: "EXPERT",
  duration: "MONTH",
  engagement: "30+ hrs/week",
  amount: { rawValue: "0", currency: "USD", displayValue: "$0" },
  hourlyBudgetMin: { rawValue: "60", currency: "USD", displayValue: "$60.00" },
  hourlyBudgetMax: { rawValue: "90", currency: "USD", displayValue: "$90.00" },
  skills: [{ name: "react", prettyName: "React" }],
  client: {
    totalHires: 12,
    totalReviews: 8,
    totalSpent: { rawValue: "50000", currency: "USD", displayValue: "$50,000" },
    location: { country: "United States" },
  },
  occupations: { category: { id: "531770282580668419", prefLabel: "Web Development" } },
  totalApplicants: null,
  applied: null,
};

describe("jobToMarkdown", () => {
  test("includes YAML frontmatter with source: upwork-api", () => {
    const md = jobToMarkdown(sampleJob);
    expect(md).toContain("source: upwork-api");
    expect(md).toContain('upwork_job_id: "~01abc"');
    expect(md).toContain('upwork_url: "https://www.upwork.com/jobs/~01abc"');
    expect(md).toContain("upwork_fetched:");
  });

  test("includes job title as h4 heading", () => {
    const md = jobToMarkdown(sampleJob);
    expect(md).toContain("#### Senior React Dev");
  });

  test("includes posted date", () => {
    const md = jobToMarkdown(sampleJob);
    expect(md).toContain("**Posted:** 2026-04-13T10:00:00Z");
  });

  test("includes job description under Summary", () => {
    const md = jobToMarkdown(sampleJob);
    expect(md).toContain("**Summary**");
    expect(md).toContain("Build stuff");
  });

  test("includes hourly budget range", () => {
    const md = jobToMarkdown(sampleJob);
    expect(md).toContain("Hourly: $60.00 – $90.00");
  });

  test("includes engagement, duration, experience level", () => {
    const md = jobToMarkdown(sampleJob);
    expect(md).toContain("30+ hrs/week");
    expect(md).toContain("MONTH");
    expect(md).toContain("EXPERT");
  });

  test("includes skills list", () => {
    const md = jobToMarkdown(sampleJob);
    expect(md).toContain("react");
  });

  test("includes client history", () => {
    const md = jobToMarkdown(sampleJob);
    expect(md).toContain("Client hires: 12");
    expect(md).toContain("Client spent: $50,000");
    expect(md).toContain("Category: Web Development");
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
      amount: { rawValue: "5000", currency: "USD", displayValue: "$5,000" },
      engagement: null,
    };
    const md = jobToMarkdown(fixedJob);
    expect(md).toContain("$5,000");
    expect(md).toContain("Fixed");
  });

  test("handles missing client data gracefully", () => {
    const noClientJob: UpworkJobPosting = { ...sampleJob, client: null as unknown as UpworkJobPosting["client"] };
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
