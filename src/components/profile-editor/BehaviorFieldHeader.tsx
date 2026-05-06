import FieldHelpButton from "./FieldHelpButton";

interface BehaviorFieldHeaderProps {
  label: string;
  inputId: string;
  helperKey?: string;
}

function BehaviorFieldHeader({ label, inputId, helperKey }: BehaviorFieldHeaderProps) {
  return (
    <div className="profile-field-header flex items-center gap-2">
      <label htmlFor={inputId} className="profile-field-label text-sm font-medium">
        {label}
      </label>
      <FieldHelpButton helperKey={helperKey} />
    </div>
  );
}

export default BehaviorFieldHeader;
