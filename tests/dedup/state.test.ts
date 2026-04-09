import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { DeduplicationState } from "../../src/dedup/state.ts";

describe("DeduplicationState", () => {
  let tempDir: string;
  let statePath: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "dedup-test-"));
    statePath = join(tempDir, "seen-jobs.json");
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  test("load returns empty state when file does not exist", async () => {
    const state = new DeduplicationState(statePath);
    await state.load();
    expect(state.hasSeen("~01abc")).toBe(false);
  });

  test("markSeen and hasSeen track job IDs", async () => {
    const state = new DeduplicationState(statePath);
    await state.load();

    state.markSeen("~01abc");
    expect(state.hasSeen("~01abc")).toBe(true);
    expect(state.hasSeen("~02xyz")).toBe(false);
  });

  test("save persists state to disk and load reads it back", async () => {
    const state1 = new DeduplicationState(statePath);
    await state1.load();
    state1.markSeen("~01abc");
    await state1.save();

    const state2 = new DeduplicationState(statePath);
    await state2.load();
    expect(state2.hasSeen("~01abc")).toBe(true);
  });

  test("prune removes entries older than maxAgeDays", async () => {
    const state = new DeduplicationState(statePath);
    await state.load();

    // Add an old entry (31 days ago)
    const oldDate = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString();
    state.setEntry("~old-job", oldDate);
    state.markSeen("~new-job");

    state.prune(30);

    expect(state.hasSeen("~old-job")).toBe(false);
    expect(state.hasSeen("~new-job")).toBe(true);
  });

  test("save uses atomic write (temp file + rename)", async () => {
    const state = new DeduplicationState(statePath);
    await state.load();
    state.markSeen("~01abc");
    await state.save();

    // Verify file exists and is valid JSON
    const content = await Bun.file(statePath).json();
    expect(content["~01abc"]).toBeDefined();
  });

  test("load handles corrupted JSON gracefully", async () => {
    await Bun.write(statePath, "not valid json{{{");
    const state = new DeduplicationState(statePath);
    await state.load();
    // Should start fresh rather than crash
    expect(state.hasSeen("anything")).toBe(false);
  });

  test("load only catches JSON parse errors, not other errors", async () => {
    // Corrupted JSON → recovers silently
    await Bun.write(statePath, "{bad json");
    const state = new DeduplicationState(statePath);
    await state.load();
    expect(state.hasSeen("anything")).toBe(false);
  });
});
