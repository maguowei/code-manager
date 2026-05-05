use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Component, Path, PathBuf};
use uuid::Uuid;

const CURRENT_MEMORY_STATE_VERSION: u32 = 2;
const UNMANAGED_IMPORT_READY: &str = "ready";
const UNMANAGED_IMPORT_PATH_CONFLICT: &str = "managedPathConflict";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub enum MemoryTargetType {
    Claude,
    Rule,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Memory {
    pub id: String,
    pub name: String,
    pub content: String,
    pub target_type: MemoryTargetType,
    pub rule_path: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub path_patterns: Vec<String>,
    pub is_active: bool,
    pub created_at: u64,
    pub updated_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MemoryState {
    #[serde(default = "current_memory_state_version")]
    pub version: u32,
    #[serde(default)]
    pub memories: Vec<Memory>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub unmanaged_memories: Vec<UnmanagedMemory>,
}

impl Default for MemoryState {
    fn default() -> Self {
        Self {
            version: CURRENT_MEMORY_STATE_VERSION,
            memories: Vec::new(),
            unmanaged_memories: Vec::new(),
        }
    }
}

fn current_memory_state_version() -> u32 {
    CURRENT_MEMORY_STATE_VERSION
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UnmanagedMemory {
    pub id: String,
    pub name: String,
    pub content: String,
    pub target_type: MemoryTargetType,
    pub rule_path: Option<String>,
    pub path_patterns: Vec<String>,
    pub source_path: String,
    pub size: u64,
    pub modified_at: u64,
    pub import_status: String,
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
    pub target_type: MemoryTargetType,
    pub rule_path: Option<String>,
    #[serde(default)]
    pub path_patterns: Vec<String>,
}

#[derive(Debug, Clone, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
#[serde(deny_unknown_fields)]
pub struct UnmanagedMemorySource {
    pub target_type: MemoryTargetType,
    pub rule_path: Option<String>,
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

/// 获取用户级 rules 目录路径
fn get_rules_dir_path() -> PathBuf {
    crate::utils::home_dir_or_fallback()
        .join(".claude")
        .join("rules")
}

/// 从文件加载记忆状态，失败时返回默认值
pub fn load_memory_state() -> MemoryState {
    let path = get_memory_config_path();
    let mut state: MemoryState = crate::utils::read_json_file(&path);
    if state.version == 0 {
        state.version = CURRENT_MEMORY_STATE_VERSION;
    }
    state.unmanaged_memories.clear();
    state
}

/// 将记忆状态序列化并写入文件
pub fn save_memory_state(state: &MemoryState) -> Result<(), String> {
    let mut persisted = state.clone();
    persisted.version = CURRENT_MEMORY_STATE_VERSION;
    persisted.unmanaged_memories.clear();
    crate::utils::save_json_file(&get_memory_config_path(), &persisted)
}

/// 将活跃记忆应用到用户级 CLAUDE.md 和 rules 目录。
pub fn apply_memories(previous: Option<&MemoryState>, state: &MemoryState) -> Result<(), String> {
    apply_claude_memory(previous, state)?;
    validate_rule_file_conflicts(previous, state)?;
    remove_stale_rule_files(previous, state)?;
    for memory in state
        .memories
        .iter()
        .filter(|memory| memory.is_active && memory.target_type == MemoryTargetType::Rule)
    {
        let rule_path = memory
            .rule_path
            .as_deref()
            .ok_or("规则记忆必须填写规则文件路径")?;
        let path = get_rule_file_path(rule_path);
        crate::utils::ensure_dir_and_write(&path, &serialize_rule_memory(memory))?;
    }

    Ok(())
}

#[tauri::command]
pub fn get_memories() -> Result<MemoryState, String> {
    memory_state_view(load_memory_state())
}

#[tauri::command]
pub fn add_memory(data: MemoryData) -> Result<MemoryState, String> {
    let result = (|| {
        if data.id.as_deref().filter(|id| !id.is_empty()).is_some() {
            return Err("新增记忆不允许指定 id".to_string());
        }
        let memory_input = normalize_memory_data(data)?;

        // 加锁保护并发写入
        let _lock = crate::utils::lock_memory()?;

        let mut state = load_memory_state();
        ensure_unique_rule_paths(&state, None, &memory_input)?;
        let now = crate::utils::current_timestamp();

        let memory = Memory {
            id: Uuid::new_v4().to_string(),
            name: memory_input.name,
            content: memory_input.content,
            target_type: memory_input.target_type,
            rule_path: memory_input.rule_path,
            path_patterns: memory_input.path_patterns,
            is_active: false,
            created_at: now,
            updated_at: now,
        };

        let previous = state.clone();
        state.memories.push(memory);
        save_and_apply_memories(&previous, &state)?;

        memory_state_view(state)
    })();
    crate::logging::log_command_result("memory.add", &result, |state| {
        format!("memory_count={}", state.memories.len())
    });
    result
}

#[tauri::command]
pub fn update_memory(id: String, data: MemoryData) -> Result<MemoryState, String> {
    let result = (|| {
        ensure_matching_memory_id(&id, &data)?;
        let memory_input = normalize_memory_data(data)?;

        // 加锁保护并发写入
        let _lock = crate::utils::lock_memory()?;

        let mut state = load_memory_state();
        ensure_unique_rule_paths(&state, Some(&id), &memory_input)?;
        let previous = state.clone();
        let now = crate::utils::current_timestamp();

        {
            let memory = state
                .memories
                .iter_mut()
                .find(|m| m.id == id)
                .ok_or("未找到指定记忆")?;

            memory.name = memory_input.name;
            memory.content = memory_input.content;
            memory.target_type = memory_input.target_type;
            memory.rule_path = memory_input.rule_path;
            memory.path_patterns = memory_input.path_patterns;
            memory.updated_at = now;
        }

        enforce_single_active_claude(&mut state, &id, now);
        save_and_apply_memories(&previous, &state)?;

        memory_state_view(state)
    })();
    crate::logging::log_command_result("memory.update", &result, |state| {
        format!("memory_id={id} memory_count={}", state.memories.len())
    });
    result
}

#[tauri::command]
pub fn delete_memory(id: String) -> Result<MemoryState, String> {
    let result = (|| {
        // 加锁保护并发写入
        let _lock = crate::utils::lock_memory()?;

        let mut state = load_memory_state();
        let previous = state.clone();

        state.memories.retain(|m| m.id != id);
        save_and_apply_memories(&previous, &state)?;

        memory_state_view(state)
    })();
    crate::logging::log_command_result("memory.delete", &result, |state| {
        format!("memory_id={id} memory_count={}", state.memories.len())
    });
    result
}

#[tauri::command]
pub fn toggle_memory(id: String) -> Result<MemoryState, String> {
    let result = (|| {
        // 加锁保护并发写入
        let _lock = crate::utils::lock_memory()?;

        let mut state = load_memory_state();
        let previous = state.clone();
        let now = crate::utils::current_timestamp();

        {
            let memory = state
                .memories
                .iter_mut()
                .find(|m| m.id == id)
                .ok_or("未找到指定记忆")?;

            memory.is_active = !memory.is_active;
            memory.updated_at = now;
        }

        enforce_single_active_claude(&mut state, &id, now);
        save_and_apply_memories(&previous, &state)?;

        memory_state_view(state)
    })();
    crate::logging::log_command_result("memory.toggle", &result, |state| {
        let active = state
            .memories
            .iter()
            .find(|memory| memory.id == id)
            .map(|memory| memory.is_active)
            .unwrap_or(false);
        format!("memory_id={id} active={active}")
    });
    result
}

#[tauri::command]
pub fn import_unmanaged_memory(source: UnmanagedMemorySource) -> Result<MemoryState, String> {
    let result = (|| {
        let imported = read_unmanaged_memory_source(&source)?;

        let _lock = crate::utils::lock_memory()?;
        let mut state = load_memory_state();
        if imported.target_type == MemoryTargetType::Rule {
            let rule_path = imported
                .rule_path
                .as_deref()
                .ok_or("规则记忆必须填写规则文件路径")?;
            if state.memories.iter().any(|memory| {
                memory.target_type == MemoryTargetType::Rule
                    && memory.rule_path.as_deref() == Some(rule_path)
            }) {
                return Err("规则文件路径已被其他记忆使用".to_string());
            }
        }

        let now = crate::utils::current_timestamp();
        let memory = Memory {
            id: Uuid::new_v4().to_string(),
            name: imported.name,
            content: imported.content,
            target_type: imported.target_type,
            rule_path: imported.rule_path,
            path_patterns: imported.path_patterns,
            is_active: true,
            created_at: now,
            updated_at: now,
        };
        let active_id = memory.id.clone();

        state.memories.push(memory);
        enforce_single_active_claude(&mut state, &active_id, now);
        save_memory_state(&state)?;

        memory_state_view(state)
    })();
    crate::logging::log_command_result("memory.import", &result, |state| {
        format!("memory_count={}", state.memories.len())
    });
    result
}

#[derive(Debug, Clone)]
struct NormalizedMemoryData {
    name: String,
    content: String,
    target_type: MemoryTargetType,
    rule_path: Option<String>,
    path_patterns: Vec<String>,
}

fn normalize_memory_data(data: MemoryData) -> Result<NormalizedMemoryData, String> {
    let name = data.name.trim().to_string();
    if name.is_empty() {
        return Err("记忆名称不能为空".to_string());
    }

    let (rule_path, path_patterns) = match data.target_type {
        MemoryTargetType::Claude => (None, Vec::new()),
        MemoryTargetType::Rule => {
            let raw_path = data
                .rule_path
                .as_deref()
                .map(str::trim)
                .filter(|path| !path.is_empty())
                .ok_or("规则记忆必须填写规则文件路径")?;
            validate_rule_path(raw_path)?;
            (
                Some(raw_path.to_string()),
                normalize_path_patterns(data.path_patterns),
            )
        }
    };

    Ok(NormalizedMemoryData {
        name,
        content: normalize_memory_body(&data.content),
        target_type: data.target_type,
        rule_path,
        path_patterns,
    })
}

fn normalize_path_patterns(patterns: Vec<String>) -> Vec<String> {
    let mut normalized = Vec::new();
    for pattern in patterns {
        let pattern = pattern.trim();
        if pattern.is_empty() || normalized.iter().any(|item| item == pattern) {
            continue;
        }
        normalized.push(pattern.to_string());
    }
    normalized
}

fn validate_rule_path(rule_path: &str) -> Result<(), String> {
    if !rule_path.ends_with(".md") {
        return Err("规则文件路径必须以 .md 结尾".to_string());
    }
    if rule_path.contains('\\') || rule_path.contains(':') {
        return Err("规则文件路径只能使用相对路径".to_string());
    }

    let path = Path::new(rule_path);
    if path.is_absolute() {
        return Err("规则文件路径只能使用相对路径".to_string());
    }

    let mut has_normal_component = false;
    for component in path.components() {
        match component {
            Component::Normal(_) => has_normal_component = true,
            Component::CurDir
            | Component::ParentDir
            | Component::RootDir
            | Component::Prefix(_) => {
                return Err("规则文件路径不能包含 . 或 ..".to_string());
            }
        }
    }

    if !has_normal_component {
        return Err("规则记忆必须填写规则文件路径".to_string());
    }

    Ok(())
}

fn ensure_unique_rule_paths(
    state: &MemoryState,
    current_id: Option<&str>,
    data: &NormalizedMemoryData,
) -> Result<(), String> {
    if data.target_type != MemoryTargetType::Rule {
        return Ok(());
    }
    let Some(rule_path) = data.rule_path.as_deref() else {
        return Ok(());
    };

    let duplicate = state.memories.iter().any(|memory| {
        current_id != Some(memory.id.as_str())
            && memory.target_type == MemoryTargetType::Rule
            && memory.rule_path.as_deref() == Some(rule_path)
    });

    if duplicate {
        return Err("规则文件路径已被其他记忆使用".to_string());
    }

    Ok(())
}

fn enforce_single_active_claude(state: &mut MemoryState, active_id: &str, now: u64) {
    let should_enforce = state.memories.iter().any(|memory| {
        memory.id == active_id && memory.is_active && memory.target_type == MemoryTargetType::Claude
    });
    if !should_enforce {
        return;
    }

    for memory in state.memories.iter_mut() {
        if memory.id != active_id
            && memory.is_active
            && memory.target_type == MemoryTargetType::Claude
        {
            memory.is_active = false;
            memory.updated_at = now;
        }
    }
}

fn get_rule_file_path(rule_path: &str) -> PathBuf {
    get_rules_dir_path().join(rule_path)
}

fn active_claude_memory(state: &MemoryState) -> Option<&Memory> {
    state
        .memories
        .iter()
        .find(|memory| memory.is_active && memory.target_type == MemoryTargetType::Claude)
}

fn apply_claude_memory(previous: Option<&MemoryState>, state: &MemoryState) -> Result<(), String> {
    let previous_active = previous.and_then(active_claude_memory);
    let Some(active) = active_claude_memory(state) else {
        if let Some(previous_memory) = previous_active {
            let path = get_claude_md_path();
            if path.exists() && claude_file_matches_memory(&path, previous_memory) {
                crate::utils::ensure_dir_and_write(&path, "")?;
            }
        }
        return Ok(());
    };

    validate_claude_file_conflict(previous, state)?;
    let path = get_claude_md_path();
    crate::utils::ensure_dir_and_write(&path, &serialize_claude_memory(active))
}

fn validate_claude_file_conflict(
    previous: Option<&MemoryState>,
    state: &MemoryState,
) -> Result<(), String> {
    let previous_active = previous.and_then(active_claude_memory);
    let Some(active) = active_claude_memory(state) else {
        return Ok(());
    };
    let path = get_claude_md_path();
    if path.exists() && !can_replace_claude_file(previous_active, &serialize_claude_memory(active))
    {
        return Err("CLAUDE.md 已存在，无法覆盖，请先导入为可管理记忆".to_string());
    }
    Ok(())
}

fn can_replace_claude_file(previous_active: Option<&Memory>, next_content: &str) -> bool {
    let path = get_claude_md_path();
    let Ok(current) = fs::read_to_string(path) else {
        return true;
    };
    if current == next_content {
        return true;
    }
    previous_active
        .map(|memory| claude_content_matches_memory(&current, memory))
        .unwrap_or(false)
}

fn serialize_claude_memory(memory: &Memory) -> String {
    compose_memory_markdown(&memory.name, &memory.content)
}

fn serialize_rule_memory(memory: &Memory) -> String {
    serialize_rule_content(&serialize_claude_memory(memory), &memory.path_patterns)
}

fn serialize_rule_content(content: &str, path_patterns: &[String]) -> String {
    if path_patterns.is_empty() {
        return content.to_string();
    }

    let mut serialized = String::from("---\npaths:\n");
    for pattern in path_patterns {
        let escaped = serde_json::to_string(pattern).unwrap_or_else(|_| format!("\"{pattern}\""));
        serialized.push_str("  - ");
        serialized.push_str(&escaped);
        serialized.push('\n');
    }
    serialized.push_str("---\n\n");
    serialized.push_str(content);
    serialized
}

fn compose_memory_markdown(name: &str, content: &str) -> String {
    let title = name.split_whitespace().collect::<Vec<_>>().join(" ");
    let body = normalize_memory_body(content);
    if body.trim().is_empty() {
        return format!("# {title}");
    }
    format!("# {title}\n\n{body}")
}

fn normalize_memory_body(content: &str) -> String {
    split_memory_title_heading(content).1
}

fn split_memory_title_heading(content: &str) -> (Option<String>, String) {
    let body = strip_leading_blank_lines(content);
    let Some((first_line, rest)) = split_first_line(body) else {
        return (None, content.to_string());
    };
    let candidate = first_line.trim_start();
    let Some(after_hash) = candidate.strip_prefix('#') else {
        return (None, content.to_string());
    };
    if after_hash.starts_with('#')
        || !after_hash
            .chars()
            .next()
            .map(char::is_whitespace)
            .unwrap_or(false)
    {
        return (None, content.to_string());
    }
    let title = after_hash.trim().trim_end_matches('#').trim().to_string();
    if title.is_empty() {
        return (None, content.to_string());
    }
    (
        Some(title),
        strip_single_leading_blank_line(rest).to_string(),
    )
}

fn split_first_line(content: &str) -> Option<(&str, &str)> {
    if content.is_empty() {
        return None;
    }
    if let Some(index) = content.find('\n') {
        return Some((
            content[..index].trim_end_matches('\r'),
            &content[index + 1..],
        ));
    }
    Some((content.trim_end_matches('\r'), ""))
}

fn strip_leading_blank_lines(content: &str) -> &str {
    let mut offset = 0;
    for line in content.split_inclusive('\n') {
        if line.trim().is_empty() {
            offset += line.len();
            continue;
        }
        break;
    }
    &content[offset..]
}

#[derive(Debug, Clone)]
struct ParsedRuleMarkdown {
    title: Option<String>,
    content: String,
    path_patterns: Vec<String>,
}

fn parse_rule_markdown(raw: &str) -> ParsedRuleMarkdown {
    let Some((frontmatter, body)) = split_frontmatter(raw) else {
        let (title, content) = split_memory_title_heading(raw);
        return ParsedRuleMarkdown {
            title,
            content,
            path_patterns: Vec::new(),
        };
    };
    let body = strip_single_leading_blank_line(body);
    let (title, content) = split_memory_title_heading(body);

    ParsedRuleMarkdown {
        title,
        content,
        path_patterns: parse_path_patterns(frontmatter),
    }
}

fn split_frontmatter(raw: &str) -> Option<(&str, &str)> {
    let start_len = if raw.starts_with("---\r\n") {
        5
    } else if raw.starts_with("---\n") {
        4
    } else {
        return None;
    };

    let mut offset = start_len;
    for line in raw[start_len..].split_inclusive('\n') {
        let line_start = offset;
        let line_end = line_start + line.len();
        if line.trim_end_matches(['\r', '\n']) == "---" {
            return Some((&raw[start_len..line_start], &raw[line_end..]));
        }
        offset = line_end;
    }

    if raw[offset..].trim_end_matches('\r') == "---" {
        return Some((&raw[start_len..offset], ""));
    }

    None
}

fn strip_single_leading_blank_line(body: &str) -> &str {
    if let Some(stripped) = body.strip_prefix("\r\n") {
        stripped
    } else if let Some(stripped) = body.strip_prefix('\n') {
        stripped
    } else {
        body
    }
}

fn parse_path_patterns(frontmatter: &str) -> Vec<String> {
    let mut patterns = Vec::new();
    let mut in_paths = false;

    for line in frontmatter.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        if trimmed == "paths:" {
            in_paths = true;
            continue;
        }
        if let Some(value) = trimmed.strip_prefix("paths:") {
            patterns.extend(parse_inline_path_patterns(value.trim()));
            in_paths = false;
            continue;
        }
        if in_paths {
            if let Some(value) = trimmed.strip_prefix("- ") {
                let value = unquote_frontmatter_value(value.trim());
                if !value.is_empty() {
                    patterns.push(value);
                }
                continue;
            }
            in_paths = false;
        }
    }

    normalize_path_patterns(patterns)
}

fn parse_inline_path_patterns(value: &str) -> Vec<String> {
    if value.is_empty() {
        return Vec::new();
    }
    if value.starts_with('[') {
        return serde_json::from_str::<Vec<String>>(value).unwrap_or_default();
    }
    vec![unquote_frontmatter_value(value)]
}

fn unquote_frontmatter_value(value: &str) -> String {
    if value.starts_with('"') && value.ends_with('"') && value.len() >= 2 {
        return serde_json::from_str::<String>(value)
            .unwrap_or_else(|_| value.trim_matches('"').to_string());
    }
    if value.starts_with('\'') && value.ends_with('\'') && value.len() >= 2 {
        return value[1..value.len() - 1].replace("''", "'");
    }
    value.to_string()
}

fn claude_file_matches_memory(path: &Path, memory: &Memory) -> bool {
    fs::read_to_string(path)
        .map(|content| claude_content_matches_memory(&content, memory))
        .unwrap_or(false)
}

fn claude_content_matches_memory(content: &str, memory: &Memory) -> bool {
    if content == serialize_claude_memory(memory) || content == memory.content {
        return true;
    }
    let (title, body) = split_memory_title_heading(content);
    body == normalize_memory_body(&memory.content)
        && title
            .as_deref()
            .map(|title| title == memory.name)
            .unwrap_or(true)
}

fn rule_file_matches_memory(path: &Path, memory: &Memory) -> bool {
    let Ok(raw) = fs::read_to_string(path) else {
        return false;
    };
    if raw == serialize_rule_memory(memory) {
        return true;
    }
    let parsed = parse_rule_markdown(&raw);
    parsed.content == normalize_memory_body(&memory.content)
        && parsed.path_patterns == memory.path_patterns
        && parsed
            .title
            .as_deref()
            .map(|title| title == memory.name)
            .unwrap_or(true)
}

fn save_and_apply_memories(previous: &MemoryState, state: &MemoryState) -> Result<(), String> {
    validate_claude_file_conflict(Some(previous), state)?;
    validate_rule_file_conflicts(Some(previous), state)?;
    save_memory_state(state)?;
    apply_memories(Some(previous), state)
}

fn validate_rule_file_conflicts(
    previous: Option<&MemoryState>,
    state: &MemoryState,
) -> Result<(), String> {
    for memory in state
        .memories
        .iter()
        .filter(|memory| memory.is_active && memory.target_type == MemoryTargetType::Rule)
    {
        let Some(rule_path) = memory.rule_path.as_deref() else {
            return Err("规则记忆必须填写规则文件路径".to_string());
        };
        let path = get_rule_file_path(rule_path);
        let was_active_same_file = previous
            .map(|previous| {
                previous.memories.iter().any(|previous_memory| {
                    previous_memory.id == memory.id
                        && previous_memory.is_active
                        && previous_memory.target_type == MemoryTargetType::Rule
                        && previous_memory.rule_path.as_deref() == Some(rule_path)
                })
            })
            .unwrap_or(false);

        if path.exists() && !was_active_same_file {
            if rule_file_matches_memory(&path, memory) {
                continue;
            }
            return Err(format!("规则文件已存在，无法覆盖: rules/{rule_path}"));
        }
    }

    Ok(())
}

fn remove_stale_rule_files(
    previous: Option<&MemoryState>,
    state: &MemoryState,
) -> Result<(), String> {
    let Some(previous) = previous else {
        return Ok(());
    };

    for previous_memory in previous
        .memories
        .iter()
        .filter(|memory| memory.is_active && memory.target_type == MemoryTargetType::Rule)
    {
        let Some(previous_rule_path) = previous_memory.rule_path.as_deref() else {
            continue;
        };
        let still_active_same_file = state.memories.iter().any(|memory| {
            memory.id == previous_memory.id
                && memory.is_active
                && memory.target_type == MemoryTargetType::Rule
                && memory.rule_path.as_deref() == Some(previous_rule_path)
        });
        if still_active_same_file {
            continue;
        }

        let path = get_rule_file_path(previous_rule_path);
        if path.exists() && rule_file_matches_memory(&path, previous_memory) {
            fs::remove_file(&path).map_err(|e| format!("删除规则文件失败 {:?}: {}", path, e))?;
        }
    }

    Ok(())
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

fn memory_state_view(mut state: MemoryState) -> Result<MemoryState, String> {
    state.unmanaged_memories = scan_unmanaged_memories(&state)?;
    Ok(state)
}

fn scan_unmanaged_memories(state: &MemoryState) -> Result<Vec<UnmanagedMemory>, String> {
    let mut memories = Vec::new();
    scan_unmanaged_claude_md(state, &mut memories)?;
    scan_unmanaged_rules(state, &mut memories)?;
    Ok(memories)
}

fn scan_unmanaged_claude_md(
    state: &MemoryState,
    memories: &mut Vec<UnmanagedMemory>,
) -> Result<(), String> {
    let path = get_claude_md_path();
    let Some((content, size, modified_at)) = read_regular_text_file_if_exists(&path)? else {
        return Ok(());
    };
    if active_claude_memory(state)
        .map(|memory| claude_content_matches_memory(&content, memory))
        .unwrap_or(false)
    {
        return Ok(());
    }
    let (title, content) = split_memory_title_heading(&content);

    memories.push(UnmanagedMemory {
        id: "unmanaged:claude:CLAUDE.md".to_string(),
        name: title.unwrap_or_else(|| "CLAUDE.md".to_string()),
        content,
        target_type: MemoryTargetType::Claude,
        rule_path: None,
        path_patterns: Vec::new(),
        source_path: "CLAUDE.md".to_string(),
        size,
        modified_at,
        import_status: UNMANAGED_IMPORT_READY.to_string(),
    });
    Ok(())
}

fn scan_unmanaged_rules(
    state: &MemoryState,
    memories: &mut Vec<UnmanagedMemory>,
) -> Result<(), String> {
    let rules_dir = get_rules_dir_path();
    let metadata = match fs::metadata(&rules_dir) {
        Ok(metadata) => metadata,
        Err(_) => return Ok(()),
    };
    if !metadata.is_dir() {
        return Ok(());
    }
    collect_unmanaged_rules(state, &rules_dir, &rules_dir, memories)
}

fn collect_unmanaged_rules(
    state: &MemoryState,
    rules_dir: &Path,
    current: &Path,
    memories: &mut Vec<UnmanagedMemory>,
) -> Result<(), String> {
    let mut entries = fs::read_dir(current)
        .map_err(|e| format!("读取 rules 目录失败 {:?}: {}", current, e))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("读取 rules 目录项失败: {}", e))?;
    entries.sort_by_key(|entry| entry.file_name());

    for entry in entries {
        let file_type = entry
            .file_type()
            .map_err(|e| format!("获取 rules 文件类型失败: {}", e))?;
        if file_type.is_symlink() {
            continue;
        }

        let path = entry.path();
        if file_type.is_dir() {
            collect_unmanaged_rules(state, rules_dir, &path, memories)?;
            continue;
        }
        if !file_type.is_file() || path.extension().and_then(|ext| ext.to_str()) != Some("md") {
            continue;
        }

        let rule_path = normalize_relative_path(
            path.strip_prefix(rules_dir)
                .map_err(|_| "规则文件路径处理失败".to_string())?,
        );
        let Some((raw, size, modified_at)) = read_regular_text_file_if_exists(&path)? else {
            continue;
        };
        let parsed = parse_rule_markdown(&raw);
        if state.memories.iter().any(|memory| {
            memory.is_active
                && memory.target_type == MemoryTargetType::Rule
                && memory.rule_path.as_deref() == Some(rule_path.as_str())
                && parsed.content == normalize_memory_body(&memory.content)
                && parsed.path_patterns == memory.path_patterns
                && parsed
                    .title
                    .as_deref()
                    .map(|title| title == memory.name)
                    .unwrap_or(true)
        }) {
            continue;
        }

        let has_managed_path = state.memories.iter().any(|memory| {
            memory.target_type == MemoryTargetType::Rule
                && memory.rule_path.as_deref() == Some(rule_path.as_str())
        });
        let source_path = format!("rules/{rule_path}");
        memories.push(UnmanagedMemory {
            id: format!("unmanaged:rule:{rule_path}"),
            name: parsed
                .title
                .clone()
                .unwrap_or_else(|| rule_display_name(&rule_path)),
            content: parsed.content,
            target_type: MemoryTargetType::Rule,
            rule_path: Some(rule_path),
            path_patterns: parsed.path_patterns,
            source_path,
            size,
            modified_at,
            import_status: if has_managed_path {
                UNMANAGED_IMPORT_PATH_CONFLICT.to_string()
            } else {
                UNMANAGED_IMPORT_READY.to_string()
            },
        });
    }

    Ok(())
}

fn read_regular_text_file_if_exists(path: &Path) -> Result<Option<(String, u64, u64)>, String> {
    let metadata = match fs::symlink_metadata(path) {
        Ok(metadata) => metadata,
        Err(_) => return Ok(None),
    };
    if metadata.file_type().is_symlink() || !metadata.is_file() {
        return Ok(None);
    }
    let content =
        fs::read_to_string(path).map_err(|e| format!("读取记忆文件失败 {:?}: {}", path, e))?;
    Ok(Some((
        content,
        metadata.len(),
        crate::utils::metadata_modified_secs(&metadata),
    )))
}

#[derive(Debug, Clone)]
struct ImportedUnmanagedMemory {
    name: String,
    content: String,
    target_type: MemoryTargetType,
    rule_path: Option<String>,
    path_patterns: Vec<String>,
}

fn read_unmanaged_memory_source(
    source: &UnmanagedMemorySource,
) -> Result<ImportedUnmanagedMemory, String> {
    match source.target_type {
        MemoryTargetType::Claude => {
            let path = get_claude_md_path();
            let (content, _, _) = read_regular_text_file_if_exists(&path)?
                .ok_or("未找到可导入的 CLAUDE.md".to_string())?;
            let (title, body) = split_memory_title_heading(&content);
            Ok(ImportedUnmanagedMemory {
                name: title.unwrap_or_else(|| "CLAUDE.md".to_string()),
                content: body,
                target_type: MemoryTargetType::Claude,
                rule_path: None,
                path_patterns: Vec::new(),
            })
        }
        MemoryTargetType::Rule => {
            let rule_path = source
                .rule_path
                .as_deref()
                .map(str::trim)
                .filter(|path| !path.is_empty())
                .ok_or("规则记忆必须填写规则文件路径")?;
            let path = resolve_existing_rule_file_path(rule_path)?;
            let (raw, _, _) = read_regular_text_file_if_exists(&path)?
                .ok_or("未找到可导入的规则文件".to_string())?;
            let parsed = parse_rule_markdown(&raw);
            Ok(ImportedUnmanagedMemory {
                name: parsed
                    .title
                    .clone()
                    .unwrap_or_else(|| rule_display_name(rule_path)),
                content: parsed.content,
                target_type: MemoryTargetType::Rule,
                rule_path: Some(rule_path.to_string()),
                path_patterns: parsed.path_patterns,
            })
        }
    }
}

fn resolve_existing_rule_file_path(rule_path: &str) -> Result<PathBuf, String> {
    validate_rule_path(rule_path)?;
    let mut current = get_rules_dir_path();
    for component in Path::new(rule_path).components() {
        current.push(component.as_os_str());
        let metadata = fs::symlink_metadata(&current)
            .map_err(|_| "只能导入 ~/.claude/rules/ 内的普通 Markdown 文件".to_string())?;
        if metadata.file_type().is_symlink() {
            return Err("只能导入 ~/.claude/rules/ 内的普通 Markdown 文件".to_string());
        }
    }
    let metadata = fs::metadata(&current)
        .map_err(|_| "只能导入 ~/.claude/rules/ 内的普通 Markdown 文件".to_string())?;
    if !metadata.is_file() {
        return Err("只能导入 ~/.claude/rules/ 内的普通 Markdown 文件".to_string());
    }
    Ok(current)
}

fn rule_display_name(rule_path: &str) -> String {
    rule_path
        .strip_suffix(".md")
        .filter(|name| !name.is_empty())
        .unwrap_or(rule_path)
        .to_string()
}

fn normalize_relative_path(path: &Path) -> String {
    path.components()
        .filter_map(|component| match component {
            Component::Normal(part) => Some(part.to_string_lossy().to_string()),
            _ => None,
        })
        .collect::<Vec<_>>()
        .join("/")
}

#[cfg(test)]
mod schema_tests {
    use super::*;
    use schemars::schema_for;
    use serde_json::json;
    use std::env;
    use std::fs;
    use std::path::{Path, PathBuf};
    use std::sync::{Mutex, MutexGuard};
    use std::time::{SystemTime, UNIX_EPOCH};

    static TEST_ENV_LOCK: Mutex<()> = Mutex::new(());

    struct TestEnv {
        _guard: MutexGuard<'static, ()>,
        _config_guard: MutexGuard<'static, ()>,
        root: PathBuf,
        previous_home: Option<String>,
        previous_app_data: Option<String>,
    }

    impl TestEnv {
        fn new(name: &str) -> Self {
            let guard = TEST_ENV_LOCK.lock().expect("测试环境锁应可获取");
            let config_guard = crate::utils::lock_config().expect("配置锁应可获取");
            let suffix = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_nanos();
            let root = env::temp_dir().join(format!(
                "ai-manager-memory-{name}-{}-{suffix}",
                std::process::id()
            ));
            fs::create_dir_all(&root).expect("应可创建测试目录");

            let previous_home = env::var("AI_MANAGER_HOME_OVERRIDE").ok();
            let previous_app_data = env::var("AI_MANAGER_APP_DATA_DIR_OVERRIDE").ok();
            env::set_var("AI_MANAGER_HOME_OVERRIDE", &root);
            env::set_var("AI_MANAGER_APP_DATA_DIR_OVERRIDE", root.join("app-data"));

            Self {
                _guard: guard,
                _config_guard: config_guard,
                root,
                previous_home,
                previous_app_data,
            }
        }

        fn claude_md(&self) -> PathBuf {
            self.root.join(".claude").join("CLAUDE.md")
        }

        fn rule_file(&self, rule_path: &str) -> PathBuf {
            self.root.join(".claude").join("rules").join(rule_path)
        }
    }

    impl Drop for TestEnv {
        fn drop(&mut self) {
            match &self.previous_home {
                Some(value) => env::set_var("AI_MANAGER_HOME_OVERRIDE", value),
                None => env::remove_var("AI_MANAGER_HOME_OVERRIDE"),
            }
            match &self.previous_app_data {
                Some(value) => env::set_var("AI_MANAGER_APP_DATA_DIR_OVERRIDE", value),
                None => env::remove_var("AI_MANAGER_APP_DATA_DIR_OVERRIDE"),
            }
            let _ = fs::remove_dir_all(&self.root);
        }
    }

    fn memory_data(target_type: MemoryTargetType, rule_path: Option<&str>) -> MemoryData {
        MemoryData {
            id: None,
            name: "记忆".to_string(),
            content: "内容".to_string(),
            target_type,
            rule_path: rule_path.map(str::to_string),
            path_patterns: vec![],
        }
    }

    fn file_exists(path: &Path) -> bool {
        path.try_exists().expect("文件存在性检查应成功")
    }

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
                target_type: MemoryTargetType::Claude,
                rule_path: None,
                path_patterns: vec![],
            },
        );

        assert_eq!(result.unwrap_err(), "记忆 id 与请求路径不一致");
    }

    #[test]
    fn enabling_second_claude_memory_disables_first_and_writes_single_content() {
        let env = TestEnv::new("claude-single-active");

        let first = add_memory(MemoryData {
            name: "全局一".to_string(),
            content: "第一段全局记忆".to_string(),
            ..memory_data(MemoryTargetType::Claude, None)
        })
        .expect("应可新增第一个全局记忆")
        .memories
        .into_iter()
        .next()
        .expect("应返回新增记忆");
        toggle_memory(first.id.clone()).expect("应可启用第一个全局记忆");

        let second = add_memory(MemoryData {
            name: "全局二".to_string(),
            content: "第二段全局记忆".to_string(),
            ..memory_data(MemoryTargetType::Claude, None)
        })
        .expect("应可新增第二个全局记忆")
        .memories
        .into_iter()
        .find(|memory| memory.name == "全局二")
        .expect("应返回第二个全局记忆");
        let state = toggle_memory(second.id.clone()).expect("应可启用第二个全局记忆");

        let first = state
            .memories
            .iter()
            .find(|memory| memory.name == "全局一")
            .expect("应保留第一个全局记忆");
        let second = state
            .memories
            .iter()
            .find(|memory| memory.name == "全局二")
            .expect("应保留第二个全局记忆");
        assert!(!first.is_active);
        assert!(second.is_active);
        assert_eq!(
            fs::read_to_string(env.claude_md()).expect("应写入 CLAUDE.md"),
            "# 全局二\n\n第二段全局记忆"
        );
    }

    #[test]
    fn active_memory_writes_name_as_level_one_heading_without_storing_duplicate_title() {
        let env = TestEnv::new("memory-title-heading");

        let memory = add_memory(MemoryData {
            name: "团队规范".to_string(),
            content: "# 旧标题\n\n总是使用 pnpm".to_string(),
            ..memory_data(MemoryTargetType::Claude, None)
        })
        .expect("应可新增全局记忆")
        .memories
        .into_iter()
        .next()
        .expect("应返回新增记忆");

        assert_eq!(memory.content, "总是使用 pnpm");

        toggle_memory(memory.id).expect("应可启用全局记忆");

        assert_eq!(
            fs::read_to_string(env.claude_md()).expect("应写入 CLAUDE.md"),
            "# 团队规范\n\n总是使用 pnpm"
        );
    }

    #[test]
    fn multiple_rule_memories_can_be_active_and_write_separate_files() {
        let env = TestEnv::new("rules-multiple-active");

        let first = add_memory(MemoryData {
            name: "工作流".to_string(),
            content: "工作流规则".to_string(),
            ..memory_data(MemoryTargetType::Rule, Some("workflow.md"))
        })
        .expect("应可新增第一条规则")
        .memories
        .into_iter()
        .next()
        .expect("应返回第一条规则");
        let second = add_memory(MemoryData {
            name: "前端样式".to_string(),
            content: "前端规则".to_string(),
            ..memory_data(MemoryTargetType::Rule, Some("frontend/style.md"))
        })
        .expect("应可新增第二条规则")
        .memories
        .into_iter()
        .find(|memory| memory.name == "前端样式")
        .expect("应返回第二条规则");

        toggle_memory(first.id).expect("应可启用第一条规则");
        let state = toggle_memory(second.id).expect("应可启用第二条规则");

        assert_eq!(
            state
                .memories
                .iter()
                .filter(|memory| memory.is_active)
                .count(),
            2
        );
        assert_eq!(
            fs::read_to_string(env.rule_file("workflow.md")).expect("应写入 workflow.md"),
            "# 工作流\n\n工作流规则"
        );
        assert_eq!(
            fs::read_to_string(env.rule_file("frontend/style.md")).expect("应写入 style.md"),
            "# 前端样式\n\n前端规则"
        );
    }

    #[test]
    fn active_rule_memory_writes_path_patterns_frontmatter() {
        let env = TestEnv::new("rule-path-patterns");

        let rule = add_memory(MemoryData {
            name: "前端规则".to_string(),
            content: "使用组件级样式。".to_string(),
            path_patterns: vec!["src/**/*.tsx".to_string(), "src/**/*.css".to_string()],
            ..memory_data(MemoryTargetType::Rule, Some("frontend/style.md"))
        })
        .expect("应可新增带路径匹配的规则")
        .memories
        .into_iter()
        .next()
        .expect("应返回规则");

        toggle_memory(rule.id).expect("应可启用规则");

        assert_eq!(
            fs::read_to_string(env.rule_file("frontend/style.md")).expect("应写入规则文件"),
            "---\npaths:\n  - \"src/**/*.tsx\"\n  - \"src/**/*.css\"\n---\n\n# 前端规则\n\n使用组件级样式。"
        );
    }

    #[test]
    fn disabling_or_deleting_active_rule_removes_its_file() {
        let env = TestEnv::new("rule-cleanup");

        let rule = add_memory(MemoryData {
            content: "临时规则".to_string(),
            ..memory_data(MemoryTargetType::Rule, Some("cleanup.md"))
        })
        .expect("应可新增规则")
        .memories
        .into_iter()
        .next()
        .expect("应返回规则");

        toggle_memory(rule.id.clone()).expect("应可启用规则");
        assert!(file_exists(&env.rule_file("cleanup.md")));

        toggle_memory(rule.id.clone()).expect("应可禁用规则");
        assert!(!file_exists(&env.rule_file("cleanup.md")));

        toggle_memory(rule.id.clone()).expect("应可再次启用规则");
        assert!(file_exists(&env.rule_file("cleanup.md")));

        delete_memory(rule.id).expect("应可删除规则");
        assert!(!file_exists(&env.rule_file("cleanup.md")));
    }

    #[test]
    fn updating_active_rule_path_removes_old_file_and_writes_new_file() {
        let env = TestEnv::new("rule-rename");

        let rule = add_memory(MemoryData {
            content: "旧规则".to_string(),
            ..memory_data(MemoryTargetType::Rule, Some("old.md"))
        })
        .expect("应可新增规则")
        .memories
        .into_iter()
        .next()
        .expect("应返回规则");
        toggle_memory(rule.id.clone()).expect("应可启用规则");

        update_memory(
            rule.id,
            MemoryData {
                id: None,
                name: "新规则".to_string(),
                content: "新规则内容".to_string(),
                target_type: MemoryTargetType::Rule,
                rule_path: Some("nested/new.md".to_string()),
                path_patterns: vec![],
            },
        )
        .expect("应可更新启用规则路径");

        assert!(!file_exists(&env.rule_file("old.md")));
        assert_eq!(
            fs::read_to_string(env.rule_file("nested/new.md")).expect("应写入新规则文件"),
            "# 新规则\n\n新规则内容"
        );
    }

    #[test]
    fn rule_path_validation_rejects_invalid_or_duplicate_paths() {
        let _env = TestEnv::new("rule-validation");

        for invalid in [
            None,
            Some(""),
            Some("notes.txt"),
            Some("/abs/rule.md"),
            Some("../x.md"),
        ] {
            let result = add_memory(memory_data(MemoryTargetType::Rule, invalid));
            assert!(
                result.is_err(),
                "非法 rulePath {:?} 应被拒绝",
                invalid.unwrap_or("<none>")
            );
        }

        add_memory(MemoryData {
            name: "规则一".to_string(),
            ..memory_data(MemoryTargetType::Rule, Some("same.md"))
        })
        .expect("第一条规则路径应可使用");
        let duplicate = add_memory(MemoryData {
            name: "规则二".to_string(),
            ..memory_data(MemoryTargetType::Rule, Some("same.md"))
        });

        assert_eq!(duplicate.unwrap_err(), "规则文件路径已被其他记忆使用");
    }

    #[test]
    fn enabling_rule_memory_rejects_existing_unmanaged_file() {
        let env = TestEnv::new("rule-file-conflict");
        let existing_path = env.rule_file("manual.md");
        fs::create_dir_all(existing_path.parent().expect("应存在父目录"))
            .expect("应可创建规则目录");
        fs::write(&existing_path, "手写规则").expect("应可写入手写规则");

        let rule = add_memory(MemoryData {
            content: "应用规则".to_string(),
            ..memory_data(MemoryTargetType::Rule, Some("manual.md"))
        })
        .expect("应可新增未启用规则")
        .memories
        .into_iter()
        .next()
        .expect("应返回规则");

        let result = toggle_memory(rule.id);

        assert_eq!(
            result.unwrap_err(),
            "规则文件已存在，无法覆盖: rules/manual.md"
        );
        assert_eq!(
            fs::read_to_string(existing_path).expect("手写规则应保留"),
            "手写规则"
        );
        let state = load_memory_state();
        assert!(
            !state
                .memories
                .iter()
                .find(|memory| memory.name == "记忆")
                .expect("冲突后状态中仍应保留未启用规则")
                .is_active
        );
    }

    #[test]
    fn get_memories_lists_unmanaged_claude_md_and_rules() {
        let env = TestEnv::new("unmanaged-list");
        fs::create_dir_all(env.rule_file("frontend/style.md").parent().unwrap())
            .expect("应可创建 rules 子目录");
        fs::write(env.claude_md(), "# 手写全局记忆\n\n具体偏好").expect("应可写入 CLAUDE.md");
        fs::write(
            env.rule_file("frontend/style.md"),
            "---\npaths:\n  - \"src/**/*.tsx\"\n---\n\n使用组件级样式。",
        )
        .expect("应可写入规则文件");

        let state = get_memories().expect("应可读取记忆视图");

        assert_eq!(state.unmanaged_memories.len(), 2);
        let claude = state
            .unmanaged_memories
            .iter()
            .find(|memory| memory.source_path == "CLAUDE.md")
            .expect("应列出未托管 CLAUDE.md");
        assert_eq!(claude.name, "手写全局记忆");
        assert_eq!(claude.content, "具体偏好");
        assert_eq!(claude.target_type, MemoryTargetType::Claude);

        let rule = state
            .unmanaged_memories
            .iter()
            .find(|memory| memory.source_path == "rules/frontend/style.md")
            .expect("应列出未托管 rule");
        assert_eq!(rule.content, "使用组件级样式。");
        assert_eq!(rule.rule_path.as_deref(), Some("frontend/style.md"));
        assert_eq!(rule.path_patterns, vec!["src/**/*.tsx"]);
    }

    #[test]
    fn import_unmanaged_rule_memory_adopts_existing_file_with_paths() {
        let env = TestEnv::new("import-unmanaged-rule");
        let raw_rule = "---\npaths:\n  - \"src/**/*.tsx\"\n---\n\n# 前端规则\n\n使用组件级样式。";
        fs::create_dir_all(env.rule_file("frontend/style.md").parent().unwrap())
            .expect("应可创建 rules 子目录");
        fs::write(env.rule_file("frontend/style.md"), raw_rule).expect("应可写入规则文件");

        let state = import_unmanaged_memory(UnmanagedMemorySource {
            target_type: MemoryTargetType::Rule,
            rule_path: Some("frontend/style.md".to_string()),
        })
        .expect("应可导入未托管规则");

        let memory = state
            .memories
            .iter()
            .find(|memory| memory.rule_path.as_deref() == Some("frontend/style.md"))
            .expect("应创建托管规则记忆");
        assert!(memory.is_active);
        assert_eq!(memory.name, "前端规则");
        assert_eq!(memory.content, "使用组件级样式。");
        assert_eq!(memory.path_patterns, vec!["src/**/*.tsx"]);
        assert_eq!(
            fs::read_to_string(env.rule_file("frontend/style.md")).expect("规则文件应仍存在"),
            raw_rule
        );
        assert!(state
            .unmanaged_memories
            .iter()
            .all(|memory| memory.source_path != "rules/frontend/style.md"));
    }

    #[test]
    fn adding_inactive_memory_leaves_unmanaged_claude_md_untouched() {
        let env = TestEnv::new("preserve-unmanaged-claude");
        fs::create_dir_all(env.claude_md().parent().unwrap()).expect("应可创建 .claude 目录");
        fs::write(env.claude_md(), "手写全局记忆").expect("应可写入 CLAUDE.md");

        add_memory(MemoryData {
            id: None,
            name: "规则".to_string(),
            content: "规则内容".to_string(),
            target_type: MemoryTargetType::Rule,
            rule_path: Some("workflow.md".to_string()),
            path_patterns: vec![],
        })
        .expect("应可新增未启用规则");

        assert_eq!(
            fs::read_to_string(env.claude_md()).expect("未托管 CLAUDE.md 应保留"),
            "手写全局记忆"
        );
    }
}
