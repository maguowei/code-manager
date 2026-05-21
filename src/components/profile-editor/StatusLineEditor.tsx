import { invoke } from "@tauri-apps/api/core";
import { Download } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useToast } from "../../hooks/useToast";
import { type TranslationKey, useI18n } from "../../i18n";
import ConfirmAlertDialog from "../ConfirmAlertDialog";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { readObject } from "./editor-utils";
import {
  getStatusLineErrorKey,
  normalizeStatusLineFormValue,
  readStatusLineFormValue,
  type StatusLineFormValue,
} from "./status-line-utils";

interface StatusLineEditorProps {
  value: unknown;
  onChange: (next: Record<string, unknown>) => void;
  onError: (message: string) => void;
  showTitle?: boolean;
}

interface StatusLinePresetInstallResult {
  presetId: string;
  targetPath: string;
  commandPath: string;
  installed: boolean;
  needsOverwrite: boolean;
}

const DEFAULT_STATUS_LINE_PRESET_ID = "default";
const STATUS_LINE_PRESET_UNSUPPORTED_PLATFORM_ERROR = "status_line_preset_unsupported_platform";

function getInstallPresetErrorKey(error: unknown): TranslationKey {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes(STATUS_LINE_PRESET_UNSUPPORTED_PLATFORM_ERROR)) {
    return "profileEditor.statusLine.installPresetUnsupportedPlatform";
  }
  return "profileEditor.statusLine.installPresetError";
}

function StatusLineEditor({ value, onChange, onError, showTitle = true }: StatusLineEditorProps) {
  const { t } = useI18n();
  const { showToast } = useToast();
  const statusLineObject = useMemo(() => readObject(value), [value]);
  const sourceValue = useMemo(() => readStatusLineFormValue(statusLineObject), [statusLineObject]);
  const [draft, setDraft] = useState<StatusLineFormValue>(sourceValue);
  const [isInstallingPreset, setIsInstallingPreset] = useState(false);
  const [overwriteDialogOpen, setOverwriteDialogOpen] = useState(false);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  useEffect(() => {
    setDraft(sourceValue);
    onErrorRef.current("");
  }, [sourceValue]);

  function handleDraftChange(nextDraft: StatusLineFormValue) {
    setDraft(nextDraft);

    const { normalized, errorCode } = normalizeStatusLineFormValue(nextDraft);
    const nextError = errorCode ? t(getStatusLineErrorKey(errorCode, "controls")) : "";
    onError(nextError);

    if (!nextError && JSON.stringify(normalized) !== JSON.stringify(statusLineObject)) {
      onChange(normalized);
    }
  }

  function applyInstalledPreset(commandPath: string) {
    const nextDraft: StatusLineFormValue = {
      command: commandPath,
      padding: "",
      refreshInterval: "",
    };
    setDraft(nextDraft);
    onError("");
    onChange({
      type: "command",
      command: commandPath,
    });
  }

  async function installDefaultPreset(overwrite: boolean) {
    setIsInstallingPreset(true);
    try {
      const result = await invoke<StatusLinePresetInstallResult>("install_status_line_preset", {
        presetId: DEFAULT_STATUS_LINE_PRESET_ID,
        overwrite,
      });

      if (result.needsOverwrite) {
        setOverwriteDialogOpen(true);
        return;
      }

      setOverwriteDialogOpen(false);
      applyInstalledPreset(result.commandPath);
    } catch (error) {
      showToast(t(getInstallPresetErrorKey(error)), "error");
    } finally {
      setIsInstallingPreset(false);
    }
  }

  const validationError = useMemo(() => {
    const { errorCode } = normalizeStatusLineFormValue(draft);
    return errorCode ? t(getStatusLineErrorKey(errorCode, "controls")) : "";
  }, [draft, t]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {showTitle ? <h4>{t("profileEditor.statusLine.title")}</h4> : null}
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            {t("profileEditor.statusLine.summaryHint")}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          className=""
          disabled={isInstallingPreset}
          onClick={() => {
            void installDefaultPreset(false);
          }}
        >
          <Download className="size-4" aria-hidden="true" />
          {t("profileEditor.statusLine.installDefaultPreset")}
        </Button>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="status-line-command">{t("profileEditor.statusLine.commandLabel")}</Label>
        <Input
          id="status-line-command"
          aria-label={t("profileEditor.statusLine.commandLabel")}
          className={validationError ? "input-error border-destructive" : ""}
          aria-invalid={!!validationError}
          placeholder={t("profileEditor.statusLine.commandPlaceholder")}
          value={draft.command}
          onChange={(event) =>
            handleDraftChange({
              ...draft,
              command: event.target.value,
            })
          }
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="status-line-padding">{t("profileEditor.statusLine.paddingLabel")}</Label>
          <Input
            id="status-line-padding"
            aria-label={t("profileEditor.statusLine.paddingLabel")}
            className={validationError ? "input-error border-destructive" : ""}
            aria-invalid={!!validationError}
            inputMode="decimal"
            placeholder={t("profileEditor.statusLine.paddingPlaceholder")}
            value={draft.padding}
            onChange={(event) =>
              handleDraftChange({
                ...draft,
                padding: event.target.value,
              })
            }
          />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="status-line-refresh-interval">
            {t("profileEditor.statusLine.refreshIntervalLabel")}
          </Label>
          <Input
            id="status-line-refresh-interval"
            aria-label={t("profileEditor.statusLine.refreshIntervalLabel")}
            className={validationError ? "input-error border-destructive" : ""}
            aria-invalid={!!validationError}
            inputMode="numeric"
            placeholder={t("profileEditor.statusLine.refreshIntervalPlaceholder")}
            value={draft.refreshInterval}
            onChange={(event) =>
              handleDraftChange({
                ...draft,
                refreshInterval: event.target.value,
              })
            }
          />
        </div>
      </div>

      {validationError ? (
        <p className="m-0 text-sm font-medium text-destructive">{validationError}</p>
      ) : null}

      {overwriteDialogOpen ? (
        <ConfirmAlertDialog
          title={t("profileEditor.statusLine.overwriteDialogTitle")}
          message={t("profileEditor.statusLine.overwriteDialogMessage")}
          confirmText={t("profileEditor.statusLine.overwriteDialogConfirm")}
          cancelText={t("profileEditor.common.cancel")}
          onConfirm={() => {
            void installDefaultPreset(true);
          }}
          onCancel={() => setOverwriteDialogOpen(false)}
        />
      ) : null}
    </div>
  );
}

export default StatusLineEditor;
