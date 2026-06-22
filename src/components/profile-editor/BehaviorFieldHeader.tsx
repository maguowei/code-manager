import type { ReactNode } from "react";
import FieldDocsLinkButton from "./FieldDocsLinkButton";
import FieldHelpButton from "./FieldHelpButton";

interface BehaviorFieldHeaderProps {
  label: string;
  inputId: string;
  helperKey?: string;
  /** 字段官方文档外链；存在时在帮助按钮后渲染外链按钮 */
  docsHref?: string;
  docsAriaLabel?: string;
  /** 值来源标注或重置入口（继承自供应商 / 已覆盖） */
  provenance?: ReactNode;
}

function BehaviorFieldHeader({
  label,
  inputId,
  helperKey,
  docsHref,
  docsAriaLabel,
  provenance,
}: BehaviorFieldHeaderProps) {
  return (
    <div className="flex items-center gap-2" data-slot="behavior-field-header">
      <label htmlFor={inputId} className="text-sm font-medium">
        {label}
      </label>
      <FieldHelpButton helperKey={helperKey} />
      {docsHref ? <FieldDocsLinkButton href={docsHref} ariaLabel={docsAriaLabel ?? label} /> : null}
      {provenance ? <span className="ml-auto">{provenance}</span> : null}
    </div>
  );
}

export default BehaviorFieldHeader;
