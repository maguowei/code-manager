# CLAUDE.md

本文件面向在本仓库中工作的 AI Agent，例如 Claude Code、Codex 以及读取 `AGENTS.md` / `CLAUDE.md` 的同类代理。它是执行手册，不是产品介绍页；人类用户入口在 `README.md`，完整使用说明在 `docs/user-manual.md`。

## 使用方式

- 每次会话先读本文件，再按“规则索引”读取命中路径的 `.claude/rules/*.md`。
- `CLAUDE.md` 只保留会话级事实、硬约束、规则索引和验证入口，目标控制在 200 行以内。
- 细粒度规则放在 `.claude/rules/*.md`，通过 `paths` frontmatter 触发；不要用 `@.claude/rules/...` 把大规则 import 回主文件。
- `AGENTS.md` 是指向本文件的软链接，不单独维护。
- 个人或机器特定指令放 `CLAUDE.local.md`，保持未提交；不要把本地偏好写入共享根文档。

## 项目速览

- 项目：Code Manager，基于 Tauri 2 的 Claude Code 本地配置管理桌面应用。
- 版本号同时维护在 `package.json`、`src-tauri/Cargo.toml` 与 `src-tauri/tauri.conf.json` 三处，需保持一致。
- 前端：React 19 + TypeScript + Vite + Tailwind CSS v4 + shadcn/ui。
- 后端：Rust + Tauri commands + tauri-specta 类型化 IPC。
- 表单与校验：react-hook-form + Zod + JSON Schema。
- 编辑、预览与可视化：CodeMirror、react-markdown、@pierre/diffs、@pierre/trees、Recharts、@tanstack/react-virtual。
- 本地缓存与日志：sqlx + SQLite、tauri-plugin-log。
- 包管理器：`pnpm`，项目声明 `pnpm@11.2.2`；不要改用 `npm`。
- 应用标识符：`com.gotobeta.app.code-manager`。

## 会话工作流

1. 判断改动范围，读取命中的规则文件，再打开相关代码。
2. 非简单任务先列计划；每完成一步更新状态，方向偏离时停下重新规划。
3. 改动前检查 `git status --short`；工作区可能是脏的，不要回退你没创建的改动。
4. 保持最小影响面，沿用现有模式；先找根因，不用临时绕过方案。
5. 完成前运行与改动范围匹配的验证命令，并检查 diff；没有新鲜验证证据，不要声称完成。

## 硬约束

- 代码注释使用中文。
- 所有用户可见文本必须走 `useI18n()` 的 `t()` 函数，不要硬编码中英文字符串。
- 所有前端通知优先走 `useToast()`，不要把 `console.error` 当作用户反馈。
- `pnpm check` 会执行 `biome check --write .` 并修改文件；只想做只读前端检查时用 `make lint-frontend`，只读格式检查用 `make fmt-check`。
- 新增有层叠关系或浮层的样式时，使用 shadcn 语义变量和 shadcn 原子组件内置层级，不要硬编码十六进制色值或 z-index 数字。
- 前端视觉默认采用“均衡管理台”风格：克制、紧凑、可扫描，不做营销式 hero、大字号展示或装饰性卡片堆叠。
- Rust 新增文件读写、锁、时间、JSON 工具时，优先复用 `src-tauri/src/utils.rs`。
- `package.json` 的 `prepare` 脚本会自动安装 lefthook git hooks；本地门禁分三层：`.claude/settings.json` 做会话级提醒和绕过拦截，lefthook 做 pre-commit / commit-msg / pre-push 快反馈，GitHub Actions 做远端权威检查。
- 提交信息遵守 Conventional Commits，commit-msg 与 CI 都通过 commitlint 检查；本地分支 `pre-push` 会运行 `make verify`，tag-only push 交给 release workflow 的 quality job。

## 规则索引

按修改范围阅读对应规则。多个路径命中时，全部适用。

