use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Memory {
    pub id: String,
    pub name: String,
    pub content: String,
    pub is_active: bool,
    pub created_at: u64,
    pub updated_at: u64,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MemoryState {
    pub memories: Vec<Memory>,
}

/// 新增/更新记忆的数据传输对象
#[derive(Debug, Clone, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
#[serde(deny_unknown_fields)]
pub struct MemoryData {
    pub id: Option<String>,
    #[schemars(length(min = 1))]
    pub name: String,
    pub content: String,
}

/// 获取记忆状态存储路径
fn get_memory_config_path() -> PathBuf {
    crate::utils::get_app_data_dir().join("memories.json")
}

/// 获取 CLAUDE.md 路径
fn get_claude_md_path() -> PathBuf {
    crate::utils::home_dir_or_fallback()
        .join(".claude")
        .join("CLAUDE.md")
}

/// 从文件加载记忆状态，失败时返回默认值
pub fn load_memory_state() -> MemoryState {
    let path = get_memory_config_path();
    crate::utils::read_json_file(&path)
}

/// 将记忆状态序列化并写入文件
pub fn save_memory_state(state: &MemoryState) -> Result<(), String> {
    crate::utils::save_json_file(&get_memory_config_path(), state)
}

/// 将所有活跃记忆合并写入 ~/.claude/CLAUDE.md
pub fn apply_memories(state: &MemoryState) -> Result<(), String> {
    let active: Vec<&Memory> = state.memories.iter().filter(|m| m.is_active).collect();

    let content = if active.is_empty() {
        String::new()
    } else {
        active
            .iter()
            .map(|m| m.content.as_str())
            .collect::<Vec<_>>()
            .join("\n\n---\n\n")
    };

    let path = get_claude_md_path();
    crate::utils::ensure_dir_and_write(&path, &content)
}

#[tauri::command]
pub fn get_memories() -> Result<MemoryState, String> {
    Ok(load_memory_state())
}

#[tauri::command]
pub fn add_memory(data: MemoryData) -> Result<Memory, String> {
    let result = (|| {
        if data.id.as_deref().filter(|id| !id.is_empty()).is_some() {
            return Err("新增记忆不允许指定 id".to_string());
        }

        // 加锁保护并发写入
        let _lock = crate::utils::lock_memory()?;

        let mut state = load_memory_state();
        let now = crate::utils::current_timestamp();
        let MemoryData { name, content, .. } = data;

        let memory = Memory {
            id: Uuid::new_v4().to_string(),
            name,
            content,
            is_active: false,
            created_at: now,
            updated_at: now,
        };

        state.memories.push(memory.clone());
        save_memory_state(&state)?;

        Ok(memory)
    })();
    crate::logging::log_command_result("memory.add", &result, |memory| {
        format!("memory_id={}", memory.id)
    });
    result
}

#[tauri::command]
pub fn update_memory(id: String, data: MemoryData) -> Result<Memory, String> {
    let result = (|| {
        ensure_matching_memory_id(&id, &data)?;

        // 加锁保护并发写入
        let _lock = crate::utils::lock_memory()?;

        let mut state = load_memory_state();
        let MemoryData { name, content, .. } = data;

        let memory = state
            .memories
            .iter_mut()
            .find(|m| m.id == id)
            .ok_or("未找到指定记忆")?;

        memory.name = name;
        memory.content = content;
        memory.updated_at = crate::utils::current_timestamp();

        let updated = memory.clone();
        let need_apply = updated.is_active;

        save_memory_state(&state)?;

        // 若此记忆当前处于活跃状态，重新 apply 以更新 CLAUDE.md
        if need_apply {
            apply_memories(&state)?;
        }

        Ok(updated)
    })();
    crate::logging::log_command_result("memory.update", &result, |memory| {
        format!("memory_id={} active={}", memory.id, memory.is_active)
    });
    result
}

#[tauri::command]
pub fn delete_memory(id: String) -> Result<(), String> {
    let result = (|| {
        // 加锁保护并发写入
        let _lock = crate::utils::lock_memory()?;

        let mut state = load_memory_state();

        // 检查被删除的记忆是否活跃
        let was_active = state.memories.iter().any(|m| m.id == id && m.is_active);

        state.memories.retain(|m| m.id != id);
        save_memory_state(&state)?;

        // 若删除的记忆是活跃的，重新 apply 以更新 CLAUDE.md
        if was_active {
            apply_memories(&state)?;
        }

        Ok(())
    })();
    crate::logging::log_command_result("memory.delete", &result, |_| format!("memory_id={id}"));
    result
}

#[tauri::command]
pub fn toggle_memory(id: String) -> Result<Memory, String> {
    let result = (|| {
        // 加锁保护并发写入
        let _lock = crate::utils::lock_memory()?;

        let mut state = load_memory_state();

        let memory = state
            .memories
            .iter_mut()
            .find(|m| m.id == id)
            .ok_or("未找到指定记忆")?;

        memory.is_active = !memory.is_active;
        memory.updated_at = crate::utils::current_timestamp();

        let toggled = memory.clone();

        save_memory_state(&state)?;
        apply_memories(&state)?;

        Ok(toggled)
    })();
    crate::logging::log_command_result("memory.toggle", &result, |memory| {
        format!("memory_id={} active={}", memory.id, memory.is_active)
    });
    result
}

fn ensure_matching_memory_id(expected_id: &str, data: &MemoryData) -> Result<(), String> {
    let payload_id = data.id.as_deref().filter(|id| !id.is_empty());
    if let Some(payload_id) = payload_id {
        if payload_id != expected_id {
            return Err("记忆 id 与请求路径不一致".to_string());
        }
    }
    Ok(())
}

#[cfg(test)]
mod schema_tests {
    use super::*;
    use schemars::schema_for;
    use serde_json::json;

    fn load_memory_json_schema() -> serde_json::Value {
        let json_schema_str = include_str!("../../src/schemas/memory.schema.json");
        serde_json::from_str(json_schema_str).expect("Memory JSON Schema 格式不合法")
    }

    #[test]
    fn memory_data_has_all_json_schema_fields() {
        let rust_schema = schema_for!(MemoryData);
        let rust_props = rust_schema
            .schema
            .object
            .as_ref()
            .expect("MemoryData 应为 object 类型")
            .properties
            .clone();
        let json_schema = load_memory_json_schema();

        if let Some(props) = json_schema["properties"].as_object() {
            for field_name in props.keys() {
                assert!(
                    rust_props.contains_key(field_name.as_str()),
                    "Memory JSON Schema 字段 '{}' 在 Rust MemoryData 中未找到",
                    field_name
                );
            }
        }
    }

    #[test]
    fn memory_json_schema_required_fields_match_rust_schema() {
        let rust_schema = schema_for!(MemoryData);
        let rust_required = rust_schema
            .schema
            .object
            .as_ref()
            .expect("MemoryData 应为 object 类型")
            .required
            .clone();
        let json_schema = load_memory_json_schema();

        if let Some(required) = json_schema["required"].as_array() {
            for field_val in required {
                let field_name = field_val.as_str().expect("required 数组元素应为字符串");
                assert!(
                    rust_required.contains(field_name),
                    "Memory JSON Schema required 字段 '{}' 在 Rust MemoryData 中未标记为必填",
                    field_name
                );
            }
        }
    }

    #[test]
    fn memory_json_schema_uses_read_only_id_and_required_name() {
        let json_schema = load_memory_json_schema();

        assert_eq!(json_schema["properties"]["id"]["readOnly"], json!(true));
        assert_eq!(json_schema["properties"]["name"]["minLength"], json!(1));
    }

    #[test]
    fn update_memory_rejects_mismatched_payload_id() {
        let result = update_memory(
            "memory-a".to_string(),
            MemoryData {
                id: Some("memory-b".to_string()),
                name: "name".to_string(),
                content: "content".to_string(),
            },
        );

        assert_eq!(result.unwrap_err(), "记忆 id 与请求路径不一致");
    }
}
