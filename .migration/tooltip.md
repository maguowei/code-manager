# tooltip

2026-09-19，transformation engine（legacy `new-york`，无 base 对照风格）。

Provider 的延迟属性改名；Content 拆成 Portal > Positioner > Popup；17 处 asChild 改写为 render。

## Changed

- `src/components/ui/tooltip.tsx`：改用 `@base-ui/react/tooltip`；
  `TooltipProvider` 的 `delayDuration` → `delay`；Content 的定位属性（side/sideOffset/align/alignOffset）
  移到 Positioner，样式、`data-slot` 与 `Arrow` 保留在 Popup；
  CSS 变量改为 `--transform-origin`；开合状态类改为 `data-open` / `data-closed`。
- 17 处 `TooltipTrigger asChild` 统一改写为 `render`（render 元素自带子节点，不再嵌 children）：
  `App.tsx`、`MemoryItem.tsx`、`ProfileEditor.tsx`、`Sidebar.tsx`、`SkillItem.tsx`、
  `UnmanagedMemoryItem.tsx`、`profile-editor/FieldDocsLinkButton.tsx`、`profile-editor/FieldHelpButton.tsx`、
  `profile-editor/MarketplacePluginRow.tsx`、`profile-editor/PermissionsEditor.tsx`。
- `src/App.test.tsx`：mock 的 `TooltipTrigger` 原先只透出 children，改为 `render ?? children`，
  否则改用 render 形式的触发器在测试里渲染为空（曾导致 13 个用例超时）。
- 残留扫描：`grep -rn "radix-ui\|@radix-ui\|asChild"` 对上述文件无命中。

## Left alone

- 非 Radix 的浮层与提示（原生 `title` 属性、toast）未触碰。

## Behavior changes

1. `skipDelayDuration`（连续悬停时的跳过延迟）在 Base UI 中不存在该概念，项目未使用。
2. `disableHoverableContent`（悬停在内容上保持显示）无对应属性，项目未使用。
3. 延迟属性名改为 `delay`，时长手感一致。

## Verify by hand

1. 侧边栏悬停图标按钮：提示出现延迟与迁移前相当，移开后消失。
2. 键盘 Tab 聚焦到带提示的按钮，提示应出现。
3. 设置抽屉内字段帮助按钮的提示可正常显示（不与抽屉的焦点管理冲突）。
