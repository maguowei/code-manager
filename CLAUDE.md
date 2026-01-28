# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

这是一个基于 Tauri 2.0 的桌面应用项目，使用 React 19 + TypeScript + Vite 作为前端技术栈，Rust 作为后端。

**应用标识符**: `com.gotobeta.app.ai-manager`
**包管理器**: pnpm

## 开发命令

### 前端开发
```bash
pnpm dev              # 启动 Vite 开发服务器 (http://localhost:1420)
pnpm build            # TypeScript 编译 + 生产构建
pnpm preview          # 预览生产构建
```

### Tauri 开发
```bash
pnpm tauri dev        # 启动 Tauri 开发模式（自动运行 pnpm dev）
pnpm tauri build      # 构建桌面应用安装包（自动运行 pnpm build）
pnpm tauri --help     # 查看更多 Tauri CLI 命令
```

### Rust 后端开发
```bash
cd src-tauri
cargo build           # 编译 Rust 代码
cargo check           # 快速检查代码（不生成二进制）
cargo clippy          # 运行 Rust linter
cargo fmt             # 格式化 Rust 代码
```

## 项目架构

### 前后端通信
- **前端调用后端**: 使用 `@tauri-apps/api/core` 的 `invoke()` 方法调用 Rust 命令
- **Rust 命令定义**: 在 `src-tauri/src/lib.rs` 中使用 `#[tauri::command]` 宏定义命令
- **命令注册**: 在 `lib.rs` 的 `run()` 函数中通过 `.invoke_handler(tauri::generate_handler![...])` 注册

示例流程:
1. 前端: `invoke("greet", { name: "World" })` (src/App.tsx:12)
2. 后端: `#[tauri::command] fn greet(name: &str) -> String` (src-tauri/src/lib.rs:3)
3. 注册: `.invoke_handler(tauri::generate_handler![greet])` (src-tauri/src/lib.rs:11)

### 项目结构
```
├── src/                    # React 前端代码
│   ├── App.tsx            # 主应用组件
│   ├── main.tsx           # React 入口文件
│   └── assets/            # 静态资源
├── src-tauri/             # Rust 后端代码
│   ├── src/
│   │   ├── main.rs        # 应用入口（调用 lib.rs）
│   │   └── lib.rs         # Tauri 应用逻辑和命令定义
│   ├── Cargo.toml         # Rust 依赖配置
│   ├── tauri.conf.json    # Tauri 应用配置
│   └── capabilities/      # 权限配置
├── index.html             # HTML 模板
└── vite.config.ts         # Vite 配置（固定端口 1420）
```

### 关键配置

**Vite 开发服务器**:
- 固定端口: `1420`（由 tauri.conf.json 要求）
- HMR 端口: `1421`
- 忽略监听 `src-tauri` 目录的变化

**Tauri 窗口**:
- 默认尺寸: 800x600
- CSP: null（开发模式下禁用内容安全策略）

**Rust 库配置**:
- 库名: `ai_manager_lib`（避免与二进制名冲突）
- crate 类型: `staticlib`, `cdylib`, `rlib`

## 添加新的 Rust 命令

1. 在 `src-tauri/src/lib.rs` 中定义命令函数：
   ```rust
   #[tauri::command]
   fn your_command(param: &str) -> String {
       // 实现逻辑
   }
   ```

2. 在 `generate_handler![]` 宏中注册命令：
   ```rust
   .invoke_handler(tauri::generate_handler![greet, your_command])
   ```

3. 在前端调用：
   ```typescript
   import { invoke } from "@tauri-apps/api/core";
   const result = await invoke("your_command", { param: "value" });
   ```

## 添加 Tauri 插件

1. 在 `src-tauri/Cargo.toml` 中添加依赖
2. 在 `src-tauri/src/lib.rs` 的 `run()` 函数中通过 `.plugin()` 注册
3. 前端安装对应的 npm 包（如 `@tauri-apps/plugin-*`）

当前已集成: `tauri-plugin-opener`（用于在默认浏览器中打开 URL）
