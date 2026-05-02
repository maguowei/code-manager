# CLAUDE.md

本文件面向在本仓库中工作的编程智能体，例如 Claude Code、Codex 以及读取 `AGENTS.md` / `CLAUDE.md` 的同类代理。

它是仓库执行手册，不是产品介绍页。产品定位、安装方式和面向人类的阅读入口在 `README.md`。

## 项目定位与快速事实

- 项目：AI Manager，基于 Tauri 2 的 Claude Code 本地配置管理桌面应用
- 当前版本：`0.13.0`，版本号同时出现在 `package.json` 与 `src-tauri/tauri.conf.json`
- 前端：React 19 + TypeScript + Vite
- 后端：Rust + Tauri commands
- 包管理器：`pnpm`，项目声明 `pnpm@10.33.0`
- 应用标识符：`com.gotobeta.app.ai-manager`
- `AGENTS.md` 是指向本文件的软链接，不单独维护
- 当前仓库不使用 Go、Python 或 Tailwind CSS；如后续引入，遵守仓库通用约束：Go 1.26、Python >= 3.14、Tailwind CSS v4

### 关键数据目录

- 应用数据：`~/.config/ai-manager/`
  - `configs.json`
  - `memories.json`
  - `stats_history.json`
  - `skills-disabled/`
- 应用直接操作的 Claude Code 用户目录：`~/.claude/`
  - `settings.json`
  - `CLAUDE.md`
  - `rules/`
  - `skills/`
  - `statusline.sh`
- 可选 Codex 同步目录：
  - `~/.codex/skills/`
- 历史与统计输入：
  - `~/.claude/history.jsonl`
  - `~/.claude.json`
- 测试可用环境变量覆盖本机目录：
  - `AI_MANAGER_HOME_OVERRIDE`
  - `AI_MANAGER_APP_DATA_DIR_OVERRIDE`
- 应用日志：系统推荐日志目录，不放在 `~/.config/ai-manager/`
  - macOS：`~/Library/Logs/com.gotobeta.app.ai-manager/ai-manager.log`
  - Linux：`$XDG_DATA_HOME/com.gotobeta.app.ai-manager/logs/ai-manager.log` 或 `~/.local/share/com.gotobeta.app.ai-manager/logs/ai-manager.log`
  - Windows：`%LOCALAPPDATA%\com.gotobeta.app.ai-manager\logs\ai-manager.log`

## Agent 工作约束

### 通用原则

- 只做必要改动，优先最小影响面。
- 先找根因，再改代码；不要用临时绕过方案。
- 沿用现有模式，不为了“顺手优化”做无关重构。
- 工作区可能是脏的，不要回退你没创建的改动。
- 非简单任务先列计划并持续更新进度；方向偏离时停下来重新规划。
- 完成前必须有新鲜验证证据；没有运行过验证命令，不要声称完成或通过。

### 工具与代码风格

- 使用 `pnpm`，不要改用 `npm`。
- `pnpm check` 会执行 `biome check --write .` 并修改文件；只想做 CI 检查时用 `pnpm biome:ci`。
- 代码注释使用中文。
- Rust 新增文件读写、锁、时间、JSON 工具时，优先复用 `src-tauri/src/utils.rs`。
- 所有前端通知优先走 `useToast()`，不要把 `console.error` 当作用户反馈。
- 新增有层叠关系的样式时，复用 `src/styles/shared.css` 中的 z-index 变量，不要硬编码层级数值。
- 所有用户可见文本（按钮、标签、提示、空状态、错误提示等）必须走 `useI18n()` 的 `t()` 函数，不要硬编码中英文字符串。
- 复杂表单优先沿用现有 `react-hook-form + zodResolver` 或本仓库现有 JSON 编辑 hook 模式。

### 修改前先看哪里

