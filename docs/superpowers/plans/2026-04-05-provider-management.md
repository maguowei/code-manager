# Provider 管理功能实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 AI Manager 增加 Provider（API 供应商）管理功能，支持智谱、火山方舟、阿里云百炼、MiniMax、Kimi、Xiaomi MiMo 等国内 Claude API 分销商的 Coding Plan / Token Plan。

**Architecture:** 新增 `provider.rs` Rust 模块负责 Provider 的 CRUD 和持久化（`~/.config/ai-manager/providers.json`）；`config.rs` 的 `build_config_value` 接受 `provider_api_url` 参数实现 Provider 的 URL 注入；前端新增 ProviderPage 独立管理页面，ConfigEditor 集成 Provider 下拉选择器和模型 combobox。

**Tech Stack:** Rust + Tauri 2.0, React 19 + TypeScript, pnpm, once_cell, uuid, serde_json

---

## 文件变更地图

### 新增文件
- `src-tauri/src/provider.rs` — Provider 数据结构、内置数据、CRUD 命令
- `src/components/ProviderPage.tsx` — Provider 管理页面（列表 + Drawer）
- `src/components/ProviderItem.tsx` — Provider 列表项组件
- `src/components/ProviderEditor.tsx` — Provider 编辑面板

### 修改文件
- `src-tauri/src/utils.rs` — 新增 PROVIDER_LOCK + lock_provider()
- `src-tauri/src/config.rs` — ClaudeConfig/ConfigData 新增 provider_id，build_config_value 接受 provider_api_url 参数
- `src-tauri/src/lib.rs` — 注册 provider 模块和命令
- `src/types.ts` — 新增 Provider/ProviderModel 类型，ClaudeConfig 新增 providerId，TabType 新增 "providers"
- `src/i18n.ts` — 新增 Provider 相关翻译键
- `src/App.tsx` — 新增 providers state，loadProviders，buildConfigData 传 providerId，渲染 ProviderPage
- `src/components/Sidebar.tsx` — 新增 Provider 导航项
- `src/components/ConfigEditor.tsx` — 新增 Provider 下拉 + 模型 combobox
- `src/components/ConfigItem.tsx` — 新增 Provider badge 显示

---

## Task 1: utils.rs — 新增 PROVIDER_LOCK

**Files:**
- Modify: `src-tauri/src/utils.rs:9-18`

- [ ] **Step 1: 在 SKILLS_LOCK 后面新增 PROVIDER_LOCK 和 lock_provider()**

  在 `src-tauri/src/utils.rs` 中，在 `SKILLS_LOCK` 定义后（第 18 行后）插入：

  ```rust
  /// Provider 文件操作互斥锁
  pub static PROVIDER_LOCK: Lazy<Mutex<()>> = Lazy::new(|| Mutex::new(()));
  ```

  在 `lock_skills()` 函数后（第 104 行后）插入：

  ```rust
  /// 获取 Provider 文件写锁，防止并发写入
  pub fn lock_provider() -> Result<MutexGuard<'static, ()>, String> {
      acquire_lock(&PROVIDER_LOCK)
  }
  ```

- [ ] **Step 2: 验证编译**

  ```bash
  cd src-tauri && cargo check 2>&1 | tail -5
  ```

  预期：无错误输出

- [ ] **Step 3: 提交**

  ```bash
  git add src-tauri/src/utils.rs
  git commit -m "feat(provider): 新增 PROVIDER_LOCK 并发保护"
  ```

---

## Task 2: provider.rs — 新建 Provider 模块

**Files:**
- Create: `src-tauri/src/provider.rs`

