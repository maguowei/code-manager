use serde::Serialize;
use std::fs;
use std::io::Read;
use std::path::{Component, Path, PathBuf};
use std::process::Command;

const DEFAULT_MAX_ENTRIES: usize = 100_000;
const DEFAULT_MAX_DEPTH: usize = 128;
const DEFAULT_PREVIEW_BYTES: usize = 512 * 1024;
const NODE_MODULES_DIR_NAME: &str = "node_modules";

#[derive(Debug, Clone, Copy)]
pub(crate) struct ScanOptions {
    pub max_entries: usize,
    pub max_depth: usize,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
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
            "path={} size={} binary={} truncated={}",
            crate::utils::truncate(&preview.path, 160),
            preview.size,
            preview.is_binary,
            preview.truncated
        )
    });
    result
}

#[tauri::command]
pub fn open_claude_path_in_file_browser(path: String) -> Result<(), String> {
    let result = (|| {
        let root = claude_dir()?;
        let rel_path = validate_relative_claude_path(&path)?;
        let target_path = resolve_existing_path_inside_root(&root, &rel_path)?;
        open_path_in_file_browser(&target_path)
    })();
    crate::logging::log_command_result("claude_directory.open_file_browser", &result, |_| {
        format!("path={}", crate::utils::truncate(&path, 160))
    });
    result
}

#[tauri::command]
pub fn open_claude_file_in_editor(path: String) -> Result<(), String> {
    let result = (|| {
        let root = claude_dir()?;
        let rel_path = validate_relative_claude_path(&path)?;
        let target_path = resolve_existing_path_inside_root(&root, &rel_path)?;
        let metadata = fs::metadata(&target_path)
            .map_err(|e| format!("读取文件元数据失败 {:?}: {}", target_path, e))?;
        if !metadata.is_file() {
            return Err("只能用默认编辑器打开 ~/.claude 内的文件".to_string());
        }
        let preferences = crate::config::load_app_preferences();
        let editor = preferences
            .default_editor_app
            .as_deref()
            .ok_or_else(|| "请先在设置中选择默认编辑器".to_string())?;
        let app_name = editor_app_name(editor)?;
        open_path_with_app(&target_path, app_name)
    })();
    crate::logging::log_command_result("claude_directory.open_editor", &result, |_| {
        format!("path={}", crate::utils::truncate(&path, 160))
    });
    result
}

