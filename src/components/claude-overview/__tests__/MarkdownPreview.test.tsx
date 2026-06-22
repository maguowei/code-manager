import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MarkdownPreview from "../MarkdownPreview";

// 模拟 @tauri-apps/plugin-opener 的 openUrl，断言外链拦截行为
const openUrlMock = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/plugin-opener", () => ({
  openUrl: openUrlMock,
}));

describe("MarkdownPreview", () => {
  beforeEach(() => {
    openUrlMock.mockReset();
    openUrlMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("将 markdown 标题与段落渲染为对应 HTML", () => {
    render(<MarkdownPreview content={"# Hello\n\nworld"} themeType="light" />);

    expect(screen.getByRole("heading", { level: 1, name: "Hello" })).toBeInTheDocument();
    expect(screen.getByText("world")).toBeInTheDocument();
  });

  it("通过 remark-gfm 渲染表格", () => {
    const md = ["| A | B |", "| - | - |", "| 1 | 2 |"].join("\n");
    render(<MarkdownPreview content={md} themeType="light" />);

    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "A" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "1" })).toBeInTheDocument();
  });

  it("通过 remark-gfm 渲染任务列表 checkbox", () => {
    const md = ["- [x] done", "- [ ] todo"].join("\n");
    const { container } = render(<MarkdownPreview content={md} themeType="light" />);

    const checkboxes = container.querySelectorAll<HTMLInputElement>("input[type='checkbox']");
    expect(checkboxes).toHaveLength(2);
    expect(checkboxes[0].checked).toBe(true);
    expect(checkboxes[1].checked).toBe(false);
  });

  it("代码块带 language fence 时进入语法高亮容器", () => {
    const md = ["```ts", "const a = 1;", "```"].join("\n");
    const { container } = render(<MarkdownPreview content={md} themeType="dark" />);

    // react-syntax-highlighter 输出带 language-* class 的 pre/code 结构
    const highlighted = container.querySelector("pre code");
    expect(highlighted).not.toBeNull();
    expect(highlighted?.textContent).toContain("const a = 1;");
  });

  it("外链点击会拦截默认行为并调用 openUrl", () => {
    render(<MarkdownPreview content={"[官网](https://example.com)"} themeType="light" />);

    const link = screen.getByRole("link", { name: "官网" });
    expect(link).toHaveAttribute("href", "https://example.com");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", expect.stringContaining("noreferrer"));

    const event = new MouseEvent("click", { bubbles: true, cancelable: true });
    link.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(openUrlMock).toHaveBeenCalledWith("https://example.com");
  });

  it("仅渲染 http/https 图片，相对路径降级为 alt 文本", () => {
    const md = ["![http 图](https://img.example.com/a.png)", "", "![本地图](./local.png)"].join(
      "\n",
    );
    const { container } = render(<MarkdownPreview content={md} themeType="light" />);

    const images = container.querySelectorAll("img");
    expect(images).toHaveLength(1);
    expect(images[0]).toHaveAttribute("src", "https://img.example.com/a.png");
    expect(screen.getByText("本地图")).toBeInTheDocument();
  });

  it('themeType="dark" 时容器 data-color-mode="dark"', () => {
    const { container } = render(<MarkdownPreview content="# t" themeType="dark" />);
    const root = container.querySelector(".markdown-body");
    expect(root).not.toBeNull();
    expect(root).toHaveAttribute("data-color-mode", "dark");
  });

  it('themeType="light" 时容器 data-color-mode="light"', () => {
    const { container } = render(<MarkdownPreview content="# t" themeType="light" />);
    const root = container.querySelector(".markdown-body");
    expect(root).toHaveAttribute("data-color-mode", "light");
  });

  it("默认禁用 raw HTML，<script> 不会被渲染为脚本元素", () => {
    const md = "<script>window.__pwn = 1</script>普通文本";
    const { container } = render(<MarkdownPreview content={md} themeType="light" />);

    expect(container.querySelector("script")).toBeNull();
    expect(screen.getByText(/普通文本/)).toBeInTheDocument();
  });

  it("接受外部 className 并附加到根元素", () => {
    const { container } = render(
      <MarkdownPreview content="x" themeType="light" className="extra-cls" />,
    );
    const root = container.querySelector(".markdown-body");
    expect(root?.className).toContain("extra-cls");
  });

  it("themeType 切换时启用对应的 github-markdown 主题 link，禁用另一个", () => {
    const { rerender } = render(<MarkdownPreview content="x" themeType="light" />);
    const lightLink = document.getElementById(
      "code-manager-markdown-light-style",
    ) as HTMLLinkElement | null;
    const darkLink = document.getElementById(
      "code-manager-markdown-dark-style",
    ) as HTMLLinkElement | null;
    expect(lightLink).not.toBeNull();
    expect(darkLink).not.toBeNull();
    expect(lightLink?.disabled).toBe(false);
    expect(darkLink?.disabled).toBe(true);

    rerender(<MarkdownPreview content="x" themeType="dark" />);
    expect(lightLink?.disabled).toBe(true);
    expect(darkLink?.disabled).toBe(false);
  });
});