- [ ] **Step 1: 创建文件，写入完整的 provider.rs**

  创建 `src-tauri/src/provider.rs`，内容如下：

  ```rust
  use serde::{Deserialize, Serialize};
  use std::path::PathBuf;
  use uuid::Uuid;

  /// Provider 下的单个模型
  #[derive(Debug, Clone, Serialize, Deserialize)]
  #[serde(rename_all = "camelCase")]
  pub struct ProviderModel {
      pub id: String,       // 写入 ANTHROPIC_MODEL 等环境变量的值
      pub name: String,     // 显示名称
      pub category: String, // "opus" | "sonnet" | "haiku" | "other"
  }

  /// API 供应商
  #[derive(Debug, Clone, Serialize, Deserialize)]
  #[serde(rename_all = "camelCase")]
  pub struct Provider {
      pub id: String,
      pub name: String,
      pub slug: String,
      pub api_url: String,              // ANTHROPIC_BASE_URL，空字符串表示直连
      #[serde(skip_serializing_if = "Option::is_none")]
      pub doc_url: Option<String>,
      pub is_builtin: bool,
      pub models: Vec<ProviderModel>,
      pub created_at: u64,
      pub updated_at: u64,
  }

  /// 新增/更新 Provider 的数据传输对象
  #[derive(Debug, Deserialize)]
  #[serde(rename_all = "camelCase")]
  pub struct ProviderData {
      pub name: String,
      pub slug: String,
      pub api_url: String,
      pub doc_url: Option<String>,
      pub models: Vec<ProviderModel>,
  }

  /// Provider 存储文件的顶层结构
  #[derive(Debug, Default, Serialize, Deserialize)]
  #[serde(rename_all = "camelCase")]
  struct ProviderState {
      providers: Vec<Provider>,
  }

  /// Provider 存储文件路径
  fn get_provider_path() -> PathBuf {
      crate::utils::get_app_data_dir().join("providers.json")
  }

  fn load_state() -> ProviderState {
      crate::utils::read_json_file(&get_provider_path())
  }

  fn save_state(state: &ProviderState) -> Result<(), String> {
      crate::utils::save_json_file(&get_provider_path(), state)
  }

  /// 内置 Provider 的固定 ID 常量
  const ID_ANTHROPIC: &str = "00000000-0000-0000-0000-000000000001";
  const ID_ZHIPU: &str = "00000000-0000-0000-0000-000000000002";
  const ID_VOLCENGINE: &str = "00000000-0000-0000-0000-000000000003";
  const ID_DASHSCOPE: &str = "00000000-0000-0000-0000-000000000004";
  const ID_MINIMAX: &str = "00000000-0000-0000-0000-000000000005";
  const ID_KIMI: &str = "00000000-0000-0000-0000-000000000006";
  const ID_XIAOMI_MIMO: &str = "00000000-0000-0000-0000-000000000007";

  /// 生成内置 Provider 列表（含默认模型）
  fn builtin_providers() -> Vec<Provider> {
      let now = crate::utils::current_timestamp();

      let common_models = vec![
          ProviderModel { id: "claude-opus-4-6".to_string(), name: "Claude Opus 4.6".to_string(), category: "opus".to_string() },
          ProviderModel { id: "claude-sonnet-4-6".to_string(), name: "Claude Sonnet 4.6".to_string(), category: "sonnet".to_string() },
          ProviderModel { id: "claude-haiku-4-5-20251001".to_string(), name: "Claude Haiku 4.5".to_string(), category: "haiku".to_string() },
      ];

      vec![
          Provider {
              id: ID_ANTHROPIC.to_string(),
              name: "Anthropic (Direct)".to_string(),
              slug: "anthropic".to_string(),
              api_url: String::new(),
              doc_url: Some("https://docs.anthropic.com".to_string()),
              is_builtin: true,
              models: common_models.clone(),
              created_at: now,
              updated_at: now,
          },
          Provider {
              id: ID_ZHIPU.to_string(),
              name: "智谱 GLM Coding Plan".to_string(),
              slug: "zhipu".to_string(),
              api_url: "https://open.bigmodel.cn/api/anthropic".to_string(),
              doc_url: Some("https://docs.bigmodel.cn/cn/coding-plan/overview".to_string()),
              is_builtin: true,
              models: common_models.clone(),
              created_at: now,
              updated_at: now,
          },
          Provider {
              id: ID_VOLCENGINE.to_string(),
              name: "火山方舟 Coding Plan".to_string(),
              slug: "volcengine".to_string(),
              api_url: "https://ark.cn-beijing.volces.com/api/coding".to_string(),
              doc_url: Some("https://www.volcengine.com/docs/82379/1928262".to_string()),
              is_builtin: true,
              models: common_models.clone(),
              created_at: now,
              updated_at: now,
          },
          Provider {
              id: ID_DASHSCOPE.to_string(),
              name: "阿里云百炼 Coding Plan".to_string(),
              slug: "dashscope".to_string(),
              api_url: "https://coding.dashscope.aliyuncs.com/apps/anthropic".to_string(),
              doc_url: Some("https://help.aliyun.com/zh/model-studio/claude-code-coding-plan".to_string()),
              is_builtin: true,
              models: common_models.clone(),
              created_at: now,
              updated_at: now,
          },
          Provider {
              id: ID_MINIMAX.to_string(),
              name: "MiniMax Token Plan".to_string(),
              slug: "minimax".to_string(),
              api_url: "https://api.minimaxi.com/anthropic".to_string(),
              doc_url: Some("https://platform.minimaxi.com/docs/token-plan/claude-code".to_string()),
              is_builtin: true,
              models: common_models.clone(),
              created_at: now,
              updated_at: now,
          },
          Provider {
              id: ID_KIMI.to_string(),
              name: "Kimi Code Plan".to_string(),
              slug: "kimi".to_string(),
              api_url: "https://api.kimi.com/coding/".to_string(),
              doc_url: Some("https://www.kimi.com/code/docs/more/third-party-agents.html".to_string()),
              is_builtin: true,
              models: common_models.clone(),
              created_at: now,
              updated_at: now,
          },
          Provider {
              id: ID_XIAOMI_MIMO.to_string(),
              name: "Xiaomi MiMo Token Plan".to_string(),
              slug: "xiaomi-mimo".to_string(),
              api_url: "https://api.xiaomimimo.com/anthropic".to_string(),
              doc_url: Some("https://platform.xiaomimimo.com/#/docs/integration/claudecode".to_string()),
              is_builtin: true,
              models: common_models.clone(),
              created_at: now,
              updated_at: now,
          },
      ]
  }

  /// 根据 ID 读取单个 Provider（不加锁，供其他模块调用）
  pub fn get_provider_by_id(id: &str) -> Option<Provider> {
      let state = load_state();
      state.providers.into_iter().find(|p| p.id == id)
  }

  /// 获取所有 Provider；首次调用时自动初始化内置 Provider
  #[tauri::command]
  pub fn get_providers() -> Result<Vec<Provider>, String> {
      let path = get_provider_path();
      if !path.exists() {
          // 首次启动：写入内置 Provider
          let state = ProviderState { providers: builtin_providers() };
          save_state(&state)?;
          return Ok(state.providers);
      }

      let mut state = load_state();

      // 补充缺失的内置 Provider（版本升级场景）
      let builtins = builtin_providers();
      let existing_slugs: std::collections::HashSet<String> =
          state.providers.iter().filter(|p| p.is_builtin).map(|p| p.slug.clone()).collect();

      let mut changed = false;
      for bp in builtins {
          if !existing_slugs.contains(&bp.slug) {
              state.providers.push(bp);
              changed = true;
          }
      }
      if changed {
          save_state(&state)?;
      }

      Ok(state.providers)
  }

  /// 添加自定义 Provider
  #[tauri::command]
  pub fn add_provider(data: ProviderData) -> Result<Provider, String> {
      let _lock = crate::utils::lock_provider()?;
      let mut state = load_state();

      // slug 唯一性检查
      if state.providers.iter().any(|p| p.slug == data.slug) {
          return Err(format!("Provider slug '{}' 已存在", data.slug));
      }

      let now = crate::utils::current_timestamp();
      let provider = Provider {
          id: Uuid::new_v4().to_string(),
          name: data.name,
          slug: data.slug,
          api_url: data.api_url,
          doc_url: data.doc_url,
          is_builtin: false,
          models: data.models,
          created_at: now,
          updated_at: now,
      };
      state.providers.push(provider.clone());
      save_state(&state)?;
      Ok(provider)
  }

  /// 更新 Provider（内置和自定义均可）
  #[tauri::command]
  pub fn update_provider(id: String, data: ProviderData) -> Result<Provider, String> {
      let _lock = crate::utils::lock_provider()?;
      let mut state = load_state();

      let provider = state.providers.iter_mut()
          .find(|p| p.id == id)
          .ok_or_else(|| format!("Provider '{}' 不存在", id))?;

      // slug 唯一性检查（排除自身）
      let slug_conflict = state.providers.iter().any(|p| p.slug == data.slug && p.id != id);
      if slug_conflict {
          return Err(format!("Provider slug '{}' 已被其他 Provider 使用", data.slug));
      }

      provider.name = data.name;
      provider.slug = data.slug;
      provider.api_url = data.api_url;
      provider.doc_url = data.doc_url;
      provider.models = data.models;
      provider.updated_at = crate::utils::current_timestamp();

      let updated = provider.clone();
      save_state(&state)?;
      Ok(updated)
  }

  /// 删除自定义 Provider；内置 Provider 不可删除
  #[tauri::command]
  pub fn delete_provider(id: String) -> Result<(), String> {
      let _lock = crate::utils::lock_provider()?;
      let mut state = load_state();

      let provider = state.providers.iter()
          .find(|p| p.id == id)
          .ok_or_else(|| format!("Provider '{}' 不存在", id))?;

      if provider.is_builtin {
          return Err("内置 Provider 不可删除".to_string());
      }

      // 检查是否有 Config 引用了此 Provider（直接读取 configs.json，避免循环依赖）
      let configs_path = crate::utils::get_app_data_dir().join("configs.json");
      if configs_path.exists() {
          let raw: serde_json::Value = crate::utils::read_json_file(&configs_path);
          if let Some(arr) = raw.get("configs").and_then(|v| v.as_array()) {
              let in_use = arr.iter().any(|c| {
                  c.get("providerId")
                      .and_then(|v| v.as_str())
                      .map(|pid| pid == id)
                      .unwrap_or(false)
              });
              if in_use {
                  return Err("该 Provider 正在被配置使用，请先解除关联".to_string());
              }
          }
      }

      state.providers.retain(|p| p.id != id);
      save_state(&state)?;
      Ok(())
  }

  /// 将内置 Provider 重置为默认值
  #[tauri::command]
  pub fn reset_provider(id: String) -> Result<Provider, String> {
      let _lock = crate::utils::lock_provider()?;
      let mut state = load_state();

      let provider = state.providers.iter_mut()
          .find(|p| p.id == id)
          .ok_or_else(|| format!("Provider '{}' 不存在", id))?;

      if !provider.is_builtin {
          return Err("只有内置 Provider 支持重置".to_string());
      }

      let builtins = builtin_providers();
      let default = builtins.into_iter()
          .find(|p| p.id == id)
          .ok_or_else(|| format!("未找到内置 Provider 默认值 '{}'", id))?;

      provider.name = default.name;
      provider.slug = default.slug;
      provider.api_url = default.api_url;
      provider.doc_url = default.doc_url;
      provider.models = default.models;
      provider.updated_at = crate::utils::current_timestamp();

      let reset = provider.clone();
      save_state(&state)?;
      Ok(reset)
  }
  ```

