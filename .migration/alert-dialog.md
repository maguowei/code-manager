# alert-dialog

2026-09-19，transformation engine（legacy `new-york`，无 base 对照风格）。

Overlay → Backdrop、Content → Popup；Base UI 没有 Action 原语，用 Close 承接「确认即关闭」。

## Changed

- `src/components/ui/alert-dialog.tsx`：改用 `@base-ui/react/alert-dialog`；
  `Overlay` → `Backdrop`、`Content` → `Popup`（居中模态不套 Positioner）；
  开合状态类改为 `data-open` / `data-closed`。
- `AlertDialogAction` 与 `AlertDialogCancel` 都基于 `AlertDialogPrimitive.Close`，
  再通过 `render={<Button variant size />}` 渲染成按钮，保住 Radix 时代「确认即关闭」的语义。
- `src/components/ConfirmAlertDialog.tsx`：`AlertDialogDescription asChild` 改写为 `render={<div>{message}</div>}`。
- 残留扫描：`grep -rn "radix-ui\|@radix-ui\|asChild"` 对上述文件无命中。

## Left alone

- 使用 `ConfirmAlertDialog` 的业务组件未改动。

## Behavior changes

Base UI 没有独立的 Action 部件。这里把 Action 映射到 Close，受控对话框（`ConfirmAlertDialog` 总是受控）
仍会收到 `onOpenChange(false)`，行为与 Radix 一致；若将来新增「确认但不关闭」的对话框，
不能再复用 Action，需自行用 Button + 手动关闭。

## Verify by hand

1. 触发任一删除确认对话框：点「确认」关闭并执行，点「取消」关闭且不执行。
2. ESC 关闭对话框（该场景允许 ESC），焦点回到触发按钮。
