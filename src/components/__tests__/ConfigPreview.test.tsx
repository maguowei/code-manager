import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../../i18n";
import ConfigPreview from "../ConfigPreview";
import { ThemeProvider } from "../theme-provider";

const codeMirrorMock = vi.hoisted(() => vi.fn());

vi.mock("@uiw/react-codemirror", () => ({
  default: (props: { value: string; editable?: boolean }) => {
    codeMirrorMock(props);
    return (
      <div data-editable={String(props.editable)} data-testid="codemirror">
        {props.value}
      </div>
    );
  },
}));

interface MockIntersectionObserverInstance {
  callback: IntersectionObserverCallback;
  disconnect: ReturnType<typeof vi.fn>;
  observe: ReturnType<typeof vi.fn>;
}

const observerInstances: MockIntersectionObserverInstance[] = [];
const originalIntersectionObserver = globalThis.IntersectionObserver;
const originalMatchMedia = window.matchMedia;

function renderPreview(props: { content?: string; onChange?: (value: string) => void } = {}) {
  return render(
    <I18nProvider>
      <ThemeProvider>
        <ConfigPreview content={props.content ?? '{ "ok": true }'} onChange={props.onChange} />
      </ThemeProvider>
    </I18nProvider>,
  );
}

describe("ConfigPreview", () => {
  beforeEach(() => {
    codeMirrorMock.mockClear();
    observerInstances.length = 0;
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn().mockReturnValue({
        addEventListener: vi.fn(),
        matches: false,
        removeEventListener: vi.fn(),
      }),
    });
    class MockIntersectionObserver implements Pick<IntersectionObserver, "disconnect" | "observe"> {
      readonly callback: IntersectionObserverCallback;
      readonly disconnect = vi.fn();
      readonly observe = vi.fn();

      constructor(callback: IntersectionObserverCallback) {
        this.callback = callback;
        observerInstances.push(this);
      }
    }

    Object.defineProperty(globalThis, "IntersectionObserver", {
      configurable: true,
      value: MockIntersectionObserver,
    });
  });

  afterEach(() => {
    Object.defineProperty(globalThis, "IntersectionObserver", {
      configurable: true,
      value: originalIntersectionObserver,
    });
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: originalMatchMedia,
    });
  });

  it("defers read-only CodeMirror rendering until the preview enters the viewport", () => {
    renderPreview({ content: '{ "large": true }' });

    expect(screen.queryByTestId("codemirror")).not.toBeInTheDocument();
    expect(observerInstances).toHaveLength(1);
    expect(observerInstances[0]?.observe).toHaveBeenCalledTimes(1);

    act(() => {
      observerInstances[0]?.callback(
        [{ isIntersecting: true } as IntersectionObserverEntry],
        observerInstances[0] as unknown as IntersectionObserver,
      );
    });

    expect(screen.getByTestId("codemirror")).toHaveTextContent('"large"');
    expect(observerInstances[0]?.disconnect).toHaveBeenCalledTimes(1);
  });

  it("renders editable CodeMirror immediately and keeps editor config references stable", () => {
    const handleChange = vi.fn();
    const { rerender } = renderPreview({ content: '{ "first": true }', onChange: handleChange });

    expect(screen.getByTestId("codemirror")).toHaveAttribute("data-editable", "true");
    expect(observerInstances).toHaveLength(0);
    const firstProps = codeMirrorMock.mock.calls[0]?.[0] as {
      basicSetup: unknown;
      extensions: unknown;
    };

    rerender(
      <I18nProvider>
        <ThemeProvider>
          <ConfigPreview content='{ "second": true }' onChange={handleChange} />
        </ThemeProvider>
      </I18nProvider>,
    );

    const secondProps = codeMirrorMock.mock.calls[1]?.[0] as {
      basicSetup: unknown;
      extensions: unknown;
    };
    expect(secondProps.extensions).toBe(firstProps.extensions);
    expect(secondProps.basicSetup).toBe(firstProps.basicSetup);
  });
});
