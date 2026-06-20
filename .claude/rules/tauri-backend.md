---
paths:
  - "src-tauri/**/*"
  - "src/types.ts"
  - "src/hooks/useTauriEvent.ts"
  - "src-tauri/capabilities/default.json"
---

# Tauri Backend Rules

## 模块拓扑

| 模块 | 职责 |
| --- | --- |
| `lib.rs` | Tauri Builder 编排：插件初始化、tauri-specta command 收集与 handler、托盘、目录 watcher、usage runtime |
| `main.rs` | 二进制入口，仅调用 `ai_manager_lib::run()` |
| `utils.rs` | 公共锁、JSON 读写、原子文件写入、应用数据目录解析 |
| `config.rs` | Profile / Provider 合并落盘、`resolve_profile_settings()`、模型测试、`config-registry.json` |
| `memory.rs` | 用户级 `CLAUDE.md` 与 `rules/*.md` 的托管、导入、启停 |
| `skills.rs` | Skills 启停、`~/.codex/skills/<id>` 软链同步、`SKILL.md` 读写、文件树扫描 |
| `history.rs` | `~/.claude/history.jsonl` 读取、会话详情解析、轮询变更 |
| `stats.rs` | `~/.claude.json` 统计快照读取、项目最近会话提取 |
| `usage.rs` | Token 用量扫描、SQLite 缓存、价目表加载与刷新、增量重扫 |
| `project.rs` | 项目 Git 状态、worktree、分支/worktree 清理 preview/apply、本地数据清理 |
| `claude_directory.rs` | `~/.claude` 文件树、文件预览、创建、重命名、删除与外部打开 |
| `claude_directory_watcher.rs` | `~/.claude` 变更监听并广播 `claude-directory-changed` |
| `native_open.rs` | 默认终端 / 编辑器跨平台启动、本机检测受支持工具清单 |
| `terminal_focus.rs` | macOS 上 `pid -> tty -> AppleScript` 聚焦 Terminal.app / iTerm / Ghostty |
| `tray.rs` | 系统托盘：Profile 切换、会话视图、页面导航 |
| `logging.rs` | tauri-plugin-log 配置、日志脱敏 helper、panic hook |
| `plugins.rs` | 插件市场后端操作：触发 `claude plugin list --available --json`，让 claude 按 24h TTL 默认策略刷新插件安装数缓存（不主动删缓存、不强制刷新） |
| `macos_notifications.rs` | macOS 原生通知（`UNUserNotificationCenter`）：发待处理会话通知，点击聚焦对应会话终端 |

## 先读文件

- Tauri 命令注册：`src-tauri/src/lib.rs`
- Rust 公共工具：`src-tauri/src/utils.rs`
- Tauri capability：`src-tauri/capabilities/default.json`
- 日志与诊断：`src-tauri/src/logging.rs`

## Command 同步流程

新增或修改 Tauri command 时：

1. 在对应 Rust 模块中定义 `#[tauri::command]` + `#[specta::specta]`，返回类型要能被 Specta 导出。
2. 在 `src-tauri/src/lib.rs::build_specta_builder()` 的 `tauri_specta::collect_commands![]` 中注册。
3. 运行 `make bindings` 重新生成 `src/bindings.ts`，再运行 `make bindings-check` 防止 Rust IPC 契约和提交产物漂移。
4. 前端业务代码通过 `src/ipc.ts` 导出的 `ipc` 调用；如生成类型与现有业务类型不完全兼容，在 `src/ipc.ts` 增加窄包装，不在组件中直接 `invoke()`。
5. 同步更新 `src/types.ts`、i18n 文案和相关测试。
6. 如果涉及 Tauri 插件 API，同步检查 `src-tauri/capabilities/default.json`。

前端调用示例：

```ts
import { ipc } from "../ipc";

const workspace = await ipc.getConfigWorkspace();
```

`src/bindings.ts` 是自动生成文件，只有它允许直接导入 `@tauri-apps/api/core` 的 `invoke`。`src/ipc-usage-contract.test.ts` 会守护这个边界。

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
- 路径相关 command 必须防止符号链接、绝对路径和 `..` 路径逃逸。
- `claude_directory` 和 `project` 的文件树/预览 command 只能暴露受控目录内部内容，不能让前端绕过后端路径边界。
- 日志脱敏字段清单与日志格式规范见 `.claude/rules/projects-tray-diagnostics.md` 的「日志与诊断」一节，不要在两处维护副本。

## 用量 runtime 与 SQLite

- 用量扫描、价格刷新、watcher 增量重扫由 `usage::start_usage_runtime(app)` 在 `lib.rs::setup` 中启动；启动顺序：托盘 -> claude 目录 watcher -> usage runtime。
- SQLite 数据库文件名常量 `usage::USAGE_DB_FILENAME = "usage.db"`，由 `usage::start_usage_runtime(app)` 通过 `sqlx` 直接打开；实际文件位于 Tauri `app_config_dir()` 下的 `usage.db`。
- 新增用量字段必须同步：`USAGE_DB_SCHEMA`、初始化/迁移逻辑、`UsageRecord` struct、相关聚合 command、前端 `useUsage.ts` 和 `src/types.ts`。不要只改其中一端。
- 事件链：`claude-directory-changed` -> usage runtime 增量扫描 -> `usage-records-changed`；价格刷新成功后发出 `usage-pricing-updated`。
- WAL 模式可能在 SQLite 应用配置目录生成 `usage.db-wal` 与 `usage.db-shm`，不要把它们当应用数据目录文件备份。

## 集成测试基础设施

- 集成测试放在 `src-tauri/tests/`；共享夹具见 `tests/common/mod.rs` 中的 `IntegrationEnv`。
- `IntegrationEnv` 通过 `AI_MANAGER_HOME_OVERRIDE` / `AI_MANAGER_APP_DATA_DIR_OVERRIDE` 隔离 `~/.claude` 与应用数据目录，drop 时自动清理临时目录并还原 env。
- 需要从集成测试访问内部函数时，通过 `lib.rs` 的 `pub mod test_api` 重导出；该模块必须标记 `#[cfg(debug_assertions)]`，不得在 release 产物中暴露。
- 新增集成测试复用 `IntegrationEnv`，不要手动管理 tempdir 或直接写用户目录。

## 验证

通用命令见 `CLAUDE.md` 的「测试与验证」。前后端契约、Tauri command、capability 或 usage migration 变更至少需要 `make bindings-check`、`make build-frontend` 与 `make test-rust`；Rust 行为变更再补 `make check` 和 `make lint-rust`。
