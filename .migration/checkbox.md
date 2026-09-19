# checkbox

2026-09-19，transformation engine（legacy `new-york`，无 base 对照风格）。

Base UI 的 Checkbox 渲染 `span` + 隐藏 `input`（Radix 为 `button`），状态属性随之改名。

## Changed

- `src/components/ui/checkbox.tsx`：改用 `@base-ui/react/checkbox`；
  `data-[state=checked]:` 改为 `data-checked:`，`disabled:` 改为 `data-disabled:`
  （元素从 button 变成 span 后 `disabled:` 伪类失效）。
- 残留扫描：`grep -n "radix-ui\|@radix-ui" src/components/ui/checkbox.tsx` 无命中。

## Left alone

- 消费者未改动：项目内没有传 `checked="indeterminate"` 的调用点
  （Base UI 把 `indeterminate` 拆成独立布尔属性）。

## Behavior changes

无。

## Verify by hand

1. 打开配置编辑器，勾选/取消勾选「停用归因」等开关，勾选态与禁用态样式正常。
2. 键盘 Tab 聚焦后按空格切换。
