import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";

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
    <div className="profile-sensitive-input relative flex min-w-0 items-center">
      <Input
        id={id}
        aria-label={ariaLabel}
        type={visible ? "text" : "password"}
        className="pr-10"
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="  absolute right-1 text-muted-foreground"
        aria-label={visible ? hideLabel : showLabel}
        title={visible ? hideLabel : showLabel}
        onClick={() => setVisible((current) => !current)}
      >
        {visible ? (
          <EyeOff className="size-4" aria-hidden="true" />
        ) : (
          <Eye className="size-4" aria-hidden="true" />
        )}
      </Button>
    </div>
  );
}

export default SensitiveTextInput;
