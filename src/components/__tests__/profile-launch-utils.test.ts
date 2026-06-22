import { describe, expect, it } from "vitest";
import { buildLaunchCommands } from "../profile-launch-utils";

describe("buildLaunchCommands", () => {
  it("文件路径式：用双引号包裹路径", () => {
    const { filePathCommand } = buildLaunchCommands({
      settingsPath: "/Users/dev/.config/code-manager/launch/p1.settings.json",
      envOnlyJson: '{"env":{}}',
    });
    expect(filePathCommand).toBe(
      'claude --settings "/Users/dev/.config/code-manager/launch/p1.settings.json"',
    );
  });

  it("文件路径含空格与特殊字符时转义", () => {
    const { filePathCommand } = buildLaunchCommands({
      settingsPath: "/Users/dev/My Folder/launch/$p1.json",
      envOnlyJson: "{}",
    });
    expect(filePathCommand).toBe('claude --settings "/Users/dev/My Folder/launch/\\$p1.json"');
  });

  it("内联式：用单引号包裹紧凑 JSON", () => {
    const { inlineJsonCommand } = buildLaunchCommands({
      settingsPath: "/tmp/p1.json",
      envOnlyJson: '{"env":{"ANTHROPIC_AUTH_TOKEN":"tok"}}',
    });
    expect(inlineJsonCommand).toBe(`claude --settings '{"env":{"ANTHROPIC_AUTH_TOKEN":"tok"}}'`);
  });

  it("内联 JSON 含单引号时按 POSIX 规则转义", () => {
    const { inlineJsonCommand } = buildLaunchCommands({
      settingsPath: "/tmp/p1.json",
      envOnlyJson: `{"env":{"X":"a'b"}}`,
    });
    expect(inlineJsonCommand).toBe(`claude --settings '{"env":{"X":"a'\\''b"}}'`);
  });
});
