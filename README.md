# AI Manager

[![CI](https://github.com/maguowei/ai-manager/actions/workflows/ci.yml/badge.svg)](https://github.com/maguowei/ai-manager/actions/workflows/ci.yml)
[![Release](https://github.com/maguowei/ai-manager/actions/workflows/release.yml/badge.svg)](https://github.com/maguowei/ai-manager/actions/workflows/release.yml)

一个用于管理 Claude Code 配置和记忆的桌面应用程序。

## 功能特性

### 📝 配置管理
- 管理多个 Claude Code 配置（API Key、模型、插件等）
- 一键切换不同配置
- 配置拖拽排序
- 配置复制和导出

### 🧠 记忆管理
- 管理 CLAUDE.md 记忆片段
- 支持多个记忆同时启用
- 自动合并记忆内容到 `~/.claude/CLAUDE.md`

### ⚙️ 通用配置
- 共享默认配置，避免重复设置
- 深度合并机制（通用配置作为基础，当前配置覆盖）
- 每个配置独立控制是否启用通用配置

### 🔌 Provider 管理
- 管理 AI API 供应商（内置 Anthropic、OpenRouter、智谱等主流 Provider）
- 支持添加自定义 Provider（配置 base URL 和模型列表）
- Provider 拖拽排序，一键恢复默认顺序

### 🎯 Skills 管理
- 管理 Claude Code Skills（slash 命令脚本）
- 启用/禁用 Skills，支持在线编辑内容
- 支持附加文件（Support Files）管理
- Skills 存储于 `~/.claude/skills/`，禁用后移至应用数据目录

### 📜 历史记录
- 浏览 `~/.claude/history.jsonl` 中的完整会话历史
- 热力图直观展示每日活跃度
- 按项目分组，支持查看单个会话的消息详情

### 📊 使用统计
- 从 `~/.claude.json` 读取 Claude Code 使用数据
- 可视化图表展示 Token 用量和会话趋势
- 快照历史追踪，支持长期趋势分析

## 下载安装

前往 [Releases](https://github.com/maguowei/ai-manager/releases) 页面下载对应平台的安装包。

| 平台 | 安装包 |
|------|--------|
| macOS (Apple Silicon / Intel) | `.dmg` |
| Windows | `.msi` 或 `.exe` |
| Linux | `.deb` / `.rpm` / `.AppImage` |

### macOS 注意事项

由于应用未经过 Apple 公证，首次打开时系统可能提示"无法打开"。在终端执行以下命令移除隔离属性后即可正常运行：

```bash
xattr -rd com.apple.quarantine /Applications/ai-manager.app
```

## 开发

### 前置要求
- Node.js LTS
- pnpm
- Rust stable

### 快速开始

```bash
# 初始化（安装依赖）
make init

# 启动开发模式
make dev

# 构建安装包
make build
```

### 其他常用命令

```bash
make check   # Rust 编译检查
make test    # 运行 Rust 单元测试
make lint    # Rust lint（cargo clippy）
make fmt     # 格式化 Rust 代码
make preview # 预览生产构建
```

生成的安装包位于 `src-tauri/target/release/bundle/` 目录。

## 技术栈

### 前端
- **React 19** - UI 框架
- **TypeScript** - 类型安全
- **Vite** - 构建工具

### 后端
- **Tauri 2.0** - 桌面应用框架
- **Rust** - 后端逻辑
- **serde** - JSON 序列化

## 开发文档

详细的项目结构、架构说明和开发指南请参考 [CLAUDE.md](./CLAUDE.md)。

## License

MIT
