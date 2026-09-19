# scroll-area

2026-09-19，transformation engine（legacy `new-york`，无 base 对照风格）。

滚动条部件改名，其余结构一致；迁移暴露了 jsdom 的一个缺失 API。

## Changed

- `src/components/ui/scroll-area.tsx`：`ScrollAreaScrollbar` → `Scrollbar`，`ScrollAreaThumb` → `Thumb`；
  `data-orientation` 与类名保留。
- `src/test/setup.ts`：补 `Element.prototype.getAnimations ??= () => []`。
  Base UI 的 ScrollArea Viewport 会在定时器里调用 `getAnimations()`，jsdom 未实现该 API，
  不补 shim 会抛出 13 个 uncaught TypeError（测试仍可能“通过”，但日志被污染且行为不可信）。
- 残留扫描：`grep -n "radix-ui\|@radix-ui" src/components/ui/scroll-area.tsx` 无命中。

## Left alone

- 使用 ScrollArea 的业务组件未改动（滚动容器结构未变）。

## Behavior changes

无（`type="always"|"scroll"` 等 Radix 属性项目内未使用）。

## Verify by hand

1. 打开记忆/Skills 列表，内容超长时出现细滚动条，hover 时加粗。
2. 用触控板滚动，内容滚到底部无卡顿。
