import { describe, test, expect } from "bun:test";
import { runSkill } from "../../src/triage/runner.ts";
import type { RunSkillOptions } from "../../src/triage/runner.ts";

function createMockSpawn(exitCode: number, delay = 0) {
  const calls: { cmd: string[]; opts: { stdout: string; stderr: string } }[] = [];
  const spawn = (cmd: string[], opts: { stdout: "inherit"; stderr: "inherit" }) => {
    calls.push({ cmd, opts });
    return {
      exited: new Promise<number>((resolve) =>
        delay > 0 ? setTimeout(() => resolve(exitCode), delay) : resolve(exitCode),
      ),
      kill: () => {},
    };
  };
  return { spawn, calls };
}

describe("runSkill", () => {
  test("passes correct CLI args to spawn", async () => {
    const { spawn, calls } = createMockSpawn(0);

    await runSkill({
      skill: "upwork-evaluate",
      jobsDir: "/tmp/jobs",
      profilePath: "/tmp/profile.yaml",
      claudeBin: "/usr/local/bin/claude",
      spawn,
    });

    expect(calls).toHaveLength(1);
    const [call] = calls;
    expect(call.cmd[0]).toBe("/usr/local/bin/claude");
    expect(call.cmd).toContain("-p");
    expect(call.cmd).toContain("--permission-mode");
    expect(call.cmd).toContain("bypassPermissions");
    expect(call.cmd).toContain("--allowed-tools");
    expect(call.cmd).toContain("Read,Write,Edit,Glob");
    expect(call.cmd).toContain("--add-dir");
    expect(call.cmd).toContain("/tmp/jobs");
    expect(call.opts).toEqual({ stdout: "inherit", stderr: "inherit" });

    // Verify the prompt mentions the profile path and jobs dir
    const promptIndex = call.cmd.indexOf("-p") + 1;
    const prompt = call.cmd[promptIndex];
    expect(prompt).toContain("/tmp/profile.yaml");
    expect(prompt).toContain("/tmp/jobs");
  });

  test("uses default claudeBin when not provided", async () => {
    const { spawn, calls } = createMockSpawn(0);

    await runSkill({
      skill: "upwork-evaluate",
      jobsDir: "/tmp/jobs",
      profilePath: "/tmp/profile.yaml",
      spawn,
    });

    expect(calls[0].cmd[0]).toBe("claude");
  });

  test("returns exitCode 0 on clean exit", async () => {
    const { spawn } = createMockSpawn(0);

    const result = await runSkill({
      skill: "upwork-evaluate",
      jobsDir: "/tmp/jobs",
      profilePath: "/tmp/profile.yaml",
      spawn,
    });

    expect(result.exitCode).toBe(0);
    expect(result.timedOut).toBe(false);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.skill).toBe("upwork-evaluate");
  });

  test("returns exitCode 1 on error exit — does NOT throw", async () => {
    const { spawn } = createMockSpawn(1);

    const result = await runSkill({
      skill: "upwork-evaluate",
      jobsDir: "/tmp/jobs",
      profilePath: "/tmp/profile.yaml",
      spawn,
    });

    expect(result.exitCode).toBe(1);
    expect(result.timedOut).toBe(false);
  });

  test("honors timeout: kills process and returns timedOut true", async () => {
    let killed = false;
    const spawn = (cmd: string[], opts: { stdout: "inherit"; stderr: "inherit" }) => ({
      exited: new Promise<number>(() => {
        // Never resolves — simulates a hung process
      }),
      kill: () => {
        killed = true;
      },
    });

    const result = await runSkill({
      skill: "upwork-evaluate",
      jobsDir: "/tmp/jobs",
      profilePath: "/tmp/profile.yaml",
      timeoutMs: 50,
      spawn,
    });

    expect(result.timedOut).toBe(true);
    expect(result.exitCode).toBe(-1);
    expect(killed).toBe(true);
    expect(result.durationMs).toBeGreaterThanOrEqual(50);
  });

  test("upwork-evaluate prompt contains skill name and status: new", async () => {
    const { spawn, calls } = createMockSpawn(0);

    await runSkill({
      skill: "upwork-evaluate",
      jobsDir: "/tmp/jobs",
      profilePath: "/tmp/profile.yaml",
      spawn,
    });

    const promptIndex = calls[0].cmd.indexOf("-p") + 1;
    const prompt = calls[0].cmd[promptIndex];
    expect(prompt).toContain("upwork-evaluate");
    expect(prompt).toContain("status: new");
  });

  test("upwork-propose prompt contains skill name and upwork_verdict: apply", async () => {
    const { spawn, calls } = createMockSpawn(0);

    await runSkill({
      skill: "upwork-propose",
      jobsDir: "/tmp/jobs",
      profilePath: "/tmp/profile.yaml",
      spawn,
    });

    const promptIndex = calls[0].cmd.indexOf("-p") + 1;
    const prompt = calls[0].cmd[promptIndex];
    expect(prompt).toContain("upwork-propose");
    expect(prompt).toContain("upwork_verdict: apply");
  });
});
