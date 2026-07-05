import { Download, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "../i18n";
import { useUpdater } from "./UpdaterProvider";

/**
 * 顶部常驻更新横幅：仅在发现新版本 / 下载中 / 待重启时渲染，否则隐藏。
 * 整条承载「立即更新」动作，点击即走下载 → 进度 → 重启流程；克制细条，使用 shadcn 语义色。
 */
export function UpdateBanner() {
  const { t } = useI18n();
  const { status, availableVersion, progress, downloadAndRestart } = useUpdater();

  // 只有这三种状态需要常驻提示；其余（idle/checking/upToDate/error）不打扰用户
  if (status !== "available" && status !== "downloading" && status !== "ready") {
    return null;
  }

  const isDownloading = status === "downloading";

  let message: string;
  let actionLabel: string;
  if (status === "downloading") {
    message = t("update.downloading").replace("{percent}", String(progress));
    // 下载中横幅文案与按钮文案一致，复用同一份已算好的字符串，避免热路径重复计算
    actionLabel = message;
  } else if (status === "ready") {
    message = t("update.readyBanner");
    actionLabel = t("update.restartNow");
  } else {
    message = t("update.available").replace("{version}", availableVersion ?? "");
    actionLabel = t("update.updateNow");
  }

  return (
    <div
      className="flex shrink-0 items-center gap-3 border-b border-primary/20 bg-primary/10 px-4 py-2 text-sm text-primary"
      role="status"
    >
      {status === "ready" ? (
        <RefreshCw className="size-4 shrink-0" aria-hidden="true" />
      ) : (
        <Download className="size-4 shrink-0" aria-hidden="true" />
      )}
      <span className="min-w-0 flex-1 truncate font-medium">{message}</span>
      <Button
        type="button"
        size="sm"
        disabled={isDownloading}
        onClick={() => {
          void downloadAndRestart();
        }}
      >
        {actionLabel}
      </Button>
    </div>
  );
}
