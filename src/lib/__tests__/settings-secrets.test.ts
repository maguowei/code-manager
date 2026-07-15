import { describe, expect, it } from "vitest";
import {
  isSensitiveSettingsKey,
  settingsJsonContainsSecrets,
  settingsValueContainsSecrets,
} from "../settings-secrets";

describe("settings-secrets", () => {
  it("detects sensitive key shapes aligned with backend", () => {
    expect(isSensitiveSettingsKey("ANTHROPIC_AUTH_TOKEN")).toBe(true);
    expect(isSensitiveSettingsKey("api_key")).toBe(true);
    expect(isSensitiveSettingsKey("Authorization")).toBe(true);
    expect(isSensitiveSettingsKey("model")).toBe(false);
  });

  it("flags nested non-empty secrets and ignores blank ones", () => {
    expect(
      settingsValueContainsSecrets({
        env: { ANTHROPIC_AUTH_TOKEN: "secret", ANTHROPIC_MODEL: "claude" },
      }),
    ).toBe(true);
    expect(
      settingsValueContainsSecrets({
        env: { ANTHROPIC_AUTH_TOKEN: "  ", ANTHROPIC_MODEL: "claude" },
      }),
    ).toBe(false);
  });

  it("parses preview JSON text and fails closed on invalid JSON", () => {
    expect(settingsJsonContainsSecrets('{"env":{"ANTHROPIC_API_KEY":"k"}}')).toBe(true);
    expect(settingsJsonContainsSecrets('{"model":"claude"}')).toBe(false);
    expect(settingsJsonContainsSecrets("not-json")).toBe(false);
  });
});
