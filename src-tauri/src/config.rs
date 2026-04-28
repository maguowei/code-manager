use crate::tray::rebuild_tray_menu;
use fancy_regex::Regex as FancyRegex;
use once_cell::sync::Lazy;
use regex::Regex;
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::collections::{BTreeMap, HashMap, HashSet};
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
const SYSTEM_LOCALE_ENV_KEYS: [&str; 4] = ["LC_ALL", "LC_MESSAGES", "LANGUAGE", "LANG"];

static CLAUDE_SETTINGS_SCHEMA: Lazy<Value> = Lazy::new(|| {
    serde_json::from_str(include_str!(
        "../../src/schemas/claude-settings.schema.json"
    ))
    .expect("Claude settings schema 格式错误")
});

static SCHEMA_REGEX_CACHE: Lazy<Mutex<HashMap<String, Arc<CompiledSchemaRegex>>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AppPreferences {
    #[serde(default = "default_true")]
    pub show_tray_title: bool,
    #[serde(default = "default_ui_language")]
    pub ui_language: String,
    #[serde(default = "default_terminal_app")]
    pub default_terminal_app: String,
    #[serde(default)]
    pub default_editor_app: Option<String>,
}

impl Default for AppPreferences {
    fn default() -> Self {
        Self {
            show_tray_title: default_true(),
            ui_language: default_ui_language(),
            default_terminal_app: default_terminal_app(),
            default_editor_app: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum PresetSource {
    Builtin,
    Custom,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LocalizedText {
    pub zh: String,
    pub en: String,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum PresetModelCategory {
    Opus,
    Sonnet,
    Haiku,
    Other,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SettingsPresetModel {
    pub id: String,
    pub category: PresetModelCategory,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
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
    pub settings_patch: Value,
    pub source: PresetSource,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ConfigProfile {
    pub id: String,
    pub name: String,
    pub description: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub preset_id: Option<String>,
    pub settings: Value,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct BindingState {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub user_profile_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub user_last_applied_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
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

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConfigWorkspace {
    pub app: AppPreferences,
    pub builtin_presets: Vec<SettingsPreset>,
    pub custom_presets: Vec<SettingsPreset>,
    pub profiles: Vec<ConfigProfile>,
    pub bindings: BindingState,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
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

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
#[serde(deny_unknown_fields)]
pub struct AppPreferencesInput {
    pub show_tray_title: bool,
    pub ui_language: String,
    pub default_terminal_app: String,
    pub default_editor_app: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
#[serde(deny_unknown_fields)]
pub struct ProfileInput {
    pub id: Option<String>,
    pub name: String,
    pub description: String,
    pub preset_id: Option<String>,
    pub settings: Value,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
#[serde(deny_unknown_fields)]
pub struct ModelTestInput {
    pub id: Option<String>,
    pub name: String,
    pub description: String,
    pub preset_id: Option<String>,
    pub settings: Value,
    #[serde(default)]
    pub prompt_text: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
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
    pub settings_patch: Value,
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
            if !seed.base_url.trim().is_empty() {
                settings_patch.insert(
                    "env".to_string(),
                    Value::Object(
                        [(
                            "ANTHROPIC_BASE_URL".to_string(),
                            Value::String(seed.base_url.trim().to_string()),
                        )]
                        .into_iter()
                        .collect(),
                    ),
                );
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
    ConfigWorkspace {
        app: registry.app.clone(),
        builtin_presets: builtin_presets().to_vec(),
        custom_presets: registry.custom_presets,
        profiles: registry.profiles,
        bindings: registry.bindings,
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
        id: input.id.filter(|id| !id.trim().is_empty()),
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
        ui_language,
        default_terminal_app,
        default_editor_app,
    })
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
        Some(body.to_string())
    }
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
        return format!("模型测试失败（HTTP {status_code}）：{message}");
    }

    let fallback = crate::utils::truncate(body.trim(), 160);
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

fn profile_settings_path() -> Result<PathBuf, String> {
    get_user_settings_path()
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

#[tauri::command]
pub fn get_config_workspace() -> Result<ConfigWorkspace, String> {
    Ok(build_workspace(load_registry()?))
}

#[tauri::command]
pub fn upsert_profile(app_handle: AppHandle, data: ProfileInput) -> Result<ConfigProfile, String> {
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
}

#[tauri::command]
pub fn duplicate_profile(
    app_handle: AppHandle,
    id: String,
    name_suffix: String,
) -> Result<ConfigProfile, String> {
    let _lock = crate::utils::lock_config()?;
    let mut registry = load_registry()?;
    let duplicated = duplicate_profile_in_registry(&mut registry, &id, &name_suffix)?;
    save_registry(&registry)?;
    rebuild_tray_menu(&app_handle, Some(&registry));
    let _ = app_handle.emit("config-workspace-changed", ());
    Ok(duplicated)
}

#[tauri::command]
pub fn reorder_profiles(app_handle: AppHandle, ids: Vec<String>) -> Result<(), String> {
    let _lock = crate::utils::lock_config()?;
    let mut registry = load_registry()?;
    reorder_profiles_in_registry(&mut registry, &ids);
    save_registry(&registry)?;
    rebuild_tray_menu(&app_handle, Some(&registry));
    let _ = app_handle.emit("config-workspace-changed", ());
    Ok(())
}

#[tauri::command]
pub fn delete_profile(app_handle: AppHandle, id: String) -> Result<(), String> {
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
}

#[tauri::command]
pub fn apply_profile(app_handle: AppHandle, id: String) -> Result<(), String> {
    let registry = apply_profile_inner(id)?;
    rebuild_tray_menu(&app_handle, Some(&registry));
    let _ = app_handle.emit("config-workspace-changed", ());
    Ok(())
}

#[tauri::command]
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
    let endpoint = build_model_test_endpoint(&request.base_url);
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(MODEL_TEST_TIMEOUT_SECS))
        .build()
        .map_err(|error| format!("创建模型测试客户端失败：{error}"))?;
    let payload = build_model_test_payload(&request);
    let request_headers = build_model_test_request_headers(&request.auth_token);
    let request_body = serialize_model_test_request_body(&payload)?;

    let started_at = Instant::now();
    let response = client
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
        .map_err(|error| format!("模型测试请求失败：{error}"))?;
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
    let body = response
        .text()
        .await
        .map_err(|error| format!("读取模型测试响应失败：{error}"))?;
    let status_code = status.as_u16();
    let resolved_model = request.resolved_model.clone();
    let prompt_text = request.prompt_text.clone();
    let raw_response = raw_response_from_body(&body);
    let exchange = ModelTestHttpExchange {
        request_method: "POST".to_string(),
        request_url: endpoint,
        request_headers,
        request_body,
        response_headers,
    };
    let context = ModelTestResultContext {
        prompt_text: prompt_text.clone(),
        resolved_model: resolved_model.clone(),
        duration_ms,
        request_id: request_id.clone(),
        exchange: exchange.clone(),
    };

    if !status.is_success() {
        return Ok(build_model_test_failure_result(status_code, &body, context));
    }

    let parsed = match serde_json::from_str::<Value>(&body) {
        Ok(parsed) => parsed,
        Err(error) => {
            return Ok(build_model_test_error_result(
                context,
                Some(status_code),
                format!("解析模型测试响应失败：{error}"),
                raw_response,
            ))
        }
    };
    match parse_model_test_response(
        &parsed,
        request.prompt_text,
        request.resolved_model,
        duration_ms,
        request_id.clone(),
        body.clone(),
        exchange.clone(),
    ) {
        Ok(result) => Ok(result),
        Err(error_message) => Ok(build_model_test_error_result(
            context,
            Some(status_code),
            error_message,
            raw_response,
        )),
    }
}

#[tauri::command]
pub fn upsert_preset(app_handle: AppHandle, data: PresetInput) -> Result<SettingsPreset, String> {
    let _lock = crate::utils::lock_config()?;
    let input = normalize_preset_input(data)?;
    validate_settings_document(&input.settings_patch)?;

    let mut registry = load_registry()?;
    if let Some(base_preset_id) = input.base_preset_id.as_deref() {
        if !preset_exists(&registry, base_preset_id) {
            return Err(format!("未找到 base preset '{}'", base_preset_id));
        }
    }

    let preset_id = input
        .id
        .clone()
        .unwrap_or_else(|| format!("custom:{}", Uuid::new_v4()));
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
}

#[tauri::command]
pub fn delete_preset(app_handle: AppHandle, id: String) -> Result<(), String> {
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
}

#[tauri::command]
pub fn set_app_preferences(
    app_handle: AppHandle,
    data: AppPreferencesInput,
) -> Result<AppPreferences, String> {
    let _lock = crate::utils::lock_config()?;
    let preferences = normalize_app_preferences(data)?;
    let mut registry = load_registry()?;
    registry.app = preferences.clone();
    save_registry(&registry)?;
    rebuild_tray_menu(&app_handle, Some(&registry));
    let _ = app_handle.emit("config-workspace-changed", ());
    let _ = app_handle.emit("project-launcher-settings-changed", ());
    Ok(preferences)
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

    #[test]
    fn reorder_profiles_preserves_requested_order_and_appends_missing_items() {
        let mut registry = ConfigRegistry::default();
        registry.profiles = vec![
            sample_profile("profile-a", None, serde_json::json!({})),
            sample_profile("profile-b", None, serde_json::json!({})),
            sample_profile("profile-c", None, serde_json::json!({})),
        ];

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
        let mut registry = ConfigRegistry::default();
        registry.profiles = vec![
            sample_profile("profile-a", None, serde_json::json!({ "model": "a" })),
            sample_profile("profile-b", None, serde_json::json!({ "model": "b" })),
            sample_profile("profile-c", None, serde_json::json!({ "model": "c" })),
        ];

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
                ui_language: "zh".to_string(),
                default_terminal_app: "terminal".to_string(),
                default_editor_app: Some("cursor".to_string()),
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
}
