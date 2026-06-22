import { Check, Copy } from "lucide-react";
import { lazy, type ReactNode, Suspense, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useI18n } from "../i18n";
import { Button } from "./ui/button";

interface ConfigPreviewProps {
  content: string;
  onChange?: (value: string) => void;
  jsonError?: string;
  /** 顶部工具条左侧的自定义操作(如清空 / 格式化);复制按钮始终在右侧 */
  actions?: ReactNode;
}

const ConfigPreviewCodeEditor = lazy(() => import("./ConfigPreviewCodeEditor"));
const READONLY_PREVIEW_ROOT_MARGIN = "240px 0px";
const CODE_EDITOR_FALLBACK_CLASS = "min-h-[160px]";

function ConfigPreview({ content, onChange, jsonError, actions }: ConfigPreviewProps) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
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
      <div className="flex items-center justify-between gap-2 px-2 pt-2">
        <div className="flex items-center gap-2">{actions}</div>
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
          <Suspense fallback={<div className={CODE_EDITOR_FALLBACK_CLASS} aria-hidden="true" />}>
            <ConfigPreviewCodeEditor content={content} editable={editable} onChange={onChange} />
          </Suspense>
        </div>
      ) : (
        <div className={CODE_EDITOR_FALLBACK_CLASS} aria-hidden="true" />
      )}
      {jsonError ? <p className="m-0 px-3 pb-3 text-sm text-destructive">{jsonError}</p> : null}
    </div>
  );
}

export default ConfigPreview;
