import { getVersion } from "@tauri-apps/api/app";
import { arch, family, hostname, locale, platform, type, version } from "@tauri-apps/plugin-os";
import { useEffect, useMemo, useState } from "react";
import useEscapeKey from "../hooks/useEscapeKey";
import { useToast } from "../hooks/useToast";
import { useI18n } from "../i18n";
import "./SystemInfoDialog.css";

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

  // ESC 关闭，阻止冒泡避免关闭外层抽屉
  useEscapeKey((e) => {
    e?.stopImmediatePropagation();
    onClose();
  });

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
    <div className="system-info-overlay" onClick={onClose}>
      <div
        className="system-info-dialog"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="system-info-dialog-title"
      >
        <div className="system-info-dialog__header">
          <h3 id="system-info-dialog-title" className="system-info-dialog__title">
            {t("settings.systemInfo")}
          </h3>
        </div>
        <div className="system-info-dialog__body">
          <table className="system-info-table">
            <tbody>
              {fields.map((f) => {
                // 同步字段直接显示；异步字段未就绪前显示 loading 占位
                const isAsyncField =
                  f.label === "App Version" || f.label === "Hostname" || f.label === "Locale";
                const display =
                  f.value ??
                  (isAsyncField && !asyncResolved ? placeholderLoading : placeholderUnknown);
                return (
                  <tr key={f.label}>
                    <th scope="row">{f.label}</th>
                    <td>{display}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="system-info-dialog__actions">
          <button
            type="button"
            className="system-info-dialog__btn system-info-dialog__btn--secondary"
            onClick={onClose}
          >
            {t("common.close")}
          </button>
          <button
            type="button"
            className="system-info-dialog__btn system-info-dialog__btn--primary"
            onClick={handleCopy}
          >
            {t("settings.copySystemInfo")}
          </button>
        </div>
      </div>
    </div>
  );
}

export default SystemInfoDialog;
