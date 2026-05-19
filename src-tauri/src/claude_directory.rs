use serde::{Deserialize, Serialize};
use std::fs;
use std::io::Read;
use std::path::{Component, Path, PathBuf};

const DEFAULT_MAX_ENTRIES: usize = 100_000;
const DEFAULT_MAX_DEPTH: usize = 128;
const DEFAULT_PREVIEW_BYTES: usize = 512 * 1024;
const NODE_MODULES_DIR_NAME: &str = "node_modules";
const PREVIEW_ENCODING_UTF8: &str = "utf-8";
const PREVIEW_ENCODING_UTF8_LOSSY: &str = "utf-8-lossy";
const PREVIEW_ENCODING_BINARY: &str = "binary";

#[derive(Debug, Clone, Copy)]
pub(crate) struct ScanOptions {
    pub max_entries: usize,
    pub max_depth: usize,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ClaudeDirectoryEntryKind {
    File,
    Directory,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeDirectoryEntry {
    pub path: String,
    pub name: String,
    pub kind: ClaudeDirectoryEntryKind,
    pub size: u64,
    pub modified_at: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeDirectoryOverview {
    pub root_path: String,
    pub max_entries: usize,
    pub max_depth: usize,
    pub entries: Vec<ClaudeDirectoryEntry>,
    pub truncated: bool,
    pub reached_entry_limit: bool,
    pub reached_depth_limit: bool,
    pub skipped_symlink_count: usize,
    pub skipped_node_modules_count: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeDirectoryListing {
    pub root_path: String,
    pub parent_path: Option<String>,
    pub max_entries: usize,
    pub entries: Vec<ClaudeDirectoryEntry>,
    pub truncated: bool,
    pub reached_entry_limit: bool,
    pub skipped_symlink_count: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeFilePreview {
    pub path: String,
    pub name: String,
    pub content: String,
    pub is_binary: bool,
    pub truncated: bool,
    pub size: u64,
    pub modified_at: u64,
    pub encoding: &'static str,
}

#[tauri::command]
pub fn get_claude_directory_overview() -> Result<ClaudeDirectoryOverview, String> {
    let root = claude_dir()?;
    let result = scan_claude_directory_with_options(
        &root,
        ScanOptions {
            max_entries: DEFAULT_MAX_ENTRIES,
            max_depth: DEFAULT_MAX_DEPTH,
        },
    );
    crate::logging::log_command_result("claude_directory.overview", &result, |overview| {
        format!(
            "entry_count={} truncated={} entry_limit={} depth_limit={} skipped_symlinks={} skipped_node_modules={}",
            overview.entries.len(),
            overview.truncated,
            overview.reached_entry_limit,
            overview.reached_depth_limit,
            overview.skipped_symlink_count,
            overview.skipped_node_modules_count
        )
    });
    result
}

#[tauri::command]
pub fn get_claude_directory_children(
    path: Option<String>,
) -> Result<ClaudeDirectoryListing, String> {
    let root = claude_dir()?;
    let result =
        list_claude_directory_children_from_root(&root, path.as_deref(), DEFAULT_MAX_ENTRIES);
    crate::logging::log_command_result("claude_directory.children", &result, |listing| {
        format!(
            "parent={} entry_count={} truncated={} entry_limit={} skipped_symlinks={}",
            listing.parent_path.as_deref().unwrap_or(""),
            listing.entries.len(),
            listing.truncated,
            listing.reached_entry_limit,
            listing.skipped_symlink_count
        )
    });
    result
}

#[tauri::command]
pub fn read_claude_file_preview(path: String) -> Result<ClaudeFilePreview, String> {
    let root = claude_dir()?;
    let result = read_claude_file_preview_from_root(&root, &path, DEFAULT_PREVIEW_BYTES);
    crate::logging::log_command_result("claude_directory.preview", &result, |preview| {
        format!(
            "path={} size={} binary={} truncated={} encoding={}",
            crate::utils::truncate(&preview.path, 160),
            preview.size,
            preview.is_binary,
            preview.truncated,
            preview.encoding
        )
    });
    result
}

#[tauri::command]
pub fn open_claude_file_in_editor(path: String) -> Result<(), String> {
    let result = (|| {
        let root = claude_dir()?;
        let rel_path = validate_relative_claude_path(&path)?;
        let target_path = resolve_existing_path_inside_root(&root, &rel_path)?;
        let metadata =
            fs::metadata(&target_path).map_err(|e| mask_io_error("读取文件元数据", &e))?;
        if !metadata.is_file() {
            return Err("只能用默认编辑器打开 ~/.claude 内的文件".to_string());
        }
        let preferences = crate::config::load_app_preferences();
        let editor = preferences
            .default_editor_app
            .as_deref()
            .ok_or_else(|| "请先在设置中选择默认编辑器".to_string())?;
        crate::native_open::open_path_in_editor(&target_path, editor)
    })();
    crate::logging::log_command_result("claude_directory.open_editor", &result, |_| {
        format!("path={}", crate::utils::truncate(&path, 160))
    });
    result
}

#[tauri::command]
pub fn create_claude_directory_entry(
    parent_path: Option<String>,
    name: String,
    kind: ClaudeDirectoryEntryKind,
) -> Result<(), String> {
    let result = (|| {
        let root = claude_dir()?;
        create_claude_directory_entry_in_root(&root, parent_path.as_deref(), &name, kind)
    })();
    crate::logging::log_command_result("claude_directory.entry.create", &result, |_| {
        format!(
            "parent={} name={} kind={:?}",
            parent_path
                .as_deref()
                .map(|path| crate::utils::truncate(path, 160))
                .unwrap_or_default(),
            crate::utils::truncate(&name, 160),
            kind
        )
    });
    result
}

#[tauri::command]
pub fn rename_claude_directory_entry(path: String, new_name: String) -> Result<(), String> {
    let result = (|| {
        let root = claude_dir()?;
        rename_claude_directory_entry_in_root(&root, &path, &new_name)
    })();
    crate::logging::log_command_result("claude_directory.entry.rename", &result, |_| {
        format!(
            "path={} new_name={}",
            crate::utils::truncate(&path, 160),
            crate::utils::truncate(&new_name, 160)
        )
    });
    result
}

#[tauri::command]
pub fn delete_claude_directory_entry(path: String) -> Result<(), String> {
    let result = (|| {
        let root = claude_dir()?;
        delete_claude_directory_entry_in_root(&root, &path)
    })();
    crate::logging::log_command_result("claude_directory.entry.delete", &result, |_| {
        format!("path={}", crate::utils::truncate(&path, 160))
    });
    result
}

fn claude_dir() -> Result<PathBuf, String> {
    Ok(crate::utils::get_home_dir()?.join(".claude"))
}

// 脱敏地包装 io::Error：仅保留动作描述与按 ErrorKind 归类的原因，
// 不再泄露具体路径或操作系统原始消息（如 "No such file or directory"）。
fn mask_io_error(action: &str, err: &std::io::Error) -> String {
    use std::io::ErrorKind;
    let reason = match err.kind() {
        ErrorKind::NotFound => "目标不存在",
        ErrorKind::PermissionDenied => "权限不足",
        _ => "操作失败",
    };
    format!("{}失败：{}", action, reason)
}

pub(crate) fn scan_claude_directory_with_options(
    root: &Path,
    options: ScanOptions,
) -> Result<ClaudeDirectoryOverview, String> {
    let mut overview = ClaudeDirectoryOverview {
        root_path: root.to_string_lossy().to_string(),
        max_entries: options.max_entries,
        max_depth: options.max_depth,
        entries: Vec::new(),
        truncated: false,
        reached_entry_limit: false,
        reached_depth_limit: false,
        skipped_symlink_count: 0,
        skipped_node_modules_count: 0,
    };

    match fs::metadata(root) {
        Ok(metadata) => {
            if !metadata.is_dir() {
                return Err("~/.claude 不是目录".to_string());
            }
        }
        Err(_) => return Ok(overview),
    }

    collect_entries(root, root, 0, options, &mut overview)?;
    Ok(overview)
}

pub(crate) fn list_claude_directory_children_from_root(
    root: &Path,
    path: Option<&str>,
    max_entries: usize,
) -> Result<ClaudeDirectoryListing, String> {
    let parent_rel_path = match path {
        Some(path) => Some(validate_relative_claude_path(path)?),
        None => None,
    };
    let parent_path = match &parent_rel_path {
        Some(rel_path) => resolve_existing_path_inside_root(root, rel_path)?,
        None => root.to_path_buf(),
    };
    let parent_path_label = parent_rel_path.as_deref().map(normalize_relative_path);
    let mut listing = ClaudeDirectoryListing {
        root_path: root.to_string_lossy().to_string(),
        parent_path: parent_path_label,
        max_entries,
        entries: Vec::new(),
        truncated: false,
        reached_entry_limit: false,
        skipped_symlink_count: 0,
    };

    match fs::metadata(root) {
        Ok(metadata) => {
            if !metadata.is_dir() {
                return Err("~/.claude 不是目录".to_string());
            }
        }
        Err(_) => return Ok(listing),
    }
    if !parent_path.is_dir() {
        return Err("只能读取 ~/.claude 内的目录".to_string());
    }

    collect_direct_entries(root, &parent_path, max_entries, &mut listing)?;
    Ok(listing)
}

fn collect_direct_entries(
    root: &Path,
    current: &Path,
    max_entries: usize,
    listing: &mut ClaudeDirectoryListing,
) -> Result<(), String> {
    let mut entries = fs::read_dir(current)
        .map_err(|e| mask_io_error("读取目录", &e))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| mask_io_error("读取目录项", &e))?;
    entries.sort_by_key(|entry| entry.file_name());

    for entry in entries {
        if listing.entries.len() >= max_entries {
            listing.truncated = true;
            listing.reached_entry_limit = true;
            return Ok(());
        }

        let file_type = entry
            .file_type()
            .map_err(|e| mask_io_error("获取文件类型", &e))?;
        if file_type.is_symlink() {
            listing.skipped_symlink_count += 1;
            continue;
        }

        let path = entry.path();
        let metadata = entry
            .metadata()
            .map_err(|e| mask_io_error("读取文件元数据", &e))?;
        let name = entry.file_name().to_string_lossy().to_string();
        if let Some(directory_entry) = claude_directory_entry(root, &path, name, &metadata)? {
            listing.entries.push(directory_entry);
        }
    }

    Ok(())
}

fn collect_entries(
    root: &Path,
    current: &Path,
    depth: usize,
    options: ScanOptions,
    overview: &mut ClaudeDirectoryOverview,
) -> Result<(), String> {
    if depth >= options.max_depth {
        overview.truncated = true;
        overview.reached_depth_limit = true;
        return Ok(());
    }

    let mut entries = fs::read_dir(current)
        .map_err(|e| mask_io_error("读取目录", &e))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| mask_io_error("读取目录项", &e))?;
    entries.sort_by_key(|entry| entry.file_name());

    for entry in entries {
        if overview.entries.len() >= options.max_entries {
            overview.truncated = true;
            overview.reached_entry_limit = true;
            return Ok(());
        }

        let file_type = entry
            .file_type()
            .map_err(|e| mask_io_error("获取文件类型", &e))?;
        if file_type.is_symlink() {
            overview.skipped_symlink_count += 1;
            continue;
        }

        let path = entry.path();
        let metadata = entry
            .metadata()
            .map_err(|e| mask_io_error("读取文件元数据", &e))?;
        let rel_path = relative_path(root, &path)?;
        let name = entry.file_name().to_string_lossy().to_string();

        if metadata.is_dir() {
            if name == NODE_MODULES_DIR_NAME {
                overview.skipped_node_modules_count += 1;
                continue;
            }
            overview.entries.push(ClaudeDirectoryEntry {
                path: rel_path,
                name,
                kind: ClaudeDirectoryEntryKind::Directory,
                size: 0,
                modified_at: crate::utils::metadata_modified_secs(&metadata),
            });
            collect_entries(root, &path, depth + 1, options, overview)?;
            if overview.reached_entry_limit {
                return Ok(());
            }
        } else if metadata.is_file() {
            overview.entries.push(ClaudeDirectoryEntry {
                path: rel_path,
                name,
                kind: ClaudeDirectoryEntryKind::File,
                size: metadata.len(),
                modified_at: crate::utils::metadata_modified_secs(&metadata),
            });
        }
    }

    Ok(())
}

fn claude_directory_entry(
    root: &Path,
    path: &Path,
    name: String,
    metadata: &fs::Metadata,
) -> Result<Option<ClaudeDirectoryEntry>, String> {
    let rel_path = relative_path(root, path)?;
    if metadata.is_dir() {
        return Ok(Some(ClaudeDirectoryEntry {
            path: rel_path,
            name,
            kind: ClaudeDirectoryEntryKind::Directory,
            size: 0,
            modified_at: crate::utils::metadata_modified_secs(metadata),
        }));
    }
    if metadata.is_file() {
        return Ok(Some(ClaudeDirectoryEntry {
            path: rel_path,
            name,
            kind: ClaudeDirectoryEntryKind::File,
            size: metadata.len(),
            modified_at: crate::utils::metadata_modified_secs(metadata),
        }));
    }
    Ok(None)
}

pub(crate) fn read_claude_file_preview_from_root(
    root: &Path,
    path: &str,
    max_bytes: usize,
) -> Result<ClaudeFilePreview, String> {
    let rel_path = validate_relative_claude_path(path)?;
    let file_path = resolve_existing_path_inside_root(root, &rel_path)?;
    let metadata = fs::metadata(&file_path).map_err(|e| mask_io_error("读取文件元数据", &e))?;
    if !metadata.is_file() {
        return Err("只能读取 ~/.claude 内的文件".to_string());
    }

    let mut file = fs::File::open(&file_path).map_err(|e| mask_io_error("打开文件", &e))?;
    let read_limit = max_bytes.saturating_add(1) as u64;
    let mut bytes = Vec::new();
    file.by_ref()
        .take(read_limit)
        .read_to_end(&mut bytes)
        .map_err(|e| mask_io_error("读取文件", &e))?;

    let truncated = bytes.len() > max_bytes;
    if truncated {
        bytes.truncate(max_bytes);
    }

    let (content, is_binary, encoding) = match String::from_utf8(bytes) {
        Ok(content) => (content, false, PREVIEW_ENCODING_UTF8),
        Err(error) => {
            let bytes = error.into_bytes();
            if bytes.contains(&0) {
                (String::new(), true, PREVIEW_ENCODING_BINARY)
            } else {
                (
                    String::from_utf8_lossy(&bytes).into_owned(),
                    false,
                    PREVIEW_ENCODING_UTF8_LOSSY,
                )
            }
        }
    };
    let normalized_path = normalize_relative_path(&rel_path);
    let name = rel_path
        .file_name()
        .map(|name| name.to_string_lossy().to_string())
        .unwrap_or_else(|| normalized_path.clone());

    Ok(ClaudeFilePreview {
        path: normalized_path,
        name,
        content,
        is_binary,
        truncated,
        size: metadata.len(),
        modified_at: crate::utils::metadata_modified_secs(&metadata),
        encoding,
    })
}

pub(crate) fn create_claude_directory_entry_in_root(
    root: &Path,
    parent_path: Option<&str>,
    name: &str,
    kind: ClaudeDirectoryEntryKind,
) -> Result<(), String> {
    ensure_claude_root_dir(root)?;
    let valid_name = validate_claude_entry_name(name)?;
    let parent = match parent_path {
        Some(parent_path) => {
            let rel_path = validate_relative_claude_operation_path(parent_path)?;
            let parent = resolve_operation_path_inside_root(root, &rel_path)?;
            let metadata =
                fs::metadata(&parent).map_err(|e| mask_io_error("读取目录元数据", &e))?;
            if !metadata.is_dir() {
                return Err("只能在 ~/.claude 内的目录中新建条目".to_string());
            }
            parent
        }
        None => root.to_path_buf(),
    };
    let target = parent.join(valid_name);
    if fs::symlink_metadata(&target).is_ok() {
        return Err("目标已存在".to_string());
    }

    match kind {
        ClaudeDirectoryEntryKind::File => {
            fs::OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(&target)
                .map_err(|e| mask_io_error("创建文件", &e))?;
        }
        ClaudeDirectoryEntryKind::Directory => {
            fs::create_dir(&target).map_err(|e| mask_io_error("创建目录", &e))?;
        }
    }
    Ok(())
}

pub(crate) fn rename_claude_directory_entry_in_root(
    root: &Path,
    path: &str,
    new_name: &str,
) -> Result<(), String> {
    let rel_path = validate_relative_claude_operation_path(path)?;
    let source = resolve_operation_path_inside_root(root, &rel_path)?;
    let metadata = fs::metadata(&source).map_err(|e| mask_io_error("读取条目元数据", &e))?;
    if !metadata.is_file() && !metadata.is_dir() {
        return Err("只能操作 ~/.claude 内的文件".to_string());
    }
    let valid_name = validate_claude_entry_name(new_name)?;
    let parent = source
        .parent()
        .ok_or_else(|| "只能操作 ~/.claude 内的文件".to_string())?;
    let target = parent.join(valid_name);
    if fs::symlink_metadata(&target).is_ok() {
        return Err("目标已存在".to_string());
    }
    fs::rename(&source, &target).map_err(|e| mask_io_error("重命名条目", &e))
}

pub(crate) fn delete_claude_directory_entry_in_root(root: &Path, path: &str) -> Result<(), String> {
    let rel_path = validate_relative_claude_operation_path(path)?;
    let target = resolve_operation_path_inside_root(root, &rel_path)?;
    let metadata = fs::metadata(&target).map_err(|e| mask_io_error("读取条目元数据", &e))?;
    if metadata.is_dir() {
        fs::remove_dir_all(&target).map_err(|e| mask_io_error("删除目录", &e))?;
        return Ok(());
    }
    if metadata.is_file() {
        fs::remove_file(&target).map_err(|e| mask_io_error("删除文件", &e))?;
        return Ok(());
    }
    Err("只能操作 ~/.claude 内的文件".to_string())
}

fn ensure_claude_root_dir(root: &Path) -> Result<(), String> {
    match fs::metadata(root) {
        Ok(metadata) if metadata.is_dir() => Ok(()),
        Ok(_) => Err("~/.claude 不是目录".to_string()),
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => {
            fs::create_dir_all(root).map_err(|e| mask_io_error("创建 ~/.claude 目录", &e))
        }
        Err(err) => Err(mask_io_error("读取 ~/.claude 目录", &err)),
    }
}

fn validate_claude_entry_name(name: &str) -> Result<&str, String> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err("名称不能为空".to_string());
    }
    if trimmed.contains('/') || trimmed.contains('\\') || trimmed.contains(':') {
        return Err("名称不能包含路径分隔符或冒号".to_string());
    }
    let mut components = Path::new(trimmed).components();
    match (components.next(), components.next()) {
        (Some(Component::Normal(part)), None) if part == trimmed => Ok(trimmed),
        _ => Err("名称无效".to_string()),
    }
}

fn validate_relative_claude_operation_path(path: &str) -> Result<PathBuf, String> {
    validate_relative_claude_path(path).map_err(|_| "只能操作 ~/.claude 内的文件".to_string())
}

fn resolve_operation_path_inside_root(root: &Path, rel_path: &Path) -> Result<PathBuf, String> {
    resolve_existing_path_inside_root(root, rel_path)
        .map_err(|_| "只能操作 ~/.claude 内的文件".to_string())
}

pub(crate) fn validate_relative_claude_path(path: &str) -> Result<PathBuf, String> {
    let trimmed = path.trim();
    if trimmed.is_empty() || trimmed.contains('\\') || trimmed.contains(':') {
        return Err("只能读取 ~/.claude 内的文件".to_string());
    }

    let path = Path::new(trimmed);
    if path.is_absolute() {
        return Err("只能读取 ~/.claude 内的文件".to_string());
    }

    let mut rel_path = PathBuf::new();
    let mut has_normal_component = false;
    for component in path.components() {
        match component {
            Component::Normal(part) => {
                has_normal_component = true;
                rel_path.push(part);
            }
            Component::CurDir
            | Component::ParentDir
            | Component::RootDir
            | Component::Prefix(_) => {
                return Err("只能读取 ~/.claude 内的文件".to_string());
            }
        }
    }

    if !has_normal_component {
        return Err("只能读取 ~/.claude 内的文件".to_string());
    }

    Ok(rel_path)
}

pub(crate) fn resolve_existing_path_inside_root(
    root: &Path,
    rel_path: &Path,
) -> Result<PathBuf, String> {
    // 所有 IO 错误统一为越界文案，防止攻击者通过错误差异判断"路径是否存在但不在白名单"。
    let root_canonical =
        fs::canonicalize(root).map_err(|_| "只能读取 ~/.claude 内的文件".to_string())?;
    let mut current = root.to_path_buf();
    for component in rel_path.components() {
        current.push(component.as_os_str());
        let metadata = fs::symlink_metadata(&current)
            .map_err(|_| "只能读取 ~/.claude 内的文件".to_string())?;
        if metadata.file_type().is_symlink() {
            return Err("只能读取 ~/.claude 内的文件".to_string());
        }
    }

    let current_canonical =
        fs::canonicalize(&current).map_err(|_| "只能读取 ~/.claude 内的文件".to_string())?;
    if !current_canonical.starts_with(root_canonical) {
        return Err("只能读取 ~/.claude 内的文件".to_string());
    }

    Ok(current)
}

fn relative_path(root: &Path, path: &Path) -> Result<String, String> {
    let rel = path
        .strip_prefix(root)
        .map_err(|_| "路径处理失败".to_string())?;
    Ok(normalize_relative_path(rel))
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
mod tests {
    use super::*;
    use std::env;
    use std::fs;
    use std::path::PathBuf;
    use std::sync::{Mutex, MutexGuard};
    use std::time::{SystemTime, UNIX_EPOCH};

    static TEST_ENV_LOCK: Mutex<()> = Mutex::new(());

    struct TestEnv {
        _guard: MutexGuard<'static, ()>,
        _config_guard: MutexGuard<'static, ()>,
        root: PathBuf,
        previous_home: Option<String>,
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
                "ai-manager-claude-directory-{name}-{}-{suffix}",
                std::process::id()
            ));
            fs::create_dir_all(root.join(".claude")).expect("应可创建测试目录");

            let previous_home = env::var("AI_MANAGER_HOME_OVERRIDE").ok();
            env::set_var("AI_MANAGER_HOME_OVERRIDE", &root);

            Self {
                _guard: guard,
                _config_guard: config_guard,
                root,
                previous_home,
            }
        }