- [ ] **Step 2: 验证编译**

  ```bash
  cd src-tauri && cargo check 2>&1 | tail -10
  ```

  预期：无错误。若报 `uuid` 不在 scope，确认 `Cargo.toml` 中 `uuid = { version = "1", features = ["v4"] }` 已存在（config.rs 已在使用 uuid）。

- [ ] **Step 3: 提交**

  ```bash
  git add src-tauri/src/provider.rs
  git commit -m "feat(provider): 新建 provider.rs 模块，含内置 Provider 数据和 CRUD 命令"
  ```

---

## Task 3: config.rs — 支持 provider_id 字段

**Files:**
- Modify: `src-tauri/src/config.rs`

- [ ] **Step 1: ClaudeConfig 新增 provider_id 字段**

  在 `ClaudeConfig` 结构体的 `extra_fields` 字段后（第 152 行后）插入：

  ```rust
      // Provider 关联
      #[serde(skip_serializing_if = "Option::is_none")]
      pub provider_id: Option<String>,
  ```

- [ ] **Step 2: ConfigData DTO 新增 provider_id 字段**

  在 `ConfigData` 结构体的 `extra_fields` 字段后（第 32 行后）插入：

  ```rust
      pub provider_id: Option<String>,
  ```

- [ ] **Step 3: into_preview_config() 传递 provider_id**

  在 `into_preview_config()` 的 `ClaudeConfig { ... }` 初始化块中，在 `extra_fields: self.extra_fields,` 后插入：

  ```rust
              provider_id: self.provider_id,
  ```

- [ ] **Step 4: apply_to() 传递 provider_id**

  在 `apply_to()` 中，在 `config.extra_fields = self.extra_fields;` 后插入：

  ```rust
          config.provider_id = self.provider_id;
  ```

- [ ] **Step 5: build_config_value 新增 provider_api_url 参数**

  将函数签名从：
  ```rust
  fn build_config_value(config: &ClaudeConfig, defaults: Option<&str>) -> serde_json::Value {
  ```
  改为：
  ```rust
  fn build_config_value(config: &ClaudeConfig, defaults: Option<&str>, provider_api_url: Option<&str>) -> serde_json::Value {
  ```

  将原来的 `ANTHROPIC_BASE_URL` 写入逻辑：
  ```rust
      if let Some(ref api_url) = config.api_url {
          env.insert(
              "ANTHROPIC_BASE_URL".to_string(),
              serde_json::Value::String(api_url.clone()),
          );
      }
  ```

  替换为（config.api_url 优先，fallback 到 provider_api_url）：
  ```rust
      let effective_api_url = config.api_url.as_deref()
          .filter(|s| !s.is_empty())
          .or_else(|| provider_api_url.filter(|s| !s.is_empty()));
      if let Some(url) = effective_api_url {
          env.insert(
              "ANTHROPIC_BASE_URL".to_string(),
              serde_json::Value::String(url.to_string()),
          );
      }
  ```

- [ ] **Step 6: apply_config 解析 provider_id 并传入 build_config_value**

  将 `apply_config` 函数体：
  ```rust
  pub fn apply_config(config: &ClaudeConfig, defaults: Option<&str>) -> Result<(), String> {
      let final_config = build_config_value(config, defaults);
  ```
  改为：
  ```rust
  pub fn apply_config(config: &ClaudeConfig, defaults: Option<&str>) -> Result<(), String> {
      let provider_api_url = config.provider_id.as_deref()
          .and_then(|pid| crate::provider::get_provider_by_id(pid))
          .map(|p| p.api_url);
      let provider_api_url_ref = provider_api_url.as_deref();
      let final_config = build_config_value(config, defaults, provider_api_url_ref);
  ```

- [ ] **Step 7: preview_config 也传入 provider_api_url**

  将 `preview_config` 函数体从：
  ```rust
  pub fn preview_config(data: ConfigData, defaults: Option<String>) -> Result<String, String> {
      let config = data.into_preview_config();
      let final_config = build_config_value(&config, defaults.as_deref());
      serde_json::to_string_pretty(&final_config).map_err(|e| e.to_string())
  }
  ```
  改为（先取 provider_id 再 consume data，借用在 into_preview_config 之前结束）：
  ```rust
  pub fn preview_config(data: ConfigData, defaults: Option<String>) -> Result<String, String> {
      let provider_api_url = data.provider_id.as_deref()
          .and_then(|pid| crate::provider::get_provider_by_id(pid))
          .map(|p| p.api_url);
      let config = data.into_preview_config();
      let final_config = build_config_value(&config, defaults.as_deref(), provider_api_url.as_deref());
      serde_json::to_string_pretty(&final_config).map_err(|e| e.to_string())
  }
  ```

- [ ] **Step 8: 验证编译**

  ```bash
  cd src-tauri && cargo check 2>&1 | tail -10
  ```

  预期：无错误

- [ ] **Step 9: 提交**

  ```bash
  git add src-tauri/src/config.rs
  git commit -m "feat(provider): config.rs 支持 provider_id 字段和 Provider API URL 注入"
  ```

