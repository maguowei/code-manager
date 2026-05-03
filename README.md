# AI Manager

[![CI](https://github.com/maguowei/ai-manager/actions/workflows/ci.yml/badge.svg)](https://github.com/maguowei/ai-manager/actions/workflows/ci.yml)
[![Release](https://github.com/maguowei/ai-manager/actions/workflows/release.yml/badge.svg)](https://github.com/maguowei/ai-manager/actions/workflows/release.yml)

AI Manager 是一个面向 Claude Code 用户的桌面管理应用。它把 Profile / Preset、`~/.claude` 目录、记忆、Skills、历史、统计、项目状态和诊断日志放到一个 Tauri 2 应用里，减少手工编辑本地配置文件的风险。

## 这个项目解决什么问题

如果你长期使用 Claude Code，通常会遇到这些问题：

- 不同项目需要不同的模型、API 地址、Token、插件组合、Hooks 和权限策略
- `~/.claude/settings.json`、`CLAUDE.md`、`rules/*.md`、Skills 分散在文件系统里，不容易整体检查
- Provider / model 配置重复，切换配置时容易漏写环境变量或覆盖用户设置
- 历史记录、使用统计、项目 Git 状态和 worktree 信息缺少统一入口
- 本机排障时需要快速查看脱敏后的应用日志，而不是到处找日志文件

AI Manager 的目标是把这些高频操作变成可见、可预览、可验证的本地工作流。

## 核心能力

### `~/.claude` 目录总览

- 浏览 `~/.claude` 文件树，跳过符号链接和 `node_modules` 等高风险入口
- 预览文本、Markdown 和二进制文件状态，Markdown 默认渲染预览
- 新建、重命名、删除目录项，并可用设置中的默认编辑器打开文件
- 监听目录变化，自动刷新当前视图

### Profile 与 Preset

- Profile 表示最终写入 `~/.claude/settings.json` 的 Claude Code 用户配置
- Preset 表示可复用配置层，内置常见 provider / model 映射，也支持自定义 Preset
- Profile 可引用一个 Preset，并在其上叠加自身 `settings`
- 支持编辑环境变量、权限、Sandbox、Hooks、插件市场、启用插件和状态行
- 支持预览最终配置、复制环境变量、一键测试模型和一键应用 Profile
- 应用 Profile 时，合并逻辑由 Rust 后端统一执行，避免前端复制业务规则

### 记忆管理

- 管理用户级 `CLAUDE.md` 和 `rules/*.md`
- `CLAUDE.md` 类型同一时间只启用一个，启用后写入 `~/.claude/CLAUDE.md`
- Rules 类型可同时启用多个，分别写入 `~/.claude/rules/<path>.md`
- 保存前校验 rules 路径，避免绝对路径、反斜杠、盘符和 `..` 路径逃逸

### Skills 管理

- 管理 Claude Code Skills：新建、编辑、删除、启用、禁用
- 启用 Skill 位于 `~/.claude/skills/<id>/`
- 禁用 Skill 位于 `~/.config/ai-manager/skills-disabled/<id>/`
- 支持管理 `SKILL.md` 之外的附加文件
- 支持将 Skill 同步为 `~/.codex/skills/<id>` 软链接，便于 Codex 复用

### 历史、统计与项目

- 读取 `~/.claude/history.jsonl`，按项目和会话查看历史详情
- 从 `~/.claude.json` 读取 Claude Code 统计数据
- 统计页会明确提示数据来自本地历史快照，不是实时流式更新；点击刷新可重新读取最新本地数据
- 统计页的“项目最近会话”按项目展示最近一次会话的会话 ID、首条 Prompt 摘要、费用、时长、Token、模型明细和性能指标
- 项目最近会话区域默认展开，单个项目详情默认折叠，可点击整行展开查看详细指标
- 启动后每小时采集一次统计快照，最多保留 90 天或 500 条
- 项目页展示仓库路径、远程地址、分支、worktree 和 `AGENTS.md` / `CLAUDE.md` 软链状态
- 可用设置中的默认终端或编辑器打开项目

### 系统托盘与会话

- 主托盘可显示当前激活的 Profile，并提供常用页面快捷入口
- 会话托盘读取 `~/.claude/sessions/*.json`，在菜单栏展示 Claude Code 活跃会话状态
- 点击会话菜单项可尝试聚焦已有终端 tab，当前支持 Terminal.app、iTerm2 和 Ghostty
- Ghostty 通过 working directory 近似匹配会话；未命中时只记录日志，不会新开窗口或 tab

### 设置与诊断

- 支持中文 / English UI
- 支持设置默认终端、默认编辑器、Profile 托盘标题和会话托盘显示
- 诊断日志入口位于“设置 -> 诊断 -> 查看日志”
- 支持搜索、级别筛选、刷新、打开日志目录和一键清理
- 日志写入系统推荐日志目录，单文件约 2 MB 后轮转，默认保留 8 个轮转文件

## 数据与日志位置

### 应用数据

```text
~/.config/ai-manager/
  configs.json
  memories.json
  stats_history.json
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

### 历史与统计输入

```text
~/.claude/history.jsonl
~/.claude.json
```

### 日志文件

| 平台 | 日志目录 |
| --- | --- |
| macOS | `~/Library/Logs/com.gotobeta.app.ai-manager/` |
| Linux | `$XDG_DATA_HOME/com.gotobeta.app.ai-manager/logs/` 或 `~/.local/share/com.gotobeta.app.ai-manager/logs/` |
| Windows | `%LOCALAPPDATA%\com.gotobeta.app.ai-manager\logs\` |

当前日志文件名是 `ai-manager.log`，轮转文件形如 `ai-manager_2026-04-29_09-13-00.log`。

## 下载安装

前往 [Releases](https://github.com/maguowei/ai-manager/releases) 页面下载对应平台的安装包。

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

## 本地开发快速开始

### 前置要求

- Node.js LTS
- `pnpm`，项目当前声明 `pnpm@10.33.0`
- Rust stable
- 满足 Tauri 2 运行所需的系统依赖

### 快速开始

```bash
# 安装前端依赖并检查 Rust 工具链
make init

# 启动桌面应用开发模式
make dev

# 构建安装包
make build
```

也可以直接使用底层命令：

```bash
pnpm install
pnpm tauri dev
pnpm tauri build
```

构建产物默认位于 `src-tauri/target/release/bundle/`。

## 常用命令

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

## 验证建议

只改文档时至少执行：

```bash
git diff --check
```

涉及前端逻辑时优先执行：

```bash
pnpm biome:ci
pnpm build
pnpm test
```

涉及 Rust 逻辑时优先执行：

```bash
cd src-tauri && cargo test
cd src-tauri && cargo clippy -- -D warnings
```

涉及前后端契约时，至少覆盖 `pnpm build` 和 `cargo test`。

## 技术栈与架构

- 桌面壳：Tauri 2
- 前端：React 19、TypeScript、Vite
- 后端：Rust、Tauri commands
- 表单与校验：react-hook-form、Zod、JSON Schema
- 编辑与预览：CodeMirror、react-markdown、@pierre/diffs、@pierre/trees
- 图表：Recharts
- 日志：tauri-plugin-log

项目整体采用典型 Tauri 分层：

- `src/` 负责 UI、表单状态、i18n、Toast 和前端测试
- `src-tauri/src/` 负责本地文件读写、配置合并、日志、统计、系统托盘和系统集成
- 前端统一通过 `@tauri-apps/api/core` 的 `invoke()` 调用 Rust command
- command 注册入口是 `src-tauri/src/lib.rs`

## 仓库结构

```text
src/                    React 前端
src/components/         页面与复用组件
src/components/profile-editor/
                        Profile 编辑器分区组件
src/hooks/              公共 hooks
src/schemas/            前端表单 schema 与共享 JSON Schema
src-tauri/src/          Rust 后端与 Tauri command
src-tauri/resources/    内置 provider 和状态行脚本
src-tauri/capabilities/ Tauri capability 配置
docs/                   设计与计划文档
```

## 进一步阅读

- [CLAUDE.md](./CLAUDE.md)：面向 Claude Code、Codex 等编程智能体的仓库执行手册
- [LICENSE](./LICENSE)：许可证

## License

MIT
