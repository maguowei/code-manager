# 项目级 .claude/ 预览迁移到右侧 Sheet 抽屉

> Spec for: `ProjectClaudeExplorer` 重构
> Date: 2026-05-19
> Status: Draft（等待用户审阅）

## Context

`ProjectDetailPanel` 第三块「项目目录」当前 inline 嵌入 `<ProjectClaudeExplorer>`（260px 树 + flex-1 预览 + 固定 `h-[420px]`）。问题：

- 卡片本身处于 `ProjectsPage` 右列详情区，整体可用宽度约 700-900 px。inline 双栏被卡片宽度束缚，**Markdown 与代码预览过窄**：截图中一段 `# verify` 标题加 4 行说明就要换行 6 次。
- 固定 `h-[420px]` 让长文件强制滚动，并且把卡片其余信息（skills badges 等）挤到很下面。
- 与全局 `ClaudeOverviewPage` 体验割裂——后者是浸入式双栏，前者却挤在卡片里。

**目标**：把 Explorer 抽到右侧 Sheet 抽屉里（点「浏览 .claude/」打开），让预览区横向、纵向都可以舒展，与 ClaudeOverviewPage 体感一致；同时把卡片本身瘦回到状态摘要密度。

## Goals

1. 预览区从 inline（受卡片宽度限制）改为 Sheet（独立可用宽度），桌面端 ≥ 896 px、全屏高。
2. 复用 shadcn `Sheet side="right"`，与项目其它抽屉（`SettingsDrawer` 等）保持同一浮层规范。
3. 保留现有所有能力：目录树、文件预览、外部编辑器打开、`settings.json` / `settings.local.json` 一键创建。
4. 卡片本身回到「状态行 + skills badges + Trigger 按钮」的紧凑密度。

## Non-Goals

- 不改 4 个 Tauri command 的契约（`get_project_claude_directory_overview`、`get_project_claude_file_preview`、`create_project_claude_settings_file`、`open_project_claude_file_in_editor`）。
- 不引入 settings 的结构化 schema 编辑器（继续只读预览 + 外部编辑器）。
- 不在 Sheet 内实现右键菜单、删除、重命名（这些由全局 `ClaudeOverviewPage` 负责）。
- 不监听 `<project>/.claude/` 的文件系统变化（依赖用户主动操作触发的 refetch）。
- 不动后端用户级 `claude_directory.rs` 或全局 `ClaudeOverviewPage`。

## Architecture

```
ProjectDetailPanel
└── 「项目目录」块（紧凑卡片）
    ├── 标题 + 右上「浏览 .claude/」Button（Trigger）
    ├── StatusRow：.claude/ 已存在
    └── projectSkills badges 列表

       ↓ 点击 Trigger

<Sheet open=…>
  <SheetContent side="right" className="w-full sm:max-w-4xl">
    <SheetHeader>
      <SheetTitle>.claude/ — {project shortName}</SheetTitle>
      <SheetDescription>{project absolute path}</SheetDescription>
    </SheetHeader>
    <ProjectClaudeExplorerBody>
      ├── 左：240px 目录树（带 SUBTLE_SURFACE_CLASS、可滚动）
      ├── 右：flex-1 预览区
      │     ├── PreviewHeader：相对路径 + 「外部编辑器中打开」按钮
      │     └── PreviewBody：CodeMirror / MarkdownPreview / 空状态
      └── 底部：「创建 settings.json」/「创建 settings.local.json」按钮（条件渲染）
    </ProjectClaudeExplorerBody>
  </SheetContent>
</Sheet>
```

## Components

### `ProjectClaudeExplorer.tsx`（重构）

- 顶层导出**两个组件**：
  - `ProjectClaudeExplorerSheet`：负责 `<Sheet>` 包装 + open/close 状态、props 同现 `ProjectClaudeExplorer`，额外多一个 `triggerSlot`（`ReactNode`，由父组件提供按钮）。或者更干净：导出 `<Sheet>` 容器本身，让父组件用 `<SheetTrigger asChild>` 嵌按钮。
  - `ProjectClaudeExplorerBody`（内部组件，不导出）：所有现有的 tree + preview + create 逻辑。
- 推荐实现：`ProjectClaudeExplorerSheet` 接收 `open: boolean` 和 `onOpenChange: (open: boolean) => void` 由父组件控制；内部直接 `<Sheet open={open} onOpenChange={onOpenChange}>`，方便父组件复用按钮样式。

### `ProjectDetailPanel.tsx`

- 「项目目录」块的 `<h4>` 行追加右上 `<Button variant="outline" size="sm">浏览 .claude/</Button>`（与 `PairSection` 的同步按钮同样的 `outline + sm`）。
- 新增 `useState<boolean>` 管理 Sheet open；按钮 `onClick` 设 true。
- 移除现有的 inline `<ProjectClaudeExplorer>`；替换为 `<ProjectClaudeExplorerSheet open={open} onOpenChange={setOpen} project={…} … />`。

### 视觉规范

- Sheet 宽度：`w-full sm:max-w-4xl`（与项目其它 Sheet 一致：`SettingsDrawer` 用 `sm:max-w-3xl`，但 Explorer 内容需要更宽 ≈ 896 px）。
- 双栏比例：左树 `240px` 固定；右预览 `flex-1`。
- 树面板 `SUBTLE_SURFACE_CLASS` + 圆角 + 内边距，预览面板同样。
- 高度：`h-[calc(100vh-…px)]` 沿用 SheetContent 默认；树/预览各自内部滚动。

