use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

/// Skill 元数据，对应 ~/.claude/skills/<id>/ 目录
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Skill {
    pub id: String,          // 目录名（唯一标识，也是 /slash-command 名称）
    pub name: String,        // frontmatter name 字段（缺省用 id）
    pub description: String, // frontmatter description
    pub content: String,     // SKILL.md markdown 正文
    pub disable_model_invocation: bool,
    pub user_invocable: bool,
    pub is_active: bool, // true = ~/.claude/skills/，false = skills-disabled/
    pub created_at: u64,
    pub updated_at: u64,
}

/// 支持文件（SKILL.md 以外的文件）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillFile {
    pub name: String, // 相对于 Skill 目录的路径，如 "examples.md"
    pub content: String,
    pub is_binary: bool, // 是否为二进制文件（无法以 UTF-8 读取）
}

/// 新增/更新 Skill 的数据传输对象
#[derive(Debug, Clone, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
#[serde(deny_unknown_fields)]
pub struct SkillData {
    #[schemars(length(min = 1), regex(pattern = "^[a-z0-9-]+$"))]
    pub id: String,
    pub name: String,
    pub description: String,
    pub content: String,
    pub disable_model_invocation: bool,
    pub user_invocable: bool,
}

/// 新增/更新 Skill 支持文件的数据传输对象
#[derive(Debug, Clone, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
#[serde(deny_unknown_fields)]
pub struct SkillFileData {
    #[schemars(length(min = 1))]
    pub file_name: String,
    pub content: String,
}

/// 获取启用 Skills 的根目录：~/.claude/skills/
fn get_skills_dir() -> PathBuf {
    crate::utils::home_dir_or_fallback()
        .join(".claude")
        .join("skills")
}

/// 获取禁用 Skills 的根目录：~/.config/ai-manager/skills-disabled/
fn get_disabled_dir() -> PathBuf {
    crate::utils::get_app_data_dir().join("skills-disabled")
}

/// 根据 is_active 获取 Skill 目录路径
fn get_skill_path(id: &str, is_active: bool) -> PathBuf {
    if is_active {
        get_skills_dir().join(id)
    } else {
        get_disabled_dir().join(id)
    }
}

/// 获取 SKILL.md 文件路径
fn get_skill_md_path(id: &str, is_active: bool) -> PathBuf {
    get_skill_path(id, is_active).join("SKILL.md")
}

/// 从文件系统元数据获取 (created_at, updated_at) 时间戳（秒）
fn get_file_times(path: &std::path::Path) -> (u64, u64) {
    let meta = match fs::metadata(path) {
        Ok(m) => m,
        Err(_) => return (0, 0),
    };
    let created = meta
        .created()
        .ok()
        .map(crate::utils::systime_to_secs)
        .unwrap_or(0);
    let modified = crate::utils::metadata_modified_secs(&meta);
    (created, modified)
}

/// 当 name 为空时降级使用 id 作为显示名称
fn resolve_display_name(name: &str, id: &str) -> String {
    if name.is_empty() {
        id.to_string()
    } else {
        name.to_string()
    }
}

