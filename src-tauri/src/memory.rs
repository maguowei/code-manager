use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};
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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MemoryState {
    pub memories: Vec<Memory>,
}

impl Default for MemoryState {
    fn default() -> Self {
        Self {
            memories: Vec::new(),
        }
    }
}

/// 获取记忆状态存储路径
fn get_memory_config_path() -> PathBuf {
    let home = dirs::home_dir().expect("Could not find home directory");
    home.join(".config").join("ai-manager").join("memories.json")
}

/// 获取 CLAUDE.md 路径
fn get_claude_md_path() -> PathBuf {
    let home = dirs::home_dir().expect("Could not find home directory");
    home.join(".claude").join("CLAUDE.md")
}

/// 获取当前时间戳
fn current_timestamp() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("Time went backwards")
        .as_secs()
}

/// 加载记忆状态
pub fn load_memory_state() -> MemoryState {
    let path = get_memory_config_path();
    if path.exists() {
        match fs::read_to_string(&path) {
            Ok(content) => serde_json::from_str(&content).unwrap_or_default(),
            Err(_) => MemoryState::default(),
        }
    } else {
        MemoryState::default()
    }
}

/// 保存记忆状态
pub fn save_memory_state(state: &MemoryState) -> Result<(), String> {
    let path = get_memory_config_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let content = serde_json::to_string_pretty(state).map_err(|e| e.to_string())?;
    fs::write(&path, content).map_err(|e| e.to_string())?;
    Ok(())
}

/// 将所有活跃记忆合并写入 ~/.claude/CLAUDE.md
pub fn apply_memories(state: &MemoryState) -> Result<(), String> {
    let active: Vec<&Memory> = state.memories.iter().filter(|m| m.is_active).collect();

    let content = if active.is_empty() {
        String::new()
    } else {
        active
            .iter()
            .map(|m| format!("# {}\n\n{}", m.name, m.content))
            .collect::<Vec<_>>()
            .join("\n\n")
    };

    let path = get_claude_md_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(&path, content).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn get_memories() -> Result<MemoryState, String> {
    Ok(load_memory_state())
}

#[tauri::command]
pub fn add_memory(name: String, content: String) -> Result<Memory, String> {
    let mut state = load_memory_state();
    let now = current_timestamp();

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
    let mut state = load_memory_state();

    let memory = state
        .memories
        .iter_mut()
        .find(|m| m.id == id)
        .ok_or("Memory not found")?;

    memory.name = name;
    memory.content = content;
    memory.updated_at = current_timestamp();

    let updated = memory.clone();
    let need_apply = updated.is_active;

    save_memory_state(&state)?;

    // 若此条目活跃则重新 apply
    if need_apply {
        apply_memories(&state)?;
    }

    Ok(updated)
}

#[tauri::command]
pub fn delete_memory(id: String) -> Result<(), String> {
    let mut state = load_memory_state();

    // 检查被删除的记忆是否活跃
    let was_active = state.memories.iter().any(|m| m.id == id && m.is_active);

    state.memories.retain(|m| m.id != id);
    save_memory_state(&state)?;

    // 若删除的记忆是活跃的，重新 apply
    if was_active {
        apply_memories(&state)?;
    }

    Ok(())
}

#[tauri::command]
pub fn toggle_memory(id: String) -> Result<Memory, String> {
    let mut state = load_memory_state();

    let memory = state
        .memories
        .iter_mut()
        .find(|m| m.id == id)
        .ok_or("Memory not found")?;

    memory.is_active = !memory.is_active;
    memory.updated_at = current_timestamp();

    let toggled = memory.clone();

    save_memory_state(&state)?;
    apply_memories(&state)?;

    Ok(toggled)
}
