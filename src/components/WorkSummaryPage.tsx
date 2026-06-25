import { CalendarRange, NotebookPen } from "lucide-react";
import { cn } from "@/lib/utils";
import { useWorkSummaries } from "../hooks/useWorkSummaries";
import { useI18n } from "../i18n";
import MarkdownPreview from "./claude-overview/MarkdownPreview";
import EmptyState from "./EmptyState";
import PageHeader from "./PageHeader";
import { useTheme } from "./theme-provider";
import { Button } from "./ui/button";

function WorkSummaryPage() {
  const { t, language } = useI18n();
  const { isDark } = useTheme();
  const {
    items,
    selected,
    generating,
    progress,
    cliAvailable,
    select,
    summarizeYesterday,
    generateWeek,
  } = useWorkSummaries(language);

  // 进度阶段映射为可读文案；缺省回退到通用「正在生成」
  const generatingTitle =
    progress?.phase === "scanning"
      ? t("worklog.scanning")
      : progress?.phase === "summarizing"
        ? t("worklog.summarizing")
        : t("worklog.generating");

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title={t("worklog.title")}
        actions={
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              disabled={!cliAvailable || generating}
              onClick={() => void summarizeYesterday()}
            >
              <NotebookPen aria-hidden="true" />
              {t("worklog.summarizeYesterday")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={!cliAvailable || generating}
              onClick={() => void generateWeek()}
            >
              <CalendarRange aria-hidden="true" />
              {t("worklog.generateWeek")}
            </Button>
          </div>
        }
      />

      {!cliAvailable && (
        <p className="px-4 py-2 text-sm text-muted-foreground">{t("worklog.cliMissing")}</p>
      )}

      <div className="flex min-h-0 flex-1">
        {/* 左栏：总结列表 */}
        <aside className="w-56 shrink-0 overflow-y-auto border-r border-border p-2">
          {items.length === 0 ? (
            <EmptyState title={t("worklog.empty")} className="min-h-0 px-3 py-6" />
          ) : (
            <ul className="flex flex-col gap-1">
              {items.map((item) => (
                <li key={`${item.kind}-${item.key}`}>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => void select(item)}
                    className={cn(
                      "h-auto w-full flex-col items-start rounded-md px-3 py-2 text-left text-sm",
                      selected?.kind === item.kind && selected?.key === item.key && "bg-accent",
                    )}
                  >
                    <span className="block truncate font-medium">{item.key}</span>
                    <span className="text-xs text-muted-foreground">
                      {item.kind === "weekly" ? t("worklog.weekly") : t("worklog.daily")}
                    </span>
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        {/* 主区：Markdown 预览 */}
        <main className="min-w-0 flex-1 overflow-y-auto p-4">
          {generating ? (
            <EmptyState title={generatingTitle} loading />
          ) : selected ? (
            <MarkdownPreview content={selected.content} themeType={isDark ? "dark" : "light"} />
          ) : (
            <EmptyState title={t("worklog.empty")} />
          )}
        </main>
      </div>
    </div>
  );
}

export default WorkSummaryPage;
