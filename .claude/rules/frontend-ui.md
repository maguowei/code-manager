---
paths:
  - "src/**/*.{ts,tsx,css}"
  - "src/schemas/**/*"
  - "src/i18n.ts"
  - "src/main.tsx"
  - "src/App.tsx"
  - "package.json"
  - "vite.config.ts"
  - "vitest.config.ts"
  - "biome.json"
---

# Frontend UI Rules

## 先读文件

- 应用壳与页面编排：`src/App.tsx`
- React 入口、全局 Provider 与错误日志：`src/main.tsx`
- 国际化：`src/i18n.ts`
- 类型契约：`src/types.ts`
- 共享 schema 与表单定义：`src/schemas/`
- 公共 hooks：`src/hooks/`
- Tailwind v4 入口与 OKLCH 主题变量：`src/index.css`
- shadcn 原子组件：`src/components/ui/`
- 业务复用表单字段：`src/components/forms/`
- 主题状态管理：`src/components/theme-provider.tsx`

## 通用约束

- 所有用户可见文本（按钮、标签、提示、空状态、错误提示等）必须走 `useI18n()` 的 `t()` 函数。
- 所有用户反馈优先走 `useToast()`（底层 sonner），不要把 `console.error` 当作用户反馈。
- 样式使用 Tailwind v4 工具类；颜色一律走 shadcn 语义变量（`bg-background` / `text-foreground` / `text-muted-foreground` / `bg-primary` / `text-destructive` / `border` 等），禁止硬编码十六进制色值。
- 圆角使用 `rounded-md`/`rounded-lg`，间距使用 Tailwind `gap-*` / `p-*` / `m-*`，不要再用 `--space-*` / `--radius-*` 旧令牌。
- 类名拼接走 `cn(...)`（来自 `@/lib/utils`）；不要手写字符串拼接。
- 浮层、抽屉、菜单、Toast、模态框一律使用 shadcn `Sheet` / `Dialog` / `AlertDialog` / `DropdownMenu` / `Popover` / `Tooltip` / sonner 等原子，不再自实现。
- 复杂表单使用 shadcn `Form` + `FormField` + `FormItem` + `FormLabel` + `FormControl` + `FormMessage` + `react-hook-form` + `zod`；字符串列表用 `<StringListField>`，键值对用 `<KeyValueField>`。
- `FormMessage` 已内置 i18n 包装：`error.message` 直接传入 `TranslationKey` 即可。
- 主题状态由 `ThemeProvider` 管理（`useTheme()`）；Dark mode 使用 `<html>.dark` class 切换；持久化键 `ai-manager.theme`。
- CodeMirror 主题用 `useCodeMirrorTheme()`；其他需要响应主题的逻辑用 `useIsDark()`。
- 图标库统一使用 `lucide-react`，按 Tailwind size 类（`size-3.5` / `size-4` / `size-5` / `size-6`）控制尺寸。
- 复杂编辑器优先复用 `useObjectJsonEditor`、`useDocumentJsonEditor`、`useStructuredSettingsSectionState` 等现有 hook。

## UI 共享约束

- 全局 `ThemeProvider` / `I18nProvider` 在 `src/main.tsx`。
- `App.tsx` 顶层挂 `<TooltipProvider>` 与 sonner `<Toaster>`。
- 编辑器抽屉一律 `<Sheet side="right">`，内部内容用 Tailwind flex 布局。

## 测试与命令

- 前端静态检查：`pnpm biome:ci`
- 前端构建：`pnpm build`
- 前端测试：`pnpm test`
- 注意：`pnpm check` 会执行 `biome check --write .` 并修改文件。

## 测试选择器优先级

1. ❌ class 选择
2. ✅ `getByRole(role, { name })`
3. ✅ `getByText` / `getByLabelText`
4. ✅ `[data-slot="..."]`（shadcn 标准）
5. ✅ `data-testid`（按需）
