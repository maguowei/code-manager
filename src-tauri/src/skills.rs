use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

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
    pub is_managed: bool,
    pub link_target: Option<String>,
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

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum SkillDirectoryImportSkipReason {
    InvalidId,
    Exists,
    MissingSkillMd,
    IsSymlink,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SkillDirectoryImportSkippedItem {
    pub id: String,
    pub reason: SkillDirectoryImportSkipReason,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillDirectoryImportResult {
    pub skills: Vec<Skill>,
    pub imported: Vec<String>,
    pub skipped: Vec<SkillDirectoryImportSkippedItem>,
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

fn path_exists_including_symlink(path: &Path) -> bool {
    match fs::symlink_metadata(path) {
        Ok(_) => true,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => false,
        Err(_) => true,
    }
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

fn canonical_path_string(path: &Path) -> Result<String, String> {
    path.canonicalize()
        .map_err(|e| format!("解析软链接目标失败: {}", e))
        .map(|target| target.to_string_lossy().to_string())
}

fn read_skill_from_path(
    id: String,
    path: &Path,
    is_active: bool,
    is_managed: bool,
    link_target: Option<String>,
) -> Result<Skill, String> {
    let skill_md = path.join("SKILL.md");
    let raw = fs::read_to_string(&skill_md).map_err(|e| format!("读取 SKILL.md 失败: {}", e))?;
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
        is_active,
        created_at,
        updated_at,
        is_managed,
        link_target,
    })
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
fn scan_skills_dir(dir: &Path, is_active: bool) -> Vec<Skill> {
    let entries = match fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return vec![],
    };

    let mut skills = vec![];
    for entry in entries.flatten() {
        let file_type = match entry.file_type() {
            Ok(ft) => ft,
            Err(_) => continue,
        };
        let path = entry.path();
        let id = match path.file_name().and_then(|n| n.to_str()) {
            Some(n) => n.to_string(),
            None => continue,
        };

        let (is_managed, link_target) = if file_type.is_symlink() {
            let target = match path.canonicalize() {
                Ok(target) => target,
                Err(_) => continue,
            };
            let target_metadata = match fs::metadata(&target) {
                Ok(metadata) => metadata,
                Err(_) => continue,
            };
            if !target_metadata.is_dir() || !target.join("SKILL.md").is_file() {
                continue;
            }
            (false, Some(target.to_string_lossy().to_string()))
        } else if file_type.is_dir() {
            (true, None)
        } else {
            continue;
        };

        if let Ok(skill) = read_skill_from_path(id, &path, is_active, is_managed, link_target) {
            skills.push(skill);
        }
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
        validate_skill_id(&id)?;
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
        let dst_metadata =
            fs::symlink_metadata(&dst).map_err(|e| format!("读取 Skill 目录失败: {}", e))?;
        let is_managed = !dst_metadata.file_type().is_symlink();
        let link_target = if is_managed {
            None
        } else {
            Some(canonical_path_string(&dst)?)
        };

        read_skill_from_path(id, &dst, new_is_active, is_managed, link_target)
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

fn ensure_managed_skill_root(id: &str, is_active: bool) -> Result<PathBuf, String> {
    let skill_dir = get_skill_path(id, is_active);
    let metadata =
        fs::symlink_metadata(&skill_dir).map_err(|_| format!("Skill '{}' 不存在", id))?;
    if metadata.file_type().is_symlink() {
        return Err("软链接 Skill 不支持编辑内容或支持文件".to_string());
    }
    if !metadata.is_dir() {
        return Err(format!("Skill '{}' 不是有效目录", id));
    }
    Ok(skill_dir)
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
        if path_exists_including_symlink(&skill_dir) {
            return Err(format!("Skill '{}' 已存在", id));
        }

        // 检查禁用目录中是否已有同名
        if path_exists_including_symlink(&get_disabled_dir().join(&id)) {
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
            is_managed: true,
            link_target: None,
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
        validate_skill_id(&id)?;

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
        ensure_managed_skill_root(&id, is_active)?;
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
            is_managed: true,
            link_target: None,
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
        validate_skill_id(&id)?;
        let _lock = crate::utils::lock_skills()?;

        let skill_dir = get_skill_path(&id, is_active);
        let metadata =
            fs::symlink_metadata(&skill_dir).map_err(|_| format!("Skill '{}' 不存在", id))?;
        if metadata.file_type().is_symlink() {
            fs::remove_file(&skill_dir).map_err(|e| format!("删除 Skill 软链接失败: {}", e))?;
        } else if metadata.is_dir() {
            fs::remove_dir_all(&skill_dir).map_err(|e| format!("删除 Skill 目录失败: {}", e))?;
        } else {
            return Err(format!("Skill '{}' 不是有效目录", id));
        }

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
    validate_skill_id(&id)?;
    let skill_dir = ensure_managed_skill_root(&id, is_active)?;

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
        validate_skill_id(&id)?;
        let _lock = crate::utils::lock_skills()?;
        let SkillFileData { file_name, content } = data;

        validate_file_name(&file_name)?;

        let skill_dir = ensure_managed_skill_root(&id, is_active)?;
        let file_path = skill_dir.join(&file_name);
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
        validate_skill_id(&id)?;

        let _lock = crate::utils::lock_skills()?;
        let SkillFileData { file_name, content } = data;

        validate_file_name(&file_name)?;

        let skill_dir = ensure_managed_skill_root(&id, is_active)?;
        let file_path = skill_dir.join(&file_name);
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
        validate_skill_id(&id)?;
        let _lock = crate::utils::lock_skills()?;

        validate_file_name(&file_name)?;

        let skill_root = ensure_managed_skill_root(&id, is_active)?;
        let file_path = skill_root.join(&file_name);
        fs::remove_file(&file_path)
            .map_err(|e| format!("删除文件失败（文件可能不存在）: {}", e))?;

        // 若父目录（非 skill 根目录）为空，则删除父目录
        if let Some(parent) = file_path.parent() {
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
pub fn import_skills_from_directory(
    source_dir: String,
) -> Result<SkillDirectoryImportResult, String> {
    let result = (|| {
        let source_dir = validate_skill_import_source_dir(&source_dir)?;
        let _lock = crate::utils::lock_skills()?;
        fs::create_dir_all(get_disabled_dir()).map_err(|e| format!("创建禁用目录失败: {}", e))?;

        let mut imported = Vec::new();
        let mut skipped = Vec::new();
        if source_dir.join("SKILL.md").is_file() {
            let id = source_dir
                .file_name()
                .and_then(|name| name.to_str())
                .ok_or_else(|| "源目录名称无效".to_string())?
                .to_string();
            import_skill_candidate(&source_dir, id, &mut imported, &mut skipped)?;
        } else {
            let mut entries = fs::read_dir(&source_dir)
                .map_err(|e| format!("读取导入目录失败: {}", e))?
                .flatten()
                .collect::<Vec<_>>();
            entries.sort_by_key(|entry| entry.file_name());
            for entry in entries {
                let path = entry.path();
                let id = match path.file_name().and_then(|name| name.to_str()) {
                    Some(id) => id.to_string(),
                    None => continue,
                };
                let file_type = match entry.file_type() {
                    Ok(file_type) => file_type,
                    Err(_) => continue,
                };
                if file_type.is_symlink() {
                    skipped.push(SkillDirectoryImportSkippedItem {
                        id,
                        reason: SkillDirectoryImportSkipReason::IsSymlink,
                    });
                    continue;
                }
                if !file_type.is_dir() {
                    continue;
                }
                import_skill_candidate(&path, id, &mut imported, &mut skipped)?;
            }
        }

        let mut skills = scan_skills_dir(&get_skills_dir(), true);
        let mut disabled = scan_skills_dir(&get_disabled_dir(), false);
        skills.append(&mut disabled);

        Ok(SkillDirectoryImportResult {
            skills,
            imported,
            skipped,
        })
    })();
    crate::logging::log_command_result("skill.import_directory", &result, |result| {
        format!(
            "imported_count={} skipped_count={}",
            result.imported.len(),
            result.skipped.len()
        )
    });
    result
}

fn validate_skill_import_source_dir(source_dir: &str) -> Result<PathBuf, String> {
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

fn import_skill_candidate(
    source: &Path,
    id: String,
    imported: &mut Vec<String>,
    skipped: &mut Vec<SkillDirectoryImportSkippedItem>,
) -> Result<(), String> {
    if let Err(_error) = validate_skill_id(&id) {
        skipped.push(SkillDirectoryImportSkippedItem {
            id,
            reason: SkillDirectoryImportSkipReason::InvalidId,
        });
        return Ok(());
    }

    let metadata = match fs::symlink_metadata(source) {
        Ok(metadata) => metadata,
        Err(_) => {
            skipped.push(SkillDirectoryImportSkippedItem {
                id,
                reason: SkillDirectoryImportSkipReason::MissingSkillMd,
            });
            return Ok(());
        }
    };
    if metadata.file_type().is_symlink() {
        skipped.push(SkillDirectoryImportSkippedItem {
            id,
            reason: SkillDirectoryImportSkipReason::IsSymlink,
        });
        return Ok(());
    }
    if !metadata.is_dir() {
        return Ok(());
    }

    if path_exists_including_symlink(&get_skills_dir().join(&id))
        || path_exists_including_symlink(&get_disabled_dir().join(&id))
    {
        skipped.push(SkillDirectoryImportSkippedItem {
            id,
            reason: SkillDirectoryImportSkipReason::Exists,
        });
        return Ok(());
    }

    let skill_md = source.join("SKILL.md");
    let skill_md_metadata = match fs::symlink_metadata(&skill_md) {
        Ok(metadata) => metadata,
        Err(_) => {
            skipped.push(SkillDirectoryImportSkippedItem {
                id,
                reason: SkillDirectoryImportSkipReason::MissingSkillMd,
            });
            return Ok(());
        }
    };
    if skill_md_metadata.file_type().is_symlink() || !skill_md_metadata.is_file() {
        skipped.push(SkillDirectoryImportSkippedItem {
            id,
            reason: SkillDirectoryImportSkipReason::MissingSkillMd,
        });
        return Ok(());
    }

    let target = get_disabled_dir().join(&id);
    if let Err(error) = copy_skill_dir_without_symlinks(source, &target) {
        let _ = fs::remove_dir_all(&target);
        return Err(error);
    }
    imported.push(id);
    Ok(())
}

fn copy_skill_dir_without_symlinks(source: &Path, target: &Path) -> Result<(), String> {
    fs::create_dir_all(target).map_err(|e| format!("创建 Skill 目录失败: {}", e))?;
    let mut entries = fs::read_dir(source)
        .map_err(|e| format!("读取 Skill 源目录失败: {}", e))?
        .flatten()
        .collect::<Vec<_>>();
    entries.sort_by_key(|entry| entry.file_name());

    for entry in entries {
        let file_type = match entry.file_type() {
            Ok(file_type) => file_type,
            Err(_) => continue,
        };
        if file_type.is_symlink() {
            continue;
        }

        let source_path = entry.path();
        let target_path = target.join(entry.file_name());
        if file_type.is_dir() {
            copy_skill_dir_without_symlinks(&source_path, &target_path)?;
        } else if file_type.is_file() {
            if let Some(parent) = target_path.parent() {
                fs::create_dir_all(parent).map_err(|e| format!("创建目录失败: {}", e))?;
            }
            fs::copy(&source_path, &target_path).map_err(|e| format!("复制文件失败: {}", e))?;
        }
    }

    Ok(())
}

#[tauri::command]
pub fn sync_skill_to_codex(id: String, is_active: bool) -> Result<(), String> {
    let result = (|| {
        validate_skill_id(&id)?;
        let _lock = crate::utils::lock_skills()?;

        let src = get_skill_path(&id, is_active);
        let src_metadata =
            fs::symlink_metadata(&src).map_err(|_| format!("Skill '{}' 不存在", id))?;
        let link_src = if src_metadata.file_type().is_symlink() {
            src.canonicalize()
                .map_err(|e| format!("解析 Skill 软链接目标失败: {}", e))?
        } else if src_metadata.is_dir() {
            src.clone()
        } else {
            return Err(format!("Skill '{}' 不是有效目录", id));
        };

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
        std::os::unix::fs::symlink(&link_src, &dest)
            .map_err(|e| format!("创建软链接失败: {}", e))?;

        #[cfg(windows)]
        std::os::windows::fs::symlink_dir(&link_src, &dest)
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
    use std::env;
    use std::path::{Path, PathBuf};
    use std::sync::MutexGuard;
    use std::time::{SystemTime, UNIX_EPOCH};

    struct TestEnv {
        root: PathBuf,
        previous_home: Option<String>,
        previous_app_data: Option<String>,
        _guard: MutexGuard<'static, ()>,
    }

    impl TestEnv {
        fn new(name: &str) -> Self {
            let guard = crate::utils::TEST_ENV_LOCK
                .lock()
                .unwrap_or_else(|error| error.into_inner());
            let suffix = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("系统时间应晚于 Unix epoch")
                .as_nanos();
            let root = env::temp_dir().join(format!(
                "ai-manager-skills-test-{}-{}-{}",
                name,
                std::process::id(),
                suffix
            ));
            let _ = fs::remove_dir_all(&root);
            fs::create_dir_all(&root).expect("应可创建测试根目录");
            let app_data = root.join(".config").join("ai-manager");
            let previous_home = env::var("AI_MANAGER_HOME_OVERRIDE").ok();
            let previous_app_data = env::var("AI_MANAGER_APP_DATA_DIR_OVERRIDE").ok();
            env::set_var("AI_MANAGER_HOME_OVERRIDE", &root);
            env::set_var("AI_MANAGER_APP_DATA_DIR_OVERRIDE", &app_data);

            Self {
                root,
                previous_home,
                previous_app_data,
                _guard: guard,
            }
        }

        fn active_skill_dir(&self, id: &str) -> PathBuf {
            self.root.join(".claude").join("skills").join(id)
        }

        fn disabled_skill_dir(&self, id: &str) -> PathBuf {
            self.root
                .join(".config")
                .join("ai-manager")
                .join("skills-disabled")
                .join(id)
        }

        fn codex_skill_dir(&self, id: &str) -> PathBuf {
            self.root.join(".codex").join("skills").join(id)
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

    fn write_skill_dir(path: &Path, name: &str) {
        fs::create_dir_all(path).expect("应可创建 Skill 目录");
        fs::write(
            path.join("SKILL.md"),
            format!(
                "---\nname: \"{}\"\ndescription: \"测试 Skill\"\n---\n\n测试内容",
                name
            ),
        )
        .expect("应可写入 SKILL.md");
    }

    #[cfg(unix)]
    fn create_test_dir_symlink(src: &Path, dest: &Path) {
        std::os::unix::fs::symlink(src, dest).expect("应可创建目录软链接");
    }

    #[cfg(windows)]
    fn create_test_dir_symlink(src: &Path, dest: &Path) {
        std::os::windows::fs::symlink_dir(src, dest).expect("应可创建目录软链接");
    }

    fn file_exists(path: &Path) -> bool {
        path.try_exists().expect("文件存在性检查应成功")
    }

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
    fn scan_skills_dir_marks_plain_dir_managed() {
        let env = TestEnv::new("scan-managed");
        write_skill_dir(&env.active_skill_dir("plain-skill"), "Plain Skill");

        let skills = scan_skills_dir(&get_skills_dir(), true);

        assert_eq!(skills.len(), 1);
        assert_eq!(skills[0].id, "plain-skill");
        assert!(skills[0].is_managed);
        assert_eq!(skills[0].link_target, None);
    }

    #[test]
    fn scan_skills_dir_marks_symlink_unmanaged() {
        let env = TestEnv::new("scan-symlink");
        let external = env.root.join("external").join("linked-skill");
        write_skill_dir(&external, "Linked Skill");
        fs::create_dir_all(env.active_skill_dir("linked-skill").parent().unwrap())
            .expect("应可创建 Skills 根目录");
        create_test_dir_symlink(&external, &env.active_skill_dir("linked-skill"));

        let skills = scan_skills_dir(&get_skills_dir(), true);

        assert_eq!(skills.len(), 1);
        assert_eq!(skills[0].id, "linked-skill");
        assert_eq!(skills[0].name, "Linked Skill");
        assert!(!skills[0].is_managed);
        assert_eq!(
            skills[0].link_target.as_deref(),
            Some(
                external
                    .canonicalize()
                    .expect("目标应可 canonicalize")
                    .to_str()
                    .unwrap()
            )
        );
    }

    #[test]
    fn scan_skills_dir_skips_invalid_symlinks() {
        let env = TestEnv::new("scan-invalid-symlink");
        let root = get_skills_dir();
        fs::create_dir_all(&root).expect("应可创建 Skills 根目录");
        create_test_dir_symlink(&env.root.join("missing-target"), &root.join("dangling"));
        let without_skill_md = env.root.join("external").join("without-skill-md");
        fs::create_dir_all(&without_skill_md).expect("应可创建外部目录");
        create_test_dir_symlink(&without_skill_md, &root.join("without-skill-md"));

        let skills = scan_skills_dir(&root, true);

        assert!(skills.is_empty());
    }

    #[test]
    fn toggle_skill_moves_symlink_node_only() {
        let env = TestEnv::new("toggle-symlink");
        let external = env.root.join("external").join("linked-skill");
        write_skill_dir(&external, "Linked Skill");
        fs::create_dir_all(env.active_skill_dir("linked-skill").parent().unwrap())
            .expect("应可创建 Skills 根目录");
        create_test_dir_symlink(&external, &env.active_skill_dir("linked-skill"));

        let toggled = toggle_skill("linked-skill".to_string(), true).expect("应可移动软链接节点");

        assert!(!toggled.is_active);
        assert!(!toggled.is_managed);
        assert!(!file_exists(&env.active_skill_dir("linked-skill")));
        assert!(fs::symlink_metadata(env.disabled_skill_dir("linked-skill"))
            .expect("禁用目录应存在软链接节点")
            .file_type()
            .is_symlink());
        assert!(file_exists(&external.join("SKILL.md")));
    }

    #[test]
    fn delete_skill_unlinks_symlink_only() {
        let env = TestEnv::new("delete-symlink");
        let external = env.root.join("external").join("linked-skill");
        write_skill_dir(&external, "Linked Skill");
        fs::create_dir_all(env.active_skill_dir("linked-skill").parent().unwrap())
            .expect("应可创建 Skills 根目录");
        create_test_dir_symlink(&external, &env.active_skill_dir("linked-skill"));

        delete_skill("linked-skill".to_string(), true).expect("应可删除软链接节点");

        assert!(!file_exists(&env.active_skill_dir("linked-skill")));
        assert!(file_exists(&external.join("SKILL.md")));
    }

    #[test]
    fn managed_write_commands_reject_symlink_skill_roots() {
        let env = TestEnv::new("reject-symlink-writes");
        let external = env.root.join("external").join("linked-skill");
        write_skill_dir(&external, "Linked Skill");
        fs::write(external.join("notes.md"), "外部支持文件").expect("应可写入外部支持文件");
        fs::create_dir_all(env.active_skill_dir("linked-skill").parent().unwrap())
            .expect("应可创建 Skills 根目录");
        create_test_dir_symlink(&external, &env.active_skill_dir("linked-skill"));

        let data = SkillData {
            id: "linked-skill".to_string(),
            name: "Linked Skill".to_string(),
            description: "更新".to_string(),
            content: "更新内容".to_string(),
            disable_model_invocation: false,
            user_invocable: true,
        };
        assert!(update_skill("linked-skill".to_string(), true, data)
            .unwrap_err()
            .contains("软链接"));
        assert!(get_skill_files("linked-skill".to_string(), true)
            .unwrap_err()
            .contains("软链接"));
        assert!(add_skill_file(
            "linked-skill".to_string(),
            true,
            SkillFileData {
                file_name: "new.md".to_string(),
                content: "内容".to_string(),
            },
        )
        .unwrap_err()
        .contains("软链接"));
        assert!(update_skill_file(
            "linked-skill".to_string(),
            true,
            "notes.md".to_string(),
            SkillFileData {
                file_name: "notes.md".to_string(),
                content: "更新".to_string(),
            },
        )
        .unwrap_err()
        .contains("软链接"));
        assert!(
            delete_skill_file("linked-skill".to_string(), true, "notes.md".to_string(),)
                .unwrap_err()
                .contains("软链接")
        );
    }

    #[test]
    fn sync_skill_to_codex_links_to_canonical_target() {
        let env = TestEnv::new("sync-symlink");
        let external = env.root.join("external").join("linked-skill");
        write_skill_dir(&external, "Linked Skill");
        fs::create_dir_all(env.active_skill_dir("linked-skill").parent().unwrap())
            .expect("应可创建 Skills 根目录");
        create_test_dir_symlink(&external, &env.active_skill_dir("linked-skill"));

        sync_skill_to_codex("linked-skill".to_string(), true).expect("应可同步软链接 Skill");

        let codex_link = env.codex_skill_dir("linked-skill");
        let link_target = fs::read_link(&codex_link).expect("Codex 目标应是软链接");
        assert_eq!(
            link_target,
            external.canonicalize().expect("源目标应可 canonicalize")
        );
    }

    #[test]
    fn import_skills_from_directory_imports_single_skill_disabled() {
        let env = TestEnv::new("import-single");
        let source = env.root.join("source-skill");
        write_skill_dir(&source, "Imported Skill");

        let result =
            import_skills_from_directory(source.display().to_string()).expect("应可导入单个 Skill");

        assert_eq!(result.imported, vec!["source-skill"]);
        assert!(result.skipped.is_empty());
        assert!(file_exists(
            &env.disabled_skill_dir("source-skill").join("SKILL.md")
        ));
        let imported = result
            .skills
            .iter()
            .find(|skill| skill.id == "source-skill")
            .expect("返回列表应包含导入 Skill");
        assert!(!imported.is_active);
        assert!(imported.is_managed);
    }

    #[test]
    fn import_skills_from_directory_imports_collection_and_skips_invalid_candidates() {
        let env = TestEnv::new("import-collection");
        write_skill_dir(&env.active_skill_dir("existing-skill"), "Existing Skill");
        let source = env.root.join("skill-collection");
        write_skill_dir(&source.join("valid-skill"), "Valid Skill");
        write_skill_dir(&source.join("Invalid_Skill"), "Invalid Skill");
        write_skill_dir(&source.join("existing-skill"), "Duplicate Skill");
        fs::create_dir_all(source.join("missing-skill-md")).expect("应可创建缺失目录");
        let external = env.root.join("external").join("linked-skill");
        write_skill_dir(&external, "Linked Skill");
        create_test_dir_symlink(&external, &source.join("linked-skill"));

        let result =
            import_skills_from_directory(source.display().to_string()).expect("应可批量导入 Skill");

        assert_eq!(result.imported, vec!["valid-skill"]);
        assert!(file_exists(
            &env.disabled_skill_dir("valid-skill").join("SKILL.md")
        ));
        assert!(result.skipped.iter().any(|item| {
            item.id == "Invalid_Skill" && item.reason == SkillDirectoryImportSkipReason::InvalidId
        }));
        assert!(result.skipped.iter().any(|item| {
            item.id == "existing-skill" && item.reason == SkillDirectoryImportSkipReason::Exists
        }));
        assert!(result.skipped.iter().any(|item| {
            item.id == "missing-skill-md"
                && item.reason == SkillDirectoryImportSkipReason::MissingSkillMd
        }));
        assert!(result.skipped.iter().any(|item| {
            item.id == "linked-skill" && item.reason == SkillDirectoryImportSkipReason::IsSymlink
        }));
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
