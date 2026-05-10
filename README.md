# AI Manager

[![CI](https://github.com/maguowei/ai-manager/actions/workflows/ci.yml/badge.svg)](https://github.com/maguowei/ai-manager/actions/workflows/ci.yml)
[![Release](https://github.com/maguowei/ai-manager/actions/workflows/release.yml/badge.svg)](https://github.com/maguowei/ai-manager/actions/workflows/release.yml)

AI Manager 是一个面向 Claude Code 用户的本地桌面管理应用。它把 Profile / Preset、`~/.claude` 目录、记忆、Skills、历史、统计、Token 用量、项目状态、系统托盘和诊断日志放到一个 Tauri 2 应用里，让本地配置变得可见、可预览、可验证。

## 目录

- [解决的问题](#解决的问题)
- [核心能力](#核心能力)
- [本地数据与隐私](#本地数据与隐私)
- [下载安装](#下载安装)
- [本地开发](#本地开发)
- [验证与质量门禁](#验证与质量门禁)
- [技术栈与仓库结构](#技术栈与仓库结构)
- [贡献与反馈](#贡献与反馈)

## 解决的问题

如果你长期使用 Claude Code，通常会遇到这些问题：

- 不同项目需要不同的模型、API 地址、Token、插件组合、Hooks 和权限策略
- `~/.claude/settings.json`、`CLAUDE.md`、`rules/*.md`、Skills 分散在文件系统里，不容易整体检查
- Provider / model 配置重复，切换配置时容易漏写环境变量或覆盖用户设置
- 历史记录、使用统计、Token 花费、项目 Git 状态和 worktree 信息缺少统一入口
- 本机排障时需要快速查看脱敏后的应用日志，而不是到处找日志文件

AI Manager 的目标不是替代 Claude Code，而是为本机配置、会话数据和排障信息提供一个更安全的管理层。

## 核心能力

| 能力 | 说明 |
| --- | --- |
| `~/.claude` 总览 | 浏览、预览、编辑和定位 Claude Code 用户目录，跳过符号链接、`node_modules` 等高风险入口。 |
| Profile / Preset | 管理最终写入 `~/.claude/settings.json` 的配置层，支持环境变量、权限、Sandbox、Hooks、插件、状态行、预览、复制、模型测试和一键应用。 |
| 记忆管理 | 管理用户级 `CLAUDE.md` 与 `rules/*.md`，支持导入、启用、禁用、复制、预览和路径校验。 |
| Skills 管理 | 新建、编辑、删除、启用、禁用 Claude Code Skills，并可同步为 `~/.codex/skills/<id>` 软链接。 |
| 历史与会话 | 读取 `~/.claude/history.jsonl`，按项目和会话查看历史详情，保留文本、思考、工具调用、命令、图片和计划等内容块。 |
| 统计与最近会话 | 从 `~/.claude.json` 读取本地统计快照，展示启动次数、工具调用、Skill 使用和项目最近会话。 |
| Token 用量与费用 | 扫描 `~/.claude/projects/**/*.jsonl`，按日期、项目、会话和模型聚合 Token、缓存 Token 与费用，并用 SQLite 做增量缓存。 |
| 项目管理 | 展示仓库路径、远程地址、分支、worktree 和 `AGENTS.md` / `CLAUDE.md` 软链状态，支持打开终端、编辑器和清理本地项目数据。 |
| 系统托盘与会话聚焦 | 菜单栏显示当前 Profile 和 Claude Code 活跃会话，并尝试聚焦 Terminal.app、iTerm2 或 Ghostty 中已有的会话 tab。 |
| 设置与诊断 | 支持中英文、主题、登录启动、默认终端和编辑器、脱敏日志查看、系统信息复制和日志轮转。 |

## 本地数据与隐私

AI Manager 主要读取和写入本机文件。配置合并、目录扫描、用量聚合和日志查看都在本地完成；模型价格优先使用本地缓存和内置兜底数据，启动后会尝试从 models.dev 刷新。

### 应用管理数据

```text
~/.config/ai-manager/
  configs.json
  memories.json
  model-pricing.json
  skills-disabled/
```

### Claude Code 用户目录

```text
~/.claude/
  settings.json
  CLAUDE.md
  rules/
  skills/
  sessions/
  statusline.sh
```

### 历史、统计与用量输入

```text
~/.claude/history.jsonl
~/.claude/projects/
~/.claude.json
```

### 用量 SQLite 缓存

| 平台 | 路径 |
| --- | --- |
| macOS | `~/Library/Application Support/com.gotobeta.app.ai-manager/usage.db` |
| Linux | `$XDG_CONFIG_HOME/com.gotobeta.app.ai-manager/usage.db` 或 `~/.config/com.gotobeta.app.ai-manager/usage.db` |
| Windows | `%APPDATA%\com.gotobeta.app.ai-manager\usage.db` |

SQLite 使用 WAL 模式时，同目录可能出现 `usage.db-wal` 与 `usage.db-shm`。

### 日志文件

| 平台 | 日志目录 |
| --- | --- |
| macOS | `~/Library/Logs/com.gotobeta.app.ai-manager/` |
| Linux | `$XDG_DATA_HOME/com.gotobeta.app.ai-manager/logs/` 或 `~/.local/share/com.gotobeta.app.ai-manager/logs/` |
| Windows | `%LOCALAPPDATA%\com.gotobeta.app.ai-manager\logs\` |

当前日志文件名是 `ai-manager.log`，轮转文件形如 `ai-manager_2026-04-29_09-13-00.log`。

## 下载安装

前往 [Releases](https://github.com/maguowei/ai-manager/releases) 下载对应平台的安装包。

| 平台 | 安装包 |
| --- | --- |
| macOS (Apple Silicon / Intel) | `.dmg` |
| Windows | `.msi` / `.exe` |
| Linux | `.deb` / `.rpm` / `.AppImage` |

### macOS 注意事项

当前发布包未经过 Apple 公证。首次打开如果被系统拦截，可在终端执行：

```bash
xattr -rd com.apple.quarantine /Applications/ai-manager.app
```

## 本地开发

### 前置要求

- Node.js LTS
- `pnpm`，项目当前声明 `pnpm@10.33.0`
- Rust stable
- 满足 Tauri 2 运行所需的系统依赖

### 快速开始

```bash
make init
make dev
make build
```

也可以直接使用底层命令：

```bash
pnpm install
pnpm tauri dev
pnpm tauri build
```

构建产物默认位于 `src-tauri/target/release/bundle/`。

### 常用命令

```bash
pnpm dev              # 启动 Vite 开发服务器
pnpm build            # TypeScript 检查并构建前端
pnpm test             # 运行前端测试
pnpm biome:ci         # 前端静态检查
pnpm tauri dev        # 启动 Tauri 桌面开发模式
pnpm tauri build      # 构建 Tauri 安装包
make check            # cd src-tauri && cargo check
make test             # cargo test + pnpm test
make lint             # cd src-tauri && cargo clippy -- -D warnings
make fmt              # cd src-tauri && cargo fmt
make build-universal  # 构建 macOS universal 包
make preview          # 预览生产前端构建
```

## 验证与质量门禁

按改动范围选择最小充分验证集：

| 改动范围 | 建议命令 |
| --- | --- |
| 文档 | `git diff --check` |
| 前端 | `pnpm biome:ci`、`pnpm build`、`pnpm test` |
| Rust | `cd src-tauri && cargo test`、`cd src-tauri && cargo clippy -- -D warnings` |
| 前后端契约 | `pnpm build`、`cd src-tauri && cargo test` |

注意：`pnpm check` 会执行 `biome check --write .` 并可能改写文件；只想做 CI 检查时使用 `pnpm biome:ci`。

## 技术栈与仓库结构

### 技术栈

- 桌面壳：Tauri 2
- 前端：React 19、TypeScript、Vite、Tailwind CSS v4、shadcn/ui
- 后端：Rust、Tauri commands
- 表单与校验：react-hook-form、Zod、JSON Schema
- 编辑与预览：CodeMirror、react-markdown、@pierre/diffs、@pierre/trees
- 图表：Recharts
- 列表虚拟化：@tanstack/react-virtual
- 本地缓存：tauri-plugin-sql + SQLite
- 日志：tauri-plugin-log
- 系统集成：Tauri opener、dialog、autostart、os、notification、tray icon

### 架构边界

- `src/` 负责 UI、表单状态、i18n、Toast 和前端测试。
- `src-tauri/src/` 负责本地文件读写、配置合并、日志、统计、Token 用量扫描、系统托盘和系统集成。
- 前端统一通过 `@tauri-apps/api/core` 的 `invoke()` 调用 Rust command。
- command 注册入口是 `src-tauri/src/lib.rs`。

### 仓库结构

| 路径 | 说明 |
| --- | --- |
| `src/` | React 前端 |
| `src/components/` | 页面与复用组件 |
| `src/components/profile-editor/` | Profile 编辑器分区组件 |
| `src/components/usage/` | Token 用量会话抽屉与格式化工具 |
| `src/hooks/` | 公共 hooks |
| `src/schemas/` | 前端表单 schema 与共享 JSON Schema |
| `src-tauri/src/` | Rust 后端与 Tauri command |
| `src-tauri/resources/` | 内置 provider、模型价格和状态行脚本 |
| `src-tauri/capabilities/` | Tauri capability 配置 |
| `docs/` | 设计与计划文档 |

## 贡献与反馈

提交问题时，请尽量附上：

- 操作系统、AI Manager 版本和 Claude Code 使用场景
- 复现步骤、期望结果和实际结果
- “设置 -> 诊断 -> 查看日志”中相关的脱敏日志片段
- 如果是开发改动，请说明已运行的验证命令

## 进一步阅读

- [CLAUDE.md](./CLAUDE.md)：面向 Claude Code、Codex 等编程智能体的仓库执行手册
- [LICENSE](./LICENSE)：许可证

## License

MIT
