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
