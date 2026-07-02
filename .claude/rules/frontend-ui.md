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
- 国际化门面：`src/i18n.ts`
- 国际化资源与 locale 格式化：`src/i18n/catalogs/`、`src/i18n/format.ts`
- 类型契约：`src/types.ts`
- 共享 schema 与表单定义：`src/schemas/`
- 公共 hooks：`src/hooks/`
- 脱敏前端 logger：`src/utils/logger.ts`
- Tailwind v4 入口与 OKLCH 主题变量：`src/index.css`
- shadcn 原子组件：`src/components/ui/`
- 业务复用表单字段：`src/components/forms/`
- 共享 `~/.claude` tree/preview：`src/components/claude-overview/`
- 页面头部：`src/components/PageHeader.tsx`
- 主题、字号、表面和布局 token：`theme-provider.tsx`、`typography-classes.ts`、`surface-classes.ts`、`layout-size-classes.ts`
- 桌面用量浮窗：`src/components/widget/FloatingWidget.tsx`、`src/hooks/useWidgetUsageKpi.ts`（浮窗复用主入口、通过 `?window=widget` 只渲染浮窗组件）
- Vitest 全局 setup：`src/test/setup.ts`

## 通用约束

- 所有用户可见文本必须走 `useI18n()` 的 `t()` 函数。新增 key 时按 key 前缀放入 `src/i18n/catalogs/{zh,en}/` 的同名 namespace，并运行 `make i18n-check`。
- 带参数消息使用 `t(key, { name })`，数量消息使用 i18next `_one` / `_other` 词条；禁止翻译结果再 `.replace()` 或拼接英文复数。
- 用户显示的数字、百分比、货币、日期和排序统一复用 `src/i18n/format.ts`；HTML 日期输入、JSON、日志和持久化值继续使用稳定 ISO 格式。
- 只允许在 `scripts/check-i18n.mjs` 的集中白名单登记产品名、协议名和代码标识，每项必须说明理由。
- 所有用户反馈优先走 `useToast()`（底层 sonner），不要把 `console.error` 当作用户反馈。
- 样式使用 Tailwind v4 工具类；颜色走 shadcn 语义变量，禁止硬编码十六进制色值。
- 类名拼接走 `cn(...)`；不要手写字符串拼接。
- 字号层级统一通过 `TYPOGRAPHY.*` 获取；新增层级先扩 `typography-classes.ts` 并同步契约测试。
- 卡片、抽屉、浮层、控件背景统一使用 `surface-classes.ts` 中的命名常量和 `shadow-panel` / `shadow-toolbar` / `shadow-floating`。
- 列表/详情抽屉宽度复用 `layout-size-classes.ts` 中的常量；新增固定尺寸要说明用途并优先补源码契约测试。
- 圆角使用 `rounded-md` / `rounded-lg`，间距使用 Tailwind `gap-*` / `p-*` / `m-*`，不要回退到旧 `--space-*` / `--radius-*` 令牌。
- 图标库统一使用 `lucide-react`，按 Tailwind size 类控制尺寸。
- 复杂编辑器优先复用 `useObjectJsonEditor`、`useDocumentJsonEditor`、`useStructuredSettingsSectionState` 等现有 hook。
- 配置、Preset、Memory、Skill 这类抽屉编辑器必须暴露 `EditorExitGuard`；关闭、切换条目或跳转页面前如有 dirty draft，统一走 `UnsavedChangesAlertDialog`。

## 组件优先级

- 浮层、抽屉、菜单、Toast、模态框使用 shadcn `Sheet` / `Dialog` / `AlertDialog` / `DropdownMenu` / `Popover` / `Tooltip` / sonner，不自实现层级。
- 空状态优先用 `EmptyState`；局部复杂空状态可直接用 `src/components/ui/empty.tsx` 原子。
- 加载占位用 `Spinner` 或语义骨架；Usage 首次加载使用 `src/components/usage/UsagePageSkeleton.tsx`，不要回退到纯文字 loading。
- 表单分组用 `Field` / `FieldGroup` / `FieldLegend`；带前缀/后缀的输入用 `InputGroup`；分段选择用 `SegmentedControl`；日期选择用 shadcn `Calendar`。
- 复杂表单使用 shadcn `Form` + `react-hook-form` + `zod`；字符串列表用 `StringListField`，键值对用 `KeyValueField`。
- `FormMessage` 已内置 i18n 包装：`error.message` 直接传入 `TranslationKey` 即可。

## 共享 Viewer

- `ClaudeOverviewPage.tsx` 负责 `~/.claude` 总览页面壳。
- 目录树、文件预览、Markdown 预览和文件渲染工具放在 `src/components/claude-overview/`。
- `ProjectClaudeExplorer.tsx` 必须复用共享 tree/preview primitives，不要维护第二套自定义树和预览栈。
- 共享 viewer 依赖准备好的 `@pierre/trees` 输入、`@pierre/diffs/react` 文件渲染和 lucide 文件类型图标；改动后检查 overview 与项目详情两处行为一致。

## Sheet / Dialog 无障碍约束

- 不要手动设置 `id` + `aria-labelledby` 配对，Radix/shadcn 会通过 context 自动关联标题。
- `SheetContent` / `DialogContent` 内必须存在 `SheetTitle` / `DialogTitle`；如无可见标题，用 `className="sr-only"` 隐藏。
- 不提供 `SheetDescription` / `DialogDescription` 时，向 content 传 `aria-describedby={undefined}`。
- 描述内容不得与标题完全相同，避免屏幕阅读器重复朗读。

## 当前设计风格

- Code Manager 是本地桌面管理台，不是营销站点；第一屏直接呈现可操作信息，不做 hero、宣传文案、装饰性大图或卡片堆叠。
- 默认密度是“均衡管理台”：信息密度高但不拥挤，优先扫描、比较和重复操作。
- 页面标题用 `TYPOGRAPHY.pageTitle`，区块/卡片标题用 `sectionTitle` / `cardTitle`，正文/表格用 `body`，辅助文本、徽标、计数和标签用 `auxiliary` / `badge`。
- 不新增任意 10px/11px 字号或 hero 级数据字号；热力图、图表轴标等确有空间约束的组件必须在测试或注释中明确白名单。
- 数据密集页表格保持 `text-sm`、`px-3`、`py-2` 左右密度；列多时用稳定 `min-w-*` 加横向滚动，不压缩到文字重叠。
- 统计和用量页 KPI 不要超过 `TYPOGRAPHY.metricEmphasis`；优先让图表、表格和筛选控件保持可读。

## 测试约束

- 通用验证命令见 `CLAUDE.md` 的「测试与验证」。
- UI 体系改动要同步相关源码契约测试，例如 `typography-classes.test.ts`、`ui-system-contract.test.ts`、`size-contract.test.ts`、`drawer-width-constraints.test.ts`、`page-header-usage.test.ts`。
- 抽取或移动共享样式/token 后，检查 source-string contract test 的读文件集合，不要只断言旧入口文件。
- 测试选择器优先级：`getByRole(role, { name })` -> `getByText` / `getByLabelText` -> `[data-slot="..."]` -> 必要时 `data-testid`。不要用 class 选择作为首选断言。
- 在测试中触发 mock Tauri 事件时，必须包裹在 `act(async () => { await emitTauriEvent(...); })` 中，确保 React 状态更新落定。
