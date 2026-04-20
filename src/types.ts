// Token storage shape (data/tokens.json)
export interface TokenStore {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // Unix timestamp in ms
}

// Search profile config (search-profile.yaml)
export interface SearchConfig {
  terms: string[];
  category: string;
}

export interface SearchFilters {
  experienceLevel: "ENTRY_LEVEL" | "INTERMEDIATE" | "EXPERT";
  hourlyBudgetMin: number;
  jobType: string[];         // retained for documentation; unused at runtime
  clientHiresCount_gte: number;
  postedWithin: string;      // raw YAML value, e.g. "24h"
  daysPosted: number;        // derived; min 1
}

export interface SearchProfile {
  searches: SearchConfig[];
  filters: SearchFilters;
}

// Upwork GraphQL API response types
export interface Money {
  rawValue: string;    // numeric as string, e.g. "60"
  currency: string;    // e.g. "USD"
  displayValue: string; // e.g. "$60.00"
}

export interface UpworkJobPostingClient {
  totalHires: number;
  totalReviews: number;
  totalSpent: Money | null;
  location: { country: string | null } | null;
}

export interface UpworkJobPostingOccupation {
  id: string;
  prefLabel: string;
}

export interface UpworkJobPostingOccupations {
  category: UpworkJobPostingOccupation | null;
}

export interface UpworkJobPostingSkill {
  name: string;
  prettyName: string;
}

export interface UpworkJobPosting {
  id: string;
  ciphertext: string;
  title: string;
  description: string;
  publishedDateTime: string;
  experienceLevel: "ENTRY_LEVEL" | "INTERMEDIATE" | "EXPERT" | "NONE";
  duration: "WEEK" | "MONTH" | "QUARTER" | "SEMESTER" | "ONGOING" | null;
  engagement: string | null;
  amount: Money;
  hourlyBudgetMin: Money | null;
  hourlyBudgetMax: Money | null;
  skills: UpworkJobPostingSkill[];
  client: UpworkJobPostingClient;
  occupations: UpworkJobPostingOccupations | null;
  totalApplicants: number | null;
  applied: boolean | null;
}

export interface JobPostingEdge {
  node: UpworkJobPosting;
}

export interface PageInfo {
  hasNextPage: boolean;
  endCursor: string | null;
}

export interface MarketplaceJobPostingsResponse {
  data: {
    marketplaceJobPostingsSearch: {
      totalCount: number;
      edges: JobPostingEdge[];
      pageInfo: PageInfo;
    };
  };
}

// Dedup state shape (data/seen-jobs.json)
export type SeenJobs = Record<string, string>; // jobId -> ISO timestamp
