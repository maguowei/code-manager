use crate::tray::rebuild_tray_menu;
use fancy_regex::Regex as FancyRegex;
use once_cell::sync::Lazy;
use regex::Regex;
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::collections::{BTreeMap, HashMap, HashSet};
use std::error::Error as StdError;
use std::fs;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};
use uuid::Uuid;

const CLAUDE_SETTINGS_SCHEMA_URL: &str = "https://json.schemastore.org/claude-code-settings.json";
const CONFIG_REGISTRY_SCHEMA_URL: &str =
    "https://ai-manager.app/schemas/config-registry.schema.json";
const REGISTRY_VERSION: u32 = 1;
const DEFAULT_ANTHROPIC_BASE_URL: &str = "https://api.anthropic.com";
const MODEL_TEST_TIMEOUT_SECS: u64 = 30;
const MODEL_TEST_MAX_TOKENS: u64 = 2048;
const MODEL_TEST_PROMPT_EN: &str =
    "Please reply with one short sentence confirming this API test request succeeded.";
const MODEL_TEST_PROMPT_ZH: &str = "请用一句简短的话确认这次 API 测试请求成功。";
const REDACTED_SECRET_VALUE: &str = "<redacted>";
const SYSTEM_LOCALE_ENV_KEYS: [&str; 4] = ["LC_ALL", "LC_MESSAGES", "LANGUAGE", "LANG"];
const DEFAULT_STATUS_LINE_PRESET_ID: &str = "default";
// 非 Windows 平台沿用 ~ 展开的相对路径；Windows 的 command 在运行时按 home 目录拼接绝对路径
#[cfg(not(windows))]
const DEFAULT_STATUS_LINE_COMMAND_PATH: &str = "~/.claude/statusline.sh";
// 默认脚本按平台选择：Windows 用 PowerShell 版，其余用 Bash 版
#[cfg(windows)]
const DEFAULT_STATUS_LINE_SCRIPT: &str = include_str!("../resources/statusline/default.ps1");
#[cfg(not(windows))]
const DEFAULT_STATUS_LINE_SCRIPT: &str = include_str!("../resources/statusline/default.sh");
const USER_SETTINGS_SOURCE_PATH: &str = "settings.json";
const USER_SETTINGS_IMPORT_READY: &str = "ready";
const USER_SETTINGS_IMPORT_INVALID_JSON: &str = "invalidJson";
const USER_SETTINGS_IMPORT_INVALID_SCHEMA: &str = "invalidSchema";
const USER_SETTINGS_IMPORT_UNSUPPORTED_SYMLINK: &str = "unsupportedSymlink";
const USER_SETTINGS_IMPORT_READ_ERROR: &str = "readError";
#[cfg(not(any(unix, windows)))]
const STATUS_LINE_PRESET_UNSUPPORTED_PLATFORM_ERROR: &str =
    "status_line_preset_unsupported_platform";

static CLAUDE_SETTINGS_SCHEMA: Lazy<Value> = Lazy::new(|| {
    serde_json::from_str(include_str!(
        "../../src/schemas/claude-settings.schema.json"
    ))
    .expect("Claude settings schema 格式错误")
});

static SCHEMA_REGEX_CACHE: Lazy<Mutex<HashMap<String, Arc<CompiledSchemaRegex>>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));

/// 会话托盘计数数字的展示风格。
/// 纯文本菜单栏无法做图层角标，用 Unicode 上标数字模拟"右上角角标"。
#[derive(Debug, Clone, Copy, Default, Serialize, Deserialize, PartialEq, Eq, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum SessionTrayCountStyle {
    /// 普通数字，空格分隔：`🔴 1 🟢 1 ⚪ 2`
    Plain,
    /// 上标数字紧贴 emoji，类别空格分隔：`🔴¹ 🟢¹ ⚪²`
    Superscript,
    /// 上标数字 + 无类别空格，最省宽度：`🔴¹🟢¹⚪²`
    #[default]
    SuperscriptCompact,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct AppPreferences {
    #[serde(default = "default_true")]
    pub show_tray_title: bool,
    #[serde(default = "default_true")]
    pub show_tray_sessions: bool,
    #[serde(default)]
    pub system_notifications_enabled: bool,
    #[serde(default)]
    pub collapse_sidebar_by_default: bool,
    #[serde(default = "default_true")]
    pub third_party_provider_pricing_enabled: bool,
    #[serde(default = "default_ui_language")]
    pub ui_language: String,
    #[serde(default = "default_terminal_app")]
    pub default_terminal_app: String,
    #[serde(default)]
    pub default_editor_app: Option<String>,
    #[serde(default)]
    pub tray_title_max_chars: Option<u32>,
    #[serde(default)]
    pub session_tray_count_style: SessionTrayCountStyle,
    #[serde(default = "default_true")]
    pub tray_pulse_waiting: bool,
    #[serde(default = "default_focus_session_shortcut")]
    pub focus_session_shortcut: Option<String>,
    #[serde(default)]
    pub led_control: crate::led::LedControlPreferences,
    /// 桌面用量浮窗是否启用（置顶半透明小窗，实时展示今日用量）。
    #[serde(default)]
    pub floating_widget_enabled: bool,
    /// 浮窗展示的指标 key 列表，顺序即展示顺序，取值见 WIDGET_METRIC_KEYS。
    #[serde(default = "default_floating_widget_metrics")]
    pub floating_widget_metrics: Vec<String>,
    /// 浮窗面板不透明度百分比，范围 30-100（前端按 /100 映射到 CSS opacity）。
    #[serde(default = "default_floating_widget_opacity")]
    pub floating_widget_opacity: u8,
}

