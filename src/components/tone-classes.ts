export type ToneName = "success" | "warning" | "info" | "danger" | "muted";

const TONE_BADGE_CLASS: Record<ToneName, string> = {
  success: "border-success/30 bg-success/10 text-success",
  warning: "border-warning/35 bg-warning/10 text-warning",
  info: "border-info/30 bg-info/10 text-info",
  danger: "border-destructive/20 bg-destructive/10 text-destructive",
  muted: "border-border bg-muted text-muted-foreground",
};

const TONE_ALERT_CLASS: Record<ToneName, string> = {
  success: "border-success bg-success/10 text-success",
  warning: "border-warning bg-warning/10 text-warning",
  info: "border-info bg-info/10 text-info",
  danger: "border-destructive bg-destructive/10 text-destructive",
  muted: "border-border bg-muted text-muted-foreground",
};

const TONE_TEXT_CLASS: Record<ToneName, string> = {
  success: "text-success",
  warning: "text-warning",
  info: "text-info",
  danger: "text-destructive",
  muted: "text-muted-foreground",
};

const TONE_ICON_CLASS = TONE_TEXT_CLASS;

const TONE_SOLID_CLASS: Record<Exclude<ToneName, "muted">, string> = {
  success: "bg-success text-success-foreground",
  warning: "bg-warning text-warning-foreground",
  info: "bg-info text-info-foreground",
  danger: "bg-destructive text-destructive-foreground",
};

export { TONE_ALERT_CLASS, TONE_BADGE_CLASS, TONE_ICON_CLASS, TONE_SOLID_CLASS, TONE_TEXT_CLASS };
