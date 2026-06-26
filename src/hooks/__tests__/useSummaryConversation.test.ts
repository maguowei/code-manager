import { describe, expect, it } from "vitest";
import { appendToken, type ChatMessage, toThreadMessage } from "../useSummaryConversation";

describe("toThreadMessage", () => {
  it("把 ChatMessage 映射为 ThreadMessageLike 并带 metadata", () => {
    const msg: ChatMessage = {
      id: "a1",
      role: "assistant",
      ts: "t",
      content: "## proj",
      intent: {
        kind: "day",
        start: "2026-06-24",
        end: "2026-06-24",
        projectFilter: [],
        style: "default",
        title: "X",
      },
      docPath: "/p.md",
      process: { phase: "done" },
    };
    const tm = toThreadMessage(msg);
    expect(tm.role).toBe("assistant");
    expect(tm.content).toEqual([{ type: "text", text: "## proj" }]);
    expect((tm.metadata as { custom: { docPath: string } }).custom.docPath).toBe("/p.md");
  });
});

describe("appendToken", () => {
  it("按 messageId 追加增量", () => {
    const base: ChatMessage[] = [
      { id: "a1", role: "assistant", ts: "t", content: "## ", streaming: true },
    ];
    const next = appendToken(base, { messageId: "a1", delta: "proj" });
    expect(next[0].content).toBe("## proj");
  });
  it("非匹配 id 不动", () => {
    const base: ChatMessage[] = [{ id: "a1", role: "assistant", ts: "t", content: "x" }];
    expect(appendToken(base, { messageId: "zzz", delta: "y" })[0].content).toBe("x");
  });
});
