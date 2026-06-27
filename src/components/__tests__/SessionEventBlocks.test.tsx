import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { TranslationKey } from "../../i18n";
import {
  HookBlock,
  ModeChangeBlock,
  PlanModeEnteredBlock,
  PlanModeExitedBlock,
} from "../SessionEventBlocks";

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

  it("PlanModeEnteredBlock 展示进入文案与计划文件名", () => {
    render(
      <PlanModeEnteredBlock
        block={{ type: "plan_mode_entered", plan_file_path: "/Users/demo/.claude/plans/foo.md" }}
        t={t}
      />,
    );
    expect(screen.getByText("history.planModeEntered")).toBeInTheDocument();
    expect(screen.getByText("foo.md")).toBeInTheDocument();
  });

  it("PlanModeExitedBlock 在无 plan_file_path 时只展示退出文案", () => {
    render(
      <PlanModeExitedBlock block={{ type: "plan_mode_exited", plan_file_path: null }} t={t} />,
    );
    expect(screen.getByText("history.planModeExited")).toBeInTheDocument();
  });
});
