import { Eye, EyeOff, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "../../i18n";
import ConfirmAlertDialog from "../ConfirmAlertDialog";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { createRowId, looksSensitiveKey } from "./editor-utils";
import RequiredBadge from "./RequiredBadge";

interface EnvEditorProps {
  value: unknown;
  onChange: (next: Record<string, unknown>) => void;
  onError: (message: string) => void;
  showTitle?: boolean;
  hiddenKeys?: string[];
}

interface EnvListItem {
  id: string;
  key: string;
  value: string;
  isDraft?: boolean;
}

interface EnvDraft {
  id: string;
  originalKey: string | null;
  key: string;
  value: string;
  isNew: boolean;
}

function EnvEditor({
  value,
  onChange,
  onError,
  showTitle = true,
  hiddenKeys = [],
}: EnvEditorProps) {
  const { t } = useI18n();
  const hiddenKeySet = useMemo(() => new Set(hiddenKeys), [hiddenKeys]);
  const keyInputRef = useRef<HTMLInputElement | null>(null);
  const fullValue = useMemo(
    () => (typeof value === "object" && value ? (value as Record<string, unknown>) : {}),
    [value],
  );
  const visibleValue = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(fullValue).filter(
          ([key, entry]) => !hiddenKeySet.has(key) && typeof entry === "string",
        ),
      ) as Record<string, string>,
    [fullValue, hiddenKeySet],
  );
  const preservedEntries = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(fullValue).filter(
          ([key, entry]) => hiddenKeySet.has(key) || typeof entry !== "string",
        ),
      ) as Record<string, unknown>,
    [fullValue, hiddenKeySet],
  );
  const visibleEntries = useMemo(
    () =>
      Object.entries(visibleValue).map(
        ([key, entry]) =>
          ({
            id: `env:${key}`,
            key,
            value: entry,
          }) satisfies EnvListItem,
      ),
    [visibleValue],
  );
  const [draft, setDraft] = useState<EnvDraft | null>(null);
  const [draftError, setDraftError] = useState("");
  const [interactionError, setInteractionError] = useState("");
  const [isSensitiveValueVisible, setIsSensitiveValueVisible] = useState(false);
  const [pendingDeleteItem, setPendingDeleteItem] = useState<EnvListItem | null>(null);
  const shouldMaskSensitiveValues = true;
  const activeDraftId = draft?.id ?? null;

  const selectedItem = useMemo(() => {
    if (!draft) {
      return null;
    }
    if (draft.isNew) {
      return {
        id: draft.id,
        key: draft.key,
        value: draft.value,
        isDraft: true,
      } satisfies EnvListItem;
    }
    return visibleEntries.find((item) => item.key === draft.originalKey) ?? null;
  }, [draft, visibleEntries]);

  const hasUnsavedChanges = useMemo(() => {
    if (!draft) {
      return false;
    }
    if (draft.isNew) {
      return true;
    }
    if (!selectedItem) {
      return false;
    }
    return draft.key !== selectedItem.key || draft.value !== selectedItem.value;
  }, [draft, selectedItem]);

  const sectionPendingMessage = t("profileEditor.env.pendingMessage");
  const switchBlockedMessage = t("profileEditor.env.switchBlockedMessage");
  const emptyHint = t("profileEditor.env.emptyHint");
  const deleteDialogTitle = t("profileEditor.env.deleteDialogTitle");
  const deleteDialogConfirmText = t("profileEditor.common.delete");
  const deleteDialogCancelText = t("profileEditor.common.cancel");

  const visibleItems = useMemo<EnvListItem[]>(() => {
    if (draft?.isNew) {
      return [
        ...visibleEntries,
        {
          id: draft.id,
          key: draft.key,
          value: draft.value,
          isDraft: true,
        } satisfies EnvListItem,
      ];
    }
    return visibleEntries;
  }, [draft, visibleEntries]);

  const currentError = useMemo(() => {
    if (draftError) {
      return draftError;
    }
    if (interactionError) {
      return interactionError;
    }
    if (draft && hasUnsavedChanges) {
      return sectionPendingMessage;
    }
    return "";
  }, [draft, draftError, hasUnsavedChanges, interactionError, sectionPendingMessage]);

  useEffect(() => {
    onError(currentError);
  }, [currentError, onError]);

  useEffect(() => {
    if (!draft || !selectedItem) {
      return;
    }
    if (draft.isNew || hasUnsavedChanges) {
      return;
    }
    if (
      draft.id === selectedItem.id &&
      draft.originalKey === selectedItem.key &&
      draft.key === selectedItem.key &&
      draft.value === selectedItem.value
    ) {
      return;
    }
    setDraft({
      id: selectedItem.id,
      originalKey: selectedItem.key,
      key: selectedItem.key,
      value: selectedItem.value,
      isNew: false,
    });
  }, [draft, hasUnsavedChanges, selectedItem]);

  useEffect(() => {
    if (draft && !draft.isNew) {
      const draftStillExists = visibleEntries.some((item) => item.key === draft.originalKey);
      if (!draftStillExists) {
        setDraft(null);
        setDraftError("");
        setInteractionError("");
      }
    }
  }, [draft, visibleEntries]);

  useEffect(() => {
    if (!activeDraftId) {
      return;
    }
    keyInputRef.current?.focus();
  }, [activeDraftId]);

  function buildExistingDraft(item: EnvListItem): EnvDraft {
    return {
      id: item.id,
      originalKey: item.key,
      key: item.key,
      value: item.value,
      isNew: false,
    };
  }

  function buildNextValue(entries: Array<[string, string]>): Record<string, unknown> {
    return {
      ...preservedEntries,
      ...Object.fromEntries(entries),
    };
  }

  function formatValuePreview(key: string, entry: string): string {
    if (!entry) {
      return t("profileEditor.env.emptyValue");
    }
    if (shouldMaskSensitiveValues && looksSensitiveKey(key)) {
      return "••••••••";
    }
    return entry.length > 28 ? `${entry.slice(0, 28)}…` : entry;
  }

  function formatItemLabel(item: EnvListItem): string {
    return item.key || t("profileEditor.env.newItem");
  }

  function resetPanelState(nextDraft: EnvDraft | null) {
    setDraft(nextDraft);
    setDraftError("");
    setInteractionError("");
    setIsSensitiveValueVisible(false);
  }

  function blockIfDirty() {
    if (!draft || !hasUnsavedChanges) {
      return false;
    }
    setInteractionError(switchBlockedMessage);
    return true;
  }

  function handleSelectItem(item: EnvListItem) {
    if (draft?.id === item.id) {
      if (hasUnsavedChanges) {
        setInteractionError(switchBlockedMessage);
        return;
      }
      resetPanelState(null);
      return;
    }
    if (blockIfDirty()) {
      return;
    }
    resetPanelState(buildExistingDraft(item));
  }

  function handleAddVariable() {
    if (blockIfDirty()) {
      return;
    }
    resetPanelState({
      id: createRowId("env-draft"),
      originalKey: null,
      key: "",
      value: "",
      isNew: true,
    });
  }

  function validateDraft(currentDraft: EnvDraft): string {
    const normalizedKey = currentDraft.key.trim();
    if (!normalizedKey) {
      return t("profileEditor.env.errorKeyEmpty");
    }
    if (!currentDraft.value.trim()) {
      return t("profileEditor.env.errorValueEmpty");
    }
    const duplicate = Object.keys(fullValue).some(
      (key) => key !== currentDraft.originalKey && key === normalizedKey,
    );
    if (duplicate) {
      return t("profileEditor.env.errorKeyDuplicate");
    }
    return "";
  }

  function handleSaveDraft() {
    if (!draft) {
      return;
    }
    const error = validateDraft(draft);
    setDraftError(error);
    if (error) {
      return;
    }

    const normalizedKey = draft.key.trim();
    const nextEntries: Array<[string, string]> = draft.isNew
      ? [
          ...visibleEntries.map((item) => [item.key, item.value] as [string, string]),
          [normalizedKey, draft.value] as [string, string],
        ]
      : visibleEntries.map((item) =>
          item.key === draft.originalKey
            ? ([normalizedKey, draft.value] as [string, string])
            : ([item.key, item.value] as [string, string]),
        );

    onChange(buildNextValue(nextEntries));
    resetPanelState(null);
  }

  function handleCancelDraft() {
    if (!draft) {
      return;
    }
    resetPanelState(null);
  }

  function applyDeleteItem(item: EnvListItem) {
    const nextEntries = visibleEntries
      .filter((candidate) => candidate.id !== item.id)
      .map((candidate) => [candidate.key, candidate.value] as [string, string]);
    onChange(buildNextValue(nextEntries));
    if (draft?.id === item.id) {
      resetPanelState(null);
    }
  }

  function handleDeleteItem(item: EnvListItem) {
    if (draft?.id === item.id && draft.isNew) {
      resetPanelState(null);
      return;
    }
    if (blockIfDirty()) {
      return;
    }
    setPendingDeleteItem(item);
  }

  return (
    <div className="profile-subsection">
      {showTitle ? (
        <div className="profile-subsection-header">
          <div>
            <h4>{t("profileEditor.env.title")}</h4>
            <p>{emptyHint}</p>
          </div>
        </div>
      ) : null}

      <div className="profile-env-editor flex flex-col gap-4">
        <div className="profile-env-list-shell flex min-w-0 flex-col gap-3">
          <div className="profile-env-list flex flex-col overflow-hidden rounded-lg border border-[var(--border-default)] bg-[var(--bg-primary)]">
            <div className="profile-env-list-header grid grid-cols-[40px_minmax(0,1.2fr)_minmax(0,0.8fr)_auto] items-center gap-3 border-b border-[var(--border-default)] px-3.5 py-3 text-xs font-semibold text-[var(--text-secondary)] max-[720px]:hidden">
              <span className="profile-env-list-header-index inline-flex items-center justify-center text-[var(--text-muted)] tabular-nums">
                {t("profileEditor.common.index")}
              </span>
              <span>{t("profileEditor.env.columnKey")}</span>
              <span>{t("profileEditor.env.columnValue")}</span>
              <span>{t("profileEditor.common.actions")}</span>
            </div>

            {visibleItems.length > 0 ? (
              visibleItems.map((item, index) => {
                const label = formatItemLabel(item);
                const selected = draft?.id === item.id;
                const draftBadge = item.isDraft ? t("profileEditor.common.draft") : null;
                const dirtyBadge =
                  selected && hasUnsavedChanges && !draft?.isNew
                    ? t("profileEditor.env.unsaved")
                    : null;

                const rowClassName = [
                  "profile-env-list-row flex flex-col px-3.5 py-2.5 first:border-t-0 border-t border-[var(--border-default)]",
                  selected
                    ? "selected bg-[color-mix(in_srgb,var(--accent-blue-bg)_18%,var(--bg-primary)_82%)]"
                    : "",
                ]
                  .filter(Boolean)
                  .join(" ");

                return (
                  <div key={item.id} className={rowClassName}>
                    <div className="profile-env-row-head grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 max-[720px]:items-start">
                      <button
                        type="button"
                        className="profile-env-list-main grid min-h-[42px] w-full cursor-pointer grid-cols-[40px_minmax(0,1.2fr)_minmax(0,0.8fr)] items-center gap-3 rounded-md border-0 bg-transparent p-2 text-left text-[var(--text-primary)] outline-none transition-colors hover:text-[var(--accent-blue)] focus-visible:ring-2 focus-visible:ring-[var(--accent-blue)] max-[720px]:grid-cols-[32px_minmax(0,1fr)] max-[720px]:items-start max-[720px]:gap-x-2.5 max-[720px]:gap-y-1.5"
                        aria-pressed={selected}
                        aria-label={`${t("profileEditor.env.editAriaLabel")} ${label}`}
                        onClick={() => handleSelectItem(item)}
                      >
                        <span
                          className="profile-env-list-index inline-flex items-center justify-center text-xs font-semibold text-[var(--text-muted)] tabular-nums max-[720px]:row-span-2 max-[720px]:items-start max-[720px]:pt-0.5"
                          aria-hidden="true"
                        >
                          {index + 1}
                        </span>
                        <span className="profile-env-list-key inline-flex min-w-0 items-center gap-2 font-semibold max-[720px]:col-start-2">
                          <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap max-[720px]:whitespace-normal max-[720px]:break-words">
                            {label}
                          </span>
                          {draftBadge ? (
                            <span className="profile-env-row-badge">{draftBadge}</span>
                          ) : null}
                          {dirtyBadge ? (
                            <span className="profile-env-row-badge subtle">{dirtyBadge}</span>
                          ) : null}
                        </span>
                        <span className="profile-env-list-value min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-sm text-[var(--text-secondary)] max-[720px]:col-start-2 max-[720px]:line-clamp-2 max-[720px]:whitespace-normal max-[720px]:break-words">
                          {formatValuePreview(item.key, item.value)}
                        </span>
                      </button>

                      <div className="profile-row-actions profile-env-row-actions flex flex-nowrap justify-end">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          className="profile-icon-btn danger text-destructive hover:bg-destructive/10 hover:text-destructive"
                          aria-label={`${t("profileEditor.env.deleteAriaLabel")} ${label}`}
                          onClick={() => handleDeleteItem(item)}
                        >
                          <Trash2 className="size-4" aria-hidden="true" />
                        </Button>
                      </div>
                    </div>

                    {selected && draft ? (
                      <div className="profile-env-inline-editor mt-3 rounded-md border border-[var(--border-default)] bg-[var(--bg-elevated)] p-3">
                        <div className="profile-env-inline-fields grid gap-3">
                          <label className="form-group">
                            <span className="profile-inline-required-label profile-env-inline-label">
                              <span>{t("profileEditor.env.nameLabel")}</span>
                              <RequiredBadge />
                            </span>
                            <Input
                              ref={keyInputRef}
                              aria-label={t("profileEditor.env.nameLabel")}
                              value={draft.key}
                              placeholder={t("profileEditor.env.namePlaceholder")}
                              onChange={(event) => {
                                setDraft((current) =>
                                  current
                                    ? {
                                        ...current,
                                        key: event.target.value,
                                      }
                                    : current,
                                );
                                setDraftError("");
                                setInteractionError("");
                              }}
                            />
                          </label>

                          <label className="form-group">
                            <span className="profile-inline-required-label profile-env-inline-label">
                              <span>{t("profileEditor.env.valueLabel")}</span>
                              <RequiredBadge />
                            </span>
                            <div className="profile-env-inline-value-row flex items-center gap-2 max-[720px]:flex-col max-[720px]:items-stretch">
                              <Input
                                className="min-w-0 flex-1"
                                aria-label={t("profileEditor.env.valueLabel")}
                                type={
                                  shouldMaskSensitiveValues &&
                                  looksSensitiveKey(draft.key) &&
                                  !isSensitiveValueVisible
                                    ? "password"
                                    : "text"
                                }
                                value={draft.value}
                                placeholder={t("profileEditor.env.valuePlaceholder")}
                                onChange={(event) => {
                                  setDraft((current) =>
                                    current
                                      ? {
                                          ...current,
                                          value: event.target.value,
                                        }
                                      : current,
                                  );
                                  setDraftError("");
                                  setInteractionError("");
                                }}
                              />
                              {shouldMaskSensitiveValues && looksSensitiveKey(draft.key) ? (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="profile-secondary-btn profile-env-visibility-btn whitespace-nowrap"
                                  onClick={() => setIsSensitiveValueVisible((current) => !current)}
                                >
                                  {isSensitiveValueVisible ? (
                                    <EyeOff className="size-4" aria-hidden="true" />
                                  ) : (
                                    <Eye className="size-4" aria-hidden="true" />
                                  )}
                                  {isSensitiveValueVisible
                                    ? t("profileEditor.env.hideValue")
                                    : t("profileEditor.env.showValue")}
                                </Button>
                              ) : null}
                            </div>
                          </label>
                        </div>

                        <div className="profile-env-inline-actions mt-3 flex justify-end gap-2">
                          <Button
                            type="button"
                            className="profile-primary-btn"
                            aria-label={t("profileEditor.env.saveAriaLabel")}
                            onClick={handleSaveDraft}
                          >
                            {t("profileEditor.common.save")}
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            className="profile-secondary-btn"
                            aria-label={t("profileEditor.env.cancelEditAriaLabel")}
                            onClick={handleCancelDraft}
                          >
                            {t("profileEditor.common.cancel")}
                          </Button>
                        </div>

                        {interactionError ? (
                          <p className="field-error">{interactionError}</p>
                        ) : null}
                        {draftError ? <p className="field-error">{draftError}</p> : null}
                      </div>
                    ) : null}
                  </div>
                );
              })
            ) : (
              <div className="profile-empty-state profile-env-empty-list flex min-h-[120px] items-center justify-center px-4 text-center">
                {emptyHint}
              </div>
            )}
          </div>

          <div className="profile-env-footer flex justify-end">
            <Button
              type="button"
              variant="outline"
              className="profile-secondary-btn"
              onClick={handleAddVariable}
            >
              <Plus className="size-4" aria-hidden="true" />
              {t("profileEditor.env.addItem")}
            </Button>
          </div>
        </div>
      </div>

      {pendingDeleteItem ? (
        <ConfirmAlertDialog
          title={deleteDialogTitle}
          message={`${t("profileEditor.env.deleteDialogMessagePrefix")}${pendingDeleteItem.key}${t("profileEditor.env.deleteDialogMessageSuffix")}`}
          confirmText={deleteDialogConfirmText}
          cancelText={deleteDialogCancelText}
          danger
          onConfirm={() => {
            applyDeleteItem(pendingDeleteItem);
            setPendingDeleteItem(null);
          }}
          onCancel={() => setPendingDeleteItem(null)}
        />
      ) : null}
    </div>
  );
}

export default EnvEditor;
