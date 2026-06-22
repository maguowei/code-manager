import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../../i18n";
import ProviderDefaultsActions from "./ProviderDefaultsActions";
import type { SettingsFieldDefinition } from "./settings-form-registry";

// 测试用最小字段定义工厂
function field(key: string, envKey: string, zh: string): SettingsFieldDefinition {
  return {
    key,
    section: "behavior",
    kind: "text",
    storage: "env-only",
    envKey,
    label: { zh, en: zh },
  };
}

interface FieldState {
  value: string;
  providerDefault: string;
  source: "override" | "inherited" | "unset";
}

const FIELDS: SettingsFieldDefinition[] = [
  field("model", "ANTHROPIC_MODEL", "默认模型"),
  field("defaultOpusModel", "ANTHROPIC_DEFAULT_OPUS_MODEL", "Opus 默认模型"),
  field("subagentModel", "CLAUDE_CODE_SUBAGENT_MODEL", "Subagent 模型"),
];

// 默认场景：model 被覆盖、opus 继承自供应商、subagent 未设置且无供应商默认
const DEFAULT_STATES: Record<string, FieldState> = {
  model: { value: "my-custom-model", providerDefault: "claude-opus-4-8", source: "override" },
  defaultOpusModel: { value: "", providerDefault: "claude-opus-4-8", source: "inherited" },
  subagentModel: { value: "", providerDefault: "", source: "unset" },
};

function renderActions(
  states: Record<string, FieldState> = DEFAULT_STATES,
  overrides: Partial<{
    onRestoreDefaults: () => void;
    onFreezeDefaults: () => void;
  }> = {},
) {
  const onRestoreDefaults = overrides.onRestoreDefaults ?? vi.fn();
  const onFreezeDefaults = overrides.onFreezeDefaults ?? vi.fn();
  render(
    <I18nProvider>
      <ProviderDefaultsActions
        fields={FIELDS}
        readFieldState={(f) => states[f.key]}
        onRestoreDefaults={onRestoreDefaults}
        onFreezeDefaults={onFreezeDefaults}
      />
    </I18nProvider>,
  );
  return { onRestoreDefaults, onFreezeDefaults };
}

describe("ProviderDefaultsActions", () => {
  it("渲染恢复/固化两个按钮", () => {
    renderActions();
    expect(screen.getByRole("button", { name: "恢复默认" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "固化当前值" })).toBeInTheDocument();
  });

  it("恢复弹窗列出被覆盖字段并在确认后回调", () => {
    const { onRestoreDefaults } = renderActions();
    fireEvent.click(screen.getByRole("button", { name: "恢复默认" }));

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("恢复供应商默认设置")).toBeInTheDocument();
    // 仅被覆盖的「默认模型」出现在预览中，继承/未设置字段不出现
    expect(within(dialog).getByText("默认模型")).toBeInTheDocument();
    expect(within(dialog).getByText("my-custom-model")).toBeInTheDocument();
    expect(within(dialog).queryByText("Subagent 模型")).not.toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: "确认应用" }));
    expect(onRestoreDefaults).toHaveBeenCalledTimes(1);
  });

  it("固化弹窗列出继承字段并在确认后回调", () => {
    const { onFreezeDefaults } = renderActions();
    fireEvent.click(screen.getByRole("button", { name: "固化当前值" }));

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("固化供应商默认值")).toBeInTheDocument();
    // 仅继承自供应商的「Opus 默认模型」出现在预览中
    expect(within(dialog).getByText("Opus 默认模型")).toBeInTheDocument();
    expect(within(dialog).queryByText("默认模型")).not.toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: "确认应用" }));
    expect(onFreezeDefaults).toHaveBeenCalledTimes(1);
  });

  it("无可恢复字段时弹窗显示空状态且确认按钮禁用", () => {
    const allInherited: Record<string, FieldState> = {
      model: { value: "", providerDefault: "claude-opus-4-8", source: "inherited" },
      defaultOpusModel: { value: "", providerDefault: "claude-opus-4-8", source: "inherited" },
      subagentModel: { value: "", providerDefault: "", source: "unset" },
    };
    renderActions(allInherited);
    fireEvent.click(screen.getByRole("button", { name: "恢复默认" }));

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("当前没有可恢复的自定义值。")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "确认应用" })).toBeDisabled();
  });
});
