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
    pub is_active: bool,     // true = ~/.claude/skills/，false = skills-disabled/
    pub created_at: u64,
    pub updated_at: u64,
}

/// 支持文件（SKILL.md 以外的文件）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillFile {
    pub name: String,    // 相对于 Skill 目录的路径，如 "examples.md"
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
    // 检查是否以 "---\n" 开头
    if !raw.starts_with("---\n") {
        return (String::new(), String::new(), false, true, raw.to_string());
    }
    let rest = &raw[4..]; // 跳过 "---\n"
    let end_pos = match rest.find("\n---\n") {
        Some(p) => p,
        None => return (String::new(), String::new(), false, true, raw.to_string()),
    };
    let fm_str = &rest[..end_pos];
    let body = rest[end_pos + 5..].trim_start().to_string();

    let mut name = String::new();
    let mut description = String::new();
    let mut disable_model_invocation = false;
    let mut user_invocable = true;

    for line in fm_str.lines() {
        if let Some((key, val)) = line.split_once(": ") {
            match key.trim() {
                "name" => name = val.trim().to_string(),
                "description" => description = val.trim().to_string(),
                "disable-model-invocation" => {
                    disable_model_invocation = val.trim() == "true"
                }
                "user-invocable" => user_invocable = val.trim() != "false",
                _ => {}
            }
        }
    }

    (name, description, disable_model_invocation, user_invocable, body)
}

/// 将字段序列化为 SKILL.md 文本
fn serialize_skill_md(
    name: &str,
    description: &str,
    disable_model_invocation: bool,
    user_invocable: bool,
    content: &str,
) -> String {
    format!(
        "---\nname: {}\ndescription: {}\ndisable-model-invocation: {}\nuser-invocable: {}\n---\n\n{}",
        name, description, disable_model_invocation, user_invocable, content
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
    fs::create_dir_all(&dst_root)
        .map_err(|e| format!("创建目录失败: {}", e))?;

    // 移动目录
    fs::rename(&src, &dst)
        .map_err(|e| format!("移动 Skill 目录失败: {}", e))?;

    // 读取新位置的 SKILL.md 并返回更新后的 Skill
    let new_is_active = !is_active;
    let skill_md = dst.join("SKILL.md");
    let raw = fs::read_to_string(&skill_md)
        .map_err(|e| format!("读取 SKILL.md 失败: {}", e))?;
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
    if !id.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-') {
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

    let display_name = if name.is_empty() { id.clone() } else { name.clone() };
    let raw = serialize_skill_md(&display_name, &description, disable_model_invocation, user_invocable, &content);
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

    let display_name = if name.is_empty() { id.clone() } else { name.clone() };
    let raw = serialize_skill_md(&display_name, &description, disable_model_invocation, user_invocable, &content);
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

    fs::remove_dir_all(&skill_dir)
        .map_err(|e| format!("删除 Skill 目录失败: {}", e))?;

    Ok(())
}
