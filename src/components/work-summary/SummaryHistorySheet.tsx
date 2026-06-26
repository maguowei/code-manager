import { ArrowLeft, History } from "lucide-react";
import { useState } from "react";
import { Streamdown } from "streamdown";
import { showOperationError } from "@/lib/user-facing-error";
import type { SummaryDocument, SummaryListItem } from "../../bindings";
import { useToast } from "../../hooks/useToast";
import { useI18n } from "../../i18n";
import { ipc } from "../../ipc";
import { Button } from "../ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "../ui/sheet";

/** 历史总结抽屉：列出已落盘的日/周总结，点开用 streamdown 预览正文 */
function SummaryHistorySheet() {
  const { t } = useI18n();
  const { showToast } = useToast();
  const [items, setItems] = useState<SummaryListItem[]>([]);
  const [doc, setDoc] = useState<SummaryDocument | null>(null);

  const onOpenChange = (open: boolean) => {
    if (!open) {
      // 关闭时复位详情视图，下次打开从列表起
      setDoc(null);
      return;
    }
    void ipc
      .listSummaries()
      .then(setItems)
      .catch((error) => showOperationError(showToast, t("worklog.loadError"), error));
  };

  return (
    <Sheet onOpenChange={onOpenChange}>
      <SheetTrigger asChild>
        <Button type="button" size="sm" variant="ghost">
          <History aria-hidden="true" />
          {t("worklog.history")}
        </Button>
      </SheetTrigger>
      <SheetContent aria-describedby={undefined} className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{t("worklog.history")}</SheetTitle>
        </SheetHeader>
        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-4 pb-4">
          {doc ? (
            <>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="self-start"
                onClick={() => setDoc(null)}
              >
                <ArrowLeft aria-hidden="true" />
                {t("common.back")}
              </Button>
              <Streamdown>{doc.content}</Streamdown>
            </>
          ) : items.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("worklog.empty")}</p>
          ) : (
            items.map((item) => (
              <Button
                key={`${item.kind}-${item.key}`}
                type="button"
                variant="ghost"
                className="h-auto justify-start"
                onClick={() =>
                  void ipc
                    .readSummary(item.kind, item.key)
                    .then(setDoc)
                    .catch((error) => showOperationError(showToast, t("worklog.loadError"), error))
                }
              >
                <span className="truncate">
                  {item.key} · {item.kind === "weekly" ? t("worklog.weekly") : t("worklog.daily")}
                </span>
              </Button>
            ))
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

export default SummaryHistorySheet;
