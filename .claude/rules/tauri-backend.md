---
paths:
  - "src-tauri/**/*"
  - "src/types.ts"
  - "src/hooks/useTauriEvent.ts"
  - "src-tauri/capabilities/default.json"
---

# Tauri Backend Rules

## 先读文件

- Tauri 命令注册：`src-tauri/src/lib.rs`
- Rust 公共工具：`src-tauri/src/utils.rs`
- Tauri capability：`src-tauri/capabilities/default.json`
- 日志与诊断：`src-tauri/src/logging.rs`

## Command 同步流程

新增或修改 Tauri command 时：

1. 在对应 Rust 模块中定义 `#[tauri::command]`。
2. 在 `src-tauri/src/lib.rs` 的 `generate_handler![]` 中注册。
3. 前端通过 `@tauri-apps/api/core` 的 `invoke()` 调用。
4. 同步更新 `src/types.ts`、i18n 文案和相关测试。
5. 如果涉及 Tauri 插件 API，同步检查 `src-tauri/capabilities/default.json`。

前端调用示例：

```ts
import { invoke } from "@tauri-apps/api/core";

const result = await invoke("get_config_workspace");
```

## Rust 公共工具

新增 Rust 存储逻辑时优先复用：

- `lock_config()`
- `lock_memory()`
- `lock_stats()`
- `lock_skills()`
- `read_json_file()`
- `read_json_file_strict()`
- `save_json_file()`
- `ensure_dir_and_write()`
- `ensure_dir_and_write_atomic()`

如果要改这些 helper 的语义，先审视所有调用方；它们属于全局基础设施。

## 后端边界

- 后端继续负责配置合并、路径校验、目录遍历安全、真实落盘和日志脱敏。
- 路径相关 command 必须继续防止符号链接、绝对路径和 `..` 路径逃逸。
- 不要记录密钥、Token、完整 settings、Memory 内容、Skill 文件内容、模型测试请求体或响应体。
- 新增日志字段时优先记录稳定标识符和状态，例如 `event=profile.apply status=ok profile_id=...`。

## 验证

- Rust 测试：`cd src-tauri && cargo test`
- Rust lint：`cd src-tauri && cargo clippy -- -D warnings`
- 前后端契约改动至少跑：`pnpm build` 与 `cd src-tauri && cargo test`