---

## Task 4: lib.rs — 注册 provider 模块和命令

**Files:**
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: 添加 mod 声明**

  在 `mod skills;` 后插入：
  ```rust
  mod provider;
  ```

- [ ] **Step 2: 添加 use 导入**

  在 `use skills::{...};` 后插入：
  ```rust
  use provider::{
      add_provider, delete_provider, get_providers, reset_provider, update_provider,
  };
  ```

- [ ] **Step 3: 注册命令到 invoke_handler**

  在 `sync_skill_to_codex,` 后插入：
  ```rust
              get_providers,
              add_provider,
              update_provider,
              delete_provider,
              reset_provider,
  ```

- [ ] **Step 4: 验证编译**

  ```bash
  cd src-tauri && cargo check 2>&1 | tail -10
  ```

  预期：无错误

- [ ] **Step 5: 提交**

  ```bash
  git add src-tauri/src/lib.rs
  git commit -m "feat(provider): 注册 provider 模块和 5 个 Tauri 命令"
  ```

---

## Task 5: types.ts — 新增前端类型

**Files:**
- Modify: `src/types.ts`

- [ ] **Step 1: TabType 新增 "providers"**

  将：
  ```typescript
  export type TabType = "configs" | "memory" | "skills" | "stats" | "history";
  ```
  改为：
  ```typescript
  export type TabType = "configs" | "providers" | "memory" | "skills" | "stats" | "history";
  ```

- [ ] **Step 2: 新增 ProviderModel 和 Provider 接口**

  在 `export interface ClaudeConfig {` 前插入：

  ```typescript
  export interface ProviderModel {
    id: string;
    name: string;
    category: "opus" | "sonnet" | "haiku" | "other";
  }

  export interface Provider {
    id: string;
    name: string;
    slug: string;
    apiUrl: string;
    docUrl?: string;
    isBuiltin: boolean;
    models: ProviderModel[];
    createdAt: number;
    updatedAt: number;
  }
  ```

- [ ] **Step 3: ClaudeConfig 新增 providerId 字段**

  在 `extraFields` 字段后插入：
  ```typescript
    // Provider 关联
    providerId?: string;
  ```

- [ ] **Step 4: 验证 TypeScript 编译**

  ```bash
  pnpm build 2>&1 | tail -10
  ```

  预期：无类型错误

- [ ] **Step 5: 提交**

  ```bash
  git add src/types.ts
  git commit -m "feat(provider): 新增 Provider/ProviderModel 类型，ClaudeConfig 支持 providerId"
  ```

---

## Task 6: i18n.ts — 新增 Provider 翻译键

**Files:**
- Modify: `src/i18n.ts`

- [ ] **Step 1: 在 zh 翻译对象中新增 Provider 相关键**

  在 `"nav.stats": "统计",` 后插入（找到 `nav.stats` 那行，约第 138 行）：

  ```typescript
      "nav.providers": "Provider",

      // Provider 管理页面
      "providers.title": "Provider 管理",
      "providers.description": "管理 Claude Code API 供应商，支持国内 Coding Plan / Token Plan",
      "providers.addProvider": "添加 Provider",
      "providers.editTitle": "编辑 Provider",
      "providers.addTitle": "添加 Provider",
      "providers.builtin": "内置",
      "providers.custom": "自定义",
      "providers.name": "供应商名称",
      "providers.namePlaceholder": "例如：我的自定义 Provider",
      "providers.slug": "标识符 (slug)",
      "providers.slugPlaceholder": "例如：my-provider（小写字母、数字、连字符）",
      "providers.apiUrl": "API Base URL",
      "providers.apiUrlPlaceholder": "https://api.example.com/anthropic",
      "providers.apiUrlHint": "留空则直连 Anthropic 官方 API",
      "providers.docUrl": "文档链接",
      "providers.docUrlPlaceholder": "https://docs.example.com（可选）",
      "providers.models": "可用模型",
      "providers.addModel": "添加模型",
      "providers.modelId": "模型 ID",
      "providers.modelIdPlaceholder": "claude-sonnet-4-6",
      "providers.modelName": "显示名称",
      "providers.modelNamePlaceholder": "Claude Sonnet 4.6",
      "providers.modelCategory": "等级",
      "providers.empty": "暂无自定义 Provider",
      "providers.emptyHint": "内置 Provider 可直接使用，也可添加自定义 Provider",
      "providers.save": "保存",
      "providers.cancel": "取消",
      "providers.delete": "删除",
      "providers.reset": "重置默认值",
      "providers.resetConfirm": "确认将此 Provider 重置为默认值？",
      "providers.deleteConfirm": "确认删除此 Provider？",
      "providers.viewDocs": "查看文档",
      "toast.providerLoadError": "加载 Provider 列表失败",
      "toast.providerSaved": "Provider 已保存",
      "toast.providerSaveError": "保存 Provider 失败",
      "toast.providerDeleted": "Provider 已删除",
      "toast.providerDeleteError": "删除 Provider 失败",
      "toast.providerResetError": "重置 Provider 失败",

      // ConfigEditor 中的 Provider 选择
      "configModal.provider": "API 供应商",
      "configModal.providerPlaceholder": "选择 Provider（可选）",
      "configModal.providerHint": "选择后自动填充 API URL，模型字段显示该 Provider 的可用模型",
      "configModal.providerNone": "无（手动配置）",
  ```

- [ ] **Step 2: 在 en 翻译对象中同步添加相同的键**

  找到 en 翻译对象中对应的 `nav.stats` 位置，插入：

  ```typescript
      "nav.providers": "Providers",

      // Provider page
      "providers.title": "Provider Management",
      "providers.description": "Manage Claude Code API providers, support domestic Coding Plan / Token Plan",
      "providers.addProvider": "Add Provider",
      "providers.editTitle": "Edit Provider",
      "providers.addTitle": "Add Provider",
      "providers.builtin": "Built-in",
      "providers.custom": "Custom",
      "providers.name": "Provider Name",
      "providers.namePlaceholder": "e.g. My Custom Provider",
      "providers.slug": "Identifier (slug)",
      "providers.slugPlaceholder": "e.g. my-provider (lowercase, digits, hyphens)",
      "providers.apiUrl": "API Base URL",
      "providers.apiUrlPlaceholder": "https://api.example.com/anthropic",
      "providers.apiUrlHint": "Leave empty to use Anthropic API directly",
      "providers.docUrl": "Documentation URL",
      "providers.docUrlPlaceholder": "https://docs.example.com (optional)",
      "providers.models": "Available Models",
      "providers.addModel": "Add Model",
      "providers.modelId": "Model ID",
      "providers.modelIdPlaceholder": "claude-sonnet-4-6",
      "providers.modelName": "Display Name",
      "providers.modelNamePlaceholder": "Claude Sonnet 4.6",
      "providers.modelCategory": "Category",
      "providers.empty": "No custom providers",
      "providers.emptyHint": "Built-in providers are ready to use. You can also add custom providers.",
      "providers.save": "Save",
      "providers.cancel": "Cancel",
      "providers.delete": "Delete",
      "providers.reset": "Reset to Default",
      "providers.resetConfirm": "Reset this provider to default values?",
      "providers.deleteConfirm": "Delete this provider?",
      "providers.viewDocs": "View Docs",
      "toast.providerLoadError": "Failed to load providers",
      "toast.providerSaved": "Provider saved",
      "toast.providerSaveError": "Failed to save provider",
      "toast.providerDeleted": "Provider deleted",
      "toast.providerDeleteError": "Failed to delete provider",
      "toast.providerResetError": "Failed to reset provider",

      // ConfigEditor
      "configModal.provider": "API Provider",
      "configModal.providerPlaceholder": "Select Provider (optional)",
      "configModal.providerHint": "Selecting a provider auto-fills API URL and shows available models",
      "configModal.providerNone": "None (manual config)",
  ```

