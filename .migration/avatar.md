# avatar

2026-09-19，transformation engine（legacy `new-york`，无 base 对照风格）。

Root / Image / Fallback 三个部件名与 Radix 完全一致，迁移只替换导入来源。

## Changed

- `src/components/ui/avatar.tsx`：`import { Avatar as AvatarPrimitive } from "radix-ui"` 换为
  `@base-ui/react/avatar`，一行改动，类名与 data-slot 全部保留。
- 残留扫描：`grep -n "radix-ui\|@radix-ui" src/components/ui/avatar.tsx` 无命中。

## Left alone

- 无需改动消费者。

## Behavior changes

`Fallback` 的延迟属性在 Base UI 中叫 `delay`（Radix 为 `delayMs`）。项目内没有使用该属性的调用点，
因此不涉及调用点改写；将来使用时直接写 `delay`。

## Verify by hand

1. 打开配置列表，头像图片加载失败的头像仍显示首字母兜底。
