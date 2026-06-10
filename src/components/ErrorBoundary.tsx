import { Component, type ErrorInfo, type ReactNode } from "react";
import { useI18n } from "../i18n";
import { logger } from "../utils/logger";
import { Button } from "./ui/button";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

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
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    logger.error(
      `event=frontend.render-error status=error message=${error.message} stack=${info.componentStack ?? ""}`,
    );
  }

  private handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return <ErrorFallback onReload={this.handleReload} />;
    }
    return this.props.children;
  }
}
