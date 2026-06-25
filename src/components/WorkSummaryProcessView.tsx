import { Check, ChevronRight, FileText, GitBranch } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SummaryDocument } from "../bindings";
import type { WorkSummaryProcess } from "../hooks/useWorkSummaries";
import { useI18n } from "../i18n";
import SyntaxHighlightedCode from "./SyntaxHighlightedCode";
import { PANEL_SURFACE_CLASS, SUBTLE_SURFACE_CLASS } from "./surface-classes";
import { TYPOGRAPHY } from "./typography-classes";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "./ui/collapsible";
import { ScrollArea } from "./ui/scroll-area";
import { Spinner } from "./ui/spinner";

type WorkSummaryProcessViewProps = {
  process: WorkSummaryProcess;
  themeType: "light" | "dark";
  onView: (doc: SummaryDocument) => void;
};

/** 透明的生成过程视图：扫描详情 → 提示词 → 调用 Claude → 完成链接 */
function WorkSummaryProcessView({ process, themeType, onView }: WorkSummaryProcessViewProps) {
  const { t } = useI18n();
  const { kind, phase, candidateCount, projects, prompt, doc } = process;

  const scanResultText = t("worklog.scanResult")
    .replace("{candidate}", String(candidateCount ?? 0))
    .replace("{changed}", String(projects?.length ?? 0));

  return (
    <div className="flex flex-col gap-4">
      {/* 扫描状态（仅日总结有逐项目扫描详情） */}
      {kind === "daily" && (
        <div className="flex items-center gap-2">
          {phase === "scanning" ? (
            <Spinner className="size-4" />
          ) : (
            <Check className="size-4 text-primary" aria-hidden="true" />
          )}
          <span className={TYPOGRAPHY.body}>
            {phase === "scanning" ? t("worklog.scanningProjects") : scanResultText}
          </span>
        </div>
      )}

      {/* 无变更提示 */}
      {kind === "daily" && phase !== "scanning" && projects && projects.length === 0 && (
        <p className={cn(TYPOGRAPHY.auxiliary)}>{t("worklog.noChanges")}</p>
      )}

      {/* 变更详情：每项目可折叠，含分支与提交列表 */}
      {projects && projects.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className={TYPOGRAPHY.sectionTitle}>{t("worklog.changedProjects")}</h3>
          {projects.map((p) => {
            const committed = p.branches.filter((b) => b.commits.length > 0);
            return (
              <Collapsible
                key={p.project}
                defaultOpen
                className={cn("rounded-md p-3", SUBTLE_SURFACE_CLASS)}
              >
                <CollapsibleTrigger className="group flex w-full items-center gap-2 text-left">
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-90" />
                  <span className={cn(TYPOGRAPHY.body, "font-medium")}>{p.shortName}</span>
                  {p.intents.length > 0 && (
                    <Badge variant="outline">
                      {t("worklog.intentsCount").replace("{count}", String(p.intents.length))}
                    </Badge>
                  )}
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-2 space-y-2 pl-6">
                  <p className={cn(TYPOGRAPHY.auxiliary, "break-all")}>{p.project}</p>
                  {committed.length === 0 && (
                    <p className={TYPOGRAPHY.auxiliary}>{t("worklog.onlyUncommitted")}</p>
                  )}
                  {p.branches.map((seg) => (
                    <div key={seg.branch} className="space-y-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <GitBranch className="size-3.5 text-muted-foreground" aria-hidden="true" />
                        <span className={cn(TYPOGRAPHY.body, "font-medium")}>{seg.branch}</span>
                        <Badge variant={seg.isMain ? "secondary" : "outline"}>
                          {seg.isMain ? t("worklog.mainBranchTag") : t("worklog.featureBranchTag")}
                        </Badge>
                        {seg.commits.length > 0 && (
                          <Badge variant="ghost">
                            {t("worklog.commitsCount").replace(
                              "{count}",
                              String(seg.commits.length),
                            )}
                          </Badge>
                        )}
                        {seg.hasUncommitted && (
                          <Badge variant="destructive">⚠️ {t("worklog.uncommittedHint")}</Badge>
                        )}
                      </div>
                      {seg.commits.length > 0 && (
                        <ul className="ml-5 list-disc space-y-0.5">
                          {seg.commits.map((c) => (
                            <li key={c.hash} className={TYPOGRAPHY.auxiliary}>
                              {c.subject}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                </CollapsibleContent>
              </Collapsible>
            );
          })}
        </section>
      )}

      {/* 最终提示词（默认折叠） */}
      {prompt && (
        <Collapsible className={cn("rounded-md p-3", SUBTLE_SURFACE_CLASS)}>
          <CollapsibleTrigger className="group flex w-full items-center gap-2 text-left">
            <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-90" />
            <FileText className="size-4 text-muted-foreground" aria-hidden="true" />
            <span className={cn(TYPOGRAPHY.body, "font-medium")}>{t("worklog.promptSection")}</span>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2">
            <ScrollArea className="max-h-80 w-full rounded-md border border-border">
              <SyntaxHighlightedCode
                code={prompt}
                language="markdown"
                themeType={themeType}
                wrapLongLines={false}
                customStyle={{ margin: 0 }}
              />
            </ScrollArea>
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* 调用 Claude 中 */}
      {phase === "summarizing" && (
        <div className="flex items-center gap-2">
          <Spinner className="size-4" />
          <span className={TYPOGRAPHY.body}>{t("worklog.callingClaude")}</span>
        </div>
      )}

      {/* 完成卡片 + 查看链接 */}
      {phase === "done" && doc && (
        <div className={cn("flex flex-col gap-2 rounded-md p-4", PANEL_SURFACE_CLASS)}>
          <div className="flex items-center gap-2">
            <Check className="size-5 text-primary" aria-hidden="true" />
            <span className={cn(TYPOGRAPHY.body, "font-medium")}>{t("worklog.saved")}</span>
          </div>
          <Button type="button" size="sm" className="self-start" onClick={() => onView(doc)}>
            {t("worklog.viewSummary")}
          </Button>
          <p className={cn(TYPOGRAPHY.auxiliary, "break-all")}>{doc.path}</p>
        </div>
      )}
    </div>
  );
}

export default WorkSummaryProcessView;
