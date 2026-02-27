# 代码质量与健壮性优化实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 消除 Rust 后端 panic 风险和竞态条件，拆分前端大组件，添加用户可见的错误反馈。

**Architecture:** 后端提取 utils.rs 公共模块 + 加锁 + DTO 化；前端提取 hooks + 拆分 ConfigEditor + 添加 Toast。前后端独立改造，可并行推进。

**Tech Stack:** Rust (std::sync::Mutex), React 19 (custom hooks, Context), TypeScript, CSS custom properties

---

### Task 1: 创建 Rust 公共模块 utils.rs

**Files:**
- Create: `src-tauri/src/utils.rs`
- Modify: `src-tauri/src/lib.rs:1` (添加 `mod utils;`)

**Step 1: 创建 utils.rs**

```rust
use serde::de::DeserializeOwned;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

/// 配置文件操作互斥锁
pub static CONFIG_LOCK: Mutex<()> = Mutex::new(());
/// 记忆文件操作互斥锁
pub static MEMORY_LOCK: Mutex<()> = Mutex::new(());

/// 安全获取用户主目录
pub fn get_home_dir() -> Result<PathBuf, String> {
    dirs::home_dir().ok_or_else(|| "无法获取用户主目录".to_string())
}

/// 获取当前 Unix 时间戳（秒）
pub fn current_timestamp() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

/// 创建目录并写入文件，在 Unix 系统上设置权限为 600
pub fn ensure_dir_and_write(path: &Path, content: &str) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("创建目录失败: {}", e))?;
    }
    fs::write(path, content).map_err(|e| format!("写入文件失败: {}", e))?;

    // Unix 系统设置文件权限为 600（仅所有者可读写）
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let perms = fs::Permissions::from_mode(0o600);
        let _ = fs::set_permissions(path, perms);
    }

    Ok(())
}

/// 读取 JSON 文件并反序列化，失败时返回默认值
pub fn read_json_file<T: DeserializeOwned + Default>(path: &Path) -> T {
    if path.exists() {
        match fs::read_to_string(path) {
            Ok(content) => serde_json::from_str(&content).unwrap_or_default(),
            Err(_) => T::default(),
        }
    } else {
        T::default()
    }
}
```

**Step 2: 在 lib.rs 中注册模块**

在 `src-tauri/src/lib.rs` 第 1 行添加 `mod utils;`（在 `mod config;` 之前）。

**Step 3: 验证编译**

Run: `cd src-tauri && cargo check`
Expected: 编译成功，无 warning（utils 暂未被使用会有 dead_code warning，可接受）

**Step 4: Commit**

```bash
git add src-tauri/src/utils.rs src-tauri/src/lib.rs
git commit -m "refactor: 提取 Rust 公共模块 utils.rs"
```

---

### Task 2: 重构 config.rs（消除 panic + 加锁 + 文件权限 + DTO）

**Files:**
- Modify: `src-tauri/src/config.rs`
- Modify: `src-tauri/src/lib.rs` (更新 import)

**Step 1: 添加 ConfigData DTO 结构体**

在 `src-tauri/src/config.rs` 的 `AppState` struct 后（第 77 行后）添加：