/// 解析 SKILL.md 内容，返回 (name, description, disable_model_invocation, user_invocable, content)
fn parse_skill_md(raw: &str) -> (String, String, bool, bool, String) {
    if !raw.starts_with("---\n") && !raw.starts_with("---\r\n") {
        return (String::new(), String::new(), false, true, raw.to_string());
    }

    let mut end_pos = 0;
    let mut found_end = false;
    let prefix_len = if raw.starts_with("---\r\n") { 5 } else { 4 };
    let rest = &raw[prefix_len..];

    let mut search_idx = 0;
    while let Some(idx) = rest[search_idx..].find("\n---") {
        let abs_idx = search_idx + idx;
        let suffix = &rest[abs_idx + 4..];
        if suffix.is_empty() {
            found_end = true;
            end_pos = prefix_len + abs_idx;
            search_idx = abs_idx + 4; // Index after "\n---"
            break;
        } else if suffix.starts_with("\n") {
            found_end = true;
            end_pos = prefix_len + abs_idx;
            search_idx = abs_idx + 5; // Index after "\n---\n"
            break;
        } else if suffix.starts_with("\r\n") {
            found_end = true;
            end_pos = prefix_len + abs_idx;
            search_idx = abs_idx + 6; // Index after "\n---\r\n"
            break;
        } else {
            // Not a delimiter, skip past the "\n"
            search_idx = abs_idx + 1;
        }
    }

    if !found_end {
        return (String::new(), String::new(), false, true, raw.to_string());
    }

    let fm_str = &raw[prefix_len..end_pos];
    let body = raw[prefix_len + search_idx..].trim_start().to_string();

    let mut name = String::new();
    let mut description = String::new();
    let mut disable_model_invocation = false;
    let mut user_invocable = true;

    for line in fm_str.lines() {
        if let Some((key, val)) = line.split_once(':') {
            let val = val.trim();
            let unescaped_val = if val.starts_with('"') && val.ends_with('"') && val.len() >= 2 {
                match serde_json::from_str::<String>(val) {
                    Ok(s) => s,
                    Err(_) => val.trim_matches('"').to_string(),
                }
            } else {
                val.to_string()
            };

            match key.trim() {
                "name" => name = unescaped_val,
                "description" => description = unescaped_val,
                "disable-model-invocation" => disable_model_invocation = unescaped_val == "true",
                "user-invocable" => user_invocable = unescaped_val != "false",
                _ => {}
            }
        }
    }

    (
        name,
        description,
        disable_model_invocation,
        user_invocable,
        body,
    )
}

/// 将字段序列化为 SKILL.md 文本
fn serialize_skill_md(
    name: &str,
    description: &str,
    disable_model_invocation: bool,
    user_invocable: bool,
    content: &str,
) -> String {
    let name_escaped = serde_json::to_string(name).unwrap_or_else(|_| format!("\"{}\"", name));
    let desc_escaped =
        serde_json::to_string(description).unwrap_or_else(|_| format!("\"{}\"", description));

    format!(
        "---\nname: {}\ndescription: {}\ndisable-model-invocation: {}\nuser-invocable: {}\n---\n\n{}",
        name_escaped, desc_escaped, disable_model_invocation, user_invocable, content
    )
}

/// 从指定目录扫描 Skills，返回 Skill 列表
fn scan_skills_dir(dir: &std::path::Path, is_active: bool) -> Vec<Skill> {
    let entries = match fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return vec![],
    };

    let mut skills = vec![];
    for entry in entries.flatten() {
        // 使用 file_type() 而非 is_dir()，避免跟随符号链接导致路径逃逸
        let file_type = match entry.file_type() {
            Ok(ft) => ft,
            Err(_) => continue,
        };
        if file_type.is_symlink() || !file_type.is_dir() {
            continue;
        }
        let path = entry.path();
        let id = match path.file_name().and_then(|n| n.to_str()) {
            Some(n) => n.to_string(),
            None => continue,
        };
        let skill_md = path.join("SKILL.md");
        let raw = match fs::read_to_string(&skill_md) {
            Ok(c) => c,
            Err(_) => continue,
        };
        let (name, description, disable_model_invocation, user_invocable, content) =
            parse_skill_md(&raw);
        let (created_at, updated_at) = get_file_times(&skill_md);

        skills.push(Skill {
            name: resolve_display_name(&name, &id),
            id,
            description,
            content,
            disable_model_invocation,
            user_invocable,
            is_active,
            created_at,
            updated_at,
        });
    }

    // 按 id 字典序排序
    skills.sort_by(|a, b| a.id.cmp(&b.id));
    skills
}

/// 获取所有 Skills（启用 + 禁用）
#[tauri::command]
pub fn get_skills() -> Result<Vec<Skill>, String> {
    let mut skills = scan_skills_dir(&get_skills_dir(), true);
    let mut disabled = scan_skills_dir(&get_disabled_dir(), false);
    skills.append(&mut disabled);
    Ok(skills)
}

