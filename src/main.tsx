import React from "react";
import ReactDOM from "react-dom/client";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { ThemeProvider } from "./components/theme-provider";
import { I18nProvider } from "./i18n";
import { installGlobalErrorLogging } from "./utils/logger";
import "./index.css";

installGlobalErrorLogging();

// 浮窗窗口由后端以 index.html?window=widget 打开；据此只渲染浮窗组件，不挂载主应用壳。
const isWidgetWindow = new URLSearchParams(window.location.search).get("window") === "widget";

// 主应用与浮窗都懒加载，确保各自打包为独立 chunk，浮窗窗口不拉取主壳代码。
const App = React.lazy(() => import("./App"));
const FloatingWidget = React.lazy(() => import("./components/widget/FloatingWidget"));

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <I18nProvider>
      <ThemeProvider>
        <ErrorBoundary>
          <React.Suspense fallback={null}>
            {isWidgetWindow ? <FloatingWidget /> : <App />}
          </React.Suspense>
        </ErrorBoundary>
      </ThemeProvider>
    </I18nProvider>
  </React.StrictMode>,
);