```rust
/// 前端传入的配置数据 DTO（不含 id、时间戳、is_active）
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConfigData {
    pub name: String,
    pub description: String,
    pub api_key: String,
    pub api_url: Option<String>,
    pub website_url: Option<String>,
    pub model: Option<String>,
    pub thinking_model: Option<String>,
    pub haiku_model: Option<String>,
    pub sonnet_model: Option<String>,
    pub opus_model: Option<String>,
    pub always_thinking_enabled: Option<bool>,
    pub disable_nonessential_traffic: Option<bool>,
    pub skip_web_fetch_preflight: Option<bool>,
    pub enable_lsp_tool: Option<bool>,
    pub has_completed_onboarding: Option<bool>,
    pub enable_extra_marketplaces: Option<bool>,
    pub preferred_language: Option<String>,
    pub use_defaults: Option<bool>,
    pub enabled_plugins: Option<HashMap<String, bool>>,
}

impl ConfigData {
    /// 从 DTO 创建新的 ClaudeConfig
    pub fn into_config(self) -> ClaudeConfig {
        let now = crate::utils::current_timestamp();
        ClaudeConfig {
            id: Uuid::new_v4().to_string(),
            name: self.name,
            description: self.description,
            api_key: self.api_key,
            api_url: self.api_url,
            website_url: self.website_url,
            model: self.model,
            thinking_model: self.thinking_model,
            haiku_model: self.haiku_model,
            sonnet_model: self.sonnet_model,
            opus_model: self.opus_model,
            always_thinking_enabled: self.always_thinking_enabled,
            disable_nonessential_traffic: self.disable_nonessential_traffic,
            skip_web_fetch_preflight: self.skip_web_fetch_preflight,
            enable_lsp_tool: self.enable_lsp_tool,
            has_completed_onboarding: self.has_completed_onboarding,
            enable_extra_marketplaces: self.enable_extra_marketplaces,
            preferred_language: self.preferred_language,
            use_defaults: self.use_defaults,
            enabled_plugins: self.enabled_plugins,
            is_active: false,
            created_at: now,
            updated_at: now,
        }
    }

    /// 将 DTO 的字段更新到已有的 ClaudeConfig
    pub fn apply_to(self, config: &mut ClaudeConfig) {
        config.name = self.name;
        config.description = self.description;
        config.api_key = self.api_key;
        config.api_url = self.api_url;
        config.website_url = self.website_url;
        config.model = self.model;
        config.thinking_model = self.thinking_model;
        config.haiku_model = self.haiku_model;
        config.sonnet_model = self.sonnet_model;
        config.opus_model = self.opus_model;
        config.always_thinking_enabled = self.always_thinking_enabled;
        config.disable_nonessential_traffic = self.disable_nonessential_traffic;
        config.skip_web_fetch_preflight = self.skip_web_fetch_preflight;
        config.enable_lsp_tool = self.enable_lsp_tool;
        config.has_completed_onboarding = self.has_completed_onboarding;
        config.enable_extra_marketplaces = self.enable_extra_marketplaces;
        config.preferred_language = self.preferred_language;
        config.use_defaults = self.use_defaults;
        config.enabled_plugins = self.enabled_plugins;
        config.updated_at = crate::utils::current_timestamp();
    }
}
```

**Step 2: 替换路径获取和时间戳函数**

删除 config.rs 中的 `get_config_path()`、`get_claude_config_path()`、`current_timestamp()` 函数（原第 79-94 行），替换为使用 utils：

```rust
fn get_config_path() -> Result<PathBuf, String> {
    Ok(crate::utils::get_home_dir()?.join(".config").join("ai-manager").join("configs.json"))
}

fn get_claude_config_path() -> Result<PathBuf, String> {
    Ok(crate::utils::get_home_dir()?.join(".claude").join("settings.json"))
}
```

**Step 3: 重构 load_state 和 save_state**

```rust
pub fn load_state() -> AppState {
    match get_config_path() {
        Ok(path) => crate::utils::read_json_file(&path),
        Err(_) => AppState::default(),
    }
}

pub fn save_state(state: &AppState) -> Result<(), String> {
    let path = get_config_path()?;
    let content = serde_json::to_string_pretty(state).map_err(|e| e.to_string())?;
    crate::utils::ensure_dir_and_write(&path, &content)
}
```

**Step 4: 重构 apply_config 中的文件写入**

将 `apply_config` 函数末尾（原第 270-275 行）的文件写入替换为：

```rust
let path = get_claude_config_path()?;
let content = serde_json::to_string_pretty(&final_config).map_err(|e| e.to_string())?;
crate::utils::ensure_dir_and_write(&path, &content)
```

**Step 5: 重构 add_config 为 DTO 参数 + 加锁**

将整个 `add_config` 函数（原第 284-341 行）替换为：

```rust
#[tauri::command]
pub fn add_config(
    app_handle: AppHandle,
    data: ConfigData,
) -> Result<ClaudeConfig, String> {
    let _lock = crate::utils::CONFIG_LOCK.lock().map_err(|e| e.to_string())?;

    let mut state = load_state();
    let config = data.into_config();

    state.configs.push(config.clone());
    save_state(&state)?;
    rebuild_tray_menu(&app_handle);

    Ok(config)
}
```

**Step 6: 重构 update_config 为 DTO 参数 + 加锁**

将整个 `update_config` 函数（原第 343-406 行）替换为：

```rust
#[tauri::command]
pub fn update_config(
    app_handle: AppHandle,
    id: String,
    data: ConfigData,
) -> Result<ClaudeConfig, String> {
    let _lock = crate::utils::CONFIG_LOCK.lock().map_err(|e| e.to_string())?;

    let mut state = load_state();

    let config = state
        .configs
        .iter_mut()
        .find(|c| c.id == id)
        .ok_or_else(|| format!("配置 '{}' 未找到", id))?;

    data.apply_to(config);
    let updated = config.clone();
    save_state(&state)?;

    if state.active_config_id == Some(id) {
        apply_config(&updated)?;
    }
    rebuild_tray_menu(&app_handle);

    Ok(updated)
}
```

