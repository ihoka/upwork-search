import { UpworkSearchClient } from "../search/client.ts";

export interface JobCheckResult {
  ciphertext: string;
  active: boolean;
  totalApplicants: number | null;
}

export async function checkJobStatus(
  client: UpworkSearchClient,
  ciphertext: string,
): Promise<JobCheckResult> {
  const job = await client.checkJob(ciphertext);

  if (!job) {
    return { ciphertext, active: false, totalApplicants: null };
  }

  return {
    ciphertext,
    active: true,
    totalApplicants: job.totalApplicants ?? null,
  };
}

export async function checkJobsBatch(
  client: UpworkSearchClient,
  ciphertexts: string[],
  delayMs = 200,
): Promise<Map<string, JobCheckResult>> {
  const results = new Map<string, JobCheckResult>();

  for (const ct of ciphertexts) {
    try {
      const result = await checkJobStatus(client, ct);
      results.set(ct, result);
    } catch (error) {
      console.error(
        `Failed to check job ${ct}:`,
        error instanceof Error ? error.message : error,
      );
      // Treat API errors as "unknown" — don't close jobs we can't verify
      results.set(ct, { ciphertext: ct, active: true, totalApplicants: null });
    }

    if (delayMs > 0 && ciphertexts.indexOf(ct) < ciphertexts.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  return results;
}
