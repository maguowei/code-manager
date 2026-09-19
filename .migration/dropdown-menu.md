# dropdown-menu

2026-09-19，transformation engine（legacy `new-york`，无 base 对照风格）。

整套部件改名映射到 `@base-ui/react/menu`；当前项目内没有消费者。

## Changed

- `src/components/ui/dropdown-menu.tsx`：改用 `@base-ui/react/menu`；
  Content 拆为 Portal > Positioner > Popup（Positioner 带 `isolate z-50 outline-none`，样式盒子仍是 Popup）；
  `Label` → `GroupLabel`；`Sub` → `SubmenuRoot`；`SubTrigger` → `SubmenuTrigger`；
  菜单项指示器按类型拆分：`ItemIndicator` → `CheckboxItemIndicator` / `RadioItemIndicator`。
- 类名改名：`--radix-dropdown-menu-content-available-height` → `--available-height`、
  `--radix-dropdown-menu-content-transform-origin` → `--transform-origin`、
  `data-[state=open|closed]:` → `data-open` / `data-closed`、`data-[disabled]:` → `data-disabled:`；
  子菜单触发器展开态由 `data-[state=open]:` 改为 `data-popup-open:`。
- `SubContent` 在 Base UI 没有对应原语，用同一套 Portal > Positioner > Popup 结构承接，
  保留原 Radix SubContent 自己的类名（`shadow-lg`、`overflow-hidden` 等未被 Content 覆盖），
  子菜单默认 `align="start" alignOffset={-3} side="right" sideOffset={0}`。
- 残留扫描：`grep -n "radix-ui\|@radix-ui" src/components/ui/dropdown-menu.tsx` 无命中。

## Left alone

- 没有改写任何调用点：项目内没有组件导入 `ui/dropdown-menu`（下拉菜单均由 `ui/select`、
  `ui/popover`、`ui/context-menu` 风格的自有组件承担）。该文件仍被完整迁移，以便将来可直接使用。

## Behavior changes

**菜单项点击是否关闭菜单（按规则标记，未修补）**：Radix 的 CheckboxItem / RadioItem 选中后关闭菜单，
Base UI 的 `closeOnClick` 默认为 false，即点击勾选项后菜单保持打开。当前无消费者，实际影响为零；
若将来使用，需按产品预期显式传 `closeOnClick`。

## Verify by hand

（当前无调用点，先做原语冒烟）
1. 临时在任一页面渲染 `<DropdownMenu>`，确认菜单可打开、方向键导航、ESC 关闭。
2. 打开子菜单确认从右侧展开、父项保持高亮。