/// 切换 Skill 的启用/禁用状态（通过移动目录实现）
#[tauri::command]
pub fn toggle_skill(id: String, is_active: bool) -> Result<Skill, String> {
    let result = (|| {
        let _lock = crate::utils::lock_skills()?;

        let src = get_skill_path(&id, is_active);
        let dst_root = if is_active {
            get_disabled_dir()
        } else {
            get_skills_dir()
        };
        let dst = dst_root.join(&id);

        // 确保目标根目录存在
        fs::create_dir_all(&dst_root).map_err(|e| format!("创建目录失败: {}", e))?;

        // 移动目录
        fs::rename(&src, &dst).map_err(|e| format!("移动 Skill 目录失败: {}", e))?;

        // 读取新位置的 SKILL.md 并返回更新后的 Skill
        let new_is_active = !is_active;
        let skill_md = dst.join("SKILL.md");
        let raw =
            fs::read_to_string(&skill_md).map_err(|e| format!("读取 SKILL.md 失败: {}", e))?;
        let (name, description, disable_model_invocation, user_invocable, content) =
            parse_skill_md(&raw);
        let (created_at, updated_at) = get_file_times(&skill_md);

        Ok(Skill {
            name: resolve_display_name(&name, &id),
            id,
            description,
            content,
            disable_model_invocation,
            user_invocable,
            is_active: new_is_active,
            created_at,
            updated_at,
        })
    })();
    crate::logging::log_command_result("skill.toggle", &result, |skill| {
        format!("skill_id={} active={}", skill.id, skill.is_active)
    });
    result
}

/// 验证 Skill id（目录名）：仅允许小写字母、数字、连字符
fn validate_skill_id(id: &str) -> Result<(), String> {
    if id.is_empty() {
        return Err("Skill 名称不能为空".to_string());
    }
    if !id
        .chars()
        .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
    {
        return Err("Skill 名称只能包含小写字母、数字和连字符".to_string());
    }
    Ok(())
}

#[tauri::command]
pub fn add_skill(data: SkillData) -> Result<Skill, String> {
    let result = (|| {
        let _lock = crate::utils::lock_skills()?;
        let SkillData {
            id,
            name,
            description,
            content,
            disable_model_invocation,
            user_invocable,
        } = data;

        validate_skill_id(&id)?;

        let skill_dir = get_skills_dir().join(&id);
        if skill_dir.exists() {
            return Err(format!("Skill '{}' 已存在", id));
        }

        // 检查禁用目录中是否已有同名
        if get_disabled_dir().join(&id).exists() {
            return Err(format!("Skill '{}' 已存在（已禁用）", id));
        }

        let display_name = resolve_display_name(&name, &id);
        let raw = serialize_skill_md(
            &display_name,
            &description,
            disable_model_invocation,
            user_invocable,
            &content,
        );
        let skill_md = skill_dir.join("SKILL.md");
        crate::utils::ensure_dir_and_write(&skill_md, &raw)?;

        let (created_at, updated_at) = get_file_times(&skill_md);

        Ok(Skill {
            id,
            name: display_name,
            description,
            content,
            disable_model_invocation,
            user_invocable,
            is_active: true,
            created_at,
            updated_at,
        })
    })();
    crate::logging::log_command_result("skill.add", &result, |skill| {
        format!("skill_id={}", skill.id)
    });
    result
}

#[tauri::command]
pub fn update_skill(id: String, is_active: bool, data: SkillData) -> Result<Skill, String> {
    let result = (|| {
        ensure_matching_skill_id(&id, &data)?;

        let _lock = crate::utils::lock_skills()?;
        let SkillData {
            id,
            name,
            description,
            content,
            disable_model_invocation,
            user_invocable,
        } = data;

        let skill_md = get_skill_md_path(&id, is_active);
        let display_name = resolve_display_name(&name, &id);
        let raw = serialize_skill_md(
            &display_name,
            &description,
            disable_model_invocation,
            user_invocable,
            &content,
        );
        crate::utils::ensure_dir_and_write(&skill_md, &raw)
            .map_err(|e| format!("Skill '{}' 不存在或写入失败: {}", id, e))?;

        let (created_at, updated_at) = get_file_times(&skill_md);

        Ok(Skill {
            id,
            name: display_name,
            description,
            content,
            disable_model_invocation,
            user_invocable,
            is_active,
            created_at,
            updated_at,
        })
    })();
    crate::logging::log_command_result("skill.update", &result, |skill| {
        format!("skill_id={} active={}", skill.id, skill.is_active)
    });
    result
}

