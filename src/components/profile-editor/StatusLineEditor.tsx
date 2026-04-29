import { invoke } from "@tauri-apps/api/core";
import { useEffect, useMemo, useRef, useState } from "react";
import { useToast } from "../../hooks/useToast";
import { useI18n } from "../../i18n";
import ConfirmDialog from "../ConfirmDialog";
import { readObject } from "./editor-utils";
import {
  getStatusLineErrorKey,
  normalizeStatusLineFormValue,
  readStatusLineFormValue,
  type StatusLineFormValue,
} from "./status-line-utils";
import "./editor-shared.css";

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
    } catch {
      showToast(t("profileEditor.statusLine.installPresetError"), "error");
    } finally {
      setIsInstallingPreset(false);
    }
  }

  const validationError = useMemo(() => {
    const { errorCode } = normalizeStatusLineFormValue(draft);
    return errorCode ? t(getStatusLineErrorKey(errorCode, "controls")) : "";
  }, [draft, t]);

  return (
    <div className="profile-section-body">
      <div className="profile-subsection-header">
        <div>
          {showTitle ? <h4>{t("profileEditor.statusLine.title")}</h4> : null}
          <p>{t("profileEditor.statusLine.summaryHint")}</p>
        </div>
        <button
          type="button"
          className="profile-secondary-btn"
          disabled={isInstallingPreset}
          onClick={() => {
            void installDefaultPreset(false);
          }}
        >
          {t("profileEditor.statusLine.installDefaultPreset")}
        </button>
      </div>

      <div className="form-group">
        <label htmlFor="status-line-command">{t("profileEditor.statusLine.commandLabel")}</label>
        <input
          id="status-line-command"
          aria-label={t("profileEditor.statusLine.commandLabel")}
          className={validationError ? "input-error" : ""}
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

      <div className="form-row">
        <div className="form-group">
          <label htmlFor="status-line-padding">{t("profileEditor.statusLine.paddingLabel")}</label>
          <input
            id="status-line-padding"
            aria-label={t("profileEditor.statusLine.paddingLabel")}
            className={validationError ? "input-error" : ""}
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

        <div className="form-group">
          <label htmlFor="status-line-refresh-interval">
            {t("profileEditor.statusLine.refreshIntervalLabel")}
          </label>
          <input
            id="status-line-refresh-interval"
            aria-label={t("profileEditor.statusLine.refreshIntervalLabel")}
            className={validationError ? "input-error" : ""}
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

      {validationError ? <p className="field-error">{validationError}</p> : null}

      {overwriteDialogOpen ? (
        <ConfirmDialog
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
