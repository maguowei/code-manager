use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::time::UNIX_EPOCH;

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
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let modified = meta
        .modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_secs())
        .unwrap_or(0);
    (created, modified)
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
            search_idx = abs_idx + 4;
            break;
        } else if suffix.starts_with("\n") {
            found_end = true;
            end_pos = prefix_len + abs_idx;
            search_idx = abs_idx + 5;
            break;
        } else if suffix.starts_with("\r\n") {
            found_end = true;
            end_pos = prefix_len + abs_idx;
            search_idx = abs_idx + 6;
            break;
        } else {
            search_idx = abs_idx + 1;
        }
    }

    if !found_end {
        return (String::new(), String::new(), false, true, raw.to_string());
    }

    let fm_str = &raw[prefix_len..end_pos];
    let body = raw[prefix_len + search_idx - prefix_len..]
        .trim_start()
        .to_string();

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
                "disable-model-invocation" => disable_model_invocation = val == "true",
                "user-invocable" => user_invocable = val != "false",
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
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let id = match path.file_name().and_then(|n| n.to_str()) {
            Some(n) => n.to_string(),
            None => continue,
        };
        let skill_md = path.join("SKILL.md");
        if !skill_md.exists() {
            continue;
        }
        let raw = match fs::read_to_string(&skill_md) {
            Ok(c) => c,
            Err(_) => continue,
        };
        let (name, description, disable_model_invocation, user_invocable, content) =
            parse_skill_md(&raw);
        let (created_at, updated_at) = get_file_times(&skill_md);

        skills.push(Skill {
            name: if name.is_empty() { id.clone() } else { name },
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
    let raw = fs::read_to_string(&skill_md).map_err(|e| format!("读取 SKILL.md 失败: {}", e))?;
    let (name, description, disable_model_invocation, user_invocable, content) =
        parse_skill_md(&raw);
    let (created_at, updated_at) = get_file_times(&skill_md);

    Ok(Skill {
        name: if name.is_empty() { id.clone() } else { name },
        id,
        description,
        content,
        disable_model_invocation,
        user_invocable,
        is_active: new_is_active,
        created_at,
        updated_at,
    })
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
pub fn add_skill(
    id: String,
    name: String,
    description: String,
    content: String,
    disable_model_invocation: bool,
    user_invocable: bool,
) -> Result<Skill, String> {
    let _lock = crate::utils::lock_skills()?;

    validate_skill_id(&id)?;

    let skill_dir = get_skills_dir().join(&id);
    if skill_dir.exists() {
        return Err(format!("Skill '{}' 已存在", id));
    }

    // 检查禁用目录中是否已有同名
    if get_disabled_dir().join(&id).exists() {
        return Err(format!("Skill '{}' 已存在（已禁用）", id));
    }

    let display_name = if name.is_empty() {
        id.clone()
    } else {
        name.clone()
    };
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
}

#[tauri::command]
pub fn update_skill(
    id: String,
    is_active: bool,
    name: String,
    description: String,
    content: String,
    disable_model_invocation: bool,
    user_invocable: bool,
) -> Result<Skill, String> {
    let _lock = crate::utils::lock_skills()?;

    let skill_md = get_skill_md_path(&id, is_active);
    if !skill_md.exists() {
        return Err(format!("Skill '{}' 不存在", id));
    }

    let display_name = if name.is_empty() {
        id.clone()
    } else {
        name.clone()
    };
    let raw = serialize_skill_md(
        &display_name,
        &description,
        disable_model_invocation,
        user_invocable,
        &content,
    );
    crate::utils::ensure_dir_and_write(&skill_md, &raw)?;

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
}

#[tauri::command]
pub fn delete_skill(id: String, is_active: bool) -> Result<(), String> {
    let _lock = crate::utils::lock_skills()?;

    let skill_dir = get_skill_path(&id, is_active);
    if !skill_dir.exists() {
        return Err(format!("Skill '{}' 不存在", id));
    }

    fs::remove_dir_all(&skill_dir).map_err(|e| format!("删除 Skill 目录失败: {}", e))?;

    Ok(())
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
    file_name: String,
    content: String,
) -> Result<SkillFile, String> {
    let _lock = crate::utils::lock_skills()?;

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
}

#[tauri::command]
pub fn update_skill_file(
    id: String,
    is_active: bool,
    file_name: String,
    content: String,
) -> Result<SkillFile, String> {
    let _lock = crate::utils::lock_skills()?;

    validate_file_name(&file_name)?;

    let file_path = get_skill_path(&id, is_active).join(&file_name);
    crate::utils::ensure_dir_and_write(&file_path, &content)?;

    Ok(SkillFile {
        name: file_name,
        content,
        is_binary: false,
    })
}

#[tauri::command]
pub fn delete_skill_file(id: String, is_active: bool, file_name: String) -> Result<(), String> {
    let _lock = crate::utils::lock_skills()?;

    validate_file_name(&file_name)?;

    let file_path = get_skill_path(&id, is_active).join(&file_name);
    if !file_path.exists() {
        return Err(format!("文件 '{}' 不存在", file_name));
    }

    fs::remove_file(&file_path).map_err(|e| format!("删除文件失败: {}", e))?;

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
}