| 规则文件 | 适用范围 |
| --- | --- |
| `.claude/rules/agent-memory-layout.md` | `CLAUDE.md`、`README.md`、`AGENTS.md` 与 `.claude/rules/` |
| `.claude/rules/frontend-ui.md` | React、CSS、i18n、Toast、共享 UI 约束 |
| `.claude/rules/tauri-backend.md` | Rust、Tauri command、capability、公共工具 |
| `.claude/rules/config-system.md` | 配置 / Provider / settings schema / 状态行 / 官方插件 |
| `.claude/rules/memory-and-skills.md` | 记忆管理、Rules、Skills、Codex 同步 |
| `.claude/rules/history-stats-usage.md` | 历史、统计、Token 用量与费用 |
| `.claude/rules/projects-tray-diagnostics.md` | 项目管理、系统托盘、会话聚焦、日志与诊断 |

## 快速入口

前端：

- 应用壳与页面编排：`src/App.tsx`
- React 入口、全局 Provider 与错误日志：`src/main.tsx`
- 国际化：`src/i18n.ts`
- 类型契约：`src/types.ts`
- IPC 包装与生成契约：`src/ipc.ts`、`src/bindings.ts`
- 共享 schema 与表单定义：`src/schemas/`
- 公共 hooks：`src/hooks/`
- 配置编辑器与结构化分区：`src/components/profile-editor/`（供应商均为内置只读，无供应商编辑器）
- `~/.claude` 共享树预览组件：`src/components/claude-overview/`
- Token 用量抽屉、骨架与格式化工具：`src/components/usage/`
- 主题与 UI token：`src/components/theme-provider.tsx`、`src/components/typography-classes.ts`、`src/components/surface-classes.ts`
- 编辑器退出保护：`src/components/editor-exit-guard.ts`、`src/components/UnsavedChangesAlertDialog.tsx`
- Vitest setup：`src/test/setup.ts`（配套 `vitest.config.ts`）

后端：

- Tauri 命令注册：`src-tauri/src/lib.rs`
- Rust 公共工具：`src-tauri/src/utils.rs`
- 配置系统核心：`src-tauri/src/config.rs`
- `~/.claude` 目录：`src-tauri/src/claude_directory.rs`、`src-tauri/src/claude_directory_watcher.rs`
- 记忆与 Skills：`src-tauri/src/memory.rs`、`src-tauri/src/skills.rs`
- 历史、统计、用量：`src-tauri/src/history.rs`、`src-tauri/src/stats.rs`、`src-tauri/src/usage.rs`
- 项目、打开本机应用、托盘：`src-tauri/src/project.rs`、`src-tauri/src/native_open.rs`、`src-tauri/src/tray.rs`
- 日志与诊断：`src-tauri/src/logging.rs`
- 内置 provider、模型价格和状态行脚本：`src-tauri/resources/`
- Tauri capability：`src-tauri/capabilities/default.json`

## 架构同步点

- IPC 权威链：Rust command 使用 `#[tauri::command]` + `#[specta::specta]`，在 `src-tauri/src/lib.rs::build_specta_builder()` 的 `tauri_specta::collect_commands![]` 注册，`src/bindings.ts` 由 `make bindings` 生成。
- 前端业务代码统一通过 `src/ipc.ts` 的 `ipc` 包装调用生成 bindings；只有自动生成的 `src/bindings.ts` 直接导入 `@tauri-apps/api/core` 的 `invoke()`。
- 新增或修改 Tauri command 时，同步 Rust command、Specta 注册、`make bindings` / `make bindings-check`、`src/ipc.ts` 兼容包装（如需）、`src/types.ts`、i18n、测试；涉及插件 API 时检查 `src-tauri/capabilities/default.json`。
- JSON Schema 是配置系统的前后端共享契约锚点。
- 配置预览、配置应用、模型测试、Provider、Skills、Memory 的真实持久化规则都在 Rust；前端负责调用与展示，不要复制后端业务逻辑。
- `ProjectsPage` 读取 `~/.claude/history.jsonl`；`StatsPage` 读取 `~/.claude.json`；`UsagePage` 扫描 `~/.claude/projects/**/*.jsonl`。三者数据源不同，不要混用。
- 用量 watcher 与 SQLite 初始化由 `usage::start_usage_runtime(app)` 在 `lib.rs::setup` 中启动；新增用量字段需要同步 `usage.rs` 的 schema / 初始化逻辑、`UsageRecord` struct、前端 `useUsage.ts` 与 `src/types.ts`。

## 关键数据目录

macOS 上同时使用三个目录，互不混用：