impl Default for AppPreferences {
    fn default() -> Self {
        Self {
            show_tray_title: default_true(),
            show_tray_sessions: default_true(),
            system_notifications_enabled: false,
            collapse_sidebar_by_default: false,
            third_party_provider_pricing_enabled: true,
            ui_language: default_ui_language(),
            default_terminal_app: default_terminal_app(),
            default_editor_app: None,
            tray_title_max_chars: None,
            session_tray_count_style: SessionTrayCountStyle::default(),
            tray_pulse_waiting: default_true(),
            focus_session_shortcut: default_focus_session_shortcut(),
            led_control: crate::led::LedControlPreferences::default(),
            floating_widget_enabled: false,
            floating_widget_metrics: default_floating_widget_metrics(),
            floating_widget_opacity: default_floating_widget_opacity(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, specta::Type)]
#[serde(rename_all = "lowercase")]
pub enum PresetSource {
    Builtin,
    Custom,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct LocalizedText {
    pub zh: String,
    pub en: String,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, specta::Type)]
#[serde(rename_all = "lowercase")]
pub enum PresetModelCategory {
    Opus,
    Sonnet,
    Haiku,
    Other,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct SettingsPresetModel {
    pub id: String,
    pub category: PresetModelCategory,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct SettingsPreset {
    pub id: String,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub localized_name: Option<LocalizedText>,
    pub description: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub base_preset_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub doc_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub models: Option<Vec<SettingsPresetModel>>,
    #[serde(default)]
    pub model_suggestions: Vec<String>,
    #[specta(type = specta_typescript::Unknown)]
    pub settings_patch: Value,
    pub source: PresetSource,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ConfigProfile {
    pub id: String,
    pub name: String,
    pub description: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub preset_id: Option<String>,
    #[specta(type = specta_typescript::Unknown)]
    pub settings: Value,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct BindingState {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub user_profile_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub user_last_applied_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ConfigRegistry {
    #[serde(rename = "$schema")]
    pub schema: String,
    pub version: u32,
    pub app: AppPreferences,
    #[serde(default)]
    pub custom_presets: Vec<SettingsPreset>,
    #[serde(default)]
    pub profiles: Vec<ConfigProfile>,
    #[serde(default)]
    pub bindings: BindingState,
}

impl Default for ConfigRegistry {
    fn default() -> Self {
        Self {
            schema: CONFIG_REGISTRY_SCHEMA_URL.to_string(),
            version: REGISTRY_VERSION,
            app: AppPreferences::default(),
            custom_presets: Vec::new(),
            profiles: Vec::new(),
            bindings: BindingState::default(),
        }
    }
}

#[derive(Debug, Clone, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ConfigWorkspace {
    pub app: AppPreferences,
    pub builtin_presets: Vec<SettingsPreset>,
    pub custom_presets: Vec<SettingsPreset>,
    pub profiles: Vec<ConfigProfile>,
    pub bindings: BindingState,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub unmanaged_user_settings: Option<UnmanagedUserSettings>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub active_user_settings_mismatch: Option<ActiveUserSettingsMismatch>,
}

#[derive(Debug, Clone, Serialize, PartialEq, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct UnmanagedUserSettings {
    pub source_path: String,
    #[specta(type = specta_typescript::Unknown)]
    pub settings: Value,
    pub size: u64,
    pub modified_at: u64,
    pub import_status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error_message: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub matched_profile_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ActiveUserSettingsMismatch {
    pub profile_id: String,
    pub source_path: String,
    #[specta(type = specta_typescript::Unknown)]
    pub expected_settings: Value,
    #[specta(type = specta_typescript::Unknown)]
    pub actual_settings: Value,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct StatusLinePresetInstallResult {
    pub preset_id: String,
    pub target_path: String,
    pub command_path: String,
    pub installed: bool,
    pub needs_overwrite: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ModelTestResult {
    pub ok: bool,
    pub response_text: String,
    pub prompt_text: String,
    pub resolved_model: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub provider_model: Option<String>,
    pub duration_ms: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub request_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stop_reason: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub status_code: Option<u16>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error_message: Option<String>,
    pub request_method: String,
    pub request_url: String,
    pub request_headers: BTreeMap<String, String>,
    pub request_body: String,
    pub response_headers: BTreeMap<String, String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub raw_response: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct ModelTestRequest {
    base_url: String,
    auth_token: String,
    resolved_model: String,
    prompt_text: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct ModelTestHttpExchange {
    request_method: String,
    request_url: String,
    request_headers: BTreeMap<String, String>,
    request_body: String,
    response_headers: BTreeMap<String, String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct ModelTestResultContext {
    prompt_text: String,
    resolved_model: String,
    duration_ms: u64,
    request_id: Option<String>,
    exchange: ModelTestHttpExchange,
}

#[derive(Debug, Clone, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
#[serde(deny_unknown_fields)]
pub struct AppPreferencesInput {
    pub show_tray_title: bool,
    pub show_tray_sessions: bool,
    #[serde(default)]
    pub system_notifications_enabled: bool,
    #[serde(default)]
    pub collapse_sidebar_by_default: bool,
    #[serde(default = "default_true")]
    pub third_party_provider_pricing_enabled: bool,
    pub ui_language: String,
    pub default_terminal_app: String,
    pub default_editor_app: Option<String>,
    #[serde(default)]
    pub tray_title_max_chars: Option<u32>,
    #[serde(default)]
    pub session_tray_count_style: SessionTrayCountStyle,
    #[serde(default = "default_true")]
    pub tray_pulse_waiting: bool,
    #[serde(default = "default_focus_session_shortcut")]
    pub focus_session_shortcut: Option<String>,
    #[serde(default)]
    pub led_control: crate::led::LedControlPreferences,
    #[serde(default)]
    pub floating_widget_enabled: bool,
    #[serde(default = "default_floating_widget_metrics")]
    pub floating_widget_metrics: Vec<String>,
    #[serde(default = "default_floating_widget_opacity")]
    pub floating_widget_opacity: u8,
}

#[derive(Debug, Clone, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
#[serde(deny_unknown_fields)]
pub struct ProfileInput {
    pub id: Option<String>,
    pub name: String,
    pub description: String,
    pub preset_id: Option<String>,
    #[specta(type = specta_typescript::Unknown)]
    pub settings: Value,
}

#[derive(Debug, Clone, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
#[serde(deny_unknown_fields)]
pub struct ModelTestInput {
    pub id: Option<String>,
    pub name: String,
    pub description: String,
    pub preset_id: Option<String>,
    #[specta(type = specta_typescript::Unknown)]
    pub settings: Value,
    #[serde(default)]
    pub prompt_text: Option<String>,
}

#[derive(Debug, Clone, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
#[serde(deny_unknown_fields)]
pub struct PresetInput {
    pub id: Option<String>,
    pub name: String,
    #[serde(default)]
    pub localized_name: Option<LocalizedText>,
    pub description: String,
    pub base_preset_id: Option<String>,
    pub doc_url: Option<String>,
    #[serde(default)]
    pub models: Option<Vec<SettingsPresetModel>>,
    #[serde(default)]
    pub model_suggestions: Vec<String>,
    #[specta(type = specta_typescript::Unknown)]
    pub settings_patch: Value,
}

#[derive(Debug, Clone, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
#[serde(deny_unknown_fields)]
pub struct UserSettingsImportInput {
    pub name: String,
    pub description: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BuiltinPresetSeed {
    name: String,
    #[serde(default)]
    localized_name: Option<LocalizedText>,
    slug: String,
    base_url: String,
    doc_url: Option<String>,
    #[serde(default)]
    env: BTreeMap<String, String>,
    models: Vec<BuiltinPresetModel>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BuiltinPresetModel {
    id: String,
    category: PresetModelCategory,
}

fn default_true() -> bool {
    true
}

/// 浮窗可展示的全部指标 key（顺序为设置面板默认呈现顺序）。
/// 前三项为默认勾选的必备指标，后三项为可选指标。
pub const WIDGET_METRIC_KEYS: &[&str] = &[
    "cost",
    "totalTokens",
    "cacheHitRate",
    "messages",
    "sessions",
    "topModel",
];

/// 浮窗默认展示的指标：今日花费、Token 总量、缓存命中率。
fn default_floating_widget_metrics() -> Vec<String> {
    vec![
        "cost".to_string(),
        "totalTokens".to_string(),
        "cacheHitRate".to_string(),
    ]
}

/// 浮窗默认不透明度百分比。
fn default_floating_widget_opacity() -> u8 {
    92
}

/// "聚焦会话终端"全局快捷键的默认组合。双修饰键降低与其它软件冲突的概率。
/// `None` 表示用户禁用了该快捷键。
fn default_focus_session_shortcut() -> Option<String> {
    Some("Command+Control+J".to_string())
}

fn default_ui_language() -> String {
    system_ui_language().to_string()
}

fn system_ui_language() -> &'static str {
    SYSTEM_LOCALE_ENV_KEYS
        .iter()
        .filter_map(|key| std::env::var(key).ok())
        .filter_map(|locale| ui_language_from_system_locale(&locale))
        .next()
        .unwrap_or("en")
}

fn ui_language_from_system_locale(locale: &str) -> Option<&'static str> {
    let primary_locale = locale
        .split(':')
        .map(str::trim)
        .find(|candidate| !candidate.is_empty())?;
    let normalized = primary_locale.replace('_', "-").to_ascii_lowercase();
    if normalized.starts_with("zh") {
        Some("zh")
    } else {
        Some("en")
    }
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

pub(crate) const TERMINAL_APPS: &[(&str, &str)] = &[
    ("terminal", "Terminal"),
    ("iterm", "iTerm"),
    ("warp", "Warp"),
    ("ghostty", "Ghostty"),
];

pub(crate) const EDITOR_APPS: &[(&str, &str)] = &[
    ("vscode", "Visual Studio Code"),
    ("cursor", "Cursor"),
    ("windsurf", "Windsurf"),
    ("zed", "Zed"),
];

pub(crate) fn normalize_default_terminal_app(app: &str) -> Result<&'static str, String> {
    TERMINAL_APPS
        .iter()
        .find(|(slug, _)| *slug == app)
        .map(|(slug, _)| *slug)
        .ok_or_else(|| "仅支持 terminal / iterm / warp / ghostty 四种终端".to_string())
}

pub(crate) fn normalize_default_editor_app(app: &str) -> Result<&'static str, String> {
    EDITOR_APPS
        .iter()
        .find(|(slug, _)| *slug == app)
        .map(|(slug, _)| *slug)
        .ok_or_else(|| "仅支持 vscode / cursor / windsurf / zed 四种编辑器".to_string())
}

fn get_registry_path() -> Result<PathBuf, String> {
    Ok(crate::utils::get_app_data_dir_strict()?.join("config-registry.json"))
}

fn get_user_settings_path() -> Result<PathBuf, String> {
    Ok(crate::utils::get_home_dir()?
        .join(".claude")
        .join("settings.json"))
}

fn parse_builtin_presets() -> Vec<SettingsPreset> {
    let seeds: Vec<BuiltinPresetSeed> =
        serde_json::from_str(include_str!("../resources/builtin-providers.json"))
            .expect("builtin-providers.json 格式错误");

    seeds
        .into_iter()
        .map(|seed| {
            let mut settings_patch = Map::new();
            let mut env = Map::new();
            for (key, value) in seed.env {
                let key = key.trim();
                let value = value.trim();
                if key.is_empty() || value.is_empty() || key == "ANTHROPIC_BASE_URL" {
                    continue;
                }
                env.insert(key.to_string(), Value::String(value.to_string()));
            }
            if !seed.base_url.trim().is_empty() {
                env.insert(
                    "ANTHROPIC_BASE_URL".to_string(),
                    Value::String(seed.base_url.trim().to_string()),
                );
            }
            if !env.is_empty() {
                settings_patch.insert("env".to_string(), Value::Object(env));
            }

            SettingsPreset {
                id: format!("builtin:{}", seed.slug),
                name: seed.name.clone(),
                localized_name: normalize_localized_text(seed.localized_name, &seed.name),
                description: format!("{} 预设", seed.name),
                base_preset_id: None,
                doc_url: seed.doc_url,
                models: normalize_preset_models(Some(
                    seed.models
                        .iter()
                        .map(|model| SettingsPresetModel {
                            id: model.id.clone(),
                            category: model.category,
                        })
                        .collect(),
                )),
                model_suggestions: normalize_model_suggestions(
                    seed.models.into_iter().map(|model| model.id).collect(),
                ),
                settings_patch: Value::Object(settings_patch),
                source: PresetSource::Builtin,
            }
        })
        .collect()
}

pub fn builtin_presets() -> &'static [SettingsPreset] {
    static BUILTIN_PRESETS: Lazy<Vec<SettingsPreset>> = Lazy::new(parse_builtin_presets);
    &BUILTIN_PRESETS
}

fn normalize_registry(registry: &mut ConfigRegistry) {
    registry.schema = CONFIG_REGISTRY_SCHEMA_URL.to_string();
    registry.version = REGISTRY_VERSION;
    registry.custom_presets.iter_mut().for_each(|preset| {
        preset.source = PresetSource::Custom;
        preset.localized_name =
            normalize_localized_text(preset.localized_name.take(), &preset.name);
        preset.models = normalize_preset_models(preset.models.take());
        preset.model_suggestions =
            normalize_model_suggestions(std::mem::take(&mut preset.model_suggestions));
        if !preset.settings_patch.is_object() {
            preset.settings_patch = Value::Object(Map::new());
        }
    });
    registry.profiles.iter_mut().for_each(|profile| {
        if !profile.settings.is_object() {
            profile.settings = Value::Object(Map::new());
        }
    });
}

pub fn load_registry() -> Result<ConfigRegistry, String> {
    let path = get_registry_path()?;
    if !path.exists() {
        return Ok(ConfigRegistry::default());
    }

    let mut registry: ConfigRegistry = crate::utils::read_json_file_strict(&path)?;
    normalize_registry(&mut registry);
    Ok(registry)
}

pub fn load_registry_or_default() -> ConfigRegistry {
    load_registry().unwrap_or_default()
}

pub fn load_app_preferences() -> AppPreferences {
    load_registry_or_default().app
}

fn save_registry(registry: &ConfigRegistry) -> Result<(), String> {
    let path = get_registry_path()?;
    let content = serde_json::to_string_pretty(registry).map_err(|e| e.to_string())?;
    crate::utils::ensure_dir_and_write_atomic(&path, &content)
}

fn build_workspace(registry: ConfigRegistry) -> ConfigWorkspace {
    let unmanaged_user_settings = if registry.profiles.is_empty() {
        scan_unmanaged_user_settings(&registry)
    } else {
        None
    };
    let active_user_settings_mismatch = detect_active_user_settings_mismatch(&registry);
    ConfigWorkspace {
        app: registry.app.clone(),
        builtin_presets: builtin_presets().to_vec(),
        custom_presets: registry.custom_presets,
        profiles: registry.profiles,
        bindings: registry.bindings,
        unmanaged_user_settings,
        active_user_settings_mismatch,
    }
}

fn normalize_settings_document(settings: Value) -> Result<Value, String> {
    if settings.is_null() {
        return Ok(Value::Object(Map::new()));
    }
    if !settings.is_object() {
        return Err("settings 必须是 JSON object".to_string());
    }
    Ok(settings)
}

fn empty_user_settings_status(status: &str, size: u64, modified_at: u64) -> UnmanagedUserSettings {
    UnmanagedUserSettings {
        source_path: USER_SETTINGS_SOURCE_PATH.to_string(),
        settings: Value::Object(Map::new()),
        size,
        modified_at,
        import_status: status.to_string(),
        error_message: None,
        matched_profile_id: None,
    }
}

fn user_settings_error_status(
    status: &str,
    error_message: String,
    size: u64,
    modified_at: u64,
) -> UnmanagedUserSettings {
    UnmanagedUserSettings {
        error_message: Some(error_message),
        ..empty_user_settings_status(status, size, modified_at)
    }
}

fn settings_without_schema(settings: &Value) -> Value {
    let mut object = settings.as_object().cloned().unwrap_or_default();
    object.remove("$schema");
    stable_sort_json(Value::Object(object))
}

fn settings_equivalent(left: &Value, right: &Value) -> bool {
    settings_without_schema(left) == settings_without_schema(right)
}

fn find_profile_matching_settings(registry: &ConfigRegistry, settings: &Value) -> Option<String> {
    registry.profiles.iter().find_map(|profile| {
        resolve_profile_settings(registry, profile)
            .ok()
            .filter(|resolved| settings_equivalent(resolved, settings))
            .map(|_| profile.id.clone())
    })
}

fn bound_profile_matches_user_settings(registry: &ConfigRegistry, settings: &Value) -> bool {
    let Some(bound_profile_id) = registry.bindings.user_profile_id.as_deref() else {
        return false;
    };
    let Some(profile) = registry
        .profiles
        .iter()
        .find(|profile| profile.id == bound_profile_id)
    else {
        return false;
    };

    resolve_profile_settings(registry, profile)
        .map(|resolved| settings_equivalent(&resolved, settings))
        .unwrap_or(false)
}

fn detect_active_user_settings_mismatch(
    registry: &ConfigRegistry,
) -> Option<ActiveUserSettingsMismatch> {
    let bound_profile_id = registry.bindings.user_profile_id.as_deref()?;
    let profile = registry
        .profiles
        .iter()
        .find(|profile| profile.id == bound_profile_id)?;
    let Ok((settings, _, _)) = read_user_settings_document() else {
        return None;
    };
    let Ok(resolved) = resolve_profile_settings(registry, profile) else {
        return None;
    };
    if settings_equivalent(&resolved, &settings) {
        return None;
    }

    Some(ActiveUserSettingsMismatch {
        profile_id: bound_profile_id.to_string(),
        source_path: USER_SETTINGS_SOURCE_PATH.to_string(),
        expected_settings: settings_without_schema(&resolved),
        actual_settings: settings,
    })
}

fn read_user_settings_document() -> Result<(Value, u64, u64), String> {
    let path = get_user_settings_path()?;
    let metadata = fs::symlink_metadata(&path)
        .map_err(|error| format!("读取文件失败 {:?}: {}", path, error))?;
    if metadata.file_type().is_symlink() {
        return Err("用户 settings.json 软链接不支持导入".to_string());
    }
    if !metadata.is_file() {
        return Err("用户 settings.json 必须是普通文件".to_string());
    }

    let content =
        fs::read_to_string(&path).map_err(|error| format!("读取文件失败 {:?}: {}", path, error))?;
    let parsed: Value = serde_json::from_str(&content)
        .map_err(|error| format!("解析 JSON 失败 {:?}: {}", path, error))?;
    let settings = normalize_settings_document(parsed)?;
    validate_settings_document(&settings)?;

    Ok((
        settings_without_schema(&settings),
        metadata.len(),
        crate::utils::metadata_modified_secs(&metadata),
    ))
}

fn scan_unmanaged_user_settings(registry: &ConfigRegistry) -> Option<UnmanagedUserSettings> {
    let path = match get_user_settings_path() {
        Ok(path) => path,
        Err(error) => {
            return Some(user_settings_error_status(
                USER_SETTINGS_IMPORT_READ_ERROR,
                error,
                0,
                0,
            ));
        }
    };
    let metadata = match fs::symlink_metadata(&path) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return None,
        Err(error) => {
            return Some(user_settings_error_status(
                USER_SETTINGS_IMPORT_READ_ERROR,
                format!("读取 settings.json 失败: {}", error),
                0,
                0,
            ));
        }
    };
    let size = metadata.len();
    let modified_at = crate::utils::metadata_modified_secs(&metadata);
    if metadata.file_type().is_symlink() {
        return Some(empty_user_settings_status(
            USER_SETTINGS_IMPORT_UNSUPPORTED_SYMLINK,
            size,
            modified_at,
        ));
    }
    if !metadata.is_file() {
        return Some(user_settings_error_status(
            USER_SETTINGS_IMPORT_READ_ERROR,
            "用户 settings.json 必须是普通文件".to_string(),
            size,
            modified_at,
        ));
    }

    let content = match fs::read_to_string(&path) {
        Ok(content) => content,
        Err(error) => {
            return Some(user_settings_error_status(
                USER_SETTINGS_IMPORT_READ_ERROR,
                format!("读取 settings.json 失败: {}", error),
                size,
                modified_at,
            ));
        }
    };
    let parsed: Value = match serde_json::from_str(&content) {
        Ok(parsed) => parsed,
        Err(error) => {
            return Some(user_settings_error_status(
                USER_SETTINGS_IMPORT_INVALID_JSON,
                format!("解析 JSON 失败: {}", error),
                size,
                modified_at,
            ));
        }
    };
    let settings = match normalize_settings_document(parsed).and_then(|settings| {
        validate_settings_document(&settings)?;
        Ok(settings_without_schema(&settings))
    }) {
        Ok(settings) => settings,
        Err(error) => {
            return Some(user_settings_error_status(
                USER_SETTINGS_IMPORT_INVALID_SCHEMA,
                error,
                size,
                modified_at,
            ));
        }
    };

    if bound_profile_matches_user_settings(registry, &settings) {
        return None;
    }

    let matched_profile_id = find_profile_matching_settings(registry, &settings);

    Some(UnmanagedUserSettings {
        source_path: USER_SETTINGS_SOURCE_PATH.to_string(),
        settings,
        size,
        modified_at,
        import_status: USER_SETTINGS_IMPORT_READY.to_string(),
        error_message: None,
        matched_profile_id,
    })
}

fn normalize_model_suggestions(models: Vec<String>) -> Vec<String> {
    let mut seen = HashSet::new();
    models
        .into_iter()
        .map(|model| model.trim().to_string())
        .filter(|model| !model.is_empty())
        .filter(|model| seen.insert(model.clone()))
        .collect()
}

fn normalize_preset_models(
    models: Option<Vec<SettingsPresetModel>>,
) -> Option<Vec<SettingsPresetModel>> {
    let mut seen = HashSet::new();
    let normalized: Vec<SettingsPresetModel> = models
        .unwrap_or_default()
        .into_iter()
        .filter_map(|model| {
            let id = model.id.trim().to_string();
            if id.is_empty() || !seen.insert(id.clone()) {
                return None;
            }
            Some(SettingsPresetModel {
                id,
                category: model.category,
            })
        })
        .collect();

    if normalized.is_empty() {
        None
    } else {
        Some(normalized)
    }
}

fn normalize_localized_text(
    localized_text: Option<LocalizedText>,
    fallback: &str,
) -> Option<LocalizedText> {
    let fallback = fallback.trim();
    let zh = localized_text
        .as_ref()
        .map(|value| value.zh.trim())
        .filter(|value| !value.is_empty())
        .unwrap_or("");
    let en = localized_text
        .as_ref()
        .map(|value| value.en.trim())
        .filter(|value| !value.is_empty())
        .unwrap_or("");

    if zh.is_empty() && en.is_empty() && fallback.is_empty() {
        return None;
    }

    let seed = if !en.is_empty() {
        en.to_string()
    } else if !zh.is_empty() {
        zh.to_string()
    } else {
        fallback.to_string()
    };

    Some(LocalizedText {
        zh: if zh.is_empty() {
            if fallback.is_empty() {
                seed.clone()
            } else {
                fallback.to_string()
            }
        } else {
            zh.to_string()
        },
        en: if en.is_empty() { seed } else { en.to_string() },
    })
}

fn normalize_profile_input(input: ProfileInput) -> Result<ProfileInput, String> {
    Ok(ProfileInput {
        id: input.id.filter(|id| !id.trim().is_empty()),
        name: input.name.trim().to_string(),
        description: input.description.trim().to_string(),
        preset_id: input.preset_id.filter(|id| !id.trim().is_empty()),
        settings: normalize_settings_document(input.settings)?,
    })
}

fn normalize_model_test_input(input: ModelTestInput) -> Result<ModelTestInput, String> {
    let profile_input = normalize_profile_input(ProfileInput {
        id: input.id,
        name: input.name,
        description: input.description,
        preset_id: input.preset_id,
        settings: input.settings,
    })?;
    let prompt_text = input
        .prompt_text
        .map(|prompt| prompt.trim().to_string())
        .map(|prompt| {
            if prompt.is_empty() {
                Err("测试提示词不能为空".to_string())
            } else {
                Ok(prompt)
            }
        })
        .transpose()?;

    Ok(ModelTestInput {
        id: profile_input.id,
        name: profile_input.name,
        description: profile_input.description,
        preset_id: profile_input.preset_id,
        settings: profile_input.settings,
        prompt_text,
    })
}

fn normalize_preset_input(input: PresetInput) -> Result<PresetInput, String> {
    Ok(PresetInput {
        id: input
            .id
            .map(|id| id.trim().to_string())
            .filter(|id| !id.is_empty()),
        name: input.name.trim().to_string(),
        localized_name: normalize_localized_text(input.localized_name, &input.name),
        description: input.description.trim().to_string(),
        base_preset_id: input.base_preset_id.filter(|id| !id.trim().is_empty()),
        doc_url: input.doc_url.filter(|url| !url.trim().is_empty()),
        models: normalize_preset_models(input.models),
        model_suggestions: normalize_model_suggestions(input.model_suggestions),
        settings_patch: normalize_settings_document(input.settings_patch)?,
    })
}

fn slugify_custom_preset_seed(seed: &str) -> Option<String> {
    let mut slug = String::new();
    let mut previous_dash = false;

    for character in seed.trim().chars() {
        if character.is_ascii_alphanumeric() {
            slug.push(character.to_ascii_lowercase());
            previous_dash = false;
            continue;
        }

        if !previous_dash && !slug.is_empty() {
            slug.push('-');
            previous_dash = true;
        }
    }

    let slug = slug.trim_matches('-').to_string();
    if slug.is_empty() {
        None
    } else {
        Some(slug)
    }
}

fn build_custom_preset_id(registry: &ConfigRegistry, input: &PresetInput) -> String {
    if let Some(id) = input
        .id
        .as_deref()
        .map(str::trim)
        .filter(|id| !id.is_empty())
    {
        return id.to_string();
    }

    let seed = input
        .localized_name
        .as_ref()
        .map(|localized_name| localized_name.en.trim())
        .filter(|name| !name.is_empty())
        .unwrap_or_else(|| input.name.trim());
    let Some(base_slug) = slugify_custom_preset_seed(seed) else {
        return format!("custom:{}", Uuid::new_v4());
    };

    let mut candidate = format!("custom:{base_slug}");
    let mut suffix = 2;
    while preset_exists(registry, &candidate) {
        candidate = format!("custom:{base_slug}-{suffix}");
        suffix += 1;
    }
    candidate
}

fn normalize_app_preferences(input: AppPreferencesInput) -> Result<AppPreferences, String> {
    let ui_language = normalize_ui_language(input.ui_language.trim())?.to_string();
    let default_terminal_app =
        normalize_default_terminal_app(input.default_terminal_app.trim())?.to_string();
    let default_editor_app = input
        .default_editor_app
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(normalize_default_editor_app)
        .transpose()?
        .map(str::to_string);

    Ok(AppPreferences {
        show_tray_title: input.show_tray_title,
        show_tray_sessions: input.show_tray_sessions,
        system_notifications_enabled: input.system_notifications_enabled,
        collapse_sidebar_by_default: input.collapse_sidebar_by_default,
        third_party_provider_pricing_enabled: input.third_party_provider_pricing_enabled,
        ui_language,
        default_terminal_app,
        default_editor_app,
        tray_title_max_chars: input.tray_title_max_chars,
        session_tray_count_style: input.session_tray_count_style,
        tray_pulse_waiting: input.tray_pulse_waiting,
        // 空字符串视为禁用（None），去除前后空白
        focus_session_shortcut: input
            .focus_session_shortcut
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty()),
        // LED 灯效映射：防御性把 mode 钳制到 0..=MAX_MODE，越界值退回合法上界
        led_control: crate::led::LedControlPreferences {
            enabled: input.led_control.enabled,
            waiting_mode: input.led_control.waiting_mode.min(crate::led::MAX_MODE),
            running_mode: input.led_control.running_mode.min(crate::led::MAX_MODE),
            idle_mode: input.led_control.idle_mode.min(crate::led::MAX_MODE),
        },
        floating_widget_enabled: input.floating_widget_enabled,
        // 过滤未知 key 并去重保序；为空时回落默认集，避免浮窗一片空白
        floating_widget_metrics: normalize_floating_widget_metrics(input.floating_widget_metrics),
        // 不透明度钳制到 30-100，越界退回合法边界
        floating_widget_opacity: input.floating_widget_opacity.clamp(30, 100),
    })
}

/// 过滤掉未知指标 key，去重并保持用户选择的顺序；结果为空时回落默认指标集。
fn normalize_floating_widget_metrics(metrics: Vec<String>) -> Vec<String> {
    let mut seen = HashSet::new();
    let filtered: Vec<String> = metrics
        .into_iter()
        .filter(|key| WIDGET_METRIC_KEYS.contains(&key.as_str()))
        .filter(|key| seen.insert(key.clone()))
        .collect();
    if filtered.is_empty() {
        default_floating_widget_metrics()
    } else {
        filtered
    }
}

fn find_preset(registry: &ConfigRegistry, preset_id: &str) -> Option<SettingsPreset> {
    builtin_presets()
        .iter()
        .find(|preset| preset.id == preset_id)
        .cloned()
        .or_else(|| {
            registry
                .custom_presets
                .iter()
                .find(|preset| preset.id == preset_id)
                .cloned()
        })
}

fn resolve_preset_chain(
    registry: &ConfigRegistry,
    preset_id: &str,
    visited: &mut HashSet<String>,
) -> Result<Vec<SettingsPreset>, String> {
    if !visited.insert(preset_id.to_string()) {
        return Err("检测到 preset 循环继承".to_string());
    }

    let preset =
        find_preset(registry, preset_id).ok_or_else(|| format!("未找到 preset '{}'", preset_id))?;
    let mut chain = if let Some(base_preset_id) = preset.base_preset_id.clone() {
        resolve_preset_chain(registry, &base_preset_id, visited)?
    } else {
        Vec::new()
    };
    chain.push(preset);
    Ok(chain)
}

fn merge_json_values(base: Value, overlay: Value) -> Value {
    match (base, overlay) {
        (Value::Object(mut base_map), Value::Object(overlay_map)) => {
            for (key, overlay_value) in overlay_map {
                let merged = if let Some(base_value) = base_map.remove(&key) {
                    merge_json_values(base_value, overlay_value)
                } else {
                    overlay_value
                };
                base_map.insert(key, merged);
            }
            Value::Object(base_map)
        }
        (_, overlay) => overlay,
    }
}

fn stable_sort_json(value: Value) -> Value {
    match value {
        Value::Object(map) => {
            let sorted = map
                .into_iter()
                .map(|(key, value)| (key, stable_sort_json(value)))
                .collect::<std::collections::BTreeMap<_, _>>();
            Value::Object(sorted.into_iter().collect())
        }
        Value::Array(items) => Value::Array(items.into_iter().map(stable_sort_json).collect()),
        other => other,
    }
}

fn resolve_schema_ref<'a>(root: &'a Value, reference: &str) -> Result<&'a Value, String> {
    if !reference.starts_with("#/") {
        return Err(format!("暂不支持外部 schema 引用 '{}'", reference));
    }

    let mut cursor = root;
    for segment in reference.trim_start_matches("#/").split('/') {
        cursor = cursor
            .get(segment)
            .ok_or_else(|| format!("无法解析 schema 引用 '{}'", reference))?;
    }
    Ok(cursor)
}

fn matches_schema_type(value: &Value, expected_type: &str) -> bool {
    match expected_type {
        "object" => value.is_object(),
        "array" => value.is_array(),
        "string" => value.is_string(),
        "boolean" => value.is_boolean(),
        "number" => value.is_number(),
        "integer" => value.as_i64().is_some() || value.as_u64().is_some(),
        "null" => value.is_null(),
        _ => true,
    }
}

enum CompiledSchemaRegex {
    Standard(Regex),
    Fancy(FancyRegex),
}

fn compile_uncached_schema_regex(pattern: &str) -> Result<CompiledSchemaRegex, String> {
    match Regex::new(pattern) {
        Ok(regex) => Ok(CompiledSchemaRegex::Standard(regex)),
        Err(primary_error) => FancyRegex::new(pattern)
            .map(CompiledSchemaRegex::Fancy)
            .map_err(|fallback_error| {
                format!(
                    "无效 schema 正则 '{pattern}': {primary_error}; fancy-regex 回退也失败: {fallback_error}"
                )
            }),
    }
}

fn compile_schema_regex(pattern: &str) -> Result<Arc<CompiledSchemaRegex>, String> {
    let mut cache = SCHEMA_REGEX_CACHE
        .lock()
        .map_err(|_| "schema 正则缓存锁已损坏".to_string())?;
    if let Some(regex) = cache.get(pattern) {
        return Ok(Arc::clone(regex));
    }

    let regex = Arc::new(compile_uncached_schema_regex(pattern)?);
    cache.insert(pattern.to_string(), Arc::clone(&regex));
    Ok(regex)
}

fn schema_regex_is_match(
    regex: &CompiledSchemaRegex,
    pattern: &str,
    input: &str,
) -> Result<bool, String> {
    match regex {
        CompiledSchemaRegex::Standard(regex) => Ok(regex.is_match(input)),
        CompiledSchemaRegex::Fancy(regex) => regex
            .is_match(input)
            .map_err(|error| format!("schema 正则 '{pattern}' 匹配失败: {error}")),
    }
}

fn validate_schema_object(
    root: &Value,
    schema: &Value,
    object: &Map<String, Value>,
    path: &str,
) -> Result<(), String> {
    let properties = schema
        .get("properties")
        .and_then(Value::as_object)
        .cloned()
        .unwrap_or_default();
    let pattern_properties = schema
        .get("patternProperties")
        .and_then(Value::as_object)
        .cloned()
        .unwrap_or_default();
    let compiled_patterns: Vec<(String, Arc<CompiledSchemaRegex>, Value)> = pattern_properties
        .iter()
        .map(|(pattern, schema)| {
            compile_schema_regex(pattern).map(|regex| (pattern.clone(), regex, schema.clone()))
        })
        .collect::<Result<Vec<_>, _>>()?;
    let required = schema
        .get("required")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();

    for key in required.iter().filter_map(Value::as_str) {
        if !object.contains_key(key) {
            return Err(format!("{path} 缺少必填字段 '{key}'"));
        }
    }

    for (key, value) in object {
        if let Some(property_schema) = properties.get(key) {
            validate_value_against_schema(root, property_schema, value, &format!("{path}.{key}"))?;
            continue;
        }

        let mut matched_pattern = false;
        for (pattern, regex, pattern_schema) in &compiled_patterns {
            if schema_regex_is_match(regex.as_ref(), pattern, key)? {
                matched_pattern = true;
                validate_value_against_schema(
                    root,
                    pattern_schema,
                    value,
                    &format!("{path}.{key}"),
                )?;
                break;
            }
        }
        if matched_pattern {
            continue;
        }

        match schema.get("additionalProperties") {
            Some(Value::Bool(false)) => {
                return Err(format!("{path} 包含未允许字段 '{key}'"));
            }
            Some(additional_schema @ Value::Object(_)) => {
                validate_value_against_schema(
                    root,
                    additional_schema,
                    value,
                    &format!("{path}.{key}"),
                )?;
            }
            _ => {}
        }
    }

    Ok(())
}

fn validate_value_against_schema(
    root: &Value,
    schema: &Value,
    value: &Value,
    path: &str,
) -> Result<(), String> {
    if let Some(reference) = schema.get("$ref").and_then(Value::as_str) {
        return validate_value_against_schema(
            root,
            resolve_schema_ref(root, reference)?,
            value,
            path,
        );
    }

    if let Some(any_of) = schema.get("anyOf").and_then(Value::as_array) {
        if any_of
            .iter()
            .any(|branch| validate_value_against_schema(root, branch, value, path).is_ok())
        {
            return Ok(());
        }
        return Err(format!("{path} 不符合 schema anyOf 约束"));
    }

    if let Some(enum_values) = schema.get("enum").and_then(Value::as_array) {
        if !enum_values.iter().any(|candidate| candidate == value) {
            return Err(format!("{path} 不在允许枚举值中"));
        }
    }

    if let Some(constant) = schema.get("const") {
        if constant != value {
            return Err(format!("{path} 必须等于固定值"));
        }
    }

    if let Some(expected_type) = schema.get("type").and_then(Value::as_str) {
        if !matches_schema_type(value, expected_type) {
            return Err(format!("{path} 类型错误，期望 {expected_type}"));
        }
    }

    if let Some(pattern) = schema.get("pattern").and_then(Value::as_str) {
        if let Some(string_value) = value.as_str() {
            let regex = compile_schema_regex(pattern)?;
            if !schema_regex_is_match(regex.as_ref(), pattern, string_value)? {
                return Err(format!("{path} 不匹配模式 {pattern}"));
            }
        }
    }

    if let Some(min_length) = schema.get("minLength").and_then(Value::as_u64) {
        if let Some(string_value) = value.as_str() {
            if string_value.chars().count() < min_length as usize {
                return Err(format!("{path} 长度不足 {min_length}"));
            }
        }
    }

    if let Some(array_value) = value.as_array() {
        if let Some(items_schema) = schema.get("items") {
            for (index, item) in array_value.iter().enumerate() {
                validate_value_against_schema(
                    root,
                    items_schema,
                    item,
                    &format!("{path}[{index}]"),
                )?;
            }
        }
    }

    if let Some(object_value) = value.as_object() {
        validate_schema_object(root, schema, object_value, path)?;
    }

    if let Some(not_schema) = schema.get("not") {
        if validate_value_against_schema(root, not_schema, value, path).is_ok() {
            return Err(format!("{path} 命中了禁止模式"));
        }
    }

    Ok(())
}

fn validate_settings_document(settings: &Value) -> Result<(), String> {
    let object = settings
        .as_object()
        .ok_or("settings 必须是 JSON object".to_string())?;

    let schema_properties = CLAUDE_SETTINGS_SCHEMA["properties"]
        .as_object()
        .ok_or("Claude settings schema 缺少 properties".to_string())?;

    for (key, value) in object {
        if key == "$schema" {
            continue;
        }
        if let Some(property_schema) = schema_properties.get(key) {
            validate_value_against_schema(
                &CLAUDE_SETTINGS_SCHEMA,
                property_schema,
                value,
                &format!("settings.{key}"),
            )?;
        }
    }

    Ok(())
}

fn resolve_profile_settings(
    registry: &ConfigRegistry,
    profile: &ConfigProfile,
) -> Result<Value, String> {
    let mut resolved = Value::Object(Map::new());

    if let Some(preset_id) = profile.preset_id.as_deref() {
        let mut visited = HashSet::new();
        for preset in resolve_preset_chain(registry, preset_id, &mut visited)? {
            resolved = merge_json_values(resolved, preset.settings_patch);
        }
    }

    resolved = merge_json_values(resolved, profile.settings.clone());

    let mut object = resolved
        .as_object()
        .cloned()
        .ok_or("resolved settings 必须是 object".to_string())?;
    object.insert(
        "$schema".to_string(),
        Value::String(CLAUDE_SETTINGS_SCHEMA_URL.to_string()),
    );

    let resolved = stable_sort_json(Value::Object(object));
    validate_settings_document(&resolved)?;
    Ok(resolved)
}

fn trimmed_json_string(value: Option<&Value>) -> Option<String> {
    value
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
}

fn resolve_model_test_prompt(settings: &Value) -> String {
    let language = settings
        .get("language")
        .and_then(Value::as_str)
        .map(str::trim)
        .map(str::to_ascii_lowercase);

    match language.as_deref() {
        Some("chinese") | Some("zh") | Some("zh-cn") | Some("zh-hans") => {
            MODEL_TEST_PROMPT_ZH.to_string()
        }
        _ => MODEL_TEST_PROMPT_EN.to_string(),
    }
}

fn trimmed_env_value(settings: &Value, key: &str) -> Option<String> {
    settings
        .get("env")
        .and_then(Value::as_object)
        .and_then(|env| trimmed_json_string(env.get(key)))
}

fn normalize_model_test_base_url(base_url: &str) -> String {
    let trimmed = base_url.trim().trim_end_matches('/');
    let normalized = trimmed
        .strip_suffix("/v1/messages")
        .unwrap_or(trimmed)
        .trim_end_matches('/');

    if normalized.is_empty() {
        DEFAULT_ANTHROPIC_BASE_URL.to_string()
    } else {
        normalized.to_string()
    }
}

fn build_model_test_endpoint(base_url: &str) -> String {
    format!("{}/v1/messages", normalize_model_test_base_url(base_url))
}

fn raw_response_from_body(body: &str) -> Option<String> {
    if body.trim().is_empty() {
        None
    } else {
        Some(redact_model_test_text_for_display(body))
    }
}

fn redact_model_test_text_for_display(text: &str) -> String {
    match serde_json::from_str::<Value>(text) {
        Ok(mut value) => {
            redact_model_test_json_value(&mut value);
            serde_json::to_string(&value)
                .unwrap_or_else(|_| crate::logging::redact_sensitive_message(text))
        }
        Err(_) => crate::logging::redact_sensitive_message(text),
    }
}

fn redact_model_test_json_value(value: &mut Value) {
    match value {
        Value::Object(object) => {
            for (key, child) in object.iter_mut() {
                if is_sensitive_model_test_json_key(key) {
                    *child = Value::String(REDACTED_SECRET_VALUE.to_string());
                } else {
                    redact_model_test_json_value(child);
                }
            }
        }
        Value::Array(items) => {
            for item in items {
                redact_model_test_json_value(item);
            }
        }
        _ => {}
    }
}

fn is_sensitive_model_test_json_key(key: &str) -> bool {
    let normalized = key.to_ascii_lowercase();
    normalized == "authorization"
        || normalized == "token"
        || normalized.ends_with("_token")
        || normalized.ends_with("-token")
        || normalized.contains("secret")
        || normalized.contains("password")
        || normalized.contains("api_key")
        || normalized.contains("api-key")
        || normalized == "apikey"
}

fn resolve_model_test_request(
    resolved_settings: &Value,
    prompt_text_override: Option<String>,
) -> Result<ModelTestRequest, String> {
    let auth_token = trimmed_env_value(resolved_settings, "ANTHROPIC_AUTH_TOKEN")
        .ok_or_else(|| "缺少 ANTHROPIC_AUTH_TOKEN，请先在认证区填写认证密钥".to_string())?;
    let base_url = trimmed_env_value(resolved_settings, "ANTHROPIC_BASE_URL")
        .map(|value| normalize_model_test_base_url(&value))
        .unwrap_or_else(|| DEFAULT_ANTHROPIC_BASE_URL.to_string());
    let resolved_model = trimmed_env_value(resolved_settings, "ANTHROPIC_MODEL")
        .or_else(|| trimmed_json_string(resolved_settings.get("model")))
        .ok_or_else(|| "缺少默认模型，请先在模型与行为中填写默认模型".to_string())?;

    Ok(ModelTestRequest {
        base_url,
        auth_token,
        resolved_model,
        prompt_text: prompt_text_override
            .unwrap_or_else(|| resolve_model_test_prompt(resolved_settings)),
    })
}

fn build_model_test_request_headers(auth_token: &str) -> BTreeMap<String, String> {
    [
        ("x-api-key".to_string(), auth_token.to_string()),
        ("anthropic-version".to_string(), "2023-06-01".to_string()),
        ("content-type".to_string(), "application/json".to_string()),
    ]
    .into_iter()
    .collect()
}

fn is_sensitive_request_header(name: &str) -> bool {
    matches!(
        name.to_ascii_lowercase().as_str(),
        "authorization" | "proxy-authorization" | "x-api-key" | "api-key"
    )
}

fn redact_model_test_request_headers(
    headers: &BTreeMap<String, String>,
) -> BTreeMap<String, String> {
    headers
        .iter()
        .map(|(key, value)| {
            let safe_value = if is_sensitive_request_header(key) {
                REDACTED_SECRET_VALUE
            } else {
                value
            };
            (key.clone(), safe_value.to_string())
        })
        .collect()
}

fn build_model_test_payload(request: &ModelTestRequest) -> Value {
    serde_json::json!({
        "model": request.resolved_model.clone(),
        "max_tokens": MODEL_TEST_MAX_TOKENS,
        "messages": [
            {
                "role": "user",
                "content": request.prompt_text.clone()
            }
        ]
    })
}

fn serialize_model_test_request_body(payload: &Value) -> Result<String, String> {
    serde_json::to_string_pretty(payload)
        .map_err(|error| format!("序列化模型测试请求失败：{error}"))
}

fn format_model_test_error_with_details(prefix: &str, error: &dyn StdError) -> String {
    let mut message = format!("{prefix}：{error}");
    let mut details = Vec::new();
    let mut current = error.source();

    while let Some(source) = current {
        let detail = source.to_string();
        if !detail.trim().is_empty() && detail != error.to_string() && !details.contains(&detail) {
            details.push(detail);
        }
        current = source.source();
    }

    if !details.is_empty() {
        message.push_str("\n详细原因：");
        message.push_str(&details.join("\n"));
    }

    message
}

fn headers_to_map(headers: &reqwest::header::HeaderMap) -> BTreeMap<String, String> {
    headers
        .iter()
        .filter_map(|(name, value)| {
            value
                .to_str()
                .ok()
                .map(|value| (name.as_str().to_string(), value.to_string()))
        })
        .collect()
}

fn parse_model_test_response(
    response: &Value,
    prompt_text: String,
    resolved_model: String,
    duration_ms: u64,
    request_id: Option<String>,
    raw_response: String,
    exchange: ModelTestHttpExchange,
) -> Result<ModelTestResult, String> {
    let response_text = response
        .get("content")
        .and_then(Value::as_array)
        .map(|content| {
            content
                .iter()
                .filter(|item| item.get("type").and_then(Value::as_str) == Some("text"))
                .filter_map(|item| trimmed_json_string(item.get("text")))
                .collect::<Vec<_>>()
        })
        .filter(|items| !items.is_empty())
        .map(|items| items.join("\n\n"))
        .ok_or_else(|| "响应格式不支持：未找到可展示的文本内容".to_string())?;

    Ok(ModelTestResult {
        ok: true,
        response_text,
        prompt_text,
        resolved_model,
        provider_model: trimmed_json_string(response.get("model")),
        duration_ms,
        request_id,
        stop_reason: trimmed_json_string(response.get("stop_reason")),
        status_code: None,
        error_message: None,
        request_method: exchange.request_method,
        request_url: exchange.request_url,
        request_headers: exchange.request_headers,
        request_body: exchange.request_body,
        response_headers: exchange.response_headers,
        raw_response: raw_response_from_body(&raw_response),
    })
}

fn extract_model_test_error_message(body: &str) -> Option<String> {
    let trimmed = body.trim();
    if trimmed.is_empty() {
        return None;
    }

    let parsed = serde_json::from_str::<Value>(trimmed).ok()?;
    trimmed_json_string(parsed.get("message")).or_else(|| {
        parsed.get("error").and_then(|error| {
            if error.is_object() {
                trimmed_json_string(error.get("message"))
            } else {
                trimmed_json_string(Some(error))
            }
        })
    })
}

fn parse_model_test_error(status_code: u16, body: &str) -> String {
    if let Some(message) = extract_model_test_error_message(body) {
        return format!(
            "模型测试失败（HTTP {status_code}）：{}",
            redact_model_test_text_for_display(&message)
        );
    }

    let fallback = crate::utils::truncate(&redact_model_test_text_for_display(body.trim()), 160);
    if fallback.is_empty() {
        format!("模型测试失败（HTTP {status_code}）")
    } else {
        format!("模型测试失败（HTTP {status_code}）：{fallback}")
    }
}

fn build_model_test_error_result(
    context: ModelTestResultContext,
    status_code: Option<u16>,
    error_message: String,
    raw_response: Option<String>,
) -> ModelTestResult {
    ModelTestResult {
        ok: false,
        response_text: String::new(),
        prompt_text: context.prompt_text,
        resolved_model: context.resolved_model,
        provider_model: None,
        duration_ms: context.duration_ms,
        request_id: context.request_id,
        stop_reason: None,
        status_code,
        error_message: Some(error_message),
        request_method: context.exchange.request_method,
        request_url: context.exchange.request_url,
        request_headers: context.exchange.request_headers,
        request_body: context.exchange.request_body,
        response_headers: context.exchange.response_headers,
        raw_response,
    }
}

fn build_model_test_failure_result(
    status_code: u16,
    body: &str,
    context: ModelTestResultContext,
) -> ModelTestResult {
    build_model_test_error_result(
        context,
        Some(status_code),
        parse_model_test_error(status_code, body),
        raw_response_from_body(body),
    )
}

async fn execute_model_test_request(request: ModelTestRequest) -> Result<ModelTestResult, String> {
    let endpoint = build_model_test_endpoint(&request.base_url);
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(MODEL_TEST_TIMEOUT_SECS))
        .build()
        .map_err(|error| format!("创建模型测试客户端失败：{error}"))?;
    let payload = build_model_test_payload(&request);
    let request_headers = build_model_test_request_headers(&request.auth_token);
    let request_body = serialize_model_test_request_body(&payload)?;
    let base_exchange = ModelTestHttpExchange {
        request_method: "POST".to_string(),
        request_url: endpoint.clone(),
        request_headers: redact_model_test_request_headers(&request_headers),
        request_body,
        response_headers: BTreeMap::new(),
    };

    let started_at = Instant::now();
    let response = match client
        .post(&endpoint)
        .header("x-api-key", request_headers["x-api-key"].as_str())
        .header(
            "anthropic-version",
            request_headers["anthropic-version"].as_str(),
        )
        .header(reqwest::header::CONTENT_TYPE, "application/json")
        .json(&payload)
        .send()
        .await
    {
        Ok(response) => response,
        Err(error) => {
            let duration_ms = started_at.elapsed().as_millis().min(u128::from(u64::MAX)) as u64;
            let result = build_model_test_error_result(
                ModelTestResultContext {
                    prompt_text: request.prompt_text,
                    resolved_model: request.resolved_model,
                    duration_ms,
                    request_id: None,
                    exchange: base_exchange,
                },
                None,
                format_model_test_error_with_details("模型测试请求失败", &error),
                None,
            );
            log::warn!(
                "event=profile.model_test status=error model={} duration_ms={} error={}",
                result.resolved_model,
                result.duration_ms,
                crate::logging::redact_sensitive_message(
                    result.error_message.as_deref().unwrap_or_default()
                )
            );
            return Ok(result);
        }
    };

    let duration_ms = started_at.elapsed().as_millis().min(u128::from(u64::MAX)) as u64;
    let request_id = response
        .headers()
        .get("request-id")
        .or_else(|| response.headers().get("x-request-id"))
        .and_then(|value| value.to_str().ok())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned);
    let status = response.status();
    let response_headers = headers_to_map(response.headers());
    let exchange = ModelTestHttpExchange {
        response_headers,
        ..base_exchange
    };
    let status_code = status.as_u16();
    let context = ModelTestResultContext {
        prompt_text: request.prompt_text.clone(),
        resolved_model: request.resolved_model.clone(),
        duration_ms,
        request_id: request_id.clone(),
        exchange: exchange.clone(),
    };
    let body = match response.text().await {
        Ok(body) => body,
        Err(error) => {
            let result = build_model_test_error_result(
                context,
                Some(status_code),
                format_model_test_error_with_details("读取模型测试响应失败", &error),
                None,
            );
            log::error!(
                "event=profile.model_test status=error model={} status_code={} duration_ms={} error={}",
                result.resolved_model,
                status_code,
                result.duration_ms,
                crate::logging::redact_sensitive_message(
                    result.error_message.as_deref().unwrap_or_default()
                )
            );
            return Ok(result);
        }
    };
    let raw_response = raw_response_from_body(&body);

    if !status.is_success() {
        let result = build_model_test_failure_result(status_code, &body, context);
        log::warn!(
            "event=profile.model_test status=error model={} status_code={} duration_ms={}",
            result.resolved_model,
            status_code,
            result.duration_ms
        );
        return Ok(result);
    }

    let parsed = match serde_json::from_str::<Value>(&body) {
        Ok(parsed) => parsed,
        Err(error) => {
            let result = build_model_test_error_result(
                context,
                Some(status_code),
                format!("解析模型测试响应失败：{error}"),
                raw_response,
            );
            log::error!(
                "event=profile.model_test status=error model={} status_code={} duration_ms={} error={}",
                result.resolved_model,
                status_code,
                result.duration_ms,
                crate::logging::redact_sensitive_message(
                    result.error_message.as_deref().unwrap_or_default()
                )
            );
            return Ok(result);
        }
    };
    let result = match parse_model_test_response(
        &parsed,
        request.prompt_text,
        request.resolved_model,
        duration_ms,
        request_id.clone(),
        body.clone(),
        exchange.clone(),
    ) {
        Ok(result) => result,
        Err(error_message) => {
            build_model_test_error_result(context, Some(status_code), error_message, raw_response)
        }
    };
    if result.ok {
        log::info!(
            "event=profile.model_test status=ok model={} status_code={} duration_ms={}",
            result.resolved_model,
            status_code,
            result.duration_ms
        );
    } else {
        log::error!(
            "event=profile.model_test status=error model={} status_code={} duration_ms={} error={}",
            result.resolved_model,
            status_code,
            result.duration_ms,
            crate::logging::redact_sensitive_message(
                result.error_message.as_deref().unwrap_or_default()
            )
        );
    }
    Ok(result)
}

fn profile_settings_path() -> Result<PathBuf, String> {
    get_user_settings_path()
}

fn status_line_preset_target_path() -> Result<PathBuf, String> {
    // Windows 安装 PowerShell 脚本，其余平台安装 Bash 脚本
    let filename = if cfg!(windows) {
        "statusline.ps1"
    } else {
        "statusline.sh"
    };
    Ok(crate::utils::get_home_dir()?.join(".claude").join(filename))
}

// 计算写入 settings.json 的 statusLine.command
// Windows 用绝对正斜杠路径调用 PowerShell，规避 ~ 在 -File 参数中不展开的问题
#[cfg(windows)]
fn status_line_preset_command(target_path: &std::path::Path) -> String {
    let normalized = target_path.display().to_string().replace('\\', "/");
    format!("powershell -NoProfile -ExecutionPolicy Bypass -File {normalized}")
}

#[cfg(not(windows))]
fn status_line_preset_command(target_path: &std::path::Path) -> String {
    let _ = target_path;
    DEFAULT_STATUS_LINE_COMMAND_PATH.to_string()
}

fn build_status_line_preset_result(
    preset_id: &str,
    target_path: &std::path::Path,
    installed: bool,
    needs_overwrite: bool,
) -> StatusLinePresetInstallResult {
    StatusLinePresetInstallResult {
        preset_id: preset_id.to_string(),
        target_path: target_path.display().to_string(),
        command_path: status_line_preset_command(target_path),
        installed,
        needs_overwrite,
    }
}

fn ensure_status_line_preset_supported() -> Result<(), String> {
    #[cfg(any(unix, windows))]
    {
        Ok(())
    }

    #[cfg(not(any(unix, windows)))]
    {
        Err(STATUS_LINE_PRESET_UNSUPPORTED_PLATFORM_ERROR.to_string())
    }
}

fn ensure_status_line_script_executable(path: &std::path::Path) -> Result<(), String> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(path, fs::Permissions::from_mode(0o755))
            .map_err(|e| format!("设置状态行脚本可执行权限失败 {:?}: {}", path, e))?;
    }

    #[cfg(not(unix))]
    {
        let _ = path;
    }

    Ok(())
}

fn write_status_line_script(path: &std::path::Path, content: &str) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("创建状态行脚本目录失败 {:?}: {}", parent, e))?;
    }

    fs::write(path, content).map_err(|e| format!("写入状态行脚本失败 {:?}: {}", path, e))?;
    ensure_status_line_script_executable(path)
}

