import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../../i18n";
import MemoryEditor from "../MemoryEditor";

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

function renderMemoryEditor() {
  render(
    <I18nProvider>
      <MemoryEditor memory={null} onSave={vi.fn()} onClose={vi.fn()} />
    </I18nProvider>,
  );
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

  it("uses target cards and shows rule path only when Rules is selected", async () => {
    renderMemoryEditor();

    const claudeTarget = screen.getByRole("radio", { name: /CLAUDE\.md/ });
    const rulesTarget = screen.getByRole("radio", { name: /Rules/ });

    expect(screen.queryByRole("combobox", { name: /记忆类型/ })).not.toBeInTheDocument();
    expect(claudeTarget).toBeChecked();
    expect(rulesTarget).not.toBeChecked();
    expect(screen.queryByRole("textbox", { name: /规则文件路径/ })).not.toBeInTheDocument();

    fireEvent.click(rulesTarget);

    expect(claudeTarget).not.toBeChecked();
    expect(rulesTarget).toBeChecked();
    expect(screen.getByRole("textbox", { name: /规则文件路径/ })).toBeInTheDocument();
  });
});
