import React from "react";
import ReactDOM from "react-dom/client";
import { ToastProvider } from "./hooks/useToast";
import { I18nProvider } from "./i18n";
import { installGlobalErrorLogging } from "./utils/logger";
import "./styles/shared.css";
import "./components/Toast.css";
import "github-markdown-css/github-markdown.css";
import App from "./App";

installGlobalErrorLogging();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <I18nProvider>
      <ToastProvider>
        <App />
      </ToastProvider>
    </I18nProvider>
  </React.StrictMode>,
);
