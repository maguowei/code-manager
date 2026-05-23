import { readFileSync } from "node:fs";

const input = readHookInput();
const command = input?.tool_input?.command;
const coreHooksPathWritePattern =
  /\bgit\b[\s\S]*\bconfig\b(?![\s\S]*(?:--get|get-regexp|--list))[\s\S]*\bcore\.hooksPath\b/;

if (input?.hook_event_name !== "PreToolUse" || input?.tool_name !== "Bash" || !command) {
  process.exit(0);
}

const checks = [
  {
    matches: (value) =>
      /\bgit\b[\s\S]*\bcommit\b[\s\S]*(?:--no-verify|(?:^|\s)-n(?:\s|$))/.test(value),
    message: "禁止绕过 commit-msg / pre-commit hook。请移除 --no-verify 或 -n。",
  },
  {
    matches: (value) => /\bgit\b[\s\S]*\bpush\b[\s\S]*--no-verify/.test(value),
    message: "禁止绕过 pre-push hook。请移除 --no-verify。",
  },
  {
    matches: (value) =>
      /(?:^|[\s;&|()])LEFTHOOK=0\b[\s\S]*\bgit\b[\s\S]*\b(?:commit|push)\b/.test(value),
    message: "禁止通过 LEFTHOOK=0 绕过本地 Git hook。",
  },
  {
    matches: (value) => /\bgit\s+-c\s+core\.hooksPath(?:=|\s)/.test(value),
    message: "禁止通过 git -c core.hooksPath 绕过本地 Git hook。",
  },
  {
    matches: (value) => coreHooksPathWritePattern.test(value),
    message: "禁止修改 core.hooksPath。项目 hook 由 lefthook 管理。",
  },
];

const violation = checks.find((check) => check.matches(command));

if (violation) {
  console.error(`AI Manager hook policy: ${violation.message}`);
  process.exit(2);
}

function readHookInput() {
  try {
    const raw = readFileSync(0, "utf8").trim();
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}
