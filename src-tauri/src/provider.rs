use once_cell::sync::Lazy;
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
    pub base_url: String,
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
    pub base_url: String,
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

/// 将 Provider 恢复到默认排序：内置按资源顺序，自定义按创建时间升序。
fn reset_provider_order_inner(providers: Vec<Provider>) -> Vec<Provider> {
    use std::collections::HashMap;

    let builtin_order: HashMap<String, usize> = builtin_providers()
        .into_iter()
        .enumerate()
        .map(|(index, provider)| (provider.id, index))
        .collect();

    let mut builtin = Vec::new();
    let mut custom = Vec::new();

    for provider in providers {
        if provider.is_builtin {
            builtin.push(provider);
        } else {
            custom.push(provider);
        }
    }

    builtin.sort_by(|a, b| {
        let a_index = builtin_order.get(&a.id).copied().unwrap_or(usize::MAX);
        let b_index = builtin_order.get(&b.id).copied().unwrap_or(usize::MAX);
        a_index.cmp(&b_index).then_with(|| a.id.cmp(&b.id))
    });

    custom.sort_by(|a, b| {
        a.created_at
            .cmp(&b.created_at)
            .then_with(|| a.id.cmp(&b.id))
    });

    builtin.extend(custom);
    builtin
}

/// 内置 Provider 定义（JSON 反序列化用，不含运行时字段）
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct BuiltinProviderDef {
    id: String,
    name: String,
    slug: String,
    base_url: String,
    doc_url: Option<String>,
    models: Vec<ProviderModel>,
}

/// 内置 Provider 列表（静态缓存，只解析一次）
static BUILTIN_PROVIDERS: Lazy<Vec<Provider>> = Lazy::new(|| {
    let defs: Vec<BuiltinProviderDef> =
        serde_json::from_str(include_str!("../resources/builtin-providers.json"))
            .expect("内置 Provider JSON 格式错误");

    let now = crate::utils::current_timestamp();
    defs.into_iter()
        .map(|d| Provider {
            id: d.id,
            name: d.name,
            slug: d.slug,
            base_url: d.base_url,
            doc_url: d.doc_url,
            is_builtin: true,
            models: d.models,
            created_at: now,
            updated_at: now,
        })
        .collect()
});

/// 获取内置 Provider 列表的克隆
fn builtin_providers() -> Vec<Provider> {
    BUILTIN_PROVIDERS.clone()
}

/// 根据 ID 读取单个 Provider（先搜索自定义，再搜索内置，不加锁，供其他模块调用）
pub fn get_provider_by_id(id: &str) -> Option<Provider> {
    let state = load_state();
    state
        .providers
        .into_iter()
        .find(|p| p.id == id)
        .or_else(|| BUILTIN_PROVIDERS.iter().find(|p| p.id == id).cloned())
}

/// 获取所有 Provider；首次调用时自动初始化内置 Provider
#[tauri::command]
pub fn get_providers() -> Result<Vec<Provider>, String> {
    let _lock = crate::utils::lock_provider()?;
    let path = get_provider_path();
    if !path.exists() {
        let state = ProviderState {
            providers: builtin_providers(),
        };
        save_state(&state)?;
        return Ok(state.providers);
    }

    let mut state = load_state();

    // 补充缺失的内置 Provider（版本升级场景）
    let builtins = builtin_providers();
    let existing_slugs: std::collections::HashSet<String> = state
        .providers
        .iter()
        .filter(|p| p.is_builtin)
        .map(|p| p.slug.clone())
        .collect();

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
        base_url: data.base_url,
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
    let slug_conflict = state
        .providers
        .iter()
        .any(|p| p.slug == data.slug && p.id != id);
    if slug_conflict {
        return Err(format!(
            "Provider slug '{}' 已被其他 Provider 使用",
            data.slug
        ));
    }

    let provider = state
        .providers
        .iter_mut()
        .find(|p| p.id == id)
        .ok_or_else(|| format!("Provider '{}' 不存在", id))?;

    provider.name = data.name;
    provider.slug = data.slug;
    provider.base_url = data.base_url;
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

    let provider = state
        .providers
        .iter()
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

    let provider = state
        .providers
        .iter_mut()
        .find(|p| p.id == id)
        .ok_or_else(|| format!("Provider '{}' 不存在", id))?;

    if !provider.is_builtin {
        return Err("只有内置 Provider 支持重置".to_string());
    }

    let builtins = builtin_providers();
    let default = builtins
        .into_iter()
        .find(|p| p.id == id)
        .ok_or_else(|| format!("未找到内置 Provider 默认值 '{}'", id))?;

    provider.name = default.name;
    provider.slug = default.slug;
    provider.base_url = default.base_url;
    provider.doc_url = default.doc_url;
    provider.models = default.models;
    provider.updated_at = crate::utils::current_timestamp();

    let reset = provider.clone();
    save_state(&state)?;
    Ok(reset)
}

/// 重新排列 Provider 顺序（按传入的 id 列表顺序保存）
#[tauri::command]
pub fn reorder_providers(ids: Vec<String>) -> Result<(), String> {
    let _lock = crate::utils::lock_provider()?;
    let mut state = load_state();

    use std::collections::HashMap;
    let map: HashMap<String, Provider> = state
        .providers
        .iter()
        .map(|p| (p.id.clone(), p.clone()))
        .collect();

    let mut reordered: Vec<Provider> = ids.iter().filter_map(|id| map.get(id).cloned()).collect();

    // 保留未在 ids 中出现的 Provider（防御性，防止数据丢失）
    for p in &state.providers {
        if !ids.contains(&p.id) {
            reordered.push(p.clone());
        }
    }

    state.providers = reordered;
    save_state(&state)?;
    Ok(())
}

