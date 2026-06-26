import { act, render, screen, waitFor } from "@testing-library/react";
import type { ComponentProps, ReactNode } from "react";
import { useEffect } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ClaudeFilePreviewPane } from "../claude-overview/ClaudeFilePreviewPane";

const {
  filePreviewMock,
  virtualizerMock,
  virtualizerMountMock,
  virtualizerUnmountMock,
  workerPoolProviderMock,
} = vi.hoisted(() => ({
  filePreviewMock: vi.fn(),
  virtualizerMock: vi.fn(),
  virtualizerMountMock: vi.fn(),
  virtualizerUnmountMock: vi.fn(),
  workerPoolProviderMock: vi.fn(),
}));

vi.mock("@pierre/diffs/react", () => {
  return {
    File: (props: {
      className?: string;
      disableWorkerPool?: boolean;
      file: { cacheKey?: string; contents: string; name: string };
      options?: {
        disableFileHeader?: boolean;
        onPostRender?: (node: HTMLElement, instance: unknown) => unknown;
        overflow?: string;
        themeType?: string;
      };
      style?: { colorScheme?: string };
    }) => {
      filePreviewMock(props);
      return (
        <div
          data-testid="pierre-file-preview"
          className={props.className}
          data-file-name={props.file.name}
          data-file-contents={props.file.contents}
          data-disable-worker-pool={String(props.disableWorkerPool ?? false)}
          data-overflow={props.options?.overflow ?? ""}
          data-theme-type={props.options?.themeType ?? ""}
        />
      );
    },
    Virtualizer: ({
      children,
      className,
      contentClassName,
    }: {
      children: ReactNode;
      className?: string;
      contentClassName?: string;
    }) => {
      virtualizerMock({ className, contentClassName });
      // 计数挂载/卸载：remountToken 改变会换 Virtualizer 的 key，触发卸载旧实例 + 挂载新实例
      useEffect(() => {
        virtualizerMountMock();
        return () => virtualizerUnmountMock();
      }, []);
      return (
        <div data-testid="pierre-virtualizer" className={className}>
          <div data-testid="pierre-virtualizer-content" className={contentClassName}>
            {children}
          </div>
        </div>
      );
    },
    WorkerPoolContextProvider: ({
      children,
      highlighterOptions,
      poolOptions,
    }: {
      children: ReactNode;
      highlighterOptions?: unknown;
      poolOptions?: { poolSize?: number; workerFactory?: () => Worker };
    }) => {
      workerPoolProviderMock({ highlighterOptions, poolOptions });
      return <div data-testid="pierre-worker-provider">{children}</div>;
    },
  };
});

const preview = {
  path: "history.jsonl",
  name: "history.jsonl",
  content: '{"session":"alpha"}\n'.repeat(2000),
  isBinary: false,
  truncated: true,
  size: 640_000,
  modifiedAt: 10,
  encoding: "utf-8",
} as const;

function buildPane(props: Partial<ComponentProps<typeof ClaudeFilePreviewPane>> = {}) {
  return (
    <ClaudeFilePreviewPane
      openPreviews={[preview]}
      activePreview={preview}
      activePreviewPath={preview.path}
      loadingPreviewPath={null}
      viewMode="source"
      previewThemeType="dark"
      t={(key) => key}
      onSelectPreviewTab={vi.fn()}
      onClosePreview={vi.fn()}
      onToggleViewMode={vi.fn()}
      onCopyPath={vi.fn()}
      onOpenFileBrowser={vi.fn()}
      onOpenEditor={vi.fn()}
      {...props}
    />
  );
}

function renderPane(props: Partial<ComponentProps<typeof ClaudeFilePreviewPane>> = {}) {
  const result = render(buildPane(props));
  return Object.assign(result, {
    rerenderPane: (next: Partial<ComponentProps<typeof ClaudeFilePreviewPane>> = {}) =>
      result.rerender(buildPane(next)),
  });
}

describe("ClaudeFilePreviewPane", () => {
  beforeEach(() => {
    filePreviewMock.mockClear();
    virtualizerMock.mockClear();
    virtualizerMountMock.mockClear();
    virtualizerUnmountMock.mockClear();
    workerPoolProviderMock.mockClear();
  });

  it("shows a rendering state until Pierre reports the source preview has rendered", async () => {
    renderPane();

    expect(screen.getByText("claudeOverview.renderingPreview")).toBeInTheDocument();

    const latestRender = filePreviewMock.mock.calls.at(-1)?.[0];
    expect(latestRender?.options?.onPostRender).toEqual(expect.any(Function));

    await act(async () => {
      latestRender?.options?.onPostRender?.(document.createElement("div"), {});
    });

    await waitFor(() => {
      expect(screen.queryByText("claudeOverview.renderingPreview")).not.toBeInTheDocument();
    });
    expect(screen.getByTestId("pierre-file-preview")).toHaveAttribute(
      "data-file-contents",
      preview.content,
    );
  });

  it("clears the rendering overlay after a timeout when Pierre never reports onPostRender", async () => {
    vi.useFakeTimers();
    try {
      renderPane();

      expect(screen.getByText("claudeOverview.renderingPreview")).toBeInTheDocument();

      // 模拟 worker 高亮失败：onPostRender 始终不触发，靠超时兜底清除遮罩。
      await act(async () => {
        vi.advanceTimersByTime(10_000);
      });

      expect(screen.queryByText("claudeOverview.renderingPreview")).not.toBeInTheDocument();
      expect(screen.getByTestId("pierre-file-preview")).toHaveAttribute(
        "data-file-contents",
        preview.content,
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("uses Pierre worker pool and virtualizer for source previews without disabling workers", () => {
    renderPane();

    expect(workerPoolProviderMock).toHaveBeenCalledWith(
      expect.objectContaining({
        poolOptions: expect.objectContaining({
          poolSize: 2,
          workerFactory: expect.any(Function),
        }),
      }),
    );
    expect(virtualizerMock).toHaveBeenCalledWith(
      expect.objectContaining({
        className: expect.stringContaining("claude-overview-preview-content"),
      }),
    );
    expect(filePreviewMock).toHaveBeenCalledWith(
      expect.not.objectContaining({ disableWorkerPool: true }),
    );
  });

  it("remounts the virtualizer when remountToken changes to recover from display:none", () => {
    const { rerenderPane } = renderPane({ remountToken: 0 });
    expect(virtualizerMountMock).toHaveBeenCalledTimes(1);
    expect(virtualizerUnmountMock).not.toHaveBeenCalled();

    // remountToken 变化模拟页面从隐藏恢复可见：key 改变 → 卸载旧 Virtualizer + 挂载新实例重新测量
    rerenderPane({ remountToken: 1 });

    expect(virtualizerUnmountMock).toHaveBeenCalledTimes(1);
    expect(virtualizerMountMock).toHaveBeenCalledTimes(2);
  });

  it("keeps the virtualizer mounted when remountToken is unchanged", () => {
    const { rerenderPane } = renderPane({ remountToken: 3 });
    expect(virtualizerMountMock).toHaveBeenCalledTimes(1);

    // 仅其它 prop 变化、remountToken 不变时不得重挂，避免无谓重渲染
    rerenderPane({ remountToken: 3, previewThemeType: "light" });

    expect(virtualizerUnmountMock).not.toHaveBeenCalled();
    expect(virtualizerMountMock).toHaveBeenCalledTimes(1);
  });
});