fn install_status_line_preset_inner(
    preset_id: &str,
    overwrite: bool,
) -> Result<StatusLinePresetInstallResult, String> {
    if preset_id != DEFAULT_STATUS_LINE_PRESET_ID {
        return Err(format!("未知状态行预设 '{}'", preset_id));
    }

    ensure_status_line_preset_supported()?;
    let target_path = status_line_preset_target_path()?;
    if target_path.exists() {
        let existing = fs::read_to_string(&target_path)
            .map_err(|e| format!("读取状态行脚本失败 {:?}: {}", target_path, e))?;

        if existing == DEFAULT_STATUS_LINE_SCRIPT {
            ensure_status_line_script_executable(&target_path)?;
            return Ok(build_status_line_preset_result(
                preset_id,
                &target_path,
                false,
                false,
            ));
        }

        if !overwrite {
            return Ok(build_status_line_preset_result(
                preset_id,
                &target_path,
                false,
                true,
            ));
        }
    }

    write_status_line_script(&target_path, DEFAULT_STATUS_LINE_SCRIPT)?;
    Ok(build_status_line_preset_result(
        preset_id,
        &target_path,
        true,
        false,
    ))
}

fn remove_profile_bindings(bindings: &mut BindingState, profile_id: &str) {
    if bindings.user_profile_id.as_deref() == Some(profile_id) {
        bindings.user_profile_id = None;
        bindings.user_last_applied_at = None;
    }
}

