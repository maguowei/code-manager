use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Component, Path, PathBuf};
use uuid::Uuid;

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
    crate::utils::read_json_file(&path)
}

/// 将记忆状态序列化并写入文件
pub fn save_memory_state(state: &MemoryState) -> Result<(), String> {
    crate::utils::save_json_file(&get_memory_config_path(), state)
}

/// 将活跃记忆应用到用户级 CLAUDE.md 和 rules 目录。
pub fn apply_memories(previous: Option<&MemoryState>, state: &MemoryState) -> Result<(), String> {
    validate_rule_file_conflicts(previous, state)?;

    let claude_content = state
        .memories
        .iter()
        .find(|memory| memory.is_active && memory.target_type == MemoryTargetType::Claude)
        .map(|memory| memory.content.as_str())
        .unwrap_or("");
    crate::utils::ensure_dir_and_write(&get_claude_md_path(), claude_content)?;

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
        crate::utils::ensure_dir_and_write(&path, &memory.content)?;
    }

    Ok(())
}

#[tauri::command]
pub fn get_memories() -> Result<MemoryState, String> {
    Ok(load_memory_state())
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
            is_active: false,
            created_at: now,
            updated_at: now,
        };

        let previous = state.clone();
        state.memories.push(memory);
        save_and_apply_memories(&previous, &state)?;

        Ok(state)
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
            memory.updated_at = now;
        }

        enforce_single_active_claude(&mut state, &id, now);
        save_and_apply_memories(&previous, &state)?;

        Ok(state)
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

        Ok(state)
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

        Ok(state)
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

#[derive(Debug, Clone)]
struct NormalizedMemoryData {
    name: String,
    content: String,
    target_type: MemoryTargetType,
    rule_path: Option<String>,
}

fn normalize_memory_data(data: MemoryData) -> Result<NormalizedMemoryData, String> {
    let name = data.name.trim().to_string();
    if name.is_empty() {
        return Err("记忆名称不能为空".to_string());
    }

    let rule_path = match data.target_type {
        MemoryTargetType::Claude => None,
        MemoryTargetType::Rule => {
            let raw_path = data
                .rule_path
                .as_deref()
                .map(str::trim)
                .filter(|path| !path.is_empty())
                .ok_or("规则记忆必须填写规则文件路径")?;
            validate_rule_path(raw_path)?;
            Some(raw_path.to_string())
        }
    };

    Ok(NormalizedMemoryData {
        name,
        content: data.content,
        target_type: data.target_type,
        rule_path,
    })
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

fn save_and_apply_memories(previous: &MemoryState, state: &MemoryState) -> Result<(), String> {
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
        if path.exists() {
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
            "第二段全局记忆"
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
            "工作流规则"
        );
        assert_eq!(
            fs::read_to_string(env.rule_file("frontend/style.md")).expect("应写入 style.md"),
            "前端规则"
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
            },
        )
        .expect("应可更新启用规则路径");

        assert!(!file_exists(&env.rule_file("old.md")));
        assert_eq!(
            fs::read_to_string(env.rule_file("nested/new.md")).expect("应写入新规则文件"),
            "新规则内容"
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
}
