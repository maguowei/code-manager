import { openUrl } from "@tauri-apps/plugin-opener";
import { ArrowLeft, Copy, ExternalLink } from "lucide-react";
import { showOperationError } from "@/lib/user-facing-error";
import { useToast } from "../hooks/useToast";
import { useI18n } from "../i18n";
import type { CodexProvider } from "../types";
import PageHeader from "./PageHeader";
import { Button } from "./ui/button";
import { Card } from "./ui/card";

interface CodexProvidersPageProps {
  providers: CodexProvider[];
  onClose?: () => void;
}

const PROVIDER_CARD_CLASS =
  "preset-card flex flex-col gap-3 rounded-lg border border-border bg-card p-4 text-foreground shadow-panel";

const PROVIDER_CHIP_CLASS =
  "preset-chip inline-flex min-h-7 items-center rounded-full border border-border bg-secondary px-2.5 py-1 text-xs font-semibold text-foreground";

export default function CodexProvidersPage({ providers, onClose }: CodexProvidersPageProps) {
  const { t } = useI18n();
  const { showToast } = useToast();

  async function copyProviderId(id: string) {
    try {
      await navigator.clipboard.writeText(id);
      showToast(t("providers.toast.idCopied"));
    } catch (err) {
      showOperationError(showToast, t("providers.toast.copyIdError"), err);
    }
  }

  function renderDocLink(docUrl?: string) {
    if (!docUrl) return null;

    return (
      <Button
        type="button"
        variant="link"
        className="preset-card-doc-link h-auto min-h-7 gap-1.5 p-0 text-xs font-semibold text-primary hover:text-primary"
        onClick={() => void openUrl(docUrl)}
      >
        <span>{t("providers.actions.openDocs")}</span>
        <ExternalLink className="size-3.5" aria-hidden="true" />
      </Button>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-secondary">
      <PageHeader
        title={t("codex.builtinProvidersTitle")}
        description={t("codex.builtinProvidersDescription")}
        surface="secondary"
        variant="list"
        actions={
          onClose ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={onClose}
              aria-label={t("common.close")}
            >
              <ArrowLeft className="size-4" aria-hidden="true" />
            </Button>
          ) : null
        }
      />

      <div className="scrollbar-none flex min-h-0 flex-col gap-3 overflow-y-auto p-4">
        {providers.map((provider) => {
          return (
            <Card key={provider.id} className={PROVIDER_CARD_CLASS} data-slot="preset-card">
              <div className="preset-card-head flex items-start justify-between gap-3 max-[700px]:flex-wrap">
                <div className="preset-card-title-block min-w-0 flex-1">
                  <h3 className="text-base leading-snug font-semibold">{provider.name}</h3>
                </div>
              </div>

              <div className="preset-card-body flex flex-col gap-2.5">
                <div className="preset-card-meta-row flex flex-wrap items-center gap-2.5">
                  <div
                    className="preset-card-id inline-flex max-w-full items-center self-start rounded-full border border-border bg-muted px-[9px] py-1 font-mono text-xs leading-normal text-muted-foreground [overflow-wrap:anywhere]"
                    title={provider.id}
                  >
                    {provider.id}
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    className="preset-card-copy-id text-muted-foreground hover:bg-muted hover:text-foreground"
                    aria-label={t("providers.actions.copyId")}
                    title={t("providers.actions.copyId")}
                    onClick={() => {
                      void copyProviderId(provider.id);
                    }}
                  >
                    <Copy aria-hidden="true" />
                  </Button>
                  {renderDocLink(provider.docUrl)}
                </div>

                {/* Base URL */}
                <div className="preset-summary-block rounded-lg border border-border bg-muted/50 px-3 py-[11px]">
                  <span className="preset-summary-label inline-flex items-center text-xs leading-normal font-semibold text-muted-foreground">
                    {t("profiles.editor.fields.baseUrl")}
                  </span>
                  <div className="preset-summary-value mt-[7px] flex flex-wrap items-center gap-2 font-mono text-xs leading-normal text-foreground [overflow-wrap:anywhere]">
                    {provider.baseUrl}
                  </div>
                </div>

                {/* 默认模型与推理档位 */}
                {(provider.defaultModel || provider.defaultReasoningEffort) && (
                  <div className="preset-summary-block rounded-lg border border-border bg-muted/50 px-3 py-[11px]">
                    <span className="preset-summary-label inline-flex items-center text-xs leading-normal font-semibold text-muted-foreground">
                      {t("providers.fields.defaultModels")}
                    </span>
                    <dl className="preset-default-models mt-[7px] grid grid-cols-[auto_1fr] items-baseline gap-x-4 gap-y-1.5">
                      {provider.defaultModel ? (
                        <div className="contents">
                          <dt className="text-xs leading-normal text-muted-foreground">
                            {t("codex.field.model")}
                          </dt>
                          <dd className="font-mono text-xs leading-normal text-foreground [overflow-wrap:anywhere]">
                            {provider.defaultModel}
                          </dd>
                        </div>
                      ) : null}
                      {provider.defaultReasoningEffort ? (
                        <div className="contents">
                          <dt className="text-xs leading-normal text-muted-foreground">
                            {t("codex.field.reasoningEffort")}
                          </dt>
                          <dd className="font-mono text-xs leading-normal text-foreground [overflow-wrap:anywhere]">
                            {provider.defaultReasoningEffort}
                          </dd>
                        </div>
                      ) : null}
                    </dl>
                  </div>
                )}

                {/* 推荐模型列表 */}
                {provider.models.length > 0 ? (
                  <div className="preset-model-section flex flex-col gap-[7px]">
                    <span className="preset-model-label inline-flex items-center text-xs leading-normal font-semibold text-muted-foreground">
                      {t("providers.fields.modelSuggestions")}
                    </span>
                    <div className="preset-chip-list flex flex-wrap items-center gap-2 text-sm leading-normal text-foreground">
                      {provider.models.map((m) => (
                        <span key={m.id} className={PROVIDER_CHIP_CLASS}>
                          {m.name || m.id}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}

                {/* 模型目录支持说明 */}
                {provider.modelCatalog ? (
                  <div className="rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
                    {t("codex.modelCatalogIncluded")}
                  </div>
                ) : null}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
