---
paths:
  - "src/**/*.{ts,tsx,css}"
  - "src/schemas/**/*"
  - "src/styles/**/*"
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
- 公共样式与 z-index 令牌：`src/styles/shared.css`

## 通用约束

- 所有用户可见文本（按钮、标签、提示、空状态、错误提示等）必须走 `useI18n()` 的 `t()` 函数。
- 所有用户反馈优先走 `useToast()`，不要把 `console.error` 当作用户反馈。
- 新增浮层、抽屉、菜单、Toast 或模态框时复用 `src/styles/shared.css` 中的 z-index 变量。
- 复杂表单优先沿用现有 `react-hook-form + zodResolver` 或 profile-editor 的 JSON 编辑 hook 模式。
- 主题仍由 `src/i18n.ts` 的 localStorage 偏好控制，不属于后端 `AppPreferences`。

## UI 共享约束

- 全局 `I18nProvider` 与 `ToastProvider` 在 `src/main.tsx`。
- 编辑器抽屉有共享样式，不要在单个页面重新发明一套。
- 设置抽屉、模态框、下拉菜单、Toast 的层级要继续使用共享令牌。
- 复杂编辑器优先复用 `useObjectJsonEditor`、`useDocumentJsonEditor`、`useStructuredSettingsSectionState` 等现有 hook。

## 测试与命令

- 前端静态检查：`pnpm biome:ci`
- 前端构建：`pnpm build`
- 前端测试：`pnpm test`
- 注意：`pnpm check` 会执行 `biome check --write .` 并修改文件。