fn apply_profile_to_registry(
    registry: &mut ConfigRegistry,
    profile_id: &str,
) -> Result<PathBuf, String> {
    let profile = registry
        .profiles
        .iter()
        .find(|profile| profile.id == profile_id)
        .cloned()
        .ok_or_else(|| format!("未找到 profile '{}'", profile_id))?;

    let resolved_settings = resolve_profile_settings(registry, &profile)?;
    let target_path = profile_settings_path()?;

    let content = serde_json::to_string_pretty(&resolved_settings).map_err(|e| e.to_string())?;
    crate::utils::ensure_dir_and_write_atomic(&target_path, &content)?;

    let now = crate::utils::current_rfc3339_timestamp();
    registry.bindings.user_profile_id = Some(profile.id);
    registry.bindings.user_last_applied_at = Some(now);

    Ok(target_path)
}

fn preset_exists(registry: &ConfigRegistry, preset_id: &str) -> bool {
    find_preset(registry, preset_id).is_some()
}

fn profile_uses_preset(
    registry: &ConfigRegistry,
    profile: &ConfigProfile,
    preset_id: &str,
) -> bool {
    let Some(profile_preset_id) = profile.preset_id.as_deref() else {
        return false;
    };

    if profile_preset_id == preset_id {
        return true;
    }

    let mut visited = HashSet::new();
    resolve_preset_chain(registry, profile_preset_id, &mut visited)
        .map(|chain| chain.iter().any(|preset| preset.id == preset_id))
        .unwrap_or(false)
}

fn bound_profile_ids_using_preset(registry: &ConfigRegistry, preset_id: &str) -> Vec<String> {
    let bound_profile_ids: HashSet<&str> = registry
        .bindings
        .user_profile_id
        .iter()
        .map(String::as_str)
        .collect();

    registry
        .profiles
        .iter()
        .filter(|profile| {
            bound_profile_ids.contains(profile.id.as_str())
                && profile_uses_preset(registry, profile, preset_id)
        })
        .map(|profile| profile.id.clone())
        .collect()
}

pub fn apply_profile_inner(profile_id: String) -> Result<ConfigRegistry, String> {
    let _lock = crate::utils::lock_config()?;
    let mut registry = load_registry()?;
    apply_profile_to_registry(&mut registry, &profile_id)?;
    save_registry(&registry)?;
    Ok(registry)
}

fn reorder_profiles_in_registry(registry: &mut ConfigRegistry, ids: &[String]) {
    let profile_map: HashMap<String, ConfigProfile> = registry
        .profiles
        .iter()
        .map(|profile| (profile.id.clone(), profile.clone()))
        .collect();

    let mut reordered: Vec<ConfigProfile> = ids
        .iter()
        .filter_map(|id| profile_map.get(id).cloned())
        .collect();

    let id_set: HashSet<&str> = ids.iter().map(String::as_str).collect();
    for profile in &registry.profiles {
        if !id_set.contains(profile.id.as_str()) {
            reordered.push(profile.clone());
        }
    }

    registry.profiles = reordered;
}

fn duplicate_profile_in_registry(
    registry: &mut ConfigRegistry,
    id: &str,
    name_suffix: &str,
) -> Result<ConfigProfile, String> {
    let index = registry
        .profiles
        .iter()
        .position(|profile| profile.id == id)
        .ok_or_else(|| "未找到要复制的 profile".to_string())?;

    let original = registry.profiles[index].clone();
    let now = crate::utils::current_rfc3339_timestamp();
    let duplicated = ConfigProfile {
        id: Uuid::new_v4().to_string(),
        name: format!("{}{}", original.name, name_suffix),
        description: original.description,
        preset_id: original.preset_id,
        settings: original.settings,
        created_at: now.clone(),
        updated_at: now,
    };

    registry.profiles.insert(index + 1, duplicated.clone());
    Ok(duplicated)
}

fn move_profile_to_front(registry: &mut ConfigRegistry, profile_id: &str) {
    let Some(index) = registry
        .profiles
        .iter()
        .position(|profile| profile.id == profile_id)
    else {
        return;
    };
    if index == 0 {
        return;
    }

    let profile = registry.profiles.remove(index);
    registry.profiles.insert(0, profile);
}

