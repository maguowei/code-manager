import { useI18n } from "../../i18n";

interface RequiredBadgeProps {
  text?: string;
}

function RequiredBadge({ text }: RequiredBadgeProps) {
  const { t } = useI18n();

  return <span className="required-badge">{text ?? t("form.required")}</span>;
}

export default RequiredBadge;
