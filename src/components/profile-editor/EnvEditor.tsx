import { useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "../../i18n";
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
  const { language } = useI18n();
  const isZh = language === "zh";
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

  const sectionPendingMessage = isZh
    ? "当前环境变量编辑未保存，请先保存或取消。"
    : "Please save or cancel the current environment variable edit first.";
  const switchBlockedMessage = isZh
    ? "请先保存或取消当前环境变量编辑。"
    : "Please save or cancel the current environment variable edit.";
  const emptyHint = isZh
    ? "把没有官方 settings 键的能力放进 env，例如 API Key 或其它工具变量。"
    : "Use env for values without official settings keys, such as API keys or tool variables.";

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
      return isZh ? "未填写" : "Empty";
    }
    if (shouldMaskSensitiveValues && looksSensitiveKey(key)) {
      return "••••••••";
    }
    return entry.length > 28 ? `${entry.slice(0, 28)}…` : entry;
  }

  function formatItemLabel(item: EnvListItem): string {
    return item.key || (isZh ? "新环境变量" : "New Environment Variable");
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
      return isZh ? "环境变量 Key 不能为空" : "Environment variable key cannot be empty";
    }
    if (!currentDraft.value.trim()) {
      return isZh ? "环境变量 Value 不能为空" : "Environment variable value cannot be empty";
    }
    const duplicate = Object.keys(fullValue).some(
      (key) => key !== currentDraft.originalKey && key === normalizedKey,
    );
    if (duplicate) {
      return isZh ? "环境变量 Key 不能重复" : "Environment variable keys must be unique";
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

  function handleDeleteItem(item: EnvListItem) {
    if (blockIfDirty()) {
      return;
    }
    const nextEntries = visibleEntries
      .filter((candidate) => candidate.id !== item.id)
      .map((candidate) => [candidate.key, candidate.value] as [string, string]);
    onChange(buildNextValue(nextEntries));
    if (draft?.id === item.id) {
      resetPanelState(null);
    }
  }

  return (
    <div className="profile-subsection">
      {showTitle ? (
        <div className="profile-subsection-header">
          <div>
            <h4>{isZh ? "环境变量" : "Environment Variables"}</h4>
            <p>{emptyHint}</p>
          </div>
        </div>
      ) : null}

      <div className="profile-env-editor">
        <div className="profile-env-list-shell">
          <div className="profile-env-list">
            <div className="profile-env-list-header">
              <span className="profile-env-list-header-index">{isZh ? "序号" : "Index"}</span>
              <span>{isZh ? "变量名" : "Key"}</span>
              <span>{isZh ? "变量值" : "Value"}</span>
              <span>{isZh ? "操作" : "Actions"}</span>
            </div>

            {visibleItems.length > 0 ? (
              visibleItems.map((item, index) => {
                const label = formatItemLabel(item);
                const selected = draft?.id === item.id;
                const draftBadge = item.isDraft ? (isZh ? "草稿" : "Draft") : null;
                const dirtyBadge =
                  selected && hasUnsavedChanges && !draft?.isNew
                    ? isZh
                      ? "未保存"
                      : "Unsaved"
                    : null;

                return (
                  <div
                    key={item.id}
                    className={`profile-env-list-row${selected ? " selected" : ""}`}
                  >
                    <button
                      type="button"
                      className="profile-env-list-main"
                      aria-pressed={selected}
                      aria-label={`${isZh ? "编辑环境变量" : "Edit environment variable"} ${label}`}
                      onClick={() => handleSelectItem(item)}
                    >
                      <span className="profile-env-list-index" aria-hidden="true">
                        {index + 1}
                      </span>
                      <span className="profile-env-list-key">
                        <span>{label}</span>
                        {draftBadge ? (
                          <span className="profile-env-row-badge">{draftBadge}</span>
                        ) : null}
                        {dirtyBadge ? (
                          <span className="profile-env-row-badge subtle">{dirtyBadge}</span>
                        ) : null}
                      </span>
                      <span className="profile-env-list-value">
                        {formatValuePreview(item.key, item.value)}
                      </span>
                    </button>

                    <div className="profile-row-actions profile-env-row-actions">
                      <button
                        type="button"
                        className="profile-icon-btn danger"
                        aria-label={`${isZh ? "删除环境变量" : "Delete environment variable"} ${label}`}
                        onClick={() => handleDeleteItem(item)}
                      >
                        ×
                      </button>
                    </div>

                    {selected && draft ? (
                      <div className="profile-env-inline-editor">
                        <div className="profile-env-inline-fields">
                          <label className="form-group">
                            <span className="profile-inline-required-label profile-env-inline-label">
                              <span>{isZh ? "环境变量名称" : "Environment Variable Name"}</span>
                              <RequiredBadge />
                            </span>
                            <input
                              ref={keyInputRef}
                              aria-label={isZh ? "环境变量名称" : "Environment Variable Name"}
                              value={draft.key}
                              placeholder={isZh ? "例如：OPENAI_API_KEY" : "e.g. OPENAI_API_KEY"}
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
                              <span>{isZh ? "环境变量值" : "Environment Variable Value"}</span>
                              <RequiredBadge />
                            </span>
                            <div className="profile-env-inline-value-row">
                              <input
                                aria-label={isZh ? "环境变量值" : "Environment Variable Value"}
                                type={
                                  shouldMaskSensitiveValues &&
                                  looksSensitiveKey(draft.key) &&
                                  !isSensitiveValueVisible
                                    ? "password"
                                    : "text"
                                }
                                value={draft.value}
                                placeholder={isZh ? "填写变量值" : "Enter value"}
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
                                <button
                                  type="button"
                                  className="profile-secondary-btn profile-env-visibility-btn"
                                  onClick={() => setIsSensitiveValueVisible((current) => !current)}
                                >
                                  {isSensitiveValueVisible
                                    ? isZh
                                      ? "隐藏变量值"
                                      : "Hide value"
                                    : isZh
                                      ? "显示变量值"
                                      : "Show value"}
                                </button>
                              ) : null}
                            </div>
                          </label>
                        </div>

                        <div className="profile-env-inline-actions">
                          <button
                            type="button"
                            className="profile-primary-btn"
                            aria-label={isZh ? "保存环境变量" : "Save environment variable"}
                            onClick={handleSaveDraft}
                          >
                            {isZh ? "保存" : "Save"}
                          </button>
                          <button
                            type="button"
                            className="profile-secondary-btn"
                            aria-label={
                              isZh ? "取消编辑环境变量" : "Cancel environment variable editing"
                            }
                            onClick={handleCancelDraft}
                          >
                            {isZh ? "取消" : "Cancel"}
                          </button>
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
              <div className="profile-empty-state profile-env-empty-list">{emptyHint}</div>
            )}
          </div>

          <div className="profile-env-footer">
            <button type="button" className="profile-secondary-btn" onClick={handleAddVariable}>
              {isZh ? "新增环境变量" : "Add environment variable"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default EnvEditor;
