import { useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "../../i18n";
import {
  createRowId,
  type MarketplaceDraft,
  type MarketplaceSourceType,
  readObject,
} from "./editor-utils";

interface MarketplaceEditorProps {
  value: unknown;
  onChange: (next: Record<string, unknown>) => void;
  onError: (message: string) => void;
  showTitle?: boolean;
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
        id: createRowId("marketplace"),
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

function MarketplaceEditor({ value, onChange, onError, showTitle = true }: MarketplaceEditorProps) {
  const { language } = useI18n();
  const isZh = language === "zh";
  const initialDrafts = useMemo(() => buildMarketplaceDrafts(value), [value]);
  const [marketplaces, setMarketplaces] = useState(initialDrafts);
  const [structuredError, setStructuredError] = useState("");
  const skipStructuredSyncRef = useRef(false);

  useEffect(() => {
    skipStructuredSyncRef.current = true;
    setMarketplaces(initialDrafts);
  }, [initialDrafts]);

  useEffect(() => {
    if (skipStructuredSyncRef.current) {
      skipStructuredSyncRef.current = false;
      return;
    }
    const ids = marketplaces.map((marketplace) => marketplace.marketplaceId.trim());
    if (ids.some((id) => !id)) {
      setStructuredError(isZh ? "Marketplace ID 不能为空" : "Marketplace ID cannot be empty");
      return;
    }
    if (new Set(ids).size !== ids.length) {
      setStructuredError(isZh ? "Marketplace ID 不能重复" : "Marketplace IDs must be unique");
      return;
    }

    for (const marketplace of marketplaces) {
      const requiredValue =
        marketplace.sourceType === "url"
          ? marketplace.url.trim()
          : marketplace.sourceType === "hostPattern"
            ? marketplace.hostPattern.trim()
            : marketplace.sourceType === "github"
              ? marketplace.repo.trim()
              : marketplace.sourceType === "git"
                ? marketplace.url.trim()
                : marketplace.sourceType === "npm"
                  ? marketplace.packageName.trim()
                  : marketplace.path.trim();

      if (!requiredValue) {
        setStructuredError(
          isZh ? "Marketplace 配置不完整" : "Marketplace configuration is incomplete",
        );
        return;
      }
    }

    setStructuredError("");
    const nextValue = marketplaces.reduce<Record<string, unknown>>((accumulator, marketplace) => {
      const source: Record<string, unknown> = {
        source: marketplace.sourceType,
      };
      switch (marketplace.sourceType) {
        case "url":
          source.url = marketplace.url.trim();
          break;
        case "hostPattern":
          source.hostPattern = marketplace.hostPattern.trim();
          break;
        case "github":
          source.repo = marketplace.repo.trim();
          if (marketplace.ref.trim()) {
            source.ref = marketplace.ref.trim();
          }
          if (marketplace.path.trim()) {
            source.path = marketplace.path.trim();
          }
          break;
        case "git":
          source.url = marketplace.url.trim();
          if (marketplace.ref.trim()) {
            source.ref = marketplace.ref.trim();
          }
          if (marketplace.path.trim()) {
            source.path = marketplace.path.trim();
          }
          break;
        case "npm":
          source.package = marketplace.packageName.trim();
          break;
        case "file":
        case "directory":
          source.path = marketplace.path.trim();
          break;
      }

      accumulator[marketplace.marketplaceId.trim()] = {
        source,
        ...(marketplace.installLocation.trim()
          ? {
              installLocation: marketplace.installLocation.trim(),
            }
          : {}),
      };
      return accumulator;
    }, {});
    if (JSON.stringify(nextValue) !== JSON.stringify(value ?? {})) {
      onChange(nextValue);
    }
  }, [isZh, marketplaces, onChange, value]);

  useEffect(() => {
    onError(structuredError);
  }, [onError, structuredError]);

  function updateMarketplace(
    marketplaceId: string,
    updater: (marketplace: MarketplaceDraft) => MarketplaceDraft,
  ) {
    setMarketplaces((current) =>
      current.map((marketplace) =>
        marketplace.id === marketplaceId ? updater(marketplace) : marketplace,
      ),
    );
  }

  return (
    <div className="profile-subsection">
      <div className="profile-subsection-header">
        <div>
          {showTitle ? <h4>{isZh ? "Marketplace" : "Marketplaces"}</h4> : null}
          <p>
            {isZh
              ? "结构化维护 extraKnownMarketplaces。"
              : "Maintain extraKnownMarketplaces with structured controls."}
          </p>
        </div>
        <div className="profile-subsection-actions">
          <button
            type="button"
            className="profile-secondary-btn"
            onClick={() =>
              setMarketplaces((current) => [
                ...current,
                {
                  id: createRowId("marketplace"),
                  marketplaceId: "",
                  sourceType: "github",
                  url: "",
                  hostPattern: "",
                  repo: "",
                  ref: "",
                  path: "",
                  packageName: "",
                  installLocation: "",
                },
              ])
            }
          >
            {isZh ? "新增 Marketplace" : "Add marketplace"}
          </button>
        </div>
      </div>

      {marketplaces.length === 0 ? (
        <div className="profile-empty-state">
          {isZh ? "没有额外 Marketplace，Claude 会只看到默认来源。" : "No extra marketplaces yet."}
        </div>
      ) : (
        <div className="profile-card-stack">
          {marketplaces.map((marketplace, index) => (
            <section key={marketplace.id} className="profile-mini-card">
              <div className="profile-card-actions">
                <button
                  type="button"
                  className="profile-icon-btn danger"
                  aria-label={`${isZh ? "删除 Marketplace" : "Remove marketplace"} ${index + 1}`}
                  onClick={() =>
                    setMarketplaces((current) =>
                      current.filter((candidate) => candidate.id !== marketplace.id),
                    )
                  }
                >
                  ×
                </button>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor={`marketplace-id-${marketplace.id}`}>
                    {isZh ? "Marketplace ID" : "Marketplace ID"}
                  </label>
                  <input
                    id={`marketplace-id-${marketplace.id}`}
                    aria-label={`${isZh ? "Marketplace ID" : "Marketplace ID"} ${index + 1}`}
                    value={marketplace.marketplaceId}
                    placeholder="team-market"
                    onChange={(event) =>
                      updateMarketplace(marketplace.id, (current) => ({
                        ...current,
                        marketplaceId: event.target.value,
                      }))
                    }
                  />
                </div>

                <div className="form-group">
                  <label htmlFor={`marketplace-source-${marketplace.id}`}>
                    {isZh ? "Marketplace 来源" : "Marketplace Source"}
                  </label>
                  <select
                    id={`marketplace-source-${marketplace.id}`}
                    aria-label={`${isZh ? "Marketplace 来源" : "Marketplace Source"} ${index + 1}`}
                    className="form-select"
                    value={marketplace.sourceType}
                    onChange={(event) =>
                      updateMarketplace(marketplace.id, (current) => ({
                        ...current,
                        sourceType: event.target.value as MarketplaceSourceType,
                      }))
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
                </div>
              </div>

              <div className="form-row">
                {marketplace.sourceType === "github" ? (
                  <>
                    <div className="form-group">
                      <label htmlFor={`marketplace-repo-${marketplace.id}`}>
                        {isZh ? "Marketplace 仓库" : "Marketplace Repo"}
                      </label>
                      <input
                        id={`marketplace-repo-${marketplace.id}`}
                        aria-label={`${isZh ? "Marketplace 仓库" : "Marketplace Repo"} ${index + 1}`}
                        value={marketplace.repo}
                        placeholder="team/plugins"
                        onChange={(event) =>
                          updateMarketplace(marketplace.id, (current) => ({
                            ...current,
                            repo: event.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className="form-group">
                      <label htmlFor={`marketplace-ref-${marketplace.id}`}>
                        {isZh ? "Marketplace Ref" : "Marketplace Ref"}
                      </label>
                      <input
                        id={`marketplace-ref-${marketplace.id}`}
                        aria-label={`${isZh ? "Marketplace Ref" : "Marketplace Ref"} ${index + 1}`}
                        value={marketplace.ref}
                        placeholder="main"
                        onChange={(event) =>
                          updateMarketplace(marketplace.id, (current) => ({
                            ...current,
                            ref: event.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className="form-group">
                      <label htmlFor={`marketplace-path-${marketplace.id}`}>
                        {isZh ? "Marketplace 路径" : "Marketplace Path"}
                      </label>
                      <input
                        id={`marketplace-path-${marketplace.id}`}
                        aria-label={`${isZh ? "Marketplace 路径" : "Marketplace Path"} ${index + 1}`}
                        value={marketplace.path}
                        placeholder=".claude-plugin/marketplace.json"
                        onChange={(event) =>
                          updateMarketplace(marketplace.id, (current) => ({
                            ...current,
                            path: event.target.value,
                          }))
                        }
                      />
                    </div>
                  </>
                ) : null}

                {marketplace.sourceType === "git" || marketplace.sourceType === "url" ? (
                  <div className="form-group">
                    <label htmlFor={`marketplace-url-${marketplace.id}`}>
                      {isZh ? "Marketplace URL" : "Marketplace URL"}
                    </label>
                    <input
                      id={`marketplace-url-${marketplace.id}`}
                      aria-label={`${isZh ? "Marketplace URL" : "Marketplace URL"} ${index + 1}`}
                      value={marketplace.url}
                      placeholder={
                        marketplace.sourceType === "git"
                          ? "https://example.com/repo.git"
                          : "https://example.com/marketplace.json"
                      }
                      onChange={(event) =>
                        updateMarketplace(marketplace.id, (current) => ({
                          ...current,
                          url: event.target.value,
                        }))
                      }
                    />
                  </div>
                ) : null}

                {marketplace.sourceType === "hostPattern" ? (
                  <div className="form-group">
                    <label htmlFor={`marketplace-host-pattern-${marketplace.id}`}>
                      {isZh ? "Marketplace Host Pattern" : "Marketplace Host Pattern"}
                    </label>
                    <input
                      id={`marketplace-host-pattern-${marketplace.id}`}
                      aria-label={`${isZh ? "Marketplace Host Pattern" : "Marketplace Host Pattern"} ${index + 1}`}
                      value={marketplace.hostPattern}
                      placeholder="github.com/*"
                      onChange={(event) =>
                        updateMarketplace(marketplace.id, (current) => ({
                          ...current,
                          hostPattern: event.target.value,
                        }))
                      }
                    />
                  </div>
                ) : null}

                {marketplace.sourceType === "npm" ? (
                  <div className="form-group">
                    <label htmlFor={`marketplace-package-${marketplace.id}`}>
                      {isZh ? "Marketplace 包" : "Marketplace Package"}
                    </label>
                    <input
                      id={`marketplace-package-${marketplace.id}`}
                      aria-label={`${isZh ? "Marketplace 包" : "Marketplace Package"} ${index + 1}`}
                      value={marketplace.packageName}
                      placeholder="@team/claude-marketplace"
                      onChange={(event) =>
                        updateMarketplace(marketplace.id, (current) => ({
                          ...current,
                          packageName: event.target.value,
                        }))
                      }
                    />
                  </div>
                ) : null}

                {marketplace.sourceType === "file" || marketplace.sourceType === "directory" ? (
                  <div className="form-group">
                    <label htmlFor={`marketplace-path-only-${marketplace.id}`}>
                      {isZh ? "Marketplace 路径" : "Marketplace Path"}
                    </label>
                    <input
                      id={`marketplace-path-only-${marketplace.id}`}
                      aria-label={`${isZh ? "Marketplace 路径" : "Marketplace Path"} ${index + 1}`}
                      value={marketplace.path}
                      placeholder="/path/to/marketplace"
                      onChange={(event) =>
                        updateMarketplace(marketplace.id, (current) => ({
                          ...current,
                          path: event.target.value,
                        }))
                      }
                    />
                  </div>
                ) : null}

                <div className="form-group">
                  <label htmlFor={`marketplace-install-location-${marketplace.id}`}>
                    {isZh ? "Marketplace 安装位置" : "Marketplace Install Location"}
                  </label>
                  <input
                    id={`marketplace-install-location-${marketplace.id}`}
                    aria-label={`${isZh ? "Marketplace 安装位置" : "Marketplace Install Location"} ${index + 1}`}
                    value={marketplace.installLocation}
                    placeholder="/tmp/team-market"
                    onChange={(event) =>
                      updateMarketplace(marketplace.id, (current) => ({
                        ...current,
                        installLocation: event.target.value,
                      }))
                    }
                  />
                </div>
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

export default MarketplaceEditor;