fn import_user_settings_profile_in_registry(
    registry: &mut ConfigRegistry,
    input: UserSettingsImportInput,
) -> Result<ConfigProfile, String> {
    let (settings, _, _) = read_user_settings_document()?;
    let now = crate::utils::current_rfc3339_timestamp();

    if let Some(existing_profile_id) = find_profile_matching_settings(registry, &settings) {
        let profile = registry
            .profiles
            .iter()
            .find(|profile| profile.id == existing_profile_id)
            .cloned()
            .ok_or("未找到匹配的 profile".to_string())?;
        registry.bindings.user_profile_id = Some(profile.id.clone());
        registry.bindings.user_last_applied_at = Some(now);
        move_profile_to_front(registry, &profile.id);
        return Ok(profile);
    }

    let name = input.name.trim();
    let description = input.description.trim();
    let profile = ConfigProfile {
        id: Uuid::new_v4().to_string(),
        name: if name.is_empty() {
            "Imported User Settings".to_string()
        } else {
            name.to_string()
        },
        description: description.to_string(),
        preset_id: None,
        settings,
        created_at: now.clone(),
        updated_at: now.clone(),
    };

    registry.bindings.user_profile_id = Some(profile.id.clone());
    registry.bindings.user_last_applied_at = Some(now);
    registry.profiles.insert(0, profile.clone());
    Ok(profile)
}

#[tauri::command]
#[specta::specta]
pub fn get_config_workspace(_app_handle: AppHandle) -> Result<ConfigWorkspace, String> {
    let registry = load_registry()?;
    Ok(build_workspace(registry))
}

#[tauri::command]
#[specta::specta]
pub fn upsert_profile(app_handle: AppHandle, data: ProfileInput) -> Result<ConfigProfile, String> {
    let result = (|| {
        let _lock = crate::utils::lock_config()?;
        let input = normalize_profile_input(data)?;
        validate_settings_document(&input.settings)?;

        let mut registry = load_registry()?;
        if let Some(preset_id) = input.preset_id.as_deref() {
            if !preset_exists(&registry, preset_id) {
                return Err(format!("未找到 preset '{}'", preset_id));
            }
        }

        let now = crate::utils::current_rfc3339_timestamp();
        let profile_id = input
            .id
            .clone()
            .unwrap_or_else(|| Uuid::new_v4().to_string());
        let profile = if let Some(existing) = registry
            .profiles
            .iter_mut()
            .find(|profile| profile.id == profile_id)
        {
            existing.name = input.name;
            existing.description = input.description;
            existing.preset_id = input.preset_id;
            existing.settings = input.settings;
            existing.updated_at = now.clone();
            existing.clone()
        } else {
            let profile = ConfigProfile {
                id: profile_id,
                name: input.name,
                description: input.description,
                preset_id: input.preset_id,
                settings: input.settings,
                created_at: now.clone(),
                updated_at: now,
            };
            registry.profiles.push(profile.clone());
            profile
        };

        if registry.bindings.user_profile_id.as_deref() == Some(&profile.id) {
            apply_profile_to_registry(&mut registry, &profile.id)?;
        }

        save_registry(&registry)?;
        rebuild_tray_menu(&app_handle, Some(&registry));
        let _ = app_handle.emit("config-workspace-changed", ());
        Ok(profile)
    })();
    crate::logging::log_command_result("profile.upsert", &result, |profile| {
        format!("profile_id={}", profile.id)
    });
    result
}

#[tauri::command]
#[specta::specta]
pub fn duplicate_profile(
    app_handle: AppHandle,
    id: String,
    name_suffix: String,
) -> Result<ConfigProfile, String> {
    let result = (|| {
        let _lock = crate::utils::lock_config()?;
        let mut registry = load_registry()?;
        let duplicated = duplicate_profile_in_registry(&mut registry, &id, &name_suffix)?;
        save_registry(&registry)?;
        rebuild_tray_menu(&app_handle, Some(&registry));
        let _ = app_handle.emit("config-workspace-changed", ());
        Ok(duplicated)
    })();
    crate::logging::log_command_result("profile.duplicate", &result, |profile| {
        format!("source_profile_id={id} profile_id={}", profile.id)
    });
    result
}

#[tauri::command]
#[specta::specta]
pub fn reorder_profiles(app_handle: AppHandle, ids: Vec<String>) -> Result<(), String> {
    let result = (|| {
        let _lock = crate::utils::lock_config()?;
        let mut registry = load_registry()?;
        reorder_profiles_in_registry(&mut registry, &ids);
        save_registry(&registry)?;
        rebuild_tray_menu(&app_handle, Some(&registry));
        let _ = app_handle.emit("config-workspace-changed", ());
        Ok(())
    })();
    crate::logging::log_command_result("profile.reorder", &result, |_| {
        format!("count={}", ids.len())
    });
    result
}

/// 把源 profile 的共享字段(常用选项 / 插件市场 / 插件)完全对齐到其余所有 profile。
///
/// `top_level_keys` 为顶层键(含 `enabledPlugins` / `extraKnownMarketplaces`),`env_keys` 为
/// `settings.env` 内需对齐的部分键。完全对齐语义:源有值则写入目标,源无该键则从目标移除;
/// env 只动 `env_keys` 列出的键,保留目标其它 env(如 API key)。返回实际发生变化的 profile id。
fn sync_shared_profile_settings_in_registry(
    registry: &mut ConfigRegistry,
    source_id: &str,
    top_level_keys: &[String],
    env_keys: &[String],
) -> Result<Vec<String>, String> {
    // 取源 profile 的自身 settings 作为对齐基准
    let source_settings = registry
        .profiles
        .iter()
        .find(|profile| profile.id == source_id)
        .map(|profile| profile.settings.clone())
        .ok_or_else(|| format!("未找到 profile '{}'", source_id))?;

    // 预提取源切片:顶层键与 env 部分键各自的目标值(None 表示源未设置)
    let source_top: Vec<(&String, Option<Value>)> = top_level_keys
        .iter()
        .map(|key| (key, source_settings.get(key).cloned()))
        .collect();
    let source_env: Vec<(&String, Option<Value>)> = env_keys
        .iter()
        .map(|key| {
            let value = source_settings
                .get("env")
                .and_then(Value::as_object)
                .and_then(|env| env.get(key))
                .cloned();
            (key, value)
        })
        .collect();

    let now = crate::utils::current_rfc3339_timestamp();
    let mut changed_ids = Vec::new();

    for profile in registry.profiles.iter_mut() {
        if profile.id == source_id {
            continue;
        }

        let (next_settings, changed) =
            align_shared_settings(&profile.settings, &source_top, &source_env);
        if !changed {
            continue;
        }

        validate_settings_document(&next_settings)?;
        profile.settings = next_settings;
        profile.updated_at = now.clone();
        changed_ids.push(profile.id.clone());
    }

    Ok(changed_ids)
}

/// 在 `target` 基础上对齐共享字段,返回新 settings 与是否发生实际变化;不修改入参。
fn align_shared_settings(
    target: &Value,
    source_top: &[(&String, Option<Value>)],
    source_env: &[(&String, Option<Value>)],
) -> (Value, bool) {
    let mut next = target.clone();
    let obj = match next.as_object_mut() {
        Some(obj) => obj,
        None => {
            // 异常数据:settings 非对象时重建为对象
            next = Value::Object(Map::new());
            next.as_object_mut().expect("just rebuilt as object")
        }
    };

    let mut changed = !target.is_object();

    // 顶层键完全对齐
    for (key, value) in source_top {
        match value {
            Some(v) => {
                if obj.get(*key) != Some(v) {
                    obj.insert((*key).clone(), v.clone());
                    changed = true;
                }
            }
            None => {
                if obj.remove(*key).is_some() {
                    changed = true;
                }
            }
        }
    }

    // env 部分键对齐:仅在源需写入或目标已有 env 时处理,避免凭空创建空 env
    let needs_env_write = source_env.iter().any(|(_, v)| v.is_some());
    let has_env_object = obj.get("env").map(Value::is_object).unwrap_or(false);
    if needs_env_write || has_env_object {
        let env_value = obj
            .entry("env".to_string())
            .or_insert_with(|| Value::Object(Map::new()));
        if !env_value.is_object() {
            *env_value = Value::Object(Map::new());
            changed = true;
        }
        let env_map = env_value.as_object_mut().expect("env ensured as object");
        for (key, value) in source_env {
            match value {
                Some(v) => {
                    if env_map.get(*key) != Some(v) {
                        env_map.insert((*key).clone(), v.clone());
                        changed = true;
                    }
                }
                None => {
                    if env_map.remove(*key).is_some() {
                        changed = true;
                    }
                }
            }
        }
        // env 被清空则移除该键,避免留下空壳
        if env_map.is_empty() {
            obj.remove("env");
        }
    }

    (next, changed)
}

#[tauri::command]
#[specta::specta]
pub fn sync_shared_profile_settings(
    app_handle: AppHandle,
    source_id: String,
    top_level_keys: Vec<String>,
    env_keys: Vec<String>,
) -> Result<u32, String> {
    let result = (|| {
        let _lock = crate::utils::lock_config()?;
        let mut registry = load_registry()?;
        let changed_ids = sync_shared_profile_settings_in_registry(
            &mut registry,
            &source_id,
            &top_level_keys,
            &env_keys,
        )?;

        // 若被修改的目标里包含当前已绑定 profile,重新应用以保持 ~/.claude/settings.json 一致
        if let Some(bound_id) = registry.bindings.user_profile_id.clone() {
            if changed_ids.iter().any(|id| id == &bound_id) {
                apply_profile_to_registry(&mut registry, &bound_id)?;
            }
        }

        save_registry(&registry)?;
        rebuild_tray_menu(&app_handle, Some(&registry));
        let _ = app_handle.emit("config-workspace-changed", ());
        Ok(changed_ids.len() as u32)
    })();
    crate::logging::log_command_result("profile.sync_shared", &result, |count| {
        format!("source_id={source_id} updated={count}")
    });
    result
}

#[tauri::command]
#[specta::specta]
pub fn delete_profile(app_handle: AppHandle, id: String) -> Result<(), String> {
    let result = (|| {
        let _lock = crate::utils::lock_config()?;
        let mut registry = load_registry()?;
        let original_len = registry.profiles.len();
        registry.profiles.retain(|profile| profile.id != id);
        if registry.profiles.len() == original_len {
            return Err("未找到要删除的 profile".to_string());
        }

        remove_profile_bindings(&mut registry.bindings, &id);
        save_registry(&registry)?;
        rebuild_tray_menu(&app_handle, Some(&registry));
        let _ = app_handle.emit("config-workspace-changed", ());
        Ok(())
    })();
    crate::logging::log_command_result("profile.delete", &result, |_| format!("profile_id={id}"));
    result
}

#[tauri::command]
#[specta::specta]
pub fn apply_profile(app_handle: AppHandle, id: String) -> Result<(), String> {
    let result = (|| {
        let registry = apply_profile_inner(id.clone())?;
        rebuild_tray_menu(&app_handle, Some(&registry));
        let _ = app_handle.emit("config-workspace-changed", ());
        Ok(())
    })();
    crate::logging::log_command_result("profile.apply", &result, |_| format!("profile_id={id}"));
    result
}

#[tauri::command]
#[specta::specta]
pub fn import_user_settings_profile(
    app_handle: AppHandle,
    data: UserSettingsImportInput,
) -> Result<ConfigProfile, String> {
    let result = (|| {
        let _lock = crate::utils::lock_config()?;
        let mut registry = load_registry()?;
        let profile = import_user_settings_profile_in_registry(&mut registry, data)?;
        save_registry(&registry)?;
        rebuild_tray_menu(&app_handle, Some(&registry));
        let _ = app_handle.emit("config-workspace-changed", ());
        Ok(profile)
    })();
    crate::logging::log_command_result("profile.import_user_settings", &result, |profile| {
        format!("profile_id={}", profile.id)
    });
    result
}

#[tauri::command]
#[specta::specta]
pub fn install_status_line_preset(
    preset_id: String,
    overwrite: bool,
) -> Result<StatusLinePresetInstallResult, String> {
    let result = install_status_line_preset_inner(&preset_id, overwrite);
    crate::logging::log_command_result("status_line_preset.install", &result, |value| {
        format!(
            "preset_id={} installed={} needs_overwrite={} overwritten={}",
            value.preset_id,
            value.installed,
            value.needs_overwrite,
            overwrite && value.installed
        )
    });
    result
}

