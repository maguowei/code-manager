// 每夜构建版本注入：校验正式版本源后生成 Tauri 临时 overlay，不改写仓库内的正式版本文件。
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(import.meta.dirname, "..");
const STABLE_VERSION_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const COMMIT_SHA_PATTERN = /^[0-9a-f]{7,40}$/i;

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function readCargoPackageVersion(path) {
  const cargoToml = readFileSync(path, "utf8");
  const packageSection = cargoToml.match(/\[package\]([\s\S]*?)(?=\n\[|$)/)?.[1];
  const version = packageSection?.match(/^version\s*=\s*"([^"]+)"/m)?.[1];
  if (!version) {
    throw new Error(`无法从 ${path} 读取 [package].version`);
  }
  return version;
}

/** 读取并校验三个正式版本源，避免 Nightly 建立在漂移的基础版本上。 */
export function readCanonicalBaseVersion(rootDir = root) {
  const versions = {
    "package.json": readJson(resolve(rootDir, "package.json")).version,
    "src-tauri/Cargo.toml": readCargoPackageVersion(resolve(rootDir, "src-tauri/Cargo.toml")),
    "src-tauri/tauri.conf.json": readJson(resolve(rootDir, "src-tauri/tauri.conf.json")).version,
  };
  const uniqueVersions = new Set(Object.values(versions));
  if (uniqueVersions.size !== 1) {
    const details = Object.entries(versions)
      .map(([path, version]) => `${path}=${String(version)}`)
      .join(", ");
    throw new Error(`正式版本源不一致: ${details}`);
  }

  const [baseVersion] = uniqueVersions;
  if (typeof baseVersion !== "string" || !STABLE_VERSION_PATTERN.test(baseVersion)) {
    throw new Error(`正式版本必须是稳定 SemVer: ${String(baseVersion)}`);
  }
  return baseVersion;
}

/** g 前缀保证纯数字且以 0 开头的短 SHA 仍是合法 SemVer prerelease 标识符。 */
export function createNightlyVersion(baseVersion, commitSha) {
  if (!STABLE_VERSION_PATTERN.test(baseVersion)) {
    throw new Error(`正式版本必须是稳定 SemVer: ${baseVersion}`);
  }
  const normalizedSha = commitSha.trim().toLowerCase();
  if (!COMMIT_SHA_PATTERN.test(normalizedSha)) {
    throw new Error("commit SHA 必须是至少 7 位、至多 40 位的十六进制字符串");
  }
  return `${baseVersion}-nightly.g${normalizedSha.slice(0, 7)}`;
}

/** overlay 同时注入版本并清空 updater endpoint，防止 Nightly 访问稳定更新通道。 */
export function writeNightlyConfig(outputPath, version) {
  const config = {
    version,
    plugins: {
      updater: {
        endpoints: [],
      },
    },
  };
  writeFileSync(outputPath, `${JSON.stringify(config, null, 2)}\n`);
}

function resolveCommitSha() {
  const environmentSha = process.env.GITHUB_SHA?.trim();
  if (environmentSha) return environmentSha;
  return execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  }).trim();
}

export function runCli(args = process.argv.slice(2)) {
  const command = args[0] ?? "--print";
  const baseVersion = readCanonicalBaseVersion(root);
  const version = createNightlyVersion(baseVersion, resolveCommitSha());

  if (process.env.NIGHTLY_VERSION && process.env.NIGHTLY_VERSION !== version) {
    throw new Error(
      `Nightly 版本不一致: expected=${process.env.NIGHTLY_VERSION}, actual=${version}`,
    );
  }

  if (command === "--write-config") {
    const outputPath = args[1];
    if (!outputPath) throw new Error("--write-config 需要输出路径");
    writeNightlyConfig(resolve(root, outputPath), version);
  } else if (command !== "--print") {
    throw new Error(`未知参数: ${command}`);
  }

  // stdout 是 workflow 的机器可读契约，只输出纯 SemVer。
  process.stdout.write(`${version}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    runCli();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