- [ ] **Step 3: 验证 TypeScript 编译**

  ```bash
  pnpm build 2>&1 | tail -5
  ```

- [ ] **Step 4: 提交**

  ```bash
  git add src/i18n.ts
  git commit -m "feat(provider): 新增 Provider 管理相关国际化翻译键"
  ```

---

## Task 7: App.tsx — 新增 providers 状态和路由

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: 新增 import**

  在现有 import 块中，添加 Provider 类型和 ProviderPage 组件导入：

  ```typescript
  import { ClaudeConfig, TabType, isTauri, Provider } from "./types";
  // ...（其他 import 保持不变）
  import ProviderPage from "./components/ProviderPage";
  ```

- [ ] **Step 2: 新增 providers state**

  在 `const [isDetailDrawerOpen, setIsDetailDrawerOpen] = useState(false);` 后插入：

  ```typescript
  const [providers, setProviders] = useState<Provider[]>([]);
  ```

- [ ] **Step 3: 新增 loadProviders 函数**

  在 `loadConfigs` 函数定义后插入：

  ```typescript
  const loadProviders = useCallback(async () => {
    if (!isTauri()) return;
    try {
      const list = await invoke<Provider[]>("get_providers");
      setProviders(list);
    } catch {
      showToast(t("toast.providerLoadError"), "error");
    }
  }, [showToast, t]);
  ```

- [ ] **Step 4: 在 useEffect 中加载 providers**

  将：
  ```typescript
  useEffect(() => {
    loadConfigs();
  }, []);
  ```
  改为：
  ```typescript
  useEffect(() => {
    loadConfigs();
    loadProviders();
  }, []);
  ```

- [ ] **Step 5: buildConfigData 传入 providerId**

  将 `buildConfigData` 函数中 `extraFields` 后添加：

  ```typescript
      providerId: config.providerId || null,
  ```

- [ ] **Step 6: ConfigEditor 传入 providers**

  找到 `<ConfigEditor` 的 JSX，在现有 props 中添加：
  ```tsx
  providers={providers}
  ```

- [ ] **Step 7: 新增 providers 路由**

  在 `activeTab === "stats"` 的 JSX 分支中，在 `activeTab === "history"` 后添加：

  ```tsx
  } : activeTab === "providers" ? (
    <ProviderPage providers={providers} onProvidersChange={loadProviders} />
  ) : (
  ```

  注意：按现有模式，stats 和 history 是全屏页，providers 应该也是全屏页，所以修改 activeTab 判断链，确保 providers 在 history 的位置前面（或后面）被独立处理：

  ```tsx
  {activeTab === "stats" ? (
    <StatsPage />
  ) : activeTab === "history" ? (
    <HistoryPage />
  ) : activeTab === "providers" ? (
    <ProviderPage providers={providers} onProvidersChange={loadProviders} />
  ) : (
    // ... 现有的 configs/memory/skills 列表区域
  ```

- [ ] **Step 8: 验证 TypeScript 编译（忽略缺失组件的错误）**

  ```bash
  pnpm build 2>&1 | grep -v "ProviderPage\|ProviderEditor\|ProviderItem" | tail -10
  ```

- [ ] **Step 9: 提交**

  ```bash
  git add src/App.tsx
  git commit -m "feat(provider): App.tsx 新增 providers 状态、loadProviders 和路由"
  ```

---

## Task 8: Sidebar.tsx — 新增 Provider 导航项

**Files:**
- Modify: `src/components/Sidebar.tsx`

- [ ] **Step 1: 在 skills 导航按钮后插入 providers 按钮**

  找到 skills 的 `</button>` 闭合标签（约第 61 行），在其后插入：

  ```tsx
        <button
          className={`nav-item ${activeTab === "providers" ? "active" : ""}`}
          onClick={() => onTabChange("providers")}
          aria-label={t("nav.providers")}
          aria-current={activeTab === "providers" ? "page" : undefined}
          data-tooltip={t("nav.providers")}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="3"/>
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
          </svg>
        </button>
  ```

- [ ] **Step 2: 验证编译**

  ```bash
  pnpm build 2>&1 | tail -5
  ```

- [ ] **Step 3: 提交**

  ```bash
  git add src/components/Sidebar.tsx
  git commit -m "feat(provider): Sidebar 新增 Provider 导航项"
  ```

---

## Task 9: ProviderItem.tsx — Provider 列表项

**Files:**
- Create: `src/components/ProviderItem.tsx`

- [ ] **Step 1: 创建 ProviderItem.tsx**

  ```tsx
  import { memo } from "react";
  import { Provider } from "../types";
  import { useI18n } from "../i18n";
  import { TrashIcon } from "./Icons";

  interface ProviderItemProps {
    provider: Provider;
    isEditing: boolean;
    onEdit: (provider: Provider) => void;
    onDelete: (id: string) => void;
    onReset: (id: string) => void;
  }

  const ProviderItem = memo(function ProviderItem({
    provider,
    isEditing,
    onEdit,
    onDelete,
    onReset,
  }: ProviderItemProps) {
    const { t } = useI18n();

    return (
      <div
        className={`provider-item ${isEditing ? "editing" : ""}`}
        onClick={() => onEdit(provider)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === "Enter" && onEdit(provider)}
      >
        <div className="provider-item-main">
          <div className="provider-item-header">
            <span className="provider-item-name">{provider.name}</span>
            <span className={`provider-item-badge ${provider.isBuiltin ? "builtin" : "custom"}`}>
              {provider.isBuiltin ? t("providers.builtin") : t("providers.custom")}
            </span>
          </div>
          <div className="provider-item-slug">{provider.slug}</div>
          {provider.apiUrl && (
            <div className="provider-item-url">{provider.apiUrl}</div>
          )}
        </div>
        <div className="provider-item-actions" onClick={(e) => e.stopPropagation()}>
          {provider.isBuiltin && (
            <button
              className="provider-action-btn"
              onClick={() => onReset(provider.id)}
              title={t("providers.reset")}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="1 4 1 10 7 10"/>
                <path d="M3.51 15a9 9 0 1 0 .49-3.27"/>
              </svg>
            </button>
          )}
          {!provider.isBuiltin && (
            <button
              className="provider-action-btn danger"
              onClick={() => onDelete(provider.id)}
              title={t("providers.delete")}
            >
              <TrashIcon />
            </button>
          )}
        </div>
      </div>
    );
  });

  export default ProviderItem;
  ```

