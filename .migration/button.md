# button

2026-09-19，transformation engine（legacy `new-york`，无 base 对照风格）。

Base UI 有原生 Button 原语且支持 `render`，取代 Radix 的 Slot/asChild。

## Changed

- `src/components/ui/button.tsx`：改用 `@base-ui/react/button`；
  组件签名改为 `Omit<ButtonPrimitive.Props, "className"> & VariantProps<typeof buttonVariants> & { className?: string }`，
  `buttonVariants`、`data-slot`、`data-variant`、`data-size` 全部保留。
- 四处 `asChild` 调用点改为 `render`：`ClaudeOverviewPage.tsx`（外链）、`SkillsPage.tsx`、
  `cheat-sheet/CheatSheetPage.tsx`、`profile-editor/MarketplacePluginRow.tsx`（详情展开触发器）。
- `src/components/__tests__/ui-system-contract.test.ts`：switch 的类名断言同步（与该提交一并落盘）。
- 残留扫描：`grep -rn "radix-ui\|@radix-ui\|asChild"` 对上述文件无命中。

## Left alone

- `src/components/ui/alert-dialog.tsx` 的 Action/Cancel 在本次提交中临时改用 `buttonVariants`，
  其完整迁移在 alert-dialog 报告中说明。

## Behavior changes

无。Base UI 的 Button 默认 `type="button"` 的推断与 Radix Slot 包装的实际元素一致，
项目内所有按钮本就显式传 `type`。

## Verify by hand

1. 插件行「详情」按钮仍能展开折叠区，且语义仍是 button。
2. 外链按钮（Skills 页、Cheat Sheet）点击后用系统浏览器打开。