## Data Flow

1. 父组件挂载时，`ProjectDetail` 已经包含 `hasProjectClaudeDir / hasProjectClaudeSettings / hasProjectClaudeSettingsLocal`。
2. 点击「浏览 .claude/」按钮 → `setOpen(true)`。
3. `ProjectClaudeExplorerSheet` 在 `open` 由 false → true 的副作用里 fetch `get_project_claude_directory_overview`（如果 overview 已有缓存且 project 未变，可跳过）。
4. 用户选中文件 → fetch `get_project_claude_file_preview`。
5. 「创建 settings.json」按钮 → `create_project_claude_settings_file` → 成功后 toast + refetch overview + 调 `onAfterMutate?.()`（外层 `loadProjectDetail`，更新 `hasProjectClaudeSettings*`，按钮自动隐藏）。
6. 关闭 Sheet（点叉、Esc、点遮罩、点 Trigger 二次）→ `setOpen(false)`；**保留 overview / selectedPath / preview 缓存**，下次同 project 打开时秒开。
7. 切换项目 → `project` prop 变化 → 重置全部内部状态。

## Error Handling

- 沿用既有：
  - `loadOverview` 失败 → `projects.claudeExplorer.loadError` toast，Sheet 内显示空状态。
  - `preview` 失败 → `projects.claudeExplorer.previewError` toast，预览区回到「选择文件」空态。
  - `open_project_claude_file_in_editor` 失败：「未配置默认编辑器」走专属 toast key，其它走通用 `openEditorError`。
  - `create_project_claude_settings_file` 失败：toast，不关闭 Sheet。
- Sheet 关闭时不重置 isLoading/创建中状态——但点击关闭后所有 in-flight 请求要么完成要么被忽略（用 `cancelled` 标志位）。

## i18n 新增

| key | 中文 | 英文 |
| --- | --- | --- |
| `projects.claudeExplorer.openButton` | 浏览 .claude/ | Browse .claude/ |
| `projects.claudeExplorer.sheetTitle` | 项目 .claude/ 目录 | Project .claude/ directory |
| `projects.claudeExplorer.sheetDescription` | 浏览、预览并维护项目级 Claude Code 配置 | Browse, preview and maintain project-level Claude Code settings |

其它 13 个 `projects.claudeExplorer.*` key 继续复用，无需修改。

## Files to Modify

| 文件 | 改动 |
| --- | --- |
| `src/components/ProjectClaudeExplorer.tsx` | 重构：抽 `ProjectClaudeExplorerSheet`，接收 `open` / `onOpenChange`；body 仍是双栏。 |
| `src/components/ProjectDetailPanel.tsx` | 「项目目录」块加 Trigger 按钮 + Sheet open state；移除 inline 渲染。 |
| `src/i18n.ts` | 中英文新增 3 个 key。 |
| `src/components/__tests__/ProjectsPage.test.tsx` | 调整与 Explorer 相关的断言：先「点击浏览按钮」、再「在 Sheet 内点击 settings 创建按钮」。 |
| `src/components/__tests__/ProjectsPage.layout.test.ts` | 如有针对 Explorer 的 layout 断言，同步调整为 Sheet 内查询。 |

后端、`src/types.ts`、`src/components/ProjectsPage.tsx`、`src/App.test.tsx` 都**无需改动**（contract 不变）。

## Testing

- **新增** `src/components/__tests__/ProjectClaudeExplorer.test.tsx`（建议）：
  - 默认 Sheet 关闭、不调用 overview command；
  - 点击 Trigger → Sheet open → 调用 `get_project_claude_directory_overview`；
  - 选中文件 → 调用 preview command；
  - 已存在 `settings.json` → 不渲染对应创建按钮；
  - 创建失败 → toast，按钮可重试。
- **调整** 既有 `ProjectsPage.test.tsx`：
  - "shows the backend reason when creating AGENTS.md symlink fails" 不依赖 Explorer，无需改；
  - 跟 settings 创建按钮相关的测试需要先 `fireEvent.click(浏览按钮)` 再查 Sheet 内按钮。
- 保留并扩展 cargo test（已覆盖路径越权、settings 已存在、binary、512KB 截断、settings 存在性检测）。

## Verification

- `pnpm biome:ci`
- `./node_modules/.bin/tsc --noEmit -p tsconfig.json`
- `cd src-tauri && cargo test`
- `cd src-tauri && cargo clippy -- -D warnings`
- `./node_modules/.bin/vitest run`
- `./node_modules/.bin/vite build`
- 手动 `pnpm tauri dev`：
  1. 选一个 `.claude/` 存在的项目 → 「项目目录」卡片缩成「状态行 + skills + 浏览按钮」三行；
  2. 点「浏览 .claude/」→ 右侧 Sheet 滑入，宽度 ~896px、覆盖主区域；
  3. 选中 `commands/foo.md` → Markdown 渲染区域明显比之前宽（应当能 80+ 列不换行）；
  4. 选 `settings.json` → JSON 高亮预览；点「在外部编辑器中打开」跳到编辑器；
  5. `.claude/settings.json` 缺失项目：底部「创建 settings.json」按钮存在，点击 → toast 成功 → 树自动出现新节点 + 卡片底部状态由「缺失」变「已存在」；
  6. 关 Sheet 再开 → 上次选中文件还在；
  7. 切换到另一个项目 → 状态完全重置；
  8. 切换英文 UI → `Browse .claude/` 等新 key 正确显示。
