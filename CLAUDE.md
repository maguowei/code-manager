# CLAUDE.md

本文件面向在本仓库中工作的编程智能体，例如 Claude Code、Codex 以及读取 `AGENTS.md` / `CLAUDE.md` 的同类代理。它是每次会话都要加载的执行手册，不是产品介绍页；产品定位、安装方式和人类读者入口在 `README.md`。

## 使用方式

- 主文件只保留每次会话都应知道的事实、硬约束、索引和验证入口，目标控制在 200 行以内。
- 细粒度规则放在 `.claude/rules/*.md`，用 `paths` frontmatter 做路径触发；不要用 `@.claude/rules/...` 把大规则 import 回本文件。
- Claude Code 会自动发现 `.claude/rules/`；若当前代理不会自动加载规则，修改相关文件前先手动阅读“规则索引”中的匹配文件。
- `AGENTS.md` 是指向本文件的软链接，不单独维护；修改 memory 布局时先读 `.claude/rules/agent-memory-layout.md`。

## 项目速览

- 项目：AI Manager，基于 Tauri 2 的 Claude Code 本地配置管理桌面应用。
- 当前版本：`0.17.0`，同时维护在 `package.json` 与 `src-tauri/tauri.conf.json`。
- 前端：React 19 + TypeScript + Vite + Tailwind CSS v4 + shadcn/ui。
- 后端：Rust + Tauri commands。
- 前端测试：Vitest（`pnpm test` 等价 `vitest run`）。
- 包管理器：`pnpm`，项目声明 `pnpm@10.33.0`；不要改用 `npm`。
- 应用标识符：`com.gotobeta.app.ai-manager`。
- 当前仓库不使用 Go、Python；如后续引入，遵守 Go 1.26、Python >= 3.14。

## 会话工作流

1. 先判断改动范围，阅读命中的 `.claude/rules/*.md`，再打开相关代码。
2. 非简单任务先用 TaskCreate 列计划，每完成一步用 TaskUpdate 标记进度；方向偏离时停下重新规划。
3. 改动前检查工作区状态；工作区可能是脏的，不要回退你没创建的改动。
4. 保持最小影响面，沿用现有模式；先找根因，不用临时绕过方案。
5. 完成前运行与改动范围匹配的验证命令，并检查 diff；没有新鲜验证证据，不要声称完成。

## 硬约束

- 代码注释使用中文。
- 所有用户可见文本必须走 `useI18n()` 的 `t()` 函数，不要硬编码中英文字符串。
- 所有前端通知优先走 `useToast()`，不要把 `console.error` 当作用户反馈。
- `pnpm check` 会执行 `biome check --write .` 并修改文件；只想做 CI 检查时用 `pnpm biome:ci`。
- 新增有层叠关系或浮层的样式时，使用 shadcn 语义变量和 shadcn 原子组件内置层级，不要硬编码十六进制色值或 z-index 数字。
- 前端视觉默认采用“均衡管理台”风格：克制、紧凑、可扫描，不做营销式 hero、大字号展示或装饰性卡片堆叠。
- Rust 新增文件读写、锁、时间、JSON 工具时，优先复用 `src-tauri/src/utils.rs`。
- 数据库设计禁止使用外键。

## 规则索引

按修改范围阅读对应规则。多个路径命中时，全部适用。

| 规则文件 | 适用范围 |
| --- | --- |
| `.claude/rules/agent-memory-layout.md` | `CLAUDE.md` 与 `.claude/rules/` 的维护规则 |
| `.claude/rules/frontend-ui.md` | React、CSS、i18n、Toast、共享 UI 约束 |
| `.claude/rules/tauri-backend.md` | Rust、Tauri command、capability、公共工具 |
| `.claude/rules/config-system.md` | Profile / Preset / settings schema / 状态行 / 官方插件 |
| `.claude/rules/memory-and-skills.md` | 记忆管理、Rules、Skills、Codex 同步 |
| `.claude/rules/history-stats-usage.md` | 历史、统计、Token 用量与费用 |
| `.claude/rules/projects-tray-diagnostics.md` | 项目管理、系统托盘、会话聚焦、日志与诊断 |

## 快速入口

