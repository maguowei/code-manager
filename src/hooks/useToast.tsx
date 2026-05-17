import { useCallback, useMemo } from "react";
import { toast } from "sonner";

/** Toast 消息类型 */
type ToastType = "success" | "error";

type ToastOptions = {
  description?: string;
};

export type ShowToast = (message: string, type?: ToastType, options?: ToastOptions) => void;

/** Toast hook 返回值接口 */
interface ToastContextValue {
  showToast: ShowToast;
}

/** 获取 showToast 函数的 hook */
export function useToast(): ToastContextValue {
  const showToast = useCallback<ShowToast>((message, type = "success", options) => {
    if (type === "error") {
      if (options?.description) {
        toast.error(message, { description: options.description });
        return;
      }
      toast.error(message);
      return;
    }
    if (options?.description) {
      toast.success(message, { description: options.description });
      return;
    }
    toast.success(message);
  }, []);

  return useMemo(() => ({ showToast }), [showToast]);
}
