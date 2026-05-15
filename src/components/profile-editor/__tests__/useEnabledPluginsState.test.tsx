import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useEnabledPluginsState } from "../useEnabledPluginsState";

describe("useEnabledPluginsState", () => {
  it("从 boolean entries 构建初始 plugins,保留非布尔条目作为 preserved", () => {
    const onChange = vi.fn();
    const { result } = renderHook(() =>
      useEnabledPluginsState({
        value: { "a@official": true, "b@official": false, legacy: ["x"] },
        onChange,
      }),
    );
    expect(result.current.plugins).toEqual([
      { id: "plugin:a@official", pluginId: "a@official", enabled: true, committed: true },
      { id: "plugin:b@official", pluginId: "b@official", enabled: false, committed: true },
    ]);
    expect(result.current.preservedEntries).toEqual({ legacy: ["x"] });
  });

  it("addPlugin 在已存在时返回 false", () => {
    const { result } = renderHook(() =>
      useEnabledPluginsState({ value: { "a@official": true }, onChange: vi.fn() }),
    );
    let added: boolean | undefined;
    act(() => {
      added = result.current.addPlugin("a@official", true);
    });
    expect(added).toBe(false);
  });

  it("togglePlugin 切换 enabled 并保留 committed", () => {
    const onChange = vi.fn();
    const { result } = renderHook(() =>
      useEnabledPluginsState({ value: { "a@official": true }, onChange }),
    );
    act(() => result.current.togglePlugin("a@official"));
    expect(result.current.plugins[0].enabled).toBe(false);
    expect(result.current.plugins[0].committed).toBe(true);
  });

  it("addPlugin 新增插件并调用 onChange", () => {
    const onChange = vi.fn();
    const { result } = renderHook(() => useEnabledPluginsState({ value: {}, onChange }));
    act(() => {
      const added = result.current.addPlugin("new@official", true);
      expect(added).toBe(true);
    });
    expect(result.current.plugins).toHaveLength(1);
    expect(result.current.plugins[0]).toMatchObject({
      pluginId: "new@official",
      enabled: true,
      committed: true,
    });
    expect(onChange).toHaveBeenCalledWith({ "new@official": true });
  });

  it("removePlugin 移除插件并调用 onChange", () => {
    const onChange = vi.fn();
    const { result } = renderHook(() =>
      useEnabledPluginsState({ value: { "a@official": true }, onChange }),
    );
    act(() => result.current.removePlugin("a@official"));
    expect(result.current.plugins).toHaveLength(0);
    expect(onChange).toHaveBeenCalledWith({});
  });

  it("preservedEntries 透传到 onChange", () => {
    const onChange = vi.fn();
    const { result } = renderHook(() =>
      useEnabledPluginsState({
        value: { "a@official": true, legacy: ["x"] },
        onChange,
      }),
    );
    act(() => result.current.togglePlugin("a@official"));
    expect(onChange).toHaveBeenCalledWith({ "a@official": false, legacy: ["x"] });
  });
});
