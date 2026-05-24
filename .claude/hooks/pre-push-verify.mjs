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
    "AI Manager pre-push: tag-only push，跳过本地 make verify；release workflow 会运行远端质量门禁。",
  );
  process.exit(0);
}

const command = process.env.AI_MANAGER_PRE_PUSH_VERIFY_COMMAND ?? "make verify";
const result = spawnSync(command, { shell: true, stdio: "inherit" });
process.exit(result.status ?? 1);
