import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createNightlyVersion,
  readCanonicalBaseVersion,
  writeNightlyConfig,
} from "./nightly-version.mjs";

const temporaryDirectories = [];

function makeTemporaryDirectory() {
  const directory = mkdtempSync(resolve(tmpdir(), "code-manager-nightly-"));
  temporaryDirectories.push(directory);
  return directory;
}

function writeVersionFixture(root, versions) {
  mkdirSync(resolve(root, "src-tauri"), { recursive: true });
  writeFileSync(
    resolve(root, "package.json"),
    `${JSON.stringify({ version: versions.package }, null, 2)}\n`,
  );
  writeFileSync(
    resolve(root, "src-tauri/Cargo.toml"),
    `[package]\nname = "code-manager"\nversion = "${versions.cargo}"\n`,
  );
  writeFileSync(
    resolve(root, "src-tauri/tauri.conf.json"),
    `${JSON.stringify({ version: versions.tauri }, null, 2)}\n`,
  );
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("nightly version", () => {
  it("为数字开头的短 SHA 添加 g 前缀，保持合法 SemVer", () => {
    expect(createNightlyVersion("1.6.0", "0123456789abcdef")).toBe(
      "1.6.0-nightly.g0123456",
    );
  });

  it("拒绝不稳定基础版本和非法 commit SHA", () => {
    expect(() => createNightlyVersion("1.6.0-beta.1", "a123456")).toThrow(
      "正式版本必须是稳定 SemVer",
    );
    expect(() => createNightlyVersion("1.6.0", "123456")).toThrow("commit SHA");
    expect(() => createNightlyVersion("1.6.0", "not-a-sha")).toThrow("commit SHA");
  });

  it("要求三个正式版本源保持一致", () => {
    const fixtureRoot = makeTemporaryDirectory();
    writeVersionFixture(fixtureRoot, { package: "1.6.0", cargo: "1.6.0", tauri: "1.6.1" });

    expect(() => readCanonicalBaseVersion(fixtureRoot)).toThrow("正式版本源不一致");
  });

  it("生成只包含 Nightly 覆盖项的临时 Tauri 配置", () => {
    const fixtureRoot = makeTemporaryDirectory();
    const outputPath = resolve(fixtureRoot, "tauri.nightly.json");
    writeNightlyConfig(outputPath, "1.6.0-nightly.ga1b2c3d");

    expect(JSON.parse(readFileSync(outputPath, "utf8"))).toEqual({
      version: "1.6.0-nightly.ga1b2c3d",
      plugins: { updater: { endpoints: [] } },
    });
  });

  it("--print 的 stdout 只包含纯版本号", () => {
    const scriptPath = resolve(import.meta.dirname, "nightly-version.mjs");
    const stdout = execFileSync(process.execPath, [scriptPath, "--print"], {
      cwd: resolve(import.meta.dirname, ".."),
      env: { ...process.env, GITHUB_SHA: "0123456789abcdef" },
      encoding: "utf8",
    });

    expect(stdout).toBe("1.6.0-nightly.g0123456\n");
  });
});