- 应用壳与页面编排：`src/App.tsx`
- React 入口、全局 Provider 与错误日志：`src/main.tsx`
- 国际化：`src/i18n.ts`
- 类型契约：`src/types.ts`
- 共享 schema 与表单定义：`src/schemas/`
- 公共 hooks：`src/hooks/`
- Tailwind v4 入口与 OKLCH 主题变量：`src/index.css`
- shadcn 原子组件：`src/components/ui/`，类名拼接工具：`src/lib/utils.ts`（`cn()`）
- 字号层级常量：`src/components/typography-classes.ts`（`TYPOGRAPHY`）
- 表面样式常量：`src/components/surface-classes.ts`（`PANEL_SURFACE_CLASS` 等）
- 列表与抽屉布局常量：`src/components/layout-size-classes.ts`（`LIST_PANEL_WIDTH_CLASS` / `LIST_DETAIL_DRAWER_OFFSET_CLASS`）
- `~/.claude` 文件树预览页：`src/components/ClaudeOverviewPage.tsx`
- Tauri 命令注册：`src-tauri/src/lib.rs`
- Rust 公共工具：`src-tauri/src/utils.rs`
- 配置系统核心：`src-tauri/src/config.rs`
- 记忆管理：`src-tauri/src/memory.rs`
- Skills 管理：`src-tauri/src/skills.rs`
- 用量统计：`src-tauri/src/usage.rs`
- Tauri capability：`src-tauri/capabilities/default.json`

## 架构同步点

- 前端统一通过 `@tauri-apps/api/core` 的 `invoke()` 调 Rust command。
- command 注册权威位置是 `src-tauri/src/lib.rs`。
- 新增或修改 Tauri command 时，同步 Rust command、`generate_handler![]`、前端调用、`src/types.ts`、i18n、测试；涉及插件 API 时检查 `src-tauri/capabilities/default.json`。
- JSON Schema 是配置系统的前后端共享契约锚点。
- 配置预览、配置应用、模型测试、Provider/Preset、Skills、Memory 的真实持久化规则都在 Rust；前端负责调用与展示，不要复制后端业务逻辑。
- `StatsPage` 读取 `~/.claude.json`；`UsagePage` 扫描 `~/.claude/projects/**/*.jsonl`。两者字段相似但数据来源不同。

## 关键数据目录

| 用途 | 路径 |
| --- | --- |
| 应用数据 | `~/.config/ai-manager/` |
| Claude Code 用户目录 | `~/.claude/` |
| 可选 Codex Skills 同步 | `~/.codex/skills/` |
| 历史输入 | `~/.claude/history.jsonl` |
| 用量输入 | `~/.claude/projects/` |
| 统计输入 | `~/.claude.json` |
| 测试目录覆盖 | `AI_MANAGER_HOME_OVERRIDE`、`AI_MANAGER_APP_DATA_DIR_OVERRIDE` |

日志使用系统推荐日志目录，不放在 `~/.config/ai-manager/`。用量 SQLite 缓存使用 Tauri SQL 插件的应用配置目录，WAL 模式可能同时生成 `usage.db-wal` 与 `usage.db-shm`。

## 验证清单

按改动范围选最小充分集，但不要跳过相关验证。

本地启动桌面应用：`pnpm tauri dev`（会通过 `tauri.conf.json` 的 `beforeDevCommand` 触发 `pnpm dev`，单独跑 `pnpm dev` 只能起 Vite，没有原生壳）。`pnpm tauri build` 出生产包。新克隆仓库后 `pnpm install` 会运行 `prepare` 脚本，由 lefthook 安装 git hooks。

| 改动范围 | 命令 |
| --- | --- |
| 文档 | `git diff --check` |
| 前端 | `pnpm biome:ci`、`pnpm build`、`pnpm test` |
| Rust | `cd src-tauri && cargo test`、`cd src-tauri && cargo clippy -- -D warnings` |
| 前后端契约 | `pnpm build`、`cd src-tauri && cargo test` |

## 已知陷阱

- CodeMirror 多版本冲突会导致空白页。排查：`grep "'@codemirror/state@" pnpm-lock.yaml`，预期只有一个版本；如出现多个版本，在 `package.json` 里用 `pnpm.overrides` 统一。
- 不要自实现浮层：抽屉、设置面板、模态框、下拉菜单和 Toast 都用 shadcn `Sheet` / `Dialog` / `DropdownMenu` / `Popover` / sonner，层级由组件本身管理。
- 不要混淆 Stats 与 Usage：`StatsPage` 用 `~/.claude.json`，`UsagePage` 用 `~/.claude/projects/**/*.jsonl`。
- 不要把日志当成配置数据：日志目录由 Tauri 的 `app_log_dir()` 解析，不要迁移到 `~/.config/ai-manager/`。
- 不要相信旧文件名：当前配置 schema 是 `src/schemas/claude-settings.schema.json`。
- Tauri 事件监听器必须在组件卸载时清理；使用 `useTauriEvent` hook 而非直接调用 `listen()`，否则会内存泄漏。

## 参考阅读顺序

1. 本文件
2. 命中路径对应的 `.claude/rules/*.md`
3. `README.md`
4. `src/App.tsx`
5. `src/main.tsx`
6. `src-tauri/src/lib.rs`
7. `src-tauri/src/utils.rs`
8. 你要改的功能模块对应前后端文件
