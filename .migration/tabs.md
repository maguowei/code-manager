# tabs

2026-09-19，transformation engine（legacy `new-york`，无 base 对照风格）。

Trigger → Tab、Content → Panel，选中态属性改为 `data-active`；键盘激活默认值有行为差异。

## Changed

- `src/components/ui/tabs.tsx`：改用 `@base-ui/react/tabs`；
  `TabsPrimitive.Trigger` → `TabsPrimitive.Tab`、`TabsPrimitive.Content` → `TabsPrimitive.Panel`；
  选中态类由 `data-[state=active]:` 改为 `data-active:`；`tabsListVariants` 与 data-slot 保留。
- `src/components/profile-editor/__tests__/EnabledPluginsEditor.test.tsx`：5 处
  `toHaveAttribute("data-state", "active")` 改为 `toHaveAttribute("data-active")`。
- 残留扫描：`grep -rn "radix-ui\|@radix-ui\|data-state"` 对上述文件无命中。

## Left alone

- Tabs 的调用点（EnabledPluginsEditor、ModelTestResultDialog 等）未改动 props。

## Behavior changes

**键盘激活模式不同（按规则标记，未修补）**：Radix 默认 `activationMode="automatic"`，方向键移动焦点即切换面板；
Base UI 默认手动模式，方向键只移动焦点，需要空格/回车才切换。项目没有显式设置过 `activationMode`，
迁移后键盘操作手感会变化。若需恢复旧手感，给 `Tabs.List` 加 `activateOnFocus`（未默认添加，等确认）。

## Verify by hand

1. 插件编辑器的「已配置 / 浏览市场」标签页点击切换正常，选中态样式一致。
2. 键盘操作：聚焦标签后用方向键移动，确认是否需要额外按空格才切换面板，判断是否可接受。
