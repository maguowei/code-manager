import { openUrl } from "@tauri-apps/plugin-opener";
import { Copy, ExternalLink } from "lucide-react";
import { showOperationError } from "@/lib/user-facing-error";
import { cn } from "@/lib/utils";
import { useToast } from "../hooks/useToast";
import { useI18n } from "../i18n";
import type { Provider } from "../types";
import { providerDisplayName } from "./config-workspace-utils";
import PageHeader from "./PageHeader";
import { Button } from "./ui/button";
import { Card } from "./ui/card";

interface ProvidersPageProps {
  providers: Provider[];
}

const PROVIDER_CARD_CLASS =
  "preset-card flex flex-col gap-3 rounded-lg border border-border bg-card p-4 text-foreground shadow-panel";

const PROVIDER_CHIP_CLASS =
  "preset-chip inline-flex min-h-7 items-center rounded-full border border-border bg-secondary px-2.5 py-1 text-xs font-semibold text-foreground";

// 内置供应商只读一览：从 Profile 编辑器的供应商选项处打开，仅供查看，不支持新增/编辑/删除。
function ProvidersPage({ providers }: ProvidersPageProps) {
  const { language, t } = useI18n();
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
    if (!docUrl) {
      return null;
    }

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

  function renderModelSection(modelSuggestions: string[]) {
    return (
      <div className="preset-model-section flex flex-col gap-[7px]">
        <span className="preset-model-label inline-flex items-center text-xs leading-normal font-semibold text-muted-foreground">
          {t("providers.fields.modelSuggestions")}
        </span>
        <div className="preset-chip-list flex flex-wrap items-center gap-2 text-sm leading-normal text-foreground">
          {modelSuggestions.length > 0 ? (
            modelSuggestions.map((model) => (
              <span key={model} className={PROVIDER_CHIP_CLASS}>
                {model}
              </span>
            ))
          ) : (
            <span
              className={cn(
                PROVIDER_CHIP_CLASS,
                "preset-chip-empty bg-muted text-muted-foreground",
              )}
            >
              —
            </span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-secondary">
      <PageHeader
        title={t("providers.title")}
        description={t("providers.description")}
        surface="secondary"
        variant="list"
      />
      <div className="scrollbar-none flex min-h-0 flex-col gap-3 overflow-y-auto p-4">
        {providers.map((provider) => {
          const modelSuggestions = provider.modelSuggestions
            .map((model) => model.trim())
            .filter(Boolean);
          // API 地址来自 provider.env.ANTHROPIC_BASE_URL；官方 Anthropic 留空
          const baseUrl = provider.env?.ANTHROPIC_BASE_URL ?? "";

          return (
            <Card key={provider.id} className={PROVIDER_CARD_CLASS} data-slot="preset-card">
              <div className="preset-card-head flex items-start justify-between gap-3 max-[700px]:flex-wrap">
                <div className="preset-card-title-block min-w-0 flex-1">
                  <h3 className="text-base leading-snug font-semibold">
                    {providerDisplayName(provider, language)}
                  </h3>
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

                {baseUrl && (
                  <div className="preset-summary-block rounded-lg border border-border bg-muted/50 px-3 py-[11px]">
                    <span className="preset-summary-label inline-flex items-center text-xs leading-normal font-semibold text-muted-foreground">
                      {t("providers.fields.baseUrl")}
                    </span>
                    <div className="preset-summary-value mt-[7px] flex flex-wrap items-center gap-2 font-mono text-xs leading-normal text-foreground [overflow-wrap:anywhere]">
                      {baseUrl}
                    </div>
                  </div>
                )}

                {renderModelSection(modelSuggestions)}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

export default ProvidersPage;