- [ ] **Step 2: 提交**

  ```bash
  git add src/components/ProviderItem.tsx
  git commit -m "feat(provider): 新增 ProviderItem 列表项组件"
  ```

---

## Task 10: ProviderEditor.tsx — Provider 编辑面板

**Files:**
- Create: `src/components/ProviderEditor.tsx`

- [ ] **Step 1: 创建 ProviderEditor.tsx**

  ```tsx
  import { useState } from "react";
  import { Provider, ProviderModel } from "../types";
  import { useI18n } from "../i18n";
  import { ChevronLeftIcon } from "./Icons";

  interface ProviderEditorProps {
    provider: Provider | null;
    onSave: (data: {
      name: string;
      slug: string;
      apiUrl: string;
      docUrl: string;
      models: ProviderModel[];
    }) => void;
    onClose: () => void;
  }

  function ProviderEditor({ provider, onSave, onClose }: ProviderEditorProps) {
    const { t } = useI18n();
    const [name, setName] = useState(provider?.name || "");
    const [slug, setSlug] = useState(provider?.slug || "");
    const [apiUrl, setApiUrl] = useState(provider?.apiUrl || "");
    const [docUrl, setDocUrl] = useState(provider?.docUrl || "");
    const [models, setModels] = useState<ProviderModel[]>(provider?.models || []);

    function handleAddModel() {
      setModels((prev) => [
        ...prev,
        { id: "", name: "", category: "sonnet" },
      ]);
    }

    function handleModelChange(
      index: number,
      field: keyof ProviderModel,
      value: string
    ) {
      setModels((prev) =>
        prev.map((m, i) => (i === index ? { ...m, [field]: value } : m))
      );
    }

    function handleRemoveModel(index: number) {
      setModels((prev) => prev.filter((_, i) => i !== index));
    }

    function handleSubmit() {
      if (!name.trim()) return;
      onSave({
        name: name.trim(),
        slug: slug.trim(),
        apiUrl: apiUrl.trim(),
        docUrl: docUrl.trim(),
        models: models.filter((m) => m.id.trim()),
      });
    }

    return (
      <div className="editor-container">
        <div className="editor-header">
          <button className="back-btn" onClick={onClose}>
            <ChevronLeftIcon />
          </button>
          <span className="editor-title">
            {provider ? t("providers.editTitle") : t("providers.addTitle")}
          </span>
          <button className="save-btn" onClick={handleSubmit}>
            {t("providers.save")}
          </button>
        </div>

        <div className="editor-body">
          <div className="form-group">
            <label className="form-label">{t("providers.name")}</label>
            <input
              className="form-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("providers.namePlaceholder")}
            />
          </div>

          <div className="form-group">
            <label className="form-label">{t("providers.slug")}</label>
            <input
              className="form-input"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder={t("providers.slugPlaceholder")}
              disabled={provider?.isBuiltin}
            />
          </div>

          <div className="form-group">
            <label className="form-label">{t("providers.apiUrl")}</label>
            <input
              className="form-input"
              value={apiUrl}
              onChange={(e) => setApiUrl(e.target.value)}
              placeholder={t("providers.apiUrlPlaceholder")}
            />
            <span className="form-hint">{t("providers.apiUrlHint")}</span>
          </div>

          <div className="form-group">
            <label className="form-label">{t("providers.docUrl")}</label>
            <input
              className="form-input"
              value={docUrl}
              onChange={(e) => setDocUrl(e.target.value)}
              placeholder={t("providers.docUrlPlaceholder")}
            />
          </div>

          <div className="form-group">
            <div className="form-label-row">
              <label className="form-label">{t("providers.models")}</label>
              <button className="add-model-btn" onClick={handleAddModel}>
                + {t("providers.addModel")}
              </button>
            </div>
            {models.map((model, index) => (
              <div key={index} className="model-row">
                <input
                  className="form-input model-id"
                  value={model.id}
                  onChange={(e) => handleModelChange(index, "id", e.target.value)}
                  placeholder={t("providers.modelIdPlaceholder")}
                />
                <input
                  className="form-input model-name"
                  value={model.name}
                  onChange={(e) => handleModelChange(index, "name", e.target.value)}
                  placeholder={t("providers.modelNamePlaceholder")}
                />
                <select
                  className="form-select model-category"
                  value={model.category}
                  onChange={(e) => handleModelChange(index, "category", e.target.value)}
                >
                  <option value="opus">Opus</option>
                  <option value="sonnet">Sonnet</option>
                  <option value="haiku">Haiku</option>
                  <option value="other">Other</option>
                </select>
                <button
                  className="remove-model-btn"
                  onClick={() => handleRemoveModel(index)}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  export default ProviderEditor;
  ```

- [ ] **Step 2: 提交**

  ```bash
  git add src/components/ProviderEditor.tsx
  git commit -m "feat(provider): 新增 ProviderEditor 编辑面板组件"
  ```

---

## Task 11: ProviderPage.tsx — Provider 管理页面

**Files:**
- Create: `src/components/ProviderPage.tsx`

