# AI Manager

[![CI](https://github.com/maguowei/ai-manager/actions/workflows/ci.yml/badge.svg)](https://github.com/maguowei/ai-manager/actions/workflows/ci.yml)
[![Release](https://github.com/maguowei/ai-manager/actions/workflows/release.yml/badge.svg)](https://github.com/maguowei/ai-manager/actions/workflows/release.yml)

AI Manager 是一个面向 Claude Code 用户的桌面应用，用来集中管理配置、记忆、Skills、Provider，以及历史与项目信息。

## 这个项目解决什么问题

如果你同时维护多套 Claude Code 环境，通常会遇到这些问题：

- 不同项目需要不同的 API Key、模型、插件组合
- `CLAUDE.md` 记忆片段需要频繁切换或组合
- Skills 分散在文件系统里，启用、禁用和编辑都不够直观
- 历史记录、使用统计和项目状态缺少统一入口

AI Manager 把这些能力放到同一个桌面应用里，让常见操作变成可视化管理，而不是手工改文件。

## 核心能力

### 配置管理

- 管理多套 Claude Code 配置
- 一键激活当前配置并写入 `~/.claude/settings.json`
- 支持拖拽排序、复制和预览最终配置
- 支持通用配置与当前配置的深度合并

### 记忆管理

- 管理多个 `CLAUDE.md` 记忆片段
- 支持多个记忆同时启用
- 自动合并并写回 `~/.claude/CLAUDE.md`

### Skills 管理

- 管理本地 Claude Code Skills
- 支持启用、禁用、新建、编辑、删除
- 支持附加文件管理
- 区分启用目录与禁用目录，便于状态切换

### Provider 管理

- 内置常见 Provider
- 支持添加自定义 Provider 与模型列表
- 支持排序和恢复默认顺序

### 历史与统计

- 浏览 `~/.claude/history.jsonl` 中的会话历史
- 按项目和会话查看详情
- 使用热力图和趋势视图观察活跃情况与统计数据

### 项目管理

- 查看 Claude Code 项目详情
- 查看 Git 分支、worktree、仓库状态
- 管理 `AGENTS.md` / `CLAUDE.md` 软链状态
- 一键用终端或编辑器打开项目

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
- `pnpm`
- Rust stable
- 满足 Tauri 运行所需的系统依赖

### 快速开始

```bash
# 安装前端依赖并检查 Rust 工具链
make init

# 启动桌面应用开发模式
make dev

# 构建安装包
make build
```

如果你更习惯直接使用底层命令：

```bash
pnpm install
pnpm tauri dev
pnpm tauri build
```

### 常用命令

```bash
pnpm dev              # 启动 Vite 开发服务器
pnpm build            # 前端类型检查并构建
pnpm biome:ci         # 前端静态检查
make check            # cargo check
make test             # cargo test
make lint             # cargo clippy -- -D warnings
make fmt              # cargo fmt
make preview          # 预览生产构建
```

构建产物默认位于 `src-tauri/target/release/bundle/`。

## 技术栈与架构概览

- 前端：React 19、TypeScript、Vite
- 后端：Rust、Tauri 2
- 表单与校验：react-hook-form、Zod、JSON Schema
- 图表：Recharts

项目整体是一个典型的 Tauri 架构：

- 前端负责界面、表单与交互
- Rust 负责本地文件读写、配置应用和系统集成
- 前后端通过 Tauri `invoke()` 通信

## 仓库结构

```text
src/          React 前端
src-tauri/    Rust 后端与 Tauri 配置
docs/         设计与计划文档
```

## 进一步阅读

- [CLAUDE.md](./CLAUDE.md)：面向 Claude Code、Codex 等编程智能体的仓库执行手册
- [LICENSE](./LICENSE)：许可证

## License

MIT