- 应用壳与页面编排：`src/App.tsx`
- React 入口、全局 Provider 与错误日志：`src/main.tsx`
- 国际化：`src/i18n.ts`
- 类型契约：`src/types.ts`
- 共享 schema 与表单定义：`src/schemas/`
- 公共 hooks：`src/hooks/`
- 公共样式与 z-index 令牌：`src/styles/shared.css`
- Tauri 命令注册：`src-tauri/src/lib.rs`
- Rust 公共工具：`src-tauri/src/utils.rs`
- Tauri capability：`src-tauri/capabilities/default.json`
- 日志与诊断：`src-tauri/src/logging.rs`、`src/components/LogViewer.tsx`、`src/utils/logger.ts`
- 系统托盘：`src-tauri/src/tray.rs`

## 高频任务入口

### 1. 改 `~/.claude` 目录总览

先读：

- `src/components/ClaudeOverviewPage.tsx`
- `src/components/claude-overview/MarkdownPreview.tsx`
- `src-tauri/src/claude_directory.rs`
- `src/hooks/useTauriEvent.ts`
- `src-tauri/capabilities/default.json`

注意：

- 目录总览只允许访问 `~/.claude` 内的相对路径，后端必须继续校验路径边界。
- 扫描目录时跳过符号链接，避免路径逃逸。
- 预览默认最多读取 512 KiB，二进制文件只返回状态，不应强行按文本展示。
- 新增打开文件或系统操作时，同步检查 Tauri 插件权限。
- 用户反馈走 Toast，用户可见文本走 i18n。

### 2. 改 Profile / Preset / 配置持久化

项目采用 **Preset 链 -> Profile** 分层模型：Preset 是可复用配置层，Custom Preset 可通过 `basePresetId` 继承另一个 Preset；Profile 当前只引用一个 `presetId`，最终在 Preset 链之上叠加自身 `settings`。

先读：

- `src/components/ProfilesPage.tsx`
- `src/components/ProfileEditor.tsx`
- `src/components/profile-editor/`
- `src/components/PresetsPage.tsx`
- `src/components/PresetEditor.tsx`
- `src/components/config-workspace-utils.ts`
- `src/components/ProfileNameBadge.tsx`
- `src/schemas/claude-settings.schema.json`
- `src/schemas/form-fields.ts`
- `src/components/profile-editor/settings-form-registry.ts`
- `src/components/profile-editor/status-line-utils.ts`
- `src-tauri/src/config.rs`
- `src-tauri/resources/builtin-providers.json`
- `src-tauri/resources/statusline/default.sh`
- `src/types.ts`

注意：

- 配置表单不再有单独的 `ConfigEditor.tsx`；`ProfileEditor.tsx` 与 `PresetEditor.tsx` 共享 `ConfigEditor.css`、`settings-form-registry.ts` 和 profile-editor 子组件。
- `src/schemas/claude-settings.schema.json` 是 Claude settings 的共享 schema 锚点；Rust 通过 `include_str!` 加载并校验已知字段。
- `validate_settings_document()` 允许未知顶层键，但会校验 schema 已知字段的嵌套结构。
- `preview_profile`、`apply_profile` 和 `test_profile_model` 都依赖后端解析后的最终配置，前端不要复制合并逻辑。
- 合并权威逻辑是 `src-tauri/src/config.rs::resolve_profile_settings()`：先展开 Preset 链，再叠加 Profile `settings`，最后写入 `$schema`。
- 激活 Profile 最终会原子写入 `~/.claude/settings.json`，并更新 `configs.json` 的绑定状态。
- 已绑定的 Profile 被修改时，后端会重新应用到用户设置；不要绕开 `upsert_profile`。
- 新增配置字段时，通常至少要同步：
  - `src/schemas/claude-settings.schema.json`
  - `src/components/profile-editor/settings-form-registry.ts` 或对应分区组件
  - `src/components/config-workspace-utils.ts`
  - `src/types.ts`
  - `src-tauri/src/config.rs`
  - 相关 i18n 文案与测试

### 3. 改记忆管理

先读：