- [ ] **Step 1: 创建 ProviderPage.tsx**

  ```tsx
  import { useState, useCallback } from "react";
  import { invoke } from "@tauri-apps/api/core";
  import { Provider, ProviderModel } from "../types";
  import { useI18n } from "../i18n";
  import { useToast } from "../hooks/useToast";
  import ProviderItem from "./ProviderItem";
  import ProviderEditor from "./ProviderEditor";
  import Drawer from "./Drawer";
  import ConfirmDialog from "./ConfirmDialog";
  import { PlusIcon } from "./Icons";
  import useEscapeKey from "../hooks/useEscapeKey";

  interface ProviderPageProps {
    providers: Provider[];
    onProvidersChange: () => void;
  }

  function ProviderPage({ providers, onProvidersChange }: ProviderPageProps) {
    const { t } = useI18n();
    const { showToast } = useToast();
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);
    const [editingProvider, setEditingProvider] = useState<Provider | null>(null);
    const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

    useEscapeKey(
      useCallback(() => {
        setEditingProvider(null);
        setIsDrawerOpen(false);
      }, []),
      isDrawerOpen
    );

    function handleEdit(provider: Provider) {
      setEditingProvider(provider);
      setIsDrawerOpen(true);
    }

    function handleAdd() {
      setEditingProvider(null);
      setIsDrawerOpen(true);
    }

    async function handleSave(data: {
      name: string;
      slug: string;
      apiUrl: string;
      docUrl: string;
      models: ProviderModel[];
    }) {
      try {
        const payload = {
          name: data.name,
          slug: data.slug,
          apiUrl: data.apiUrl,
          docUrl: data.docUrl || null,
          models: data.models,
        };
        if (editingProvider) {
          await invoke("update_provider", { id: editingProvider.id, data: payload });
        } else {
          await invoke("add_provider", { data: payload });
        }
        onProvidersChange();
        setIsDrawerOpen(false);
        setEditingProvider(null);
        showToast(t("toast.providerSaved"));
      } catch (error) {
        showToast(t("toast.providerSaveError"), "error");
      }
    }

    async function handleDelete(id: string) {
      try {
        // 后端自行读取 configs.json 检查引用
        await invoke("delete_provider", { id });
        onProvidersChange();
        showToast(t("toast.providerDeleted"));
      } catch (error) {
        showToast(String(error) || t("toast.providerDeleteError"), "error");
      }
    }

    async function handleReset(id: string) {
      try {
        await invoke("reset_provider", { id });
        onProvidersChange();
        showToast(t("toast.providerSaved"));
      } catch {
        showToast(t("toast.providerResetError"), "error");
      }
    }

    return (
      <div className="page-container">
        <div className={`list-section ${isDrawerOpen ? "compressed" : ""}`}>
          <div className="page-header">
            <h1 className="page-title">{t("providers.title")}</h1>
          </div>
          <button className="add-config-btn" onClick={handleAdd}>
            <PlusIcon />
            <span>{t("providers.addProvider")}</span>
          </button>
          {providers.length === 0 ? (
            <div className="empty-state">
              <p>{t("providers.empty")}</p>
              <p className="empty-hint">{t("providers.emptyHint")}</p>
            </div>
          ) : (
            <div className="provider-list">
              {providers.map((provider) => (
                <ProviderItem
                  key={provider.id}
                  provider={provider}
                  isEditing={isDrawerOpen && editingProvider?.id === provider.id}
                  onEdit={handleEdit}
                  onDelete={(id) => setPendingDeleteId(id)}
                  onReset={handleReset}
                />
              ))}
            </div>
          )}
        </div>

        <Drawer isOpen={isDrawerOpen} onClose={() => { setIsDrawerOpen(false); setEditingProvider(null); }}>
          <ProviderEditor
            provider={editingProvider}
            onSave={handleSave}
            onClose={() => { setIsDrawerOpen(false); setEditingProvider(null); }}
          />
        </Drawer>

        {pendingDeleteId && (
          <ConfirmDialog
            message={t("providers.deleteConfirm")}
            onConfirm={() => { handleDelete(pendingDeleteId); setPendingDeleteId(null); }}
            onCancel={() => setPendingDeleteId(null)}
          />
        )}
      </div>
    );
  }

  export default ProviderPage;
  ```

- [ ] **Step 2: 验证 TypeScript 编译**

  ```bash
  pnpm build 2>&1 | tail -10
  ```

  预期：无错误

- [ ] **Step 3: 提交**

  ```bash
  git add src/components/ProviderPage.tsx src/components/ProviderItem.tsx src/components/ProviderEditor.tsx
  git commit -m "feat(provider): 新增 ProviderPage 管理页面及子组件"
  ```

---

## Task 12: ConfigEditor.tsx — Provider 下拉 + 模型 combobox

**Files:**
- Modify: `src/components/ConfigEditor.tsx`

- [ ] **Step 1: 更新 ConfigEditorProps 接口，接收 providers**

  将：
  ```typescript
  interface ConfigEditorProps {
    config: ClaudeConfig | null;
    defaults: string;
    onSave: (config: Omit<ClaudeConfig, "id" | "createdAt" | "updatedAt" | "isActive">, defaults?: string) => void;
    onClose: () => void;
  }
  ```
  改为：
  ```typescript
  interface ConfigEditorProps {
    config: ClaudeConfig | null;
    defaults: string;
    providers: Provider[];
    onSave: (config: Omit<ClaudeConfig, "id" | "createdAt" | "updatedAt" | "isActive">, defaults?: string) => void;
    onClose: () => void;
  }
  ```

  并在文件顶部 import 中添加 `Provider` 类型：
  ```typescript
  import { ClaudeConfig, Provider } from "../types";
  ```

- [ ] **Step 2: 新增 providerId state**

  在函数体的 useState 声明区（第 40 行左右），在 `showApiKey` 的 useState 后插入：

  ```typescript
  const [providerId, setProviderId] = useState(config?.providerId || "");
  ```

- [ ] **Step 3: 新增 selectedProvider 派生值**

  在 `isEditingPreview` ref 声明后插入：

  ```typescript
  const selectedProvider = providers.find((p) => p.id === providerId) ?? null;
  ```

- [ ] **Step 4: 处理 Provider 选择联动**

  新增 `handleProviderChange` 函数（在 handleSubmit 前）：

  ```typescript
  function handleProviderChange(newProviderId: string) {
    setProviderId(newProviderId);
    const p = providers.find((pv) => pv.id === newProviderId);
    if (p) {
      // 自动填充 apiUrl（若当前 apiUrl 为空）
      if (!apiUrl) setApiUrl(p.apiUrl);
      // 切换 Provider 时清空已选模型
      setModel("");
      setHaikuModel("");
      setSonnetModel("");
      setOpusModel("");
    }
  }
  ```

- [ ] **Step 5: handleSubmit 中传入 providerId**

  找到 `handleSubmit` 函数（调用 `onSave` 的地方），在传给 `onSave` 的对象中，在 `extraFields` 后添加：

  ```typescript
        providerId: providerId || undefined,
  ```

- [ ] **Step 6: 在 apiKey 字段上方插入 Provider 下拉选择器**

  找到 `{/* apiKey */}` 或 apiKey input 所在区域（约第 200 行），在其前面插入：

  ```tsx
          {/* Provider 选择 */}
          <div className="form-row">
            <div className="form-group full-width">
              <label className="form-label">{t("configModal.provider")}</label>
              <div className="provider-select-row">
                <select
                  className="form-select"
                  value={providerId}
                  onChange={(e) => handleProviderChange(e.target.value)}
                >
                  <option value="">{t("configModal.providerNone")}</option>
                  {providers.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                {selectedProvider?.docUrl && (
                  <a
                    href={selectedProvider.docUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="provider-doc-link"
                    title={t("providers.viewDocs")}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                      <polyline points="15 3 21 3 21 9"/>
                      <line x1="10" y1="14" x2="21" y2="3"/>
                    </svg>
                  </a>
                )}
              </div>
              <span className="form-hint">{t("configModal.providerHint")}</span>
            </div>
          </div>
  ```

