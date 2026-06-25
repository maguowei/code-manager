import { CalendarRange, NotebookPen } from "lucide-react";
import { cn } from "@/lib/utils";
import { useWorkSummaries } from "../hooks/useWorkSummaries";
import { useI18n } from "../i18n";
import MarkdownPreview from "./claude-overview/MarkdownPreview";
import EmptyState from "./EmptyState";
import PageHeader from "./PageHeader";
import { PANEL_SURFACE_CLASS } from "./surface-classes";
import { useTheme } from "./theme-provider";
import { Button } from "./ui/button";
import WorkSummaryProcessView from "./WorkSummaryProcessView";

// 总结文档的排版定制：github-markdown-css 是运行时注入的 unlayered 样式表，
// 同特异性的工具类会被它压过，故用 `!` important 才能稳定覆盖。全部走语义 token。
const SUMMARY_MARKDOWN_CLASS = cn(
  // 去掉 github-markdown-css 给 .markdown-body 设的深色底（#0d1117），消除「框中框」，
  // 让内容直接落在卡片单一表面，分层更清晰
  "!bg-transparent",
  // 恢复列表符号：tailwind preflight 把 list-style 清成 none，github-markdown-css 又未给顶层
  // ul/ol 补 disc，导致条目无符号挤成一团。这里显式恢复 marker 并给缩进与行距
  "[&_ul]:!list-disc [&_ol]:!list-decimal [&_ul]:!my-3 [&_ol]:!my-3",
  "[&_li]:!my-1 [&_li]:!leading-relaxed [&_li]:marker:text-muted-foreground",
  // 标题：弱化 github 默认的硬分割线，用间距 + 轻分隔区分层级
  "[&_h1]:!border-0",
  "[&_h2]:!mt-8 [&_h2]:!border-b [&_h2]:!border-border/40 [&_h2]:!pb-2",
  // 正文呼吸边距 + 重点/组标题加粗醒目
  "[&_p]:!my-3 [&_strong]:!text-foreground",
  // 元信息引用块低调
  "[&_blockquote]:!border-l-2 [&_blockquote]:!border-border [&_blockquote]:!text-muted-foreground",
);

function WorkSummaryPage() {
  const { t, language } = useI18n();
  const { isDark } = useTheme();
  const {
    items,
    selected,
    process,
    cliAvailable,
    select,
    viewSummary,
    summarizeYesterday,
    generateWeek,
  } = useWorkSummaries(language);

  // 生成中或刚完成（保留过程视图与查看链接）时禁用按钮
  const busy = process != null && process.phase !== "done";

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title={t("worklog.title")}
        actions={
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              disabled={!cliAvailable || busy}
              onClick={() => void summarizeYesterday()}
            >
              <NotebookPen aria-hidden="true" />
              {t("worklog.summarizeYesterday")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={!cliAvailable || busy}
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

        {/* 主区：过程视图 → 文档预览 → 空状态 */}
        <main className="min-w-0 flex-1 overflow-y-auto p-4">
          {process ? (
            <WorkSummaryProcessView
              process={process}
              themeType={isDark ? "dark" : "light"}
              onView={viewSummary}
            />
          ) : selected ? (
            <article className={cn("mx-auto max-w-3xl rounded-lg px-8 py-6", PANEL_SURFACE_CLASS)}>
              <MarkdownPreview
                content={selected.content}
                themeType={isDark ? "dark" : "light"}
                className={SUMMARY_MARKDOWN_CLASS}
              />
            </article>
          ) : (
            <EmptyState title={t("worklog.empty")} />
          )}
        </main>
      </div>
    </div>
  );
}

export default WorkSummaryPage;
