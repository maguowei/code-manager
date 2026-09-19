# collapsible

2026-09-19，transformation engine（legacy `new-york`，无 base 对照风格）。

内容部件由 `Content` 改名为 `Panel`，折叠高度 CSS 变量同步改名；对外的导出名保持不变。

## Changed

- `src/components/ui/collapsible.tsx`：改用 `@base-ui/react/collapsible`，
  `CollapsiblePrimitive.Panel` 替换 `Content`，导出名仍是 `CollapsibleContent`；
  高度动画变量由 `--radix-collapsible-content-height` 改为 `--collapsible-panel-height`。
- `src/components/SessionDetailDrawer.tsx`：两处 `asChild` 改写为 `render` 属性。
- 残留扫描：`grep -n "radix-ui\|@radix-ui" src/components/ui/collapsible.tsx src/components/SessionDetailDrawer.tsx` 无命中。

## Left alone

- 其它抽屉（MemoryEditor、SkillEditor 等）用的是 accordion/自有折叠，不涉及。

## Behavior changes

无。

## Verify by hand

1. 打开会话详情抽屉，展开/收起可折叠分区，动画高度平滑、无跳变。
