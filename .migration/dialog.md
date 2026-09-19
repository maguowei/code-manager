# dialog

2026-09-19，transformation engine（legacy `new-york`，无 base 对照风格）。

Overlay → Backdrop、Content → Popup（居中模态不需要 Positioner），关闭拦截统一并入 `onOpenChange`。

## Changed

- `src/components/ui/dialog.tsx`：改用 `@base-ui/react/dialog`；`Overlay` → `Backdrop`、`Content` → `Popup`；
  `data-[state=open|closed]:` → `data-open:` / `data-closed:`，动画仍走 tw-animate 的 animate-in/out；
  `DialogFooter` 的 `asChild` 改为 `render`。
- `src/components/MemoryPage.tsx`、`src/components/SkillsPage.tsx`：导入结果对话框禁止 ESC 与点击外部关闭，
  原 `onEscapeKeyDown` / `onPointerDownOutside` 的 `preventDefault` 改为在 `onOpenChange` 里
  调用 `eventDetails.cancel()`。
- `src/components/ProjectsPage.tsx`：两个清理对话框在清理进行中禁止关闭，同样改为 `onOpenChange` + `cancel()`。
- `src/components/ui/command.tsx`：`CommandDialog` 的 children 类型收窄（Base UI 的 Dialog 允许渲染函数，
  cmdk 只接受 ReactNode）。
- `src/components/profile-editor/ModelTestResultDialog.tsx`：调用形式适配。
- 残留扫描：`grep -rn "radix-ui\|@radix-ui"` 对上述文件无命中（command.tsx 本就不含 radix 引用）。

## Left alone

- `src/components/ui/command.tsx` 内部的 cmdk 未迁移（cmdk 不在迁移范围，其内部仍自带 Radix Dialog 传递依赖）。
- `DialogContent` 里 Close 按钮上的两个 `data-[state=open]:` 类是 shadcn 模板遗留，两个库下都不生效，原样保留。

## Behavior changes

1. 关闭拦截的写法从「事件级 preventDefault」变为「onOpenChange 里 cancel()」。行为等价，
   但 eventDetails 只能在不关闭时取消，无法在关闭后阻止状态更新。
2. 焦点管理属性改名：`onOpenAutoFocus` → `initialFocus`、`onCloseAutoFocus` → `finalFocus`
   （项目内未使用）。

## Verify by hand

1. 打开「导入记忆」对话框，按 ESC 与点击遮罩都不应关闭，点取消按钮才关闭。
2. 关闭对话框后焦点回到触发按钮。
3. 配置编辑器里的模型测试结果对话框可正常关闭。
