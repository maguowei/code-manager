# separator

2026-09-19，transformation engine（legacy `new-york`，无 base 对照风格）。

Base UI 的 Separator 是可直接调用的单部件，迁移只涉及导入来源、调用形式与 `decorative` 属性。

## Changed

- `src/components/ui/separator.tsx`：`SeparatorPrimitive.Root` 改为 `SeparatorPrimitive`（单部件直接调用）；
  去掉 `decorative` 参数（Radix 专有属性，Base UI 无对应），其余类名与 `data-orientation` 保留。
- 残留扫描：`grep -n "radix-ui\|@radix-ui" src/components/ui/separator.tsx` 无命中。

## Left alone

- 无需改动消费者：项目内没有传 `decorative` 的调用点，语义化默认值本就一致。

## Behavior changes

无。

## Verify by hand

1. 打开设置抽屉，各分区之间的分隔线仍为 1px 且颜色正确。
2. 竖向分隔（如工具条内）方向类仍生效（`data-orientation` 未被改写）。
