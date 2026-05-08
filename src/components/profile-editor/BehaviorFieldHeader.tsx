import FieldHelpButton from "./FieldHelpButton";

interface BehaviorFieldHeaderProps {
  label: string;
  inputId: string;
  helperKey?: string;
}

function BehaviorFieldHeader({ label, inputId, helperKey }: BehaviorFieldHeaderProps) {
  return (
    <div className="flex items-center gap-2" data-slot="behavior-field-header">
      <label htmlFor={inputId} className="profile-field-label text-sm font-medium">
        {label}
      </label>
      <FieldHelpButton helperKey={helperKey} />
    </div>
  );
}

export default BehaviorFieldHeader;
