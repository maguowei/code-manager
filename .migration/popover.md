# popover

2026-09-19，transformation engine（legacy `new-york`，无 base 对照风格）。

Content 拆成 Portal > Positioner > Popup，Base UI 没有 Anchor 部件，改用 Positioner 的 `anchor`。

## Changed

- `src/components/ui/popover.tsx`：改用 `@base-ui/react/popover`；定位属性（align/alignOffset/side/sideOffset）
  从 Content 移到 Positioner，样式与 `data-slot` 保留在 Popup；
  CSS 变量 `--radix-popover-content-transform-origin` → `--transform-origin`；
  开合状态类改为 `data-open` / `data-closed`；`PopoverContent` 额外透传 Positioner 的 `anchor`；
  `PopoverAnchor` 不再导出（Base UI 无对应部件）。
- 九处 `PopoverTrigger asChild` 改为 `render`：`SettingsDrawer.tsx`(2)、`UsagePage.tsx`(1)、
  `profile-editor/AutoCompactWindowField.tsx`(1)、`profile-editor/BrowseMarketplaceTab.tsx`(3)、
  `profile-editor/EffortLevelField.tsx`(1)、`profile-editor/ModelComboboxField.tsx`(1)。
  `SessionDetailDrawer.tsx` 同期改的是 `SheetDescription` 的 asChild，与 PopoverTrigger 无关。
- `src/components/profile-editor/ModelComboboxField.tsx`：原先用 `PopoverAnchor` 把下拉对齐整个输入组，
  改为把输入组 ref 传给 `PopoverContent` 的 `anchor`，对齐行为保持一致。
- `src/test/setup.ts` 两处测试基础设施改动（见 Behavior changes）。
- 残留扫描：`grep -rn "radix-ui\|@radix-ui\|PopoverAnchor"` 对上述文件无命中（ModelComboboxField 仍导出
  自己的 anchor 语义，但不再使用 Radix 部件）。

## Left alone

- `src/components/ui/sheet.tsx` 与 `dialog.tsx` 同期迁移，各自的报告独立成篇。
- 非 Radix 浮层（sonner toast、cmdk 命令面板）未触碰。

## Behavior changes

1. **浮层关闭后何时卸载**：Base UI 等退场动画结束才卸载节点。jsdom 不跑 CSS 动画、假定时器又会 mock
   requestAnimationFrame，导致已关闭的浮层永久残留在 DOM 中（表现为 UsagePage 日期筛选取到上一个日历）。
   测试环境置位官方开关 `BASE_UI_ANIMATIONS_DISABLED` 立即卸载；运行时不受影响。
2. **跨库 layer 冲突已消除**：Sheet 迁移后仍用 Radix Popover 时，SettingsDrawer 的帮助浮层会被瞬间关闭
   （Radix 浮层的 layer 管理与 Base UI Dialog 不互通，焦点被判为移到浮层外）。popover 迁移完成后两端同库，
   问题自行消失，没有为它做任何静默修补。
3. `PopoverAnchor` 不再可用：需要对齐非触发器元素时，改用 `anchor` 传 ref（ModelComboboxField 即此写法）。

## Verify by hand

1. 配置编辑器「默认模型」组合框：下拉应与输入组左对齐，宽度覆盖整个输入组。
2. 设置抽屉内点击字段帮助图标，浮层保持打开，可滚动内容、点击浮层内按钮。
3. 用量页日期筛选：连续打开两次日历，第二次不应与上一次重叠出现。
