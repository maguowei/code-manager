# AI Manager

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

## 安装使用

### 前置要求
- Node.js 18+
- pnpm
- Rust 1.70+

### 开发模式

```bash
# 安装依赖
pnpm install

# 启动开发服务器
pnpm tauri dev
```

### 构建应用

```bash
# 构建桌面应用安装包
pnpm tauri build
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
