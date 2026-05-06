import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../../i18n";
import type { Memory } from "../../types";
import MemoryEditor from "../MemoryEditor";
import { ThemeProvider } from "../theme-provider";

vi.mock("@uiw/react-codemirror", () => ({
  default: ({
    value,
    onChange,
    placeholder,
  }: {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
  }) => (
    <textarea
      aria-label="memory-content-editor"
      placeholder={placeholder}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  ),
}));

vi.mock("../claude-overview/MarkdownPreview", () => ({
  default: ({ content, className }: { content: string; className?: string }) => (
    <pre className={className} data-testid="memory-markdown-preview">
      {content}
    </pre>
  ),
}));

function setSystemLanguages(languages: string[]) {
  Object.defineProperty(navigator, "languages", {
    value: languages,
    configurable: true,
  });
  Object.defineProperty(navigator, "language", {
    value: languages[0] ?? "",
    configurable: true,
  });
}

function renderMemoryEditor(memory: Memory | null = null) {
  const onSave = vi.fn();
  render(
    <I18nProvider>
      <ThemeProvider>
        <MemoryEditor memory={memory} onSave={onSave} onClose={vi.fn()} />
      </ThemeProvider>
    </I18nProvider>,
  );
  return { onSave };
}

describe("MemoryEditor", () => {
  beforeEach(() => {
    localStorage.clear();
    setSystemLanguages(["zh-CN"]);
    Object.defineProperty(window, "matchMedia", {
      value: vi.fn().mockImplementation(() => ({
        matches: false,
        media: "(prefers-color-scheme: dark)",
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
      configurable: true,
    });
  });

  it("uses target cards and keeps empty path matching folded until advanced rules is opened", async () => {
    renderMemoryEditor();

    const claudeTarget = screen.getByRole("radio", { name: /CLAUDE\.md/ });
    const rulesTarget = screen.getByRole("radio", { name: /Rules/ });

    expect(screen.queryByRole("combobox", { name: /记忆类型/ })).not.toBeInTheDocument();
    expect(claudeTarget).toBeChecked();
    expect(rulesTarget).not.toBeChecked();
    expect(screen.queryByRole("textbox", { name: /规则文件路径/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: /路径匹配/ })).not.toBeInTheDocument();

    fireEvent.click(rulesTarget);

    expect(claudeTarget).not.toBeChecked();
    expect(rulesTarget).toBeChecked();
    expect(screen.getByRole("textbox", { name: /规则文件路径/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /高级规则/ })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(screen.queryByRole("textbox", { name: /路径匹配/ })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /高级规则/ }));

    expect(screen.getByRole("button", { name: /高级规则/ })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(screen.getByRole("textbox", { name: /路径匹配/ })).toBeInTheDocument();
  });

  it("opens advanced rules by default when editing an existing rule with path matches", () => {
    renderMemoryEditor({
      id: "frontend-rule",
      name: "Frontend Rule",
      content: "Use React carefully.",
      targetType: "rule",
      rulePath: "frontend.md",
      pathPatterns: ["src/**/*.tsx"],
      isActive: false,
      createdAt: 1767225600000,
      updatedAt: 1767225600000,
    });

    expect(screen.getByRole("button", { name: /高级规则/ })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(screen.getByRole("textbox", { name: /路径匹配/ })).toHaveValue("src/**/*.tsx");
  });

  it("keeps the memory name and editor top-level title in sync", async () => {
    renderMemoryEditor();

    const nameInput = screen.getByRole("textbox", { name: /记忆名称/ });
    const contentEditor = screen.getByLabelText("memory-content-editor");

    fireEvent.change(nameInput, { target: { value: "团队规范" } });

    await waitFor(() => {
      expect(contentEditor).toHaveValue("# 团队规范");
    });

    fireEvent.change(contentEditor, { target: { value: "# 新标题\n\n正文" } });

    await waitFor(() => {
      expect(nameInput).toHaveValue("新标题");
    });
  });

  it("switches between source and markdown preview without losing draft content", () => {
    renderMemoryEditor({
      id: "team-rule",
      name: "团队规范",
      content: "## 核心原则\n\n保持简洁。",
      targetType: "claude",
      isActive: false,
      createdAt: 1767225600000,
      updatedAt: 1767225600000,
    });

    const sourceEditor = screen.getByLabelText("memory-content-editor");
    expect(sourceEditor).toHaveValue("# 团队规范\n\n## 核心原则\n\n保持简洁。");
    expect(screen.queryByTestId("memory-markdown-preview")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "预览" }));

    expect(screen.queryByLabelText("memory-content-editor")).not.toBeInTheDocument();
    expect(screen.getByTestId("memory-markdown-preview").textContent).toBe(
      "# 团队规范\n\n## 核心原则\n\n保持简洁。",
    );

    fireEvent.click(screen.getByRole("button", { name: "源码" }));

    expect(screen.getByLabelText("memory-content-editor")).toHaveValue(
      "# 团队规范\n\n## 核心原则\n\n保持简洁。",
    );
    expect(screen.queryByTestId("memory-markdown-preview")).not.toBeInTheDocument();
  });
});
