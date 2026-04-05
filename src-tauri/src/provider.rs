use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use uuid::Uuid;

/// Provider 下的单个模型
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderModel {
    pub id: String,
    pub name: String,
    pub category: String,
}

/// API 供应商
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Provider {
    pub id: String,
    pub name: String,
    pub slug: String,
    pub api_url: String,
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

    // slug 唯一性检查（排除自身），先于可变借用
    let slug_conflict = state.providers.iter().any(|p| p.slug == data.slug && p.id != id);
    if slug_conflict {
        return Err(format!("Provider slug '{}' 已被其他 Provider 使用", data.slug));
    }

    let provider = state.providers.iter_mut()
        .find(|p| p.id == id)
        .ok_or_else(|| format!("Provider '{}' 不存在", id))?;

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
