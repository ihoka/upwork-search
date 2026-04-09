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
  experienceLevel: string;
  hourlyBudgetMin: number;
  jobType: string[];
  clientHiresCount_gte: number;
  postedWithin: string;
}

export interface SearchProfile {
  searches: SearchConfig[];
  filters: SearchFilters;
}

// Upwork GraphQL API response types
export interface UpworkClient {
  totalHires: number | null;
  totalSpent: number | null;
  totalReviews: number | null;
  location: { country: string } | null;
}

export interface UpworkJobPosting {
  id: string;
  ciphertext: string;
  title: string;
  description: string;
  publishedDateTime: string;
  hourlyBudgetMin: number | null;
  hourlyBudgetMax: number | null;
  budget: { amount: number } | null;
  experienceLevel: string | null;
  duration: string | null;
  workload: string | null;
  skills: { name: string }[];
  client: UpworkClient | null;
  occupations: { category: string }[] | null;
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
    marketplaceJobPostings: {
      totalCount: number;
      edges: JobPostingEdge[];
      pageInfo: PageInfo;
    };
  };
}

// Dedup state shape (data/seen-jobs.json)
export type SeenJobs = Record<string, string>; // jobId -> ISO timestamp
