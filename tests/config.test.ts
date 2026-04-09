import { describe, test, expect, beforeEach, afterEach } from "bun:test";

describe("config", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.UPWORK_CLIENT_ID = "test-client-id";
    process.env.UPWORK_CLIENT_SECRET = "test-client-secret";
    process.env.UPWORK_REDIRECT_URI = "http://localhost:3000/callback";
    process.env.OUTPUT_DIR = "/tmp/test-output";
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  test("getConfig returns env vars and computed paths", async () => {
    const { getConfig } = await import("../src/config.ts");
    const config = getConfig();

    expect(config.clientId).toBe("test-client-id");
    expect(config.clientSecret).toBe("test-client-secret");
    expect(config.redirectUri).toBe("http://localhost:3000/callback");
    expect(config.outputDir).toBe("/tmp/test-output");
    expect(config.tokensPath).toContain("data/tokens.json");
    expect(config.seenJobsPath).toContain("data/seen-jobs.json");
    expect(config.searchProfilePath).toContain("search-profile.yaml");
  });

  test("getConfig throws when required env vars are missing", async () => {
    delete process.env.UPWORK_CLIENT_ID;
    // Re-import to get fresh module
    const { getConfig } = await import("../src/config.ts");
    expect(() => getConfig()).toThrow("UPWORK_CLIENT_ID");
  });

  test("getConfig uses default OUTPUT_DIR when not set", async () => {
    delete process.env.OUTPUT_DIR;
    const { getConfig } = await import("../src/config.ts");
    const config = getConfig();
    expect(config.outputDir).toContain("Obsidian");
  });
});
