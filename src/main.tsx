import React from "react";
import ReactDOM from "react-dom/client";
import { I18nProvider } from "./i18n";
import { ToastProvider } from "./hooks/useToast";
import "./components/Toast.css";
import App from "./App";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <I18nProvider>
      <ToastProvider>
        <App />
      </ToastProvider>
    </I18nProvider>
  </React.StrictMode>,
);
