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
    pub model: Option<String>,
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
    home.join(".claude.json")
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
    let claude_config = serde_json::json!({
        "apiKey": config.api_key,
        "apiUrl": config.api_url,
        "model": config.model,
    });

    let path = get_claude_config_path();
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
    model: Option<String>,
) -> Result<ClaudeConfig, String> {
    let mut state = load_state();
    let now = current_timestamp();

    let config = ClaudeConfig {
        id: Uuid::new_v4().to_string(),
        name,
        description,
        api_key,
        api_url,
        model,
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
    model: Option<String>,
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
    config.model = model;
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
        original.model.clone(),
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
