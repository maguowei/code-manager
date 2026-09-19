# radio-group

2026-09-19，transformation engine（legacy `new-york`，无 base 对照风格）。

Base UI 把 radio 选项拆到独立子路径，条目由 `Radio.Root` + `Radio.Indicator` 组成。

## Changed

- `src/components/ui/radio-group.tsx`：分组改用 `@base-ui/react/radio-group`，
  条目改用 `@base-ui/react/radio` 的 `Radio.Root` / `Radio.Indicator`；
  禁用态由 `disabled:` 改为 `data-disabled:`（Root 渲染元素变化导致伪类失效）。
- 残留扫描：`grep -n "radix-ui\|@radix-ui" src/components/ui/radio-group.tsx` 无命中。

## Left alone

- 消费者未改动：设置抽屉的主题选择、MemoryEditor 的类型选择都只用到分组与条目两项能力。

## Behavior changes

无。

## Verify by hand

1. 设置抽屉 → 主题：点击三个主题选项，选中圆圈与样式切换正常。
2. 键盘方向键可在同组内移动选择。