- `src/components/MemoryPage.tsx`
- `src/components/MemoryEditor.tsx`
- `src/components/MemoryItem.tsx`
- `src/schemas/memory-schema.ts`
- `src/schemas/memory.schema.json`
- `src-tauri/src/memory.rs`
- `src/types.ts`

注意：

- 记忆分为 `claude` 与 `rule` 两类。
- `claude` 类型同一时间只能启用一个，启用后写入 `~/.claude/CLAUDE.md`。
- `rule` 类型可同时启用多个，分别写入 `~/.claude/rules/<rulePath>`。
- Rule 路径必须是 `.md` 相对路径，不能包含绝对路径、反斜杠、盘符、`.` 或 `..`。
- 启用、禁用、删除或修改活跃 Rule 时，后端会清理旧文件；不要只改前端状态。
- 如果目标 rules 文件已存在且不是当前记忆生成的文件，后端会拒绝覆盖。

### 4. 改 Skills 管理

先读：

- `src/components/SkillsPage.tsx`
- `src/components/SkillEditor.tsx`
- `src/components/SkillItem.tsx`
- `src/schemas/skill-schema.ts`
- `src/schemas/skill-file-schema.ts`
- `src/schemas/skill.schema.json`
- `src/schemas/skill-file.schema.json`
- `src-tauri/src/skills.rs`

注意：

- 启用 Skills 放在 `~/.claude/skills/<id>/`。
- 禁用 Skills 放在 `~/.config/ai-manager/skills-disabled/<id>/`。
- Skill id 只能包含小写字母、数字和连字符。
- 扫描 Skills 时不要跟随符号链接。
- 支持文件路径必须保持在 Skill 目录内，禁止绝对路径与 `..` 路径逃逸。
- `sync_skill_to_codex` 会在 `~/.codex/skills/<id>` 创建软链接；目标已存在且不是软链接时必须拒绝覆盖。

### 5. 改历史与统计

先读：

- `src/components/HistoryPage.tsx`
- `src/components/HistoryProjectList.tsx`
- `src/components/HistorySessionList.tsx`
- `src/components/SessionDetailDrawer.tsx`
- `src/hooks/useHistoryEntries.ts`
- `src/history-utils.ts`
- `src-tauri/src/history.rs`
- `src/components/StatsPage.tsx`
- `src-tauri/src/stats.rs`

注意：

- 历史页数据来源是 `~/.claude/history.jsonl`，前端轮询逻辑封装在 `useHistoryEntries.ts`。
- 会话详情解析在后端，保留对 command、system、thinking、tool_use、tool_result、image、plan 等块类型的兼容。
- 统计页当前读取 `~/.claude.json`。
- stats.rs 提供 `get_stats`、`get_stats_history`、`take_stats_snapshot` 三个命令。
- 定时快照由 `stats::start_snapshot_timer()` 在 `lib.rs` 的 `setup` 中启动，每小时一次，最多保留 90 天或 500 条。

### 6. 改项目管理页

先读：

- `src/components/ProjectsPage.tsx`
- `src/components/ProjectDetailPanel.tsx`
- `src/components/project-detail-utils.ts`
- `src-tauri/src/project.rs`

注意：

- 该区域强调“操作与仓库状态”，不要退回松散的同权重卡片布局。
- 后端通过 `git` 获取 repo root、remote、branch、worktree 信息；错误消息不要泄露敏感 remote 凭据。
- `AGENTS.md` 管理只应创建指向 `CLAUDE.md` 的相对软链接。
- 打开终端或编辑器使用设置中的默认应用。
- 如果只是调整信息展示，优先保持现有后端数据契约不变。

### 7. 改日志与诊断

先读：

- `src-tauri/src/lib.rs`
- `src-tauri/src/logging.rs`
- `src/components/LogViewer.tsx`
- `src/utils/logger.ts`
- `src-tauri/capabilities/default.json`

注意：

