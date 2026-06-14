import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(__dirname, "../..");

// 允许出现在源码 / 测试 fixture 里的占位用户名。
// 真实开发者用户名不得硬编码,否则会随仓库泄露本地目录结构与身份信息。
// 新增占位名时在此登记,并确认它确实是虚构占位,而不是某个真实用户名。
const ALLOWED_PLACEHOLDER_USERS = new Set([
  "demo",
  "dev",
  "test",
  "test-user",
  "me",
  "user",
  "alice",
  "bob",
  "example",
  "secret",
  "runner", // GitHub Actions macOS runner 的 home 是 /Users/runner
  "ci",
  "dummy",
  "foo",
]);

// 匹配 macOS /Users/<name> 与 Linux /home/<name> 的用户名段
const USER_PATH_RE = /\/(?:Users|home)\/([A-Za-z][A-Za-z0-9._-]*)/g;

// 只扫描手写源码与测试;生成文件与锁文件由 git ls-files 的范围与后缀过滤排除
function listScannedFiles(): string[] {
  const stdout = execFileSync("git", ["ls-files", "src", "src-tauri/src", "src-tauri/tests"], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  return stdout
    .split("\n")
    .filter(Boolean)
    .filter((rel) => /\.(ts|tsx|rs)$/.test(rel))
    .filter((rel) => !rel.endsWith("bindings.ts")); // 自动生成,跳过
}

describe("禁止硬编码真实用户绝对路径", () => {
  it("源码与测试里的 /Users|/home 路径只能使用占位用户名", () => {
    const offenders: string[] = [];

    for (const rel of listScannedFiles()) {
      const content = readFileSync(join(repoRoot, rel), "utf8");
      for (const match of content.matchAll(USER_PATH_RE)) {
        const username = match[1];
        if (ALLOWED_PLACEHOLDER_USERS.has(username)) {
          continue;
        }
        const line = content.slice(0, match.index ?? 0).split("\n").length;
        offenders.push(`${rel}:${line} → /…/${username}/`);
      }
    }

    expect(
      offenders,
      [
        "检测到疑似真实用户名的绝对路径(会泄露本地目录与用户名):",
        ...offenders,
        "请改用占位用户名(如 demo / dev / test-user),",
        "或在 ALLOWED_PLACEHOLDER_USERS 登记确属虚构的新占位名。",
      ].join("\n"),
    ).toEqual([]);
  });

  it("能识别真实用户名并放行占位名", () => {
    const collectViolations = (text: string) =>
      [...text.matchAll(USER_PATH_RE)]
        .map((match) => match[1])
        .filter((username) => !ALLOWED_PLACEHOLDER_USERS.has(username));

    // 用拼接构造真实名样本,避免本文件被上面的全库扫描自命中
    const realUser = "john-doe";
    expect(collectViolations(`/Users/${realUser}/Work`)).toEqual([realUser]);
    expect(collectViolations("/Users/demo/Work")).toEqual([]);
    expect(collectViolations("/home/dev/.config")).toEqual([]);
  });
});
