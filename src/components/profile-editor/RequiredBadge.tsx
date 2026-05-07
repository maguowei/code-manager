import { useI18n } from "../../i18n";

interface RequiredBadgeProps {
  text?: string;
}

function RequiredBadge({ text }: RequiredBadgeProps) {
  const { t } = useI18n();

  return (
    <span className="inline-flex items-center justify-center rounded-full bg-destructive/10 px-1.5 py-px text-xs font-semibold text-destructive">
      {text ?? t("form.required")}
    </span>
  );
}

export default RequiredBadge;
