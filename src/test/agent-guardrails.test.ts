import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const repoRoot = resolve(__dirname, "../..");
const bashPolicyPath = join(repoRoot, ".claude/hooks/bash-policy.mjs");
const nodeExecPath = execFileSync("node", ["-p", "process.execPath"], { encoding: "utf8" }).trim();
const prePushVerifyPath = join(repoRoot, ".claude/hooks/pre-push-verify.mjs");
const stopReminderPath = join(repoRoot, ".claude/hooks/stop-quality-reminder.mjs");
const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    const tempDir = tempDirs.pop();
    if (tempDir) {
      rmSync(tempDir, { force: true, recursive: true });
    }
  }
});

describe("bash-policy hook", () => {
  it.each([
    "git commit -nm msg",
    "git commit --no-veri -m msg",
    "git push --no-veri origin HEAD",
    "LEFTHOOK=false git commit -m msg",
    "LEFTHOOK=FALSE git push origin HEAD",
    "env LEFTHOOK=false git commit -m msg",
  ])("blocks hook bypass command: %s", (command) => {
    expect(runBashPolicy(command).status).toBe(2);
  });

  it("blocks commit and push aliases that bypass hooks", () => {
    const cwd = createGitRepo();
    execFileSync("git", ["config", "alias.ci", "commit"], { cwd });
    execFileSync("git", ["config", "alias.p", "push"], { cwd });

    expect(runBashPolicy("git ci -n -m msg", cwd).status).toBe(2);
    expect(runBashPolicy("git p --no-veri origin HEAD", cwd).status).toBe(2);
  });

  it.each([
    "git commit -m msg",
    "git push origin HEAD",
    "git config --get core.hooksPath",
    "git config --list",
  ])("allows non-bypass command: %s", (command) => {
    expect(runBashPolicy(command).status).toBe(0);
  });

  it.each([
    "cat .env.local",
    "grep TOKEN .env",
    "awk '/KEY/' .env",
    "node -e \"require('node:fs').readFileSync('.env', 'utf8')\"",
    "python3 -c \"from pathlib import Path; Path('.env').read_text()\"",
  ])("blocks sensitive file reads through Bash: %s", (command) => {
    expect(runBashPolicy(command).status).toBe(2);
  });
});

describe("stop-quality-reminder hook", () => {
  it("does not block recursive Stop hook invocations", () => {
    const cwd = createGitRepo();
    mkdirSync(join(cwd, "src"));
    writeFileSync(join(cwd, "src/example.ts"), "export const value = 1;\n");

    const result = runStopReminder({ hook_event_name: "Stop", stop_hook_active: true }, cwd);

    expect(result.status).toBe(0);
  });

  it("detects staged non-ASCII source paths when Git quotes paths", () => {
    const cwd = createGitRepo();
    execFileSync("git", ["config", "core.quotePath", "true"], { cwd });
    mkdirSync(join(cwd, "src"));
    writeFileSync(join(cwd, "src/中文组件.tsx"), "export const value = 1;\n");
    execFileSync("git", ["add", "src/中文组件.tsx"], { cwd });

    const result = runStopReminder({ hook_event_name: "Stop" }, cwd);

    expect(result.status).toBe(2);
    expect(result.stderr).toContain("make lint-frontend");
  });
});

describe("pre-push verify hook", () => {
  it("skips local verify for tag-only pushes", () => {
    const result = runPrePushVerify("refs/heads/codex-hook abc refs/tags/v0.20.0 def\n");

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("跳过");
  });

  it("runs local verify for branch pushes and manual runs", () => {
    expect(runPrePushVerify("refs/heads/codex-hook abc refs/heads/codex-hook def\n").status).toBe(
      23,
    );
    expect(runPrePushVerify("").status).toBe(23);
  });
});

function runBashPolicy(command: string, cwd = repoRoot) {
  return spawnSync(nodeExecPath, [bashPolicyPath], {
    cwd,
    encoding: "utf8",
    input: JSON.stringify({
      hook_event_name: "PreToolUse",
      tool_input: { command },
      tool_name: "Bash",
    }),
  });
}

function runStopReminder(input: Record<string, unknown>, cwd: string) {
  return spawnSync(nodeExecPath, [stopReminderPath], {
    cwd,
    encoding: "utf8",
    input: JSON.stringify(input),
  });
}

function runPrePushVerify(input: string) {
  return spawnSync(nodeExecPath, [prePushVerifyPath], {
    cwd: repoRoot,
    encoding: "utf8",
    env: {
      AI_MANAGER_PRE_PUSH_VERIFY_COMMAND: `${JSON.stringify(nodeExecPath)} -e "process.exit(23)"`,
    },
    input,
  });
}

function createGitRepo() {
  const cwd = mkdtempSync(join(tmpdir(), "ai-manager-agent-guardrails-"));
  tempDirs.push(cwd);
  execFileSync("git", ["init", "-q"], { cwd });
  execFileSync("git", ["config", "user.email", "agent-guardrails@example.com"], { cwd });
  execFileSync("git", ["config", "user.name", "Agent Guardrails"], { cwd });
  return cwd;
}
