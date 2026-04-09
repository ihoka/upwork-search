import { resolve, join } from "path";

export interface AppConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  outputDir: string;
  tokensPath: string;
  seenJobsPath: string;
  searchProfilePath: string;
  apiBaseUrl: string;
}

const PROJECT_ROOT = resolve(import.meta.dir, "..");

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export function getConfig(): AppConfig {
  const homeDir = process.env.HOME || "~";
  return {
    clientId: requireEnv("UPWORK_CLIENT_ID"),
    clientSecret: requireEnv("UPWORK_CLIENT_SECRET"),
    redirectUri: process.env.UPWORK_REDIRECT_URI || "http://localhost:3000/callback",
    outputDir: process.env.OUTPUT_DIR || join(homeDir, "Documents/Obsidian/Personal/+Inbox/Upwork"),
    tokensPath: join(PROJECT_ROOT, "data/tokens.json"),
    seenJobsPath: join(PROJECT_ROOT, "data/seen-jobs.json"),
    searchProfilePath: join(PROJECT_ROOT, "search-profile.yaml"),
    apiBaseUrl: "https://www.upwork.com/api/graphql",
  };
}
