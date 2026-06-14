import { ExternalLink } from "lucide-react";
import { useEffect, useState } from "react";
import { showOperationError } from "@/lib/user-facing-error";
import { useToast } from "../hooks/useToast";
import { useI18n } from "../i18n";
import { ipc } from "../ipc";
import { isTauri } from "../types";
import MarkdownPreview from "./claude-overview/MarkdownPreview";
import { useTheme } from "./theme-provider";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Spinner } from "./ui/spinner";

interface Props {
  project: string;
  sessionId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** 会话关联 plan 的应用内 Markdown 预览,支持用外部编辑器打开实际文件 */
export function SessionPlanDialog({ project, sessionId, open, onOpenChange }: Props) {
  const { t } = useI18n();
  const { showToast } = useToast();
  const { isDark } = useTheme();
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // 仅在打开时读取 plan 文件实时内容;失败则提示并关闭
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setContent(null);
    ipc
      .readSessionPlan(project, sessionId)
      .then((plan) => {
        if (!cancelled) setContent(plan.content);
      })
      .catch((error) => {
        if (!cancelled) {
          showOperationError(showToast, t("history.sessionPlanLoadError"), error);
          onOpenChange(false);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, project, sessionId, showToast, t, onOpenChange]);

  const handleOpenInEditor = async () => {
    if (!isTauri()) return;
    try {
      await ipc.openSessionPlanInEditor(project, sessionId);
      showToast(t("history.sessionPlanOpenRequested"));
    } catch (error) {
      showOperationError(showToast, t("history.sessionPlanOpenError"), error);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex max-h-[80vh] flex-col gap-0 p-0 sm:max-w-3xl"
        aria-describedby={undefined}
      >
        <DialogHeader className="shrink-0 border-b px-5 py-3">
          <div className="flex items-center justify-between gap-3 pr-8">
            <DialogTitle className="text-base">{t("history.sessionPlanDialogTitle")}</DialogTitle>
            <Button
              type="button"
              variant="outline"
              size="xs"
              className="shrink-0 gap-1.5 text-muted-foreground"
              onClick={() => void handleOpenInEditor()}
              disabled={!isTauri()}
            >
              <ExternalLink className="size-3.5" aria-hidden="true" />
              <span>{t("history.sessionPlanOpenInEditor")}</span>
            </Button>
          </div>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <div className="flex justify-center py-10">
              <Spinner className="size-5" />
            </div>
          ) : content !== null ? (
            <MarkdownPreview content={content} themeType={isDark ? "dark" : "light"} />
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
