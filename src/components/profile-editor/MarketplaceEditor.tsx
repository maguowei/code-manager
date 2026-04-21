import { useEffect, useMemo, useRef, useState } from "react";
import { type TranslationKey, useI18n } from "../../i18n";
import ConfirmDialog from "../ConfirmDialog";
import {
  createRowId,
  type MarketplaceDraft,
  type MarketplaceSourceType,
  readObject,
} from "./editor-utils";
import RequiredBadge from "./RequiredBadge";
import "./MarketplaceEditor.css";

interface MarketplaceEditorProps {
  value: unknown;
  onChange: (next: Record<string, unknown>) => void;
  onError: (message: string) => void;
  showTitle?: boolean;
}

interface MarketplaceEditorDraft extends MarketplaceDraft {
  originalMarketplaceId: string | null;
  isNew: boolean;
}

interface MarketplaceListItem {
  id: string;
  marketplaceId: string;
  sourceType: MarketplaceSourceType;
  primarySummary: string;
  secondarySummary: string[];
  isDraft?: boolean;
}

function buildMarketplaceDrafts(value: unknown): MarketplaceDraft[] {
  const marketplaceObject = readObject(value);
  return Object.entries(marketplaceObject).flatMap(([marketplaceId, entry]) => {
    const marketplace = readObject(entry);
    const source = readObject(marketplace.source);
    const sourceType =
      typeof source.source === "string" ? (source.source as MarketplaceSourceType) : "github";
    return [
      {
        id: `marketplace:${marketplaceId}`,
        marketplaceId,
        sourceType,
        url: typeof source.url === "string" ? source.url : "",
        hostPattern: typeof source.hostPattern === "string" ? source.hostPattern : "",
        repo: typeof source.repo === "string" ? source.repo : "",
        ref: typeof source.ref === "string" ? source.ref : "",
        path: typeof source.path === "string" ? source.path : "",
        packageName: typeof source.package === "string" ? source.package : "",
        installLocation:
          typeof marketplace.installLocation === "string" ? marketplace.installLocation : "",
      },
    ];
  });
}

function buildMarketplaceSummary(
  marketplace: Pick<
    MarketplaceDraft,
    | "sourceType"
    | "url"
    | "hostPattern"
    | "repo"
    | "ref"
    | "path"
    | "packageName"
    | "installLocation"
  >,
  t: (key: TranslationKey) => string,
): { primarySummary: string; secondarySummary: string[] } {
  const primarySummary =
    marketplace.sourceType === "github"
      ? marketplace.repo.trim() || t("profileEditor.marketplace.repoNotSet")
      : marketplace.sourceType === "git" || marketplace.sourceType === "url"
        ? marketplace.url.trim() || t("profileEditor.marketplace.urlNotSet")
        : marketplace.sourceType === "npm"
          ? marketplace.packageName.trim() || t("profileEditor.marketplace.packageNotSet")
          : marketplace.sourceType === "hostPattern"
            ? marketplace.hostPattern.trim() || t("profileEditor.marketplace.hostPatternNotSet")
            : marketplace.path.trim() || t("profileEditor.marketplace.pathNotSet");

  const secondarySummary: string[] = [];
  if (
    (marketplace.sourceType === "github" || marketplace.sourceType === "git") &&
    marketplace.ref.trim()
  ) {
    secondarySummary.push(`${t("profileEditor.marketplace.refPrefix")}: ${marketplace.ref.trim()}`);
  }
  if (
    (marketplace.sourceType === "github" || marketplace.sourceType === "git") &&
    marketplace.path.trim()
  ) {
    secondarySummary.push(
      `${t("profileEditor.marketplace.pathPrefix")}: ${marketplace.path.trim()}`,
    );
  }
  if (marketplace.installLocation.trim()) {
    secondarySummary.push(
      `${t("profileEditor.marketplace.installPrefix")}: ${marketplace.installLocation.trim()}`,
    );
  }

  return { primarySummary, secondarySummary };
}

function buildExistingDraft(marketplace: MarketplaceDraft): MarketplaceEditorDraft {
  return {
    ...marketplace,
    originalMarketplaceId: marketplace.marketplaceId,
    isNew: false,
  };
}

