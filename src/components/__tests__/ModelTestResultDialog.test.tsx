import {
  act,
  createEvent,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../../i18n";
import type { ModelTestResult } from "../../types";
import ModelTestResultDialog from "../profile-editor/ModelTestResultDialog";
import { ThemeProvider } from "../theme-provider";

const { showToastMock } = vi.hoisted(() => ({
  showToastMock: vi.fn(),
}));

vi.mock("../../hooks/useToast", () => ({
  useToast: () => ({
    showToast: showToastMock,
  }),
}));

vi.mock("../SyntaxHighlightedCode", () => ({
  default: ({
    code,
    language,
    wrapLongLines,
  }: {
    code: string;
    language: string;
    wrapLongLines?: boolean;
  }) => (
    <pre data-language={language} data-wrap-long-lines={String(Boolean(wrapLongLines))}>
      {code}
    </pre>
  ),
}));

const clipboardWriteMock = vi.fn(async (_text: string) => undefined);
const scrollIntoViewMock = vi.fn();

const MODEL_TEST_RESULT: ModelTestResult = {
  ok: true,
  responseText: "API 测试请求已成功接收并处理！",
  promptText: "请用一句简短的话确认这次 API 测试请求成功。",
  resolvedModel: "glm-5.1",
  providerModel: "glm-5.1",
  durationMs: 4643,
  requestId: "req_visual_scroll_check",
  stopReason: "end_turn",
  statusCode: 200,
  requestMethod: "POST",
  requestUrl: "https://open.bigmodel.cn/api/anthropic/v1/messages",
  requestHeaders: {
    authorization: "Bearer ********",
    "anthropic-version": "2023-06-01",
    "content-type": "application/json",
    "x-request-source": "ai-manager-test",
  },
  requestBody: JSON.stringify(
    {
      model: "glm-5.1",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: "请用一句简短的话确认这次 API 测试请求成功。",
        },
      ],
    },
    null,
    2,
  ),
  responseHeaders: {
    "content-type": "application/json",
    "x-request-id": "req_visual_scroll_check",
  },
  rawResponse: JSON.stringify(
    {
      id: "msg_scroll_check",
      type: "message",
      role: "assistant",
      model: "glm-5.1",
      content: Array.from({ length: 32 }, (_, index) => ({
        type: "text",
        index,
        text: "API 测试请求已成功接收并处理。这一行用于验证长响应体滚动。",
      })),
      stop_reason: "end_turn",
    },
    null,
    2,
  ),
};

function setSystemTheme() {
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
}

function renderModelTestResultDialog() {
  const onClose = vi.fn();
  const onRetest = vi.fn();

  function Harness() {
    const [rawResponseExpanded, setRawResponseExpanded] = useState(true);

    return (
      <I18nProvider>
        <ThemeProvider>
          <ModelTestResultDialog
            isOpen
            result={MODEL_TEST_RESULT}
            profileName="智谱GLM"
            errorMessage=""
            rawResponseExpanded={rawResponseExpanded}
            onClose={onClose}
            onToggleRawResponse={() => setRawResponseExpanded((expanded) => !expanded)}
            onRetest={onRetest}
          />
        </ThemeProvider>
      </I18nProvider>
    );
  }

  render(<Harness />);
  return { onClose, onRetest };
}

function expectCodeViewport(dialog: HTMLElement, testId: string, ariaLabel: string): HTMLElement {
  const viewport = within(dialog).getByTestId(testId);
  expect(viewport).toHaveAttribute("tabindex", "0");
  expect(viewport).toHaveAttribute("role", "textbox");
  expect(viewport).toHaveAttribute("aria-label", ariaLabel);
  expect(viewport).toHaveAttribute("aria-multiline", "true");
  expect(viewport).toHaveAttribute("aria-readonly", "true");
  expect(viewport).toHaveClass("min-w-0");
  expect(viewport).toHaveClass("overflow-visible");
  expect(viewport).not.toHaveClass("overflow-auto");
  expect(viewport).not.toHaveClass("overflow-x-auto");
  expect(viewport).not.toHaveClass("overflow-y-auto");
  expect(viewport).not.toHaveClass("overscroll-contain");
  expect(viewport.className).not.toContain("max-h-");
  expect(viewport.querySelector("pre")).toHaveAttribute("data-wrap-long-lines", "true");
  return viewport;
}

function selectTab(dialog: HTMLElement, name: string) {
  const tab = within(dialog).getByRole("tab", { name });
  fireEvent.mouseDown(tab, { button: 0, ctrlKey: false });
  fireEvent.mouseUp(tab, { button: 0, ctrlKey: false });
  fireEvent.pointerDown(tab, { button: 0, ctrlKey: false });
  fireEvent.pointerUp(tab, { button: 0, ctrlKey: false });
  fireEvent.click(tab);
}

