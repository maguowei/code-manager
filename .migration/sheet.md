# sheet

2026-09-19，transformation engine（legacy `new-york`，无 base 对照风格）。

Sheet 本就是基于 dialog 原语封装的侧边抽屉，迁移时复用 `@base-ui/react/dialog`。

## Changed

- `src/components/ui/sheet.tsx`：改用 `@base-ui/react/dialog`；`Overlay` → `Backdrop`、`Content` → `Popup`；
  在 Popup 上补 `data-side={side}` 以保留左右抽屉的位移动画类；
  开合状态类改为 `data-open` / `data-closed`，项目原有的 `slide-out-to-*` / `slide-in-from-*` 动画保留。
- 该文件在 `refactor(ui): popover 迁移到 Base UI` 提交中一并落盘（Sheet 与 Popover 共用同一个
  浮层卸载/焦点路径，分开提交会导致中间状态不可构建）。
- 残留扫描：`grep -n "radix-ui\|@radix-ui" src/components/ui/sheet.tsx` 无命中。

## Left alone

- `sheet.tsx` 的调用点（设置抽屉、会话详情抽屉、供应商一览）只使用了 Content/Header/Title 等部件名，
  未因 Base UI 而改写。

## Behavior changes

无。抽屉仍是模态：遮罩点击关闭、ESC 关闭、打开时锁定背景滚动。

## Verify by hand

1. 打开设置抽屉：从右侧滑入，ESC 与点击遮罩都能关闭。
2. 抽屉内的浮层（如帮助提示、下拉）不再被瞬间关闭——这是跨库 layer 冲突修复后的结果，
   与 popover 报告中的说明一致。
