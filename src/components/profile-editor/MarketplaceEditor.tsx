import { useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "../../i18n";
import {
  createRowId,
  type MarketplaceDraft,
  type MarketplaceSourceType,
  readObject,
} from "./editor-utils";
import RequiredBadge from "./RequiredBadge";

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
  isZh: boolean,
): { primarySummary: string; secondarySummary: string[] } {
  const primarySummary =
    marketplace.sourceType === "github"
      ? marketplace.repo.trim() || (isZh ? "未填写仓库" : "Repo not set")
      : marketplace.sourceType === "git" || marketplace.sourceType === "url"
        ? marketplace.url.trim() || (isZh ? "未填写 URL" : "URL not set")
        : marketplace.sourceType === "npm"
          ? marketplace.packageName.trim() || (isZh ? "未填写包名" : "Package not set")
          : marketplace.sourceType === "hostPattern"
            ? marketplace.hostPattern.trim() ||
              (isZh ? "未填写 Host Pattern" : "Host pattern not set")
            : marketplace.path.trim() || (isZh ? "未填写路径" : "Path not set");

  const secondarySummary: string[] = [];
  if (
    (marketplace.sourceType === "github" || marketplace.sourceType === "git") &&
    marketplace.ref.trim()
  ) {
    secondarySummary.push(`${isZh ? "Ref" : "Ref"}: ${marketplace.ref.trim()}`);
  }
  if (
    (marketplace.sourceType === "github" || marketplace.sourceType === "git") &&
    marketplace.path.trim()
  ) {
    secondarySummary.push(`${isZh ? "路径" : "Path"}: ${marketplace.path.trim()}`);
  }
  if (marketplace.installLocation.trim()) {
    secondarySummary.push(
      `${isZh ? "安装位置" : "Install"}: ${marketplace.installLocation.trim()}`,
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
  const { language } = useI18n();
  const isZh = language === "zh";
  const initialMarketplaces = useMemo(() => buildMarketplaceDrafts(value), [value]);
  const [marketplaces, setMarketplaces] = useState(initialMarketplaces);
  const [draft, setDraft] = useState<MarketplaceEditorDraft | null>(null);
  const [draftError, setDraftError] = useState("");
  const [interactionError, setInteractionError] = useState("");
  const idInputRef = useRef<HTMLInputElement | null>(null);

  const pendingMessage = isZh
    ? "当前 Marketplace 编辑未保存，请先保存或取消。"
    : "Please save or cancel the current marketplace edit first.";
  const switchBlockedMessage = isZh
    ? "请先保存或取消当前 Marketplace 编辑。"
    : "Please save or cancel the current marketplace edit first.";
  const emptyHint = isZh
    ? "暂无额外 Marketplace，可按需添加。"
    : "No extra marketplaces yet. Add one when needed.";

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
      const summary = buildMarketplaceSummary(marketplace, isZh);
      return {
        id: marketplace.id,
        marketplaceId: marketplace.marketplaceId,
        sourceType: marketplace.sourceType,
        primarySummary: summary.primarySummary,
        secondarySummary: summary.secondarySummary,
        isDraft: draft?.isNew && draft.id === marketplace.id,
      };
    });
  }, [draft, isZh, visibleMarketplaces]);

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
      return isZh ? "Marketplace ID 不能为空" : "Marketplace ID cannot be empty";
    }
    const duplicated = marketplaces.some(
      (marketplace) =>
        marketplace.marketplaceId === normalizedId &&
        marketplace.marketplaceId !== currentDraft.originalMarketplaceId,
    );
    if (duplicated) {
      return isZh ? "Marketplace ID 不能重复" : "Marketplace IDs must be unique";
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
      return isZh ? "Marketplace 配置不完整" : "Marketplace configuration is incomplete";
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

  function handleDeleteMarketplace(marketplace: MarketplaceDraft) {
    if (draft?.id === marketplace.id && draft.isNew) {
      resetEditor(null);
      return;
    }
    if (blockIfDirty()) {
      return;
    }
    const nextMarketplaces = marketplaces.filter(
      (candidate) => candidate.marketplaceId !== marketplace.marketplaceId,
    );
    setMarketplaces(nextMarketplaces);
    onChange(buildMarketplaceRecord(nextMarketplaces));
    if (draft?.id === marketplace.id) {
      resetEditor(null);
    }
  }

  return (
    <div className="profile-subsection">
      {showTitle ? (
        <div className="profile-subsection-header">
          <div>
            <h4>{isZh ? "Marketplace" : "Marketplaces"}</h4>
          </div>
        </div>
      ) : null}

      <div className="profile-marketplace-editor">
        <div className="profile-marketplace-list-shell">
          <div className="profile-marketplace-list">
            <div className="profile-marketplace-list-header">
              <span className="profile-marketplace-list-header-index">
                {isZh ? "序号" : "Index"}
              </span>
              <span>{isZh ? "Marketplace" : "Marketplace"}</span>
              <span>{isZh ? "关键信息" : "Summary"}</span>
              <span>{isZh ? "操作" : "Actions"}</span>
            </div>

            {listItems.length > 0 ? (
              listItems.map((item, index) => {
                const selected = draft?.id === item.id;
                const draftBadge = item.isDraft ? (isZh ? "草稿" : "Draft") : null;
                const dirtyBadge =
                  selected && hasUnsavedChanges && !draft?.isNew
                    ? isZh
                      ? "未保存"
                      : "Unsaved"
                    : null;
                const label = item.marketplaceId || (isZh ? "新 Marketplace" : "New marketplace");
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
                        aria-label={`${isZh ? "编辑 Marketplace" : "Edit marketplace"} ${label}`}
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
                          aria-label={`${isZh ? "删除 Marketplace" : "Delete marketplace"} ${label}`}
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
                                <span>{isZh ? "Marketplace ID" : "Marketplace ID"}</span>
                                <RequiredBadge />
                              </span>
                              <input
                                ref={idInputRef}
                                aria-label={isZh ? "Marketplace ID" : "Marketplace ID"}
                                value={draft.marketplaceId}
                                placeholder="team-market"
                                onChange={(event) =>
                                  handleDraftChange("marketplaceId", event.target.value)
                                }
                              />
                            </label>

                            <label className="form-group">
                              <span className="profile-env-inline-label">
                                {isZh ? "Marketplace 来源" : "Marketplace Source"}
                              </span>
                              <select
                                aria-label={isZh ? "Marketplace 来源" : "Marketplace Source"}
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
                                    <span>{isZh ? "Marketplace 仓库" : "Marketplace Repo"}</span>
                                    <RequiredBadge />
                                  </span>
                                  <input
                                    aria-label={isZh ? "Marketplace 仓库" : "Marketplace Repo"}
                                    value={draft.repo}
                                    placeholder="team/plugins"
                                    onChange={(event) =>
                                      handleDraftChange("repo", event.target.value)
                                    }
                                  />
                                </label>

                                <label className="form-group">
                                  <span className="profile-env-inline-label">
                                    {isZh ? "Marketplace Ref" : "Marketplace Ref"}
                                  </span>
                                  <input
                                    aria-label={isZh ? "Marketplace Ref" : "Marketplace Ref"}
                                    value={draft.ref}
                                    placeholder="main"
                                    onChange={(event) =>
                                      handleDraftChange("ref", event.target.value)
                                    }
                                  />
                                </label>

                                <label className="form-group">
                                  <span className="profile-env-inline-label">
                                    {isZh ? "Marketplace 路径" : "Marketplace Path"}
                                  </span>
                                  <input
                                    aria-label={isZh ? "Marketplace 路径" : "Marketplace Path"}
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
                                  <span>{isZh ? "Marketplace URL" : "Marketplace URL"}</span>
                                  <RequiredBadge />
                                </span>
                                <input
                                  aria-label={isZh ? "Marketplace URL" : "Marketplace URL"}
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
                                  <span>
                                    {isZh ? "Marketplace Host Pattern" : "Marketplace Host Pattern"}
                                  </span>
                                  <RequiredBadge />
                                </span>
                                <input
                                  aria-label={
                                    isZh ? "Marketplace Host Pattern" : "Marketplace Host Pattern"
                                  }
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
                                  <span>{isZh ? "Marketplace 包" : "Marketplace Package"}</span>
                                  <RequiredBadge />
                                </span>
                                <input
                                  aria-label={isZh ? "Marketplace 包" : "Marketplace Package"}
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
                                  <span>{isZh ? "Marketplace 路径" : "Marketplace Path"}</span>
                                  <RequiredBadge />
                                </span>
                                <input
                                  aria-label={isZh ? "Marketplace 路径" : "Marketplace Path"}
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
                                {isZh ? "Marketplace 安装位置" : "Marketplace Install Location"}
                              </span>
                              <input
                                aria-label={
                                  isZh ? "Marketplace 安装位置" : "Marketplace Install Location"
                                }
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
                            aria-label={isZh ? "保存 Marketplace" : "Save marketplace"}
                            onClick={handleSaveDraft}
                          >
                            {isZh ? "保存 Marketplace" : "Save marketplace"}
                          </button>
                          <button
                            type="button"
                            className="profile-secondary-btn"
                            aria-label={
                              isZh ? "取消编辑 Marketplace" : "Cancel marketplace editing"
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
              <div className="profile-empty-state profile-marketplace-empty-list">{emptyHint}</div>
            )}
          </div>

          <div className="profile-env-footer">
            <button type="button" className="profile-secondary-btn" onClick={handleAddMarketplace}>
              {isZh ? "新增 Marketplace" : "Add marketplace"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default MarketplaceEditor;
