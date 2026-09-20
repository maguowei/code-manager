const CONTROL_SURFACE_CLASS =
  "bg-background shadow-xs transition-[background-color,border-color] duration-150 hover:border-muted-foreground/45 hover:bg-muted focus-within:border-primary/70 focus-within:bg-background focus-within:ring-0 focus-visible:border-primary/70 focus-visible:bg-background focus-visible:ring-0";
// base-nova：面板与浮层改用 ring 描边语言（不再叠项目阴影 token），
// 与 card / dialog / popover 等 wrapper 保持一致；CONTROL 与 TOOLBAR 是项目自有模式，保留原状。
const PANEL_SURFACE_CLASS = "bg-card ring-1 ring-foreground/10";
const SUBTLE_SURFACE_CLASS = "border-border/80 bg-secondary/45 shadow-xs";
const TOOLBAR_SURFACE_CLASS = "border-border/80 bg-card/95 shadow-toolbar";
const FLOATING_SURFACE_CLASS = "bg-popover ring-1 ring-foreground/10 shadow-md";

export {
  CONTROL_SURFACE_CLASS,
  FLOATING_SURFACE_CLASS,
  PANEL_SURFACE_CLASS,
  SUBTLE_SURFACE_CLASS,
  TOOLBAR_SURFACE_CLASS,
};
