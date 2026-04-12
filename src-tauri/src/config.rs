use crate::tray::rebuild_tray_menu;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use tauri::{AppHandle, Emitter};
use uuid::Uuid;

/// 新增/更新配置的数据传输对象
#[derive(Debug, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
#[serde(deny_unknown_fields)]
pub struct ConfigData {
    pub name: String,
    pub description: String,
    pub api_key: String,
    pub base_url: Option<String>,
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
    pub agent_teams_enabled: Option<bool>,
    pub has_completed_onboarding: Option<bool>,
    pub enable_extra_marketplaces: Option<bool>,
    pub preferred_language: Option<String>,
    pub use_defaults: Option<bool>,
    pub enabled_plugins: Option<HashMap<String, bool>>,
    pub extra_fields: Option<HashMap<String, serde_json::Value>>,
    pub provider_id: Option<String>,
}

impl ConfigData {
    /// 将 DTO 转换为 ClaudeConfig（新建场景）
    fn into_config(self) -> ClaudeConfig {
        let now = crate::utils::current_timestamp();
        let mut config = self.into_preview_config();
        config.id = Uuid::new_v4().to_string();
        config.created_at = now;
        config.updated_at = now;
        config
    }

    /// 将 DTO 转换为轻量级 ClaudeConfig（预览场景，不生成 UUID 和时间戳）
    fn into_preview_config(self) -> ClaudeConfig {
        ClaudeConfig {
            id: String::new(),
            name: self.name,
            description: self.description,
            api_key: self.api_key,
            base_url: self.base_url,
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
            agent_teams_enabled: self.agent_teams_enabled,
            has_completed_onboarding: self.has_completed_onboarding,
            enable_extra_marketplaces: self.enable_extra_marketplaces,
            preferred_language: self.preferred_language,
            use_defaults: self.use_defaults,
            enabled_plugins: self.enabled_plugins,
            extra_fields: self.extra_fields,
            provider_id: self.provider_id,
            is_active: false,
            created_at: 0,
            updated_at: 0,
        }
    }

    /// 将 DTO 的字段写入已有的 ClaudeConfig（更新场景）
    fn apply_to(self, config: &mut ClaudeConfig) {
        config.name = self.name;
        config.description = self.description;
        config.api_key = self.api_key;
        config.base_url = self.base_url;
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
        config.agent_teams_enabled = self.agent_teams_enabled;
        config.has_completed_onboarding = self.has_completed_onboarding;
        config.enable_extra_marketplaces = self.enable_extra_marketplaces;
        config.preferred_language = self.preferred_language;
        config.use_defaults = self.use_defaults;
        config.enabled_plugins = self.enabled_plugins;
        config.extra_fields = self.extra_fields;
        config.provider_id = self.provider_id;
        config.updated_at = crate::utils::current_timestamp();
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeConfig {
    pub id: String,
    pub name: String,
    pub description: String,
    pub api_key: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub base_url: Option<String>,
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
    pub agent_teams_enabled: Option<bool>,
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
    // 额外字段（用户在 JSON 编辑器中手动添加的字段）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub extra_fields: Option<HashMap<String, serde_json::Value>>,
    // Provider 关联
    #[serde(skip_serializing_if = "Option::is_none")]
    pub provider_id: Option<String>,
    // 元数据
    pub is_active: bool,
    pub created_at: u64,
    pub updated_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppState {
    pub configs: Vec<ClaudeConfig>,
    pub active_config_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub defaults: Option<String>,
    /// 是否在托盘图标旁显示当前激活配置名（默认 true）
    #[serde(default = "default_true")]
    pub show_tray_title: bool,
    /// 界面语言，同时用于 tray / menubar 菜单国际化
    #[serde(default = "default_ui_language")]
    pub ui_language: String,
    /// 默认终端应用，用于项目目录一键打开
    #[serde(default = "default_terminal_app")]
    pub default_terminal_app: String,
    /// 默认编辑器应用，允许为空表示尚未配置
    #[serde(default)]
    pub default_editor_app: Option<String>,
}

fn default_true() -> bool {
    true
}

fn default_ui_language() -> String {
    "zh".to_string()
}

fn default_terminal_app() -> String {
    "terminal".to_string()
}

fn normalize_ui_language(language: &str) -> Result<&'static str, String> {
    match language {
        "zh" => Ok("zh"),
        "en" => Ok("en"),
        _ => Err("仅支持 zh / en 两种界面语言".to_string()),
    }
}

pub fn normalize_default_terminal_app(app: &str) -> Result<&'static str, String> {
    match app {
        "terminal" => Ok("terminal"),
        "iterm" => Ok("iterm"),
        "warp" => Ok("warp"),
        "ghostty" => Ok("ghostty"),
        _ => Err("仅支持 terminal / iterm / warp / ghostty 四种终端".to_string()),
    }
}

pub fn normalize_default_editor_app(app: &str) -> Result<&'static str, String> {
    match app {
        "vscode" => Ok("vscode"),
        "cursor" => Ok("cursor"),
        "windsurf" => Ok("windsurf"),
        "zed" => Ok("zed"),
        _ => Err("仅支持 vscode / cursor / windsurf / zed 四种编辑器".to_string()),
    }
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            configs: Vec::new(),
            active_config_id: None,
            defaults: None,
            show_tray_title: default_true(),
            ui_language: default_ui_language(),
            default_terminal_app: default_terminal_app(),
            default_editor_app: None,
        }
    }
}