fn claude_dir() -> Result<PathBuf, String> {
    Ok(crate::utils::get_home_dir()?.join(".claude"))
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

    if !root.exists() {
        return Ok(overview);
    }
    if !root.is_dir() {
        return Err("~/.claude 不是目录".to_string());
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

    if !root.exists() {
        return Ok(listing);
    }
    if !root.is_dir() {
        return Err("~/.claude 不是目录".to_string());
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
        .map_err(|e| format!("读取目录失败 {:?}: {}", current, e))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("读取目录项失败 {:?}: {}", current, e))?;
    entries.sort_by_key(|entry| entry.file_name());

    for entry in entries {
        if listing.entries.len() >= max_entries {
            listing.truncated = true;
            listing.reached_entry_limit = true;
            return Ok(());
        }

        let file_type = entry
            .file_type()
            .map_err(|e| format!("获取文件类型失败 {:?}: {}", entry.path(), e))?;
        if file_type.is_symlink() {
            listing.skipped_symlink_count += 1;
            continue;
        }

        let path = entry.path();
        let metadata =
            fs::metadata(&path).map_err(|e| format!("读取文件元数据失败 {:?}: {}", path, e))?;
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
        .map_err(|e| format!("读取目录失败 {:?}: {}", current, e))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("读取目录项失败 {:?}: {}", current, e))?;
    entries.sort_by_key(|entry| entry.file_name());

    for entry in entries {
        if overview.entries.len() >= options.max_entries {
            overview.truncated = true;
            overview.reached_entry_limit = true;
            return Ok(());
        }

        let file_type = entry
            .file_type()
            .map_err(|e| format!("获取文件类型失败 {:?}: {}", entry.path(), e))?;
        if file_type.is_symlink() {
            overview.skipped_symlink_count += 1;
            continue;
        }

        let path = entry.path();
        let metadata =
            fs::metadata(&path).map_err(|e| format!("读取文件元数据失败 {:?}: {}", path, e))?;
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
                modified_at: metadata_mtime(&metadata),
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
                modified_at: metadata_mtime(&metadata),
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
            modified_at: metadata_mtime(metadata),
        }));
    }
    if metadata.is_file() {
        return Ok(Some(ClaudeDirectoryEntry {
            path: rel_path,
            name,
            kind: ClaudeDirectoryEntryKind::File,
            size: metadata.len(),
            modified_at: metadata_mtime(metadata),
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
    let metadata = fs::metadata(&file_path)
        .map_err(|e| format!("读取文件元数据失败 {:?}: {}", file_path, e))?;
    if !metadata.is_file() {
        return Err("只能读取 ~/.claude 内的文件".to_string());
    }

    let mut file =
        fs::File::open(&file_path).map_err(|e| format!("打开文件失败 {:?}: {}", file_path, e))?;
    let read_limit = max_bytes.saturating_add(1) as u64;
    let mut bytes = Vec::new();
    file.by_ref()
        .take(read_limit)
        .read_to_end(&mut bytes)
        .map_err(|e| format!("读取文件失败 {:?}: {}", file_path, e))?;

    let truncated = bytes.len() > max_bytes;
    if truncated {
        bytes.truncate(max_bytes);
    }

    let (content, is_binary) = match String::from_utf8(bytes) {
        Ok(content) => (content, false),
        Err(_) => (String::new(), true),
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
        modified_at: metadata_mtime(&metadata),
    })
}

fn validate_relative_claude_path(path: &str) -> Result<PathBuf, String> {
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

fn resolve_existing_path_inside_root(root: &Path, rel_path: &Path) -> Result<PathBuf, String> {
    let root_canonical =
        fs::canonicalize(root).map_err(|e| format!("解析 ~/.claude 目录失败: {}", e))?;
    let mut current = root.to_path_buf();
    for component in rel_path.components() {
        current.push(component.as_os_str());
        let metadata = fs::symlink_metadata(&current)
            .map_err(|e| format!("访问文件失败 {:?}: {}", current, e))?;
        if metadata.file_type().is_symlink() {
            return Err("只能读取 ~/.claude 内的文件".to_string());
        }
    }

    let current_canonical =
        fs::canonicalize(&current).map_err(|e| format!("解析文件路径失败 {:?}: {}", current, e))?;
    if !current_canonical.starts_with(root_canonical) {
        return Err("只能读取 ~/.claude 内的文件".to_string());
    }

    Ok(current)
}

fn relative_path(root: &Path, path: &Path) -> Result<String, String> {
    let rel = path.strip_prefix(root).map_err(|e| e.to_string())?;
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

fn metadata_mtime(metadata: &fs::Metadata) -> u64 {
    metadata
        .modified()
        .ok()
        .map(crate::utils::systime_to_secs)
        .unwrap_or(0)
}

fn editor_app_name(app: &str) -> Result<&'static str, String> {
    crate::config::EDITOR_APPS
        .iter()
        .find(|(slug, _)| *slug == app)
        .map(|(_, display)| *display)
        .ok_or_else(|| "默认编辑器配置无效，请重新选择".to_string())
}

fn open_path_in_file_browser(path: &Path) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        run_command_status(Command::new("open").arg("-R").arg(path), "打开文件浏览器")
    }

    #[cfg(target_os = "linux")]
    {
        let target = if path.is_dir() {
            path
        } else {
            path.parent().unwrap_or(path)
        };
        run_command_status(Command::new("xdg-open").arg(target), "打开文件浏览器")
    }

    #[cfg(target_os = "windows")]
    {
        let selector = format!("/select,{}", path.to_string_lossy());
        run_command_status(Command::new("explorer").arg(selector), "打开文件浏览器")
    }

    #[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
    {
        let _ = path;
        Err("当前平台暂不支持打开文件浏览器".to_string())
    }
}

fn open_path_with_app(path: &Path, app_name: &str) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        run_command_status(
            Command::new("open").arg("-a").arg(app_name).arg(path),
            app_name,
        )
    }

    #[cfg(not(target_os = "macos"))]
    {
        let _ = (path, app_name);
        Err("当前平台暂不支持打开本地应用".to_string())
    }
}

fn run_command_status(command: &mut Command, action_name: &str) -> Result<(), String> {
    let status = command
        .status()
        .map_err(|e| format!("{}失败: {}", action_name, e))?;
    if status.success() {
        Ok(())
    } else {
        Err(format!("{}失败，退出码: {:?}", action_name, status.code()))
    }
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

        let text = read_claude_file_preview_from_root(&env.claude_dir(), "settings.json", 512)
            .expect("文本预览应成功");
        assert_eq!(text.content, "{\"model\":\"sonnet\"}");
        assert!(!text.is_binary);
        assert!(!text.truncated);

        let binary = read_claude_file_preview_from_root(&env.claude_dir(), "binary.bin", 512)
            .expect("二进制预览应成功");
        assert_eq!(binary.content, "");
        assert!(binary.is_binary);

        let truncated = read_claude_file_preview_from_root(&env.claude_dir(), "long.txt", 3)
            .expect("截断预览应成功");
        assert_eq!(truncated.content, "abc");
        assert!(truncated.truncated);
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
