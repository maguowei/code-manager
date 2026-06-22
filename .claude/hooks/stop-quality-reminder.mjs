import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";

const input = readHookInput();

if (input?.hook_event_name !== "Stop" || input?.stop_hook_active === true) {
  process.exit(0);
}

const changedFiles = listChangedFiles();
const relevantFiles = changedFiles.filter(isQualityRelevant);

if (relevantFiles.length === 0) {
  process.exit(0);
}

const fingerprint = relevantFiles.map(({ status, path }) => `${status} ${path}`).join("\n");
const markerPaths = getMarkerPaths();

if (markerPaths.some((markerPath) => readMarker(markerPath) === fingerprint)) {
  process.exit(0);
}

writeMarker(markerPaths, fingerprint);

const commands = buildCommands(relevantFiles.map(({ path }) => path));

console.error(
  [
    "Code Manager quality reminder: 当前变更命中质量门禁文件，请在结束前完成匹配验证。",
    "",
    "建议运行：",
    ...commands.map((command) => `- ${command}`),
    "",
    "这是同一批变更的首次 Stop 提醒；确认后不会重复阻止同一 fingerprint，但不代表验证已完成。",
  ].join("\n"),
);

process.exit(2);

function readHookInput() {
  try {
    const raw = readFileSync(0, "utf8").trim();
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function listChangedFiles() {
  const output = runGitRaw([
    "-c",
    "core.quotePath=false",
    "status",
    "--porcelain=v1",
    "-z",
    "--untracked-files=all",
  ]);
  if (!output) {
    return [];
  }

  const entries = output.split("\0").filter(Boolean);
  const files = [];

  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    const status = entry.slice(0, 2);
    const path = entry.slice(3);

    files.push({ status, path });

    if (status[0] === "R" || status[0] === "C") {
      index += 1;
    }
  }

  return files;
}

function isQualityRelevant({ path }) {
  return (
    path.startsWith("src/") ||
    path.startsWith("src-tauri/") ||
    path.startsWith(".claude/hooks/") ||
    path.startsWith(".github/workflows/") ||
    path === ".claude/settings.json" ||
    path === "lefthook.yml" ||
    path === "Makefile" ||
    path === "package.json" ||
    path === "pnpm-lock.yaml" ||
    path === "commitlint.config.mjs" ||
    path === "biome.json" ||
    path === "vite.config.ts" ||
    path === "vitest.config.ts"
  );
}

function buildCommands(paths) {
  const commands = new Set();

  if (paths.includes(".claude/settings.json")) {
    commands.add(
      "node -e \"JSON.parse(require('node:fs').readFileSync('.claude/settings.json', 'utf8'))\"",
    );
  }

  if (paths.some((path) => path === "lefthook.yml")) {
    commands.add("pnpm exec lefthook validate");
  }

  if (paths.some((path) => path === "commitlint.config.mjs")) {
    commands.add("pnpm exec commitlint --from HEAD~1 --to HEAD");
  }

  if (paths.some((path) => path.startsWith("src-tauri/"))) {
    commands.add("make fmt-rust-check");
    commands.add("make check");
    commands.add("make lint-rust");
    commands.add("make test-rust");
  }

  if (paths.some((path) => path.startsWith("src/"))) {
    commands.add("make lint-frontend");
    commands.add("make build-frontend");
    commands.add("make test-frontend");
  }

  if (
    paths.some(
      (path) =>
        path.startsWith(".github/workflows/") ||
        path.startsWith(".claude/hooks/") ||
        [
          "Makefile",
          "package.json",
          "pnpm-lock.yaml",
          "biome.json",
          "vite.config.ts",
          "vitest.config.ts",
        ].includes(path),
    )
  ) {
    commands.add("make verify");
  }

  if (commands.size === 0) {
    commands.add("make verify");
  }

  return [...commands];
}

function getMarkerPaths() {
  const gitDir = runGit(["rev-parse", "--absolute-git-dir"]);
  const root = runGit(["rev-parse", "--show-toplevel"]) || process.cwd();
  const markerName = `code-manager-stop-quality-reminder-${hash(root)}`;

  return [
    gitDir ? join(gitDir, "code-manager-stop-quality-reminder") : null,
    join(tmpdir(), markerName),
  ].filter(Boolean);
}

function readMarker(markerPath) {
  try {
    return existsSync(markerPath) ? readFileSync(markerPath, "utf8") : "";
  } catch {
    return "";
  }
}

function writeMarker(markerPaths, value) {
  for (const markerPath of markerPaths) {
    try {
      mkdirSync(dirname(markerPath), { recursive: true });
      writeFileSync(markerPath, value);
      return;
    } catch {
      continue;
    }
  }
}

function hash(value) {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

function runGit(args) {
  try {
    return execFileSync("git", args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

function runGitRaw(args) {
  try {
    return execFileSync("git", args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    return "";
  }
}
