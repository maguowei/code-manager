# ModelScope Provider Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为内置 Provider 列表新增 `ModelScope`，并补齐最小回归测试。

**Architecture:** 保持现有 Provider 读取流程不变，只更新内置 Provider JSON 数据，并在 `provider.rs` 中增加一个针对内置列表的测试。这样前端无需额外改动，即可自动展示和使用新 Provider。

**Tech Stack:** Rust, Tauri 2.0, serde_json

---

## 文件变更地图

- Modify: `src-tauri/resources/builtin-providers.json` — 新增 `ModelScope` 内置条目
- Modify: `src-tauri/src/provider.rs` — 新增内置 Provider 回归测试

### Task 1: 为 ModelScope 补失败测试

**Files:**
- Modify: `src-tauri/src/provider.rs`

- [ ] **Step 1: 写一个新的内置 Provider 测试**

  断言 `builtin_providers()` 返回值中包含 `slug == "modelscope"` 的条目，并检查 `base_url`、`doc_url` 与模型列表。

- [ ] **Step 2: 运行单测确认先失败**

  Run: `cargo test builtin_providers_include_modelscope_defaults`

  Expected: FAIL，因为当前内置列表尚未包含 `ModelScope`

### Task 2: 更新内置 Provider 数据

**Files:**
- Modify: `src-tauri/resources/builtin-providers.json`

- [ ] **Step 1: 新增 ModelScope 条目**

  追加一条内置 Provider，字段值与设计文档保持一致。

- [ ] **Step 2: 重新运行单测确认通过**

  Run: `cargo test builtin_providers_include_modelscope_defaults`

  Expected: PASS

### Task 3: 做完整验证

**Files:**
- Modify: `src-tauri/src/provider.rs`
- Modify: `src-tauri/resources/builtin-providers.json`

- [ ] **Step 1: 运行 Provider 相关测试**

  Run: `cargo test provider`

  Expected: PASS

- [ ] **Step 2: 记录结果并说明影响范围**

  说明这是纯内置数据扩展，前端联动能力复用现有逻辑。
