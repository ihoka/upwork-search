import { resolve, join } from "path";
import { existsSync } from "fs";

export interface AppConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  outputDir: string;
  tokensPath: string;
  seenJobsPath: string;
  searchProfilePath: string;
  apiBaseUrl: string;
  triageEnabled: boolean;
  triageProfilePath: string;
  claudeBin: string;
  triageTimeoutMs: number;
  maintenanceEnabled: boolean;
}

const PROJECT_ROOT = resolve(import.meta.dir, "..");

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export function getConfig(): AppConfig {
  const homeDir = process.env.HOME || "~";

  const triageProfilePath =
    process.env.UPWORK_TRIAGE_PROFILE || join(PROJECT_ROOT, "triage-profile.yaml");

  const triageEnabledEnv = process.env.TRIAGE_ENABLED;
  const triageEnabled =
    triageEnabledEnv !== undefined
      ? triageEnabledEnv === "true"
      : existsSync(triageProfilePath);

  return {
    clientId: requireEnv("UPWORK_CLIENT_ID"),
    clientSecret: requireEnv("UPWORK_CLIENT_SECRET"),
    redirectUri: process.env.UPWORK_REDIRECT_URI || "http://localhost:3000/callback",
    outputDir: process.env.OUTPUT_DIR || join(homeDir, "Documents/Obsidian/Personal/+Inbox/Upwork"),
    tokensPath: join(PROJECT_ROOT, "data/tokens.json"),
    seenJobsPath: join(PROJECT_ROOT, "data/seen-jobs.json"),
    searchProfilePath: join(PROJECT_ROOT, "search-profile.yaml"),
    apiBaseUrl: "https://api.upwork.com/graphql",
    triageEnabled,
    triageProfilePath,
    claudeBin: process.env.CLAUDE_BIN || "claude",
    triageTimeoutMs: Number(process.env.TRIAGE_TIMEOUT_MS) || 600_000,
    maintenanceEnabled: process.env.MAINTENANCE_ENABLED !== "false",
  };
}
