import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { loadSearchProfile, parsePostedWithin } from "../../src/search/profile.ts";

test("parsePostedWithin handles hours, days, weeks", () => {
  expect(parsePostedWithin("24h")).toBe(1);
  expect(parsePostedWithin("1h")).toBe(1);  // rounds up to minimum 1 day
  expect(parsePostedWithin("3d")).toBe(3);
  expect(parsePostedWithin("2w")).toBe(14);
  expect(parsePostedWithin("")).toBe(1);    // default
  expect(parsePostedWithin("bogus")).toBe(1);
});

describe("loadSearchProfile", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "profile-test-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  test("parses valid search-profile.yaml", async () => {
    const yamlContent = `
searches:
  - terms: ["React", "TypeScript"]
    category: "Web Development"
  - terms: ["AI", "LLM"]
    category: "Web Development"

filters:
  experienceLevel: "EXPERT"
  hourlyBudgetMin: 50
  jobType: ["HOURLY", "FIXED"]
  clientHiresCount_gte: 1
  postedWithin: "24h"
`;
    const profilePath = join(tempDir, "search-profile.yaml");
    await Bun.write(profilePath, yamlContent);

    const profile = await loadSearchProfile(profilePath);

    expect(profile.searches).toHaveLength(2);
    expect(profile.searches[0].terms).toEqual(["React", "TypeScript"]);
    expect(profile.searches[0].category).toBe("Web Development");
    expect(profile.filters.experienceLevel).toBe("EXPERT");
    expect(profile.filters.hourlyBudgetMin).toBe(50);
    expect(profile.filters.jobType).toEqual(["HOURLY", "FIXED"]);
    expect(profile.filters.clientHiresCount_gte).toBe(1);
    expect(profile.filters.postedWithin).toBe("24h");
    expect(profile.filters.daysPosted).toBe(1);
  });

  test("throws when file does not exist", async () => {
    const badPath = join(tempDir, "nonexistent.yaml");
    await expect(loadSearchProfile(badPath)).rejects.toThrow();
  });
});
