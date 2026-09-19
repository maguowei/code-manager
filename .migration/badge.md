# badge

2026-09-19，transformation engine（legacy `new-york`，无 base 对照风格）。

Base UI 没有 Badge 原语，多态能力改由 `useRender` 的 `render` 属性承担，取代 Radix 的 Slot/asChild。

## Changed

- `src/components/ui/badge.tsx`：`Slot` 换成 `useRender` + `mergeProps`；
  组件签名改为 `useRender.ComponentProps<"span"> & VariantProps<typeof badgeVariants>`，
  通过 `defaultTagName: "span"` 保持默认渲染元素；`badgeVariants`、`data-slot`、`data-variant` 不变。
  含 `data-*` 的属性对象按 Base UI 的类型要求 cast 成 `React.ComponentProps<"span">`。
- 残留扫描：`grep -n "radix-ui\|@radix-ui" src/components/ui/badge.tsx` 无命中。

## Left alone

- 项目内的 Badge 调用点全部是静态用法（不传 asChild），因此没有调用点需要改写为 `render`。

## Behavior changes

无。`asChild` 的可用性从「传布尔」变为「传 `render` 元素」，属于 API 形状变化，不是运行时行为差异。

## Verify by hand

1. 插件列表的「已验证」徽标、市场来源徽标仍按变体着色。
2. 若新增需要包一层链接的徽标，使用 `<Badge render={<a href=.../>}>`。
