import { describe, expect, it } from "vitest";
import { findMatchIndices } from "../useConversationSearch";

describe("findMatchIndices", () => {
  it("空 needle 返回空数组", () => {
    expect(findMatchIndices("hello world", "")).toEqual([]);
  });

  it("无匹配返回空数组", () => {
    expect(findMatchIndices("hello world", "xyz")).toEqual([]);
  });

  it("返回全部匹配起始下标", () => {
    expect(findMatchIndices("a-b-a-b-a", "a")).toEqual([0, 4, 8]);
  });

  it("不区分大小写", () => {
    expect(findMatchIndices("Foo foo FOO", "foo")).toEqual([0, 4, 8]);
  });

  it("非重叠匹配（aaaa 中找 aa 命中两处）", () => {
    expect(findMatchIndices("aaaa", "aa")).toEqual([0, 2]);
  });

  it("匹配多字符子串", () => {
    expect(findMatchIndices("plan mode entered, plan mode exited", "plan mode")).toEqual([0, 19]);
  });
});
