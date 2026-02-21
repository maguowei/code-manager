use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};
use uuid::Uuid;

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
    pub enable_extra_marketplaces: Option<bool>,
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
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            configs: Vec::new(),
            active_config_id: None,
        }
    }
}

fn get_config_path() -> PathBuf {
    let home = dirs::home_dir().expect("Could not find home directory");
    home.join(".config").join("ai-manager").join("configs.json")
}

fn get_claude_config_path() -> PathBuf {
    let home = dirs::home_dir().expect("Could not find home directory");
    home.join(".claude").join("settings.json")
}

fn current_timestamp() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("Time went backwards")
        .as_secs()
}

pub fn load_state() -> AppState {
    let path = get_config_path();
    if path.exists() {
        match fs::read_to_string(&path) {
            Ok(content) => serde_json::from_str(&content).unwrap_or_default(),
            Err(_) => AppState::default(),
        }
    } else {
        AppState::default()
    }
}

pub fn save_state(state: &AppState) -> Result<(), String> {
    let path = get_config_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let content = serde_json::to_string_pretty(state).map_err(|e| e.to_string())?;
    fs::write(&path, content).map_err(|e| e.to_string())?;
    Ok(())
}

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

    let mut claude_config = serde_json::Map::new();

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
        claude_config.insert(
            "extraKnownMarketplaces".to_string(),
            marketplaces,
        );
    }

    claude_config.insert("env".to_string(), serde_json::Value::Object(env));

    let path = get_claude_config_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let content = serde_json::to_string_pretty(&claude_config).map_err(|e| e.to_string())?;
    fs::write(&path, content).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn get_configs() -> Result<AppState, String> {
    Ok(load_state())
}

#[tauri::command]
pub fn add_config(
    name: String,
    description: String,
    api_key: String,
    api_url: Option<String>,
    website_url: Option<String>,
    model: Option<String>,
    thinking_model: Option<String>,
    haiku_model: Option<String>,
    sonnet_model: Option<String>,
    opus_model: Option<String>,
    always_thinking_enabled: Option<bool>,
    disable_nonessential_traffic: Option<bool>,
    skip_web_fetch_preflight: Option<bool>,
    enable_extra_marketplaces: Option<bool>,
) -> Result<ClaudeConfig, String> {
    let mut state = load_state();
    let now = current_timestamp();

    let config = ClaudeConfig {
        id: Uuid::new_v4().to_string(),
        name,
        description,
        api_key,
        api_url,
        website_url,
        model,
        thinking_model,
        haiku_model,
        sonnet_model,
        opus_model,
        always_thinking_enabled,
        disable_nonessential_traffic,
        skip_web_fetch_preflight,
        enable_extra_marketplaces,
        is_active: false,
        created_at: now,
        updated_at: now,
    };

    state.configs.push(config.clone());
    save_state(&state)?;

    Ok(config)
}

#[tauri::command]
pub fn update_config(
    id: String,
    name: String,
    description: String,
    api_key: String,
    api_url: Option<String>,
    website_url: Option<String>,
    model: Option<String>,
    thinking_model: Option<String>,
    haiku_model: Option<String>,
    sonnet_model: Option<String>,
    opus_model: Option<String>,
    always_thinking_enabled: Option<bool>,
    disable_nonessential_traffic: Option<bool>,
    skip_web_fetch_preflight: Option<bool>,
    enable_extra_marketplaces: Option<bool>,
) -> Result<ClaudeConfig, String> {
    let mut state = load_state();

    let config = state
        .configs
        .iter_mut()
        .find(|c| c.id == id)
        .ok_or("Config not found")?;

    config.name = name;
    config.description = description;
    config.api_key = api_key;
    config.api_url = api_url;
    config.website_url = website_url;
    config.model = model;
    config.thinking_model = thinking_model;
    config.haiku_model = haiku_model;
    config.sonnet_model = sonnet_model;
    config.opus_model = opus_model;
    config.always_thinking_enabled = always_thinking_enabled;
    config.disable_nonessential_traffic = disable_nonessential_traffic;
    config.skip_web_fetch_preflight = skip_web_fetch_preflight;
    config.enable_extra_marketplaces = enable_extra_marketplaces;
    config.updated_at = current_timestamp();

    let updated = config.clone();
    save_state(&state)?;

    // If this config is active, re-apply it
    if state.active_config_id == Some(id) {
        apply_config(&updated)?;
    }

    Ok(updated)
}

#[tauri::command]
pub fn delete_config(id: String) -> Result<(), String> {
    let mut state = load_state();

    state.configs.retain(|c| c.id != id);

    if state.active_config_id == Some(id.clone()) {
        state.active_config_id = None;
    }

    save_state(&state)?;
    Ok(())
}

#[tauri::command]
pub fn duplicate_config(id: String) -> Result<ClaudeConfig, String> {
    let state = load_state();

    let original = state
        .configs
        .iter()
        .find(|c| c.id == id)
        .ok_or("Config not found")?;

    add_config(
        format!("{} (副本)", original.name),
        original.description.clone(),
        original.api_key.clone(),
        original.api_url.clone(),
        original.website_url.clone(),
        original.model.clone(),
        original.thinking_model.clone(),
        original.haiku_model.clone(),
        original.sonnet_model.clone(),
        original.opus_model.clone(),
        original.always_thinking_enabled,
        original.disable_nonessential_traffic,
        original.skip_web_fetch_preflight,
        original.enable_extra_marketplaces,
    )
}

#[tauri::command]
pub fn activate_config(id: String) -> Result<(), String> {
    let mut state = load_state();

    // Find and validate the config exists
    let config = state
        .configs
        .iter()
        .find(|c| c.id == id)
        .ok_or("Config not found")?
        .clone();

    // Update active states
    for c in state.configs.iter_mut() {
        c.is_active = c.id == id;
    }
    state.active_config_id = Some(id);

    // Save state and apply config
    save_state(&state)?;
    apply_config(&config)?;

    Ok(())
}
