import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider, useI18n } from "../../i18n";
import type { ClaudeDirectoryEntry, ClaudeDirectoryOverview, ClaudeFilePreview } from "../../types";
import { ProjectAutoMemoryExplorer } from "../ProjectAutoMemoryExplorer";

const { deleteEntryMock, openEditorMock, overviewMock, readFileMock, showToastMock } = vi.hoisted(
  () => ({
    deleteEntryMock: vi.fn(async () => null),
    openEditorMock: vi.fn(async () => null),
    overviewMock: vi.fn(),
    readFileMock: vi.fn(),
    showToastMock: vi.fn(),
  }),
);

vi.mock("../../hooks/useToast", () => ({
  useToast: () => ({ showToast: showToastMock }),
}));

vi.mock("../../hooks/useIsDark", () => ({
  useIsDark: () => false,
}));

vi.mock("@tauri-apps/plugin-opener", () => ({
  revealItemInDir: vi.fn(async () => undefined),
}));

vi.mock("../../ipc", () => ({
  ipc: {
    getProjectAutoMemoryOverview: overviewMock,
    readProjectAutoMemoryFile: readFileMock,
    deleteProjectAutoMemoryEntry: deleteEntryMock,
    openProjectAutoMemoryFileInEditor: openEditorMock,
  },
}));

// 用轻量替身替换重型的树 / 预览组件，聚焦本组件自身的状态机与删除流
vi.mock("../claude-overview/ClaudeDirectoryTree", () => ({
  ClaudeDirectoryTree: ({
    paths,
    onSelectPath,
  }: {
    paths: string[];
    onSelectPath: (path: string) => void;
  }) => (
    <div data-testid="tree">
      {paths.map((path) => (
        <button key={path} type="button" onClick={() => onSelectPath(path)}>
          {`tree:${path}`}
        </button>
      ))}
    </div>
  ),
  ClaudeOverviewIconSprite: () => null,
  ClaudeOverviewTreeLoading: ({ label }: { label: string }) => <div>{label}</div>,
}));

vi.mock("../claude-overview/ClaudeFilePreviewPane", () => ({
  ClaudeFilePreviewPane: ({ activePreview }: { activePreview: ClaudeFilePreview | null }) => (
    <div data-testid="preview-pane">
      {activePreview ? <div data-testid="active-preview">{activePreview.name}</div> : null}
    </div>
  ),
}));

const PROJECT = "/Users/test/Work/demo";

function makeEntry(path: string): ClaudeDirectoryEntry {
  return { path, name: path, kind: "file", size: 12, modifiedAt: 0 };
}

function makeOverview(paths: string[]): ClaudeDirectoryOverview {
  return {
    rootPath: "/Users/test/.claude/projects/-Users-test-Work-demo/memory",
    maxEntries: 10000,
    maxDepth: 16,
    entries: paths.map(makeEntry),
    truncated: false,
    reachedEntryLimit: false,
    reachedDepthLimit: false,
    skippedSymlinkCount: 0,
    skippedNodeModulesCount: 0,
  };
}

function makePreview(path: string): ClaudeFilePreview {
  return {
    path,
    name: path,
    content: `content of ${path}`,
    isBinary: false,
    truncated: false,
    size: 12,
    modifiedAt: 0,
    encoding: "utf-8",
  };
}

function Harness({ fileCount }: { fileCount: number }) {
  const { t } = useI18n();
  return (
    <ProjectAutoMemoryExplorer
      open
      onOpenChange={() => {}}
      project={PROJECT}
      repoRoot={null}
      fileCount={fileCount}
      t={t}
    />
  );
}

function renderExplorer(fileCount = 2) {
  return render(
    <I18nProvider>
      <Harness fileCount={fileCount} />
    </I18nProvider>,
  );
}

describe("ProjectAutoMemoryExplorer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    overviewMock.mockResolvedValue(makeOverview(["MEMORY.md", "api.md"]));
    readFileMock.mockImplementation(async (_project: string, _repo: unknown, path: string) =>
      makePreview(path),
    );
  });

  it("展示空态当 memory 目录无文件", async () => {
    overviewMock.mockResolvedValueOnce(makeOverview([]));
    renderExplorer(0);
    expect(await screen.findByText("暂无自动记忆文件")).toBeInTheDocument();
  });

  it("列出记忆文件并在选中后预览内容", async () => {
    renderExplorer();
    const memoryNode = await screen.findByText("tree:MEMORY.md");
    fireEvent.click(memoryNode);
    await waitFor(() => expect(readFileMock).toHaveBeenCalledWith(PROJECT, null, "MEMORY.md"));
    expect(await screen.findByTestId("active-preview")).toHaveTextContent("MEMORY.md");
  });

  it("删除单个记忆文件走确认弹窗后调用后端", async () => {
    renderExplorer();
    fireEvent.click(await screen.findByText("tree:api.md"));
    await screen.findByTestId("active-preview");

    fireEvent.click(screen.getByRole("button", { name: "删除记忆文件" }));
    expect(await screen.findByRole("alertdialog")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "删除" }));
    await waitFor(() => expect(deleteEntryMock).toHaveBeenCalledWith(PROJECT, null, "api.md"));
  });

  it("清空全部记忆以空路径删除整个 memory 目录", async () => {
    renderExplorer(2);
    fireEvent.click(await screen.findByRole("button", { name: "清空全部记忆" }));
    expect(await screen.findByText("清空项目自动记忆")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "删除" }));
    await waitFor(() => expect(deleteEntryMock).toHaveBeenCalledWith(PROJECT, null, ""));
  });
});
