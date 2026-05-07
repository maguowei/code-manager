import { Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { type TranslationKey, useI18n } from "../../i18n";
import ConfirmAlertDialog from "../ConfirmAlertDialog";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import {
  createRowId,
  type MarketplaceDraft,
  type MarketplaceSourceType,
  readObject,
} from "./editor-utils";
import { buildOfficialMarketplaceDraft, OFFICIAL_MARKETPLACE_ID } from "./marketplace-presets";
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
  const hasOfficialMarketplace = useMemo(
    () => marketplaces.some((marketplace) => marketplace.marketplaceId === OFFICIAL_MARKETPLACE_ID),
    [marketplaces],
  );

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

  function handleAddOfficialMarketplace() {
    if (blockIfDirty()) {
      return;
    }
    if (hasOfficialMarketplace) {
      return;
    }

    const nextMarketplaces = [...marketplaces, buildOfficialMarketplaceDraft()];
    setMarketplaces(nextMarketplaces);
    onChange(buildMarketplaceRecord(nextMarketplaces));
    setInteractionError("");
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

      <div className="profile-marketplace-editor flex flex-col gap-4">
        <div className="profile-marketplace-list-shell flex min-w-0 flex-col gap-3 [container-type:inline-size]">
          <div className="profile-marketplace-list flex flex-col overflow-hidden rounded-lg border border-[color-mix(in_srgb,var(--border-default)_88%,var(--primary)_12%)] bg-[color-mix(in_srgb,var(--card)_92%,var(--accent)_8%)]">
            <div className="profile-marketplace-list-header grid grid-cols-[40px_minmax(0,1fr)_minmax(0,1.35fr)_auto] items-center gap-3 border-b border-[color-mix(in_srgb,var(--border-default)_92%,transparent)] px-3.5 pt-3 pb-2.5 text-xs font-semibold text-[var(--text-secondary)] max-[720px]:hidden">
              <span className="profile-marketplace-list-header-index inline-flex items-center justify-center text-xs font-semibold text-[var(--text-muted)] tabular-nums">
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
                    className={`profile-marketplace-list-row flex flex-col gap-0 border-t border-[color-mix(in_srgb,var(--border-default)_92%,transparent)] px-3.5 py-2.5 first:border-t-0 max-[720px]:gap-3 max-[720px]:py-3${selected ? " selected bg-[color-mix(in_srgb,var(--accent)_18%,var(--card)_82%)]" : ""}`}
                  >
                    <div className="profile-marketplace-row-head grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 max-[720px]:items-start">
                      <button
                        type="button"
                        className="profile-marketplace-list-main group grid min-h-12 w-full min-w-0 cursor-pointer grid-cols-[40px_minmax(0,1fr)_minmax(0,1.35fr)] items-center gap-3 rounded-lg border-0 bg-transparent px-2.5 py-2 text-left text-[var(--foreground)] hover:text-[var(--primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)] max-[720px]:grid-cols-[32px_minmax(0,1fr)] max-[720px]:items-start max-[720px]:gap-x-2.5 max-[720px]:gap-y-1.5"
                        aria-pressed={selected}
                        aria-label={`${t("profileEditor.marketplace.editAriaLabel")} ${label}`}
                        onClick={() => handleSelectMarketplace(marketplace)}
                      >
                        <span
                          className="profile-marketplace-list-index inline-flex items-center justify-center text-xs font-semibold text-[var(--text-muted)] tabular-nums max-[720px]:row-span-2 max-[720px]:items-start max-[720px]:pt-0.5"
                          aria-hidden="true"
                        >
                          {index + 1}
                        </span>
                        <span className="profile-marketplace-list-title inline-flex min-w-0 flex-wrap items-center gap-2 font-semibold max-[720px]:col-start-2">
                          <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap max-[720px]:whitespace-normal max-[720px]:break-words">
                            {label}
                          </span>
                          <span className="profile-env-row-badge subtle">{item.sourceType}</span>
                          {draftBadge ? (
                            <span className="profile-env-row-badge">{draftBadge}</span>
                          ) : null}
                          {dirtyBadge ? (
                            <span className="profile-env-row-badge subtle">{dirtyBadge}</span>
                          ) : null}
                        </span>
                        <span className="profile-marketplace-list-summary flex min-w-0 flex-col gap-1 max-[720px]:col-start-2">
                          <span className="profile-marketplace-summary-primary min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-[13px] font-medium text-[var(--foreground)] group-hover:text-[var(--primary)] group-focus-visible:text-[var(--primary)] max-[720px]:whitespace-normal max-[720px]:break-words">
                            {item.primarySummary}
                          </span>
                          {item.secondarySummary.length > 0 ? (
                            <span className="profile-marketplace-summary-secondary min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-[13px] text-[var(--text-secondary)] group-hover:text-[var(--primary)] group-focus-visible:text-[var(--primary)] max-[720px]:whitespace-normal max-[720px]:break-words">
                              {item.secondarySummary.join(" · ")}
                            </span>
                          ) : null}
                        </span>
                      </button>

                      <div className="profile-row-actions profile-marketplace-row-actions flex flex-nowrap justify-end max-[720px]:self-start">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          className="profile-icon-btn danger text-destructive hover:bg-destructive/10 hover:text-destructive"
                          aria-label={`${t("profileEditor.marketplace.deleteAriaLabel")} ${label}`}
                          onClick={() => handleDeleteMarketplace(marketplace)}
                        >
                          <Trash2 className="size-4" aria-hidden="true" />
                        </Button>
                      </div>
                    </div>

                    {selected && draft ? (
                      <div className="profile-marketplace-inline-editor mt-2 flex flex-col gap-3 border-t border-[color-mix(in_srgb,var(--border-default)_92%,transparent)] pt-3 pl-[62px] max-[720px]:mt-0 max-[720px]:pl-0">
                        <div className="profile-marketplace-inline-fields flex flex-col gap-3">
                          <div className="form-row">
                            <label className="form-group gap-2">
                              <span className="profile-inline-required-label profile-env-inline-label">
                                <span>{t("profileEditor.marketplace.idLabel")}</span>
                                <RequiredBadge />
                              </span>
                              <Input
                                ref={idInputRef}
                                aria-label={t("profileEditor.marketplace.idLabel")}
                                value={draft.marketplaceId}
                                placeholder="team-market"
                                onChange={(event) =>
                                  handleDraftChange("marketplaceId", event.target.value)
                                }
                              />
                            </label>

                            <label className="form-group gap-2">
                              <span className="profile-env-inline-label">
                                {t("profileEditor.marketplace.sourceLabel")}
                              </span>
                              <select
                                aria-label={t("profileEditor.marketplace.sourceLabel")}
                                className="form-select h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-base text-[var(--foreground)] shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 md:text-sm"
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
                                <label className="form-group gap-2">
                                  <span className="profile-inline-required-label profile-env-inline-label">
                                    <span>{t("profileEditor.marketplace.repoLabel")}</span>
                                    <RequiredBadge />
                                  </span>
                                  <Input
                                    aria-label={t("profileEditor.marketplace.repoLabel")}
                                    value={draft.repo}
                                    placeholder="team/plugins"
                                    onChange={(event) =>
                                      handleDraftChange("repo", event.target.value)
                                    }
                                  />
                                </label>

                                <label className="form-group gap-2">
                                  <span className="profile-env-inline-label">
                                    {t("profileEditor.marketplace.refLabel")}
                                  </span>
                                  <Input
                                    aria-label={t("profileEditor.marketplace.refLabel")}
                                    value={draft.ref}
                                    placeholder="main"
                                    onChange={(event) =>
                                      handleDraftChange("ref", event.target.value)
                                    }
                                  />
                                </label>

                                <label className="form-group gap-2">
                                  <span className="profile-env-inline-label">
                                    {t("profileEditor.marketplace.repoPathLabel")}
                                  </span>
                                  <Input
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
                              <label className="form-group gap-2">
                                <span className="profile-inline-required-label profile-env-inline-label">
                                  <span>{t("profileEditor.marketplace.urlLabel")}</span>
                                  <RequiredBadge />
                                </span>
                                <Input
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
                              <label className="form-group gap-2">
                                <span className="profile-inline-required-label profile-env-inline-label">
                                  <span>{t("profileEditor.marketplace.hostPatternLabel")}</span>
                                  <RequiredBadge />
                                </span>
                                <Input
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
                              <label className="form-group gap-2">
                                <span className="profile-inline-required-label profile-env-inline-label">
                                  <span>{t("profileEditor.marketplace.packageLabel")}</span>
                                  <RequiredBadge />
                                </span>
                                <Input
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
                              <label className="form-group gap-2">
                                <span className="profile-inline-required-label profile-env-inline-label">
                                  <span>{t("profileEditor.marketplace.localPathLabel")}</span>
                                  <RequiredBadge />
                                </span>
                                <Input
                                  aria-label={t("profileEditor.marketplace.localPathLabel")}
                                  value={draft.path}
                                  placeholder="/path/to/marketplace"
                                  onChange={(event) =>
                                    handleDraftChange("path", event.target.value)
                                  }
                                />
                              </label>
                            ) : null}

                            <label className="form-group gap-2">
                              <span className="profile-env-inline-label">
                                {t("profileEditor.marketplace.installLocationLabel")}
                              </span>
                              <Input
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

                        <div className="profile-env-inline-actions flex flex-wrap items-center gap-2">
                          <Button
                            type="button"
                            className="profile-primary-btn"
                            aria-label={t("profileEditor.marketplace.saveAriaLabel")}
                            onClick={handleSaveDraft}
                          >
                            {t("profileEditor.marketplace.save")}
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            className="profile-secondary-btn"
                            aria-label={t("profileEditor.marketplace.cancelEditAriaLabel")}
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
              <div className="profile-empty-state profile-marketplace-empty-list flex min-h-[120px] items-center justify-center px-4 text-center">
                {emptyHint}
              </div>
            )}
          </div>

          <div className="profile-env-footer profile-marketplace-footer-actions flex flex-wrap gap-2 max-[720px]:[&>button]:w-full max-[720px]:[&>button]:justify-center">
            {!hasOfficialMarketplace ? (
              <Button
                type="button"
                className="profile-primary-btn"
                onClick={handleAddOfficialMarketplace}
              >
                <Plus className="size-4" aria-hidden="true" />
                {t("profileEditor.marketplace.addOfficial")}
              </Button>
            ) : null}
            <Button
              type="button"
              variant="outline"
              className="profile-secondary-btn"
              onClick={handleAddMarketplace}
            >
              <Plus className="size-4" aria-hidden="true" />
              {t("profileEditor.marketplace.addItem")}
            </Button>
          </div>
        </div>
      </div>

      {pendingDeleteMarketplace ? (
        <ConfirmAlertDialog
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
