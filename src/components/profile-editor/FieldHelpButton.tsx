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
      className="profile-field-help inline-flex size-6 items-center justify-center rounded-full border border-transparent text-muted-foreground hover:bg-secondary hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      aria-label={helperKey}
      data-tooltip={helperKey}
      title={helperKey}
    >
      <Info className="size-3.5" aria-hidden="true" />
    </button>
  );
}

export default FieldHelpButton;
