# toggle

2026-09-19，transformation engine（legacy `new-york`，无 base 对照风格）。

Toggle 在 Base UI 中同样是可直接调用的单部件，只是按下态的数据属性改名为 `data-pressed`。

## Changed

- `src/components/ui/toggle.tsx`：`TogglePrimitive.Root` 改为 `TogglePrimitive`；
  `data-[state=on]:` 改为 `data-pressed:`；`toggleVariants` 与 `data-slot` 不变。
- 残留扫描：`grep -n "radix-ui\|@radix-ui" src/components/ui/toggle.tsx` 无命中。

## Left alone

- 无需改动消费者（项目内没有直接使用 Toggle 的调用点，仅通过 toggle-group 间接使用）。

## Behavior changes

无。

## Verify by hand

1. 打开设置抽屉里使用切换按钮的分区，按下态背景与文字色与迁移前一致。