#[tauri::command]
pub fn delete_skill(id: String, is_active: bool) -> Result<(), String> {
    let result = (|| {
        let _lock = crate::utils::lock_skills()?;

        let skill_dir = get_skill_path(&id, is_active);
        if !skill_dir.exists() {
            return Err(format!("Skill '{}' 不存在", id));
        }

        fs::remove_dir_all(&skill_dir).map_err(|e| format!("删除 Skill 目录失败: {}", e))?;

        Ok(())
    })();
    crate::logging::log_command_result("skill.delete", &result, |_| {
        format!("skill_id={id} active={is_active}")
    });
    result
}

/// 验证支持文件路径：不允许 ".." 和绝对路径
fn validate_file_name(name: &str) -> Result<(), String> {
    if name.is_empty() {
        return Err("文件名不能为空".to_string());
    }
    let path = std::path::Path::new(name);
    if path.is_absolute() {
        return Err("文件名不能是绝对路径".to_string());
    }
    for component in path.components() {
        if matches!(component, std::path::Component::ParentDir) {
            return Err("文件名不能包含 '..'".to_string());
        }
    }
    Ok(())
}

#[tauri::command]
pub fn get_skill_files(id: String, is_active: bool) -> Result<Vec<SkillFile>, String> {
    let skill_dir = get_skill_path(&id, is_active);
    if !skill_dir.exists() {
        return Err(format!("Skill '{}' 不存在", id));
    }

    let mut files = vec![];
    collect_files(&skill_dir, &skill_dir, &mut files)?;

    Ok(files)
}

/// 递归收集目录下除 SKILL.md 外的所有文件
fn collect_files(
    base: &std::path::Path,
    current: &std::path::Path,
    files: &mut Vec<SkillFile>,
) -> Result<(), String> {
    let entries = fs::read_dir(current).map_err(|e| format!("读取目录失败: {}", e))?;

    for entry in entries.flatten() {
        let path = entry.path();
        let file_type = entry
            .file_type()
            .map_err(|e| format!("获取文件类型失败: {}", e))?;
        if file_type.is_symlink() {
            continue; // 拒绝遍历符号链接，防止路径逃逸
        }
        if file_type.is_dir() {
            collect_files(base, &path, files)?;
        } else {
            // 跳过 SKILL.md
            let rel = path.strip_prefix(base).map_err(|e| e.to_string())?;
            if rel == std::path::Path::new("SKILL.md") {
                continue;
            }
            let name = rel.to_string_lossy().to_string();
            let raw = fs::read(&path).unwrap_or_default();
            let (content, is_binary) = match String::from_utf8(raw) {
                Ok(s) => (s, false),
                Err(_) => (String::new(), true),
            };
            files.push(SkillFile {
                name,
                content,
                is_binary,
            });
        }
    }

    Ok(())
}

#[tauri::command]
pub fn add_skill_file(
    id: String,
    is_active: bool,
    data: SkillFileData,
) -> Result<SkillFile, String> {
    let result = (|| {
        let _lock = crate::utils::lock_skills()?;
        let SkillFileData { file_name, content } = data;

        validate_file_name(&file_name)?;

        let file_path = get_skill_path(&id, is_active).join(&file_name);
        if file_path.exists() {
            return Err(format!("文件 '{}' 已存在", file_name));
        }

        crate::utils::ensure_dir_and_write(&file_path, &content)?;

        Ok(SkillFile {
            name: file_name,
            content,
            is_binary: false,
        })
    })();
    crate::logging::log_command_result("skill.file.add", &result, |file| {
        format!("skill_id={id} file_name={}", file.name)
    });
    result
}

#[tauri::command]
pub fn update_skill_file(
    id: String,
    is_active: bool,
    file_name: String,
    data: SkillFileData,
) -> Result<SkillFile, String> {
    let result = (|| {
        ensure_matching_skill_file_name(&file_name, &data)?;

        let _lock = crate::utils::lock_skills()?;
        let SkillFileData { file_name, content } = data;

        validate_file_name(&file_name)?;

        let file_path = get_skill_path(&id, is_active).join(&file_name);
        crate::utils::ensure_dir_and_write(&file_path, &content)?;

        Ok(SkillFile {
            name: file_name,
            content,
            is_binary: false,
        })
    })();
    crate::logging::log_command_result("skill.file.update", &result, |file| {
        format!("skill_id={id} file_name={}", file.name)
    });
    result
}

