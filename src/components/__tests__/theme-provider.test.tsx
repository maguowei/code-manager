import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { ThemeProvider, useTheme } from "@/components/theme-provider";

function Probe() {
  const { theme, setTheme, isDark } = useTheme();

  return (
    <div>
      <span data-testid="theme">{theme}</span>
      <span data-testid="isDark">{String(isDark)}</span>
      <button type="button" onClick={() => setTheme("dark")}>
        to-dark
      </button>
      <button type="button" onClick={() => setTheme("light")}>
        to-light
      </button>
      <button type="button" onClick={() => setTheme("system")}>
        to-system
      </button>
    </div>
  );
}

function renderProbe() {
  render(
    <ThemeProvider>
      <Probe />
    </ThemeProvider>,
  );
}

describe("ThemeProvider", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove("dark");
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: undefined,
    });
  });

  it("默认 system，且 matchMedia 缺失时不会抛错", () => {
    renderProbe();

    expect(screen.getByTestId("theme")).toHaveTextContent("system");
    expect(screen.getByTestId("isDark")).toHaveTextContent("false");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("setTheme('dark') 写入 .dark class 和独立存储 key", async () => {
    const user = userEvent.setup();
    renderProbe();

    await user.click(screen.getByRole("button", { name: "to-dark" }));

    expect(screen.getByTestId("theme")).toHaveTextContent("dark");
    expect(screen.getByTestId("isDark")).toHaveTextContent("true");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(localStorage.getItem("code-manager.theme")).toBe("dark");
  });

  it("setTheme('light') 移除 .dark class", async () => {
    const user = userEvent.setup();
    document.documentElement.classList.add("dark");
    localStorage.setItem("code-manager.theme", "dark");
    renderProbe();

    await user.click(screen.getByRole("button", { name: "to-light" }));

    expect(screen.getByTestId("theme")).toHaveTextContent("light");
    expect(screen.getByTestId("isDark")).toHaveTextContent("false");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(localStorage.getItem("code-manager.theme")).toBe("light");
  });

  it("忽略 code-manager-settings 中的旧 theme 字段", async () => {
    localStorage.setItem(
      "code-manager-settings",
      JSON.stringify({ language: "zh", theme: "dark" }),
    );

    renderProbe();

    expect(screen.getByTestId("theme")).toHaveTextContent("system");
    expect(screen.getByTestId("isDark")).toHaveTextContent("false");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    await waitFor(() => {
      expect(localStorage.getItem("code-manager.theme")).toBe("system");
    });
  });
});