/// 获取应用配置文件路径
fn get_config_path() -> PathBuf {
    crate::utils::get_app_data_dir().join("configs.json")
}

/// 获取 Claude 设置文件路径
fn get_claude_config_path() -> PathBuf {
    crate::utils::home_dir_or_fallback()
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
    crate::utils::save_json_file(&get_config_path(), state)
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

/// 构建配置的 JSON 表示（不含文件 I/O），供 apply_config 与 preview_config 共用。
///
/// `defaults` 为通用配置的 JSON 字符串，当 `config.use_defaults == Some(true)` 时参与深度合并。
fn build_config_value(
    config: &ClaudeConfig,
    defaults: Option<&str>,
    provider_base_url: Option<&str>,
) -> serde_json::Value {
    let mut env = serde_json::Map::new();
    env.insert(
        "ANTHROPIC_AUTH_TOKEN".to_string(),
        serde_json::Value::String(config.api_key.clone()),
    );

    let effective_base_url = config
        .base_url
        .as_deref()
        .filter(|s| !s.is_empty())
        .or_else(|| provider_base_url.filter(|s| !s.is_empty()));
    if let Some(url) = effective_base_url {
        env.insert(
            "ANTHROPIC_BASE_URL".to_string(),
            serde_json::Value::String(url.to_string()),
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
    if config.agent_teams_enabled == Some(true) {
        env.insert(
            "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS".to_string(),
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

    // 构建基础配置，若启用通用配置则深度合并（通用配置为 base，当前配置覆盖）
    let mut result = if config.use_defaults == Some(true) {
        if let Some(defaults_str) = defaults {
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

    // 合并额外字段（用户在 JSON 编辑器中手动添加的字段）
    if let Some(ref extra) = config.extra_fields {
        if let serde_json::Value::Object(ref mut map) = result {
            for (k, v) in extra {
                if let Some(existing) = map.get_mut(k) {
                    // 两者都是对象时递归合并（如 env 中的自定义环境变量）
                    if let (
                        serde_json::Value::Object(ref mut existing_map),
                        serde_json::Value::Object(extra_map),
                    ) = (existing, v)
                    {
                        for (ek, ev) in extra_map {
                            if !existing_map.contains_key(ek) {
                                existing_map.insert(ek.clone(), ev.clone());
                            }
                        }
                    }
                    // 非对象类型不覆盖已知字段
                } else {
                    map.insert(k.clone(), v.clone());
                }
            }
        }
    }

    result
}

/// 将指定配置应用到 ~/.claude/settings.json
///
/// **注意**：此函数可能在持有 `CONFIG_LOCK` 的上下文中被调用（如 `activate_config_inner`、`update_config`）。
/// 因此内部不可再次获取该锁——标准库 `Mutex` 不可重入，否则会死锁。
/// `defaults` 由调用方传入，避免重复读取磁盘状态。
pub fn apply_config(config: &ClaudeConfig, defaults: Option<&str>) -> Result<(), String> {
    let provider_base_url = config
        .provider_id
        .as_deref()
        .and_then(crate::provider::get_provider_by_id)
        .map(|p| p.base_url);
    let provider_base_url_ref = provider_base_url.as_deref();
    let final_config = build_config_value(config, defaults, provider_base_url_ref);
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
    let _lock = crate::utils::lock_config()?;

    let mut state = load_state();

    let config = data.into_config();

    state.configs.push(config.clone());
    save_state(&state)?;
    rebuild_tray_menu(&app_handle, Some(&state));

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
    let _lock = crate::utils::lock_config()?;

    let mut state = load_state();

    let config = state
        .configs
        .iter_mut()
        .find(|c| c.id == id)
        .ok_or("未找到指定配置")?;

    data.apply_to(config);

    let updated = config.clone();
    save_state(&state)?;

    // 若该配置当前处于激活状态，重新应用以更新 Claude 设置
    if state.active_config_id == Some(id) {
        apply_config(&updated, state.defaults.as_deref())?;
    }
    rebuild_tray_menu(&app_handle, Some(&state));

    Ok(updated)
}

/// 删除指定配置，若该配置处于激活状态则清除激活标记
#[tauri::command]
pub fn delete_config(app_handle: AppHandle, id: String) -> Result<(), String> {
    // 加锁保护并发写入
    let _lock = crate::utils::lock_config()?;

    let mut state = load_state();

    state.configs.retain(|c| c.id != id);

    if state.active_config_id.as_deref() == Some(id.as_str()) {
        state.active_config_id = None;
    }

    save_state(&state)?;
    rebuild_tray_menu(&app_handle, Some(&state));
    Ok(())
}

/// 复制指定配置，新配置插入到原配置后面
#[tauri::command]
pub fn duplicate_config(app_handle: AppHandle, id: String) -> Result<ClaudeConfig, String> {
    // 加锁保护并发写入
    let _lock = crate::utils::lock_config()?;

    let mut state = load_state();

    let index = state
        .configs
        .iter()
        .position(|c| c.id == id)
        .ok_or("未找到指定配置")?;

    let original = &state.configs[index];
    let now = crate::utils::current_timestamp();

    let mut new_config = original.clone();
    new_config.id = Uuid::new_v4().to_string();
    new_config.name = format!("{} (copy)", original.name);
    new_config.is_active = false;
    new_config.created_at = now;
    new_config.updated_at = now;

    let result = new_config.clone();
    // 插入到原项后面
    state.configs.insert(index + 1, new_config);
    save_state(&state)?;
    rebuild_tray_menu(&app_handle, Some(&state));

    Ok(result)
}

/// 按给定 id 顺序重新排列配置列表
#[tauri::command]
pub fn reorder_configs(app_handle: AppHandle, ids: Vec<String>) -> Result<(), String> {
    // 加锁保护并发写入
    let _lock = crate::utils::lock_config()?;

    let mut state = load_state();

    // 按 ids 顺序重排 configs，使用 HashMap 避免 O(n²) 查找
    use std::collections::HashMap;
    let config_map: HashMap<&str, &ClaudeConfig> =
        state.configs.iter().map(|c| (c.id.as_str(), c)).collect();
    let mut reordered: Vec<ClaudeConfig> = Vec::with_capacity(state.configs.len());
    let mut seen = std::collections::HashSet::with_capacity(ids.len());
    for id in &ids {
        if let Some(config) = config_map.get(id.as_str()) {
            reordered.push((*config).clone());
            seen.insert(id.as_str());
        }
    }

    // 保留不在 ids 中的配置（防御性处理）
    for config in &state.configs {
        if !seen.contains(config.id.as_str()) {
            reordered.push(config.clone());
        }
    }

    state.configs = reordered;
    save_state(&state)?;
    rebuild_tray_menu(&app_handle, Some(&state));
    Ok(())
}

/// 激活指定配置的内部实现，可从 tray.rs 调用（无需 AppHandle）
/// 返回修改后的 AppState，便于调用方传递给 rebuild_tray_menu 避免重复读盘
pub fn activate_config_inner(id: String) -> Result<AppState, String> {
    // 加锁保护并发写入
    let _lock = crate::utils::lock_config()?;

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
    apply_config(&config, state.defaults.as_deref())?;

    Ok(state)
}

/// 激活指定配置并刷新托盘菜单
#[tauri::command]
pub fn activate_config(app_handle: AppHandle, id: String) -> Result<(), String> {
    let state = activate_config_inner(id)?;
    rebuild_tray_menu(&app_handle, Some(&state));
    Ok(())
}

#[tauri::command]
pub fn get_defaults() -> Result<Option<String>, String> {
    let state = load_state();
    Ok(state.defaults)
}

/// 更新通用配置内容，若有激活配置且启用了通用配置则重新应用
#[tauri::command]
pub fn update_defaults(content: String) -> Result<(), String> {
    // 加锁保护并发写入
    let _lock = crate::utils::lock_config()?;

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
                apply_config(config, state.defaults.as_deref())?;
            }
        }
    }

    Ok(())
}

/// 生成配置预览 JSON，不写入磁盘（供前端实时预览使用）
#[tauri::command]
pub fn preview_config(data: ConfigData, defaults: Option<String>) -> Result<String, String> {
    // 构建临时 ClaudeConfig，仅用于 JSON 生成，不持久化
    let provider_base_url = data
        .provider_id
        .as_deref()
        .and_then(crate::provider::get_provider_by_id)
        .map(|p| p.base_url);
    let config = data.into_preview_config();
    let final_config =
        build_config_value(&config, defaults.as_deref(), provider_base_url.as_deref());
    serde_json::to_string_pretty(&final_config).map_err(|e| e.to_string())
}

/// 设置是否在托盘图标旁显示当前激活配置名
#[tauri::command]
pub fn set_show_tray_title(app_handle: AppHandle, show: bool) -> Result<(), String> {
    let _lock = crate::utils::lock_config()?;

    let mut state = load_state();
    if state.show_tray_title == show {
        return Ok(());
    }
    state.show_tray_title = show;
    save_state(&state)?;
    rebuild_tray_menu(&app_handle, Some(&state));

    Ok(())
}

/// 设置界面语言，并同步重建 tray / menubar 菜单
#[tauri::command]
pub fn set_ui_language(app_handle: AppHandle, language: String) -> Result<(), String> {
    let _lock = crate::utils::lock_config()?;

    let normalized = normalize_ui_language(&language)?;
    let mut state = load_state();
    if state.ui_language == normalized {
        return Ok(());
    }

    state.ui_language = normalized.to_string();
    save_state(&state)?;
    rebuild_tray_menu(&app_handle, Some(&state));

    Ok(())
}

/// 设置项目目录“一键打开”默认终端
#[tauri::command]
pub fn set_default_terminal_app(app_handle: AppHandle, app: String) -> Result<(), String> {
    let _lock = crate::utils::lock_config()?;

    let normalized = normalize_default_terminal_app(app.trim())?;
    let mut state = load_state();
    if state.default_terminal_app == normalized {
        return Ok(());
    }

    state.default_terminal_app = normalized.to_string();
    save_state(&state)?;
    let _ = app_handle.emit("project-launcher-settings-changed", ());

    Ok(())
}

/// 设置项目目录“一键打开”默认编辑器，None 表示清空配置
#[tauri::command]
pub fn set_default_editor_app(app_handle: AppHandle, app: Option<String>) -> Result<(), String> {
    let _lock = crate::utils::lock_config()?;

    let normalized = app
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(normalize_default_editor_app)
        .transpose()?
        .map(str::to_string);

    let mut state = load_state();
    if state.default_editor_app == normalized {
        return Ok(());
    }

    state.default_editor_app = normalized;
    save_state(&state)?;
    let _ = app_handle.emit("project-launcher-settings-changed", ());

    Ok(())
}

#[cfg(test)]
mod schema_tests {
    use super::*;
    use schemars::schema_for;
    use serde_json::json;

    #[test]
    fn claude_config_required_fields_match_json_schema() {
        // 生成 Rust ClaudeConfig 的 JSON Schema
        let rust_schema = schema_for!(ClaudeConfig);
        let rust_props = rust_schema
            .schema
            .object
            .as_ref()
            .expect("ClaudeConfig 应为 object 类型")
            .properties
            .clone();

        // 加载前端 JSON Schema 文件
        let json_schema_str = include_str!("../../src/schemas/claude-config.schema.json");
        let json_schema: serde_json::Value =
            serde_json::from_str(json_schema_str).expect("JSON Schema 格式不合法");

        // 验证 JSON Schema 中 required 的字段在 Rust schema 的 properties 中存在
        if let Some(required) = json_schema["required"].as_array() {
            for field_val in required {
                let field_name = field_val.as_str().expect("required 数组元素应为字符串");
                assert!(
                    rust_props.contains_key(field_name),
                    "JSON Schema required 字段 '{}' 在 Rust ClaudeConfig 中未找到。\
                    请确保前后端 schema 保持同步。",
                    field_name
                );
            }
        }
    }

    #[test]
    fn config_data_has_all_json_schema_fields() {
        let rust_schema = schema_for!(ConfigData);
        let rust_props = rust_schema
            .schema
            .object
            .as_ref()
            .expect("ConfigData 应为 object 类型")
            .properties
            .clone();

        let json_schema_str = include_str!("../../src/schemas/claude-config.schema.json");
        let json_schema: serde_json::Value =
            serde_json::from_str(json_schema_str).expect("JSON Schema 格式不合法");

        // 注意：只检查 JSON Schema → Rust 方向。Rust 侧可能存在 JSON Schema 未包含的字段
        // （如 thinking_model，保留是为了向后兼容已存储的配置数据），这是有意为之。
        // 验证 JSON Schema properties 中的字段在 ConfigData 中存在
        // 跳过仅存于 ClaudeConfig（非 DTO）的字段
        let skip_fields = ["id", "isActive", "createdAt", "updatedAt"];
        if let Some(props) = json_schema["properties"].as_object() {
            for field_name in props.keys() {
                if skip_fields.contains(&field_name.as_str()) {
                    continue;
                }
                assert!(
                    rust_props.contains_key(field_name.as_str()),
                    "JSON Schema 字段 '{}' 在 Rust ConfigData 中未找到。\
                    请检查两端是否同步。",
                    field_name
                );
            }
        }
    }

    #[test]
    fn claude_config_advanced_option_defaults_match_expected_values() {
        let json_schema_str = include_str!("../../src/schemas/claude-config.schema.json");
        let json_schema: serde_json::Value =
            serde_json::from_str(json_schema_str).expect("JSON Schema 格式不合法");

        let properties = json_schema["properties"]
            .as_object()
            .expect("JSON Schema properties 应为 object");

        let expected_defaults = [
            ("hasCompletedOnboarding", true),
            ("alwaysThinkingEnabled", true),
            ("disableNonessentialTraffic", true),
            ("skipWebFetchPreflight", true),
            ("enableLspTool", true),
            ("agentTeamsEnabled", false),
        ];

        for (field_name, expected_default) in expected_defaults {
            let actual_default = properties[field_name]["default"]
                .as_bool()
                .unwrap_or_else(|| panic!("字段 '{}' 的 default 应为 boolean", field_name));
            assert_eq!(
                actual_default, expected_default,
                "字段 '{}' 的默认值应为 {}",
                field_name, expected_default
            );
        }
    }

    #[test]
    fn config_json_schema_uses_base_url_property() {
        let json_schema_str = include_str!("../../src/schemas/claude-config.schema.json");
        let json_schema: serde_json::Value =
            serde_json::from_str(json_schema_str).expect("JSON Schema 格式不合法");

        let properties = json_schema["properties"]
            .as_object()
            .expect("JSON Schema properties 应为 object");

        assert!(
            properties.contains_key("baseUrl"),
            "配置 schema 应暴露 baseUrl 字段"
        );
        assert!(
            !properties.contains_key("apiUrl"),
            "配置 schema 不应继续暴露旧的 apiUrl 字段"
        );
    }

    #[test]
    fn preview_config_uses_base_url_field_for_anthropic_base_url() {
        let data: ConfigData = serde_json::from_value(json!({
            "name": "base-url",
            "description": "",
            "apiKey": "sk-test",
            "baseUrl": "https://example.com/anthropic"
        }))
        .expect("ConfigData 应支持 baseUrl 字段");

        let preview = preview_config(data, None).expect("预览配置应生成成功");
        let preview_json: serde_json::Value =
            serde_json::from_str(&preview).expect("预览 JSON 应合法");

        assert_eq!(
            preview_json["env"]["ANTHROPIC_BASE_URL"],
            json!("https://example.com/anthropic")
        );
    }

    #[test]
    fn preview_config_rejects_legacy_api_url_field() {
        let result = serde_json::from_value::<ConfigData>(json!({
            "name": "legacy-api-url",
            "description": "",
            "apiKey": "sk-test",
            "apiUrl": "https://legacy.example.com/anthropic"
        }));

        assert!(
            result.is_err(),
            "旧的 apiUrl 字段不应继续被 ConfigData 接受"
        );
    }

    #[test]
    fn app_state_defaults_ui_language_to_zh() {
        let state: AppState = serde_json::from_value(json!({
            "configs": [],
            "activeConfigId": null,
            "showTrayTitle": true
        }))
        .expect("AppState 应可从旧数据结构反序列化");

        assert_eq!(state.ui_language, "zh");
    }

    #[test]
    fn app_state_defaults_project_open_preferences() {
        let state: AppState = serde_json::from_value(json!({
            "configs": [],
            "activeConfigId": null,
            "showTrayTitle": true
        }))
        .expect("AppState 应可从旧数据结构反序列化");

        assert_eq!(state.default_terminal_app, "terminal");
        assert_eq!(state.default_editor_app, None);
    }

    #[test]
    fn normalize_ui_language_accepts_supported_values_only() {
        assert_eq!(normalize_ui_language("zh").expect("zh 应被接受"), "zh");
        assert_eq!(normalize_ui_language("en").expect("en 应被接受"), "en");
        assert!(
            normalize_ui_language("ja").is_err(),
            "未支持的语言应返回错误"
        );
    }

    #[test]
    fn normalize_default_terminal_app_accepts_supported_values_only() {
        assert_eq!(
            normalize_default_terminal_app("terminal").expect("terminal 应被接受"),
            "terminal"
        );
        assert_eq!(
            normalize_default_terminal_app("iterm").expect("iterm 应被接受"),
            "iterm"
        );
        assert_eq!(
            normalize_default_terminal_app("warp").expect("warp 应被接受"),
            "warp"
        );
        assert_eq!(
            normalize_default_terminal_app("ghostty").expect("ghostty 应被接受"),
            "ghostty"
        );
        assert!(
            normalize_default_terminal_app("hyper").is_err(),
            "未支持的终端应返回错误"
        );
    }

    #[test]
    fn normalize_default_editor_app_accepts_supported_values_only() {
        assert_eq!(
            normalize_default_editor_app("vscode").expect("vscode 应被接受"),
            "vscode"
        );
        assert_eq!(
            normalize_default_editor_app("cursor").expect("cursor 应被接受"),
            "cursor"
        );
        assert_eq!(
            normalize_default_editor_app("windsurf").expect("windsurf 应被接受"),
            "windsurf"
        );
        assert_eq!(
            normalize_default_editor_app("zed").expect("zed 应被接受"),
            "zed"
        );
        assert!(
            normalize_default_editor_app("neovim").is_err(),
            "未支持的编辑器应返回错误"
        );
    }
}
