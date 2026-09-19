# slider

2026-09-19，transformation engine（legacy `new-york`，无 base 对照风格）。

Base UI 的 Slider 多了一层 Control，区间部件由 Range 改名为 Indicator，回调签名也有变化。

## Changed

- `src/components/ui/slider.tsx`：新增 `SliderPrimitive.Control` 层（补 `data-slot="slider-control"`
  作为指针交互与坐标换算的落点），布局类从 Root 移到 Control；
  `Range` → `Indicator`（`data-slot="slider-range"` 保持不变）；`onValueCommit` → `onValueCommitted`；
  单值场景下 `onValueChange` 直接给 `number`（Radix 给数组），新增 `firstSliderValue` 统一取首值。
- `src/components/SettingsDrawer.tsx`：三处滑块的 `onValueCommit` 改名，回调值改用 `firstSliderValue`
  （托盘标题字数、浮窗不透明度，以及 rebase 到新 main 后补上的缓存命中率告警阈值）。
- `src/components/profile-editor/AutoCompactWindowField.tsx`：一处回调取首值。
- 残留扫描：`grep -n "radix-ui\|@radix-ui"` 对上述三个文件无命中。

## Left alone

- 非 Radix 的滑块类组件（SegmentedControl、recharts 图表）未触碰。
- `EffortLevelField` 直接使用 Radix Slider 原语，不在本次改动内，在 form 那次提交中迁移。

## Behavior changes

1. 拖动过程中的 `onValueChange` 在单值场景由数组变为 number：调用点已统一用 `firstSliderValue` 取首值，
   行为不变，但外部若新增调用点需注意类型。
2. 提交事件名改为 `onValueCommitted`，语义一致（松开/键盘提交后触发）。

## Verify by hand

1. 设置抽屉里「浮窗不透明度」拖动，数值实时更新，松手后写入配置。
2. 键盘聚焦滑块后用方向键调整，Home/End 跳到两端。
3. 打开「系统通知」后拖动「缓存命中率告警阈值」，拖动中百分比实时预览，松手后写入配置。
