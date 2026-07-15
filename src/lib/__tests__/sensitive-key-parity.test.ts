import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { isSensitiveSettingsKey } from "../settings-secrets";

// 敏感键判定同时存在于前端 settings-secrets.ts 与后端 config.rs::is_sensitive_settings_key，
// 两端各自内联维护敏感键判定规则（精确匹配 + 前后缀/子串模式）。
// 用同一份共享语料作为预期结果的单一事实源，任一端实现漂移即红。
// 后端对照断言见 src-tauri/src/config.rs::is_sensitive_settings_key_matches_shared_fixture。
const fixturePath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../src-tauri/tests/fixtures/sensitive-settings-keys.json",
);
const cases = JSON.parse(readFileSync(fixturePath, "utf-8")) as Array<{
  key: string;
  sensitive: boolean;
}>;

// 防止语料被清空后 it.each([]) 空跑仍绿
const MIN_FIXTURE_CASES = 20;

describe("sensitive-key parity", () => {
  it("loads a non-empty shared fixture with both polarities", () => {
    expect(cases.length).toBeGreaterThanOrEqual(MIN_FIXTURE_CASES);
    expect(cases.some((c) => c.sensitive)).toBe(true);
    expect(cases.some((c) => !c.sensitive)).toBe(true);
  });

  it.each(cases)("$key -> $sensitive", ({ key, sensitive }) => {
    expect(isSensitiveSettingsKey(key)).toBe(sensitive);
  });
});
