import { openUrl } from "@tauri-apps/plugin-opener";
import { ExternalLink } from "lucide-react";
import { useCallback, useMemo, useRef } from "react";
import { Button } from "@/components/ui/button";
import { showOperationError } from "@/lib/user-facing-error";
import { useToast } from "../../hooks/useToast";
import { useI18n } from "../../i18n";
import MarkdownPreview from "../claude-overview/MarkdownPreview";
import PageHeader from "../PageHeader";
import { useTheme } from "../theme-provider";
import CheatSheetToc from "./CheatSheetToc";
// 速查表内容由 scripts/sync-cheatsheet.mjs 从 cc.storyfox.cz 提取生成，以 ?raw 静态打包
import enMarkdown from "./cheatsheet.en.md?raw";
import zhMarkdown from "./cheatsheet.zh.md?raw";
import { useCheatSheetToc } from "./use-cheatsheet-toc";

// 源站语言对应入口：英文为根路径，中文为 /zh/
const SOURCE_URL = {
  zh: "https://cc.storyfox.cz/zh/",
  en: "https://cc.storyfox.cz/",
} as const;

function CheatSheetPage() {
  const { language, t } = useI18n();
  const { isDark } = useTheme();
  const { showToast } = useToast();

  const content = language === "zh" ? zhMarkdown : enMarkdown;
  const sourceUrl = useMemo(() => SOURCE_URL[language], [language]);

  const contentRef = useRef<HTMLDivElement>(null);
  const { entries, activeId, scrollToHeading } = useCheatSheetToc(contentRef, content);

  const handleOpenLatest = useCallback(async () => {
    try {
      await openUrl(sourceUrl);
    } catch (err) {
      showOperationError(showToast, t("cheatsheet.openLatestError"), err);
    }
  }, [sourceUrl, showToast, t]);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <PageHeader
        title={t("cheatsheet.title")}
        description={t("cheatsheet.description")}
        actions={
          <Button
            variant="outline"
            size="sm"
            asChild
            className="border-border bg-transparent px-2.5 text-xs font-semibold text-muted-foreground hover:border-primary hover:bg-accent hover:text-foreground"
          >
            <a
              href={sourceUrl}
              aria-label={t("cheatsheet.openLatest")}
              title={t("cheatsheet.openLatest")}
              onClick={(event) => {
                event.preventDefault();
                void handleOpenLatest();
              }}
            >
              <span>{t("cheatsheet.openLatest")}</span>
              <ExternalLink className="size-3.5" aria-hidden="true" />
            </a>
          </Button>
        }
      />
      <div className="flex flex-1 overflow-hidden">
        <div ref={contentRef} className="flex-1 overflow-y-auto">
          <MarkdownPreview
            content={content}
            themeType={isDark ? "dark" : "light"}
            className="mx-auto max-w-4xl px-5 py-4"
          />
        </div>
        <CheatSheetToc
          entries={entries}
          activeId={activeId}
          onSelect={scrollToHeading}
          title={t("cheatsheet.tableOfContents")}
          className="max-[900px]:hidden"
        />
      </div>
    </div>
  );
}

export default CheatSheetPage;
