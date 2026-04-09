import { join } from "path";
import { mkdir } from "fs/promises";
import { getConfig } from "./config.ts";
import { TokenManager } from "./auth/oauth.ts";
import { UpworkSearchClient } from "./search/client.ts";
import { loadSearchProfile } from "./search/profile.ts";
import { DeduplicationState } from "./dedup/state.ts";
import { jobToMarkdown, sanitizeFilename } from "./transform/markdown.ts";
import type { UpworkJobPosting } from "./types.ts";

export interface RunOptions {
  accessToken: string;
  apiBaseUrl: string;
  outputDir: string;
  seenJobsPath: string;
  searchProfilePath: string;
}

export interface RunResult {
  saved: number;
  skippedDuplicates: number;
  skippedFiltered: number;
  totalFetched: number;
}

export async function runSearchCycle(options: RunOptions): Promise<RunResult> {
  const { accessToken, apiBaseUrl, outputDir, seenJobsPath, searchProfilePath } = options;

  const profile = await loadSearchProfile(searchProfilePath);

  const dedup = new DeduplicationState(seenJobsPath);
  await dedup.load();

  const client = new UpworkSearchClient(apiBaseUrl, accessToken);

  await mkdir(outputDir, { recursive: true });

  let totalFetched = 0;
  let saved = 0;
  let skippedDuplicates = 0;
  let skippedFiltered = 0;

  const allJobs = new Map<string, UpworkJobPosting>();

  for (const search of profile.searches) {
    try {
      const jobs = await client.fetchJobs(search, profile.filters);
      totalFetched += jobs.length;

      const filtered = client.filterJobs(jobs, profile.filters);
      skippedFiltered += jobs.length - filtered.length;

      // Deduplicate within this run (same job can match multiple searches)
      for (const job of filtered) {
        if (!allJobs.has(job.ciphertext)) {
          allJobs.set(job.ciphertext, job);
        }
      }
    } catch (error) {
      console.error(
        `Search failed for [${search.terms.join(", ")}]:`,
        error instanceof Error ? error.message : error,
      );
    }
  }

  for (const [jobId, job] of allJobs) {
    if (dedup.hasSeen(jobId)) {
      skippedDuplicates++;
      continue;
    }

    const markdown = jobToMarkdown(job);
    const filename = sanitizeFilename(job.title, jobId);
    const filePath = join(outputDir, filename);

    await Bun.write(filePath, markdown);
    dedup.markSeen(jobId);
    saved++;
  }

  dedup.prune(30);
  await dedup.save();

  return { saved, skippedDuplicates, skippedFiltered, totalFetched };
}

// CLI entry point — only runs when executed directly
const isMainModule = import.meta.main;
if (isMainModule) {
  try {
    const config = getConfig();
    const tokenManager = new TokenManager(config.tokensPath, config.clientId, config.clientSecret);
    const accessToken = await tokenManager.getValidToken();

    console.log("Starting Upwork job search...");
    const result = await runSearchCycle({
      accessToken,
      apiBaseUrl: config.apiBaseUrl,
      outputDir: config.outputDir,
      seenJobsPath: config.seenJobsPath,
      searchProfilePath: config.searchProfilePath,
    });

    console.log(
      `Done. Fetched: ${result.totalFetched}, Saved: ${result.saved}, ` +
        `Duplicates: ${result.skippedDuplicates}, Filtered: ${result.skippedFiltered}`,
    );
  } catch (error) {
    console.error("Search cycle failed:", error);
    process.exit(1);
  }
}
