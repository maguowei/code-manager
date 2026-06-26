import { act, render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ClaudeDirectoryTree } from "../ClaudeDirectoryTree";

// 单例可控 model：getSearchValue 模拟搜索过滤态、resetPaths 间谍、捕获 onSearchChange 供测试驱动。
const hoisted = vi.hoisted(() => {
  const searchValueRef = { current: "" };
  const resetPathsMock = vi.fn();
  const onSearchChangeRef = { current: null as ((value: string | null) => void) | null };
  const model = {
    getItem: () => null,
    getSearchValue: () => searchValueRef.current,
    resetPaths: resetPathsMock,
  };
  return { searchValueRef, resetPathsMock, onSearchChangeRef, model };
});

vi.mock("@pierre/trees", () => ({
  createFileTreeIconResolver: () => ({
    resolveIcon: () => ({
      name: "file",
      token: "default",
      width: 16,
      height: 16,
      viewBox: "0 0 16 16",
    }),
  }),
  getBuiltInSpriteSheet: () => "<svg></svg>",
  prepareFileTreeInput: (paths: string[]) => ({ paths }),
}));

vi.mock("@pierre/trees/react", () => ({
  useFileTree: (options: { onSearchChange?: (value: string | null) => void }) => {
    hoisted.onSearchChangeRef.current = options.onSearchChange ?? null;
    return { model: hoisted.model };
  },
  FileTree: () => <div data-testid="pierre-file-tree" />,
}));

const PATHS_A = ["a/", "a/x.ts"];
const PATHS_B = ["a/", "a/x.ts", "b/"];

describe("ClaudeDirectoryTree refresh during search", () => {
  beforeEach(() => {
    hoisted.searchValueRef.current = "";
    hoisted.onSearchChangeRef.current = null;
    hoisted.resetPathsMock.mockClear();
  });

  it("applies the initial paths through resetPaths", () => {
    render(<ClaudeDirectoryTree paths={PATHS_A} onSelectPath={vi.fn()} />);

    expect(hoisted.resetPathsMock).toHaveBeenCalledTimes(1);
    expect(hoisted.resetPathsMock).toHaveBeenLastCalledWith(PATHS_A, expect.anything());
  });

  it("does not reset the tree while a search filter is active", () => {
    const { rerender } = render(<ClaudeDirectoryTree paths={PATHS_A} onSelectPath={vi.fn()} />);
    hoisted.resetPathsMock.mockClear();

    // 模拟搜索过滤生效中，后台 watcher 刷新带来新 paths
    hoisted.searchValueRef.current = "x";
    rerender(<ClaudeDirectoryTree paths={PATHS_B} onSelectPath={vi.fn()} />);

    // 搜索期间不得 resetPaths，否则会用 initialExpandedPaths 打断 hide-non-matches
    expect(hoisted.resetPathsMock).not.toHaveBeenCalled();
  });

  it("flushes the latest paths once the search is cleared", () => {
    const { rerender } = render(<ClaudeDirectoryTree paths={PATHS_A} onSelectPath={vi.fn()} />);
    hoisted.searchValueRef.current = "x";
    rerender(<ClaudeDirectoryTree paths={PATHS_B} onSelectPath={vi.fn()} />);
    hoisted.resetPathsMock.mockClear();

    // 搜索清空：库回调 onSearchChange，应 flush 暂存的最新 paths
    hoisted.searchValueRef.current = "";
    act(() => {
      hoisted.onSearchChangeRef.current?.("");
    });

    expect(hoisted.resetPathsMock).toHaveBeenCalledTimes(1);
    expect(hoisted.resetPathsMock).toHaveBeenLastCalledWith(PATHS_B, expect.anything());
  });

  it("resets normally when paths change outside of search", () => {
    const { rerender } = render(<ClaudeDirectoryTree paths={PATHS_A} onSelectPath={vi.fn()} />);
    hoisted.resetPathsMock.mockClear();

    // 非搜索态（getSearchValue 返回空串）下刷新应照常 resetPaths
    rerender(<ClaudeDirectoryTree paths={PATHS_B} onSelectPath={vi.fn()} />);

    expect(hoisted.resetPathsMock).toHaveBeenCalledTimes(1);
    expect(hoisted.resetPathsMock).toHaveBeenLastCalledWith(PATHS_B, expect.anything());
  });
});
