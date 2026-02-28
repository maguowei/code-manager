use crate::tray::rebuild_tray_menu;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use tauri::AppHandle;
use uuid::Uuid;

/// 新增/更新配置的数据传输对象
#[derive(Debug, Deserialize)]
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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeConfig {
    pub id: String,
    pub name: String,
    pub description: String,
    pub api_key: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub api_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub website_url: Option<String>,
    // 模型配置
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub thinking_model: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub haiku_model: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sonnet_model: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub opus_model: Option<String>,
    // 高级选项
    #[serde(skip_serializing_if = "Option::is_none")]
    pub always_thinking_enabled: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub disable_nonessential_traffic: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub skip_web_fetch_preflight: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub enable_lsp_tool: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub has_completed_onboarding: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub enable_extra_marketplaces: Option<bool>,
    // 语言配置
    #[serde(skip_serializing_if = "Option::is_none")]
    pub preferred_language: Option<String>,
    // 通用配置
    #[serde(skip_serializing_if = "Option::is_none")]
    pub use_defaults: Option<bool>,
    // 插件配置
    #[serde(skip_serializing_if = "Option::is_none")]
    pub enabled_plugins: Option<HashMap<String, bool>>,
    // 元数据
    pub is_active: bool,
    pub created_at: u64,
    pub updated_at: u64,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppState {
    pub configs: Vec<ClaudeConfig>,
    pub active_config_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub defaults: Option<String>,
}


/// 获取应用配置文件路径
fn get_config_path() -> PathBuf {
    crate::utils::get_home_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
        .join(".config")
        .join("ai-manager")
        .join("configs.json")
}

/// 获取 Claude 设置文件路径
fn get_claude_config_path() -> PathBuf {
    crate::utils::get_home_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
        .join(".claude")
        .join("settings.json")
}

/// 从文件加载应用状态，失败时返回默认值
pub fn load_state() -> AppState {
    let path = get_config_path();
    crate::utils::read_json_file(&path)
}

/// 将应用状态序列化并写入文件
pub fn save_state(state: &AppState) -> Result<(), String> {
    let path = get_config_path();
    let content = serde_json::to_string_pretty(state).map_err(|e| e.to_string())?;
    crate::utils::ensure_dir_and_write(&path, &content)
}

/// 深度合并两个 JSON 值：base 为基础，overlay 的字段优先覆盖
/// 对象递归合并，非对象类型 overlay 优先
fn deep_merge(base: serde_json::Value, overlay: serde_json::Value) -> serde_json::Value {
    match (base, overlay) {
        (serde_json::Value::Object(mut base_map), serde_json::Value::Object(overlay_map)) => {
            for (key, overlay_val) in overlay_map {
                let merged = if let Some(base_val) = base_map.remove(&key) {
                    deep_merge(base_val, overlay_val)
                } else {
                    overlay_val
                };
                base_map.insert(key, merged);
            }
            serde_json::Value::Object(base_map)
        }
        // 非对象类型，overlay 优先
        (_, overlay) => overlay,
    }
}

/// 将指定配置应用到 ~/.claude/settings.json
pub fn apply_config(config: &ClaudeConfig) -> Result<(), String> {
    let mut env = serde_json::Map::new();
    env.insert(
        "ANTHROPIC_AUTH_TOKEN".to_string(),
        serde_json::Value::String(config.api_key.clone()),
    );

    if let Some(ref api_url) = config.api_url {
        env.insert(
            "ANTHROPIC_BASE_URL".to_string(),
            serde_json::Value::String(api_url.clone()),
        );
    }
    if let Some(ref model) = config.model {
        env.insert(
            "ANTHROPIC_MODEL".to_string(),
            serde_json::Value::String(model.clone()),
        );
    }
    if let Some(ref haiku_model) = config.haiku_model {
        env.insert(
            "ANTHROPIC_DEFAULT_HAIKU_MODEL".to_string(),
            serde_json::Value::String(haiku_model.clone()),
        );
    }
    if let Some(ref sonnet_model) = config.sonnet_model {
        env.insert(
            "ANTHROPIC_DEFAULT_SONNET_MODEL".to_string(),
            serde_json::Value::String(sonnet_model.clone()),
        );
    }
    if let Some(ref opus_model) = config.opus_model {
        env.insert(
            "ANTHROPIC_DEFAULT_OPUS_MODEL".to_string(),
            serde_json::Value::String(opus_model.clone()),
        );
    }
    if config.disable_nonessential_traffic == Some(true) {
        env.insert(
            "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC".to_string(),
            serde_json::Value::String("1".to_string()),
        );
    }
    if config.enable_lsp_tool == Some(true) {
        env.insert(
            "ENABLE_LSP_TOOL".to_string(),
            serde_json::Value::String("1".to_string()),
        );
    }

    let mut claude_config = serde_json::Map::new();

    if let Some(ref lang) = config.preferred_language {
        if lang != "english" {
            claude_config.insert(
                "language".to_string(),
                serde_json::Value::String(lang.clone()),
            );
        }
    }

    if config.always_thinking_enabled == Some(true) {
        claude_config.insert(
            "alwaysThinkingEnabled".to_string(),
            serde_json::Value::Bool(true),
        );
    }

    if config.skip_web_fetch_preflight == Some(true) {
        claude_config.insert(
            "skipWebFetchPreflight".to_string(),
            serde_json::Value::Bool(true),
        );
    }

    if config.has_completed_onboarding == Some(true) {
        claude_config.insert(
            "hasCompletedOnboarding".to_string(),
            serde_json::Value::Bool(true),
        );
    }

    if config.enable_extra_marketplaces == Some(true) {
        let marketplaces: serde_json::Value = serde_json::json!({
            "claude-plugins-official": {
                "source": {
                    "source": "github",
                    "repo": "anthropics/claude-plugins-official"
                }
            },
            "chrome-devtools-plugins": {
                "source": {
                    "source": "github",
                    "repo": "ChromeDevTools/chrome-devtools-mcp"
                }
            }
        });
        claude_config.insert("extraKnownMarketplaces".to_string(), marketplaces);
    }

    if let Some(ref plugins) = config.enabled_plugins {
        if !plugins.is_empty() {
            let plugins_map: serde_json::Map<String, serde_json::Value> = plugins
                .iter()
                .map(|(k, v)| (k.clone(), serde_json::Value::Bool(*v)))
                .collect();
            claude_config.insert(
                "enabledPlugins".to_string(),
                serde_json::Value::Object(plugins_map),
            );
        }
    }

    claude_config.insert("env".to_string(), serde_json::Value::Object(env));

    // 加载通用配置并深度合并（仅在当前配置启用通用配置时）
    let state = load_state();
    let final_config = if config.use_defaults == Some(true) {
        if let Some(ref defaults_str) = state.defaults {
            if let Ok(defaults_val) = serde_json::from_str::<serde_json::Value>(defaults_str) {
                let current_val = serde_json::Value::Object(claude_config);
                deep_merge(defaults_val, current_val)
            } else {
                serde_json::Value::Object(claude_config)
            }
        } else {
            serde_json::Value::Object(claude_config)
        }
    } else {
        serde_json::Value::Object(claude_config)
    };

    let path = get_claude_config_path();
    let content = serde_json::to_string_pretty(&final_config).map_err(|e| e.to_string())?;
    crate::utils::ensure_dir_and_write(&path, &content)
}

#[tauri::command]
pub fn get_configs() -> Result<AppState, String> {
    Ok(load_state())
}

/// 使用 ConfigData DTO 构建并保存新配置
#[tauri::command]
pub fn add_config(app_handle: AppHandle, data: ConfigData) -> Result<ClaudeConfig, String> {
    // 加锁保护并发写入
    let _lock = crate::utils::CONFIG_LOCK
        .lock()
        .map_err(|e| format!("获取锁失败: {}", e))?;

    let mut state = load_state();
    let now = crate::utils::current_timestamp();

    let config = ClaudeConfig {
        id: Uuid::new_v4().to_string(),
        name: data.name,
        description: data.description,
        api_key: data.api_key,
        api_url: data.api_url,
        website_url: data.website_url,
        model: data.model,
        thinking_model: data.thinking_model,
        haiku_model: data.haiku_model,
        sonnet_model: data.sonnet_model,
        opus_model: data.opus_model,
        always_thinking_enabled: data.always_thinking_enabled,
        disable_nonessential_traffic: data.disable_nonessential_traffic,
        skip_web_fetch_preflight: data.skip_web_fetch_preflight,
        enable_lsp_tool: data.enable_lsp_tool,
        has_completed_onboarding: data.has_completed_onboarding,
        enable_extra_marketplaces: data.enable_extra_marketplaces,
        preferred_language: data.preferred_language,
        use_defaults: data.use_defaults,
        enabled_plugins: data.enabled_plugins,
        is_active: false,
        created_at: now,
        updated_at: now,
    };

    state.configs.push(config.clone());
    save_state(&state)?;
    rebuild_tray_menu(&app_handle);

    Ok(config)
}

/// 使用 ConfigData DTO 更新已有配置
#[tauri::command]
pub fn update_config(
    app_handle: AppHandle,
    id: String,
    data: ConfigData,
) -> Result<ClaudeConfig, String> {
    // 加锁保护并发写入
    let _lock = crate::utils::CONFIG_LOCK
        .lock()
        .map_err(|e| format!("获取锁失败: {}", e))?;

    let mut state = load_state();

    let config = state
        .configs
        .iter_mut()
        .find(|c| c.id == id)
        .ok_or("未找到指定配置")?;

    config.name = data.name;
    config.description = data.description;
    config.api_key = data.api_key;
    config.api_url = data.api_url;
    config.website_url = data.website_url;
    config.model = data.model;
    config.thinking_model = data.thinking_model;
    config.haiku_model = data.haiku_model;
    config.sonnet_model = data.sonnet_model;
    config.opus_model = data.opus_model;
    config.always_thinking_enabled = data.always_thinking_enabled;
    config.disable_nonessential_traffic = data.disable_nonessential_traffic;
    config.skip_web_fetch_preflight = data.skip_web_fetch_preflight;
    config.enable_lsp_tool = data.enable_lsp_tool;
    config.has_completed_onboarding = data.has_completed_onboarding;
    config.enable_extra_marketplaces = data.enable_extra_marketplaces;
    config.preferred_language = data.preferred_language;
    config.use_defaults = data.use_defaults;
    config.enabled_plugins = data.enabled_plugins;
    config.updated_at = crate::utils::current_timestamp();

    let updated = config.clone();
    save_state(&state)?;

    // 若该配置当前处于激活状态，重新应用以更新 Claude 设置
    if state.active_config_id == Some(id) {
        apply_config(&updated)?;
    }
    rebuild_tray_menu(&app_handle);

    Ok(updated)
}

/// 删除指定配置，若该配置处于激活状态则清除激活标记
#[tauri::command]
pub fn delete_config(app_handle: AppHandle, id: String) -> Result<(), String> {
    // 加锁保护并发写入
    let _lock = crate::utils::CONFIG_LOCK
        .lock()
        .map_err(|e| format!("获取锁失败: {}", e))?;

    let mut state = load_state();

    state.configs.retain(|c| c.id != id);

    if state.active_config_id.as_deref() == Some(id.as_str()) {
        state.active_config_id = None;
    }

    save_state(&state)?;
    rebuild_tray_menu(&app_handle);
    Ok(())
}

/// 复制指定配置，新配置插入到原配置后面
#[tauri::command]
pub fn duplicate_config(app_handle: AppHandle, id: String) -> Result<ClaudeConfig, String> {
    // 加锁保护并发写入
    let _lock = crate::utils::CONFIG_LOCK
        .lock()
        .map_err(|e| format!("获取锁失败: {}", e))?;

    let mut state = load_state();

    let index = state
        .configs
        .iter()
        .position(|c| c.id == id)
        .ok_or("未找到指定配置")?;

    let original = &state.configs[index];
    let now = crate::utils::current_timestamp();

    let new_config = ClaudeConfig {
        id: Uuid::new_v4().to_string(),
        name: format!("{} (副本)", original.name),
        description: original.description.clone(),
        api_key: original.api_key.clone(),
        api_url: original.api_url.clone(),
        website_url: original.website_url.clone(),
        model: original.model.clone(),
        thinking_model: original.thinking_model.clone(),
        haiku_model: original.haiku_model.clone(),
        sonnet_model: original.sonnet_model.clone(),
        opus_model: original.opus_model.clone(),
        always_thinking_enabled: original.always_thinking_enabled,
        disable_nonessential_traffic: original.disable_nonessential_traffic,
        skip_web_fetch_preflight: original.skip_web_fetch_preflight,
        enable_lsp_tool: original.enable_lsp_tool,
        has_completed_onboarding: original.has_completed_onboarding,
        enable_extra_marketplaces: original.enable_extra_marketplaces,
        preferred_language: original.preferred_language.clone(),
        use_defaults: original.use_defaults,
        enabled_plugins: original.enabled_plugins.clone(),
        is_active: false,
        created_at: now,
        updated_at: now,
    };

    let result = new_config.clone();
    // 插入到原项后面
    state.configs.insert(index + 1, new_config);
    save_state(&state)?;
    rebuild_tray_menu(&app_handle);

    Ok(result)
}

/// 按给定 id 顺序重新排列配置列表
#[tauri::command]
pub fn reorder_configs(app_handle: AppHandle, ids: Vec<String>) -> Result<(), String> {
    // 加锁保护并发写入
    let _lock = crate::utils::CONFIG_LOCK
        .lock()
        .map_err(|e| format!("获取锁失败: {}", e))?;

    let mut state = load_state();

    // 按 ids 顺序重排 configs
    let mut reordered: Vec<ClaudeConfig> = Vec::with_capacity(ids.len());
    for id in &ids {
        if let Some(config) = state.configs.iter().find(|c| &c.id == id) {
            reordered.push(config.clone());
        }
    }

    // 保留不在 ids 中的配置（防御性处理）
    for config in &state.configs {
        if !ids.contains(&config.id) {
            reordered.push(config.clone());
        }
    }

    state.configs = reordered;
    save_state(&state)?;
    rebuild_tray_menu(&app_handle);
    Ok(())
}

/// 激活指定配置的内部实现，可从 tray.rs 调用（无需 AppHandle）
pub fn activate_config_inner(id: String) -> Result<(), String> {
    // 加锁保护并发写入
    let _lock = crate::utils::CONFIG_LOCK
        .lock()
        .map_err(|e| format!("获取锁失败: {}", e))?;

    let mut state = load_state();

    // 查找并验证配置存在
    let config = state
        .configs
        .iter()
        .find(|c| c.id == id)
        .ok_or("Config not found")?
        .clone();

    // 更新激活状态
    for c in state.configs.iter_mut() {
        c.is_active = c.id == id;
    }
    state.active_config_id = Some(id);

    // 保存状态并应用配置
    save_state(&state)?;
    apply_config(&config)?;

    Ok(())
}

/// 激活指定配置并刷新托盘菜单
#[tauri::command]
pub fn activate_config(app_handle: AppHandle, id: String) -> Result<(), String> {
    activate_config_inner(id)?;
    rebuild_tray_menu(&app_handle);
    Ok(())
}

#[tauri::command]
pub fn get_defaults() -> Result<Option<String>, String> {
    let state = load_state();
    Ok(state.defaults)
}

/// 更新通用配置内容，若有激活配置且启用了通用配置则重新应用
#[tauri::command]
pub fn update_defaults(app_handle: AppHandle, content: String) -> Result<(), String> {
    // 加锁保护并发写入
    let _lock = crate::utils::CONFIG_LOCK
        .lock()
        .map_err(|e| format!("获取锁失败: {}", e))?;

    let mut state = load_state();
    let trimmed = content.trim().to_string();
    if trimmed.is_empty() {
        state.defaults = None;
    } else {
        // 校验 JSON 合法性
        serde_json::from_str::<serde_json::Value>(&trimmed)
            .map_err(|e| format!("JSON 格式无效: {}", e))?;
        state.defaults = Some(trimmed);
    }
    save_state(&state)?;

    // 如果有激活的配置且启用了通用配置，重新 apply
    if let Some(ref active_id) = state.active_config_id {
        if let Some(config) = state.configs.iter().find(|c| &c.id == active_id) {
            if config.use_defaults == Some(true) {
                apply_config(config)?;
            }
        }
    }
    rebuild_tray_menu(&app_handle);

    Ok(())
}
