use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Component, Path, PathBuf};
use uuid::Uuid;

const CURRENT_MEMORY_STATE_VERSION: u32 = 2;
const UNMANAGED_IMPORT_READY: &str = "ready";
const UNMANAGED_IMPORT_PATH_CONFLICT: &str = "managedPathConflict";
const UNMANAGED_IMPORT_UNSUPPORTED_SYMLINK: &str = "unsupportedSymlink";
const SYMLINK_IMPORT_ERROR: &str = "软链接记忆文件不支持导入";
const SYMLINK_WRITE_ERROR: &str = "软链接记忆路径不支持写入";
const KARPATHY_MEMORY_PRESET_ID: &str = "karpathy-behavior-guidelines";
const KARPATHY_MEMORY_PRESET_SOURCE_URL: &str =
    "https://raw.githubusercontent.com/multica-ai/andrej-karpathy-skills/refs/heads/main/CLAUDE.md";
const KARPATHY_MEMORY_PRESET_MARKER_BEGIN: &str =
    "<!-- code-manager:memory-preset:karpathy-behavior-guidelines:";
const KARPATHY_MEMORY_PRESET_MARKER_END: &str =
    "<!-- /code-manager:memory-preset:karpathy-behavior-guidelines:";
const KARPATHY_MEMORY_PRESET_EN_CONTENT: &str = r#"Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:

