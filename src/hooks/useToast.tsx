import { type ReactNode, useCallback, useMemo } from "react";
import { toast } from "sonner";

/** Toast 消息类型 */
type ToastType = "success" | "error";

/** Toast hook 返回值接口 */
interface ToastContextValue {
  showToast: (message: string, type?: ToastType) => void;
}

/** 兼容性 Provider：保留命名以减少调用点变更，不再持有状态 */
export function ToastProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

/** 获取 showToast 函数的 hook */
export function useToast(): ToastContextValue {
  const showToast = useCallback((message: string, type: ToastType = "success") => {
    if (type === "error") {
      toast.error(message);
      return;
    }
    toast.success(message);
  }, []);

  return useMemo(() => ({ showToast }), [showToast]);
}
