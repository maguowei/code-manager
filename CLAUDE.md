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
- **Skills 管理**: 管理 Claude Code Skills（启用/禁用、新建、编辑、删除、支持文件管理）
- **通用配置**: 共享默认配置，支持深度合并

切换配置后自动更新 `~/.claude/settings.json`，切换记忆后自动更新 `~/.claude/CLAUDE.md`。

## 数据存储

- **应用数据**: `~/.config/ai-manager/`
  - `configs.json` - 配置列表
  - `memories.json` - 记忆列表
  - `skills-disabled/` - 已禁用的 Skills 目录（启用的 Skills 存放于 `~/.claude/skills/`）
- **Claude 配置**: `~/.claude/`
  - `settings.json` - 当前激活的配置
  - `CLAUDE.md` - 当前启用的记忆内容
  - `skills/` - 已启用的 Skills 目录（每个 skill 为独立子目录，含 `SKILL.md`）

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
│   ├── types.ts           # 前后端共享类型定义（ClaudeConfig、Memory、统计类型等）
│   ├── components/        # UI 组件
│   │   ├── ConfigEditor.tsx   # 配置编辑面板
│   │   ├── ConfigPreview.tsx  # JSON 配置预览（只读 CodeMirror）
│   │   ├── CollapsibleSection.tsx # 可折叠面板（Plugins/Advanced/Preview 区块共用）
│   │   ├── DefaultsSection.tsx # 通用配置编辑区
│   │   ├── PluginManager.tsx  # 插件管理
│   │   ├── ConfigList.tsx     # 配置列表
│   │   ├── ConfigItem.tsx     # 配置列表项
│   │   ├── ConfirmDialog.tsx  # 通用确认对话框
│   │   ├── MemoryPage.tsx     # 记忆管理页面
│   │   ├── MemoryEditor.tsx   # 记忆编辑面板
│   │   ├── MemoryItem.tsx     # 记忆列表项
│   │   ├── StatsPage.tsx      # 使用统计页面（recharts 图表）
│   │   ├── SettingsDrawer.tsx # 设置侧边抽屉
│   │   ├── Sidebar.tsx        # 侧边栏导航
│   │   ├── SkillsPage.tsx     # Skills 管理页面（列表 + 抽屉布局）
│   │   ├── SkillItem.tsx      # Skills 列表项（含启用/禁用开关）
│   │   └── SkillEditor.tsx    # Skills 编辑面板（含支持文件管理）
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
│   │   ├── skills.rs      # Skills 管理模块
│   │   ├── stats.rs       # 使用统计模块
│   │   └── tray.rs        # 系统托盘模块
│   ├── Cargo.toml         # Rust 依赖配置
│   ├── tauri.conf.json    # Tauri 应用配置
│   └── capabilities/      # 权限配置
├── index.html             # HTML 模板
└── vite.config.ts         # Vite 配置（固定端口 1420）
```

### 后端模块

- **utils.rs**: 公共工具模块
  - `CONFIG_LOCK` / `MEMORY_LOCK` / `STATS_LOCK` / `SKILLS_LOCK`：防止并发写入的全局互斥锁
  - `lock_config()` / `lock_memory()` / `lock_stats()` / `lock_skills()`：对应锁的便捷获取函数（返回 `MutexGuard`）
  - `home_dir_or_fallback()`：获取主目录，失败时降级为当前目录
  - `get_home_dir()` / `get_app_data_dir()` / `current_timestamp()`
  - `systime_to_secs(t: SystemTime) -> u64`：`SystemTime` 转 Unix 时间戳（秒）
  - `read_json_file<T>()` / `ensure_dir_and_write()`：文件读写（新建文件时 Unix 自动设 0o600 权限）
  - `save_json_file<T>()`：序列化为格式化 JSON 并写入文件
  - **新增 Rust 代码应优先使用这些函数，不要重新实现**

- **config.rs**: 配置管理
  - `ConfigData` DTO：`add_config`/`update_config`/`preview_config` 的参数结构体，前端须传 `{ data: {...} }`
  - CRUD 操作（增删改查、排序、复制）
  - `preview_config(data, defaults)` 命令：生成配置预览 JSON，不写磁盘（供 ConfigEditor 实时预览）
  - 通用配置管理（get_defaults / update_defaults）
  - `build_config_value(config, defaults)` 内部函数：构建配置 JSON，apply_config 与 preview_config 共用
  - 应用配置到 ~/.claude/settings.json（`apply_config(config, defaults)` 接收 defaults 参数，不再内部读盘）
  - 所有写操作通过 `lock_config()` 保护

- **memory.rs**: 记忆管理
  - CRUD 操作
  - 多记忆启用/禁用（toggle_memory）
  - 合并所有活跃记忆写入 ~/.claude/CLAUDE.md
  - 所有写操作通过 `lock_memory()` 保护

- **stats.rs**: 使用统计
  - 从 `~/.claude.json` 读取统计数据（`get_stats`）
  - 快照历史管理：每小时自动采样，保存到 `~/.config/ai-manager/stats_history.json`（紧凑 JSON）
  - 去重机制：与上次快照相同则跳过；90 天保留期；最多 500 条
  - 手动触发：`take_stats_snapshot`

- **tray.rs**: 系统托盘
  - 构建托盘菜单，动态显示配置列表
  - 点击托盘图标直接弹出菜单（含"显示主窗口"菜单项）
  - 配置切换后通过 `app.emit("config-changed", ())` 通知前端刷新
  - macOS：隐藏窗口时切换 Accessory 模式（隐藏 Dock 图标）

- **skills.rs**: Skills 管理
  - Skills 存储于 `~/.claude/skills/<id>/SKILL.md`（启用）或 `~/.config/ai-manager/skills-disabled/<id>/SKILL.md`（禁用）
  - CRUD 操作（`get_skills` / `add_skill` / `update_skill` / `delete_skill` / `toggle_skill`）
  - 支持文件管理（`get_skill_files` / `add_skill_file` / `update_skill_file` / `delete_skill_file`）
  - `parse_skill_md()` / `serialize_skill_md()`：解析和生成 SKILL.md frontmatter（兼容 CRLF）
  - `validate_skill_id()`：id 只允许小写字母、数字、连字符
  - 所有写操作通过 `lock_skills()` 保护；遍历时跳过符号链接防止路径逃逸

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

1. 在对应模块（如 `src-tauri/src/config.rs`）中定义命令函数：
   ```rust
   #[tauri::command]
   fn your_command(param: &str) -> String {
       // 实现逻辑
   }
   ```

2. 在 `generate_handler![]` 宏中注册命令：
   ```rust
   .invoke_handler(tauri::generate_handler![..., your_command])
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
- 实现位置：`src-tauri/src/config.rs::build_config_value()`（Rust，权威实现）
- 前端预览通过 `invoke("preview_config")` 调用后端生成，与实际写入逻辑完全一致

### JSON 编辑器实现
- 透明 textarea 绝对定位覆盖在语法高亮层上
- 滚动同步通过 ref 实现
- `caret-color` 设置光标颜色，`color: transparent` 隐藏文字
- 实现位置：`src/components/DefaultsSection.tsx`（defaults 编辑区）

### 配置/记忆应用
- 激活配置 → `apply_config()` 深度合并后写入 `~/.claude/settings.json`
- 切换记忆 → `apply_memories()` 合并所有 `is_active=true` 内容写入 `~/.claude/CLAUDE.md`

### 用户反馈（Toast 通知）
- 使用 `useToast()` hook 获取 `showToast(message, type?)`，不使用 `console.error`
- `type` 为 `"success"`（默认）或 `"error"`；自动消失 3 秒
- 已有 `ToastProvider` 在 `main.tsx` 根级包裹，组件内直接调用 `useToast()` 即可

### z-index 层级管理
- 所有 z-index 通过 CSS 变量统一管理，定义在 `src/styles/shared.css`
- 变量命名：`--z-index-dropdown`、`--z-index-drawer`、`--z-index-modal`、`--z-index-toast` 等
- 新增有层叠需求的组件必须使用变量，不得硬编码数值
