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
      className="profile-field-help inline-flex size-6 items-center justify-center rounded-full border border-transparent text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] hover:text-[var(--text-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-blue)]"
      aria-label={helperKey}
      data-tooltip={helperKey}
      title={helperKey}
    >
      <Info className="size-3.5" aria-hidden="true" />
    </button>
  );
}

export default FieldHelpButton;
