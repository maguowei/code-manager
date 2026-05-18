---
paths:
  - "src/components/ProjectsPage.tsx"
  - "src/components/ProjectDetailPanel.tsx"
  - "src/components/project-detail-utils.ts"
  - "src/components/SettingsDrawer.tsx"
  - "src/components/LogViewer.tsx"
  - "src/components/SystemInfoDialog.tsx"
  - "src/utils/logger.ts"
  - "src-tauri/src/project.rs"
  - "src-tauri/src/native_open.rs"
  - "src-tauri/src/tray.rs"
  - "src-tauri/src/terminal_focus.rs"
  - "src-tauri/src/logging.rs"
  - "src-tauri/src/config.rs"
  - "src-tauri/src/lib.rs"
  - "src-tauri/capabilities/default.json"
  - "src/i18n.ts"
---

# Projects Tray Diagnostics Rules

## 项目管理页

先读：

- `src/components/ProjectsPage.tsx`
- `src/components/ProjectDetailPanel.tsx`
- `src/components/project-detail-utils.ts`
- `src-tauri/src/project.rs`
- `src-tauri/src/native_open.rs`

约束：

- 该区域强调“操作与仓库状态”，不要退回松散的同权重卡片布局。
- 项目列表来自 `~/.claude/history.jsonl`，不要回退到 `~/.claude.json`。
- 后端通过 `git` 获取 repo root、remote、branch、worktree 信息；错误消息不要泄露敏感 remote 凭据。
- `AGENTS.md` / `.agents/skills` 与 `CLAUDE.md` / `.claude/skills` 是双向配对：任一端为真文件 / 真目录都可派生另一端的相对软链；两端都不存在、内容冲突或孤儿软链时禁止自动操作并显式提示用户手动处理。
- 打开终端或编辑器使用设置中的默认应用，统一走 `src-tauri/src/native_open.rs`，不要在具体模块里重复平台分支。
- 设置页展示的终端和编辑器来自内置支持清单 + 本机检测；不要把系统任意 App 直接列入可选项，除非同时补齐对应平台的打开命令和测试。
- 编辑器当前支持 VS Code、Cursor、Windsurf、Zed；Linux 和 Windows 依赖对应 CLI 在 `PATH` 中。
- 终端当前支持：macOS 的 Terminal.app、iTerm、Warp、Ghostty；Linux 的 `$TERMINAL` / `xdg-terminal-exec` / `x-terminal-emulator` / 常见终端、Warp CLI、Ghostty CLI；Windows 的 Windows Terminal、PowerShell、cmd。
- 如果只是调整信息展示，优先保持现有后端数据契约不变。

### 分支与 Worktree 清理

- 清理走两段式 preview/apply：分支用 `preview_project_branch_cleanup` -> `cleanup_project_branches`，worktree 用 `preview_project_worktree_cleanup` -> `cleanup_project_worktrees`；本地项目数据用 `preview_project_local_data_purge` -> `purge_project_local_data`。
- UI 必须先调用 preview 显式展示将清理的分支 / worktree / 文件列表，由用户在弹窗中确认后再调用 apply，不要把两步合并成一次调用。
- 后端只清理 preview 列表中已包含的条目，前端不要本地伪造清理项。

## 系统托盘与会话聚焦

先读：

- `src-tauri/src/tray.rs`
- `src-tauri/src/terminal_focus.rs`
- `src-tauri/src/config.rs`
- `src/components/SettingsDrawer.tsx`
- `src/i18n.ts`

约束：

- 主托盘负责 Profile 切换和页面导航；会话托盘负责 `~/.claude/sessions/*.json` 的状态摘要。
- 设置抽屉负责 UI 语言、主题、本机自启动、默认终端、默认编辑器、托盘展示和诊断入口；主题仍由 `i18n.ts` 的 localStorage 偏好控制，不属于后端 `AppPreferences`。
- 会话文件只读取普通 `.json` 文件，缺少 `pid`、`sessionId`、`cwd`、`status` 或字段为空时应跳过。
- 会话菜单项 id 需要能安全携带 `pid` 和 `cwd`；`cwd` 可能包含中文、空格、引号和 `::`。
- Terminal.app 与 iTerm2 通过 `pid -> tty -> AppleScript` 精确聚焦已有 tab。
- Ghostty 的 AppleScript 目前按 `working directory` 近似匹配，命中后直接 `focus term`；不要使用 `select tab t of w` 这类循环变量 specifier，容易触发 `-1700` 类型错误。
- 未命中或聚焦失败只记录 warn 日志，不要自动新开窗口或 tab。
- `osascript` 可能较慢，托盘点击 handler 不应阻塞 UI 事件循环。

## 日志与诊断

先读：

- `src-tauri/src/lib.rs`
- `src-tauri/src/logging.rs`
- `src/components/LogViewer.tsx`
- `src/components/SystemInfoDialog.tsx`
- `src/utils/logger.ts`
- `src-tauri/capabilities/default.json`

约束：

- 日志由 `tauri-plugin-log` 写入系统日志目录，当前文件名为 `ai-manager.log`，不要改回 `~/.config/ai-manager/`。
- 日志默认 `Info` 级别；重要操作记 `info`，可恢复异常记 `warn`，错误记 `error`。
- 日志时间使用系统本地时间，格式包含时区偏移；日志查看器按最新在上倒序显示。
- 轮转策略是单文件约 2 MB，保留 8 个轮转文件，轮转文件名形如 `ai-manager_YYYY-MM-DD_HH-MM-SS.log`。
- 一键清理调用 `clear_app_logs`：清空当前 `ai-manager.log`，删除 `ai-manager_*.log`，不要删除日志目录中的其它文件。
- 内置查看器通过 `get_app_logs` 读取日志，通过 `open_logs_dir` 打开日志目录。
- 不要记录密钥、Token、完整 settings、Memory 内容、Skill 文件内容、模型测试请求体或响应体。
- 新增日志字段时优先记录稳定标识符和状态，例如 `event=profile.apply status=ok profile_id=...`，不要记录大块业务数据。
- 系统信息对话框只展示运行环境字段并支持复制 Markdown 表格，不要加入密钥、完整路径或配置内容。
