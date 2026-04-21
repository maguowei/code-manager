import { InfoIcon } from "../Icons";

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
      <InfoIcon />
    </button>
  );
}

export default FieldHelpButton;
