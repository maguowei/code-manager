import { CalendarRange, NotebookPen } from "lucide-react";
import { useI18n } from "../../i18n";
import { Button } from "../ui/button";

type Props = { disabled: boolean; onQuick: (kind: "day" | "week") => void };

/** 工作总结的快捷意图按钮：总结昨日 / 生成本周 */
function QuickActionChips({ disabled, onQuick }: Props) {
  const { t } = useI18n();
  return (
    <div className="flex items-center gap-1.5">
      <Button
        type="button"
        size="sm"
        variant="secondary"
        disabled={disabled}
        onClick={() => onQuick("day")}
      >
        <NotebookPen aria-hidden="true" />
        {t("worklog.summarizeYesterday")}
      </Button>
      <Button
        type="button"
        size="sm"
        variant="secondary"
        disabled={disabled}
        onClick={() => onQuick("week")}
      >
        <CalendarRange aria-hidden="true" />
        {t("worklog.generateWeek")}
      </Button>
    </div>
  );
}

export default QuickActionChips;
