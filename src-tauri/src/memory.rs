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


/// 获取记忆状态存储路径
fn get_memory_config_path() -> PathBuf {
    crate::utils::get_app_data_dir().join("memories.json")
}

/// 获取 CLAUDE.md 路径
fn get_claude_md_path() -> PathBuf {
    crate::utils::get_home_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
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
    let path = get_memory_config_path();
    let content = serde_json::to_string_pretty(state).map_err(|e| e.to_string())?;
    crate::utils::ensure_dir_and_write(&path, &content)
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
pub fn add_memory(name: String, content: String) -> Result<Memory, String> {
    // 加锁保护并发写入
    let _lock = crate::utils::MEMORY_LOCK
        .lock()
        .map_err(|e| format!("获取锁失败: {}", e))?;

    let mut state = load_memory_state();
    let now = crate::utils::current_timestamp();

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
}

#[tauri::command]
pub fn update_memory(id: String, name: String, content: String) -> Result<Memory, String> {
    // 加锁保护并发写入
    let _lock = crate::utils::MEMORY_LOCK
        .lock()
        .map_err(|e| format!("获取锁失败: {}", e))?;

    let mut state = load_memory_state();

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
}

#[tauri::command]
pub fn delete_memory(id: String) -> Result<(), String> {
    // 加锁保护并发写入
    let _lock = crate::utils::MEMORY_LOCK
        .lock()
        .map_err(|e| format!("获取锁失败: {}", e))?;

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
}

#[tauri::command]
pub fn toggle_memory(id: String) -> Result<Memory, String> {
    // 加锁保护并发写入
    let _lock = crate::utils::MEMORY_LOCK
        .lock()
        .map_err(|e| format!("获取锁失败: {}", e))?;

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
}
