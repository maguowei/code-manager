import { describe, expect, it } from "vitest";
import { resolveRequestedSession } from "../history-utils";

describe("resolveRequestedSession", () => {
  it("带 sessionId 时返回该 session", () => {
    expect(resolveRequestedSession({ project: "/p", sessionId: "s9", requestId: 1 })).toEqual({
      project: "/p",
      sessionId: "s9",
    });
  });

  it("无 sessionId 时只返回 project", () => {
    expect(resolveRequestedSession({ project: "/p", requestId: 1 })).toEqual({
      project: "/p",
      sessionId: null,
    });
  });
});
