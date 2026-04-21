import FieldHelpButton from "./FieldHelpButton";

interface BehaviorFieldHeaderProps {
  label: string;
  inputId: string;
  helperKey?: string;
}

function BehaviorFieldHeader({ label, inputId, helperKey }: BehaviorFieldHeaderProps) {
  return (
    <div className="profile-field-header">
      <label htmlFor={inputId} className="profile-field-label">
        {label}
      </label>
      <FieldHelpButton helperKey={helperKey} />
    </div>
  );
}

export default BehaviorFieldHeader;
