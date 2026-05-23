use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Component, Path, PathBuf};

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
    pub is_symlink: bool,
    pub has_symlink_content: bool,
    pub link_target: Option<String>,
}

/// 支持文件树条目（SKILL.md 以外的文件和目录）
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum SkillFileTreeEntryKind {
    File,
    Directory,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillFileTreeEntry {
    pub path: String, // 相对于 Skill 目录的路径，如 "examples.md"
    pub kind: SkillFileTreeEntryKind,
    pub size: u64,
    pub is_binary: bool,
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

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum SkillDirectoryImportSkipReason {
    InvalidId,
    Exists,
    MissingSkillMd,
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

fn normalize_path(path: PathBuf) -> PathBuf {
    let mut normalized = PathBuf::new();
    for component in path.components() {
        match component {
            Component::CurDir => {}
            Component::ParentDir => {
                normalized.pop();
            }
            Component::Prefix(_) | Component::RootDir | Component::Normal(_) => {
                normalized.push(component.as_os_str());
            }
        }
    }
    normalized
}

fn resolve_skill_dir_symlink_target(path: &Path, is_active: bool) -> Result<PathBuf, String> {
    if let Ok(target) = path.canonicalize() {
        return Ok(target);
    }

    let link_target = fs::read_link(path).map_err(|e| format!("读取 Skill 软链接失败: {}", e))?;
    if link_target.is_relative() {
        // Windows 上把 POSIX 风格的相对分隔符换成本地分隔符，避免 join + canonicalize 在混合分隔符上报 os error 123
        let target_lookup = {
            #[cfg(windows)]
            {
                PathBuf::from(link_target.to_string_lossy().replace('/', "\\"))
            }
            #[cfg(not(windows))]
            {
                link_target.clone()
            }
        };

        // 候选基址：优先 link 当前所在目录，再回退到 toggle 之前所在的目录
        let mut bases: Vec<PathBuf> = Vec::with_capacity(2);
        if let Some(parent) = path.parent() {
            bases.push(parent.to_path_buf());
        }
        bases.push(if is_active {
            get_disabled_dir()
        } else {
            get_skills_dir()
        });

        for base in &bases {
            if let Ok(target) = normalize_path(base.join(&target_lookup)).canonicalize() {
                return Ok(target);
            }
        }
    }

    path.canonicalize()
        .map_err(|e| format!("解析软链接目标失败: {}", e))
}

fn ensure_valid_skill_dir_target(target: &Path) -> Result<(), String> {
    let target_metadata =
        fs::metadata(target).map_err(|e| format!("读取 Skill 软链接目标失败: {}", e))?;
    if !target_metadata.is_dir() || !target.join("SKILL.md").is_file() {
        return Err("软链接 Skill 目标缺少有效的 SKILL.md".to_string());
    }
    Ok(())
}

fn read_skill_from_path(
    id: String,
    path: &Path,
    is_active: bool,
    is_symlink: bool,
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
        is_symlink,
        has_symlink_content: is_symlink || contains_symlink_content(path),
        link_target,
    })
}

fn contains_symlink_content(path: &Path) -> bool {
    let metadata = match fs::symlink_metadata(path) {
        Ok(metadata) => metadata,
        Err(_) => return false,
    };
    if metadata.file_type().is_symlink() {
        return true;
    }
    if !metadata.is_dir() {
        return false;
    }

    let entries = match fs::read_dir(path) {
        Ok(entries) => entries,
        Err(_) => return false,
    };
    entries
        .flatten()
        .any(|entry| contains_symlink_content(&entry.path()))
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

        let (read_root, is_symlink, link_target) = if file_type.is_symlink() {
            let target = match resolve_skill_dir_symlink_target(&path, is_active) {
                Ok(target) => target,
                Err(_) => continue,
            };
            if ensure_valid_skill_dir_target(&target).is_err() {
                continue;
            }
            let link_target = target.to_string_lossy().to_string();
            (target, true, Some(link_target))
        } else if file_type.is_dir() {
            (path.clone(), false, None)
        } else {
            continue;
        };

        if let Ok(skill) = read_skill_from_path(id, &read_root, is_active, is_symlink, link_target)
        {
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

/// 切换 Skill 的启用/禁用状态
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

        let src_metadata =
            fs::symlink_metadata(&src).map_err(|_| format!("Skill '{}' 不存在", id))?;
        let new_is_active = !is_active;
        if src_metadata.file_type().is_symlink() {
            let target = resolve_skill_dir_symlink_target(&src, is_active)?;
            ensure_valid_skill_dir_target(&target)?;
            if path_exists_including_symlink(&dst) {
                return Err(format!("Skill '{}' 已存在", id));
            }

            create_skill_dir_symlink(&target, &dst)?;
            if let Err(error) = remove_symlink_node(&src) {
                let _ = remove_symlink_node(&dst);
                return Err(format!("移动 Skill 软链接失败: {}", error));
            }

            return read_skill_from_path(
                id,
                &target,
                new_is_active,
                true,
                Some(target.to_string_lossy().to_string()),
            );
        }

        if !src_metadata.is_dir() {
            return Err(format!("Skill '{}' 不是有效目录", id));
        }

        // 移动目录
        fs::rename(&src, &dst).map_err(|e| format!("移动 Skill 目录失败: {}", e))?;

        // 读取新位置的 SKILL.md 并返回更新后的 Skill
        read_skill_from_path(id, &dst, new_is_active, false, None)
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

fn ensure_local_skill_root(id: &str, is_active: bool) -> Result<PathBuf, String> {
    let skill_dir = get_skill_path(id, is_active);
    let metadata =
        fs::symlink_metadata(&skill_dir).map_err(|_| format!("Skill '{}' 不存在", id))?;
    if metadata.file_type().is_symlink() {
        return Err("软链接 Skill 不支持应用内修改".to_string());
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
        crate::utils::ensure_dir_and_write_atomic(&skill_md, &raw)?;

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
            is_symlink: false,
            has_symlink_content: false,
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
        ensure_local_skill_root(&id, is_active)?;
        let display_name = resolve_display_name(&name, &id);
        let raw = serialize_skill_md(
            &display_name,
            &description,
            disable_model_invocation,
            user_invocable,
            &content,
        );
        crate::utils::ensure_dir_and_write_atomic(&skill_md, &raw)
            .map_err(|e| format!("Skill '{}' 不存在或写入失败: {}", id, e))?;

        let (created_at, updated_at) = get_file_times(&skill_md);
        let has_symlink_content = contains_symlink_content(&get_skill_path(&id, is_active));

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
            is_symlink: false,
            has_symlink_content,
            link_target: None,
        })
    })();
    crate::logging::log_command_result("skill.update", &result, |skill| {
        format!("skill_id={} active={}", skill.id, skill.is_active)
    });
    result
}

