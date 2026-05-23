import { describe, expect, it } from "vitest";
import {
  agentsSkillsStatusLabel,
  agentsStatusLabel,
  agentsStatusTone,
  formatCommitTime,
  formatDuration,
  formatHistoryTimestamp,
  formatUSD,
  isPairActionable,
  pairStatusLabel,
  pairStatusTone,
} from "../project-detail-utils";

const t = (key: string) => key;

describe("project-detail-utils", () => {
  it("formats currency, durations, and optional timestamps", () => {
    expect(formatUSD(0.001)).toBe("< $0.01");
    expect(formatUSD(0)).toBe("$0.00");
    expect(formatUSD(1.235)).toBe("$1.24");

    expect(formatDuration(999)).toBe("999ms");
    expect(formatDuration(1500)).toBe("1.5s");
    expect(formatDuration(90_000)).toBe("1.5m");
    expect(formatDuration(7_200_000)).toBe("2.0h");

    expect(formatCommitTime()).toBeNull();
    expect(formatCommitTime(1_700_000_000)).toEqual(expect.any(String));
    expect(formatHistoryTimestamp()).toBe("—");
    expect(formatHistoryTimestamp(1_700_000_000_000)).toEqual(expect.any(String));
  });

  it("maps AGENTS statuses to labels and tones", () => {
    expect(agentsStatusLabel("correctSymlink", t)).toBe("projects.agentsCorrect");
    expect(agentsStatusLabel("wrongSymlink", t)).toBe("projects.agentsWrong");
    expect(agentsStatusLabel("plainFileConflict", t)).toBe("projects.agentsConflict");
    expect(agentsStatusLabel("missing", t)).toBe("projects.agentsMissing");

    expect(agentsSkillsStatusLabel("correctSymlink", t)).toBe("projects.agentsSkillsCorrect");
    expect(agentsSkillsStatusLabel("wrongSymlink", t)).toBe("projects.agentsSkillsWrong");
    expect(agentsSkillsStatusLabel("plainFileConflict", t)).toBe("projects.agentsSkillsConflict");
    expect(agentsSkillsStatusLabel("missing", t)).toBe("projects.agentsSkillsMissing");

    expect(agentsStatusTone("correctSymlink")).toBe("success");
    expect(agentsStatusTone("wrongSymlink")).toBe("warning");
    expect(agentsStatusTone("plainFileConflict")).toBe("danger");
    expect(agentsStatusTone("missing")).toBe("muted");
  });

  it("maps memory pair statuses to actionability, labels, and tones", () => {
    expect(isPairActionable("paired")).toBe(false);
    expect(isPairActionable("onlyClaude")).toBe(true);
    expect(isPairActionable("onlyAgents")).toBe(true);
    expect(isPairActionable("wrongSymlink")).toBe(true);
    expect(isPairActionable("conflict")).toBe(false);
    expect(isPairActionable("orphanSymlink")).toBe(false);
    expect(isPairActionable("bothMissing")).toBe(false);

    expect(pairStatusTone("paired")).toBe("success");
    expect(pairStatusTone("onlyClaude")).toBe("warning");
    expect(pairStatusTone("onlyAgents")).toBe("warning");
    expect(pairStatusTone("wrongSymlink")).toBe("warning");
    expect(pairStatusTone("conflict")).toBe("danger");
    expect(pairStatusTone("orphanSymlink")).toBe("danger");
    expect(pairStatusTone("bothMissing")).toBe("muted");

    expect(pairStatusLabel("paired", t)).toBe("projects.pairPaired");
    expect(pairStatusLabel("onlyClaude", t)).toBe("projects.pairOnlyClaude");
    expect(pairStatusLabel("onlyAgents", t)).toBe("projects.pairOnlyAgents");
    expect(pairStatusLabel("wrongSymlink", t)).toBe("projects.pairWrongSymlink");
    expect(pairStatusLabel("conflict", t)).toBe("projects.pairConflict");
    expect(pairStatusLabel("orphanSymlink", t)).toBe("projects.pairOrphanSymlink");
    expect(pairStatusLabel("bothMissing", t)).toBe("projects.pairBothMissing");
  });
});