#[tauri::command]
pub fn delete_skill_file(id: String, is_active: bool, file_name: String) -> Result<(), String> {
    let result = (|| {
        let _lock = crate::utils::lock_skills()?;

        validate_file_name(&file_name)?;

        let file_path = get_skill_path(&id, is_active).join(&file_name);
        fs::remove_file(&file_path)
            .map_err(|e| format!("删除文件失败（文件可能不存在）: {}", e))?;

        // 若父目录（非 skill 根目录）为空，则删除父目录
        if let Some(parent) = file_path.parent() {
            let skill_root = get_skill_path(&id, is_active);
            if parent != skill_root {
                if let Ok(mut entries) = fs::read_dir(parent) {
                    if entries.next().is_none() {
                        let _ = fs::remove_dir(parent);
                    }
                }
            }
        }

        Ok(())
    })();
    crate::logging::log_command_result("skill.file.delete", &result, |_| {
        format!("skill_id={id} file_name={file_name}")
    });
    result
}

#[tauri::command]
pub fn sync_skill_to_codex(id: String, is_active: bool) -> Result<(), String> {
    let result = (|| {
        let _lock = crate::utils::lock_skills()?;

        let src = get_skill_path(&id, is_active);
        if !src.exists() {
            return Err(format!("Skill '{}' 不存在", id));
        }

        let codex_skills_dir = crate::utils::home_dir_or_fallback()
            .join(".codex")
            .join("skills");

        fs::create_dir_all(&codex_skills_dir)
            .map_err(|e| format!("创建 ~/.codex/skills 目录失败: {}", e))?;

        let dest = codex_skills_dir.join(&id);

        // 检查目标路径状态，一次 lstat 系统调用覆盖所有情况（含悬空软链接）
        match fs::symlink_metadata(&dest) {
            Ok(meta) if meta.is_symlink() => {
                fs::remove_file(&dest).map_err(|e| format!("删除旧的软链接失败: {}", e))?;
            }
            Ok(_) => {
                return Err(format!("目标路径已存在且不是软链接，无法覆盖: {:?}", dest));
            }
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
                // 目标不存在，正常继续
            }
            Err(e) => {
                return Err(format!("获取目标元数据失败: {}", e));
            }
        }

        #[cfg(unix)]
        std::os::unix::fs::symlink(&src, &dest).map_err(|e| format!("创建软链接失败: {}", e))?;

        #[cfg(windows)]
        std::os::windows::fs::symlink_dir(&src, &dest)
            .map_err(|e| format!("创建软链接失败: {}", e))?;

        Ok(())
    })();
    crate::logging::log_command_result("skill.sync_codex", &result, |_| {
        format!("skill_id={id} active={is_active}")
    });
    result
}

fn ensure_matching_skill_id(expected_id: &str, data: &SkillData) -> Result<(), String> {
    if data.id != expected_id {
        return Err("Skill id 与请求路径不一致".to_string());
    }
    Ok(())
}

fn ensure_matching_skill_file_name(
    expected_file_name: &str,
    data: &SkillFileData,
) -> Result<(), String> {
    if data.file_name != expected_file_name {
        return Err("文件名与请求路径不一致".to_string());
    }
    Ok(())
}

#[cfg(test)]
mod schema_tests {
    use super::*;
    use schemars::schema_for;
    use serde_json::json;

    fn load_skill_json_schema() -> serde_json::Value {
        let json_schema_str = include_str!("../../src/schemas/skill.schema.json");
        serde_json::from_str(json_schema_str).expect("Skill JSON Schema 格式不合法")
    }

    fn load_skill_file_json_schema() -> serde_json::Value {
        let json_schema_str = include_str!("../../src/schemas/skill-file.schema.json");
        serde_json::from_str(json_schema_str).expect("SkillFile JSON Schema 格式不合法")
    }