/// 恢复 Provider 默认排序：内置按资源顺序，自定义追加到末尾。
#[tauri::command]
pub fn reset_provider_order() -> Result<Vec<Provider>, String> {
    let _lock = crate::utils::lock_provider()?;
    let mut state = load_state();

    state.providers = reset_provider_order_inner(state.providers);
    save_state(&state)?;

    Ok(state.providers.clone())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn test_provider(
        id: &str,
        slug: &str,
        is_builtin: bool,
        created_at: u64,
        name: &str,
        base_url: &str,
    ) -> Provider {
        Provider {
            id: id.to_string(),
            name: name.to_string(),
            slug: slug.to_string(),
            base_url: base_url.to_string(),
            doc_url: None,
            is_builtin,
            models: vec![],
            created_at,
            updated_at: created_at,
        }
    }

    #[test]
    fn provider_deserializes_base_url_field() {
        let provider: Provider = serde_json::from_value(json!({
            "id": "provider-1",
            "name": "Example",
            "slug": "example",
            "baseUrl": "https://example.com/anthropic",
            "isBuiltin": false,
            "models": [],
            "createdAt": 1,
            "updatedAt": 1
        }))
        .expect("Provider 应支持 baseUrl 字段");

        let serialized = serde_json::to_value(provider).expect("Provider 应可序列化");
        assert_eq!(
            serialized["baseUrl"],
            json!("https://example.com/anthropic")
        );
    }

    #[test]
    fn provider_rejects_legacy_api_url_field() {
        let result = serde_json::from_value::<Provider>(json!({
            "id": "provider-1",
            "name": "Example",
            "slug": "example",
            "apiUrl": "https://example.com/anthropic",
            "isBuiltin": false,
            "models": [],
            "createdAt": 1,
            "updatedAt": 1
        }));

        assert!(result.is_err(), "旧的 apiUrl 字段不应继续被 Provider 接受");
    }

    #[test]
    fn builtin_providers_include_modelscope_defaults() {
        let provider = builtin_providers()
            .into_iter()
            .find(|provider| provider.slug == "modelscope")
            .expect("内置 Provider 列表应包含 ModelScope");

        assert_eq!(provider.name, "ModelScope");
        assert_eq!(provider.base_url, "https://api-inference.modelscope.cn");
        assert_eq!(
            provider.doc_url.as_deref(),
            Some("https://modelscope.cn/docs/model-service/API-Inference/intro")
        );
    }

    #[test]
    fn reset_provider_order_restores_builtin_order_and_appends_custom_providers() {
        let providers = vec![
            test_provider(
                "custom-z",
                "custom-z",
                false,
                200,
                "Custom Z",
                "https://custom-z.example.com",
            ),
            test_provider(
                "00000000-0000-0000-0000-000000000009",
                "modelscope",
                true,
                1,
                "ModelScope Override",
                "https://override.modelscope.example.com",
            ),
            test_provider(
                "custom-a",
                "custom-a",
                false,
                100,
                "Custom A",
                "https://custom-a.example.com",
            ),
            test_provider(
                "00000000-0000-0000-0000-000000000002",
                "zhipu",
                true,
                1,
                "智谱 GLM Coding Plan",
                "https://zhipu.example.com",
            ),
            test_provider(
                "custom-b",
                "custom-b",
                false,
                100,
                "Custom B",
                "https://custom-b.example.com",
            ),
            test_provider(
                "00000000-0000-0000-0000-000000000001",
                "anthropic",
                true,
                1,
                "Anthropic Override",
                "https://override.anthropic.example.com",
            ),
        ];

        let reordered = reset_provider_order_inner(providers);
        let ordered_ids: Vec<&str> = reordered
            .iter()
            .map(|provider| provider.id.as_str())
            .collect();

        assert_eq!(
            ordered_ids,
            vec![
                "00000000-0000-0000-0000-000000000001",
                "00000000-0000-0000-0000-000000000002",
                "00000000-0000-0000-0000-000000000009",
                "custom-a",
                "custom-b",
                "custom-z",
            ]
        );
    }

    #[test]
    fn reset_provider_order_keeps_existing_provider_content() {
        let overridden_builtin = test_provider(
            "00000000-0000-0000-0000-000000000001",
            "anthropic-customized",
            true,
            1,
            "Anthropic Customized",
            "https://customized.anthropic.example.com",
        );
        let custom_provider = test_provider(
            "custom-1",
            "custom-1",
            false,
            99,
            "Custom One",
            "https://custom-one.example.com",
        );

        let reordered =
            reset_provider_order_inner(vec![custom_provider.clone(), overridden_builtin.clone()]);

        assert_eq!(reordered[0].id, overridden_builtin.id);
        assert_eq!(reordered[0].slug, overridden_builtin.slug);
        assert_eq!(reordered[0].name, overridden_builtin.name);
        assert_eq!(reordered[0].base_url, overridden_builtin.base_url);
        assert_eq!(reordered[1].id, custom_provider.id);
        assert_eq!(reordered[1].slug, custom_provider.slug);
        assert_eq!(reordered[1].name, custom_provider.name);
        assert_eq!(reordered[1].base_url, custom_provider.base_url);
    }
}
