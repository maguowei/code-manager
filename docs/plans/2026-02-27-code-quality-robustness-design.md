# 代码质量与健壮性优化设计

## 背景

AI Manager 功能已基本成型，但存在以下技术债务：

- Rust 后端有多处 `expect()`/`unwrap()` 可能导致 panic
- 文件读写无锁保护，存在竞态条件
- 含 API Key 的配置文件权限过于开放（644）
- 前端 ConfigEditor.tsx 达 739 行，难以维护
- 前后端代码存在大量重复模式
- 错误处理仅 `console.error`，用户无感知

## 方案

采用渐进式重构，前后端并行推进，每个改动独立可验证。

---

## Part 1：Rust 后端健壮性改造

### 1.1 提取公共模块 utils.rs

从 config.rs 和 memory.rs 中提取重复逻辑到 `src-tauri/src/utils.rs`：

- `get_home_dir() -> Result<PathBuf, String>` — 安全获取用户主目录
- `current_timestamp() -> u64` — 获取当前时间戳
- `ensure_dir_and_write(path, content) -> Result<(), String>` — 创建目录 + 写文件 + 设置权限
- `read_json_file<T: DeserializeOwned + Default>(path) -> T` — 读取 JSON 文件，失败返回默认值

### 1.2 消除 panic 点

将所有 `expect()`/`unwrap()` 替换为 `Result` 返回：

| 位置 | 问题 | 修复 |
|------|------|------|
| config.rs:80,85 | `dirs::home_dir().expect()` | 改用 utils::get_home_dir() |
| config.rs:92 | `.expect("Time went backwards")` | 改用 utils::current_timestamp() |
| memory.rs:34,40 | 同上 | 同上 |
| memory.rs:48 | 同上 | 同上 |
| tray.rs:79 | `.unwrap()` on tray icon | 改用 `?` 或 `.ok()` |

### 1.3 文件操作加锁

使用 `Mutex` 为配置和记忆的状态操作添加互斥锁：

```rust
use std::sync::Mutex;
use once_cell::sync::Lazy;

static CONFIG_LOCK: Lazy<Mutex<()>> = Lazy::new(|| Mutex::new(()));
static MEMORY_LOCK: Lazy<Mutex<()>> = Lazy::new(|| Mutex::new(()));
```

所有 load -> modify -> save 流程必须在锁保护内执行。

### 1.4 文件权限保护

在 Unix 系统上，将包含 API Key 的文件权限设置为 `0o600`：

- `~/.config/ai-manager/configs.json`
- `~/.claude/settings.json`

通过 `std::os::unix::fs::PermissionsExt` 实现，非 Unix 系统跳过。

### 1.5 命令参数 DTO 化

将 add_config（21 个参数）和 update_config（22 个参数）替换为 DTO struct：

```rust
#[derive(Deserialize)]
pub struct ConfigData {
    pub name: String,
    pub description: String,
    pub api_key: String,
    pub api_url: Option<String>,
    // ... 其他字段
}
```

---

## Part 2：前端代码质量改造

### 2.1 拆分 ConfigEditor.tsx

将 739 行的 ConfigEditor 拆分为 4 个文件：

| 新组件 | 职责 |
|--------|------|
| `ConfigEditor.tsx` | 主框架，表单提交逻辑 |
| `PluginManager.tsx` | 插件列表的增删改 |
| `DefaultsSection.tsx` | 通用配置编辑区（CodeMirror） |
| `ConfigPreview.tsx` | JSON 预览区 |

### 2.2 提取公共 Hooks

| Hook | 职责 | 替代位置 |
|------|------|---------|
| `useEscapeKey(callback)` | ESC 键监听 | App, MemoryPage, SettingsDrawer, ConfirmDialog |
| `useInvoke<T>(cmd, params)` | 统一 invoke 调用和错误处理 | 全部 invoke 调用（15+ 处） |

### 2.3 提取共享 CSS

创建 `src/styles/shared.css`：

- `.card-item` — 公共卡片样式（ConfigItem + MemoryItem）
- `.empty-state` — 空状态样式（ConfigList + MemoryPage）
- `.action-btn` — 操作按钮组
- z-index CSS 变量统一管理

### 2.4 添加 Toast 通知

自行实现轻量 Toast 组件（不引入第三方库）：

- 成功操作显示绿色提示
- 失败操作显示红色错误提示
- 3 秒自动消失
- 替代所有 `console.error` 调用

---

## 不做的事情（YAGNI）

- React.memo 优化 — 数据量小，无性能瓶颈
- 全局状态管理（Redux/Zustand） — 当前 useState 足够
- ErrorBoundary — 桌面应用场景，崩溃概率低
- 焦点管理/可访问性增强 — 非核心用户场景
- TypeScript enum 替换 string union — 够用
- 虚拟化列表 — 数据量不够大
- 引入 thiserror/tracing — 项目规模不需要