    #[test]
    fn skill_data_has_all_json_schema_fields() {
        let rust_schema = schema_for!(SkillData);
        let rust_props = rust_schema
            .schema
            .object
            .as_ref()
            .expect("SkillData 应为 object 类型")
            .properties
            .clone();
        let json_schema = load_skill_json_schema();

        if let Some(props) = json_schema["properties"].as_object() {
            for field_name in props.keys() {
                assert!(
                    rust_props.contains_key(field_name.as_str()),
                    "Skill JSON Schema 字段 '{}' 在 Rust SkillData 中未找到",
                    field_name
                );
            }
        }
    }

    #[test]
    fn skill_json_schema_required_fields_match_rust_schema() {
        let rust_schema = schema_for!(SkillData);
        let rust_required = rust_schema
            .schema
            .object
            .as_ref()
            .expect("SkillData 应为 object 类型")
            .required
            .clone();
        let json_schema = load_skill_json_schema();

        if let Some(required) = json_schema["required"].as_array() {
            for field_val in required {
                let field_name = field_val.as_str().expect("required 数组元素应为字符串");
                assert!(
                    rust_required.contains(field_name),
                    "Skill JSON Schema required 字段 '{}' 在 Rust SkillData 中未标记为必填",
                    field_name
                );
            }
        }
    }

    #[test]
    fn skill_json_schema_matches_defaults_and_pattern() {
        let rust_schema = schema_for!(SkillData);
        let rust_schema_value =
            serde_json::to_value(&rust_schema.schema).expect("Rust SkillData schema 应可序列化");
        let json_schema = load_skill_json_schema();

        assert_eq!(json_schema["properties"]["id"]["minLength"], json!(1));
        assert_eq!(
            json_schema["properties"]["id"]["pattern"],
            json!("^[a-z0-9-]+$")
        );
        assert_eq!(
            rust_schema_value["properties"]["id"]["pattern"],
            json!("^[a-z0-9-]+$"),
            "Rust SkillData id schema 应与前端 JSON Schema 保持一致"
        );
        assert_eq!(
            json_schema["properties"]["disableModelInvocation"]["default"],
            json!(false)
        );
        assert_eq!(
            json_schema["properties"]["userInvocable"]["default"],
            json!(true)
        );
    }

    #[test]
    fn skill_file_data_has_all_json_schema_fields() {
        let rust_schema = schema_for!(SkillFileData);
        let rust_props = rust_schema
            .schema
            .object
            .as_ref()
            .expect("SkillFileData 应为 object 类型")
            .properties
            .clone();
        let json_schema = load_skill_file_json_schema();

        if let Some(props) = json_schema["properties"].as_object() {
            for field_name in props.keys() {
                assert!(
                    rust_props.contains_key(field_name.as_str()),
                    "SkillFile JSON Schema 字段 '{}' 在 Rust SkillFileData 中未找到",
                    field_name
                );
            }
        }
    }

    #[test]
    fn skill_file_json_schema_required_fields_match_rust_schema() {
        let rust_schema = schema_for!(SkillFileData);
        let rust_required = rust_schema
            .schema
            .object
            .as_ref()
            .expect("SkillFileData 应为 object 类型")
            .required
            .clone();
        let json_schema = load_skill_file_json_schema();

        if let Some(required) = json_schema["required"].as_array() {
            for field_val in required {
                let field_name = field_val.as_str().expect("required 数组元素应为字符串");
                assert!(
                    rust_required.contains(field_name),
                    "SkillFile JSON Schema required 字段 '{}' 在 Rust SkillFileData 中未标记为必填",
                    field_name
                );
            }
        }
    }

    #[test]
    fn update_skill_rejects_mismatched_payload_id() {
        let result = update_skill(
            "skill-a".to_string(),
            true,
            SkillData {
                id: "skill-b".to_string(),
                name: String::new(),
                description: String::new(),
                content: String::new(),
                disable_model_invocation: false,
                user_invocable: true,
            },
        );

        assert_eq!(result.unwrap_err(), "Skill id 与请求路径不一致");
    }

    #[test]
    fn update_skill_file_rejects_mismatched_payload_name() {
        let result = update_skill_file(
            "skill-a".to_string(),
            true,
            "docs/example.md".to_string(),
            SkillFileData {
                file_name: "docs/other.md".to_string(),
                content: String::new(),
            },
        );

        assert_eq!(result.unwrap_err(), "文件名与请求路径不一致");
    }
}
