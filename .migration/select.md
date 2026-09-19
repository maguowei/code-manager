# select

2026-09-19，transformation engine（legacy `new-york`，无 base 对照风格）。

部件与变量大面积改名；**Base UI 不再从渲染出的选项文本推导触发器文案**，调用点必须补 `items`。

## Changed

- `src/components/ui/select.tsx`：改用 `@base-ui/react/select`。
  Content 拆为 Portal > Positioner > Popup；`Viewport` → `List`；`Label` → `GroupLabel`；
  `ScrollUp/DownButton` → `ScrollUp/DownArrow`（补 `top-0` / `bottom-0`）；`Icon` 的 `asChild` → `render`；
  `Select` 直接转发泛型 Root（`ComponentProps` 包装会丢掉 `<Value, Multiple>` 推导）；
  移除 Radix 的 `position` 属性，暴露 Positioner 的 `alignItemWithTrigger`（默认 true）。
- 变量与状态类改名：`--radix-select-content-available-height` → `--available-height`、
  `--radix-select-content-transform-origin` → `--transform-origin`、
  `data-[state=*]` → `data-open` / `data-closed`、`data-[placeholder]` → `data-placeholder`、
  `data-[disabled]` → `data-disabled`。浮层宽度用 `min-w-[max(8rem,var(--anchor-width))]`
  保留 Radix item-aligned 模式「至少与触发器同宽」的观感。
- 补 `items` 的 16 处调用点：`ProfileEditor.tsx`（供应商）、`SettingsDrawer.tsx`（LED 模式、语言、
  会话计数样式、提示音、终端、编辑器）、`BrowseMarketplaceTab.tsx`（4 个筛选项）、
  `EnabledPluginsTab.tsx`（2 个筛选项）、`PermissionsEditor.tsx`、`StructuredSettingsSections.tsx`（2 处）。
  `MarketplaceEditor.tsx` 的来源类型下拉值即标签，无需改造。
- 回调与属性适配：`onValueChange` 签名宽化为 `(value | null, eventDetails)`，各调用点补 null 兜底；
  `SettingsDrawer` 的 `textValue` 改为 Base UI 的 `label`（键盘匹配用）。
- 测试：新增 `src/components/ui/__tests__/select.test.tsx`；
  `ProfileEditor.test.tsx` 的 `chooseComboboxOption` / `comboboxOptionNames` 改为 click 打开、
  pointerdown + click 选中；`SettingsDrawer.test.tsx` 的会话计数样式用例同样补 pointerdown。
- 残留扫描：`grep -rn "radix-ui\|@radix-ui\|asChild\|textValue\|--radix"` 对 select.tsx 与 7 个消费者文件无命中。

## Left alone

- `MarketplaceEditor.tsx` 的来源类型下拉未加 `items`：选项文本与值完全相同，触发器文案不受影响。
- cmdk 的 Command 组合框、ModelComboboxField 的输入型组合框不是 Select，未触碰。

## Behavior changes

1. **触发器文案来源变化（重要）**：Base UI 的 `Select.Value` 只从 `items` / `itemToStringLabel` / value 本身取文案，
   不会读取渲染出来的 `SelectItem` 文本。缺 `items` 时会直接显示原始 value
   （例如把 `iterm2` 显示成 `iterm2` 而非 `iTerm2`）。本次为所有「值 ≠ 展示名」的调用点补了 `items`；
   `select.test.tsx` 里也留了一条用例锁住这个契约。
2. **鼠标选中需要 pointerdown 前置**：Base UI 的选项只在指针按下之后的 click 才提交选中，
   程序化触发 click 的测试必须补 `pointerdown`。真实鼠标操作不受影响。
3. `position="popper"` 属性被移除（项目内无调用点），改为 `alignItemWithTrigger={false}`。
4. 打开浮层的事件由 pointerdown 变为 click/焦点，测试助手相应调整。

## Verify by hand

1. 设置抽屉 → 默认终端 / 默认编辑器：触发器显示的是显示名（如「终端」「iTerm2」）而不是 value。
2. 打开下拉后键盘输入首字母，高亮应跳到匹配项（依赖 items/label）。
3. 配置编辑器 → 供应商下拉：选中内置供应商后触发器显示本地化名称，「自定义」项正常。