- 日志由 `tauri-plugin-log` 写入系统日志目录，当前文件名为 `ai-manager.log`，不要改回 `~/.config/ai-manager/`。
- 日志默认 `Info` 级别；重要操作记 `info`，可恢复异常记 `warn`，错误记 `error`。
- 日志时间使用系统本地时间，格式包含时区偏移；日志查看器按最新在上倒序显示。
- 轮转策略是单文件约 2 MB，保留 8 个轮转文件，轮转文件名形如 `ai-manager_YYYY-MM-DD_HH-MM-SS.log`。
- 一键清理调用 `clear_app_logs`：清空当前 `ai-manager.log`，删除 `ai-manager_*.log`，不要删除日志目录中的其它文件。
- 内置查看器通过 `get_app_logs` 读取日志，通过 `open_logs_dir` 打开日志目录。
- 不要记录密钥、Token、完整 settings、Memory 内容、Skill 文件内容、模型测试请求体或响应体。
- 新增日志字段时优先记录稳定标识符和状态，例如 `event=profile.apply status=ok profile_id=...`，不要记录大块业务数据。

### 8. 新增或修改 Tauri command

步骤：

1. 在对应 Rust 模块中定义 `#[tauri::command]`
2. 在 `src-tauri/src/lib.rs` 的 `generate_handler![]` 中注册
3. 前端通过 `@tauri-apps/api/core` 的 `invoke()` 调用
4. 同步更新 `src/types.ts`、i18n 文案和相关测试
5. 如果涉及 Tauri 插件 API，同步检查 `src-tauri/capabilities/default.json`

前端调用示例：

```ts
import { invoke } from "@tauri-apps/api/core";

const result = await invoke("get_config_workspace");
```

## 关键架构约束与同步点

### 前后端通信模型

- 前端统一通过 `invoke()` 调 Rust command。
- command 注册权威位置是 `src-tauri/src/lib.rs`。
- 如果前端能调到函数但 Rust 未注册，运行时会直接失败。
- 新增 command 后同步检查 Tauri capability；涉及插件 API 时必须确认权限已授权。

### Schema 与配置系统

当前配置链路是：

`claude-settings.schema.json` -> `settings-form-registry.ts` / profile-editor 分区组件 -> `ProfileEditor.tsx` / `PresetEditor.tsx` -> `config.rs`

约束：

- JSON Schema 是前后端共享契约的锚点。
- `settings-form-registry.ts` 定义行为与常用选项中的结构化字段。
- 专项复杂字段由 profile-editor 子组件维护，例如 Permissions、Sandbox、Hooks、Marketplace、Enabled Plugins、Status Line。
- Rust 负责最终 schema 校验、Preset 链解析、Profile 合并和落盘。
- 前端可以做编辑体验与即时校验，但不要重新实现后端合并规则。

### Preset 与 Profile 的分层应用

- Builtin Preset 来自 `src-tauri/resources/builtin-providers.json`，只读。
- Custom Preset 存入 `~/.config/ai-manager/configs.json`。
- Custom Preset 可通过 `basePresetId` 引用另一个 Preset，形成有限链；后端会检测循环引用。
- Profile 当前只保存一个 `presetId`，并在其上叠加自身 `settings`。
- 合并权威逻辑在 `src-tauri/src/config.rs::resolve_profile_settings()`。
- 预览配置调用的是后端 `preview_profile`，不要在前端另写一套合并逻辑。

### 记忆与 Skills 的落盘模型

- 激活 `claude` 记忆后，写入 `~/.claude/CLAUDE.md`，同一时间只保留一个活跃 `claude` 记忆。
- 激活 `rule` 记忆后，写入 `~/.claude/rules/<rulePath>`，可同时启用多个。
- 启用 Skills 放在 `~/.claude/skills/<id>/`。
- 禁用 Skills 放在 `~/.config/ai-manager/skills-disabled/<id>/`。
- Codex 同步是从当前 Skill 目录到 `~/.codex/skills/<id>` 的软链接。
- 目录遍历、文件名和相对路径校验必须继续防止符号链接与 `..` 路径逃逸。

### Rust 公共工具的使用边界

`src-tauri/src/utils.rs` 已提供：