**Step 7: 给其余修改状态的命令加锁**

为 `delete_config`、`duplicate_config`、`reorder_configs`、`activate_config_inner`、`update_defaults` 函数添加锁：

每个函数体开头添加：
```rust
let _lock = crate::utils::CONFIG_LOCK.lock().map_err(|e| e.to_string())?;
```

同时将 `duplicate_config` 中手动复制字段改为直接 `clone()` + 修改 id/name/时间戳（已经是 clone 方式，无需改动）。

将 `duplicate_config` 中的 `current_timestamp()` 调用替换为 `crate::utils::current_timestamp()`。

**Step 8: 验证编译**

Run: `cd src-tauri && cargo check`
Expected: 编译成功

**Step 9: Commit**

```bash
git add src-tauri/src/config.rs src-tauri/src/lib.rs
git commit -m "refactor: config.rs 消除 panic、加锁、DTO 化、文件权限保护"
```

---

### Task 3: 重构 memory.rs（消除 panic + 加锁 + 文件权限）

**Files:**
- Modify: `src-tauri/src/memory.rs`

**Step 1: 替换路径获取和时间戳函数**

删除 memory.rs 中的 `get_memory_config_path()`、`get_claude_md_path()`、`current_timestamp()` 函数（原第 32-50 行），替换为：

```rust
/// 获取记忆状态存储路径
fn get_memory_config_path() -> Result<PathBuf, String> {
    Ok(crate::utils::get_home_dir()?.join(".config").join("ai-manager").join("memories.json"))
}

/// 获取 CLAUDE.md 路径
fn get_claude_md_path() -> Result<PathBuf, String> {
    Ok(crate::utils::get_home_dir()?.join(".claude").join("CLAUDE.md"))
}
```

**Step 2: 重构 load/save/apply 函数**

```rust
pub fn load_memory_state() -> MemoryState {
    match get_memory_config_path() {
        Ok(path) => crate::utils::read_json_file(&path),
        Err(_) => MemoryState::default(),
    }
}

pub fn save_memory_state(state: &MemoryState) -> Result<(), String> {
    let path = get_memory_config_path()?;
    let content = serde_json::to_string_pretty(state).map_err(|e| e.to_string())?;
    crate::utils::ensure_dir_and_write(&path, &content)
}

pub fn apply_memories(state: &MemoryState) -> Result<(), String> {
    let active: Vec<&Memory> = state.memories.iter().filter(|m| m.is_active).collect();

    let content = if active.is_empty() {
        String::new()
    } else {
        active
            .iter()
            .map(|m| format!("# {}\n\n{}", m.name, m.content))
            .collect::<Vec<_>>()
            .join("\n\n")
    };

    let path = get_claude_md_path()?;
    // CLAUDE.md 不含敏感信息，用标准写入即可
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::write(&path, content).map_err(|e| e.to_string())?;
    Ok(())
}
```

**Step 3: 给所有修改状态的命令加锁**

为 `add_memory`、`update_memory`、`delete_memory`、`toggle_memory` 函数体开头添加：

```rust
let _lock = crate::utils::MEMORY_LOCK.lock().map_err(|e| e.to_string())?;
```

将所有 `current_timestamp()` 调用替换为 `crate::utils::current_timestamp()`。

**Step 4: 验证编译**

Run: `cd src-tauri && cargo check`
Expected: 编译成功

**Step 5: Commit**

```bash
git add src-tauri/src/memory.rs
git commit -m "refactor: memory.rs 消除 panic、加锁、文件权限保护"
```

---

### Task 4: 修复 tray.rs 和 lib.rs 的 unwrap

**Files:**
- Modify: `src-tauri/src/tray.rs:79`
- Modify: `src-tauri/src/lib.rs:50`

**Step 1: 修复 tray.rs 的 unwrap**

将 `src-tauri/src/tray.rs` 第 79 行：
```rust
.icon(app.default_window_icon().unwrap().clone())
```
替换为：
```rust
.icon(app.default_window_icon().cloned().unwrap_or_else(|| {
    tauri::image::Image::new(&[], 0, 0)
}))
```

