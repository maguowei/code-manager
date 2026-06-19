import { Component, type ErrorInfo, type ReactNode } from "react";
import { useI18n } from "../i18n";
import { logger } from "../utils/logger";
import { Button } from "./ui/button";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  // 是否展示手动兜底界面；自动恢复期间保持 false，避免在刷新瞬间渲染依赖 useI18n 的兜底自身再崩
  showFallback: boolean;
}

// 自动恢复时间窗：窗口内重复抛错视为持续性错误，停止自动刷新改走手动兜底，防止刷新循环
const AUTO_RECOVER_WINDOW_MS = 10_000;
// 上次自动恢复时间戳的 sessionStorage 键
const AUTO_RECOVER_KEY = "ai-manager:error-boundary:last-recover";

// 渲染期错误的兜底界面；作为函数组件以便复用 useI18n 文案
function ErrorFallback({ onReload }: { onReload: () => void }) {
  const { t } = useI18n();
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="flex max-w-md flex-col gap-2">
        <h1 className="text-lg font-semibold text-foreground">{t("app.errorBoundary.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("app.errorBoundary.description")}</p>
      </div>
      <Button type="button" onClick={onReload}>
        {t("app.errorBoundary.reload")}
      </Button>
    </div>
  );
}

// React 渲染期错误边界：拦截子树抛错，记录日志并展示可恢复兜底界面，避免整页白屏
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, showFallback: false };

  static getDerivedStateFromError(): Pick<ErrorBoundaryState, "hasError"> {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    logger.error(
      `event=frontend.render-error status=error message=${error.message} stack=${info.componentStack ?? ""}`,
    );

    // dev 模式 HMR / 陈旧 chunk 等瞬时错误可通过整页重载自愈；时间窗守卫避免持续性错误反复刷新
    if (this.shouldAutoRecover()) {
      this.handleReload();
      return;
    }
    this.setState({ showFallback: true });
  }

  // 仅在首次或距上次自动恢复超过时间窗时才自愈刷新；窗口内复发判定为持续性错误，返回 false
  private shouldAutoRecover(): boolean {
    try {
      const now = Date.now();
      const last = Number(window.sessionStorage.getItem(AUTO_RECOVER_KEY));
      if (last > 0 && now - last <= AUTO_RECOVER_WINDOW_MS) {
        return false;
      }
      window.sessionStorage.setItem(AUTO_RECOVER_KEY, String(now));
      return true;
    } catch {
      // sessionStorage 不可用时不冒险自动刷新，直接走手动兜底
      return false;
    }
  }

  private handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      // 自愈刷新决策完成前先空屏，避免渲染依赖 useI18n 的兜底界面
      if (!this.state.showFallback) {
        return null;
      }
      return <ErrorFallback onReload={this.handleReload} />;
    }
    return this.props.children;
  }
}
