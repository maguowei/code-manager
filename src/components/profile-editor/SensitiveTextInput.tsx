import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import "./editor-shared.css";

interface SensitiveTextInputProps {
  id: string;
  value: string;
  placeholder?: string;
  ariaLabel: string;
  showLabel: string;
  hideLabel: string;
  onChange: (nextValue: string) => void;
}

function SensitiveTextInput({
  id,
  value,
  placeholder,
  ariaLabel,
  showLabel,
  hideLabel,
  onChange,
}: SensitiveTextInputProps) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="profile-sensitive-input">
      <input
        id={id}
        aria-label={ariaLabel}
        type={visible ? "text" : "password"}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
      <button
        type="button"
        className="profile-icon-btn profile-sensitive-input-toggle"
        aria-label={visible ? hideLabel : showLabel}
        title={visible ? hideLabel : showLabel}
        onClick={() => setVisible((current) => !current)}
      >
        {visible ? (
          <EyeOff className="size-4" aria-hidden="true" />
        ) : (
          <Eye className="size-4" aria-hidden="true" />
        )}
      </button>
    </div>
  );
}

export default SensitiveTextInput;