注意：如果 `Image::new` 接口不同，可改为使用 `ok_or` 向上传播错误：
```rust
.icon(app.default_window_icon().ok_or("未找到默认窗口图标")?.clone())
```

**Step 2: 修复 lib.rs 的 expect**

将 `src-tauri/src/lib.rs` 第 49-50 行的：
```rust
.run(tauri::generate_context!())
.expect("error while running tauri application");
```
替换为：
```rust
.run(tauri::generate_context!())
.expect("启动 Tauri 应用失败");
```

注意：`run()` 的 expect 是应用入口的最终 panic 点，这里保留 expect 是合理的（应用无法启动时确实应该 panic），仅改善错误信息。

**Step 3: 验证编译**

Run: `cd src-tauri && cargo check`
Expected: 编译成功

**Step 4: Commit**

```bash
git add src-tauri/src/tray.rs src-tauri/src/lib.rs
git commit -m "fix: 修复 tray.rs unwrap 和改善 lib.rs 错误信息"
```

---

### Task 5: 更新前端 invoke 调用适配 DTO

**Files:**
- Modify: `src/App.tsx:103-163` (handleSave 函数)

**Step 1: 简化 handleSave 中的 invoke 调用**

将 `src/App.tsx` 中 `handleSave` 函数的 invoke 部分（第 112-156 行）替换为：

```typescript
const configData = {
  name: config.name,
  description: config.description,
  apiKey: config.apiKey,
  apiUrl: config.apiUrl || null,
  websiteUrl: config.websiteUrl || null,
  model: config.model || null,
  thinkingModel: config.thinkingModel || null,
  haikuModel: config.haikuModel || null,
  sonnetModel: config.sonnetModel || null,
  opusModel: config.opusModel || null,
  alwaysThinkingEnabled: config.alwaysThinkingEnabled || null,
  disableNonessentialTraffic: config.disableNonessentialTraffic || null,
  skipWebFetchPreflight: config.skipWebFetchPreflight || null,
  enableLspTool: config.enableLspTool || null,
  hasCompletedOnboarding: config.hasCompletedOnboarding || null,
  enableExtraMarketplaces: config.enableExtraMarketplaces || null,
  preferredLanguage: config.preferredLanguage || null,
  useDefaults: config.useDefaults || null,
  enabledPlugins: config.enabledPlugins && Object.keys(config.enabledPlugins).length > 0 ? config.enabledPlugins : null,
};

if (editingConfig) {
  await invoke("update_config", { id: editingConfig.id, data: configData });
} else {
  await invoke("add_config", { data: configData });
}
```

**Step 2: 验证前后端联调**

Run: `pnpm tauri dev`
Expected: 添加/编辑/激活配置功能正常

**Step 3: Commit**

```bash
git add src/App.tsx
git commit -m "refactor: 前端 invoke 调用适配后端 DTO 参数"
```

---

### Task 6: 创建 useEscapeKey hook

**Files:**
- Create: `src/hooks/useEscapeKey.ts`
- Modify: `src/App.tsx` (第 52-73 行的 ESC 逻辑)
- Modify: `src/components/MemoryPage.tsx` (第 30-38 行)
- Modify: `src/components/SettingsDrawer.tsx` (第 18-26 行)
- Modify: `src/components/ConfirmDialog.tsx` (第 24-36 行)

**Step 1: 创建 hook 文件**

```typescript
import { useEffect } from "react";

/**
 * 监听 ESC 键按下事件
 * @param callback ESC 键按下时的回调函数
 * @param enabled 是否启用监听（默认 true）
 */
export function useEscapeKey(callback: () => void, enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        callback();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [callback, enabled]);
}
```

**Step 2: 在 ConfirmDialog 中使用**

替换 `src/components/ConfirmDialog.tsx` 第 1 行的 import 和第 23-36 行的 ESC 逻辑：

```typescript
import { useEscapeKey } from "../hooks/useEscapeKey";

// 删除 useEffect, useCallback import（如果不再需要）
// 删除 handleKeyDown 和对应的 useEffect

// 在函数体内添加：
useEscapeKey(onCancel);
```

**Step 3: 在 SettingsDrawer 中使用**

替换 `src/components/SettingsDrawer.tsx` 第 18-26 行：

```typescript
import { useEscapeKey } from "../hooks/useEscapeKey";

// 删除 useEffect import
// 删除 handleKeyDown 的 useEffect

// 在函数体内添加：
useEscapeKey(onClose);
```

**Step 4: 在 MemoryPage 中使用**

