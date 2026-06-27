import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { TranslationKey } from "../../i18n";
import { HookBlock, ModeChangeBlock } from "../SessionEventBlocks";

const t = (k: TranslationKey) => k as string;

describe("SessionEventBlocks", () => {
  it("HookBlock 展示命令并高亮错误", () => {
    render(
      <HookBlock
        block={{
          type: "hook",
          hooks: [{ command: "lefthook pre-commit", duration_ms: 120 }],
          errors: ["gitleaks failed"],
          prevented_continuation: true,
          stop_reason: "blocked",
        }}
        t={t}
      />,
    );
    expect(screen.getByText(/lefthook pre-commit/)).toBeInTheDocument();
    expect(screen.getByText(/gitleaks failed/)).toBeInTheDocument();
  });

  it("ModeChangeBlock 展示模式名", () => {
    render(<ModeChangeBlock block={{ type: "mode_change", mode: "plan" }} t={t} />);
    expect(screen.getByText(/plan/)).toBeInTheDocument();
  });
});
