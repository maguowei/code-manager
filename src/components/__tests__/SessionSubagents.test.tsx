import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { TranslationKey } from "../../i18n";
import type { SubagentChain } from "../../types";
import { SessionSubagents } from "../SessionSubagents";

const t = (k: TranslationKey) => k as string;

const chains: SubagentChain[] = [
  {
    agent_id: "a1",
    slug: "explore",
    messages: [{ role: "assistant", blocks: [{ type: "text", text: "sub answer" }] }],
  },
];

describe("SessionSubagents", () => {
  it("展示侧链 slug 与子消息", () => {
    render(
      <SessionSubagents
        subagents={chains}
        renderBlocks={(blocks) => (
          <>
            {blocks.map((b, i) =>
              b.type === "text" ? (
                <span
                  // biome-ignore lint/suspicious/noArrayIndexKey: 测试用渲染，索引语义稳定
                  key={i}
                >
                  {b.text}
                </span>
              ) : null,
            )}
          </>
        )}
        t={t}
      />,
    );
    expect(screen.getByText(/explore/)).toBeInTheDocument();
    expect(screen.getByText(/sub answer/)).toBeInTheDocument();
  });

  it("空数组渲染为空", () => {
    const { container } = render(
      <SessionSubagents subagents={[]} renderBlocks={() => null} t={t} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