替换 `src/components/MemoryPage.tsx` 第 30-38 行：

```typescript
import { useEscapeKey } from "../hooks/useEscapeKey";

// 删除 ESC 的 useEffect
// 在函数体内添加：
useEscapeKey(closeModal, isModalOpen);
```

**Step 5: 在 App.tsx 中使用**

将 `src/App.tsx` 第 52-73 行中 ESC 相关逻辑替换为 useEscapeKey：

```typescript
import { useEscapeKey } from "./hooks/useEscapeKey";

// 保留 Cmd+N 快捷键的 useEffect，但移除其中 ESC 处理：
useEffect(() => {
  const handleKeyDown = (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'n') {
      e.preventDefault();
      if (activeTab === 'configs') {
        handleAdd();
      }
    }
  };
  window.addEventListener('keydown', handleKeyDown);
  return () => window.removeEventListener('keydown', handleKeyDown);
}, [activeTab]);

// 单独使用 useEscapeKey:
useEscapeKey(() => {
  setIsModalOpen(false);
  setEditingConfig(null);
}, isModalOpen);
```

**Step 6: 验证**

Run: `pnpm tauri dev`
Expected: 在所有弹窗/抽屉中按 ESC 键能正常关闭

**Step 7: Commit**

```bash
git add src/hooks/useEscapeKey.ts src/App.tsx src/components/ConfirmDialog.tsx src/components/SettingsDrawer.tsx src/components/MemoryPage.tsx
git commit -m "refactor: 提取 useEscapeKey hook 消除 4 处重复的 ESC 键监听"
```

---

### Task 7: 创建 Toast 通知组件

**Files:**
- Create: `src/components/Toast.tsx`
- Create: `src/components/Toast.css`
- Create: `src/hooks/useToast.tsx`

**Step 1: 创建 Toast Context 和 Provider**

创建 `src/hooks/useToast.tsx`：

```typescript
import { createContext, useContext, useState, useCallback, ReactNode } from "react";

export type ToastType = "success" | "error";

interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
}

interface ToastContextValue {
  toasts: ToastItem[];
  showToast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

let nextId = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const showToast = useCallback((message: string, type: ToastType = "error") => {
    const id = nextId++;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3000);
  }, []);

  return (
    <ToastContext.Provider value={{ toasts, showToast }}>
      {children}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast 必须在 ToastProvider 内使用");
  return ctx;
}
```

**Step 2: 创建 Toast 渲染组件**

创建 `src/components/Toast.tsx`：

```typescript
import { useToast } from "../hooks/useToast";
import "./Toast.css";

function ToastContainer() {
  const { toasts } = useToast();

  if (toasts.length === 0) return null;

  return (
    <div className="toast-container">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast toast-${toast.type}`}>
          {toast.message}
        </div>
      ))}
    </div>
  );
}

export default ToastContainer;
```

**Step 3: 创建 Toast CSS**

创建 `src/components/Toast.css`：

```css
.toast-container {
  position: fixed;
  top: 16px;
  right: 16px;
  z-index: 9999;
  display: flex;
  flex-direction: column;
  gap: 8px;
  pointer-events: none;
}

.toast {
  padding: 10px 16px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  animation: toast-in 200ms ease-out;
  pointer-events: auto;
}