function buildNewDraft(): MarketplaceEditorDraft {
  return {
    id: createRowId("marketplace-draft"),
    marketplaceId: "",
    sourceType: "github",
    url: "",
    hostPattern: "",
    repo: "",
    ref: "",
    path: "",
    packageName: "",
    installLocation: "",
    originalMarketplaceId: null,
    isNew: true,
  };
}

function normalizeMarketplaceDraft(draft: MarketplaceEditorDraft): MarketplaceDraft {
  const marketplaceId = draft.marketplaceId.trim();
  return {
    id: `marketplace:${marketplaceId}`,
    marketplaceId,
    sourceType: draft.sourceType,
    url: draft.url.trim(),
    hostPattern: draft.hostPattern.trim(),
    repo: draft.repo.trim(),
    ref: draft.ref.trim(),
    path: draft.path.trim(),
    packageName: draft.packageName.trim(),
    installLocation: draft.installLocation.trim(),
  };
}

function buildMarketplaceRecord(marketplaces: MarketplaceDraft[]): Record<string, unknown> {
  return marketplaces.reduce<Record<string, unknown>>((accumulator, marketplace) => {
    const source: Record<string, unknown> = {
      source: marketplace.sourceType,
    };

    switch (marketplace.sourceType) {
      case "url":
        source.url = marketplace.url;
        break;
      case "hostPattern":
        source.hostPattern = marketplace.hostPattern;
        break;
      case "github":
        source.repo = marketplace.repo;
        if (marketplace.ref) {
          source.ref = marketplace.ref;
        }
        if (marketplace.path) {
          source.path = marketplace.path;
        }
        break;
      case "git":
        source.url = marketplace.url;
        if (marketplace.ref) {
          source.ref = marketplace.ref;
        }
        if (marketplace.path) {
          source.path = marketplace.path;
        }
        break;
      case "npm":
        source.package = marketplace.packageName;
        break;
      case "file":
      case "directory":
        source.path = marketplace.path;
        break;
    }

    accumulator[marketplace.marketplaceId] = {
      source,
      ...(marketplace.installLocation
        ? {
            installLocation: marketplace.installLocation,
          }
        : {}),
    };
    return accumulator;
  }, {});
}

