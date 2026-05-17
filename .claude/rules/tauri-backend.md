---
paths:
  - "src-tauri/**/*"
  - "src/types.ts"
  - "src/hooks/useTauriEvent.ts"
  - "src-tauri/capabilities/default.json"
---

# Tauri Backend Rules

## 模块拓扑

`src-tauri/src/` 下每个模块的一句话职责。改动时先定位归属，不要跨模块复制逻辑。

| 模块 | 职责 |
| --- | --- |
| `lib.rs` | Tauri Builder 编排：插件初始化、`generate_handler![]` 注册、托盘与 watcher 启动、setup hook |
| `main.rs` | 二进制入口，仅调用 `ai_manager_lib::run()` |
| `utils.rs` | 公共锁、JSON 读写、原子文件写入；新增 I/O 工具优先扩展这里 |
| `config.rs` | Profile / Preset 合并落盘、`resolve_profile_settings()`、模型测试、`config-registry.json` |
| `memory.rs` | 用户级 `CLAUDE.md` 与 `rules/*.md` 的托管、导入、启停 |
| `skills.rs` | Skills 启停、`~/.codex/skills/<id>` 软链同步、`SKILL.md` 读写、文件树扫描 |
| `history.rs` | `~/.claude/history.jsonl` 读取、会话详情解析、轮询变更 |
| `stats.rs` | `~/.claude.json` 统计快照读取、项目最近会话提取 |
| `usage.rs` | Token 用量扫描、SQLite 缓存、价目表加载与刷新、增量重扫 |
| `project.rs` | 项目 Git 状态、worktree、分支/Worktree 清理 preview/apply、本地数据清理 |
| `claude_directory.rs` + `claude_directory_watcher.rs` | `~/.claude` 文件树读写与 inotify 变更广播（`claude-directory-changed`） |
| `native_open.rs` | 默认终端 / 编辑器跨平台启动、本机检测受支持工具清单 |
| `terminal_focus.rs` | macOS 上 `pid -> tty -> AppleScript` 精确聚焦 Terminal.app / iTerm / Ghostty 的已有 tab |
| `tray.rs` | 系统托盘：Profile 切换、会话视图、页面导航 |
| `logging.rs` | tauri-plugin-log 配置、日志脱敏 helper、panic hook |

## 先读文件

- Tauri 命令注册：`src-tauri/src/lib.rs`
- Rust 公共工具：`src-tauri/src/utils.rs`
- Tauri capability：`src-tauri/capabilities/default.json`
- 日志与诊断：`src-tauri/src/logging.rs`

## Command 同步流程

新增或修改 Tauri command 时：

1. 在对应 Rust 模块中定义 `#[tauri::command]`。
2. 在 `src-tauri/src/lib.rs` 的 `generate_handler![]` 中注册。
3. 前端通过 `@tauri-apps/api/core` 的 `invoke()` 调用。
4. 同步更新 `src/types.ts`、i18n 文案和相关测试。
5. 如果涉及 Tauri 插件 API，同步检查 `src-tauri/capabilities/default.json`。

前端调用示例：

```ts
import { invoke } from "@tauri-apps/api/core";

const result = await invoke("get_config_workspace");
```

## Rust 公共工具

新增 Rust 存储逻辑时优先复用：

- `lock_config()`
- `lock_memory()`
- `lock_skills()`
- `read_json_file()`
- `read_json_file_strict()`
- `save_json_file()`
- `ensure_dir_and_write()`
- `ensure_dir_and_write_atomic()`

如果要改这些 helper 的语义，先审视所有调用方；它们属于全局基础设施。

## 后端边界

- 后端继续负责配置合并、路径校验、目录遍历安全、真实落盘和日志脱敏。
- 路径相关 command 必须继续防止符号链接、绝对路径和 `..` 路径逃逸。
- 日志脱敏字段清单与日志格式规范见 `.claude/rules/projects-tray-diagnostics.md` 的「日志与诊断」一节，不要在两处维护副本。

## 用量 runtime 与 SQLite

- 用量扫描、价格刷新、watcher 增量重扫由 `usage::start_usage_runtime(app)` 在 `lib.rs::setup` 中启动；启动顺序：托盘 -> claude 目录 watcher -> usage runtime。
- SQLite 数据库路径常量 `usage::USAGE_DB_URL = "sqlite:usage.db"`，通过 `tauri-plugin-sql` 注册：`Builder::default().add_migrations(USAGE_DB_URL, usage::sql_migrations())`。
- 新增用量字段必须同步：`usage::sql_migrations()` 增量迁移、`UsageRecord` struct、相关聚合 command、前端 `useUsage.ts` 和 `src/types.ts`。不要直接改既有迁移文件，必须追加新的迁移。
- 事件链：claude_directory_watcher 发出 `claude-directory-changed` -> usage runtime 增量扫描 -> 发出 `usage-records-changed`；价格刷新成功后发出 `usage-pricing-updated`。
- WAL 模式可能在 SQLite 应用配置目录生成 `usage.db-wal` 与 `usage.db-shm`，不要把它们当数据文件备份。

## 验证

- Rust 测试：`cd src-tauri && cargo test`
- Rust lint：`cd src-tauri && cargo clippy -- -D warnings`
- 前后端契约改动至少跑：`pnpm build` 与 `cd src-tauri && cargo test`