```text
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes."#;
const KARPATHY_MEMORY_PRESET_ZH_CONTENT: &str = r#"用于减少 LLM 常见编码错误的行为指南。请按需与项目专属指令合并使用。

**取舍：** 这些指南偏向谨慎而不是速度。面对琐碎任务时，请结合判断。

## 1. 编码前先思考

**不要假设。不要掩盖困惑。要说明取舍。**

实现前：
- 明确说出你的假设。如果不确定，就询问。
- 如果存在多种理解，列出来，不要默默选择一种。
- 如果有更简单的方案，要说出来。必要时提出异议。
- 如果事情不清楚，先停下。说明哪里困惑，然后询问。

## 2. 简单优先

**用能解决问题的最少代码。不要做推测性扩展。**

- 不添加请求之外的功能。
- 不为单次使用的代码抽象。
- 不添加未被要求的“灵活性”或“可配置性”。
- 不为不可能发生的场景添加错误处理。
- 如果写了 200 行但 50 行就能解决，重写得更简单。

问自己：“资深工程师会不会觉得这过度复杂？” 如果会，就简化。

## 3. 外科手术式修改

**只触碰必须修改的部分。只清理自己造成的问题。**

编辑现有代码时：
- 不要顺手“改进”相邻代码、注释或格式。
- 不要重构没有坏的东西。
- 匹配现有风格，即使你会用不同写法。
- 如果发现无关死代码，提出来，不要删除。

当你的改动制造了孤儿代码：
- 移除由你的改动造成的未使用 import、变量或函数。
- 不要删除原本就存在的死代码，除非用户要求。

检验标准：每一行改动都应该能直接追溯到用户请求。

## 4. 目标驱动执行

**定义成功标准。循环直到验证通过。**

把任务转成可验证目标：
- “添加校验” → “先写无效输入测试，再让它通过”
- “修复 bug” → “先写能复现 bug 的测试，再让它通过”
- “重构 X” → “确保重构前后测试都通过”

对于多步骤任务，先写简短计划：

```text
1. [步骤] → 验证：[检查]
2. [步骤] → 验证：[检查]
3. [步骤] → 验证：[检查]
```

强成功标准能让你独立循环推进。弱标准（“让它能用”）需要不断澄清。

---

**这些指南生效的表现：** diff 中不必要的改动更少，因过度复杂导致的重写更少，澄清问题发生在实现前而不是出错后。"#;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum MemoryTargetType {
    Claude,
    Rule,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum MemoryPresetLanguage {
    Zh,
    En,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum MemoryPresetAction {
    CreateClaude,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, JsonSchema, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum MemoryPresetApplyOutcome {
    CreatedClaude,
    ActivatedExisting,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
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

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
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

#[derive(Debug, Clone, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct MemoryDeletePreview {
    pub cleanup_dirs: Vec<String>,
}

#[derive(Debug, Clone, Deserialize, JsonSchema, specta::Type)]
#[serde(rename_all = "camelCase")]
#[serde(deny_unknown_fields)]
pub struct MemoryPresetApplyInput {
    pub preset_id: String,
    pub language: MemoryPresetLanguage,
    pub action: MemoryPresetAction,
}

#[derive(Debug, Clone, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct MemoryPresetApplyResult {
    pub state: MemoryState,
    pub outcome: MemoryPresetApplyOutcome,
    pub memory_id: String,
}

#[derive(Debug, Clone, Deserialize, JsonSchema, specta::Type)]
#[serde(rename_all = "camelCase")]
#[serde(deny_unknown_fields)]
pub struct MemoryPresetContentInput {
    pub preset_id: String,
    pub language: MemoryPresetLanguage,
}

#[derive(Debug, Clone, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct MemoryPresetContentResult {
    pub preset_id: String,
    pub language: MemoryPresetLanguage,
    pub name: String,
    pub content: String,
    pub source_url: String,
}

fn current_memory_state_version() -> u32 {
    CURRENT_MEMORY_STATE_VERSION
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
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

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum MemoryDirectoryImportSkipReason {
    DuplicateClaude,
    DuplicateRulePath,
    UnsupportedSymlink,
    InvalidRulePath,
    ReadError,
}

#[derive(Debug, Clone, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct MemoryDirectoryImportItem {
    pub source_path: String,
    pub name: String,
    pub target_type: MemoryTargetType,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rule_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct MemoryDirectoryImportSkippedItem {
    pub source_path: String,
    pub reason: MemoryDirectoryImportSkipReason,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
}

#[derive(Debug, Clone, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct MemoryDirectoryImportResult {
    pub state: MemoryState,
    pub imported: Vec<MemoryDirectoryImportItem>,
    pub skipped: Vec<MemoryDirectoryImportSkippedItem>,
}

/// 新增/更新记忆的数据传输对象
#[derive(Debug, Clone, Deserialize, JsonSchema, specta::Type)]
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

#[derive(Debug, Clone, Deserialize, JsonSchema, specta::Type)]
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
    get_claude_dir_path().join("CLAUDE.md")
}

/// 获取用户级 rules 目录路径
fn get_rules_dir_path() -> PathBuf {
    get_claude_dir_path().join("rules")
}

fn get_claude_dir_path() -> PathBuf {
    crate::utils::home_dir_or_fallback().join(".claude")
}

/// 从文件加载记忆状态，失败时返回默认值
pub fn load_memory_state() -> MemoryState {
    let path = get_memory_config_path();
    let mut state: MemoryState = crate::utils::read_json_file(&path);
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
        crate::utils::ensure_dir_and_write_atomic(&path, &serialize_rule_memory(memory))?;
    }

    Ok(())
}

#[tauri::command]
#[specta::specta]
pub fn get_memories() -> Result<MemoryState, crate::error::CommandError> {
    Ok(memory_state_view(load_memory_state())?)
}

#[tauri::command]
#[specta::specta]
pub fn add_memory(data: MemoryData) -> Result<MemoryState, crate::error::CommandError> {
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
    Ok(result?)
}

#[tauri::command]
#[specta::specta]
pub fn update_memory(
    id: String,
    data: MemoryData,
) -> Result<MemoryState, crate::error::CommandError> {
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
    Ok(result?)
}

#[tauri::command]
#[specta::specta]
pub fn duplicate_memory(
    id: String,
    name_suffix: String,
) -> Result<MemoryState, crate::error::CommandError> {
    let result = (|| {
        // 加锁保护并发写入
        let _lock = crate::utils::lock_memory()?;

        let mut state = load_memory_state();
        let index = state
            .memories
            .iter()
            .position(|memory| memory.id == id)
            .ok_or("未找到要复制的记忆")?;
        let original = state.memories[index].clone();
        let rule_path = match original.target_type {
            MemoryTargetType::Claude => None,
            MemoryTargetType::Rule => {
                let source_rule_path = original
                    .rule_path
                    .as_deref()
                    .ok_or("规则记忆缺少规则文件路径")?;
                Some(duplicate_rule_path(&state, &original.id, source_rule_path)?)
            }
        };
        let now = crate::utils::current_timestamp();

        let duplicated = Memory {
            id: Uuid::new_v4().to_string(),
            name: format!("{}{}", original.name, name_suffix),
            content: original.content,
            target_type: original.target_type,
            rule_path,
            path_patterns: original.path_patterns,
            is_active: false,
            created_at: now,
            updated_at: now,
        };

        let previous = state.clone();
        state.memories.insert(index + 1, duplicated);
        save_and_apply_memories(&previous, &state)?;

        memory_state_view(state)
    })();
    crate::logging::log_command_result("memory.duplicate", &result, |state| {
        format!(
            "source_memory_id={id} memory_count={}",
            state.memories.len()
        )
    });
    Ok(result?)
}

#[tauri::command]
#[specta::specta]
pub fn delete_memory(id: String) -> Result<MemoryState, crate::error::CommandError> {
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
    Ok(result?)
}

#[tauri::command]
#[specta::specta]
pub fn preview_delete_memory(
    id: String,
) -> Result<MemoryDeletePreview, crate::error::CommandError> {
    let result = (|| {
        let _lock = crate::utils::lock_memory()?;

        let state = load_memory_state();
        let mut next_state = state.clone();
        let previous_count = next_state.memories.len();
        next_state.memories.retain(|memory| memory.id != id);
        if next_state.memories.len() == previous_count {
            return Err("未找到指定记忆".to_string());
        }

        let cleanup_dirs = preview_stale_rule_cleanup_dirs(&state, &next_state)?
            .into_iter()
            .map(|path| path.display().to_string())
            .collect();

        Ok(MemoryDeletePreview { cleanup_dirs })
    })();
    crate::logging::log_command_result("memory.delete_preview", &result, |preview| {
        format!(
            "memory_id={id} cleanup_dir_count={}",
            preview.cleanup_dirs.len()
        )
    });
    Ok(result?)
}

#[tauri::command]
#[specta::specta]
pub fn toggle_memory(id: String) -> Result<MemoryState, crate::error::CommandError> {
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
    Ok(result?)
}

#[tauri::command]
#[specta::specta]
pub fn import_unmanaged_memory(
    source: UnmanagedMemorySource,
) -> Result<MemoryState, crate::error::CommandError> {
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
    Ok(result?)
}

#[tauri::command]
#[specta::specta]
pub fn import_memories_from_directory(
    source_dir: String,
) -> Result<MemoryDirectoryImportResult, crate::error::CommandError> {
    let result = (|| {
        let source_dir = validate_memory_import_source_dir(&source_dir)?;

        let _lock = crate::utils::lock_memory()?;
        let mut state = load_memory_state();
        let now = crate::utils::current_timestamp();
        let mut imported = Vec::new();
        let mut skipped = Vec::new();

        import_directory_claude_memory(&source_dir, &mut state, now, &mut imported, &mut skipped);
        import_directory_rule_memories(&source_dir, &mut state, now, &mut imported, &mut skipped)?;

        if !imported.is_empty() {
            save_memory_state(&state)?;
        }

        Ok(MemoryDirectoryImportResult {
            state: memory_state_view(state)?,
            imported,
            skipped,
        })
    })();
    crate::logging::log_command_result("memory.import_directory", &result, |result| {
        format!(
            "imported_count={} skipped_count={}",
            result.imported.len(),
            result.skipped.len()
        )
    });
    Ok(result?)
}

#[tauri::command]
#[specta::specta]
pub fn apply_memory_preset(
    data: MemoryPresetApplyInput,
) -> Result<MemoryPresetApplyResult, crate::error::CommandError> {
    let result = (|| {
        let preset = resolve_memory_preset(&data.preset_id, data.language)?;
        let _lock = crate::utils::lock_memory()?;
        let mut state = load_memory_state();
        match data.action {
            MemoryPresetAction::CreateClaude => apply_preset_as_claude(&mut state, &preset),
        }
    })();
    crate::logging::log_command_result("memory.apply_preset", &result, |result| {
        format!(
            "preset_id={} outcome={:?} memory_id={}",
            data.preset_id, result.outcome, result.memory_id
        )
    });
    Ok(result?)
}

#[tauri::command]
#[specta::specta]
pub fn get_memory_preset_content(
    data: MemoryPresetContentInput,
) -> Result<MemoryPresetContentResult, crate::error::CommandError> {
    let result = (|| {
        let preset = resolve_memory_preset(&data.preset_id, data.language)?;
        Ok(MemoryPresetContentResult {
            preset_id: data.preset_id.clone(),
            language: preset.language,
            name: preset.name.to_string(),
            content: append_preset_content("", &preset),
            source_url: KARPATHY_MEMORY_PRESET_SOURCE_URL.to_string(),
        })
    })();
    crate::logging::log_command_result("memory.get_preset_content", &result, |result| {
        format!(
            "preset_id={} language={:?} content_len={}",
            result.preset_id,
            result.language,
            result.content.len()
        )
    });
    Ok(result?)
}

#[derive(Debug, Clone, Copy)]
struct MemoryPresetDefinition {
    language: MemoryPresetLanguage,
    name: &'static str,
    content: &'static str,
}

fn resolve_memory_preset(
    preset_id: &str,
    language: MemoryPresetLanguage,
) -> Result<MemoryPresetDefinition, String> {
    if preset_id != KARPATHY_MEMORY_PRESET_ID {
        return Err(format!("未知记忆预设 '{}'", preset_id));
    }

    Ok(match language {
        MemoryPresetLanguage::Zh => MemoryPresetDefinition {
            language: MemoryPresetLanguage::Zh,
            name: "Karpathy 行为指南",
            content: KARPATHY_MEMORY_PRESET_ZH_CONTENT,
        },
        MemoryPresetLanguage::En => MemoryPresetDefinition {
            language: MemoryPresetLanguage::En,
            name: "Karpathy Behavioral Guidelines",
            content: KARPATHY_MEMORY_PRESET_EN_CONTENT,
        },
    })
}

fn apply_preset_as_claude(
    state: &mut MemoryState,
    preset: &MemoryPresetDefinition,
) -> Result<MemoryPresetApplyResult, String> {
    let previous = state.clone();
    let now = crate::utils::current_timestamp();

    let claude_md_path = get_claude_md_path();
    if active_claude_memory(state).is_some() || fs::symlink_metadata(&claude_md_path).is_ok() {
        return Err(
            "已有主记忆，请在创建或编辑页面将 Karpathy 行为指南导入到当前文档底部".to_string(),
        );
    }

    let preset_body = normalize_memory_body(preset.content);
    let preset_marked_content = append_preset_content("", preset);
    if let Some(index) = state.memories.iter().position(|memory| {
        if memory.target_type != MemoryTargetType::Claude {
            return false;
        }
        let memory_body = normalize_memory_body(&memory.content);
        memory_body == preset_body || memory_body == preset_marked_content
    }) {
        let memory_id = state.memories[index].id.clone();
        state.memories[index].is_active = true;
        state.memories[index].content = preset_marked_content;
        state.memories[index].updated_at = now;
        enforce_single_active_claude(state, &memory_id, now);
        save_and_apply_memories(&previous, state)?;
        return Ok(MemoryPresetApplyResult {
            state: memory_state_view(state.clone())?,
            outcome: MemoryPresetApplyOutcome::ActivatedExisting,
            memory_id,
        });
    }

    let memory_id = Uuid::new_v4().to_string();
    state.memories.push(Memory {
        id: memory_id.clone(),
        name: preset.name.to_string(),
        content: preset_marked_content,
        target_type: MemoryTargetType::Claude,
        rule_path: None,
        path_patterns: Vec::new(),
        is_active: true,
        created_at: now,
        updated_at: now,
    });
    enforce_single_active_claude(state, &memory_id, now);
    save_and_apply_memories(&previous, state)?;

    Ok(MemoryPresetApplyResult {
        state: memory_state_view(state.clone())?,
        outcome: MemoryPresetApplyOutcome::CreatedClaude,
        memory_id,
    })
}

fn validate_memory_import_source_dir(source_dir: &str) -> Result<PathBuf, String> {
    let trimmed = source_dir.trim();
    if trimmed.is_empty() {
        return Err("请选择有效目录".to_string());
    }
    let path = PathBuf::from(trimmed);
    let metadata = fs::symlink_metadata(&path)
        .map_err(|e| format!("请选择有效目录，读取目录失败 {:?}: {}", path, e))?;
    if metadata.file_type().is_symlink() || !metadata.is_dir() {
        return Err("请选择有效目录".to_string());
    }
    Ok(path)
}

fn import_directory_claude_memory(
    source_dir: &Path,
    state: &mut MemoryState,
    now: u64,
    imported: &mut Vec<MemoryDirectoryImportItem>,
    skipped: &mut Vec<MemoryDirectoryImportSkippedItem>,
) {
    let source_path = "CLAUDE.md";
    let Some(raw) =
        read_import_source_text_file(&source_dir.join(source_path), source_path, skipped)
    else {
        return;
    };
    let (title, content) = split_memory_title_heading(&raw);
    let name = title.unwrap_or_else(|| "CLAUDE.md".to_string());

    if state.memories.iter().any(|memory| {
        memory.target_type == MemoryTargetType::Claude
            && memory.name == name
            && normalize_memory_body(&memory.content) == normalize_memory_body(&content)
    }) {
        skipped.push(MemoryDirectoryImportSkippedItem {
            source_path: source_path.to_string(),
            reason: MemoryDirectoryImportSkipReason::DuplicateClaude,
            detail: None,
        });
        return;
    }

    let memory = Memory {
        id: Uuid::new_v4().to_string(),
        name: name.clone(),
        content: normalize_memory_body(&content),
        target_type: MemoryTargetType::Claude,
        rule_path: None,
        path_patterns: Vec::new(),
        is_active: false,
        created_at: now,
        updated_at: now,
    };
    state.memories.push(memory);
    imported.push(MemoryDirectoryImportItem {
        source_path: source_path.to_string(),
        name,
        target_type: MemoryTargetType::Claude,
        rule_path: None,
    });
}

fn import_directory_rule_memories(
    source_dir: &Path,
    state: &mut MemoryState,
    now: u64,
    imported: &mut Vec<MemoryDirectoryImportItem>,
    skipped: &mut Vec<MemoryDirectoryImportSkippedItem>,
) -> Result<(), String> {
    let rules_dir = source_dir.join("rules");
    let metadata = match fs::symlink_metadata(&rules_dir) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(error) => {
            skipped.push(MemoryDirectoryImportSkippedItem {
                source_path: "rules".to_string(),
                reason: MemoryDirectoryImportSkipReason::ReadError,
                detail: Some(error.to_string()),
            });
            return Ok(());
        }
    };
    if metadata.file_type().is_symlink() {
        skipped.push(MemoryDirectoryImportSkippedItem {
            source_path: "rules".to_string(),
            reason: MemoryDirectoryImportSkipReason::UnsupportedSymlink,
            detail: None,
        });
        return Ok(());
    }
    if !metadata.is_dir() {
        return Ok(());
    }

    collect_directory_import_rules(
        source_dir, &rules_dir, &rules_dir, state, now, imported, skipped,
    )
}

fn collect_directory_import_rules(
    source_dir: &Path,
    rules_dir: &Path,
    current: &Path,
    state: &mut MemoryState,
    now: u64,
    imported: &mut Vec<MemoryDirectoryImportItem>,
    skipped: &mut Vec<MemoryDirectoryImportSkippedItem>,
) -> Result<(), String> {
    let mut entries = match fs::read_dir(current) {
        Ok(entries) => {
            let mut collected = Vec::new();
            for entry in entries {
                match entry {
                    Ok(entry) => collected.push(entry),
                    Err(error) => skipped.push(MemoryDirectoryImportSkippedItem {
                        source_path: import_source_relative_path(source_dir, current),
                        reason: MemoryDirectoryImportSkipReason::ReadError,
                        detail: Some(error.to_string()),
                    }),
                }
            }
            collected
        }
        Err(error) => {
            skipped.push(MemoryDirectoryImportSkippedItem {
                source_path: import_source_relative_path(source_dir, current),
                reason: MemoryDirectoryImportSkipReason::ReadError,
                detail: Some(error.to_string()),
            });
            return Ok(());
        }
    };
    entries.sort_by_key(|entry| entry.file_name());

    for entry in entries {
        let path = entry.path();
        let file_type = match entry.file_type() {
            Ok(file_type) => file_type,
            Err(error) => {
                skipped.push(MemoryDirectoryImportSkippedItem {
                    source_path: import_source_relative_path(source_dir, &path),
                    reason: MemoryDirectoryImportSkipReason::ReadError,
                    detail: Some(error.to_string()),
                });
                continue;
            }
        };

        if file_type.is_symlink() {
            if path.extension().and_then(|ext| ext.to_str()) == Some("md")
                || symlink_target_is_directory(&path)
            {
                skipped.push(MemoryDirectoryImportSkippedItem {
                    source_path: import_source_relative_path(source_dir, &path),
                    reason: MemoryDirectoryImportSkipReason::UnsupportedSymlink,
                    detail: None,
                });
            }
            continue;
        }

        if file_type.is_dir() {
            collect_directory_import_rules(
                source_dir, rules_dir, &path, state, now, imported, skipped,
            )?;
            continue;
        }

        if !file_type.is_file() || path.extension().and_then(|ext| ext.to_str()) != Some("md") {
            continue;
        }

        import_directory_rule_memory(source_dir, rules_dir, &path, state, now, imported, skipped);
    }

    Ok(())
}

fn import_directory_rule_memory(
    source_dir: &Path,
    rules_dir: &Path,
    path: &Path,
    state: &mut MemoryState,
    now: u64,
    imported: &mut Vec<MemoryDirectoryImportItem>,
    skipped: &mut Vec<MemoryDirectoryImportSkippedItem>,
) {
    let source_path = import_source_relative_path(source_dir, path);
    let rule_path = normalize_relative_path(match path.strip_prefix(rules_dir) {
        Ok(relative) => relative,
        Err(_) => {
            skipped.push(MemoryDirectoryImportSkippedItem {
                source_path,
                reason: MemoryDirectoryImportSkipReason::InvalidRulePath,
                detail: Some("规则文件路径处理失败".to_string()),
            });
            return;
        }
    });

    if let Err(error) = validate_rule_path(&rule_path) {
        skipped.push(MemoryDirectoryImportSkippedItem {
            source_path,
            reason: MemoryDirectoryImportSkipReason::InvalidRulePath,
            detail: Some(error),
        });
        return;
    }

    let Some(raw) = read_import_source_text_file(path, &source_path, skipped) else {
        return;
    };

    if state.memories.iter().any(|memory| {
        memory.target_type == MemoryTargetType::Rule
            && memory.rule_path.as_deref() == Some(rule_path.as_str())
    }) {
        skipped.push(MemoryDirectoryImportSkippedItem {
            source_path,
            reason: MemoryDirectoryImportSkipReason::DuplicateRulePath,
            detail: None,
        });
        return;
    }

    let parsed = parse_rule_markdown(&raw);
    let name = parsed
        .title
        .clone()
        .unwrap_or_else(|| rule_display_name(&rule_path));
    let memory = Memory {
        id: Uuid::new_v4().to_string(),
        name: name.clone(),
        content: normalize_memory_body(&parsed.content),
        target_type: MemoryTargetType::Rule,
        rule_path: Some(rule_path.clone()),
        path_patterns: parsed.path_patterns,
        is_active: false,
        created_at: now,
        updated_at: now,
    };
    state.memories.push(memory);
    imported.push(MemoryDirectoryImportItem {
        source_path,
        name,
        target_type: MemoryTargetType::Rule,
        rule_path: Some(rule_path),
    });
}

fn read_import_source_text_file(
    path: &Path,
    source_path: &str,
    skipped: &mut Vec<MemoryDirectoryImportSkippedItem>,
) -> Option<String> {
    let metadata = match fs::symlink_metadata(path) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return None,
        Err(error) => {
            skipped.push(MemoryDirectoryImportSkippedItem {
                source_path: source_path.to_string(),
                reason: MemoryDirectoryImportSkipReason::ReadError,
                detail: Some(error.to_string()),
            });
            return None;
        }
    };
    if metadata.file_type().is_symlink() {
        skipped.push(MemoryDirectoryImportSkippedItem {
            source_path: source_path.to_string(),
            reason: MemoryDirectoryImportSkipReason::UnsupportedSymlink,
            detail: None,
        });
        return None;
    }
    if !metadata.is_file() {
        return None;
    }
    fs::read_to_string(path)
        .map_err(|error| {
            skipped.push(MemoryDirectoryImportSkippedItem {
                source_path: source_path.to_string(),
                reason: MemoryDirectoryImportSkipReason::ReadError,
                detail: Some(error.to_string()),
            });
        })
        .ok()
}

fn import_source_relative_path(source_dir: &Path, path: &Path) -> String {
    path.strip_prefix(source_dir)
        .map(normalize_relative_path)
        .unwrap_or_else(|_| path.display().to_string())
}

fn symlink_target_is_directory(path: &Path) -> bool {
    fs::metadata(path)
        .map(|metadata| metadata.is_dir())
        .unwrap_or(false)
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

fn duplicate_rule_path(
    state: &MemoryState,
    source_id: &str,
    rule_path: &str,
) -> Result<String, String> {
    validate_rule_path(rule_path)?;

    let path = Path::new(rule_path);
    let file_name = path
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or("规则文件路径不合法")?;
    let stem = file_name.strip_suffix(".md").unwrap_or(file_name);
    let parent = path
        .parent()
        .and_then(|value| value.to_str())
        .filter(|value| !value.is_empty());

    for copy_index in 1..=10_000 {
        let copy_suffix = if copy_index == 1 {
            "copy".to_string()
        } else {
            format!("copy-{copy_index}")
        };
        let candidate_file_name = format!("{stem}-{copy_suffix}.md");
        let candidate = parent
            .map(|parent| format!("{parent}/{candidate_file_name}"))
            .unwrap_or(candidate_file_name);

        let used = state.memories.iter().any(|memory| {
            memory.id != source_id
                && memory.target_type == MemoryTargetType::Rule
                && memory.rule_path.as_deref() == Some(candidate.as_str())
        });
        if !used {
            return Ok(candidate);
        }
    }

    Err("无法生成唯一规则文件路径".to_string())
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
                crate::utils::ensure_dir_and_write_atomic(&path, "")?;
            }
        }
        return Ok(());
    };

    validate_claude_file_conflict(previous, state)?;
    let path = get_claude_md_path();
    crate::utils::ensure_dir_and_write_atomic(&path, &serialize_claude_memory(active))
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
    ensure_memory_write_path_has_no_symlink(&path)?;
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

fn append_preset_content(content: &str, preset: &MemoryPresetDefinition) -> String {
    let body = normalize_memory_body(content);
    let block = format!(
        "{}\n{}\n{}",
        preset_marker_begin(preset),
        normalize_memory_body(preset.content),
        preset_marker_end(preset)
    );
    if body.trim().is_empty() {
        return block;
    }
    format!("{}\n\n{}", body.trim_end(), block)
}

fn preset_marker_begin(preset: &MemoryPresetDefinition) -> String {
    format!(
        "{}{}:start -->",
        KARPATHY_MEMORY_PRESET_MARKER_BEGIN,
        memory_preset_language_code(preset.language)
    )
}

fn preset_marker_end(preset: &MemoryPresetDefinition) -> String {
    format!(
        "{}{}:end -->",
        KARPATHY_MEMORY_PRESET_MARKER_END,
        memory_preset_language_code(preset.language)
    )
}

fn memory_preset_language_code(language: MemoryPresetLanguage) -> &'static str {
    match language {
        MemoryPresetLanguage::Zh => "zh",
        MemoryPresetLanguage::En => "en",
    }
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
    if path_has_symlink_component(path) {
        return false;
    }
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
    if path_has_symlink_component(path) {
        return false;
    }
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
        ensure_memory_write_path_has_no_symlink(&path)?;
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

fn path_has_symlink_component(path: &Path) -> bool {
    memory_path_has_symlink_component(path).unwrap_or(false)
}

fn ensure_memory_write_path_has_no_symlink(path: &Path) -> Result<(), String> {
    if memory_path_has_symlink_component(path)? {
        return Err(SYMLINK_WRITE_ERROR.to_string());
    }
    Ok(())
}

fn memory_path_has_symlink_component(path: &Path) -> Result<bool, String> {
    let claude_dir = get_claude_dir_path();
    let relative_path = path
        .strip_prefix(&claude_dir)
        .map_err(|_| format!("记忆路径不在 ~/.claude 内: {:?}", path))?;
    let mut current = claude_dir;
    match fs::symlink_metadata(&current) {
        Ok(metadata) if metadata.file_type().is_symlink() => return Ok(true),
        Ok(_) => {}
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(false),
        Err(error) => return Err(format!("检查记忆路径失败 {:?}: {}", current, error)),
    }

    for component in relative_path.components() {
        current.push(component.as_os_str());
        match fs::symlink_metadata(&current) {
            Ok(metadata) if metadata.file_type().is_symlink() => return Ok(true),
            Ok(_) => {}
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(false),
            Err(error) => return Err(format!("检查记忆路径失败 {:?}: {}", current, error)),
        }
    }
    Ok(false)
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
            let cleanup_dirs = collect_empty_rule_parent_dirs_after_removing_path(&path)?;
            fs::remove_file(&path).map_err(|e| format!("删除规则文件失败 {:?}: {}", path, e))?;
            remove_empty_rule_parent_dirs(cleanup_dirs)?;
        }
    }

    Ok(())
}

fn preview_stale_rule_cleanup_dirs(
    previous: &MemoryState,
    state: &MemoryState,
) -> Result<Vec<PathBuf>, String> {
    let mut cleanup_dirs = Vec::new();

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
            cleanup_dirs.extend(collect_empty_rule_parent_dirs_after_removing_path(&path)?);
        }
    }

    Ok(collapse_redundant_child_dirs(cleanup_dirs))
}

fn collect_empty_rule_parent_dirs_after_removing_path(
    removed_path: &Path,
) -> Result<Vec<PathBuf>, String> {
    let rules_dir = get_rules_dir_path();
    let mut cleanup_dirs = Vec::new();
    let mut current = removed_path.parent().map(Path::to_path_buf);
    let mut removed_child = removed_path.to_path_buf();

    while let Some(dir) = current {
        if dir == rules_dir {
            break;
        }

        if directory_has_entries_except(&dir, &removed_child)? {
            break;
        }

        cleanup_dirs.push(dir.clone());
        removed_child = dir.clone();
        current = dir.parent().map(Path::to_path_buf);
    }

    Ok(cleanup_dirs)
}

fn directory_has_entries_except(dir: &Path, ignored_path: &Path) -> Result<bool, String> {
    let entries = fs::read_dir(dir).map_err(|e| format!("读取规则目录失败 {:?}: {}", dir, e))?;
    for entry in entries {
        let entry = entry.map_err(|e| format!("读取规则目录失败 {:?}: {}", dir, e))?;
        if entry.path() != ignored_path {
            return Ok(true);
        }
    }
    Ok(false)
}

fn remove_empty_rule_parent_dirs(cleanup_dirs: Vec<PathBuf>) -> Result<(), String> {
    for dir in cleanup_dirs {
        fs::remove_dir(&dir).map_err(|e| format!("删除空规则目录失败 {:?}: {}", dir, e))?;
    }
    Ok(())
}

fn collapse_redundant_child_dirs(mut dirs: Vec<PathBuf>) -> Vec<PathBuf> {
    dirs.sort_by(|a, b| {
        a.components()
            .count()
            .cmp(&b.components().count())
            .then_with(|| a.cmp(b))
    });
    dirs.dedup();

    let mut collapsed = Vec::new();
    for dir in dirs {
        if collapsed
            .iter()
            .any(|parent: &PathBuf| dir.starts_with(parent))
        {
            continue;
        }
        collapsed.push(dir);
    }
    collapsed
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
    let metadata = match fs::symlink_metadata(&path) {
        Ok(metadata) => metadata,
        Err(_) => return Ok(()),
    };
    if metadata.file_type().is_symlink() {
        memories.push(UnmanagedMemory {
            id: "unmanaged:claude:CLAUDE.md".to_string(),
            name: "CLAUDE.md".to_string(),
            content: String::new(),
            target_type: MemoryTargetType::Claude,
            rule_path: None,
            path_patterns: Vec::new(),
            source_path: "CLAUDE.md".to_string(),
            size: metadata.len(),
            modified_at: crate::utils::metadata_modified_secs(&metadata),
            import_status: UNMANAGED_IMPORT_UNSUPPORTED_SYMLINK.to_string(),
        });
        return Ok(());
    }

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
    let metadata = match fs::symlink_metadata(&rules_dir) {
        Ok(metadata) => metadata,
        Err(_) => return Ok(()),
    };
    if metadata.file_type().is_symlink() {
        return Ok(());
    }
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
            let path = entry.path();
            if path.extension().and_then(|ext| ext.to_str()) == Some("md") {
                let rule_path = normalize_relative_path(
                    path.strip_prefix(rules_dir)
                        .map_err(|_| "规则文件路径处理失败".to_string())?,
                );
                let metadata = fs::symlink_metadata(&path)
                    .map_err(|e| format!("获取规则软链接元数据失败 {:?}: {}", path, e))?;
                memories.push(UnmanagedMemory {
                    id: format!("unmanaged:rule:{rule_path}"),
                    name: rule_display_name(&rule_path),
                    content: String::new(),
                    target_type: MemoryTargetType::Rule,
                    rule_path: Some(rule_path.clone()),
                    path_patterns: Vec::new(),
                    source_path: format!("rules/{rule_path}"),
                    size: metadata.len(),
                    modified_at: crate::utils::metadata_modified_secs(&metadata),
                    import_status: UNMANAGED_IMPORT_UNSUPPORTED_SYMLINK.to_string(),
                });
            }
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
            if fs::symlink_metadata(&path)
                .map(|metadata| metadata.file_type().is_symlink())
                .unwrap_or(false)
            {
                return Err(SYMLINK_IMPORT_ERROR.to_string());
            }
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
    let rules_dir = get_rules_dir_path();
    if memory_path_has_symlink_component(&rules_dir)? {
        return Err(SYMLINK_IMPORT_ERROR.to_string());
    }
    let mut current = rules_dir;
    for component in Path::new(rule_path).components() {
        current.push(component.as_os_str());
        let metadata = fs::symlink_metadata(&current)
            .map_err(|_| "只能导入 ~/.claude/rules/ 内的普通 Markdown 文件".to_string())?;
        if metadata.file_type().is_symlink() {
            return Err(SYMLINK_IMPORT_ERROR.to_string());
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
        .replace('/', "-")
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
    use std::sync::MutexGuard;
    use std::time::{SystemTime, UNIX_EPOCH};

    struct TestEnv {
        _guard: MutexGuard<'static, ()>,
        _config_guard: MutexGuard<'static, ()>,
        root: PathBuf,
        previous_home: Option<String>,
        previous_app_data: Option<String>,
    }

    impl TestEnv {
        fn new(name: &str) -> Self {
            let guard = crate::utils::TEST_ENV_LOCK
                .lock()
                .unwrap_or_else(|error| error.into_inner());
            let config_guard = crate::utils::lock_config().expect("配置锁应可获取");
            let suffix = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_nanos();
            let root = env::temp_dir().join(format!(
                "code-manager-memory-{name}-{}-{suffix}",
                std::process::id()
            ));
            fs::create_dir_all(&root).expect("应可创建测试目录");

            let previous_home = env::var("CODE_MANAGER_HOME_OVERRIDE").ok();
            let previous_app_data = env::var("CODE_MANAGER_APP_DATA_DIR_OVERRIDE").ok();
            env::set_var("CODE_MANAGER_HOME_OVERRIDE", &root);
            env::set_var("CODE_MANAGER_APP_DATA_DIR_OVERRIDE", root.join("app-data"));

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
                Some(value) => env::set_var("CODE_MANAGER_HOME_OVERRIDE", value),
                None => env::remove_var("CODE_MANAGER_HOME_OVERRIDE"),
            }
            match &self.previous_app_data {
                Some(value) => env::set_var("CODE_MANAGER_APP_DATA_DIR_OVERRIDE", value),
                None => env::remove_var("CODE_MANAGER_APP_DATA_DIR_OVERRIDE"),
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

    #[cfg(unix)]
    fn create_test_symlink(src: &Path, dest: &Path) {
        std::os::unix::fs::symlink(src, dest).expect("应可创建软链接");
    }

    #[cfg(windows)]
    fn create_test_symlink(src: &Path, dest: &Path) {
        std::os::windows::fs::symlink_file(src, dest).expect("应可创建软链接");
    }

    #[cfg(unix)]
    fn create_test_dir_symlink(src: &Path, dest: &Path) {
        std::os::unix::fs::symlink(src, dest).expect("应可创建目录软链接");
    }

    #[cfg(windows)]
    fn create_test_dir_symlink(src: &Path, dest: &Path) {
        std::os::windows::fs::symlink_dir(src, dest).expect("应可创建目录软链接");
    }

    fn load_memory_json_schema() -> serde_json::Value {
        let json_schema_str = include_str!("../../src/schemas/memory.schema.json");
        serde_json::from_str(json_schema_str).expect("Memory JSON Schema 格式不合法")
    }

    #[test]
    fn memory_data_has_all_json_schema_fields() {
        let rust_schema = serde_json::to_value(schema_for!(MemoryData))
            .expect("Rust MemoryData schema 应可序列化");
        let rust_props = rust_schema["properties"]
            .as_object()
            .expect("MemoryData 应为 object 类型");
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
        let rust_schema = serde_json::to_value(schema_for!(MemoryData))
            .expect("Rust MemoryData schema 应可序列化");
        let rust_required = rust_schema["required"]
            .as_array()
            .expect("MemoryData required 应为数组");
        let json_schema = load_memory_json_schema();

        if let Some(required) = json_schema["required"].as_array() {
            for field_val in required {
                let field_name = field_val.as_str().expect("required 数组元素应为字符串");
                assert!(
                    rust_required
                        .iter()
                        .any(|required_field| required_field.as_str() == Some(field_name)),
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
    fn duplicate_memory_inserts_copy_after_original_and_keeps_it_inactive() {
        let _env = TestEnv::new("duplicate-memory");

        let state = add_memory(MemoryData {
            name: "React 规则".to_string(),
            content: "React 内容".to_string(),
            path_patterns: vec!["src/**/*.tsx".to_string()],
            ..memory_data(MemoryTargetType::Rule, Some("frontend/style.md"))
        })
        .expect("应可新增规则记忆");
        let original = state.memories[0].clone();
        toggle_memory(original.id.clone()).expect("应可启用原始规则");

        let state =
            duplicate_memory(original.id.clone(), " 副本".to_string()).expect("应可复制记忆");

        assert_eq!(state.memories.len(), 2);
        assert_eq!(state.memories[0].id, original.id);
        let duplicated = &state.memories[1];
        assert_ne!(duplicated.id, original.id);
        assert_eq!(duplicated.name, "React 规则 副本");
        assert_eq!(duplicated.content, "React 内容");
        assert_eq!(duplicated.target_type, MemoryTargetType::Rule);
        assert_eq!(
            duplicated.rule_path.as_deref(),
            Some("frontend/style-copy.md")
        );
        assert_eq!(duplicated.path_patterns, vec!["src/**/*.tsx"]);
        assert!(!duplicated.is_active);
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
    fn deleting_only_active_rule_in_nested_subdirectory_removes_empty_parent_directories() {
        let env = TestEnv::new("rule-subdirectory-cleanup");

        let rule = add_memory(MemoryData {
            content: "前端规则".to_string(),
            ..memory_data(MemoryTargetType::Rule, Some("frontend/react/style.md"))
        })
        .expect("应可新增子目录规则")
        .memories
        .into_iter()
        .next()
        .expect("应返回规则");

        toggle_memory(rule.id.clone()).expect("应可启用规则");
        let rule_file = env.rule_file("frontend/react/style.md");
        let rule_dir = rule_file
            .parent()
            .expect("规则文件应有父目录")
            .to_path_buf();
        let parent_rule_dir = rule_dir.parent().expect("规则目录应有父目录").to_path_buf();
        assert!(file_exists(&rule_file));
        assert!(rule_dir.is_dir());
        assert!(parent_rule_dir.is_dir());

        delete_memory(rule.id).expect("应可删除子目录规则");

        assert!(!file_exists(&rule_file));
        assert!(!rule_dir.exists());
        assert!(!parent_rule_dir.exists());
    }

    #[test]
    fn preview_delete_memory_returns_absolute_cleanup_dir_without_redundant_children() {
        let env = TestEnv::new("rule-delete-preview-collapse");

        let rule = add_memory(MemoryData {
            content: "前端规则".to_string(),
            ..memory_data(MemoryTargetType::Rule, Some("frontend/react/style.md"))
        })
        .expect("应可新增子目录规则")
        .memories
        .into_iter()
        .next()
        .expect("应返回规则");
        toggle_memory(rule.id.clone()).expect("应可启用规则");

        let rule_dir = env
            .rule_file("frontend/react/style.md")
            .parent()
            .expect("规则文件应有父目录")
            .to_path_buf();
        let top_deleted_dir = rule_dir.parent().expect("规则目录应有父目录").to_path_buf();

        let preview = preview_delete_memory(rule.id).expect("应可预览删除记忆");

        assert_eq!(
            preview.cleanup_dirs,
            vec![top_deleted_dir.display().to_string()]
        );
        assert!(!preview
            .cleanup_dirs
            .contains(&rule_dir.display().to_string()));
    }

    #[test]
    fn preview_delete_memory_stops_cleanup_dirs_at_non_empty_parent() {
        let env = TestEnv::new("rule-delete-preview-non-empty-parent");

        let rule = add_memory(MemoryData {
            content: "前端规则".to_string(),
            ..memory_data(MemoryTargetType::Rule, Some("frontend/react/style.md"))
        })
        .expect("应可新增子目录规则")
        .memories
        .into_iter()
        .next()
        .expect("应返回规则");
        toggle_memory(rule.id.clone()).expect("应可启用规则");

        fs::write(env.rule_file("frontend/keep.md"), "手写规则").expect("应可写入保留文件");
        let rule_dir = env
            .rule_file("frontend/react/style.md")
            .parent()
            .expect("规则文件应有父目录")
            .to_path_buf();

        let preview = preview_delete_memory(rule.id).expect("应可预览删除记忆");

        assert_eq!(preview.cleanup_dirs, vec![rule_dir.display().to_string()]);
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
        assert_eq!(rule.name, "frontend-style");
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
    fn import_unmanaged_rule_memory_uses_hyphenated_path_name_without_title() {
        let env = TestEnv::new("import-unmanaged-rule-path-name");
        fs::create_dir_all(env.rule_file("frontend/style.md").parent().unwrap())
            .expect("应可创建 rules 子目录");
        fs::write(env.rule_file("frontend/style.md"), "使用组件级样式。")
            .expect("应可写入规则文件");

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

        assert_eq!(memory.name, "frontend-style");
    }

    #[test]
    fn import_memories_from_directory_imports_claude_and_rules_inactive_without_applying() {
        let env = TestEnv::new("directory-import");
        let source_dir = env.root.join("memory-source");
        let source_rule = source_dir.join("rules").join("frontend").join("style.md");
        fs::create_dir_all(source_rule.parent().expect("规则源文件应有父目录"))
            .expect("应可创建源 rules 目录");
        fs::create_dir_all(env.claude_md().parent().unwrap()).expect("应可创建当前 .claude 目录");
        fs::write(env.claude_md(), "当前全局记忆").expect("应可写入当前 CLAUDE.md");
        fs::create_dir_all(env.rule_file("current.md").parent().unwrap())
            .expect("应可创建当前 rules 目录");
        fs::write(env.rule_file("current.md"), "当前规则").expect("应可写入当前规则");
        fs::write(source_dir.join("CLAUDE.md"), "# 导入全局\n\n导入内容")
            .expect("应可写入源 CLAUDE.md");
        fs::write(
            &source_rule,
            "---\npaths:\n  - \"src/**/*.tsx\"\n---\n\n# 前端规则\n\n使用组件级样式。",
        )
        .expect("应可写入源规则");

        let result = import_memories_from_directory(source_dir.display().to_string())
            .expect("应可从目录导入记忆");

        assert_eq!(result.imported.len(), 2);
        assert!(result.skipped.is_empty());
        let claude = result
            .state
            .memories
            .iter()
            .find(|memory| memory.name == "导入全局")
            .expect("应导入 CLAUDE.md");
        assert_eq!(claude.content, "导入内容");
        assert_eq!(claude.target_type, MemoryTargetType::Claude);
        assert!(!claude.is_active);
        let rule = result
            .state
            .memories
            .iter()
            .find(|memory| memory.rule_path.as_deref() == Some("frontend/style.md"))
            .expect("应导入嵌套 rule");
        assert_eq!(rule.name, "前端规则");
        assert_eq!(rule.content, "使用组件级样式。");
        assert_eq!(rule.path_patterns, vec!["src/**/*.tsx"]);
        assert!(!rule.is_active);
        assert_eq!(
            fs::read_to_string(env.claude_md()).expect("当前 CLAUDE.md 应保留"),
            "当前全局记忆"
        );
        assert_eq!(
            fs::read_to_string(env.rule_file("current.md")).expect("当前规则应保留"),
            "当前规则"
        );
        assert!(!env.rule_file("frontend/style.md").exists());
    }

    #[test]
    fn import_memories_from_directory_skips_duplicates_and_continues() {
        let env = TestEnv::new("directory-import-duplicates");
        add_memory(MemoryData {
            name: "已有全局".to_string(),
            content: "已有内容".to_string(),
            ..memory_data(MemoryTargetType::Claude, None)
        })
        .expect("应可创建已有 Claude 记忆");
        add_memory(MemoryData {
            name: "已有规则".to_string(),
            content: "已有规则内容".to_string(),
            ..memory_data(MemoryTargetType::Rule, Some("duplicate.md"))
        })
        .expect("应可创建已有规则记忆");
        let source_dir = env.root.join("memory-source-duplicates");
        fs::create_dir_all(source_dir.join("rules")).expect("应可创建源 rules 目录");
        fs::write(source_dir.join("CLAUDE.md"), "# 已有全局\n\n已有内容")
            .expect("应可写入重复 CLAUDE.md");
        fs::write(source_dir.join("rules").join("duplicate.md"), "重复规则")
            .expect("应可写入重复规则");
        fs::write(
            source_dir.join("rules").join("new.md"),
            "# 新规则\n\n新规则内容",
        )
        .expect("应可写入新规则");

        let result = import_memories_from_directory(source_dir.display().to_string())
            .expect("应跳过冲突并继续导入");

        assert_eq!(result.imported.len(), 1);
        assert_eq!(result.imported[0].source_path, "rules/new.md");
        assert_eq!(result.skipped.len(), 2);
        assert!(result.skipped.iter().any(|item| {
            item.source_path == "CLAUDE.md"
                && item.reason == MemoryDirectoryImportSkipReason::DuplicateClaude
        }));
        assert!(result.skipped.iter().any(|item| {
            item.source_path == "rules/duplicate.md"
                && item.reason == MemoryDirectoryImportSkipReason::DuplicateRulePath
        }));
        assert!(result
            .state
            .memories
            .iter()
            .any(|memory| memory.rule_path.as_deref() == Some("new.md") && !memory.is_active));
    }

    #[test]
    fn import_memories_from_directory_skips_symlink_files_and_directories() {
        let env = TestEnv::new("directory-import-symlinks");
        let source_dir = env.root.join("memory-source-symlinks");
        let rules_dir = source_dir.join("rules");
        let external_dir = env.root.join("external-rules");
        fs::create_dir_all(&rules_dir).expect("应可创建源 rules 目录");
        fs::create_dir_all(&external_dir).expect("应可创建外部目录");
        let external_file = env.root.join("external.md");
        fs::write(&external_file, "# 外部规则\n\n不应导入").expect("应可写入外部文件");
        fs::write(external_dir.join("nested.md"), "# 外部目录规则\n\n不应导入")
            .expect("应可写入外部目录文件");
        create_test_symlink(&external_file, &rules_dir.join("linked.md"));
        create_test_dir_symlink(&external_dir, &rules_dir.join("linked-dir"));

        let result = import_memories_from_directory(source_dir.display().to_string())
            .expect("应跳过软链接记忆");

        assert!(result.imported.is_empty());
        assert_eq!(result.skipped.len(), 2);
        assert!(result.skipped.iter().any(|item| {
            item.source_path == "rules/linked.md"
                && item.reason == MemoryDirectoryImportSkipReason::UnsupportedSymlink
        }));
        assert!(result.skipped.iter().any(|item| {
            item.source_path == "rules/linked-dir"
                && item.reason == MemoryDirectoryImportSkipReason::UnsupportedSymlink
        }));
        assert!(result.state.memories.is_empty());
    }

    #[test]
    fn import_memories_from_directory_rejects_non_directory_source() {
        let env = TestEnv::new("directory-import-non-directory");
        let source_file = env.root.join("not-a-directory.md");
        fs::write(&source_file, "# 不是目录").expect("应可写入普通文件");

        let err = import_memories_from_directory(source_file.display().to_string()).unwrap_err();

        assert!(err.contains("请选择有效目录"));
    }

    #[test]
    fn get_memories_lists_symlink_memory_files_as_unsupported_unmanaged_cards() {
        let env = TestEnv::new("unmanaged-symlink-list");
        fs::create_dir_all(env.claude_md().parent().unwrap()).expect("应可创建 .claude 目录");
        fs::create_dir_all(env.rule_file("frontend/style.md").parent().unwrap())
            .expect("应可创建 rules 子目录");
        let claude_target = env.root.join("external-claude.md");
        let rule_target = env.root.join("external-rule.md");
        fs::write(&claude_target, "# 外部全局记忆\n\n具体偏好").expect("应可写入目标文件");
        fs::write(&rule_target, "# 外部规则\n\n规则内容").expect("应可写入目标文件");
        create_test_symlink(&claude_target, &env.claude_md());
        create_test_symlink(&rule_target, &env.rule_file("frontend/style.md"));

        let state = get_memories().expect("应可读取记忆视图");

        let claude = state
            .unmanaged_memories
            .iter()
            .find(|memory| memory.source_path == "CLAUDE.md")
            .expect("应列出软链接 CLAUDE.md");
        assert_eq!(claude.name, "CLAUDE.md");
        assert_eq!(claude.content, "");
        assert_eq!(claude.import_status, "unsupportedSymlink");

        let rule = state
            .unmanaged_memories
            .iter()
            .find(|memory| memory.source_path == "rules/frontend/style.md")
            .expect("应列出软链接 rule");
        assert_eq!(rule.name, "frontend-style");
        assert_eq!(rule.content, "");
        assert_eq!(rule.import_status, "unsupportedSymlink");
    }

    #[test]
    fn import_unmanaged_memory_rejects_symlink_files() {
        let env = TestEnv::new("import-symlink-rejects");
        fs::create_dir_all(env.claude_md().parent().unwrap()).expect("应可创建 .claude 目录");
        fs::create_dir_all(env.rule_file("frontend/style.md").parent().unwrap())
            .expect("应可创建 rules 子目录");
        let claude_target = env.root.join("external-claude.md");
        let rule_target = env.root.join("external-rule.md");
        fs::write(&claude_target, "# 外部全局记忆\n\n具体偏好").expect("应可写入目标文件");
        fs::write(&rule_target, "# 外部规则\n\n规则内容").expect("应可写入目标文件");
        create_test_symlink(&claude_target, &env.claude_md());
        create_test_symlink(&rule_target, &env.rule_file("frontend/style.md"));

        let claude_err = import_unmanaged_memory(UnmanagedMemorySource {
            target_type: MemoryTargetType::Claude,
            rule_path: None,
        })
        .unwrap_err();
        assert!(claude_err.contains("软链接记忆文件不支持导入"));

        let rule_err = import_unmanaged_memory(UnmanagedMemorySource {
            target_type: MemoryTargetType::Rule,
            rule_path: Some("frontend/style.md".to_string()),
        })
        .unwrap_err();
        assert!(rule_err.contains("软链接记忆文件不支持导入"));
    }

    #[test]
    fn get_memories_does_not_follow_symlink_rules_directory() {
        let env = TestEnv::new("unmanaged-symlink-rules-dir");
        let rules_target = env.root.join("external-rules");
        fs::create_dir_all(&rules_target).expect("应可创建目标 rules 目录");
        fs::create_dir_all(env.rule_file("placeholder.md").parent().unwrap())
            .expect("应可创建 .claude 目录");
        fs::remove_dir(env.root.join(".claude").join("rules")).expect("应可移除普通 rules 目录");
        fs::write(rules_target.join("style.md"), "# 外部规则\n\n规则内容")
            .expect("应可写入目标规则");
        create_test_symlink(&rules_target, &env.root.join(".claude").join("rules"));

        let state = get_memories().expect("应可读取记忆视图");

        assert!(state
            .unmanaged_memories
            .iter()
            .all(|memory| memory.source_path != "rules/style.md"));
    }

    #[test]
    fn import_unmanaged_rule_memory_rejects_symlink_parent_directory() {
        let env = TestEnv::new("import-symlink-parent-rejects");
        let rules_target = env.root.join("external-rules");
        fs::create_dir_all(&rules_target).expect("应可创建目标 rules 目录");
        fs::create_dir_all(env.rule_file("placeholder.md").parent().unwrap())
            .expect("应可创建 .claude 目录");
        fs::remove_dir(env.root.join(".claude").join("rules")).expect("应可移除普通 rules 目录");
        fs::write(rules_target.join("style.md"), "# 外部规则\n\n规则内容")
            .expect("应可写入目标规则");
        create_test_symlink(&rules_target, &env.root.join(".claude").join("rules"));

        let err = import_unmanaged_memory(UnmanagedMemorySource {
            target_type: MemoryTargetType::Rule,
            rule_path: Some("style.md".to_string()),
        })
        .unwrap_err();

        assert!(err.contains("软链接记忆文件不支持导入"));
    }

    #[test]
    fn activating_rule_memory_rejects_symlink_parent_directory() {
        let env = TestEnv::new("activate-symlink-parent-rejects");
        let rules_target = env.root.join("external-rules");
        fs::create_dir_all(&rules_target).expect("应可创建目标 rules 目录");
        fs::create_dir_all(env.rule_file("placeholder.md").parent().unwrap())
            .expect("应可创建 .claude 目录");
        fs::remove_dir(env.root.join(".claude").join("rules")).expect("应可移除普通 rules 目录");
        create_test_symlink(&rules_target, &env.root.join(".claude").join("rules"));
        let state = add_memory(memory_data(MemoryTargetType::Rule, Some("style.md")))
            .expect("应可新增规则记忆");
        let memory_id = state.memories[0].id.clone();

        let err = toggle_memory(memory_id).unwrap_err();

        assert!(err.contains("软链接记忆路径不支持写入"));
        assert!(!rules_target.join("style.md").exists());
    }

    #[test]
    fn activating_memory_rejects_symlink_write_path() {
        let env = TestEnv::new("activate-symlink-rejects");
        fs::create_dir_all(env.claude_md().parent().unwrap()).expect("应可创建 .claude 目录");
        let target = env.root.join("external-claude.md");
        fs::write(&target, "外部内容").expect("应可写入目标文件");
        create_test_symlink(&target, &env.claude_md());
        let state = add_memory(memory_data(MemoryTargetType::Claude, None)).expect("应可新增记忆");
        let memory_id = state.memories[0].id.clone();

        let err = toggle_memory(memory_id).unwrap_err();

        assert!(err.contains("软链接记忆路径不支持写入"));
        assert_eq!(
            fs::read_to_string(&target).expect("软链接目标应保留"),
            "外部内容"
        );
    }

    #[test]
    fn deleting_active_rule_memory_keeps_symlink_file() {
        let env = TestEnv::new("delete-symlink-keeps-link");
        fs::create_dir_all(env.rule_file("linked.md").parent().unwrap())
            .expect("应可创建 rules 目录");
        let now = crate::utils::current_timestamp();
        let memory = Memory {
            id: "linked-rule".to_string(),
            name: "记忆".to_string(),
            content: "内容".to_string(),
            target_type: MemoryTargetType::Rule,
            rule_path: Some("linked.md".to_string()),
            path_patterns: Vec::new(),
            is_active: true,
            created_at: now,
            updated_at: now,
        };
        let target = env.root.join("external-rule.md");
        fs::write(&target, serialize_rule_memory(&memory)).expect("应可写入目标文件");
        create_test_symlink(&target, &env.rule_file("linked.md"));
        save_memory_state(&MemoryState {
            version: CURRENT_MEMORY_STATE_VERSION,
            memories: vec![memory],
            unmanaged_memories: Vec::new(),
        })
        .expect("应可保存测试状态");

        delete_memory("linked-rule".to_string()).expect("应可删除记忆");

        let metadata = fs::symlink_metadata(env.rule_file("linked.md")).expect("软链接应保留");
        assert!(metadata.file_type().is_symlink());
        assert_eq!(
            fs::read_to_string(&target).expect("软链接目标应保留"),
            "# 记忆\n\n内容"
        );
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

    #[test]
    fn applying_preset_creates_and_activates_claude_memory() {
        let env = TestEnv::new("preset-create-claude");

        let result = apply_memory_preset(MemoryPresetApplyInput {
            preset_id: KARPATHY_MEMORY_PRESET_ID.to_string(),
            language: MemoryPresetLanguage::Zh,
            action: MemoryPresetAction::CreateClaude,
        })
        .expect("应可应用中文主记忆预设");

        assert_eq!(result.outcome, MemoryPresetApplyOutcome::CreatedClaude);
        let memory = result
            .state
            .memories
            .iter()
            .find(|memory| memory.id == result.memory_id)
            .expect("应返回创建的记忆");
        assert!(memory.is_active);
        assert_eq!(memory.target_type, MemoryTargetType::Claude);
        assert!(memory.content.contains("编码前先思考"));
        assert!(memory
            .content
            .contains("karpathy-behavior-guidelines:zh:start"));
        assert_eq!(
            fs::read_to_string(env.claude_md()).expect("应写入 CLAUDE.md"),
            serialize_claude_memory(memory)
        );
    }

    #[test]
    fn applying_preset_reuses_existing_claude_memory_and_enforces_single_active() {
        let env = TestEnv::new("preset-reuse-claude");
        let existing = add_memory(MemoryData {
            name: "Karpathy Behavioral Guidelines".to_string(),
            content: KARPATHY_MEMORY_PRESET_EN_CONTENT.to_string(),
            ..memory_data(MemoryTargetType::Claude, None)
        })
        .expect("应可新增未启用英文预设记忆")
        .memories
        .into_iter()
        .next()
        .expect("应返回未启用记忆");

        let result = apply_memory_preset(MemoryPresetApplyInput {
            preset_id: KARPATHY_MEMORY_PRESET_ID.to_string(),
            language: MemoryPresetLanguage::En,
            action: MemoryPresetAction::CreateClaude,
        })
        .expect("无当前主记忆时应可启用已有英文预设记忆");

        assert_eq!(result.outcome, MemoryPresetApplyOutcome::ActivatedExisting);
        assert_eq!(result.memory_id, existing.id);
        assert_eq!(
            result
                .state
                .memories
                .iter()
                .filter(|memory| memory.target_type == MemoryTargetType::Claude)
                .count(),
            1
        );
        assert!(result.state.memories.iter().any(|memory| {
            memory.id == existing.id
                && memory.is_active
                && memory.content.contains("Think Before Coding")
        }));
        assert!(fs::read_to_string(env.claude_md())
            .expect("应写入 CLAUDE.md")
            .contains("Think Before Coding"));
    }

    #[test]
    fn applying_preset_rejects_when_active_claude_memory_exists() {
        let _env = TestEnv::new("preset-active-claude-exists");
        let base = add_memory(MemoryData {
            name: "团队主记忆".to_string(),
            content: "保留团队规则".to_string(),
            ..memory_data(MemoryTargetType::Claude, None)
        })
        .expect("应可新增团队主记忆")
        .memories
        .into_iter()
        .next()
        .expect("应返回团队主记忆");
        toggle_memory(base.id.clone()).expect("应可启用团队主记忆");

        let error = apply_memory_preset(MemoryPresetApplyInput {
            preset_id: KARPATHY_MEMORY_PRESET_ID.to_string(),
            language: MemoryPresetLanguage::Zh,
            action: MemoryPresetAction::CreateClaude,
        })
        .expect_err("已有主记忆时不应允许列表页一键导入");

        assert!(error.contains("已有主记忆"));
    }

    #[test]
    fn applying_preset_rejects_when_unmanaged_claude_exists() {
        let env = TestEnv::new("preset-unmanaged-claude-exists");
        fs::create_dir_all(env.claude_md().parent().unwrap()).expect("应可创建 .claude 目录");
        fs::write(env.claude_md(), "# 手写主记忆\n\n已有规则").expect("应可写入未托管主记忆");

        let error = apply_memory_preset(MemoryPresetApplyInput {
            preset_id: KARPATHY_MEMORY_PRESET_ID.to_string(),
            language: MemoryPresetLanguage::En,
            action: MemoryPresetAction::CreateClaude,
        })
        .expect_err("未托管 CLAUDE.md 存在时不应允许列表页一键导入");

        assert!(error.contains("已有主记忆"));
    }

    #[test]
    fn applying_preset_content_returns_language_specific_marked_block() {
        let _env = TestEnv::new("preset-content");

        let zh = get_memory_preset_content(MemoryPresetContentInput {
            preset_id: KARPATHY_MEMORY_PRESET_ID.to_string(),
            language: MemoryPresetLanguage::Zh,
        })
        .expect("应可获取中文预设内容");
        let en = get_memory_preset_content(MemoryPresetContentInput {
            preset_id: KARPATHY_MEMORY_PRESET_ID.to_string(),
            language: MemoryPresetLanguage::En,
        })
        .expect("应可获取英文预设内容");

        assert_eq!(zh.name, "Karpathy 行为指南");
        assert_eq!(en.name, "Karpathy Behavioral Guidelines");
        assert!(zh.content.contains("karpathy-behavior-guidelines:zh:start"));
        assert!(zh.content.contains("编码前先思考"));
        assert!(en.content.contains("karpathy-behavior-guidelines:en:start"));
        assert!(en.content.contains("Think Before Coding"));
    }
}
