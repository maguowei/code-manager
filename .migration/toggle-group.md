# toggle-group

2026-09-19，transformation engine（legacy `new-york`，无 base 对照风格）。

单部件原语直接调用，条目由独立的 Toggle 原语承接；`type` 属性被 `multiple` 取代。

## Changed

- `src/components/ui/toggle-group.tsx`：改用 `@base-ui/react/toggle-group`（单部件，`ToggleGroupPrimitive.Root`
  → `ToggleGroupPrimitive`）与 `@base-ui/react/toggle`（Radix 的 `ToggleGroup.Item` → `Toggle`）；
  分组状态仍通过本地 context 传递 variant/size/spacing，类名与 data-* 属性全部保留。
- 残留扫描：`grep -n "radix-ui\|@radix-ui" src/components/ui/toggle-group.tsx` 无命中。

## Left alone

- 没有改写调用点：项目内没有组件导入 `ui/toggle-group`（分段选择用项目自有的 `SegmentedControl`）。

## Behavior changes

**API 形状变化**：Radix 的 `type="single" | "multiple"` 由 Base UI 的 `multiple` 布尔取代，
且 `value` / `defaultValue` 恒为数组（`string[]`）。当前无消费者，未加兼容层；
将来接入时按数组形式传值。

## Verify by hand

（当前无调用点，先做原语冒烟）
1. 临时渲染 `<ToggleGroup multiple={false} defaultValue={["a"]}>`，确认单选互斥。
2. 键盘方向键可在组内移动焦点（roving focus 恒定开启，Radix 的 `rovingFocus={false}` 无对应）。