- 主目录与应用数据目录获取
- JSON 文件读取与写入
- 原子写入
- 统一锁获取
- 时间戳转换
- 字符串截断

新增 Rust 存储逻辑时优先复用：

- `lock_config()`
- `lock_memory()`
- `lock_stats()`
- `lock_skills()`
- `read_json_file()`
- `read_json_file_strict()`
- `save_json_file()`
- `ensure_dir_and_write()`
- `ensure_dir_and_write_atomic()`

如果你想改这些 helper 的语义，先审视所有调用方；它们属于全局基础设施，不是局部工具。

### UI 共享约束

- 全局 `I18nProvider` 与 `ToastProvider` 在 `src/main.tsx`。
- 公共 z-index 变量在 `src/styles/shared.css`。
- 编辑器抽屉有共享样式，不要在单个页面里重新发明一套。
- 设置抽屉、模态框、下拉菜单、Toast 的层级要继续使用共享令牌。
- 复杂编辑器优先复用 `useObjectJsonEditor`、`useDocumentJsonEditor`、`useStructuredSettingsSectionState` 等现有 hook。

### 日志与诊断约束

- 日志是本机排障工具，不是审计归档；不要新增远程上传、导出或长期归档，除非需求明确。
- 前端用户反馈继续使用 `useToast()`，日志只作为排障补充。
- 前后端都要先脱敏再写日志；错误消息也要经过脱敏 helper。
- 日志查看入口保持在“设置 -> 诊断”，不要加入主侧边栏，除非产品需求明确调整。
- 日志读取只展示最近内容，避免一次性读取超大文件造成 UI 卡顿。

## 提交前验证清单

按改动范围选最小充分集，但不要跳过相关验证。

### 文档

```bash
git diff --check
```

### 前端

```bash
pnpm biome:ci
pnpm build
pnpm test
```

### Rust

```bash
cd src-tauri && cargo test
cd src-tauri && cargo clippy -- -D warnings
```

### 前后端契约

```bash
pnpm build
cd src-tauri && cargo test
```

### 常用开发命令

```bash
pnpm dev
pnpm tauri dev
pnpm tauri build
make check
make test
make lint
make fmt
make build-universal
```

## 已知陷阱

### CodeMirror 多版本冲突会导致空白页

如果 `@codemirror/state` 被安装出多个版本，运行时 `instanceof` 可能跨实例失败，最终导致 React 空白页。

排查命令：

```bash
grep "'@codemirror/state@" pnpm-lock.yaml
```

预期只有一个版本。

如果出现多个版本：

- 在 `package.json` 里使用 `pnpm.overrides` 统一版本。
- 不要用 `vite.config.ts` 的 `resolve.dedupe` 处理这个问题。

### 不要忽略共享样式层级

项目已经把抽屉、设置面板、模态框、下拉菜单和 Toast 的层级集中到 CSS 变量里。新增浮层时如果直接写死数值，后面很容易出现遮挡回归。

### 不要在前端复制后端业务逻辑

配置预览、配置应用、模型测试、Provider/Preset、Skills、Memory 的真实持久化规则都在 Rust。前端负责调用与展示，不要复制一份“看起来一样”的规则。

### 不要把日志当成配置数据

日志目录由 Tauri 的 `app_log_dir()` 解析。不要把日志文件写入、迁移到或备份到 `~/.config/ai-manager/`，避免把排障数据混进配置数据。

### 不要相信旧文件名

当前配置 schema 文件是 `src/schemas/claude-settings.schema.json`。如果遇到旧文档提到 `claude-config.schema.json`、`config-schema.ts` 或 `field-groups.ts`，先以当前仓库文件为准再修改文档。

## 参考阅读顺序

如果你是第一次接手这个仓库，推荐顺序：

1. `README.md`
2. `src/App.tsx`
3. `src/main.tsx`
4. `src-tauri/src/lib.rs`
5. `src-tauri/src/utils.rs`
6. 你要改的功能模块对应的前后端文件
