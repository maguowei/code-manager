import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../../i18n";
import type { Provider } from "../../types";
import ProviderEditor from "../ProviderEditor";

const { invokeMock, showToastMock, openDialogMock, openUrlMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  showToastMock: vi.fn(),
  openDialogMock: vi.fn(),
  openUrlMock: vi.fn(async (_url: string) => null),
}));

const originalFetch = globalThis.fetch;
const fetchMock = vi.fn();

Element.prototype.hasPointerCapture ??= () => false;
Element.prototype.setPointerCapture ??= () => undefined;
Element.prototype.releasePointerCapture ??= () => undefined;

vi.mock("../../hooks/useToast", () => ({
  useToast: () => ({
    showToast: showToastMock,
  }),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: (...args: unknown[]) => openDialogMock(...args),
}));

vi.mock("@tauri-apps/plugin-opener", () => ({
  openUrl: (url: string) => openUrlMock(url),
}));

vi.mock("../ConfigPreview", () => ({
  default: ({
    content,
    onChange,
    jsonError,
  }: {
    content: string;
    onChange?: (value: string) => void;
    jsonError?: string;
  }) => (
    <div>
      {onChange ? (
        <textarea
          aria-label="config-preview-input"
          value={content}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <pre data-testid="config-preview-output">{content}</pre>
      )}
      {jsonError ? <span>{jsonError}</span> : null}
    </div>
  ),
}));

const PRESETS: Provider[] = [
  {
    id: "builtin:openrouter",
    name: "OpenRouter",
    localizedName: {
      zh: "开放路由",
      en: "OpenRouter",
    },
    description: "OpenRouter 预设",
    models: [
      { id: "claude-opus-4-1", category: "opus" },
      { id: "claude-sonnet-4-6", category: "sonnet" },
      { id: "claude-haiku-4-5", category: "haiku" },
    ],
    modelSuggestions: ["claude-sonnet-4-6"],
    env: {
      ANTHROPIC_BASE_URL: "https://openrouter.ai/api",
    },
    source: "builtin",
  },
  {
    id: "custom:team-plan",
    name: "Team Plan",
    localizedName: {
      zh: "团队计划",
      en: "Team Plan",
    },
    description: "团队计划预设",
    modelSuggestions: ["claude-haiku-fallback"],
    env: {},
    source: "custom",
  },
  {
    id: "custom:explicit-model",
    name: "Explicit Model",
    localizedName: {
      zh: "显式模型",
      en: "Explicit Model",
    },
    description: "显式模型预设",
    modelSuggestions: ["claude-sonnet-4-6"],
    env: {},
    source: "custom",
  },
  {
    id: "custom:env-level-overrides",
    name: "Env Level Overrides",
    localizedName: {
      zh: "环境变量级别覆盖",
      en: "Env Level Overrides",
    },
    description: "环境变量级别覆盖预设",
    modelSuggestions: ["claude-sonnet-4-6"],
    env: {
      ANTHROPIC_DEFAULT_HAIKU_MODEL: "haiku-env-override",
      CLAUDE_CODE_SUBAGENT_MODEL: "subagent-env-override",
    },
    source: "custom",
  },
];

const PRESET_FIXTURE: Provider = {
  id: "team-openrouter",
  name: "Team OpenRouter",
  localizedName: {
    zh: "团队 OpenRouter",
    en: "Team OpenRouter",
  },
  description: "团队默认预设",
  docUrl: "https://example.com/docs",
  modelSuggestions: ["claude-sonnet-4-6"],
  env: {},
  source: "custom",
};

function renderEditor(options?: {
  provider?: Provider | null;
  providers?: Provider[];
  onSave?: (data: {
    id?: string;
    name: string;
    localizedName?: {
      zh: string;
      en: string;
    };
    description: string;
    docUrl?: string;
    models?: Provider["models"];
    modelSuggestions: string[];
    env: Record<string, string>;
  }) => boolean | Promise<boolean>;
}) {
  const provider = options && "provider" in options ? (options.provider ?? null) : PRESET_FIXTURE;
  const onSave =
    options?.onSave ??
    vi.fn<
      (data: {
        id?: string;
        name: string;
        localizedName?: {
          zh: string;
          en: string;
        };
        description: string;
        docUrl?: string;
        models?: Provider["models"];
        modelSuggestions: string[];
        env: Record<string, string>;
      }) => boolean | Promise<boolean>
    >(() => true);
  render(
    <I18nProvider>
      <ProviderEditor
        provider={provider}
        providers={options?.providers ?? PRESETS}
        onSave={onSave}
        onClose={() => {}}
      />
    </I18nProvider>,
  );
  return { onSave };
}

describe("ProviderEditor", () => {
  beforeEach(() => {
    localStorage.clear();
    Object.defineProperty(globalThis.navigator, "languages", {
      value: ["zh-CN"],
      configurable: true,
    });
    Object.defineProperty(globalThis.navigator, "language", {
      value: "zh-CN",
      configurable: true,
    });
    fetchMock.mockReset();
    invokeMock.mockReset();
    showToastMock.mockReset();
    openDialogMock.mockReset();
    openUrlMock.mockClear();
    Object.defineProperty(globalThis, "fetch", {
      value: fetchMock,
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(globalThis, "fetch", {
      value: originalFetch,
      configurable: true,
      writable: true,
    });
  });

  it("renders bilingual preset name inputs and saves localizedName", () => {
    const onSave = vi.fn();
    renderEditor({ onSave });

    expect(screen.getByLabelText(/中文名称/)).toHaveValue("团队 OpenRouter");
    expect(screen.getByLabelText(/英文名称/)).toHaveValue("Team OpenRouter");

    fireEvent.change(screen.getByLabelText(/中文名称/), {
      target: { value: "团队路由" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Team OpenRouter",
        localizedName: {
          zh: "团队路由",
          en: "Team OpenRouter",
        },
      }),
    );
  });

  it("saves env fields without requiring raw json editing", async () => {
    const onSave = vi.fn();
    renderEditor({ onSave });

    fireEvent.change(screen.getByLabelText("ANTHROPIC_MODEL"), {
      target: { value: "claude-opus-4-1" },
    });
    fireEvent.change(screen.getByLabelText("ANTHROPIC_BASE_URL"), {
      target: { value: "https://example.com/api" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "team-openrouter",
        env: expect.objectContaining({
          ANTHROPIC_MODEL: "claude-opus-4-1",
          ANTHROPIC_BASE_URL: "https://example.com/api",
        }),
      }),
    );
  });
});
