import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const input = readFileSync(0, "utf8");
const refs = input
  .split("\n")
  .map((line) => line.trim())
  .filter(Boolean)
  .map((line) => {
    const [, , remoteRef] = line.split(/\s+/);
    return remoteRef;
  });

if (refs.length > 0 && refs.every((ref) => ref?.startsWith("refs/tags/"))) {
  console.log(
    "Code Manager pre-push: tag-only push，跳过本地 make verify；release workflow 会运行远端质量门禁。",
  );
  process.exit(0);
}

const steps = [
  ["Rust 格式检查", "fmt-rust-check"],
  ["代码检查", "lint"],
  ["前端构建", "build-frontend"],
  ["测试", "test"],
];

console.log(`Code Manager pre-push: 开始本地质量门禁，共 ${steps.length} 步。`);

for (const [index, [label, target]] of steps.entries()) {
  console.log(`[${index + 1}/${steps.length}] ${label}: make ${target}`);
  const result = spawnSync("make", [target], { stdio: "inherit" });
  const status = result.status ?? 1;

  if (status !== 0) {
    console.error(`Code Manager pre-push: ${label} 失败（exit ${status}）。`);
    process.exit(status);
  }
}

console.log("Code Manager pre-push: 本地质量门禁通过。");