describe("ModelTestResultDialog", () => {
  beforeEach(() => {
    localStorage.clear();
    showToastMock.mockReset();
    clipboardWriteMock.mockClear();
    scrollIntoViewMock.mockClear();
    setSystemTheme();
    Object.defineProperty(navigator, "clipboard", {
      value: {
        writeText: clipboardWriteMock,
      },
      configurable: true,
    });
    Object.defineProperty(window, "requestAnimationFrame", {
      value: vi.fn((callback: FrameRequestCallback) => {
        callback(0);
        return 1;
      }),
      configurable: true,
    });
    Object.defineProperty(Element.prototype, "scrollIntoView", {
      value: scrollIntoViewMock,
      configurable: true,
    });
  });

  it("uses a fixed flex dialog shell with a dedicated scroll body", () => {
    renderModelTestResultDialog();

    const dialog = screen.getByRole("dialog", { name: "模型测试结果" });
    expect(dialog).toHaveClass("!flex");
    expect(dialog).toHaveClass("h-[min(860px,calc(100dvh-2rem))]");
    expect(dialog).toHaveClass("overflow-hidden");

    const scrollBody = within(dialog).getByTestId("model-test-result-scroll-body");
    expect(scrollBody).toHaveClass("min-h-0", "flex-1", "overflow-y-auto", "overscroll-contain");
    expect(scrollBody).not.toHaveAttribute("data-slot", "scroll-area");
    expect(scrollBody.querySelector('[data-slot="scroll-area-viewport"]')).not.toBeInTheDocument();
  });

  it("shows request and response exchange payloads through tabs", async () => {
    renderModelTestResultDialog();

    const dialog = screen.getByRole("dialog", { name: "模型测试结果" });
    expect(within(dialog).getByRole("tab", { name: "概览" })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    selectTab(dialog, "请求");
    await waitFor(() =>
      expect(within(dialog).getByRole("tab", { name: "请求" })).toHaveAttribute(
        "aria-selected",
        "true",
      ),
    );
    expectCodeViewport(dialog, "model-test-request-headers-code", "请求 Headers");
    expectCodeViewport(dialog, "model-test-request-body-code", "请求体");

    selectTab(dialog, "响应");
    await waitFor(() =>
      expect(within(dialog).getByRole("tab", { name: "响应" })).toHaveAttribute(
        "aria-selected",
        "true",
      ),
    );
    expectCodeViewport(dialog, "model-test-response-headers-code", "响应 Headers");
    const rawResponseViewport = expectCodeViewport(
      dialog,
      "model-test-raw-response-code",
      "响应体",
    );
    expect(rawResponseViewport.textContent).toContain('"id": "msg_scroll_check"');
    expect(within(dialog).getByRole("button", { name: "隐藏响应体" })).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: "隐藏响应体" }));
    expect(within(dialog).queryByTestId("model-test-raw-response-code")).not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "查看响应体" }));
    expectCodeViewport(dialog, "model-test-raw-response-code", "响应体");
    await waitFor(() =>
      expect(scrollIntoViewMock).toHaveBeenCalledWith({
        block: "nearest",
        behavior: "smooth",
      }),
    );

    await act(async () => {
      await Promise.resolve();
    });
  });

  it("relays mouse wheel events from code panels to the main scroll body when native scrolling stalls", () => {
    renderModelTestResultDialog();

    const dialog = screen.getByRole("dialog", { name: "模型测试结果" });
    selectTab(dialog, "响应");

    const scrollBody = within(dialog).getByTestId("model-test-result-scroll-body");
    Object.defineProperties(scrollBody, {
      clientHeight: {
        configurable: true,
        value: 500,
      },
      scrollHeight: {
        configurable: true,
        value: 2000,
      },
      scrollTop: {
        configurable: true,
        value: 0,
        writable: true,
      },
    });

    const rawResponseViewport = within(dialog).getByTestId("model-test-raw-response-code");
    const scrollDownEvent = createEvent.wheel(rawResponseViewport, {
      cancelable: true,
      deltaY: 120,
    });
    fireEvent(rawResponseViewport, scrollDownEvent);

    expect(rawResponseViewport.scrollTop).toBe(0);
    expect(scrollBody.scrollTop).toBe(120);
    expect(scrollDownEvent.defaultPrevented).toBe(false);
  });

  it("keeps retest, prompt editing, and copy curl actions working", async () => {
    const { onRetest } = renderModelTestResultDialog();

    const dialog = screen.getByRole("dialog", { name: "模型测试结果" });

    fireEvent.click(within(dialog).getByRole("button", { name: "重新测试" }));
    expect(onRetest).toHaveBeenCalledWith("请用一句简短的话确认这次 API 测试请求成功。");

    fireEvent.click(within(dialog).getByRole("button", { name: "编辑提示词" }));
    const promptInput = within(dialog).getByLabelText("输入提示词") as HTMLTextAreaElement;
    fireEvent.change(promptInput, { target: { value: "请只回复 OK" } });

    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: "发起请求" }));
      await Promise.resolve();
    });
    expect(onRetest).toHaveBeenLastCalledWith("请只回复 OK");

    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: "复制请求 cURL" }));
      await Promise.resolve();
    });

    expect(clipboardWriteMock).toHaveBeenCalledWith(
      expect.stringContaining("curl -X POST 'https://open.bigmodel.cn/api/anthropic/v1/messages'"),
    );
    expect(clipboardWriteMock).toHaveBeenCalledWith(expect.stringContaining("请只回复 OK"));
    expect(showToastMock).toHaveBeenCalledWith("已复制请求 cURL");
  });
});
