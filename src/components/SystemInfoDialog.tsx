import { getVersion } from "@tauri-apps/api/app";
import { arch, family, hostname, locale, platform, type, version } from "@tauri-apps/plugin-os";
import { useEffect, useMemo, useState } from "react";
import { useToast } from "../hooks/useToast";
import { useI18n } from "../i18n";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";

interface SystemInfoDialogProps {
  onClose: () => void;
}

/** 字段标签固定英文，保证复制出来的 Markdown 不随界面语言变化 */
interface InfoField {
  label: string;
  value: string | null;
}

function SystemInfoDialog({ onClose }: SystemInfoDialogProps) {
  const { t } = useI18n();
  const { showToast } = useToast();

  // 同步字段在首次渲染即可得到；异步字段（hostname/locale）在 effect 中补齐
  const [appVersion, setAppVersion] = useState<string | null>(null);
  const [hostNameValue, setHostNameValue] = useState<string | null>(null);
  const [localeValue, setLocaleValue] = useState<string | null>(null);
  const [asyncResolved, setAsyncResolved] = useState(false);

  // 拉取异步字段
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [v, hn, lc] = await Promise.all([getVersion(), hostname(), locale()]);
        if (cancelled) return;
        setAppVersion(v);
        setHostNameValue(hn);
        setLocaleValue(lc);
      } catch {
        // 静默失败：字段保持 null，下游会显示 Unknown 占位
      } finally {
        if (!cancelled) setAsyncResolved(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // 同步字段 + 异步字段合并；同步字段放 useMemo 只读一次
  const fields = useMemo<InfoField[]>(() => {
    return [
      { label: "App Version", value: appVersion },
      { label: "OS Type", value: type() },
      { label: "OS Platform", value: platform() },
      { label: "OS Version", value: version() },
      { label: "OS Family", value: family() },
      { label: "CPU Arch", value: arch() },
      { label: "Hostname", value: hostNameValue },
      { label: "Locale", value: localeValue },
    ];
  }, [appVersion, hostNameValue, localeValue]);

  const placeholderLoading = "…";
  const placeholderUnknown = t("settings.systemInfoUnknown");

  /** 将字段组装成 Markdown 代码块包裹的 Markdown 表格 */
  function buildMarkdown(): string {
    const rows = fields.map((f) => `| ${f.label} | ${f.value ?? "Unknown"} |`).join("\n");
    return ["```markdown", "| Field | Value |", "|-------|-------|", rows, "```"].join("\n");
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(buildMarkdown());
      showToast(t("settings.systemInfoCopied"), "success");
    } catch {
      showToast(t("settings.systemInfoCopyFailed"), "error");
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        aria-labelledby="system-info-dialog-title"
        className="flex max-h-[85vh] w-[480px] max-w-[92vw] flex-col gap-4 bg-[var(--bg-elevated)] p-6 sm:max-w-[480px]"
      >
        <DialogHeader>
          <DialogTitle id="system-info-dialog-title">{t("settings.systemInfo")}</DialogTitle>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <table className="w-full border-collapse text-[length:var(--font-sm)]">
            <tbody>
              {fields.map((f) => {
                // 同步字段直接显示；异步字段未就绪前显示 loading 占位
                const isAsyncField =
                  f.label === "App Version" || f.label === "Hostname" || f.label === "Locale";
                const display =
                  f.value ??
                  (isAsyncField && !asyncResolved ? placeholderLoading : placeholderUnknown);
                return (
                  <tr
                    key={f.label}
                    className="border-b border-[var(--border-subtle)] last:border-0"
                  >
                    <th
                      scope="row"
                      className="w-[40%] whitespace-nowrap py-2 pr-3 text-left font-medium text-[var(--text-secondary)]"
                    >
                      {f.label}
                    </th>
                    <td className="break-all py-2 font-mono text-[var(--text-primary)]">
                      {display}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            {t("common.close")}
          </Button>
          <Button
            type="button"
            onClick={() => {
              void handleCopy();
            }}
          >
            {t("settings.copySystemInfo")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default SystemInfoDialog;