| 用途 | macOS | Linux | Windows |
| --- | --- | --- | --- |
| 应用数据（`config-registry.json`、`memories.json`、`model-pricing.json`、`skills-disabled/`） | `~/.config/code-manager/` | `$XDG_CONFIG_HOME/code-manager/` 或 `~/.config/code-manager/` | `%APPDATA%\code-manager\` |
| 用量 SQLite（`usage.db`、`usage.db-wal`、`usage.db-shm`） | `~/Library/Application Support/com.gotobeta.app.code-manager/` | `$XDG_CONFIG_HOME/com.gotobeta.app.code-manager/` 或 `~/.config/com.gotobeta.app.code-manager/` | `%APPDATA%\com.gotobeta.app.code-manager\` |
| 日志（`code-manager.log` 等） | `~/Library/Logs/com.gotobeta.app.code-manager/` | `$XDG_DATA_HOME/com.gotobeta.app.code-manager/logs/` 或 `~/.local/share/com.gotobeta.app.code-manager/logs/` | `%LOCALAPPDATA%\com.gotobeta.app.code-manager\logs\` |

macOS 上应用数据刻意复用 `~/.config/code-manager/`，便于跨平台备份和脚本访问；解析逻辑见 `src-tauri/src/utils.rs::get_app_data_dir()`。SQLite 走 Tauri `app_config_dir()`，日志走 Tauri 插件默认路径，不要迁回应用数据目录。

其它已知输入路径与覆盖：`~/.claude/`、`~/.codex/skills/`、`~/.claude/history.jsonl`、`~/.claude/projects/`、`~/.claude.json`、`CODE_MANAGER_HOME_OVERRIDE`、`CODE_MANAGER_APP_DATA_DIR_OVERRIDE`。

## 测试与验证

按改动范围选最小充分集；没有运行的命令不要在最终回复里说“已通过”。

| 改动范围 | 命令 |
| --- | --- |
| 文档 / rules | `git diff --check`；修改 `CLAUDE.md` 时加跑 `wc -l CLAUDE.md` |
| 前端局部 | `pnpm exec vitest run <test-file...>` |
| 前端完整 | `make lint-frontend`、`make build-frontend`、`make test-frontend` |
| Rust | `make fmt-rust-check`、`make check`、`make lint-rust`、`make test-rust` |
| 前后端契约 / IPC | `make bindings-check`、`make build-frontend`、`make test-rust`；必要时补范围内前端测试 |
| UI 视觉 | 前端命令 + 本地应用或浏览器截图核验；无法截图时说明限制 |
| 全量本地门禁 | `make verify` |

本地启动桌面应用优先用 `make dev`（底层是 `pnpm tauri dev`）；`pnpm dev` 只启动 Vite。生产包优先用 `make build`。`make fmt` 与 `pnpm check` 会改写文件，避免把它们当只读验证；纯格式检查用 `make fmt-check`。

## 已知陷阱

- CodeMirror 多版本冲突会导致空白页。排查：`grep "'@codemirror/state@" pnpm-lock.yaml`，预期只有一个版本；如出现多个版本，在 `package.json` 里用 `pnpm.overrides` 统一。
- 业务代码不要直接调用 `invoke`；新增 IPC 先更新 Specta command 集合并走 `src/ipc.ts`。`src/bindings.ts` 是生成文件，不手改。
- 不要自实现浮层：抽屉、设置面板、模态框、下拉菜单和 Toast 都用 shadcn `Sheet` / `Dialog` / `DropdownMenu` / `Popover` / sonner。
- 不要混淆 Projects、Stats 与 Usage 的数据源。
- 不要把日志当成配置数据：日志目录由 Tauri 的 `app_log_dir()` 解析。
- 当前配置 schema 是 `src/schemas/claude-settings.schema.json`。
- Tauri 事件监听器必须在组件卸载时清理；使用 `useTauriEvent` hook 而非直接调用 `listen()`。

## 参考阅读顺序

1. 本文件
2. 命中路径对应的 `.claude/rules/*.md`
3. 目标模块入口文件
4. `src/App.tsx`、`src/main.tsx`、`src-tauri/src/lib.rs`、`src-tauri/src/utils.rs`
5. 需要人类产品背景时再读 `README.md` 或 `docs/user-manual.md`
6. 涉及发版流程时阅读 `.claude/skills/release-new-version/SKILL.md`（手动触发，模型不得自动调用）
