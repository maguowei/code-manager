import type { ReactNode } from "react";
import FieldHelpButton from "./FieldHelpButton";

interface BehaviorFieldHeaderProps {
  label: string;
  inputId: string;
  helperKey?: string;
  /** 值来源标注或重置入口（继承自供应商 / 已覆盖） */
  provenance?: ReactNode;
}

function BehaviorFieldHeader({ label, inputId, helperKey, provenance }: BehaviorFieldHeaderProps) {
  return (
    <div className="flex items-center gap-2" data-slot="behavior-field-header">
      <label htmlFor={inputId} className="text-sm font-medium">
        {label}
      </label>
      <FieldHelpButton helperKey={helperKey} />
      {provenance ? <span className="ml-auto">{provenance}</span> : null}
    </div>
  );
}

export default BehaviorFieldHeader;
