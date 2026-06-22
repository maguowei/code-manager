import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { CONTROL_SURFACE_CLASS, PANEL_SURFACE_CLASS } from "./surface-classes";
import { TYPOGRAPHY } from "./typography-classes";

const EDITOR_CONTROL_SURFACE_CLASS = CONTROL_SURFACE_CLASS;

interface EditorSectionProps {
  title: string;
  children: ReactNode;
  className?: string;
}

interface EditorFieldProps {
  children: ReactNode;
  className?: string;
}

interface EditorLabelRowProps {
  children: ReactNode;
  className?: string;
}

function EditorSection({ title, children, className }: EditorSectionProps) {
  return (
    <section
      data-slot="editor-section"
      className={cn("flex flex-col gap-3 rounded-lg border p-4", PANEL_SURFACE_CLASS, className)}
    >
      <div className="-mx-4 flex flex-wrap items-center justify-between gap-3 border-b border-border/80 px-4 pb-3">
        <h3 className={TYPOGRAPHY.sectionTitle}>{title}</h3>
      </div>
      {children}
    </section>
  );
}

function EditorFieldGrid({ children, className }: EditorFieldProps) {
  return (
    <div data-slot="editor-field-grid" className={cn("grid gap-4 md:grid-cols-2", className)}>
      {children}
    </div>
  );
}

function EditorField({ children, className }: EditorFieldProps) {
  return (
    <div data-slot="editor-field" className={cn("grid gap-2", className)}>
      {children}
    </div>
  );
}

function EditorLabelRow({ children, className }: EditorLabelRowProps) {
  return <div className={cn("flex flex-wrap items-baseline gap-2", className)}>{children}</div>;
}

function EditorEnvHint({ children }: { children: ReactNode }) {
  return <span className="font-mono text-xs tracking-wide text-muted-foreground">{children}</span>;
}

function EditorDescription({ children, className }: EditorLabelRowProps) {
  return (
    <p className={cn("text-sm leading-normal text-muted-foreground", className)}>{children}</p>
  );
}

export {
  EDITOR_CONTROL_SURFACE_CLASS,
  EditorDescription,
  EditorEnvHint,
  EditorField,
  EditorFieldGrid,
  EditorLabelRow,
  EditorSection,
};