function MarketplaceEditor({ value, onChange, onError, showTitle = true }: MarketplaceEditorProps) {
  const { t } = useI18n();
  const initialMarketplaces = useMemo(() => buildMarketplaceDrafts(value), [value]);
  const [marketplaces, setMarketplaces] = useState(initialMarketplaces);
  const [draft, setDraft] = useState<MarketplaceEditorDraft | null>(null);
  const [draftError, setDraftError] = useState("");
  const [interactionError, setInteractionError] = useState("");
  const [pendingDeleteMarketplace, setPendingDeleteMarketplace] = useState<MarketplaceDraft | null>(
    null,
  );
  const idInputRef = useRef<HTMLInputElement | null>(null);

  const pendingMessage = t("profileEditor.marketplace.pendingMessage");
  const switchBlockedMessage = t("profileEditor.marketplace.switchBlockedMessage");
  const emptyHint = t("profileEditor.marketplace.emptyHint");
  const deleteDialogTitle = t("profileEditor.marketplace.deleteDialogTitle");
  const deleteDialogConfirmText = t("profileEditor.common.delete");
  const deleteDialogCancelText = t("profileEditor.common.cancel");

  const selectedMarketplace = useMemo(() => {
    if (!draft || draft.isNew) {
      return null;
    }
    return (
      marketplaces.find(
        (marketplace) => marketplace.marketplaceId === draft.originalMarketplaceId,
      ) ?? null
    );
  }, [draft, marketplaces]);

  const hasUnsavedChanges = useMemo(() => {
    if (!draft) {
      return false;
    }
    if (draft.isNew) {
      return true;
    }
    if (!selectedMarketplace) {
      return false;
    }
    const normalizedDraft = normalizeMarketplaceDraft(draft);
    return JSON.stringify(normalizedDraft) !== JSON.stringify(selectedMarketplace);
  }, [draft, selectedMarketplace]);

  const visibleMarketplaces = useMemo(() => {
    if (!draft?.isNew) {
      return marketplaces;
    }
    return [
      ...marketplaces,
      {
        ...normalizeMarketplaceDraft(draft),
        id: draft.id,
      },
    ];
  }, [draft, marketplaces]);

  const listItems = useMemo<MarketplaceListItem[]>(() => {
    return visibleMarketplaces.map((marketplace) => {
      const summary = buildMarketplaceSummary(marketplace, t);
      return {
        id: marketplace.id,
        marketplaceId: marketplace.marketplaceId,
        sourceType: marketplace.sourceType,
        primarySummary: summary.primarySummary,
        secondarySummary: summary.secondarySummary,
        isDraft: draft?.isNew && draft.id === marketplace.id,
      };
    });
  }, [draft, t, visibleMarketplaces]);

  const currentError = useMemo(() => {
    if (draftError) {
      return draftError;
    }
    if (interactionError) {
      return interactionError;
    }
    if (draft && hasUnsavedChanges) {
      return pendingMessage;
    }
    return "";
  }, [draft, draftError, hasUnsavedChanges, interactionError, pendingMessage]);

  useEffect(() => {
    onError(currentError);
  }, [currentError, onError]);

  useEffect(() => {
    setMarketplaces(initialMarketplaces);
  }, [initialMarketplaces]);

  useEffect(() => {
    if (!draft || draft.isNew) {
      return;
    }
    const nextMarketplace = initialMarketplaces.find(
      (marketplace) => marketplace.marketplaceId === draft.originalMarketplaceId,
    );
    if (!nextMarketplace) {
      setDraft(null);
      setDraftError("");
      setInteractionError("");
      return;
    }
    if (hasUnsavedChanges) {
      return;
    }
    const nextDraft = buildExistingDraft(nextMarketplace);
    if (JSON.stringify(nextDraft) === JSON.stringify(draft)) {
      return;
    }
    setDraft(nextDraft);
  }, [draft, hasUnsavedChanges, initialMarketplaces]);

  useEffect(() => {
    if (!draft) {
      return;
    }
    idInputRef.current?.focus();
  }, [draft]);

  function resetEditor(nextDraft: MarketplaceEditorDraft | null) {
    setDraft(nextDraft);
    setDraftError("");
    setInteractionError("");
  }

  function blockIfDirty() {
    if (!draft || !hasUnsavedChanges) {
      return false;
    }
    setInteractionError(switchBlockedMessage);
    return true;
  }

  function handleSelectMarketplace(marketplace: MarketplaceDraft) {
    if (draft?.id === marketplace.id) {
      if (hasUnsavedChanges) {
        setInteractionError(switchBlockedMessage);
        return;
      }
      resetEditor(null);
      return;
    }
    if (blockIfDirty()) {
      return;
    }
    resetEditor(buildExistingDraft(marketplace));
  }

  function handleAddMarketplace() {
    if (blockIfDirty()) {
      return;
    }
    resetEditor(buildNewDraft());
  }

  function handleDraftChange<K extends keyof MarketplaceEditorDraft>(
    key: K,
    nextValue: MarketplaceEditorDraft[K],
  ) {
    setDraft((current) =>
      current
        ? {
            ...current,
            [key]: nextValue,
          }
        : current,
    );
    setDraftError("");
    setInteractionError("");
  }

  function validateDraft(currentDraft: MarketplaceEditorDraft): string {
    const normalizedId = currentDraft.marketplaceId.trim();
    if (!normalizedId) {
      return t("profileEditor.marketplace.errorIdEmpty");
    }
    const duplicated = marketplaces.some(
      (marketplace) =>
        marketplace.marketplaceId === normalizedId &&
        marketplace.marketplaceId !== currentDraft.originalMarketplaceId,
    );
    if (duplicated) {
      return t("profileEditor.marketplace.errorIdDuplicate");
    }

    const requiredValue =
      currentDraft.sourceType === "url"
        ? currentDraft.url.trim()
        : currentDraft.sourceType === "hostPattern"
          ? currentDraft.hostPattern.trim()
          : currentDraft.sourceType === "github"
            ? currentDraft.repo.trim()
            : currentDraft.sourceType === "git"
              ? currentDraft.url.trim()
              : currentDraft.sourceType === "npm"
                ? currentDraft.packageName.trim()
                : currentDraft.path.trim();

    if (!requiredValue) {
      return t("profileEditor.marketplace.errorIncomplete");
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

    const normalizedDraft = normalizeMarketplaceDraft(draft);
    const nextMarketplaces = draft.isNew
      ? [...marketplaces, normalizedDraft]
      : marketplaces.map((marketplace) =>
          marketplace.marketplaceId === draft.originalMarketplaceId ? normalizedDraft : marketplace,
        );

    setMarketplaces(nextMarketplaces);
    onChange(buildMarketplaceRecord(nextMarketplaces));
    resetEditor(null);
  }

  function handleCancelDraft() {
    if (!draft) {
      return;
    }
    resetEditor(null);
  }

  function applyDeleteMarketplace(marketplace: MarketplaceDraft) {
    const nextMarketplaces = marketplaces.filter(
      (candidate) => candidate.marketplaceId !== marketplace.marketplaceId,
    );
    setMarketplaces(nextMarketplaces);
    onChange(buildMarketplaceRecord(nextMarketplaces));
    if (draft?.id === marketplace.id) {
      resetEditor(null);
    }
  }

  function handleDeleteMarketplace(marketplace: MarketplaceDraft) {
    if (draft?.id === marketplace.id && draft.isNew) {
      resetEditor(null);
      return;
    }
    if (blockIfDirty()) {
      return;
    }
    setPendingDeleteMarketplace(marketplace);
  }

  return (
    <div className="profile-subsection">
      {showTitle ? (
        <div className="profile-subsection-header">
          <div>
            <h4>{t("profileEditor.marketplace.title")}</h4>
          </div>
        </div>
      ) : null}

      <div className="profile-marketplace-editor">
        <div className="profile-marketplace-list-shell">
          <div className="profile-marketplace-list">
            <div className="profile-marketplace-list-header">
              <span className="profile-marketplace-list-header-index">
                {t("profileEditor.common.index")}
              </span>
              <span>{t("profileEditor.marketplace.columnMarketplace")}</span>
              <span>{t("profileEditor.marketplace.columnSummary")}</span>
              <span>{t("profileEditor.common.actions")}</span>
            </div>

            {listItems.length > 0 ? (
              listItems.map((item, index) => {
                const selected = draft?.id === item.id;
                const draftBadge = item.isDraft ? t("profileEditor.common.draft") : null;
                const dirtyBadge =
                  selected && hasUnsavedChanges && !draft?.isNew
                    ? t("profileEditor.marketplace.unsaved")
                    : null;
                const label = item.marketplaceId || t("profileEditor.marketplace.newItem");
                const marketplace = visibleMarketplaces.find(
                  (candidate) => candidate.id === item.id,
                );
                if (!marketplace) {
                  return null;
                }

                return (
                  <div
                    key={item.id}
                    className={`profile-marketplace-list-row${selected ? " selected" : ""}`}
                  >
                    <div className="profile-marketplace-row-head">
                      <button
                        type="button"
                        className="profile-marketplace-list-main"
                        aria-pressed={selected}
                        aria-label={`${t("profileEditor.marketplace.editAriaLabel")} ${label}`}
                        onClick={() => handleSelectMarketplace(marketplace)}
                      >
                        <span className="profile-marketplace-list-index" aria-hidden="true">
                          {index + 1}
                        </span>
                        <span className="profile-marketplace-list-title">
                          <span>{label}</span>
                          <span className="profile-env-row-badge subtle">{item.sourceType}</span>
                          {draftBadge ? (
                            <span className="profile-env-row-badge">{draftBadge}</span>
                          ) : null}
                          {dirtyBadge ? (
                            <span className="profile-env-row-badge subtle">{dirtyBadge}</span>
                          ) : null}
                        </span>
                        <span className="profile-marketplace-list-summary">
                          <span className="profile-marketplace-summary-primary">
                            {item.primarySummary}
                          </span>
                          {item.secondarySummary.length > 0 ? (
                            <span className="profile-marketplace-summary-secondary">
                              {item.secondarySummary.join(" · ")}
                            </span>
                          ) : null}
                        </span>
                      </button>

                      <div className="profile-row-actions profile-marketplace-row-actions">
                        <button
                          type="button"
                          className="profile-icon-btn danger"
                          aria-label={`${t("profileEditor.marketplace.deleteAriaLabel")} ${label}`}
                          onClick={() => handleDeleteMarketplace(marketplace)}
                        >
                          ×
                        </button>
                      </div>
                    </div>

                    {selected && draft ? (
                      <div className="profile-marketplace-inline-editor">
                        <div className="profile-marketplace-inline-fields">
                          <div className="form-row">
                            <label className="form-group">
                              <span className="profile-inline-required-label profile-env-inline-label">
                                <span>{t("profileEditor.marketplace.idLabel")}</span>
                                <RequiredBadge />
                              </span>
                              <input
                                ref={idInputRef}
                                aria-label={t("profileEditor.marketplace.idLabel")}
                                value={draft.marketplaceId}
                                placeholder="team-market"
                                onChange={(event) =>
                                  handleDraftChange("marketplaceId", event.target.value)
                                }
                              />
                            </label>

                            <label className="form-group">
                              <span className="profile-env-inline-label">
                                {t("profileEditor.marketplace.sourceLabel")}
                              </span>
                              <select
                                aria-label={t("profileEditor.marketplace.sourceLabel")}
                                className="form-select"
                                value={draft.sourceType}
                                onChange={(event) =>
                                  handleDraftChange(
                                    "sourceType",
                                    event.target.value as MarketplaceSourceType,
                                  )
                                }
                              >
                                <option value="github">github</option>
                                <option value="git">git</option>
                                <option value="url">url</option>
                                <option value="hostPattern">hostPattern</option>
                                <option value="npm">npm</option>
                                <option value="file">file</option>
                                <option value="directory">directory</option>
                              </select>
                            </label>
                          </div>

                          <div className="form-row">
                            {draft.sourceType === "github" ? (
                              <>
                                <label className="form-group">
                                  <span className="profile-inline-required-label profile-env-inline-label">
                                    <span>{t("profileEditor.marketplace.repoLabel")}</span>
                                    <RequiredBadge />
                                  </span>
                                  <input
                                    aria-label={t("profileEditor.marketplace.repoLabel")}
                                    value={draft.repo}
                                    placeholder="team/plugins"
                                    onChange={(event) =>
                                      handleDraftChange("repo", event.target.value)
                                    }
                                  />
                                </label>

                                <label className="form-group">
                                  <span className="profile-env-inline-label">
                                    {t("profileEditor.marketplace.refLabel")}
                                  </span>
                                  <input
                                    aria-label={t("profileEditor.marketplace.refLabel")}
                                    value={draft.ref}
                                    placeholder="main"
                                    onChange={(event) =>
                                      handleDraftChange("ref", event.target.value)
                                    }
                                  />
                                </label>

                                <label className="form-group">
                                  <span className="profile-env-inline-label">
                                    {t("profileEditor.marketplace.repoPathLabel")}
                                  </span>
                                  <input
                                    aria-label={t("profileEditor.marketplace.repoPathLabel")}
                                    value={draft.path}
                                    placeholder=".claude-plugin/marketplace.json"
                                    onChange={(event) =>
                                      handleDraftChange("path", event.target.value)
                                    }
                                  />
                                </label>
                              </>
                            ) : null}

                            {draft.sourceType === "git" || draft.sourceType === "url" ? (
                              <label className="form-group">
                                <span className="profile-inline-required-label profile-env-inline-label">
                                  <span>{t("profileEditor.marketplace.urlLabel")}</span>
                                  <RequiredBadge />
                                </span>
                                <input
                                  aria-label={t("profileEditor.marketplace.urlLabel")}
                                  value={draft.url}
                                  placeholder={
                                    draft.sourceType === "git"
                                      ? "https://example.com/repo.git"
                                      : "https://example.com/marketplace.json"
                                  }
                                  onChange={(event) => handleDraftChange("url", event.target.value)}
                                />
                              </label>
                            ) : null}

                            {draft.sourceType === "hostPattern" ? (
                              <label className="form-group">
                                <span className="profile-inline-required-label profile-env-inline-label">
                                  <span>{t("profileEditor.marketplace.hostPatternLabel")}</span>
                                  <RequiredBadge />
                                </span>
                                <input
                                  aria-label={t("profileEditor.marketplace.hostPatternLabel")}
                                  value={draft.hostPattern}
                                  placeholder="github.com/*"
                                  onChange={(event) =>
                                    handleDraftChange("hostPattern", event.target.value)
                                  }
                                />
                              </label>
                            ) : null}

                            {draft.sourceType === "npm" ? (
                              <label className="form-group">
                                <span className="profile-inline-required-label profile-env-inline-label">
                                  <span>{t("profileEditor.marketplace.packageLabel")}</span>
                                  <RequiredBadge />
                                </span>
                                <input
                                  aria-label={t("profileEditor.marketplace.packageLabel")}
                                  value={draft.packageName}
                                  placeholder="@team/claude-marketplace"
                                  onChange={(event) =>
                                    handleDraftChange("packageName", event.target.value)
                                  }
                                />
                              </label>
                            ) : null}

                            {draft.sourceType === "file" || draft.sourceType === "directory" ? (
                              <label className="form-group">
                                <span className="profile-inline-required-label profile-env-inline-label">
                                  <span>{t("profileEditor.marketplace.localPathLabel")}</span>
                                  <RequiredBadge />
                                </span>
                                <input
                                  aria-label={t("profileEditor.marketplace.localPathLabel")}
                                  value={draft.path}
                                  placeholder="/path/to/marketplace"
                                  onChange={(event) =>
                                    handleDraftChange("path", event.target.value)
                                  }
                                />
                              </label>
                            ) : null}

                            <label className="form-group">
                              <span className="profile-env-inline-label">
                                {t("profileEditor.marketplace.installLocationLabel")}
                              </span>
                              <input
                                aria-label={t("profileEditor.marketplace.installLocationLabel")}
                                value={draft.installLocation}
                                placeholder="/tmp/team-market"
                                onChange={(event) =>
                                  handleDraftChange("installLocation", event.target.value)
                                }
                              />
                            </label>
                          </div>
                        </div>

                        <div className="profile-env-inline-actions">
                          <button
                            type="button"
                            className="profile-primary-btn"
                            aria-label={t("profileEditor.marketplace.saveAriaLabel")}
                            onClick={handleSaveDraft}
                          >
                            {t("profileEditor.marketplace.save")}
                          </button>
                          <button
                            type="button"
                            className="profile-secondary-btn"
                            aria-label={t("profileEditor.marketplace.cancelEditAriaLabel")}
                            onClick={handleCancelDraft}
                          >
                            {t("profileEditor.common.cancel")}
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
              <div className="profile-empty-state profile-marketplace-empty-list">{emptyHint}</div>
            )}
          </div>

          <div className="profile-env-footer">
            <button type="button" className="profile-secondary-btn" onClick={handleAddMarketplace}>
              {t("profileEditor.marketplace.addItem")}
            </button>
          </div>
        </div>
      </div>

      {pendingDeleteMarketplace ? (
        <ConfirmDialog
          title={deleteDialogTitle}
          message={t("profileEditor.marketplace.deleteDialogMessage").replace(
            "{id}",
            pendingDeleteMarketplace.marketplaceId,
          )}
          confirmText={deleteDialogConfirmText}
          cancelText={deleteDialogCancelText}
          danger
          onConfirm={() => {
            applyDeleteMarketplace(pendingDeleteMarketplace);
            setPendingDeleteMarketplace(null);
          }}
          onCancel={() => setPendingDeleteMarketplace(null)}
        />
      ) : null}
    </div>
  );
}

export default MarketplaceEditor;