- [ ] **Step 7: 将模型字段改造为 combobox（datalist 方案）**

  找到 "主模型" 的 input（约第 280 行），在 `<input ... value={model} ...>` 改造为：

  ```tsx
                <input
                  className="form-input"
                  list={selectedProvider ? "model-list-main" : undefined}
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder={t("configModal.modelPlaceholder")}
                />
                {selectedProvider && (
                  <datalist id="model-list-main">
                    {selectedProvider.models.map((m) => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </datalist>
                )}
  ```

  同理，对 `haikuModel` 改造（只显示 category==="haiku" 的模型）：

  ```tsx
                <input
                  className="form-input"
                  list={selectedProvider ? "model-list-haiku" : undefined}
                  value={haikuModel}
                  onChange={(e) => setHaikuModel(e.target.value)}
                  placeholder={t("configModal.haikuModelPlaceholder")}
                />
                {selectedProvider && (
                  <datalist id="model-list-haiku">
                    {selectedProvider.models
                      .filter((m) => m.category === "haiku" || m.category === "other")
                      .map((m) => (
                        <option key={m.id} value={m.id}>{m.name}</option>
                      ))}
                  </datalist>
                )}
  ```

  对 `sonnetModel` 改造（category==="sonnet"）：

  ```tsx
                <input
                  className="form-input"
                  list={selectedProvider ? "model-list-sonnet" : undefined}
                  value={sonnetModel}
                  onChange={(e) => setSonnetModel(e.target.value)}
                  placeholder={t("configModal.sonnetModelPlaceholder")}
                />
                {selectedProvider && (
                  <datalist id="model-list-sonnet">
                    {selectedProvider.models
                      .filter((m) => m.category === "sonnet" || m.category === "other")
                      .map((m) => (
                        <option key={m.id} value={m.id}>{m.name}</option>
                      ))}
                  </datalist>
                )}
  ```

  对 `opusModel` 改造（category==="opus"）：

  ```tsx
                <input
                  className="form-input"
                  list={selectedProvider ? "model-list-opus" : undefined}
                  value={opusModel}
                  onChange={(e) => setOpusModel(e.target.value)}
                  placeholder={t("configModal.opusModelPlaceholder")}
                />
                {selectedProvider && (
                  <datalist id="model-list-opus">
                    {selectedProvider.models
                      .filter((m) => m.category === "opus" || m.category === "other")
                      .map((m) => (
                        <option key={m.id} value={m.id}>{m.name}</option>
                      ))}
                  </datalist>
                )}
  ```

- [ ] **Step 8: 验证 TypeScript 编译**

  ```bash
  pnpm build 2>&1 | tail -10
  ```

  预期：无错误

- [ ] **Step 9: 提交**

  ```bash
  git add src/components/ConfigEditor.tsx
  git commit -m "feat(provider): ConfigEditor 新增 Provider 下拉和模型 datalist"
  ```

---

## Task 13: ConfigItem.tsx — 显示 Provider badge

**Files:**
- Modify: `src/components/ConfigItem.tsx`

- [ ] **Step 1: 更新 ConfigItemProps，接收 providers**

  在 `ConfigItemProps` 接口中添加：
  ```typescript
  providers: Provider[];
  ```

  并在文件顶部 import 中添加：
  ```typescript
  import { ClaudeConfig, Provider } from "../types";
  ```

- [ ] **Step 2: 函数签名中解构 providers**

  在 `function ConfigItem({ config, index, ...` 的解构列表中，在 `onDrop,` 后添加：
  ```typescript
  providers,
  ```

- [ ] **Step 3: 派生 providerName**

  在 `const classNames = ...` 前插入：
  ```typescript
  const providerName = config.providerId
    ? (providers.find((p) => p.id === config.providerId)?.name ?? null)
    : null;
  ```

- [ ] **Step 4: 在配置名称旁显示 Provider badge**

  找到配置名称的显示区域，在 `config.name` 显示后插入 badge：
  ```tsx
  {providerName && (
    <span className="config-provider-badge">{providerName}</span>
  )}
  ```

- [ ] **Step 5: 更新 ConfigList.tsx，传递 providers**

  找到 `src/components/ConfigList.tsx`，在 `ConfigItem` 的 props 中添加 `providers={providers}`，并更新 `ConfigListProps` 接口新增 `providers: Provider[]`，在组件顶部 import 中加入 `Provider`。

  在 `ConfigListProps` 接口中添加：
  ```typescript
  providers: Provider[];
  ```

  在 `function ConfigList({... }` 解构中添加 `providers,`。

  在 `<ConfigItem ... />` 中添加：
  ```tsx
  providers={providers}
  ```

- [ ] **Step 6: App.tsx 中传 providers 给 ConfigList**

  在 `<ConfigList` 的 props 中添加：
  ```tsx
  providers={providers}
  ```

- [ ] **Step 7: 验证 TypeScript 编译**

  ```bash
  pnpm build 2>&1 | tail -10
  ```

  预期：无错误

- [ ] **Step 8: 提交**

  ```bash
  git add src/components/ConfigItem.tsx src/components/ConfigList.tsx src/App.tsx
  git commit -m "feat(provider): ConfigItem 显示关联的 Provider 名称 badge"
  ```

---

## Task 14: 最终验证

**Files:** 全部

- [ ] **Step 1: Rust 完整编译检查**

  ```bash
  cd src-tauri && cargo clippy 2>&1 | grep "^error" | head -20
  ```

  预期：无 error 级别输出

- [ ] **Step 2: 前端完整编译**

  ```bash
  pnpm build 2>&1 | tail -10
  ```

  预期：Build 成功，无类型错误

- [ ] **Step 3: 启动开发环境验证**

  ```bash
  pnpm tauri dev
  ```

  手动验证清单：
  - [ ] 侧边栏显示 Provider 导航项
  - [ ] Provider 页面加载，显示 7 个内置 Provider
  - [ ] 点击内置 Provider 可编辑 URL 和模型列表
  - [ ] 可新增自定义 Provider
  - [ ] 配置编辑器中出现 Provider 下拉选择器
  - [ ] 选择 Provider 后 apiUrl 自动填充
  - [ ] 模型字段出现下拉候选
  - [ ] 配置列表项显示关联的 Provider 名称
  - [ ] 应用配置后 ~/.claude/settings.json 包含正确的 ANTHROPIC_BASE_URL

- [ ] **Step 4: 提交最终验证记录**

  ```bash
  git add -A
  git commit -m "feat(provider): Provider 管理功能实施完成"
  ```
