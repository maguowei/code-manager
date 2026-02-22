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

### 🎯 即将推出
- Skills 管理

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

## 数据存储

- **应用数据**: `~/.config/ai-manager/`
  - `configs.json` - 配置列表
  - `memories.json` - 记忆列表
- **Claude 配置**: `~/.claude/`
  - `settings.json` - 当前激活的配置
  - `CLAUDE.md` - 当前启用的记忆内容

## 开发指南

详细的开发文档请参考 [CLAUDE.md](./CLAUDE.md)。

### 项目结构

```
├── src/                    # React 前端代码
│   ├── components/        # UI 组件
│   ├── App.tsx           # 主应用
│   └── types.ts          # 类型定义
├── src-tauri/            # Rust 后端代码
│   ├── src/
│   │   ├── config.rs     # 配置管理
│   │   ├── memory.rs     # 记忆管理
│   │   └── lib.rs        # Tauri 应用入口
│   └── Cargo.toml        # Rust 依赖
└── package.json          # Node.js 依赖
```

### 添加新的 Rust 命令

1. 在 `src-tauri/src/*.rs` 中定义命令函数
2. 在 `src-tauri/src/lib.rs` 的 `generate_handler![]` 中注册
3. 在前端使用 `invoke("command_name", { params })` 调用

## IDE 推荐

- [VS Code](https://code.visualstudio.com/)
  - [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode)
  - [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)

## License

MIT