#[tauri::command]
#[specta::specta]
pub fn preview_profile(data: ProfileInput) -> Result<String, String> {
    let input = normalize_profile_input(data)?;
    let mut registry = load_registry()?;
    if let Some(preset_id) = input.preset_id.as_deref() {
        if !preset_exists(&registry, preset_id) {
            return Err(format!("未找到 preset '{}'", preset_id));
        }
    }

    let profile = ConfigProfile {
        id: input.id.unwrap_or_else(|| "__preview__".to_string()),
        name: input.name,
        description: input.description,
        preset_id: input.preset_id,
        settings: input.settings,
        created_at: crate::utils::current_rfc3339_timestamp(),
        updated_at: crate::utils::current_rfc3339_timestamp(),
    };
    registry
        .profiles
        .retain(|existing| existing.id != profile.id);
    registry.profiles.push(profile.clone());

    let resolved = resolve_profile_settings(&registry, &profile)?;
    serde_json::to_string_pretty(&resolved).map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
pub async fn test_profile_model(data: ModelTestInput) -> Result<ModelTestResult, String> {
    let input = normalize_model_test_input(data)?;
    let mut registry = load_registry()?;
    if let Some(preset_id) = input.preset_id.as_deref() {
        if !preset_exists(&registry, preset_id) {
            return Err(format!("未找到 preset '{}'", preset_id));
        }
    }

    let now = crate::utils::current_rfc3339_timestamp();
    let prompt_text_override = input.prompt_text.clone();
    let profile = ConfigProfile {
        id: input.id.unwrap_or_else(|| "__test__".to_string()),
        name: input.name,
        description: input.description,
        preset_id: input.preset_id,
        settings: input.settings,
        created_at: now.clone(),
        updated_at: now,
    };
    registry
        .profiles
        .retain(|existing| existing.id != profile.id);
    registry.profiles.push(profile.clone());

    let resolved = resolve_profile_settings(&registry, &profile)?;
    let request = resolve_model_test_request(&resolved, prompt_text_override)?;
    execute_model_test_request(request).await
}

#[tauri::command]
#[specta::specta]
pub fn upsert_preset(app_handle: AppHandle, data: PresetInput) -> Result<SettingsPreset, String> {
    let result = (|| {
        let _lock = crate::utils::lock_config()?;
        let input = normalize_preset_input(data)?;
        validate_settings_document(&input.settings_patch)?;

        let mut registry = load_registry()?;
        if let Some(base_preset_id) = input.base_preset_id.as_deref() {
            if !preset_exists(&registry, base_preset_id) {
                return Err(format!("未找到 base preset '{}'", base_preset_id));
            }
        }

        let preset_id = build_custom_preset_id(&registry, &input);
        let preset = SettingsPreset {
            id: preset_id.clone(),
            name: input.name,
            localized_name: input.localized_name,
            description: input.description,
            base_preset_id: input.base_preset_id,
            doc_url: input.doc_url,
            models: input.models,
            model_suggestions: input.model_suggestions,
            settings_patch: input.settings_patch,
            source: PresetSource::Custom,
        };

        if let Some(existing) = registry
            .custom_presets
            .iter_mut()
            .find(|existing| existing.id == preset_id)
        {
            *existing = preset.clone();
        } else {
            registry.custom_presets.push(preset.clone());
        }

        for profile_id in bound_profile_ids_using_preset(&registry, &preset.id) {
            apply_profile_to_registry(&mut registry, &profile_id)?;
        }

        save_registry(&registry)?;
        rebuild_tray_menu(&app_handle, Some(&registry));
        let _ = app_handle.emit("config-workspace-changed", ());
        Ok(preset)
    })();
    crate::logging::log_command_result("preset.upsert", &result, |preset| {
        format!("preset_id={}", preset.id)
    });
    result
}

#[tauri::command]
#[specta::specta]
pub fn delete_preset(app_handle: AppHandle, id: String) -> Result<(), String> {
    let result = (|| {
        let _lock = crate::utils::lock_config()?;
        let mut registry = load_registry()?;

        if registry
            .profiles
            .iter()
            .any(|profile| profile_uses_preset(&registry, profile, &id))
        {
            return Err("该 preset 仍被 profile 使用，请先解除引用".to_string());
        }

        let original_len = registry.custom_presets.len();
        registry.custom_presets.retain(|preset| preset.id != id);
        if registry.custom_presets.len() == original_len {
            return Err("未找到要删除的 preset".to_string());
        }

        save_registry(&registry)?;
        rebuild_tray_menu(&app_handle, Some(&registry));
        let _ = app_handle.emit("config-workspace-changed", ());
        Ok(())
    })();
    crate::logging::log_command_result("preset.delete", &result, |_| format!("preset_id={id}"));
    result
}

#[tauri::command]
#[specta::specta]
pub fn set_app_preferences(
    app_handle: AppHandle,
    data: AppPreferencesInput,
) -> Result<AppPreferences, String> {
    let result = (|| {
        let _lock = crate::utils::lock_config()?;
        let preferences = normalize_app_preferences(data)?;
        let mut registry = load_registry()?;
        let previous_third_party_pricing = registry.app.third_party_provider_pricing_enabled;
        registry.app = preferences.clone();
        save_registry(&registry)?;
        rebuild_tray_menu(&app_handle, Some(&registry));
        // 偏好可能改了聚焦快捷键，按最新值重注册全局快捷键
        crate::tray::apply_focus_session_shortcut(&app_handle);
        // 按最新偏好同步桌面用量浮窗的显隐（启用则创建/显示，关闭则隐藏）
        crate::widget::sync_widget_visibility(&app_handle, preferences.floating_widget_enabled);
        let _ = app_handle.emit("config-workspace-changed", ());
        let _ = app_handle.emit("project-launcher-settings-changed", ());
        if previous_third_party_pricing != preferences.third_party_provider_pricing_enabled {
            crate::usage::schedule_usage_cost_recompute(app_handle.clone());
        }
        Ok(preferences)
    })();
    crate::logging::log_command_result("settings.update", &result, |_| String::new());
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::Path;

    fn temp_root(name: &str) -> PathBuf {
        let root = std::env::temp_dir().join(format!("ai-manager-{name}-{}", Uuid::new_v4()));
        fs::create_dir_all(&root).unwrap();
        root
    }

    fn set_test_env(root: &Path) {
        std::env::set_var("AI_MANAGER_HOME_OVERRIDE", root);
        std::env::set_var(
            "AI_MANAGER_APP_DATA_DIR_OVERRIDE",
            root.join(".config").join("ai-manager"),
        );
    }

    fn clear_test_env() {
        std::env::remove_var("AI_MANAGER_HOME_OVERRIDE");
        std::env::remove_var("AI_MANAGER_APP_DATA_DIR_OVERRIDE");
    }

    fn sample_profile(id: &str, preset_id: Option<&str>, settings: Value) -> ConfigProfile {
        ConfigProfile {
            id: id.to_string(),
            name: id.to_string(),
            description: String::new(),
            preset_id: preset_id.map(ToOwned::to_owned),
            settings,
            created_at: "2026-04-18T12:00:00Z".to_string(),
            updated_at: "2026-04-18T12:00:00Z".to_string(),
        }
    }

    fn sample_custom_preset(
        id: &str,
        base_preset_id: Option<&str>,
        patch: Value,
    ) -> SettingsPreset {
        SettingsPreset {
            id: id.to_string(),
            name: id.to_string(),
            localized_name: None,
            description: String::new(),
            base_preset_id: base_preset_id.map(ToOwned::to_owned),
            doc_url: None,
            models: None,
            model_suggestions: vec![],
            settings_patch: patch,
            source: PresetSource::Custom,
        }
    }

    fn sample_preset_input(name: &str, localized_name: Option<LocalizedText>) -> PresetInput {
        PresetInput {
            id: None,
            name: name.to_string(),
            localized_name,
            description: String::new(),
            base_preset_id: None,
            doc_url: None,
            models: None,
            model_suggestions: vec![],
            settings_patch: serde_json::json!({}),
        }
    }

    #[test]
    fn ui_language_from_system_locale_uses_chinese_for_zh_locales() {
        assert_eq!(ui_language_from_system_locale("zh-CN"), Some("zh"));
        assert_eq!(ui_language_from_system_locale("zh_CN.UTF-8"), Some("zh"));
        assert_eq!(ui_language_from_system_locale("zh-Hant-TW"), Some("zh"));
    }

    #[test]
    fn ui_language_from_system_locale_uses_english_for_non_zh_locales() {
        assert_eq!(ui_language_from_system_locale("en-US"), Some("en"));
        assert_eq!(ui_language_from_system_locale("ja-JP"), Some("en"));
        assert_eq!(ui_language_from_system_locale("C"), Some("en"));
    }

    #[test]
    fn app_preferences_default_to_expanded_sidebar() {
        let preferences: AppPreferences = serde_json::from_value(serde_json::json!({
            "showTrayTitle": true,
            "showTraySessions": true,
            "uiLanguage": "zh",
            "defaultTerminalApp": "terminal",
            "defaultEditorApp": null
        }))
        .unwrap();

        assert!(!preferences.collapse_sidebar_by_default);
        assert!(!preferences.system_notifications_enabled);
        assert!(preferences.third_party_provider_pricing_enabled);
    }

    #[test]
    fn compile_schema_regex_reuses_cached_patterns() {
        let first = compile_schema_regex("^Bash\\(.+\\)$").unwrap();
        let second = compile_schema_regex("^Bash\\(.+\\)$").unwrap();

        assert!(std::sync::Arc::ptr_eq(&first, &second));
    }

    #[test]
    fn builtin_presets_expose_localized_names() {
        let openrouter = builtin_presets()
            .iter()
            .find(|preset| preset.id == "builtin:openrouter")
            .unwrap();

        assert_eq!(openrouter.name, "OpenRouter");
        assert_eq!(
            openrouter.localized_name,
            Some(LocalizedText {
                zh: "OpenRouter".to_string(),
                en: "OpenRouter".to_string(),
            })
        );
    }

    #[test]
    fn builtin_presets_preserve_categorized_models() {
        let anthropic = builtin_presets()
            .iter()
            .find(|preset| preset.id == "builtin:anthropic")
            .unwrap();

        assert_eq!(
            anthropic.models,
            Some(vec![
                SettingsPresetModel {
                    id: "opus".to_string(),
                    category: PresetModelCategory::Opus,
                },
                SettingsPresetModel {
                    id: "sonnet".to_string(),
                    category: PresetModelCategory::Sonnet,
                },
                SettingsPresetModel {
                    id: "haiku".to_string(),
                    category: PresetModelCategory::Haiku,
                },
            ])
        );
    }

    #[test]
    fn builtin_presets_include_deepseek_official_claude_code_env() {
        let deepseek = builtin_presets()
            .iter()
            .find(|preset| preset.id == "builtin:deepseek")
            .unwrap();
        let env = deepseek.settings_patch["env"].as_object().unwrap();

        assert_eq!(deepseek.name, "DeepSeek");
        assert_eq!(
            deepseek.doc_url,
            Some(
                "https://api-docs.deepseek.com/zh-cn/quick_start/agent_integrations/claude_code"
                    .to_string()
            )
        );
        assert_eq!(
            deepseek.model_suggestions,
            vec![
                "deepseek-v4-pro[1m]".to_string(),
                "deepseek-v4-flash".to_string()
            ]
        );
        assert_eq!(
            env.get("ANTHROPIC_BASE_URL"),
            Some(&Value::String(
                "https://api.deepseek.com/anthropic".to_string()
            ))
        );
        assert_eq!(
            env.get("ANTHROPIC_MODEL"),
            Some(&Value::String("deepseek-v4-pro[1m]".to_string()))
        );
        assert_eq!(
            env.get("ANTHROPIC_DEFAULT_OPUS_MODEL"),
            Some(&Value::String("deepseek-v4-pro[1m]".to_string()))
        );
        assert_eq!(
            env.get("ANTHROPIC_DEFAULT_SONNET_MODEL"),
            Some(&Value::String("deepseek-v4-pro[1m]".to_string()))
        );
        assert_eq!(
            env.get("ANTHROPIC_DEFAULT_HAIKU_MODEL"),
            Some(&Value::String("deepseek-v4-flash".to_string()))
        );
        assert_eq!(
            env.get("CLAUDE_CODE_SUBAGENT_MODEL"),
            Some(&Value::String("deepseek-v4-flash".to_string()))
        );
        assert_eq!(
            env.get("CLAUDE_CODE_EFFORT_LEVEL"),
            Some(&Value::String("max".to_string()))
        );
        assert!(!env.contains_key("ANTHROPIC_AUTH_TOKEN"));
    }

    #[test]
    fn new_custom_preset_id_uses_english_name_slug() {
        let registry = ConfigRegistry::default();
        let input = sample_preset_input(
            "General Config",
            Some(LocalizedText {
                zh: "通用配置".to_string(),
                en: "General Config".to_string(),
            }),
        );

        assert_eq!(
            build_custom_preset_id(&registry, &input),
            "custom:general-config"
        );
    }

    #[test]
    fn new_custom_preset_id_appends_suffix_on_conflict() {
        let mut registry = ConfigRegistry::default();
        registry.custom_presets.push(sample_custom_preset(
            "custom:general-config",
            None,
            serde_json::json!({}),
        ));
        let input = sample_preset_input("General Config", None);

        assert_eq!(
            build_custom_preset_id(&registry, &input),
            "custom:general-config-2"
        );
    }

    #[test]
    fn new_custom_preset_id_falls_back_to_uuid_when_slug_is_empty() {
        let registry = ConfigRegistry::default();
        let input = sample_preset_input("通用配置", None);
        let id = build_custom_preset_id(&registry, &input);

        assert!(id.starts_with("custom:"));
        assert!(Uuid::parse_str(id.trim_start_matches("custom:")).is_ok());
    }

    #[test]
    fn custom_preset_id_keeps_existing_id_when_editing() {
        let registry = ConfigRegistry::default();
        let mut input = sample_preset_input("Renamed Config", None);
        input.id = Some("custom:existing-id".to_string());

        assert_eq!(
            build_custom_preset_id(&registry, &input),
            "custom:existing-id"
        );
    }

    #[test]
    fn resolve_profile_settings_merges_builtin_custom_and_profile_layers() {
        let mut registry = ConfigRegistry::default();
        registry.custom_presets.push(sample_custom_preset(
            "custom:team-openrouter",
            Some("builtin:openrouter"),
            serde_json::json!({
                "permissions": {
                    "defaultMode": "plan"
                }
            }),
        ));
        let profile = sample_profile(
            "user-openrouter",
            Some("custom:team-openrouter"),
            serde_json::json!({
                "model": "claude-sonnet-4-6",
                "env": {
                    "ANTHROPIC_AUTH_TOKEN": "token"
                }
            }),
        );

        let resolved = resolve_profile_settings(&registry, &profile).unwrap();
        assert_eq!(
            resolved["env"]["ANTHROPIC_BASE_URL"],
            Value::String("https://openrouter.ai/api".to_string())
        );
        assert_eq!(
            resolved["env"]["ANTHROPIC_AUTH_TOKEN"],
            Value::String("token".to_string())
        );
        assert_eq!(
            resolved["permissions"]["defaultMode"],
            Value::String("plan".to_string())
        );
        assert_eq!(
            resolved["model"],
            Value::String("claude-sonnet-4-6".to_string())
        );
        assert_eq!(
            resolved["$schema"],
            Value::String(CLAUDE_SETTINGS_SCHEMA_URL.to_string())
        );
    }

    #[test]
    fn profile_settings_path_is_always_user_level() {
        let _guard = crate::utils::lock_config().unwrap();
        let root = temp_root("profile-paths");
        set_test_env(&root);

        let user_path = profile_settings_path().unwrap();
        assert_eq!(user_path, root.join(".claude").join("settings.json"));

        clear_test_env();
    }

    #[test]
    fn validate_settings_document_accepts_unknown_top_level_keys() {
        let settings = serde_json::json!({
            "futureClaudeCodeKey": {
                "enabled": true
            }
        });

        assert!(validate_settings_document(&settings).is_ok());
    }

    #[test]
    fn validate_settings_document_rejects_unknown_nested_keys_for_known_schema() {
        let error = validate_settings_document(&serde_json::json!({
            "permissions": {
                "notARealPermissionKey": true
            }
        }))
        .unwrap_err();

        assert!(error.contains("settings.permissions"));
        assert!(error.contains("notARealPermissionKey"));
    }

    #[test]
    fn validate_settings_document_accepts_has_completed_onboarding() {
        let settings = serde_json::json!({
            "hasCompletedOnboarding": true
        });

        assert!(validate_settings_document(&settings).is_ok());
    }

    #[test]
    fn validate_settings_document_accepts_permission_rules() {
        let settings = serde_json::json!({
            "permissions": {
                "allow": ["Bash"]
            }
        });

        assert!(validate_settings_document(&settings).is_ok());
    }

    #[test]
    fn workspace_discovers_unmanaged_user_settings() {
        let _guard = crate::utils::lock_config().unwrap();
        let root = temp_root("discover-user-settings");
        set_test_env(&root);
        let settings_path = root.join(".claude").join("settings.json");
        fs::create_dir_all(settings_path.parent().unwrap()).unwrap();
        fs::write(
            &settings_path,
            r#"{
  "$schema": "https://json.schemastore.org/claude-code-settings.json",
  "model": "claude-sonnet-4-6",
  "permissions": {
    "defaultMode": "plan"
  }
}"#,
        )
        .unwrap();

        let workspace = build_workspace(ConfigRegistry::default());
        let unmanaged = workspace
            .unmanaged_user_settings
            .expect("应发现未托管用户配置");

        assert_eq!(unmanaged.source_path, "settings.json");
        assert_eq!(unmanaged.import_status, "ready");
        assert_eq!(unmanaged.settings["model"], "claude-sonnet-4-6");
        assert_eq!(unmanaged.settings.get("$schema"), None);
        assert!(unmanaged.size > 0);
        assert!(unmanaged.modified_at > 0);

        clear_test_env();
    }

    #[test]
    fn workspace_hides_user_settings_when_bound_profile_matches() {
        let _guard = crate::utils::lock_config().unwrap();
        let root = temp_root("hide-bound-user-settings");
        set_test_env(&root);
        let settings_path = root.join(".claude").join("settings.json");
        fs::create_dir_all(settings_path.parent().unwrap()).unwrap();
        fs::write(
            &settings_path,
            r#"{
  "$schema": "https://json.schemastore.org/claude-code-settings.json",
  "model": "claude-sonnet-4-6"
}"#,
        )
        .unwrap();

        let mut registry = ConfigRegistry::default();
        registry.profiles.push(sample_profile(
            "user-1",
            None,
            serde_json::json!({ "model": "claude-sonnet-4-6" }),
        ));
        registry.bindings.user_profile_id = Some("user-1".to_string());

        let workspace = build_workspace(registry);

        assert!(workspace.unmanaged_user_settings.is_none());
        assert!(workspace.active_user_settings_mismatch.is_none());

        clear_test_env();
    }

    #[test]
    fn workspace_reports_user_settings_mismatch_without_clearing_binding() {
        let _guard = crate::utils::lock_config().unwrap();
        let root = temp_root("report-user-settings-mismatch");
        set_test_env(&root);
        let settings_path = root.join(".claude").join("settings.json");
        fs::create_dir_all(settings_path.parent().unwrap()).unwrap();
        fs::write(
            &settings_path,
            r#"{
  "model": "claude-opus-4-7"
}"#,
        )
        .unwrap();

        let mut registry = ConfigRegistry::default();
        registry.profiles.push(sample_profile(
            "user-1",
            None,
            serde_json::json!({ "model": "claude-sonnet-4-6" }),
        ));
        registry.bindings.user_profile_id = Some("user-1".to_string());
        registry.bindings.user_last_applied_at = Some("2026-05-13T00:00:00Z".to_string());

        let workspace = build_workspace(registry);

        assert_eq!(
            workspace.bindings.user_profile_id.as_deref(),
            Some("user-1")
        );
        assert_eq!(
            workspace.bindings.user_last_applied_at.as_deref(),
            Some("2026-05-13T00:00:00Z")
        );
        assert!(workspace.unmanaged_user_settings.is_none());
        let mismatch = workspace
            .active_user_settings_mismatch
            .expect("手动修改后的用户配置应报告差异");
        assert_eq!(mismatch.profile_id, "user-1");
        assert_eq!(mismatch.source_path, "settings.json");
        assert_eq!(mismatch.expected_settings["model"], "claude-sonnet-4-6");
        assert_eq!(mismatch.actual_settings["model"], "claude-opus-4-7");

        clear_test_env();
    }

    #[test]
    fn workspace_skips_unmanaged_user_settings_when_profiles_exist() {
        let _guard = crate::utils::lock_config().unwrap();
        let root = temp_root("skip-unmanaged-when-profiles-exist");
        set_test_env(&root);
        let settings_path = root.join(".claude").join("settings.json");
        fs::create_dir_all(settings_path.parent().unwrap()).unwrap();
        fs::write(
            &settings_path,
            r#"{
  "model": "claude-opus-4-7"
}"#,
        )
        .unwrap();

        let mut registry = ConfigRegistry::default();
        registry.profiles.push(sample_profile(
            "user-1",
            None,
            serde_json::json!({ "model": "claude-sonnet-4-6" }),
        ));

        let workspace = build_workspace(registry);

        assert!(workspace.unmanaged_user_settings.is_none());
        assert!(workspace.active_user_settings_mismatch.is_none());

        clear_test_env();
    }

    #[test]
    fn import_user_settings_creates_profile_without_rewriting_file() {
        let _guard = crate::utils::lock_config().unwrap();
        let root = temp_root("import-user-settings");
        set_test_env(&root);
        let settings_path = root.join(".claude").join("settings.json");
        fs::create_dir_all(settings_path.parent().unwrap()).unwrap();
        let original = r#"{"$schema":"https://json.schemastore.org/claude-code-settings.json","model":"claude-sonnet-4-6"}"#;
        fs::write(&settings_path, original).unwrap();
        let mut registry = ConfigRegistry::default();
        registry.profiles.push(sample_profile(
            "existing-profile",
            None,
            serde_json::json!({ "model": "claude-opus-4-7" }),
        ));

        let imported = import_user_settings_profile_in_registry(
            &mut registry,
            UserSettingsImportInput {
                name: "导入的用户设置".to_string(),
                description: "从 ~/.claude/settings.json 导入".to_string(),
            },
        )
        .unwrap();

        assert_eq!(registry.profiles.len(), 2);
        assert_eq!(registry.profiles[0].id, imported.id);
        assert_eq!(registry.profiles[1].id, "existing-profile");
        assert_eq!(
            registry.bindings.user_profile_id.as_deref(),
            Some(imported.id.as_str())
        );
        assert!(registry.bindings.user_last_applied_at.is_some());
        assert_eq!(imported.preset_id, None);
        assert_eq!(imported.settings.get("$schema"), None);
        assert_eq!(imported.settings["model"], "claude-sonnet-4-6");
        assert_eq!(fs::read_to_string(&settings_path).unwrap(), original);

        clear_test_env();
    }

    #[test]
    fn import_user_settings_reuses_matching_profile() {
        let _guard = crate::utils::lock_config().unwrap();
        let root = temp_root("import-user-settings-reuse");
        set_test_env(&root);
        let settings_path = root.join(".claude").join("settings.json");
        fs::create_dir_all(settings_path.parent().unwrap()).unwrap();
        fs::write(
            &settings_path,
            r#"{"$schema":"https://json.schemastore.org/claude-code-settings.json","model":"claude-sonnet-4-6"}"#,
        )
        .unwrap();
        let mut registry = ConfigRegistry::default();
        registry.profiles.push(sample_profile(
            "other-profile",
            None,
            serde_json::json!({ "model": "claude-opus-4-7" }),
        ));
        registry.profiles.push(sample_profile(
            "existing-profile",
            None,
            serde_json::json!({ "model": "claude-sonnet-4-6" }),
        ));

        let imported = import_user_settings_profile_in_registry(
            &mut registry,
            UserSettingsImportInput {
                name: "导入的用户设置".to_string(),
                description: "从 ~/.claude/settings.json 导入".to_string(),
            },
        )
        .unwrap();

        assert_eq!(imported.id, "existing-profile");
        assert_eq!(registry.profiles.len(), 2);
        assert_eq!(registry.profiles[0].id, "existing-profile");
        assert_eq!(registry.profiles[1].id, "other-profile");
        assert_eq!(
            registry.bindings.user_profile_id.as_deref(),
            Some("existing-profile")
        );

        clear_test_env();
    }

    #[test]
    fn workspace_reports_invalid_user_settings_status() {
        let _guard = crate::utils::lock_config().unwrap();
        let root = temp_root("invalid-user-settings");
        set_test_env(&root);
        let settings_path = root.join(".claude").join("settings.json");
        fs::create_dir_all(settings_path.parent().unwrap()).unwrap();
        fs::write(&settings_path, "{ invalid json").unwrap();

        let workspace = build_workspace(ConfigRegistry::default());
        let unmanaged = workspace
            .unmanaged_user_settings
            .expect("应显示无法导入的用户配置");

        assert_eq!(unmanaged.import_status, "invalidJson");
        assert!(unmanaged.error_message.unwrap().contains("解析 JSON 失败"));

        clear_test_env();
    }

    #[cfg(unix)]
    #[test]
    fn workspace_reports_symlink_user_settings_as_unsupported() {
        use std::os::unix::fs::symlink;

        let _guard = crate::utils::lock_config().unwrap();
        let root = temp_root("symlink-user-settings");
        set_test_env(&root);
        let settings_path = root.join(".claude").join("settings.json");
        let external_path = root.join("external-settings.json");
        fs::create_dir_all(settings_path.parent().unwrap()).unwrap();
        fs::write(&external_path, "{}").unwrap();
        symlink(&external_path, &settings_path).unwrap();

        let workspace = build_workspace(ConfigRegistry::default());
        let unmanaged = workspace
            .unmanaged_user_settings
            .expect("应显示软链接用户配置");

        assert_eq!(unmanaged.import_status, "unsupportedSymlink");
        assert!(unmanaged.settings.is_object());
        assert!(unmanaged.settings.as_object().unwrap().is_empty());

        clear_test_env();
    }

    #[test]
    fn apply_profile_updates_binding_only_after_file_write() {
        let _guard = crate::utils::lock_config().unwrap();
        let root = temp_root("apply-profile");
        set_test_env(&root);

        let mut registry = ConfigRegistry::default();
        registry.profiles.push(sample_profile(
            "user-1",
            None,
            serde_json::json!({
                "model": "claude-sonnet-4-6"
            }),
        ));

        let path = apply_profile_to_registry(&mut registry, "user-1").unwrap();
        let written = fs::read_to_string(path).unwrap();
        assert!(written.contains("\"model\": \"claude-sonnet-4-6\""));
        assert_eq!(registry.bindings.user_profile_id.as_deref(), Some("user-1"));
        assert!(registry.bindings.user_last_applied_at.is_some());

        clear_test_env();
    }

    #[cfg(unix)]
    #[test]
    fn install_status_line_preset_writes_default_script_to_user_claude_dir() {
        let _guard = crate::utils::lock_config().unwrap();
        let root = temp_root("status-line-install");
        set_test_env(&root);

        let result = install_status_line_preset_inner("default", false).unwrap();
        let target_path = root.join(".claude").join("statusline.sh");

        assert_eq!(PathBuf::from(&result.target_path), target_path);
        assert_eq!(result.command_path, "~/.claude/statusline.sh");
        assert!(result.installed);
        assert!(!result.needs_overwrite);
        assert_eq!(
            fs::read_to_string(&target_path).unwrap(),
            DEFAULT_STATUS_LINE_SCRIPT
        );
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            assert_eq!(
                fs::metadata(&target_path).unwrap().permissions().mode() & 0o777,
                0o755
            );
        }

        clear_test_env();
    }

    #[cfg(not(windows))]
    #[test]
    fn default_status_line_script_checks_jq_before_parsing_input() {
        assert!(DEFAULT_STATUS_LINE_SCRIPT.contains("command -v jq"));
    }

    #[cfg(not(windows))]
    #[test]
    fn default_status_line_script_uses_tmpdir_for_git_cache() {
        assert!(DEFAULT_STATUS_LINE_SCRIPT.contains("${TMPDIR:-/tmp}"));
        assert!(!DEFAULT_STATUS_LINE_SCRIPT.contains("cache_file=\"/tmp/"));
    }

    #[cfg(windows)]
    #[test]
    fn default_status_line_script_uses_powershell_json_and_utf8() {
        // Windows 版用 ConvertFrom-Json 解析 stdin，无需 jq
        assert!(DEFAULT_STATUS_LINE_SCRIPT.contains("ConvertFrom-Json"));
        // 强制 UTF-8 输出，避免 emoji 与中文乱码
        assert!(DEFAULT_STATUS_LINE_SCRIPT.contains("[Console]::OutputEncoding"));
    }

    #[cfg(windows)]
    #[test]
    fn install_status_line_preset_writes_powershell_script_on_windows() {
        let _guard = crate::utils::lock_config().unwrap();
        let root = temp_root("status-line-install-windows");
        set_test_env(&root);

        let result = install_status_line_preset_inner("default", false).unwrap();
        let target_path = root.join(".claude").join("statusline.ps1");

        assert_eq!(PathBuf::from(&result.target_path), target_path);
        assert!(result.command_path.starts_with("powershell"));
        // 命令路径必须用正斜杠，避免被当作转义字符
        assert!(result.command_path.contains(".claude/statusline.ps1"));
        assert!(!result.command_path.contains('\\'));
        assert!(result.installed);
        assert!(!result.needs_overwrite);
        assert_eq!(
            fs::read_to_string(&target_path).unwrap(),
            DEFAULT_STATUS_LINE_SCRIPT
        );

        clear_test_env();
    }

    #[cfg(not(any(unix, windows)))]
    #[test]
    fn install_status_line_preset_rejects_unsupported_platforms() {
        let result = install_status_line_preset_inner("default", false);

        assert!(result.is_err());
        assert_eq!(
            result.unwrap_err(),
            STATUS_LINE_PRESET_UNSUPPORTED_PLATFORM_ERROR
        );
    }

    #[cfg(unix)]
    #[test]
    fn install_status_line_preset_keeps_matching_script_and_repairs_permissions() {
        let _guard = crate::utils::lock_config().unwrap();
        let root = temp_root("status-line-existing-match");
        set_test_env(&root);
        let target_path = root.join(".claude").join("statusline.sh");
        fs::create_dir_all(target_path.parent().unwrap()).unwrap();
        fs::write(&target_path, DEFAULT_STATUS_LINE_SCRIPT).unwrap();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(&target_path, fs::Permissions::from_mode(0o600)).unwrap();
        }

        let result = install_status_line_preset_inner("default", false).unwrap();

        assert!(!result.installed);
        assert!(!result.needs_overwrite);
        assert_eq!(
            fs::read_to_string(&target_path).unwrap(),
            DEFAULT_STATUS_LINE_SCRIPT
        );
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            assert_eq!(
                fs::metadata(&target_path).unwrap().permissions().mode() & 0o777,
                0o755
            );
        }

        clear_test_env();
    }

    #[cfg(unix)]
    #[test]
    fn install_status_line_preset_reports_overwrite_needed_for_different_script() {
        let _guard = crate::utils::lock_config().unwrap();
        let root = temp_root("status-line-existing-different");
        set_test_env(&root);
        let target_path = root.join(".claude").join("statusline.sh");
        fs::create_dir_all(target_path.parent().unwrap()).unwrap();
        fs::write(&target_path, "#!/bin/sh\necho custom\n").unwrap();

        let result = install_status_line_preset_inner("default", false).unwrap();

        assert!(!result.installed);
        assert!(result.needs_overwrite);
        assert_eq!(
            fs::read_to_string(&target_path).unwrap(),
            "#!/bin/sh\necho custom\n"
        );

        clear_test_env();
    }

    #[cfg(unix)]
    #[test]
    fn install_status_line_preset_overwrites_different_script_when_confirmed() {
        let _guard = crate::utils::lock_config().unwrap();
        let root = temp_root("status-line-overwrite");
        set_test_env(&root);
        let target_path = root.join(".claude").join("statusline.sh");
        fs::create_dir_all(target_path.parent().unwrap()).unwrap();
        fs::write(&target_path, "#!/bin/sh\necho custom\n").unwrap();

        let result = install_status_line_preset_inner("default", true).unwrap();

        assert!(result.installed);
        assert!(!result.needs_overwrite);
        assert_eq!(
            fs::read_to_string(&target_path).unwrap(),
            DEFAULT_STATUS_LINE_SCRIPT
        );

        clear_test_env();
    }

    #[test]
    fn reorder_profiles_preserves_requested_order_and_appends_missing_items() {
        let mut registry = ConfigRegistry {
            profiles: vec![
                sample_profile("profile-a", None, serde_json::json!({})),
                sample_profile("profile-b", None, serde_json::json!({})),
                sample_profile("profile-c", None, serde_json::json!({})),
            ],
            ..Default::default()
        };

        reorder_profiles_in_registry(
            &mut registry,
            &["profile-c".to_string(), "profile-a".to_string()],
        );

        let ordered_ids: Vec<&str> = registry
            .profiles
            .iter()
            .map(|profile| profile.id.as_str())
            .collect();
        assert_eq!(ordered_ids, vec!["profile-c", "profile-a", "profile-b"]);
    }

    #[test]
    fn duplicate_profile_inserts_copy_right_after_original() {
        let mut registry = ConfigRegistry {
            profiles: vec![
                sample_profile("profile-a", None, serde_json::json!({ "model": "a" })),
                sample_profile("profile-b", None, serde_json::json!({ "model": "b" })),
                sample_profile("profile-c", None, serde_json::json!({ "model": "c" })),
            ],
            ..Default::default()
        };

        let duplicated =
            duplicate_profile_in_registry(&mut registry, "profile-b", " 副本").unwrap();

        let ordered_ids: Vec<&str> = registry
            .profiles
            .iter()
            .map(|profile| profile.id.as_str())
            .collect();
        assert_eq!(
            ordered_ids,
            vec![
                "profile-a",
                "profile-b",
                duplicated.id.as_str(),
                "profile-c"
            ]
        );
        assert_eq!(duplicated.name, "profile-b 副本");
        assert_eq!(duplicated.description, "");
        assert_eq!(duplicated.settings, serde_json::json!({ "model": "b" }));
    }

    #[test]
    fn load_registry_fails_closed_on_invalid_json() {
        let _guard = crate::utils::lock_config().unwrap();
        let root = temp_root("invalid-registry");
        set_test_env(&root);
        let registry_path = get_registry_path().unwrap();
        fs::create_dir_all(registry_path.parent().unwrap()).unwrap();
        fs::write(&registry_path, "{ invalid json ").unwrap();

        let error = load_registry().unwrap_err();
        assert!(error.contains("解析 JSON 失败"));

        clear_test_env();
    }

    #[test]
    fn updating_custom_preset_reapplies_bound_profiles() {
        let _guard = crate::utils::lock_config().unwrap();
        let root = temp_root("preset-reapply");
        set_test_env(&root);

        let mut registry = ConfigRegistry::default();
        registry.custom_presets.push(sample_custom_preset(
            "custom:base",
            None,
            serde_json::json!({
                "env": {
                    "ANTHROPIC_BASE_URL": "https://old.example.com"
                }
            }),
        ));
        registry.profiles.push(sample_profile(
            "user-1",
            Some("custom:base"),
            serde_json::json!({
                "env": {
                    "ANTHROPIC_AUTH_TOKEN": "token"
                }
            }),
        ));
        registry.bindings.user_profile_id = Some("user-1".to_string());
        apply_profile_to_registry(&mut registry, "user-1").unwrap();

        registry.custom_presets[0].settings_patch = serde_json::json!({
            "env": {
                "ANTHROPIC_BASE_URL": "https://new.example.com"
            }
        });
        for profile_id in bound_profile_ids_using_preset(&registry, "custom:base") {
            apply_profile_to_registry(&mut registry, &profile_id).unwrap();
        }

        let written = fs::read_to_string(root.join(".claude").join("settings.json")).unwrap();
        assert!(written.contains("https://new.example.com"));

        clear_test_env();
    }

    #[test]
    fn example_snapshots_match_registry_and_settings_output() {
        let registry = ConfigRegistry {
            schema: CONFIG_REGISTRY_SCHEMA_URL.to_string(),
            version: REGISTRY_VERSION,
            app: AppPreferences {
                show_tray_title: true,
                show_tray_sessions: true,
                system_notifications_enabled: false,
                collapse_sidebar_by_default: false,
                third_party_provider_pricing_enabled: true,
                ui_language: "zh".to_string(),
                default_terminal_app: "terminal".to_string(),
                default_editor_app: Some("cursor".to_string()),
                tray_title_max_chars: None,
                session_tray_count_style: SessionTrayCountStyle::SuperscriptCompact,
                tray_pulse_waiting: true,
                focus_session_shortcut: Some("Command+Control+J".to_string()),
                led_control: crate::led::LedControlPreferences::default(),
                floating_widget_enabled: false,
                floating_widget_metrics: default_floating_widget_metrics(),
                floating_widget_opacity: default_floating_widget_opacity(),
            },
            custom_presets: vec![SettingsPreset {
                id: "custom:team-plan".to_string(),
                name: "Team Plan".to_string(),
                localized_name: Some(LocalizedText {
                    zh: "团队计划".to_string(),
                    en: "Team Plan".to_string(),
                }),
                description: "团队默认权限".to_string(),
                base_preset_id: Some("builtin:openrouter".to_string()),
                doc_url: Some("https://example.com/preset-docs".to_string()),
                models: None,
                model_suggestions: vec!["claude-sonnet-4-6".to_string()],
                settings_patch: stable_sort_json(serde_json::json!({
                    "permissions": {
                        "defaultMode": "plan"
                    }
                })),
                source: PresetSource::Custom,
            }],
            profiles: vec![ConfigProfile {
                id: "user-openrouter".to_string(),
                name: "OpenRouter User".to_string(),
                description: "全局开发默认配置".to_string(),
                preset_id: Some("custom:team-plan".to_string()),
                settings: stable_sort_json(serde_json::json!({
                    "env": {
                        "ANTHROPIC_AUTH_TOKEN": "token"
                    },
                    "model": "claude-sonnet-4-6"
                })),
                created_at: "2026-04-18T12:00:00+08:00".to_string(),
                updated_at: "2026-04-18T12:00:00+08:00".to_string(),
            }],
            bindings: BindingState {
                user_profile_id: Some("user-openrouter".to_string()),
                user_last_applied_at: Some("2026-04-18T12:00:00+08:00".to_string()),
            },
        };

        let registry_json = serde_json::to_string_pretty(&registry).unwrap();
        assert_eq!(
            include_str!("../tests/fixtures/config-registry.example.json").trim(),
            registry_json
        );

        let resolved = resolve_profile_settings(&registry, &registry.profiles[0]).unwrap();
        let settings_json = serde_json::to_string_pretty(&resolved).unwrap();
        assert_eq!(
            include_str!("../tests/fixtures/claude-settings.example.json").trim(),
            settings_json
        );
    }

    #[test]
    fn resolve_model_test_request_prefers_env_model_and_defaults_base_url() {
        let request = resolve_model_test_request(
            &serde_json::json!({
                "model": "fallback-model",
                "env": {
                    "ANTHROPIC_AUTH_TOKEN": " token ",
                    "ANTHROPIC_MODEL": " claude-sonnet-4-6 "
                }
            }),
            None,
        )
        .unwrap();

        assert_eq!(request.auth_token, "token");
        assert_eq!(request.base_url, DEFAULT_ANTHROPIC_BASE_URL);
        assert_eq!(request.resolved_model, "claude-sonnet-4-6");
        assert_eq!(request.prompt_text, MODEL_TEST_PROMPT_EN);
    }

    #[test]
    fn resolve_model_test_request_accepts_top_level_model_and_custom_base_url() {
        let request = resolve_model_test_request(
            &serde_json::json!({
                "model": " claude-opus-4-1 ",
                "env": {
                    "ANTHROPIC_AUTH_TOKEN": "token",
                    "ANTHROPIC_BASE_URL": "https://openrouter.ai/api/"
                }
            }),
            None,
        )
        .unwrap();

        assert_eq!(request.base_url, "https://openrouter.ai/api");
        assert_eq!(request.resolved_model, "claude-opus-4-1");
        assert_eq!(request.prompt_text, MODEL_TEST_PROMPT_EN);
    }

    #[test]
    fn resolve_model_test_request_uses_chinese_prompt_when_language_is_chinese() {
        let request = resolve_model_test_request(
            &serde_json::json!({
                "language": "chinese",
                "model": "claude-sonnet-4-6",
                "env": {
                    "ANTHROPIC_AUTH_TOKEN": "token"
                }
            }),
            None,
        )
        .unwrap();

        assert_eq!(request.prompt_text, MODEL_TEST_PROMPT_ZH);
    }

    #[test]
    fn resolve_model_test_request_uses_prompt_override() {
        let request = resolve_model_test_request(
            &serde_json::json!({
                "language": "chinese",
                "model": "claude-sonnet-4-6",
                "env": {
                    "ANTHROPIC_AUTH_TOKEN": "token"
                }
            }),
            Some("Custom prompt".to_string()),
        )
        .unwrap();

        assert_eq!(request.prompt_text, "Custom prompt");
    }

    #[test]
    fn normalize_model_test_input_rejects_blank_prompt_override() {
        let error = normalize_model_test_input(ModelTestInput {
            id: Some("profile-a".to_string()),
            name: "Profile A".to_string(),
            description: String::new(),
            preset_id: None,
            settings: serde_json::json!({}),
            prompt_text: Some("   ".to_string()),
        })
        .unwrap_err();

        assert_eq!(error, "测试提示词不能为空");
    }

    #[test]
    fn resolve_model_test_request_requires_auth_token() {
        let error = resolve_model_test_request(
            &serde_json::json!({
                "model": "claude-sonnet-4-6"
            }),
            None,
        )
        .unwrap_err();

        assert_eq!(error, "缺少 ANTHROPIC_AUTH_TOKEN，请先在认证区填写认证密钥");
    }

    #[test]
    fn resolve_model_test_request_requires_model() {
        let error = resolve_model_test_request(
            &serde_json::json!({
                "env": {
                    "ANTHROPIC_AUTH_TOKEN": "token"
                }
            }),
            None,
        )
        .unwrap_err();

        assert_eq!(error, "缺少默认模型，请先在模型与行为中填写默认模型");
    }

    #[test]
    fn parse_model_test_response_extracts_text_and_metadata() {
        let exchange = ModelTestHttpExchange {
            request_method: "POST".to_string(),
            request_url: "https://api.anthropic.com/v1/messages".to_string(),
            request_headers: [
                ("x-api-key".to_string(), "token".to_string()),
                ("anthropic-version".to_string(), "2023-06-01".to_string()),
                ("content-type".to_string(), "application/json".to_string()),
            ]
            .into_iter()
            .collect(),
            request_body: r#"{"model":"claude-sonnet-4-6"}"#.to_string(),
            response_headers: [
                ("content-type".to_string(), "application/json".to_string()),
                ("request-id".to_string(), "req_test_123".to_string()),
            ]
            .into_iter()
            .collect(),
        };
        let result = parse_model_test_response(
            &serde_json::json!({
                "model": "provider-model-id",
                "stop_reason": "end_turn",
                "content": [
                    { "type": "text", "text": "API test succeeded." },
                    { "type": "tool_use", "name": "noop" },
                    { "type": "text", "text": "Everything looks good." }
                ]
            }),
            MODEL_TEST_PROMPT_EN.to_string(),
            "claude-sonnet-4-6".to_string(),
            128,
            Some("req_test_123".to_string()),
            "{\"model\":\"provider-model-id\"}".to_string(),
            exchange.clone(),
        )
        .unwrap();

        assert_eq!(
            result,
            ModelTestResult {
                ok: true,
                response_text: "API test succeeded.\n\nEverything looks good.".to_string(),
                prompt_text: MODEL_TEST_PROMPT_EN.to_string(),
                resolved_model: "claude-sonnet-4-6".to_string(),
                provider_model: Some("provider-model-id".to_string()),
                duration_ms: 128,
                request_id: Some("req_test_123".to_string()),
                stop_reason: Some("end_turn".to_string()),
                status_code: None,
                error_message: None,
                request_method: exchange.request_method,
                request_url: exchange.request_url,
                request_headers: exchange.request_headers,
                request_body: exchange.request_body,
                response_headers: exchange.response_headers,
                raw_response: Some("{\"model\":\"provider-model-id\"}".to_string()),
            }
        );
    }

    #[test]
    fn parse_model_test_response_rejects_responses_without_text_blocks() {
        let error = parse_model_test_response(
            &serde_json::json!({
                "model": "provider-model-id",
                "content": [
                    { "type": "tool_use", "name": "noop" }
                ]
            }),
            MODEL_TEST_PROMPT_EN.to_string(),
            "claude-sonnet-4-6".to_string(),
            64,
            None,
            "{\"content\":[]}".to_string(),
            ModelTestHttpExchange {
                request_method: "POST".to_string(),
                request_url: "https://api.anthropic.com/v1/messages".to_string(),
                request_headers: Default::default(),
                request_body: "{}".to_string(),
                response_headers: Default::default(),
            },
        )
        .unwrap_err();

        assert_eq!(error, "响应格式不支持：未找到可展示的文本内容");
    }

    #[test]
    fn parse_model_test_error_prefers_upstream_error_message() {
        let exchange = ModelTestHttpExchange {
            request_method: "POST".to_string(),
            request_url: "https://api.anthropic.com/v1/messages".to_string(),
            request_headers: [
                ("x-api-key".to_string(), "token".to_string()),
                ("anthropic-version".to_string(), "2023-06-01".to_string()),
                ("content-type".to_string(), "application/json".to_string()),
            ]
            .into_iter()
            .collect(),
            request_body: r#"{"model":"claude-sonnet-4-6"}"#.to_string(),
            response_headers: [("content-type".to_string(), "application/json".to_string())]
                .into_iter()
                .collect(),
        };
        let result = build_model_test_failure_result(
            401,
            r#"{"error":{"type":"authentication_error","message":"invalid api key"}}"#,
            ModelTestResultContext {
                prompt_text: MODEL_TEST_PROMPT_ZH.to_string(),
                resolved_model: "claude-sonnet-4-6".to_string(),
                duration_ms: 88,
                request_id: Some("req_test_401".to_string()),
                exchange: exchange.clone(),
            },
        );

        assert_eq!(
            result,
            ModelTestResult {
                ok: false,
                response_text: String::new(),
                prompt_text: MODEL_TEST_PROMPT_ZH.to_string(),
                resolved_model: "claude-sonnet-4-6".to_string(),
                provider_model: None,
                duration_ms: 88,
                request_id: Some("req_test_401".to_string()),
                stop_reason: None,
                status_code: Some(401),
                error_message: Some("模型测试失败（HTTP 401）：invalid api key".to_string()),
                request_method: exchange.request_method,
                request_url: exchange.request_url,
                request_headers: exchange.request_headers,
                request_body: exchange.request_body,
                response_headers: exchange.response_headers,
                raw_response: Some(
                    r#"{"error":{"type":"authentication_error","message":"invalid api key"}}"#
                        .to_string()
                ),
            }
        );
    }

    #[test]
    fn raw_model_test_response_redacts_secret_like_values() {
        let raw = raw_response_from_body(
            r#"{"headers":{"x-api-key":"token","authorization":"Bearer secret-token"},"usage":{"input_tokens":12,"output_tokens":3}}"#,
        )
        .expect("非空响应应返回原始内容");

        assert!(raw.contains(r#""x-api-key":"<redacted>""#));
        assert!(raw.contains(r#""authorization":"<redacted>""#));
        assert!(raw.contains(r#""input_tokens":12"#));
        assert!(raw.contains(r#""output_tokens":3"#));
        assert!(!raw.contains("secret-token"));
        assert!(!raw.contains(r#""x-api-key":"token""#));
    }

    #[test]
    fn test_profile_model_returns_request_exchange_when_sending_fails() {
        let config_guard = crate::utils::lock_config().unwrap();
        let root = temp_root("model-test-send-error");
        set_test_env(&root);

        let result = tauri::async_runtime::block_on(test_profile_model(ModelTestInput {
            id: Some("profile-a".to_string()),
            name: "Profile A".to_string(),
            description: String::new(),
            preset_id: None,
            settings: serde_json::json!({
                "model": "claude-sonnet-4-6",
                "env": {
                    "ANTHROPIC_AUTH_TOKEN": "token",
                    "ANTHROPIC_BASE_URL": "http://[::1"
                }
            }),
            prompt_text: Some("请确认测试成功。".to_string()),
        }));

        clear_test_env();
        drop(config_guard);

        let result = result.expect("发送失败也应返回模型测试结果");

        assert!(!result.ok);
        assert_eq!(result.resolved_model, "claude-sonnet-4-6");
        assert_eq!(result.prompt_text, "请确认测试成功。");
        assert_eq!(result.request_method, "POST");
        assert_eq!(result.request_url, "http://[::1/v1/messages");
        assert_eq!(result.request_headers["x-api-key"], "<redacted>");
        assert!(result
            .request_body
            .contains("\"model\": \"claude-sonnet-4-6\""));
        assert!(result
            .request_body
            .contains("\"content\": \"请确认测试成功。\""));
        assert_eq!(result.status_code, None);
        assert!(result.response_headers.is_empty());
        assert_eq!(result.raw_response, None);
        let error_message = result.error_message.unwrap_or_default();
        assert!(error_message.contains("模型测试请求失败："));
        assert!(error_message.contains("详细原因："));
    }

    fn shared_sync_keys() -> (Vec<String>, Vec<String>) {
        let top = vec![
            "alwaysThinkingEnabled".to_string(),
            "showThinkingSummaries".to_string(),
            "enabledPlugins".to_string(),
            "extraKnownMarketplaces".to_string(),
        ];
        let env = vec![
            "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC".to_string(),
            "DISABLE_AUTOUPDATER".to_string(),
        ];
        (top, env)
    }

    #[test]
    fn sync_shared_profile_settings_fully_aligns_targets_to_source() {
        let mut registry = ConfigRegistry::default();
        registry.profiles.push(sample_profile(
            "src",
            None,
            serde_json::json!({
                "alwaysThinkingEnabled": true,
                "enabledPlugins": { "a@m": true },
                "extraKnownMarketplaces": { "m": { "source": { "source": "github", "repo": "owner/repo" } } },
                "env": {
                    "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC": "1",
                    "ANTHROPIC_AUTH_TOKEN": "src-token"
                }
            }),
        ));
        registry.profiles.push(sample_profile(
            "dst",
            None,
            serde_json::json!({
                // 目标独有的常用选项 / 插件,完全对齐后应被移除或替换
                "showThinkingSummaries": true,
                "enabledPlugins": { "b@m": true },
                "env": {
                    "ANTHROPIC_AUTH_TOKEN": "dst-token",
                    "DISABLE_AUTOUPDATER": "1"
                }
            }),
        ));

        let (top, env) = shared_sync_keys();
        let changed =
            sync_shared_profile_settings_in_registry(&mut registry, "src", &top, &env).unwrap();
        assert_eq!(changed, vec!["dst".to_string()]);

        let dst = &registry
            .profiles
            .iter()
            .find(|profile| profile.id == "dst")
            .unwrap()
            .settings;

        // 顶层完全对齐:源有的写入,源无的(showThinkingSummaries)移除
        assert_eq!(dst["alwaysThinkingEnabled"], Value::Bool(true));
        assert!(dst.get("showThinkingSummaries").is_none());
        // 插件 / 市场以源整体替换
        assert_eq!(dst["enabledPlugins"], serde_json::json!({ "a@m": true }));
        assert_eq!(
            dst["extraKnownMarketplaces"],
            serde_json::json!({ "m": { "source": { "source": "github", "repo": "owner/repo" } } })
        );
        // env 部分键对齐:源有则写入,源无(DISABLE_AUTOUPDATER)则移除,保留目标其它 env
        assert_eq!(
            dst["env"]["CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC"],
            Value::String("1".to_string())
        );
        assert!(dst["env"].get("DISABLE_AUTOUPDATER").is_none());
        assert_eq!(
            dst["env"]["ANTHROPIC_AUTH_TOKEN"],
            Value::String("dst-token".to_string())
        );

        // 源自身不被修改
        let src = &registry
            .profiles
            .iter()
            .find(|profile| profile.id == "src")
            .unwrap()
            .settings;
        assert_eq!(src["enabledPlugins"], serde_json::json!({ "a@m": true }));
    }

    #[test]
    fn sync_shared_profile_settings_skips_unchanged_targets() {
        let mut registry = ConfigRegistry::default();
        let shared = serde_json::json!({
            "alwaysThinkingEnabled": true,
            "enabledPlugins": { "a@m": true }
        });
        registry
            .profiles
            .push(sample_profile("src", None, shared.clone()));
        // 目标已与源一致(顶层共享字段相同),应被跳过
        registry.profiles.push(sample_profile("dst", None, shared));

        let (top, env) = shared_sync_keys();
        let changed =
            sync_shared_profile_settings_in_registry(&mut registry, "src", &top, &env).unwrap();
        assert!(changed.is_empty());
    }

    #[test]
    fn sync_shared_profile_settings_removes_emptied_env_object() {
        let mut registry = ConfigRegistry::default();
        // 源没有任何共享 env 键
        registry
            .profiles
            .push(sample_profile("src", None, serde_json::json!({})));
        // 目标 env 仅含一个共享键,对齐后被清空,应移除整个 env 键
        registry.profiles.push(sample_profile(
            "dst",
            None,
            serde_json::json!({
                "env": { "DISABLE_AUTOUPDATER": "1" }
            }),
        ));

        let (top, env) = shared_sync_keys();
        let changed =
            sync_shared_profile_settings_in_registry(&mut registry, "src", &top, &env).unwrap();
        assert_eq!(changed, vec!["dst".to_string()]);

        let dst = &registry
            .profiles
            .iter()
            .find(|profile| profile.id == "dst")
            .unwrap()
            .settings;
        assert!(dst.get("env").is_none());
    }

    #[test]
    fn sync_shared_profile_settings_errors_when_source_missing() {
        let mut registry = ConfigRegistry::default();
        registry
            .profiles
            .push(sample_profile("dst", None, serde_json::json!({})));
        let (top, env) = shared_sync_keys();
        assert!(
            sync_shared_profile_settings_in_registry(&mut registry, "missing", &top, &env).is_err()
        );
    }
}