.toast-success {
  background-color: var(--accent-green-bg, rgba(34, 197, 94, 0.15));
  color: var(--accent-green, #22c55e);
  border: 1px solid var(--accent-green, #22c55e);
}

.toast-error {
  background-color: rgba(248, 81, 73, 0.15);
  color: var(--accent-red, #f85149);
  border: 1px solid var(--accent-red, #f85149);
}

@keyframes toast-in {
  from {
    opacity: 0;
    transform: translateX(20px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}
```

**Step 4: 集成到 main.tsx**

修改 `src/main.tsx`，用 `ToastProvider` 包裹 `App`：

```typescript
import { ToastProvider } from "./hooks/useToast";
import ToastContainer from "./components/Toast";

// 在 render 中：
<ToastProvider>
  <App />
  <ToastContainer />
</ToastProvider>
```

**Step 5: 验证**

Run: `pnpm tauri dev`
Expected: 应用正常启动（Toast 尚未被调用，但 Provider 已注入）

**Step 6: Commit**

```bash
git add src/hooks/useToast.tsx src/components/Toast.tsx src/components/Toast.css src/main.tsx
git commit -m "feat: 添加 Toast 通知组件和 Context"
```

---

### Task 8: 用 Toast 替换 App.tsx 和 MemoryPage.tsx 中的 console.error

**Files:**
- Modify: `src/App.tsx` (7 处 console.error)
- Modify: `src/components/MemoryPage.tsx` (5 处 console.error)

**Step 1: 在 App.tsx 中使用 Toast**

在 App 函数体开头添加：
```typescript
import { useToast } from "./hooks/useToast";

// 在 App() 内：
const { showToast } = useToast();
```

将所有 `console.error("Failed to xxx:", error)` 替换为：
```typescript
showToast("操作失败: " + String(error), "error");
```

具体位置（7 处）：
- 第 86 行 loadConfigs: `showToast("加载配置失败", "error");`
- 第 99 行 handleActivate: `showToast("激活配置失败", "error");`
- 第 162 行 handleSave: `showToast("保存配置失败", "error");`
- 第 172 行 handleDelete: `showToast("删除配置失败", "error");`
- 第 182 行 handleDuplicate: `showToast("复制配置失败", "error");`
- 第 194 行 handleReorder: `showToast("排序失败", "error");`

同时可在成功操作后添加成功提示（可选）：
- handleActivate 成功后: `showToast("配置已激活", "success");`
- handleSave 成功后: `showToast("配置已保存", "success");`

**Step 2: 在 MemoryPage 中使用 Toast**

在 MemoryPage 函数体开头添加：
```typescript
import { useToast } from "../hooks/useToast";

const { showToast } = useToast();
```

替换 5 处 console.error：
- 第 22 行 loadMemories: `showToast("加载记忆失败", "error");`
- 第 46 行 handleAdd: `showToast("添加记忆失败", "error");`
- 第 62 行 handleUpdate: `showToast("更新记忆失败", "error");`
- 第 71 行 handleDelete: `showToast("删除记忆失败", "error");`
- 第 80 行 handleToggle: `showToast("切换记忆状态失败", "error");`

**Step 3: 验证**

Run: `pnpm tauri dev`
Expected: 操作失败时右上角显示红色 Toast 提示

**Step 4: Commit**

```bash
git add src/App.tsx src/components/MemoryPage.tsx
git commit -m "feat: 用 Toast 通知替换 console.error，提供用户可见的错误反馈"
```

---

### Task 9: 提取 PluginManager 子组件

**Files:**
- Create: `src/components/PluginManager.tsx`
- Modify: `src/components/ConfigEditor.tsx`

**Step 1: 创建 PluginManager 组件**

将 ConfigEditor.tsx 中第 416-504 行（插件管理区域）提取为独立组件：

```typescript
import { useState } from "react";
import { useI18n } from "../i18n";

interface PluginManagerProps {
  enabledPlugins: Record<string, boolean>;
  onChange: (plugins: Record<string, boolean>) => void;
  showPlugins: boolean;
  onToggleShow: () => void;
}

function PluginManager({ enabledPlugins, onChange, showPlugins, onToggleShow }: PluginManagerProps) {
  const { t } = useI18n();
  const [newPluginId, setNewPluginId] = useState("");

  function handleAddPlugin() {
    const id = newPluginId.trim();
    if (!id || enabledPlugins[id] !== undefined) return;
    onChange({ ...enabledPlugins, [id]: true });
    setNewPluginId("");
  }

  function handleRemovePlugin(id: string) {
    const next = { ...enabledPlugins };
    delete next[id];
    onChange(next);
  }

  function handleTogglePlugin(id: string) {
    onChange({ ...enabledPlugins, [id]: !enabledPlugins[id] });
  }

  return (
    <div className={`collapsible-section ${showPlugins ? "expanded" : ""}`}>
      {/* 将 ConfigEditor.tsx 第 418-504 行的 JSX 搬入此处 */}
      {/* collapsible-header + collapsible-content */}
      {/* 将 onClick handlers 指向本地函数 */}
    </div>
  );
}

export default PluginManager;
```

完整 JSX 从 ConfigEditor.tsx 第 417-504 行搬入，将 `handleAddPlugin`、`handleRemovePlugin`、`handleTogglePlugin` 改为本地函数，将 `setShowPlugins(!showPlugins)` 改为 `onToggleShow()`。

**Step 2: 在 ConfigEditor 中使用**

替换 ConfigEditor.tsx 第 416-504 行为：

```typescript
import PluginManager from "./PluginManager";

// 在 JSX 中：
<PluginManager
  enabledPlugins={enabledPlugins}
  onChange={setEnabledPlugins}
  showPlugins={showPlugins}
  onToggleShow={() => setShowPlugins(!showPlugins)}
/>
```

删除 ConfigEditor 中的 `handleAddPlugin`、`handleRemovePlugin`、`handleTogglePlugin` 函数（第 160-175 行）和 `newPluginId` state（第 36 行）。

**Step 3: 验证**

Run: `pnpm tauri dev`
Expected: 插件管理功能正常（添加、删除、切换启用状态）

**Step 4: Commit**

```bash
git add src/components/PluginManager.tsx src/components/ConfigEditor.tsx
git commit -m "refactor: 提取 PluginManager 子组件"
```

---

### Task 10: 提取 DefaultsSection 子组件

**Files:**
- Create: `src/components/DefaultsSection.tsx`
- Modify: `src/components/ConfigEditor.tsx`

**Step 1: 创建 DefaultsSection 组件**

将 ConfigEditor.tsx 第 587-670 行（通用配置编辑区）提取为独立组件：

```typescript
import { useState, useMemo } from "react";
import { useI18n } from "../i18n";
import CodeMirror from "@uiw/react-codemirror";
import { json } from "@codemirror/lang-json";
import { xcodeLight, xcodeDark } from "@uiw/codemirror-theme-xcode";

interface DefaultsSectionProps {
  useDefaults: boolean;
  onToggleDefaults: () => void;
  defaultsContent: string;
  onDefaultsChange: (val: string) => void;
  defaultsError: string;
  onDefaultsErrorChange: (err: string) => void;
  showDefaults: boolean;
  onToggleShow: () => void;
}

function DefaultsSection({ useDefaults, onToggleDefaults, defaultsContent, onDefaultsChange, defaultsError, onDefaultsErrorChange, showDefaults, onToggleShow }: DefaultsSectionProps) {
  const { t, theme } = useI18n();

  const editorTheme = useMemo(() => {
    if (theme === "dark") return xcodeDark;
    if (theme === "light") return xcodeLight;
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    return prefersDark ? xcodeDark : xcodeLight;
  }, [theme]);

  function handleFormatDefaults() {
    if (!defaultsContent.trim()) return;
    try {
      const obj = JSON.parse(defaultsContent.trim());
      onDefaultsChange(JSON.stringify(obj, null, 2));
      onDefaultsErrorChange("");
    } catch {
      onDefaultsErrorChange(t("configModal.defaultsError"));
    }
  }

  return (
    <div className={`collapsible-section ${showDefaults ? "expanded" : ""}`}>
      {/* 将 ConfigEditor.tsx 第 588-670 行的 JSX 搬入此处 */}
    </div>
  );
}

export default DefaultsSection;
```

**Step 2: 在 ConfigEditor 中使用**

替换 ConfigEditor.tsx 第 587-670 行，删除 `handleFormatDefaults` 函数和 `editorTheme` useMemo（已移入子组件）。

**Step 3: 验证**

Run: `pnpm tauri dev`
Expected: 通用配置编辑功能正常

**Step 4: Commit**

```bash
git add src/components/DefaultsSection.tsx src/components/ConfigEditor.tsx
git commit -m "refactor: 提取 DefaultsSection 子组件"
```

---

### Task 11: 提取 ConfigPreview 子组件

**Files:**
- Create: `src/components/ConfigPreview.tsx`
- Modify: `src/components/ConfigEditor.tsx`

**Step 1: 创建 ConfigPreview 组件**

将 ConfigEditor.tsx 第 672-731 行（JSON 预览区）提取为独立组件：

```typescript
import { useState, useMemo } from "react";
import { useI18n } from "../i18n";
import CodeMirror from "@uiw/react-codemirror";
import { json } from "@codemirror/lang-json";
import { xcodeLight, xcodeDark } from "@uiw/codemirror-theme-xcode";

interface ConfigPreviewProps {
  previewJson: string;
  showPreview: boolean;
  onToggleShow: () => void;
}

function ConfigPreview({ previewJson, showPreview, onToggleShow }: ConfigPreviewProps) {
  const { t, theme } = useI18n();
  const [copied, setCopied] = useState(false);

  const editorTheme = useMemo(() => {
    if (theme === "dark") return xcodeDark;
    if (theme === "light") return xcodeLight;
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    return prefersDark ? xcodeDark : xcodeLight;
  }, [theme]);

  function handleCopyJson() {
    navigator.clipboard.writeText(previewJson).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className={`collapsible-section ${showPreview ? "expanded" : ""}`}>
      {/* 将 ConfigEditor.tsx 第 673-731 行的 JSX 搬入此处 */}
    </div>
  );
}

export default ConfigPreview;
```

**Step 2: 在 ConfigEditor 中使用**

替换 ConfigEditor.tsx 第 672-731 行，删除 `handleCopyJson` 函数（第 177-182 行）、`copied` state（第 45 行）和 ConfigEditor 中不再需要的 `editorTheme` useMemo。

**Step 3: 验证**

Run: `pnpm tauri dev`
Expected: JSON 预览和复制功能正常

**Step 4: Commit**

```bash
git add src/components/ConfigPreview.tsx src/components/ConfigEditor.tsx
git commit -m "refactor: 提取 ConfigPreview 子组件"
```

---

### Task 12: 提取共享 CSS

**Files:**
- Create: `src/styles/shared.css`
- Modify: `src/components/ConfigList.css`
- Modify: `src/components/MemoryPage.css`
- Modify: `src/App.css` (导入共享样式)

**Step 1: 创建共享样式文件**

创建 `src/styles/shared.css`，提取重复的空状态样式：

```css
/* ==================== 空状态 ==================== */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  color: var(--text-secondary);
}

.empty-state .empty-icon {
  margin-bottom: 16px;
  opacity: 0.5;
}

.empty-state .empty-text {
  font-size: 18px;
  font-weight: 500;
  margin-bottom: 8px;
}

.empty-state .empty-hint {
  font-size: 14px;
  color: var(--text-muted);
  text-align: center;
  max-width: 360px;
  line-height: 1.5;
}

/* ==================== z-index 层级 ==================== */
:root {
  --z-sticky: 10;
  --z-drawer: 100;
  --z-overlay: 99;
  --z-dialog: 200;
  --z-toast: 9999;
}
```

**Step 2: 在 App.css 中导入**

在 `src/App.css` 顶部添加：
```css
@import "./styles/shared.css";
```

**Step 3: 更新 ConfigList**

将 `src/components/ConfigList.css` 中的 `.config-list-empty` 及其子元素样式（第 8-31 行）删除。
在 ConfigList.tsx 的空状态 div 中将 `className="config-list-empty"` 改为 `className="empty-state"`。

**Step 4: 更新 MemoryPage**

将 `src/components/MemoryPage.css` 中的 `.memory-empty` 及其子元素样式（第 25-52 行）删除。
在 MemoryPage.tsx 的空状态 div 中将 `className="memory-empty"` 改为 `className="empty-state"`。

**Step 5: 更新 Toast.css 中的 z-index**

将 `src/components/Toast.css` 中 `.toast-container` 的 `z-index: 9999` 改为 `z-index: var(--z-toast)`。

**Step 6: 验证**

Run: `pnpm tauri dev`
Expected: 配置列表和记忆列表的空状态样式显示正常

**Step 7: Commit**

```bash
git add src/styles/shared.css src/App.css src/components/ConfigList.css src/components/ConfigList.tsx src/components/MemoryPage.css src/components/MemoryPage.tsx src/components/Toast.css
git commit -m "refactor: 提取共享 CSS，消除空状态样式重复"
```

---

### Task 13: 全量验证

**Step 1: Rust 编译检查**

Run: `cd src-tauri && cargo check && cargo clippy`
Expected: 无错误，无 clippy warning

**Step 2: 前端类型检查**

Run: `pnpm build`
Expected: TypeScript 编译和 Vite 构建通过

**Step 3: 功能验证**

Run: `pnpm tauri dev`

手动验证：
- [ ] 添加配置 → 成功，Toast 绿色提示
- [ ] 编辑配置 → 成功
- [ ] 激活配置 → 成功，~/.claude/settings.json 权限为 600
- [ ] 复制配置 → 成功
- [ ] 删除配置 → 确认对话框 → 成功
- [ ] 拖拽排序 → 正常
- [ ] 通用配置编辑 → 正常
- [ ] 插件管理 → 添加/删除/切换正常
- [ ] JSON 预览 → 复制正常
- [ ] 记忆管理 → 添加/编辑/删除/启用正常
- [ ] ESC 键 → 所有弹窗/抽屉正常关闭
- [ ] 系统托盘 → 切换配置正常
- [ ] 错误场景 → Toast 红色提示

**Step 4: Commit（如有修复）**

```bash
git commit -m "fix: 全量验证修复"
```
