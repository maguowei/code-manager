import { AssistantRuntimeProvider } from "@assistant-ui/react";
import { useSummaryConversation } from "../hooks/useSummaryConversation";
import { useI18n } from "../i18n";
import { Thread } from "./assistant-ui/thread";
import PageHeader from "./PageHeader";
import QuickActionChips from "./work-summary/QuickActionChips";
import SummaryHistorySheet from "./work-summary/SummaryHistorySheet";

function WorkSummaryPage() {
  const { t, language } = useI18n();
  const { runtime, cliAvailable, isRunning, runQuickAction } = useSummaryConversation(language);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader title={t("worklog.title")} actions={<SummaryHistorySheet />} />

      {!cliAvailable && (
        <p className="px-4 py-2 text-sm text-muted-foreground">{t("worklog.cliMissing")}</p>
      )}

      <div className="border-b border-border px-4 py-2">
        <QuickActionChips disabled={!cliAvailable || isRunning} onQuick={runQuickAction} />
      </div>

      <div className="min-h-0 flex-1">
        <AssistantRuntimeProvider runtime={runtime}>
          <Thread />
        </AssistantRuntimeProvider>
      </div>
    </div>
  );
}

export default WorkSummaryPage;
