# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

这是一个基于 Tauri 2.0 的桌面应用项目，使用 React 19 + TypeScript + Vite 作为前端技术栈，Rust 作为后端。

**应用标识符**: `com.gotobeta.app.ai-manager`
**包管理器**: pnpm

## 应用功能

AI Manager 是一个 Claude Code 配置管理工具，提供：

- **配置管理**: 管理多个 Claude Code 配置（API Key、模型、插件等）
- **记忆管理**: 管理 CLAUDE.md 记忆片段，多个记忆可同时启用
- **Skills 管理**: （计划中）管理 Claude Code Skills
- **通用配置**: 共享默认配置，支持深度合并

切换配置后自动更新 `~/.claude/settings.json`，切换记忆后自动更新 `~/.claude/CLAUDE.md`。

## 数据存储

- **应用数据**: `~/.config/ai-manager/`
  - `configs.json` - 配置列表
  - `memories.json` - 记忆列表
- **Claude 配置**: `~/.claude/`
  - `settings.json` - 当前激活的配置
  - `CLAUDE.md` - 当前启用的记忆内容

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
1. 前端: `invoke("get_configs")` (src/App.tsx)
2. 后端: `#[tauri::command] fn get_configs() -> ...` (src-tauri/src/config.rs)
3. 注册: `.invoke_handler(tauri::generate_handler![get_configs, ...])` (src-tauri/src/lib.rs)

### 项目结构
```
├── src/                    # React 前端代码
│   ├── App.tsx            # 主应用组件
│   ├── main.tsx           # React 入口文件
│   ├── components/        # UI 组件
│   │   ├── ConfigEditor.tsx   # 配置编辑面板
│   │   ├── ConfigPreview.tsx  # JSON 配置预览（只读 CodeMirror）
│   │   ├── DefaultsSection.tsx # 通用配置编辑区
│   │   ├── PluginManager.tsx  # 插件管理
│   │   ├── ConfigList.tsx     # 配置列表
│   │   ├── ConfigItem.tsx     # 配置列表项
│   │   ├── ConfirmDialog.tsx  # 通用确认对话框
│   │   ├── MemoryPage.tsx     # 记忆管理页面
│   │   ├── MemoryEditor.tsx   # 记忆编辑面板
│   │   ├── MemoryItem.tsx     # 记忆列表项
│   │   ├── SettingsDrawer.tsx # 设置侧边抽屉
│   │   ├── Sidebar.tsx        # 侧边栏导航
│   │   └── SkillsPage.tsx     # Skills 管理页面（占位）
│   ├── hooks/             # 公共 React hooks
│   │   ├── useEscapeKey.ts    # ESC 键监听（需用 useCallback 包裹回调）
│   │   └── useToast.tsx       # Toast 通知（ToastProvider + useToast）
│   ├── styles/            # 共享样式
│   │   └── shared.css         # z-index CSS 变量 + .empty-state 公共样式
│   └── assets/            # 静态资源
├── src-tauri/             # Rust 后端代码
│   ├── src/
│   │   ├── main.rs        # 应用入口（调用 lib.rs）
│   │   ├── lib.rs         # Tauri 应用逻辑和命令注册
│   │   ├── utils.rs       # 公共工具模块（必须优先了解）
│   │   ├── config.rs      # 配置管理模块
│   │   ├── memory.rs      # 记忆管理模块
│   │   └── tray.rs        # 系统托盘模块
│   ├── Cargo.toml         # Rust 依赖配置
│   ├── tauri.conf.json    # Tauri 应用配置
│   └── capabilities/      # 权限配置
├── index.html             # HTML 模板
└── vite.config.ts         # Vite 配置（固定端口 1420）
```

### 后端模块

- **utils.rs**: 公共工具模块
  - `CONFIG_LOCK` / `MEMORY_LOCK`：防止并发写入的全局互斥锁
  - `get_home_dir()` / `current_timestamp()` / `read_json_file()` / `ensure_dir_and_write()`
  - `ensure_dir_and_write()` 在 Unix 上自动设置文件权限 0o600
  - **新增 Rust 代码应优先使用这些函数，不要重新实现**

- **config.rs**: 配置管理
  - `ConfigData` DTO：`add_config`/`update_config` 的参数结构体，前端须传 `{ data: {...} }`
  - CRUD 操作（增删改查、排序、复制）
  - 通用配置管理（get_defaults / update_defaults）
  - 深度合并逻辑
  - 应用配置到 ~/.claude/settings.json
  - 所有写操作通过 `CONFIG_LOCK` 保护；`apply_config()` 可在锁内调用，内部不再加锁

- **memory.rs**: 记忆管理
  - CRUD 操作
  - 多记忆启用/禁用（toggle_memory）
  - 合并所有活跃记忆写入 ~/.claude/CLAUDE.md

- **tray.rs**: 系统托盘
  - 构建托盘菜单，动态显示配置列表
  - 左键点击显示主窗口，右键显示菜单
  - 配置切换后通过 `app.emit("config-changed", ())` 通知前端刷新
  - macOS：隐藏窗口时切换 Accessory 模式（隐藏 Dock 图标）

### 关键配置

**Vite 开发服务器**:
- 固定端口: `1420`（由 tauri.conf.json 要求）
- HMR 端口: `1421`
- 忽略监听 `src-tauri` 目录的变化

**Tauri 窗口**:
- 默认尺寸: 1024x800，最小尺寸: 400x600
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

## 关键实现模式

### 通用配置深度合并
- 通用配置作为基础（base），当前配置覆盖（overlay）
- 对象递归合并，非对象类型使用 overlay 值
- 每个配置独立控制 `useDefaults`（非全局开关）
- 实现位置：`src-tauri/src/config.rs::deep_merge()` 和 `src/types.ts::deepMerge()`

### JSON 编辑器实现
- 透明 textarea 绝对定位覆盖在语法高亮层上
- 滚动同步通过 ref 实现
- `caret-color` 设置光标颜色，`color: transparent` 隐藏文字
- 实现位置：`src/components/ConfigEditor.tsx` 中的 defaults 编辑器

### 配置应用流程
1. 用户激活配置
2. 后端执行 `apply_config()`
3. 生成配置 JSON（启用通用配置时深度合并）
4. 写入 `~/.claude/settings.json`
5. Claude Code 自动读取新配置

### 记忆应用流程
1. 用户切换记忆启用状态
2. 后端执行 `apply_memories()`
3. 合并所有 `is_active=true` 的记忆内容（用 `\n\n` 分隔）
4. 写入 `~/.claude/CLAUDE.md`
5. Claude Code 自动读取新记忆内容

### 用户反馈（Toast 通知）
- 使用 `useToast()` hook 获取 `showToast(message, type?)`，不使用 `console.error`
- `type` 为 `"success"`（默认）或 `"error"`；自动消失 3 秒
- 已有 `ToastProvider` 在 `main.tsx` 根级包裹，组件内直接调用 `useToast()` 即可

### z-index 层级管理
- 所有 z-index 通过 CSS 变量统一管理，定义在 `src/styles/shared.css`
- 变量命名：`--z-index-dropdown`、`--z-index-drawer`、`--z-index-modal`、`--z-index-toast` 等
- 新增有层叠需求的组件必须使用变量，不得硬编码数值