#[tauri::command]
pub fn duplicate_skill(id: String, is_active: bool, name_suffix: String) -> Result<Skill, String> {
    let result = (|| {
        validate_skill_id(&id)?;
        let _lock = crate::utils::lock_skills()?;

        let source_root = resolve_existing_skill_root(&id, is_active)?;
        fs::create_dir_all(get_disabled_dir()).map_err(|e| format!("创建禁用目录失败: {}", e))?;

        let original = read_skill_from_path(id.clone(), &source_root, is_active, false, None)?;
        let duplicated_id = next_available_skill_copy_id(&id)?;
        let target = get_disabled_dir().join(&duplicated_id);
        if let Err(error) = copy_skill_dir_resolving_symlinks(&source_root, &target) {
            let _ = fs::remove_dir_all(&target);
            return Err(error);
        }

        let duplicated_name = format!("{}{}", original.name, name_suffix);
        let raw = serialize_skill_md(
            &duplicated_name,
            &original.description,
            original.disable_model_invocation,
            original.user_invocable,
            &original.content,
        );
        if let Err(error) =
            crate::utils::ensure_dir_and_write_atomic(&target.join("SKILL.md"), &raw)
        {
            let _ = fs::remove_dir_all(&target);
            return Err(format!("写入 Skill 副本失败: {}", error));
        }

        read_skill_from_path(duplicated_id, &target, false, false, None)
    })();
    crate::logging::log_command_result("skill.duplicate", &result, |skill| {
        format!("source_skill_id={id} skill_id={}", skill.id)
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
            remove_symlink_node(&skill_dir).map_err(|e| format!("删除 Skill 软链接失败: {}", e))?;
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

fn skill_id_exists(id: &str) -> bool {
    path_exists_including_symlink(&get_skills_dir().join(id))
        || path_exists_including_symlink(&get_disabled_dir().join(id))
}

fn next_available_skill_copy_id(source_id: &str) -> Result<String, String> {
    for copy_index in 1..=10_000 {
        let copy_suffix = if copy_index == 1 {
            "copy".to_string()
        } else {
            format!("copy-{copy_index}")
        };
        let candidate = format!("{source_id}-{copy_suffix}");
        if !skill_id_exists(&candidate) {
            return Ok(candidate);
        }
    }

    Err("无法生成不冲突的 Skill 副本名称".to_string())
}

#[tauri::command]
pub fn get_skill_file_tree(id: String, is_active: bool) -> Result<Vec<SkillFileTreeEntry>, String> {
    validate_skill_id(&id)?;
    let skill_dir = ensure_local_skill_root(&id, is_active)?;

    let mut entries = vec![];
    collect_file_tree(&skill_dir, &skill_dir, &mut entries)?;
    entries.sort_by(|a, b| a.path.cmp(&b.path));

    Ok(entries)
}

/// 递归收集目录下除 SKILL.md 外的只读文件树
fn collect_file_tree(
    base: &Path,
    current: &Path,
    entries: &mut Vec<SkillFileTreeEntry>,
) -> Result<(), String> {
    let dir_entries = fs::read_dir(current).map_err(|e| format!("读取目录失败: {}", e))?;

    for entry in dir_entries.flatten() {
        let path = entry.path();
        let file_type = entry
            .file_type()
            .map_err(|e| format!("获取文件类型失败: {}", e))?;
        if file_type.is_symlink() {
            continue; // 拒绝遍历符号链接，防止路径逃逸
        }
        let rel = path.strip_prefix(base).map_err(|e| e.to_string())?;
        if rel == Path::new("SKILL.md") {
            continue;
        }
        // Windows 上 strip_prefix 结果会带反斜杠分隔符，统一替换为 `/`，方便前端做稳定的字符串比较
        let relative_path = rel.to_string_lossy().replace('\\', "/");

        if file_type.is_dir() {
            entries.push(SkillFileTreeEntry {
                path: relative_path,
                kind: SkillFileTreeEntryKind::Directory,
                size: 0,
                is_binary: false,
            });
            collect_file_tree(base, &path, entries)?;
        } else {
            let metadata = fs::metadata(&path).map_err(|e| format!("读取文件元数据失败: {}", e))?;
            entries.push(SkillFileTreeEntry {
                path: relative_path,
                kind: SkillFileTreeEntryKind::File,
                size: metadata.len(),
                is_binary: is_binary_path(&path),
            });
        }
    }

    Ok(())
}

fn is_binary_path(path: &Path) -> bool {
    let Some(extension) = path
        .extension()
        .and_then(|extension| extension.to_str())
        .map(|extension| extension.to_ascii_lowercase())
    else {
        return false;
    };

    matches!(
        extension.as_str(),
        "7z" | "a"
            | "ai"
            | "apk"
            | "app"
            | "avi"
            | "bin"
            | "bmp"
            | "class"
            | "dmg"
            | "doc"
            | "docx"
            | "dll"
            | "dylib"
            | "eot"
            | "exe"
            | "gif"
            | "gz"
            | "ico"
            | "jar"
            | "jpeg"
            | "jpg"
            | "mov"
            | "mp3"
            | "mp4"
            | "o"
            | "otf"
            | "pdf"
            | "png"
            | "ppt"
            | "pptx"
            | "psd"
            | "rar"
            | "so"
            | "sqlite"
            | "tar"
            | "ttf"
            | "wasm"
            | "webp"
            | "woff"
            | "woff2"
            | "xls"
            | "xlsx"
            | "zip"
    )
}

fn resolve_existing_skill_root(id: &str, is_active: bool) -> Result<PathBuf, String> {
    let skill_dir = get_skill_path(id, is_active);
    let metadata =
        fs::symlink_metadata(&skill_dir).map_err(|_| format!("Skill '{}' 不存在", id))?;
    if metadata.file_type().is_symlink() {
        let target = resolve_skill_dir_symlink_target(&skill_dir, is_active)?;
        ensure_valid_skill_dir_target(&target)?;
        Ok(target)
    } else if metadata.is_dir() {
        Ok(skill_dir)
    } else {
        Err(format!("Skill '{}' 不是有效目录", id))
    }
}

#[tauri::command]
pub fn open_skill_in_editor(id: String, is_active: bool) -> Result<(), String> {
    let result = (|| {
        validate_skill_id(&id)?;
        let preferences = crate::config::load_app_preferences();
        let skill_root = resolve_existing_skill_root(&id, is_active)?;
        let editor = preferences
            .default_editor_app
            .as_deref()
            .ok_or_else(|| "请先在设置中选择默认编辑器".to_string())?;
        crate::native_open::open_path_in_editor(&skill_root, editor)
    })();
    crate::logging::log_command_result("skill.open_editor", &result, |_| {
        format!("skill_id={id} active={is_active}")
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
                if !file_type.is_symlink() && !file_type.is_dir() {
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
    if metadata.file_type().is_symlink() {
        let target_metadata = fs::metadata(&path).map_err(|_| "请选择有效目录".to_string())?;
        if !target_metadata.is_dir() {
            return Err("请选择有效目录".to_string());
        }
    } else if !metadata.is_dir() {
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
    let symlink_target = if metadata.file_type().is_symlink() {
        let target = match source.canonicalize() {
            Ok(target) => target,
            Err(_) => {
                skipped.push(SkillDirectoryImportSkippedItem {
                    id,
                    reason: SkillDirectoryImportSkipReason::MissingSkillMd,
                });
                return Ok(());
            }
        };
        match fs::metadata(&target) {
            Ok(target_metadata)
                if target_metadata.is_dir() && target.join("SKILL.md").is_file() =>
            {
                Some(target)
            }
            _ => {
                skipped.push(SkillDirectoryImportSkippedItem {
                    id,
                    reason: SkillDirectoryImportSkipReason::MissingSkillMd,
                });
                return Ok(());
            }
        }
    } else {
        None
    };

    if symlink_target.is_none() && !metadata.is_dir() {
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
    if let Some(target) = symlink_target {
        let dest = get_disabled_dir().join(&id);
        create_skill_dir_symlink(&target, &dest)?;
        imported.push(id);
        return Ok(());
    }

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

fn create_skill_dir_symlink(target: &Path, dest: &Path) -> Result<(), String> {
    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("创建目录失败: {}", e))?;
    }

    #[cfg(unix)]
    std::os::unix::fs::symlink(target, dest)
        .map_err(|e| format!("创建 Skill 软链接失败: {}", e))?;

    #[cfg(windows)]
    std::os::windows::fs::symlink_dir(target, dest)
        .map_err(|e| format!("创建 Skill 软链接失败: {}", e))?;

    Ok(())
}

/// 删除一个软链接节点本身（不影响目标）。Windows 上目录软链接必须用 `remove_dir`，
/// 文件软链接用 `remove_file`；Unix 上 `remove_file` 即可。
fn remove_symlink_node(path: &Path) -> std::io::Result<()> {
    #[cfg(unix)]
    {
        std::fs::remove_file(path)
    }
    #[cfg(windows)]
    {
        // 软链接节点本身的 metadata::is_dir() 永远为 false（file_type 是 symlink），
        // 必须用 FileTypeExt::is_symlink_dir() 才能区分 dir reparse point 与 file reparse point
        use std::os::windows::fs::FileTypeExt;
        let metadata = std::fs::symlink_metadata(path)?;
        if metadata.file_type().is_symlink_dir() {
            std::fs::remove_dir(path)
        } else {
            std::fs::remove_file(path)
        }
    }
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

fn copy_skill_dir_resolving_symlinks(source: &Path, target: &Path) -> Result<(), String> {
    let mut ancestors = Vec::new();
    copy_dir_entries_resolving_symlinks(source, target, &mut ancestors)
}

fn copy_dir_entries_resolving_symlinks(
    source: &Path,
    target: &Path,
    ancestors: &mut Vec<PathBuf>,
) -> Result<(), String> {
    let canonical_source = source
        .canonicalize()
        .map_err(|e| format!("解析 Skill 源目录失败: {}", e))?;
    if ancestors
        .iter()
        .any(|ancestor| ancestor == &canonical_source)
    {
        return Err("复制 Skill 目录失败: 软链接形成循环".to_string());
    }
    ancestors.push(canonical_source);

    fs::create_dir_all(target).map_err(|e| format!("创建 Skill 目录失败: {}", e))?;
    let mut entries = fs::read_dir(source)
        .map_err(|e| format!("读取 Skill 源目录失败: {}", e))?
        .flatten()
        .collect::<Vec<_>>();
    entries.sort_by_key(|entry| entry.file_name());

    for entry in entries {
        copy_entry_resolving_symlinks(&entry.path(), &target.join(entry.file_name()), ancestors)?;
    }

    ancestors.pop();
    Ok(())
}

fn copy_entry_resolving_symlinks(
    source: &Path,
    target: &Path,
    ancestors: &mut Vec<PathBuf>,
) -> Result<(), String> {
    let metadata = fs::symlink_metadata(source).map_err(|e| format!("读取 Skill 源失败: {}", e))?;
    let file_type = metadata.file_type();

    if file_type.is_symlink() {
        let target_metadata =
            fs::metadata(source).map_err(|e| format!("读取 Skill 软链接目标失败: {}", e))?;
        if target_metadata.is_dir() {
            copy_dir_entries_resolving_symlinks(source, target, ancestors)
        } else if target_metadata.is_file() {
            copy_file_resolving_symlink(source, target)
        } else {
            Ok(())
        }
    } else if metadata.is_dir() {
        copy_dir_entries_resolving_symlinks(source, target, ancestors)
    } else if metadata.is_file() {
        copy_file_resolving_symlink(source, target)
    } else {
        Ok(())
    }
}

fn copy_file_resolving_symlink(source: &Path, target: &Path) -> Result<(), String> {
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("创建目录失败: {}", e))?;
    }
    fs::copy(source, target).map_err(|e| format!("复制文件失败: {}", e))?;
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
                remove_symlink_node(&dest).map_err(|e| format!("删除旧的软链接失败: {}", e))?;
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

    #[cfg(unix)]
    fn create_test_file_symlink(src: &Path, dest: &Path) {
        std::os::unix::fs::symlink(src, dest).expect("应可创建文件软链接");
    }

    #[cfg(windows)]
    fn create_test_file_symlink(src: &Path, dest: &Path) {
        std::os::windows::fs::symlink_file(src, dest).expect("应可创建文件软链接");
    }

    fn file_exists(path: &Path) -> bool {
        path.try_exists().expect("文件存在性检查应成功")
    }

    fn load_skill_json_schema() -> serde_json::Value {
        let json_schema_str = include_str!("../../src/schemas/skill.schema.json");
        serde_json::from_str(json_schema_str).expect("Skill JSON Schema 格式不合法")
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
    fn scan_skills_dir_marks_plain_dir_as_local_directory() {
        let env = TestEnv::new("scan-local-directory");
        write_skill_dir(&env.active_skill_dir("plain-skill"), "Plain Skill");

        let skills = scan_skills_dir(&get_skills_dir(), true);

        assert_eq!(skills.len(), 1);
        assert_eq!(skills[0].id, "plain-skill");
        assert!(!skills[0].is_symlink);
        assert!(!skills[0].has_symlink_content);
        assert_eq!(skills[0].link_target, None);
    }

    #[test]
    fn scan_skills_dir_marks_directory_symlink() {
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
        assert!(skills[0].is_symlink);
        assert!(skills[0].has_symlink_content);
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
    fn scan_skills_dir_marks_internal_symlink_content() {
        let env = TestEnv::new("scan-internal-symlink");
        let skill_dir = env.active_skill_dir("plain-skill");
        write_skill_dir(&skill_dir, "Plain Skill");
        let external = env.root.join("external").join("support");
        fs::create_dir_all(&external).expect("应可创建外部目录");
        create_test_dir_symlink(&external, &skill_dir.join("linked-support"));

        let skills = scan_skills_dir(&get_skills_dir(), true);

        assert_eq!(skills.len(), 1);
        assert_eq!(skills[0].id, "plain-skill");
        assert!(!skills[0].is_symlink);
        assert!(skills[0].has_symlink_content);
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
        assert!(toggled.is_symlink);
        assert!(!file_exists(&env.active_skill_dir("linked-skill")));
        assert!(fs::symlink_metadata(env.disabled_skill_dir("linked-skill"))
            .expect("禁用目录应存在软链接节点")
            .file_type()
            .is_symlink());
        assert!(file_exists(&external.join("SKILL.md")));
    }

    #[test]
    fn toggle_skill_keeps_relative_symlink_visible_after_disabling() {
        let env = TestEnv::new("toggle-relative-symlink");
        let external = env.root.join("external").join("linked-skill");
        write_skill_dir(&external, "Linked Skill");
        fs::create_dir_all(env.active_skill_dir("linked-skill").parent().unwrap())
            .expect("应可创建 Skills 根目录");
        create_test_dir_symlink(
            Path::new("../../external/linked-skill"),
            &env.active_skill_dir("linked-skill"),
        );

        let toggled = toggle_skill("linked-skill".to_string(), true).expect("应可禁用相对软链接");
        let skills = get_skills().expect("应可重新扫描 Skills");
        let scanned = skills
            .iter()
            .find(|skill| skill.id == "linked-skill")
            .expect("禁用后的相对软链接仍应出现在列表中");

        assert!(!toggled.is_active);
        assert!(toggled.is_symlink);
        assert!(!scanned.is_active);
        assert!(scanned.is_symlink);
        assert_eq!(
            scanned.link_target.as_deref(),
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
    fn scan_disabled_symlink_recovers_relative_target_moved_from_active_dir() {
        let env = TestEnv::new("scan-moved-relative-symlink");
        let external = env.root.join("external").join("linked-skill");
        write_skill_dir(&external, "Linked Skill");
        fs::create_dir_all(env.disabled_skill_dir("linked-skill").parent().unwrap())
            .expect("应可创建禁用目录");
        create_test_dir_symlink(
            Path::new("../../external/linked-skill"),
            &env.disabled_skill_dir("linked-skill"),
        );

        let skills = scan_skills_dir(&get_disabled_dir(), false);

        assert_eq!(skills.len(), 1);
        assert_eq!(skills[0].id, "linked-skill");
        assert_eq!(skills[0].name, "Linked Skill");
        assert!(!skills[0].is_active);
        assert!(skills[0].is_symlink);
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
    fn update_skill_rejects_symlink_skill_roots() {
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
    }

    #[test]
    fn skill_file_tree_lists_support_files_without_content_and_skips_symlinks() {
        let env = TestEnv::new("file-tree");
        let skill_dir = env.active_skill_dir("tree-skill");
        write_skill_dir(&skill_dir, "Tree Skill");
        fs::create_dir_all(skill_dir.join("scripts")).expect("应可创建支持文件目录");
        fs::write(skill_dir.join("examples.md"), "普通支持文件").expect("应可写入支持文件");
        fs::write(skill_dir.join("scripts/helper.sh"), "#!/bin/sh").expect("应可写入脚本");
        fs::write(skill_dir.join("asset.bin"), [0, 159, 146, 150]).expect("应可写入二进制文件");
        create_test_dir_symlink(&env.root, &skill_dir.join("linked-dir"));

        let tree = get_skill_file_tree("tree-skill".to_string(), true).expect("应可读取文件树");
        let paths = tree
            .iter()
            .map(|entry| entry.path.as_str())
            .collect::<Vec<_>>();

        assert!(paths.contains(&"asset.bin"));
        assert!(paths.contains(&"examples.md"));
        assert!(paths.contains(&"scripts"));
        assert!(paths.contains(&"scripts/helper.sh"));
        assert!(!paths.contains(&"SKILL.md"));
        assert!(!paths.contains(&"linked-dir"));
        assert!(tree.iter().any(|entry| {
            entry.path == "scripts" && entry.kind == SkillFileTreeEntryKind::Directory
        }));
        assert!(tree.iter().any(|entry| {
            entry.path == "asset.bin"
                && entry.kind == SkillFileTreeEntryKind::File
                && entry.is_binary
        }));
    }

    #[test]
    fn resolve_existing_skill_root_uses_symlink_target() {
        let env = TestEnv::new("open-symlink");
        let external = env.root.join("external").join("linked-skill");
        write_skill_dir(&external, "Linked Skill");
        fs::create_dir_all(env.active_skill_dir("linked-skill").parent().unwrap())
            .expect("应可创建 Skills 根目录");
        create_test_dir_symlink(&external, &env.active_skill_dir("linked-skill"));

        let skill_root =
            resolve_existing_skill_root("linked-skill", true).expect("应可解析 Skill 根目录");

        assert_eq!(
            skill_root,
            external.canonicalize().expect("源目标应可 canonicalize")
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
        // Windows 上 `read_link` 不会带 `\\?\` verbatim 前缀，`canonicalize` 会带，所以两边都 canonicalize 后再比对
        assert_eq!(
            link_target
                .canonicalize()
                .expect("软链接目标应可 canonicalize"),
            external.canonicalize().expect("源目标应可 canonicalize")
        );
    }

    #[test]
    fn duplicate_skill_copies_local_skill_as_disabled_template() {
        let env = TestEnv::new("duplicate-local-template");
        let source = env.active_skill_dir("review-skill");
        write_skill_dir(&source, "Review Skill");
        fs::create_dir_all(source.join("scripts")).expect("应可创建支持文件目录");
        fs::write(source.join("examples.md"), "示例内容").expect("应可写入支持文件");
        fs::write(source.join("scripts/helper.sh"), "#!/bin/sh").expect("应可写入脚本");
        let linked_dir_source = env.root.join("external").join("linked-dir-source");
        fs::create_dir_all(&linked_dir_source).expect("应可创建软链接目录目标");
        fs::write(linked_dir_source.join("linked.md"), "软链接目录内容")
            .expect("应可写入软链接目录目标文件");
        let linked_file_source = env.root.join("external").join("linked-file.md");
        fs::write(&linked_file_source, "软链接文件内容").expect("应可写入软链接文件目标");
        create_test_dir_symlink(&linked_dir_source, &source.join("linked-dir"));
        create_test_file_symlink(&linked_file_source, &source.join("linked-file.md"));

        let duplicated = duplicate_skill("review-skill".to_string(), true, " 副本".to_string())
            .expect("应可复制 Skill 模板");

        assert_eq!(duplicated.id, "review-skill-copy");
        assert_eq!(duplicated.name, "Review Skill 副本");
        assert_eq!(duplicated.description, "测试 Skill");
        assert_eq!(duplicated.content, "测试内容");
        assert!(!duplicated.is_active);
        assert!(!duplicated.is_symlink);
        assert!(!duplicated.has_symlink_content);
        assert_eq!(duplicated.link_target, None);
        assert!(file_exists(
            &env.active_skill_dir("review-skill").join("SKILL.md")
        ));

        let target = env.disabled_skill_dir("review-skill-copy");
        assert!(file_exists(&target.join("SKILL.md")));
        assert!(file_exists(&target.join("examples.md")));
        assert!(file_exists(&target.join("scripts/helper.sh")));
        assert!(target.join("linked-dir").is_dir());
        assert!(!fs::symlink_metadata(target.join("linked-dir"))
            .expect("副本中的软链接目录应被展开为普通目录")
            .file_type()
            .is_symlink());
        assert_eq!(
            fs::read_to_string(target.join("linked-dir").join("linked.md"))
                .expect("应可读取展开后的软链接目录内容"),
            "软链接目录内容"
        );
        assert_eq!(
            fs::read_to_string(target.join("linked-file.md")).expect("应可读取展开后的软链接文件"),
            "软链接文件内容"
        );
        assert!(!fs::symlink_metadata(target.join("linked-file.md"))
            .expect("副本中的软链接文件应被展开为普通文件")
            .file_type()
            .is_symlink());
        let raw = fs::read_to_string(target.join("SKILL.md")).expect("应可读取副本 SKILL.md");
        assert!(raw.contains("name: \"Review Skill 副本\""));
    }

    #[test]
    fn duplicate_skill_copies_symlink_source_into_local_disabled_template() {
        let env = TestEnv::new("duplicate-symlink-template");
        let external = env.root.join("external").join("linked-skill");
        write_skill_dir(&external, "Linked Skill");
        fs::write(external.join("examples.md"), "外部示例").expect("应可写入外部支持文件");
        fs::create_dir_all(env.active_skill_dir("linked-skill").parent().unwrap())
            .expect("应可创建 Skills 根目录");
        create_test_dir_symlink(&external, &env.active_skill_dir("linked-skill"));

        let duplicated = duplicate_skill("linked-skill".to_string(), true, " 副本".to_string())
            .expect("应可从软链接 Skill 复制本地模板");

        assert_eq!(duplicated.id, "linked-skill-copy");
        assert_eq!(duplicated.name, "Linked Skill 副本");
        assert!(!duplicated.is_active);
        assert!(!duplicated.is_symlink);
        assert!(!duplicated.has_symlink_content);
        assert_eq!(duplicated.link_target, None);
        assert!(file_exists(&external.join("SKILL.md")));
        assert!(file_exists(
            &env.disabled_skill_dir("linked-skill-copy")
                .join("examples.md")
        ));
        assert!(
            !fs::symlink_metadata(env.disabled_skill_dir("linked-skill-copy"))
                .expect("副本应为普通目录")
                .file_type()
                .is_symlink()
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
        assert!(!imported.is_symlink);
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

        assert_eq!(result.imported, vec!["linked-skill", "valid-skill"]);
        assert!(file_exists(
            &env.disabled_skill_dir("valid-skill").join("SKILL.md")
        ));
        assert!(fs::symlink_metadata(env.disabled_skill_dir("linked-skill"))
            .expect("导入的软链接 Skill 应存在")
            .file_type()
            .is_symlink());
        let imported_link = result
            .skills
            .iter()
            .find(|skill| skill.id == "linked-skill")
            .expect("返回列表应包含软链接 Skill");
        assert!(!imported_link.is_active);
        assert!(imported_link.is_symlink);
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
    }

    #[test]
    fn import_skills_from_directory_imports_symlink_root_as_disabled_symlink() {
        let env = TestEnv::new("import-symlink-root");
        let external = env.root.join("external").join("linked-skill");
        write_skill_dir(&external, "Linked Skill");
        let source_link = env.root.join("linked-skill");
        create_test_dir_symlink(&external, &source_link);

        let result = import_skills_from_directory(source_link.display().to_string())
            .expect("应可导入软链接 Skill");

        assert_eq!(result.imported, vec!["linked-skill"]);
        assert!(result.skipped.is_empty());
        assert!(fs::symlink_metadata(env.disabled_skill_dir("linked-skill"))
            .expect("禁用目录中应创建软链接节点")
            .file_type()
            .is_symlink());
        assert!(file_exists(&external.join("SKILL.md")));
        let imported = result
            .skills
            .iter()
            .find(|skill| skill.id == "linked-skill")
            .expect("返回列表应包含导入的软链接 Skill");
        assert_eq!(imported.name, "Linked Skill");
        assert!(!imported.is_active);
        assert!(imported.is_symlink);
        assert_eq!(
            imported.link_target.as_deref(),
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
}
