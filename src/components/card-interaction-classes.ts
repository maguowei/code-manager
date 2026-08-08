// 可点击卡片共享交互类:ProfilesPage 与 CodexProfilesPage 双端复用,避免样式漂移。
// 约定:交互类只承载 cursor / transition / hover / focus 提升,不含布局与表面(布局留在各页面卡片上)。

// 可点击卡片的 hover 提升(整卡可点进入编辑)
export const INTERACTIVE_CARD_CLASS =
  "cursor-pointer transition-[transform,border-color,box-shadow,opacity,background-color] duration-200 hover:-translate-y-px hover:border-primary hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

// hover / focus 展开的图标操作条(默认收起,群组 hover/focus-within 时展开)
export const CARD_ACTION_BAR_CLASS =
  "pointer-events-none mt-[-1rem] flex max-h-0 translate-y-2 flex-wrap justify-end gap-2 self-end overflow-hidden opacity-0 transition-[max-height,margin-top,opacity,transform] duration-200 group-hover:pointer-events-auto group-hover:mt-0 group-hover:max-h-12 group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:mt-0 group-focus-within:max-h-12 group-focus-within:translate-y-0 group-focus-within:opacity-100";

// 操作条内的图标按钮基础样式(删除按钮在调用处另覆写 destructive 色)
export const CARD_ACTION_BUTTON_CLASS =
  "border-border bg-muted text-foreground hover:border-primary hover:text-primary";
