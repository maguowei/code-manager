import { Trash2 } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { useI18n } from "../../i18n";
import ConfigPreview from "../ConfigPreview";
import ConfirmAlertDialog from "../ConfirmAlertDialog";
import { TYPOGRAPHY } from "../typography-classes";
import { Button } from "../ui/button";

type DocumentEditorMode = "preview" | "json";

interface DocumentEditorSectionProps {
  title: string;
  previewContent: string;
  previewError?: string;
  getEditContent: () => string;
  editError: string;
  hasAppliedDraft: boolean;
  onEditChange: (nextValue: string) => void;
  onFormat: () => void;
  onClear: () => void;
  previewModeLabel: string;
  editModeLabel: string;
  editHint: string;
  supportedKeys: string[];
  supportedKeysLabel: string;
}

function DocumentEditorSection({
  title,
  previewContent,
  previewError,
  getEditContent,
  editError,
  hasAppliedDraft,
  onEditChange,
  onFormat,
  onClear,
  previewModeLabel,
  editModeLabel,
  editHint,
  supportedKeys,
  supportedKeysLabel,
}: DocumentEditorSectionProps) {
  const { t } = useI18n();
  const [mode, setMode] = useState<DocumentEditorMode>("preview");
  const [clearJsonDialogOpen, setClearJsonDialogOpen] = useState(false);

  return (
    <section className="flex flex-col gap-4 rounded-lg border border-border/80 bg-card p-5 shadow-panel">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className={TYPOGRAPHY.sectionTitle}>{title}</h3>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div
            className="inline-flex items-center rounded-full border border-border/80 bg-muted/40 p-1 shadow-xs"
            role="tablist"
            aria-label={`${title} ${editModeLabel}`}
          >
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className={cn(
                "min-w-16 rounded-full px-3 text-xs font-semibold text-muted-foreground hover:bg-primary/10 hover:text-primary",
                mode === "preview" && "bg-primary/10 text-primary shadow-xs",
              )}
              aria-pressed={mode === "preview"}
              onClick={() => setMode("preview")}
            >
              {previewModeLabel}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className={cn(
                "min-w-16 rounded-full px-3 text-xs font-semibold text-muted-foreground hover:bg-primary/10 hover:text-primary",
                mode === "json" && "bg-primary/10 text-primary shadow-xs",
              )}
              aria-pressed={mode === "json"}
              onClick={() => setMode("json")}
            >
              {editModeLabel}
            </Button>
          </div>
        </div>
      </div>

      {mode === "preview" ? (
        <div className="grid gap-2">
          <ConfigPreview content={previewContent} jsonError={previewError} />
        </div>
      ) : (
        <div className="flex flex-col gap-3 rounded-lg border border-dashed border-border/80 bg-muted/50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="m-0 min-w-[220px] flex-1 text-sm text-muted-foreground">{editHint}</p>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="destructive-outline"
                onClick={() => setClearJsonDialogOpen(true)}
              >
                <Trash2 className="size-4" aria-hidden="true" />
                {t("common.clearJson")}
              </Button>
              <Button type="button" variant="outline" onClick={onFormat}>
                {t("common.formatJson")}
              </Button>
            </div>
          </div>

          {supportedKeys.length > 0 ? (
            <div className="flex flex-col gap-2 text-sm text-muted-foreground">
              <span>{supportedKeysLabel}</span>
              <div className="flex flex-wrap gap-1.5">
                {supportedKeys.map((key) => (
                  <span
                    key={key}
                    className="rounded-md border border-border bg-secondary px-2 py-1 font-mono text-xs text-foreground"
                  >
                    {key}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          {!hasAppliedDraft ? (
            <p className="m-0 text-sm text-muted-foreground">
              {t("common.sectionJsonDraftPending")}
            </p>
          ) : null}

          <ConfigPreview content={getEditContent()} onChange={onEditChange} jsonError={editError} />
        </div>
      )}

      {clearJsonDialogOpen ? (
        <ConfirmAlertDialog
          title={t("common.clearJson")}
          message={t("common.clearJsonDialogMessage")}
          confirmText={t("common.clearJson")}
          cancelText={t("profileEditor.common.cancel")}
          danger
          onConfirm={() => {
            onClear();
            setClearJsonDialogOpen(false);
          }}
          onCancel={() => setClearJsonDialogOpen(false)}
        />
      ) : null}
    </section>
  );
}

export default DocumentEditorSection;