        fn claude_dir(&self) -> PathBuf {
            self.root.join(".claude")
        }
    }

    impl Drop for TestEnv {
        fn drop(&mut self) {
            match &self.previous_home {
                Some(value) => env::set_var("AI_MANAGER_HOME_OVERRIDE", value),
                None => env::remove_var("AI_MANAGER_HOME_OVERRIDE"),
            }
            let _ = fs::remove_dir_all(&self.root);
        }
    }

    #[test]
    fn overview_default_entry_limit_is_100000() {
        assert_eq!(DEFAULT_MAX_ENTRIES, 100_000);
    }

    #[test]
    fn overview_returns_sorted_entries_and_skips_symlinks() {
        let env = TestEnv::new("overview");
        fs::create_dir_all(env.claude_dir().join("plugins/demo/node_modules/lodash"))
            .expect("应可创建 node_modules 嵌套目录");
        fs::create_dir_all(env.claude_dir().join("skills/demo")).expect("应可创建嵌套目录");
        fs::write(env.claude_dir().join("plugins/demo/index.js"), "export {}")
            .expect("应可写入插件文件");
        fs::write(
            env.claude_dir()
                .join("plugins/demo/node_modules/lodash/index.js"),
            "ignored",
        )
        .expect("应可写入依赖文件");
        fs::write(env.claude_dir().join("settings.json"), "{}").expect("应可写入配置文件");
        fs::write(env.claude_dir().join("skills/demo/SKILL.md"), "hello").expect("应可写入文件");
        create_test_symlink(&env.root, &env.claude_dir().join("escape"));

        let overview = scan_claude_directory_with_options(
            &env.claude_dir(),
            ScanOptions {
                max_entries: 100,
                max_depth: 16,
            },
        )
        .expect("目录扫描应成功");

        let paths: Vec<_> = overview
            .entries
            .iter()
            .map(|entry| entry.path.as_str())
            .collect();
        assert_eq!(
            paths,
            vec![
                "plugins",
                "plugins/demo",
                "plugins/demo/index.js",
                "settings.json",
                "skills",
                "skills/demo",
                "skills/demo/SKILL.md"
            ]
        );
        assert_eq!(overview.skipped_symlink_count, 1);
        assert_eq!(overview.skipped_node_modules_count, 1);
        assert!(!overview.truncated);
        assert!(!overview.reached_entry_limit);
        assert!(!overview.reached_depth_limit);
        assert_eq!(
            overview.entries[0].kind,
            ClaudeDirectoryEntryKind::Directory
        );
        assert_eq!(overview.entries[3].kind, ClaudeDirectoryEntryKind::File);
    }

    #[test]
    fn overview_marks_truncated_when_entry_limit_is_reached() {
        let env = TestEnv::new("limit");
        fs::write(env.claude_dir().join("a.txt"), "a").expect("应可写入文件");
        fs::write(env.claude_dir().join("b.txt"), "b").expect("应可写入文件");

        let overview = scan_claude_directory_with_options(
            &env.claude_dir(),
            ScanOptions {
                max_entries: 1,
                max_depth: 16,
            },
        )
        .expect("目录扫描应成功");

        assert_eq!(overview.entries.len(), 1);
        assert!(overview.truncated);
        assert!(overview.reached_entry_limit);
        assert!(!overview.reached_depth_limit);
    }

    #[test]
    fn overview_continues_scanning_siblings_after_depth_limit_is_reached() {
        let env = TestEnv::new("depth-limit-siblings");
        fs::create_dir_all(env.claude_dir().join("a/deep/deeper")).expect("应可创建深层目录");
        fs::write(env.claude_dir().join("z.txt"), "z").expect("应可写入同级文件");

        let overview = scan_claude_directory_with_options(
            &env.claude_dir(),
            ScanOptions {
                max_entries: 100,
                max_depth: 2,
            },
        )
        .expect("目录扫描应成功");
        let paths: Vec<_> = overview
            .entries
            .iter()
            .map(|entry| entry.path.as_str())
            .collect();

        assert!(overview.truncated);
        assert!(!overview.reached_entry_limit);
        assert!(overview.reached_depth_limit);
        assert!(paths.contains(&"z.txt"));
    }

    #[test]
    fn children_listing_returns_only_direct_entries() {
        let env = TestEnv::new("children-direct");
        fs::create_dir_all(env.claude_dir().join("scripts/eslint_rules"))
            .expect("应可创建嵌套目录");
        fs::write(env.claude_dir().join("settings.json"), "{}").expect("应可写入配置文件");
        fs::write(
            env.claude_dir().join("scripts/check-license-rule.js"),
            "export {}",
        )
        .expect("应可写入脚本文件");

        let root_listing = list_claude_directory_children_from_root(&env.claude_dir(), None, 100)
            .expect("根目录子项应可读取");
        let root_paths: Vec<_> = root_listing
            .entries
            .iter()
            .map(|entry| entry.path.as_str())
            .collect();
        assert_eq!(root_paths, vec!["scripts", "settings.json"]);
        assert!(!root_listing.truncated);

        let scripts_listing =
            list_claude_directory_children_from_root(&env.claude_dir(), Some("scripts"), 100)
                .expect("子目录子项应可读取");
        let scripts_paths: Vec<_> = scripts_listing
            .entries
            .iter()
            .map(|entry| entry.path.as_str())
            .collect();
        assert_eq!(
            scripts_paths,
            vec!["scripts/check-license-rule.js", "scripts/eslint_rules"]
        );
    }

    #[test]
    fn overview_returns_empty_when_claude_dir_is_missing() {
        let env = TestEnv::new("missing");
        fs::remove_dir_all(env.claude_dir()).expect("应可删除测试目录");

        let overview = get_claude_directory_overview().expect("缺失目录应返回空总览");

        assert_eq!(overview.entries.len(), 0);
        assert!(!overview.truncated);
        assert!(!overview.reached_entry_limit);
        assert!(!overview.reached_depth_limit);
        assert_eq!(overview.skipped_node_modules_count, 0);
    }

    #[test]
    fn preview_rejects_paths_outside_claude_dir() {
        let env = TestEnv::new("escape");
        fs::write(env.root.join("outside.txt"), "secret").expect("应可写入外部文件");

        let err = read_claude_file_preview_from_root(&env.claude_dir(), "../outside.txt", 512)
            .expect_err("路径逃逸应被拒绝");

        assert!(err.contains("只能读取 ~/.claude 内的文件"));
    }

    #[test]
    fn preview_reads_text_binary_and_truncated_files() {
        let env = TestEnv::new("preview");
        fs::write(
            env.claude_dir().join("settings.json"),
            "{\"model\":\"sonnet\"}",
        )
        .expect("应可写入文本文件");
        fs::write(env.claude_dir().join("binary.bin"), [0, 159, 146, 150])
            .expect("应可写入二进制文件");
        fs::write(env.claude_dir().join("long.txt"), "abcdef").expect("应可写入长文本");
        fs::write(env.claude_dir().join("lossy.txt"), [b'a', 0x80, b'b'])
            .expect("应可写入非 UTF-8 文本");

        let text = read_claude_file_preview_from_root(&env.claude_dir(), "settings.json", 512)
            .expect("文本预览应成功");
        assert_eq!(text.content, "{\"model\":\"sonnet\"}");
        assert!(!text.is_binary);
        assert!(!text.truncated);
        let text_json = serde_json::to_value(&text).expect("预览结果应可序列化");
        assert_eq!(text_json["encoding"], "utf-8");

        let binary = read_claude_file_preview_from_root(&env.claude_dir(), "binary.bin", 512)
            .expect("二进制预览应成功");
        assert_eq!(binary.content, "");
        assert!(binary.is_binary);
        let binary_json = serde_json::to_value(&binary).expect("预览结果应可序列化");
        assert_eq!(binary_json["encoding"], "binary");

        let lossy = read_claude_file_preview_from_root(&env.claude_dir(), "lossy.txt", 512)
            .expect("非 UTF-8 文本预览应成功");
        assert_eq!(lossy.content, "a\u{FFFD}b");
        assert!(!lossy.is_binary);
        let lossy_json = serde_json::to_value(&lossy).expect("预览结果应可序列化");
        assert_eq!(lossy_json["encoding"], "utf-8-lossy");

        let truncated = read_claude_file_preview_from_root(&env.claude_dir(), "long.txt", 3)
            .expect("截断预览应成功");
        assert_eq!(truncated.content, "abc");
        assert!(truncated.truncated);
        let truncated_json = serde_json::to_value(&truncated).expect("预览结果应可序列化");
        assert_eq!(truncated_json["encoding"], "utf-8");
    }

    #[test]
    fn mask_io_error_omits_path_and_system_message() {
        // 模拟系统会带的具体路径和 OS 原始描述，验证最终文案完全脱敏。
        let not_found = std::io::Error::new(
            std::io::ErrorKind::NotFound,
            "/Users/secret/.claude/leaked.txt: No such file or directory (os error 2)",
        );
        let masked = mask_io_error("读取目录", &not_found);
        assert_eq!(masked, "读取目录失败：目标不存在");
        assert!(!masked.contains("/Users/secret"));
        assert!(!masked.contains("leaked.txt"));
        assert!(!masked.contains("No such file"));
        assert!(!masked.contains("os error"));

        let permission_denied = std::io::Error::new(
            std::io::ErrorKind::PermissionDenied,
            "Permission denied: /etc/shadow",
        );
        let masked = mask_io_error("打开文件", &permission_denied);
        assert_eq!(masked, "打开文件失败：权限不足");
        assert!(!masked.contains("/etc/shadow"));
        assert!(!masked.contains("Permission denied"));

        let other = std::io::Error::other("Disk quota exceeded for user test-user");
        let masked = mask_io_error("读取文件", &other);
        assert_eq!(masked, "读取文件失败：操作失败");
        assert!(!masked.contains("Disk quota"));
        assert!(!masked.contains("test-user"));
    }

    #[test]
    fn preview_does_not_leak_path_or_system_error_for_missing_file() {
        let env = TestEnv::new("masked-missing");
        let err =
            read_claude_file_preview_from_root(&env.claude_dir(), "internal-secret-file.txt", 512)
                .expect_err("不存在的文件应被拒绝");

        // 路径解析阶段的 IO 错误统一为越界文案，不区分越界 vs 不存在，
        // 也不透传原始 OS 消息。
        assert_eq!(err, "只能读取 ~/.claude 内的文件");
        assert!(!err.contains("internal-secret-file"));
        assert!(!err.contains("No such file"));
        assert!(!err.contains("os error"));
    }

    #[test]
    fn create_directory_entry_writes_empty_file_and_folder() {
        let env = TestEnv::new("create-entry");
        fs::create_dir_all(env.claude_dir().join("skills")).expect("应可创建父目录");

        create_claude_directory_entry_in_root(
            &env.claude_dir(),
            Some("skills"),
            "new-skill.md",
            ClaudeDirectoryEntryKind::File,
        )
        .expect("应可创建空文件");
        create_claude_directory_entry_in_root(
            &env.claude_dir(),
            Some("skills"),
            "drafts",
            ClaudeDirectoryEntryKind::Directory,
        )
        .expect("应可创建空目录");

        assert_eq!(
            fs::read_to_string(env.claude_dir().join("skills/new-skill.md"))
                .expect("应可读取新文件"),
            ""
        );
        assert!(env.claude_dir().join("skills/drafts").is_dir());
        let overview = scan_claude_directory_with_options(
            &env.claude_dir(),
            ScanOptions {
                max_entries: 100,
                max_depth: 8,
            },
        )
        .expect("应可重新扫描目录");
        let paths = overview
            .entries
            .iter()
            .map(|entry| entry.path.as_str())
            .collect::<Vec<_>>();
        assert!(paths.contains(&"skills/new-skill.md"));
        assert!(paths.contains(&"skills/drafts"));
    }

    #[test]
    fn rename_directory_entry_moves_file_and_folder_and_rejects_existing_target() {
        let env = TestEnv::new("rename-entry");
        fs::create_dir_all(env.claude_dir().join("skills")).expect("应可创建父目录");
        fs::create_dir_all(env.claude_dir().join("drafts/nested")).expect("应可创建待重命名目录");
        fs::write(env.claude_dir().join("skills/old.md"), "hello").expect("应可写入文件");
        fs::write(env.claude_dir().join("skills/taken.md"), "taken").expect("应可写入文件");
        fs::write(env.claude_dir().join("drafts/nested/SKILL.md"), "folder")
            .expect("应可写入嵌套文件");

        rename_claude_directory_entry_in_root(&env.claude_dir(), "skills/old.md", "new.md")
            .expect("应可重命名文件");
        rename_claude_directory_entry_in_root(&env.claude_dir(), "drafts", "renamed-drafts")
            .expect("应可重命名目录");
        let err =
            rename_claude_directory_entry_in_root(&env.claude_dir(), "skills/new.md", "taken.md")
                .expect_err("重名目标应被拒绝");

        assert_eq!(
            fs::read_to_string(env.claude_dir().join("skills/new.md")).expect("应可读取新文件名"),
            "hello"
        );
        assert!(!env.claude_dir().join("skills/old.md").exists());
        assert!(env
            .claude_dir()
            .join("renamed-drafts/nested/SKILL.md")
            .is_file());
        assert!(!env.claude_dir().join("drafts").exists());
        assert!(err.contains("目标已存在"));
    }

    #[test]
    fn delete_directory_entry_removes_file_and_folder_recursively() {
        let env = TestEnv::new("delete-entry");
        fs::write(env.claude_dir().join("settings.json"), "{}").expect("应可写入文件");
        fs::create_dir_all(env.claude_dir().join("skills/demo")).expect("应可创建目录");
        fs::write(env.claude_dir().join("skills/demo/SKILL.md"), "hello").expect("应可写入文件");

        delete_claude_directory_entry_in_root(&env.claude_dir(), "settings.json")
            .expect("应可删除文件");
        delete_claude_directory_entry_in_root(&env.claude_dir(), "skills")
            .expect("应可递归删除目录");

        assert!(!env.claude_dir().join("settings.json").exists());
        assert!(!env.claude_dir().join("skills").exists());
    }

    #[test]
    fn file_operations_reject_escape_symlink_and_invalid_names() {
        let env = TestEnv::new("operation-safety");
        fs::create_dir_all(env.claude_dir().join("skills")).expect("应可创建目录");
        fs::write(env.claude_dir().join("skills/existing.md"), "hello").expect("应可写入文件");
        create_test_symlink(&env.root, &env.claude_dir().join("linked"));

        let empty_name = create_claude_directory_entry_in_root(
            &env.claude_dir(),
            Some("skills"),
            " ",
            ClaudeDirectoryEntryKind::File,
        )
        .expect_err("空名称应被拒绝");
        let nested_name = create_claude_directory_entry_in_root(
            &env.claude_dir(),
            Some("skills"),
            "nested/file.md",
            ClaudeDirectoryEntryKind::File,
        )
        .expect_err("包含路径分隔符的名称应被拒绝");
        let backslash_name = create_claude_directory_entry_in_root(
            &env.claude_dir(),
            Some("skills"),
            "nested\\file.md",
            ClaudeDirectoryEntryKind::File,
        )
        .expect_err("包含反斜杠的名称应被拒绝");
        let colon_name = create_claude_directory_entry_in_root(
            &env.claude_dir(),
            Some("skills"),
            "nested:file.md",
            ClaudeDirectoryEntryKind::File,
        )
        .expect_err("包含冒号的名称应被拒绝");
        let overwrite = create_claude_directory_entry_in_root(
            &env.claude_dir(),
            Some("skills"),
            "existing.md",
            ClaudeDirectoryEntryKind::File,
        )
        .expect_err("覆盖已有目标应被拒绝");
        let escape =
            rename_claude_directory_entry_in_root(&env.claude_dir(), "../outside.md", "next.md")
                .expect_err("路径逃逸应被拒绝");
        let symlink = delete_claude_directory_entry_in_root(&env.claude_dir(), "linked")
            .expect_err("软链接应被拒绝");

        assert!(empty_name.contains("名称不能为空"));
        assert!(nested_name.contains("名称不能包含路径分隔符"));
        assert!(backslash_name.contains("名称不能包含路径分隔符"));
        assert!(colon_name.contains("名称不能包含路径分隔符"));
        assert!(overwrite.contains("目标已存在"));
        assert!(escape.contains("只能操作 ~/.claude 内的文件"));
        assert!(symlink.contains("只能操作 ~/.claude 内的文件"));
    }

    #[cfg(unix)]
    fn create_test_symlink(src: &std::path::Path, dest: &std::path::Path) {
        std::os::unix::fs::symlink(src, dest).expect("应可创建软链接");
    }

    #[cfg(windows)]
    fn create_test_symlink(src: &std::path::Path, dest: &std::path::Path) {
        std::os::windows::fs::symlink_dir(src, dest).expect("应可创建软链接");
    }
}
