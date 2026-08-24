import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PluginDraft } from "./editor-utils";
import { readObject } from "./editor-utils";

export interface PluginEntry extends PluginDraft {
  committed: boolean;
}

interface UseEnabledPluginsStateOptions {
  value: unknown;
  onChange: (next: Record<string, unknown>) => void;
}

interface SplitResult {
  sourceEntries: Record<string, unknown>;
  booleanEntries: Record<string, boolean>;
  preservedEntries: Record<string, unknown>;
}

function splitEntries(value: unknown): SplitResult {
  const sourceEntries = readObject(value);
  const booleanEntries: Record<string, boolean> = {};
  const preservedEntries: Record<string, unknown> = {};
  Object.entries(sourceEntries).forEach(([id, entry]) => {
    if (typeof entry === "boolean") {
      booleanEntries[id] = entry;
    } else {
      preservedEntries[id] = entry;
    }
  });
  return { sourceEntries, booleanEntries, preservedEntries };
}

function buildEntries(value: Record<string, boolean>): PluginEntry[] {
  return Object.entries(value).map(([pluginId, enabled]) => ({
    id: `plugin:${pluginId}`,
    pluginId,
    enabled,
    committed: true,
  }));
}

function buildRecord(
  plugins: PluginEntry[],
  preservedEntries: Record<string, unknown>,
): Record<string, unknown> {
  return plugins.reduce<Record<string, unknown>>(
    (accumulator, plugin) => {
      if (plugin.committed) {
        accumulator[plugin.pluginId] = plugin.enabled;
      }
      return accumulator;
    },
    { ...preservedEntries },
  );
}

function recordsEqual(left: Record<string, unknown>, right: Record<string, unknown>): boolean {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) return false;
  return leftKeys.every(
    (key) => rightKeys.includes(key) && JSON.stringify(left[key]) === JSON.stringify(right[key]),
  );
}

export interface UseEnabledPluginsStateResult {
  plugins: PluginEntry[];
  preservedEntries: Record<string, unknown>;
  addPlugin: (pluginId: string, enabled: boolean) => boolean;
  togglePlugin: (pluginId: string) => void;
  removePlugin: (pluginId: string) => void;
}

export function useEnabledPluginsState({
  value,
  onChange,
}: UseEnabledPluginsStateOptions): UseEnabledPluginsStateResult {
  // 使用 JSON 序列化作为依赖键，避免父组件每次渲染传入新对象引用导致无限循环
  const valueKey = JSON.stringify(value);
  // biome-ignore lint/correctness/useExhaustiveDependencies: 使用 valueKey（深比较）替代 value（引用比较），防止无限渲染循环
  const { sourceEntries, booleanEntries, preservedEntries } = useMemo(
    () => splitEntries(value),
    [valueKey],
  );
  const initialPlugins = useMemo(() => buildEntries(booleanEntries), [booleanEntries]);
  const [plugins, setPlugins] = useState(initialPlugins);

  useEffect(() => setPlugins(initialPlugins), [initialPlugins]);

  useEffect(() => {
    const next = buildRecord(plugins, preservedEntries);
    if (!recordsEqual(next, sourceEntries)) onChange(next);
  }, [onChange, plugins, preservedEntries, sourceEntries]);

  // ref 镜像 plugins：addPlugin 不依赖 [plugins]，引用全程稳定，供 memo 行组件与父级 useCallback 复用。
  // 在 effect 内同步而非渲染阶段赋值：并发渲染下被丢弃的渲染会残留未提交状态，
  // 让 addPlugin 对已提交 UI 里并不存在的插件返回 false，「添加并启用」变成静默 no-op。
  const pluginsRef = useRef(plugins);
  useEffect(() => {
    pluginsRef.current = plugins;
  }, [plugins]);

  const addPlugin = useCallback((pluginId: string, enabled: boolean): boolean => {
    // 同步检查已提交状态，让调用方能立刻拿到「是否新增」的结论
    if (pluginsRef.current.some((plugin) => plugin.pluginId === pluginId)) {
      return false;
    }
    // updater 内再判一次：current 才是权威值，保证并发下不会重复追加
    setPlugins((current) =>
      current.some((plugin) => plugin.pluginId === pluginId)
        ? current
        : [...current, { id: `plugin:${pluginId}`, pluginId, enabled, committed: true }],
    );
    return true;
  }, []);

  const togglePlugin = useCallback((pluginId: string) => {
    setPlugins((current) =>
      current.map((plugin) =>
        plugin.pluginId === pluginId
          ? { ...plugin, enabled: !plugin.enabled, committed: true }
          : plugin,
      ),
    );
  }, []);

  const removePlugin = useCallback((pluginId: string) => {
    setPlugins((current) => current.filter((plugin) => plugin.pluginId !== pluginId));
  }, []);

  return { plugins, preservedEntries, addPlugin, togglePlugin, removePlugin };
}
