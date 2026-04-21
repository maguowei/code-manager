import { InfoIcon } from "../Icons";

interface BehaviorFieldHeaderProps {
  label: string;
  inputId: string;
  envKey?: string;
}

function BehaviorFieldHeader({ label, inputId, envKey }: BehaviorFieldHeaderProps) {
  return (
    <div className="profile-field-header">
      <label htmlFor={inputId} className="profile-field-label">
        {label}
      </label>
      {envKey ? (
        <button
          type="button"
          className="profile-field-help"
          aria-label={envKey}
          data-tooltip={envKey}
          title={envKey}
        >
          <InfoIcon />
        </button>
      ) : null}
    </div>
  );
}

export default BehaviorFieldHeader;
