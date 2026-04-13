export type SkillName = "upwork-evaluate" | "upwork-propose";

export interface RunSkillOptions {
  skill: SkillName;
  jobsDir: string;
  profilePath: string;
  claudeBin?: string;
  timeoutMs?: number;
  spawn?: (
    cmd: string[],
    opts: { stdout: "inherit"; stderr: "inherit" },
  ) => { exited: Promise<number>; kill: () => void };
}

export interface SkillResult {
  skill: SkillName;
  exitCode: number;
  durationMs: number;
  timedOut: boolean;
}

const SKILL_PROMPTS: Record<SkillName, (profilePath: string, jobsDir: string) => string> = {
  "upwork-evaluate": (profilePath, jobsDir) =>
    [
      "Run the /upwork-evaluate skill.",
      `Use the triage profile at ${profilePath}.`,
      `Score job files in ${jobsDir} that have \`status: new\` in frontmatter.`,
      "When done, print a concise summary table.",
    ].join(" "),
  "upwork-propose": (profilePath, jobsDir) =>
    [
      "Run the /upwork-propose skill.",
      `Use the triage profile at ${profilePath}.`,
      `Draft proposals for job files in ${jobsDir} where \`upwork_verdict: apply\` and no draft proposal exists yet.`,
      "When done, print a concise summary.",
    ].join(" "),
};

export async function runSkill(options: RunSkillOptions): Promise<SkillResult> {
  const {
    skill,
    jobsDir,
    profilePath,
    claudeBin = "claude",
    timeoutMs = 600_000,
    spawn = (cmd, opts) => {
      const proc = Bun.spawn(cmd, opts);
      return { exited: proc.exited, kill: () => proc.kill() };
    },
  } = options;

  const prompt = SKILL_PROMPTS[skill](profilePath, jobsDir);

  const cmd = [
    claudeBin,
    "-p",
    prompt,
    "--permission-mode",
    "bypassPermissions",
    "--allowed-tools",
    "Read,Write,Edit,Glob",
    "--add-dir",
    jobsDir,
  ];

  const start = Date.now();
  const proc = spawn(cmd, { stdout: "inherit", stderr: "inherit" });

  const result = await Promise.race([
    proc.exited.then((code) => ({ exitCode: code, timedOut: false })),
    new Promise<{ exitCode: number; timedOut: boolean }>((resolve) =>
      setTimeout(() => {
        proc.kill();
        resolve({ exitCode: -1, timedOut: true });
      }, timeoutMs),
    ),
  ]);

  return {
    skill,
    exitCode: result.exitCode,
    durationMs: Date.now() - start,
    timedOut: result.timedOut,
  };
}
