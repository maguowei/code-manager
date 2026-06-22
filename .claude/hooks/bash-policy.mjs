import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const input = readHookInput();
const command = input?.tool_input?.command;
const coreHooksPathWritePattern =
  /\bgit\b[\s\S]*\bconfig\b(?![\s\S]*(?:--get|get-regexp|--list))[\s\S]*\bcore\.hooksPath\b/;
const tokens = command ? tokenize(command) : [];
const gitAliases = command ? readGitAliases() : new Map();

if (input?.hook_event_name !== "PreToolUse" || input?.tool_name !== "Bash" || !command) {
  process.exit(0);
}

const checks = [
  {
    matches: () => hasGitHookBypass(tokens, gitAliases),
    message: "禁止绕过 commit-msg / pre-commit hook。请移除 --no-verify 或 -n。",
  },
  {
    matches: (value) => /\bLEFTHOOK=(?:0|false)\b/i.test(value) && hasGitHookTarget(tokens, gitAliases),
    message: "禁止通过 LEFTHOOK=0/false 绕过本地 Git hook。",
  },
  {
    matches: (value) => /\bgit\s+-c\s+core\.hooksPath(?:=|\s)/.test(value),
    message: "禁止通过 git -c core.hooksPath 绕过本地 Git hook。",
  },
  {
    matches: (value) => coreHooksPathWritePattern.test(value),
    message: "禁止修改 core.hooksPath。项目 hook 由 lefthook 管理。",
  },
  {
    matches: () => readsSensitiveFile(tokens, command),
    message: "禁止通过 Bash 读取 .env 或 secret 文件。",
  },
];

const violation = checks.find((check) => check.matches(command));

if (violation) {
  console.error(`Code Manager hook policy: ${violation.message}`);
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

function tokenize(value) {
  const result = [];
  let current = "";
  let quote = null;
  let escaping = false;

  for (const char of value) {
    if (escaping) {
      current += char;
      escaping = false;
      continue;
    }

    if (char === "\\") {
      escaping = true;
      continue;
    }

    if (quote) {
      if (char === quote) {
        quote = null;
      } else {
        current += char;
      }
      continue;
    }

    if (char === "'" || char === '"') {
      quote = char;
      continue;
    }

    if (/\s/.test(char) || /[;&|()]/.test(char)) {
      if (current) {
        result.push(current);
        current = "";
      }
      continue;
    }

    current += char;
  }

  if (current) {
    result.push(current);
  }

  return result;
}

function readGitAliases() {
  try {
    const output = execFileSync("git", ["config", "--get-regexp", "^alias\\."], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    const aliases = new Map();

    for (const line of output.split("\n")) {
      const match = /^alias\.([^\s]+)\s+(.+)$/.exec(line.trim());
      if (match) {
        aliases.set(match[1], match[2]);
      }
    }

    return aliases;
  } catch {
    return new Map();
  }
}

function hasGitHookBypass(valueTokens, aliases) {
  return getGitTargets(valueTokens, aliases).some(({ args, target }) => {
    if (args.some((arg) => arg.startsWith("--no-ver"))) {
      return true;
    }

    return target === "commit" && args.some(isNoVerifyShortOption);
  });
}

function hasGitHookTarget(valueTokens, aliases) {
  return getGitTargets(valueTokens, aliases).some(({ target }) => target === "commit" || target === "push");
}

function getGitTargets(valueTokens, aliases) {
  const targets = [];

  for (let index = 0; index < valueTokens.length; index += 1) {
    if (valueTokens[index] !== "git") {
      continue;
    }

    const targetIndex = findGitSubcommandIndex(valueTokens, index + 1);
    if (targetIndex >= valueTokens.length) {
      continue;
    }

    const target = resolveGitTarget(valueTokens[targetIndex], aliases);
    if (target) {
      targets.push({ args: valueTokens.slice(targetIndex + 1), target });
    }
  }

  return targets;
}

function findGitSubcommandIndex(valueTokens, startIndex) {
  let index = startIndex;

  while (index < valueTokens.length) {
    const token = valueTokens[index];

    if (!token.startsWith("-")) {
      return index;
    }

    if (["-C", "-c", "--git-dir", "--work-tree", "--namespace"].includes(token)) {
      index += 2;
      continue;
    }

    index += 1;
  }

  return index;
}

function resolveGitTarget(token, aliases) {
  if (token === "commit" || token === "push") {
    return token;
  }

  const alias = aliases.get(token);
  if (!alias) {
    return null;
  }

  const aliasTokens = tokenize(alias.replace(/^!/, ""));
  const first = aliasTokens[0] === "git" ? aliasTokens[1] : aliasTokens[0];
  return first === "commit" || first === "push" ? first : null;
}

function isNoVerifyShortOption(token) {
  return token.startsWith("-") && !token.startsWith("--") && token.slice(1).includes("n");
}

function readsSensitiveFile(valueTokens, rawCommand) {
  const readCommands = new Set([
    "ag",
    "awk",
    "cat",
    "grep",
    "head",
    "less",
    "more",
    "nl",
    "rg",
    "sed",
    "strings",
    "tail",
  ]);
  const interpreters = /^(?:node|python3?|ruby|perl)$/;

  if (
    valueTokens.some((token) => readCommands.has(token)) &&
    valueTokens.some((token) => isSensitivePath(token))
  ) {
    return true;
  }

  return valueTokens.some((token) => interpreters.test(token)) && containsSensitivePath(rawCommand);
}

function isSensitivePath(token) {
  const normalized = token.replace(/^['"]|['"]$/g, "");
  const parts = normalized.split(/[\\/]/);
  const name = parts.at(-1) ?? normalized;
  return /^\.env(?:\.|$|-)/.test(name) || /secrets?/i.test(name);
}

function containsSensitivePath(value) {
  return /(^|[ "'`=([{,;:/\\])\.env(?:[.\w-]*)?\b/.test(value) || /secrets?/i.test(value);
}
