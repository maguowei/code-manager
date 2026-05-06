import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

import { toast } from "sonner";
import { useToast } from "@/hooks/useToast";

describe("useToast (sonner adapter)", () => {
  beforeEach(() => {
    vi.mocked(toast.success).mockClear();
    vi.mocked(toast.error).mockClear();
  });

  it("默认 success 走 toast.success", () => {
    const { result } = renderHook(() => useToast());

    act(() => {
      result.current.showToast("ok");
    });

    expect(toast.success).toHaveBeenCalledWith("ok");
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("error 类型走 toast.error", () => {
    const { result } = renderHook(() => useToast());

    act(() => {
      result.current.showToast("bad", "error");
    });

    expect(toast.error).toHaveBeenCalledWith("bad");
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("保持 showToast 引用稳定，避免依赖它的 effect 重复触发", () => {
    const { result, rerender } = renderHook(() => useToast());
    const firstShowToast = result.current.showToast;

    rerender();

    expect(result.current.showToast).toBe(firstShowToast);
  });
});
