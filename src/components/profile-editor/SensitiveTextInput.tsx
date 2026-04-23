import { useState } from "react";
import { EyeIcon, EyeOffIcon } from "../Icons";
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
        {visible ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />}
      </button>
    </div>
  );
}

export default SensitiveTextInput;
