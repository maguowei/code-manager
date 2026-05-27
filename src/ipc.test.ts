import { describe, expect, it } from "vitest";

import { unwrapIpcResult } from "./ipc";

describe("unwrapIpcResult", () => {
  it("returns data from successful generated command results", async () => {
    await expect(
      unwrapIpcResult(Promise.resolve({ status: "ok", data: { value: 42 } })),
    ).resolves.toEqual({ value: 42 });
  });

  it("throws generated command string errors for existing catch handlers", async () => {
    await expect(unwrapIpcResult(Promise.resolve({ status: "error", error: "boom" }))).rejects.toBe(
      "boom",
    );
  });

  it("preserves Error rejections from generated command wrappers", async () => {
    const error = new Error("native invoke failed");

    await expect(unwrapIpcResult(Promise.reject(error))).rejects.toBe(error);
  });
});
