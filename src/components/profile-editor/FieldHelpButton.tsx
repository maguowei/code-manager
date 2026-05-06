import { Info } from "lucide-react";

interface FieldHelpButtonProps {
  helperKey?: string;
}

function FieldHelpButton({ helperKey }: FieldHelpButtonProps) {
  if (!helperKey) {
    return null;
  }

  return (
    <button
      type="button"
      className="profile-field-help"
      aria-label={helperKey}
      data-tooltip={helperKey}
      title={helperKey}
    >
      <Info className="size-3.5" aria-hidden="true" />
    </button>
  );
}

export default FieldHelpButton;
