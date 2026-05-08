import { json } from "@codemirror/lang-json";
import { EditorView } from "@codemirror/view";
import CodeMirror from "@uiw/react-codemirror";
import { Check, Copy } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useCodeMirrorTheme } from "../hooks/useCodeMirrorTheme";
import { useI18n } from "../i18n";
import { Button } from "./ui/button";

interface ConfigPreviewProps {
  content: string;
  onChange?: (value: string) => void;
  jsonError?: string;
}

// 启用 lineWrapping：长 JWT、URL 等单行字符串自动换行，避免水平溢出父容器
const JSON_EXTENSIONS = [json(), EditorView.lineWrapping];
const CODEMIRROR_BASIC_SETUP = {
  lineNumbers: true,
  foldGutter: false,
};
const READONLY_PREVIEW_ROOT_MARGIN = "240px 0px";

function ConfigPreview({ content, onChange, jsonError }: ConfigPreviewProps) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const editorTheme = useCodeMirrorTheme();
  const previewRef = useRef<HTMLDivElement>(null);
  const editable = !!onChange;
  const [editorReady, setEditorReady] = useState(editable);

  useEffect(() => {
    if (editable) {
      setEditorReady(true);
      return;
    }

    setEditorReady(false);
    const previewElement = previewRef.current;
    if (!previewElement || typeof IntersectionObserver === "undefined") {
      const timer = window.setTimeout(() => setEditorReady(true), 300);
      return () => window.clearTimeout(timer);
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) {
          return;
        }
        setEditorReady(true);
        observer.disconnect();
      },
      { rootMargin: READONLY_PREVIEW_ROOT_MARGIN },
    );

    observer.observe(previewElement);
    return () => observer.disconnect();
  }, [editable]);

  function handleCopy() {
    navigator.clipboard
      .writeText(content)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {
        // 剪贴板权限被拒绝或不在安全上下文中，静默处理
      });
  }

  return (
    <div
      ref={previewRef}
      data-slot="config-preview"
      className={cn(
        "flex min-w-0 flex-col overflow-hidden rounded-md border border-border bg-card",
        jsonError && "border-destructive",
      )}
    >
      <div className="flex items-center justify-end px-2 pt-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleCopy}
          className="h-7 gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground"
          data-testid="config-preview-copy"
        >
          {copied ? (
            <>
              <Check className="size-3.5" aria-hidden="true" />
              {t("configModal.jsonCopied")}
            </>
          ) : (
            <>
              <Copy className="size-3.5" aria-hidden="true" />
              {t("configModal.jsonCopy")}
            </>
          )}
        </Button>
      </div>
      {editorReady ? (
        <div className="min-w-0 overflow-hidden">
          <CodeMirror
            value={content}
            extensions={JSON_EXTENSIONS}
            theme={editorTheme}
            editable={editable}
            onChange={onChange}
            basicSetup={CODEMIRROR_BASIC_SETUP}
          />
        </div>
      ) : (
        <div className="min-h-[160px]" aria-hidden="true" />
      )}
      {jsonError ? <p className="m-0 px-3 pb-3 text-sm text-destructive">{jsonError}</p> : null}
    </div>
  );
}

export default ConfigPreview;
