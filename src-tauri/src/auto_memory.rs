//! 项目自动记忆（auto-memory）查看支持。
//!
//! Claude Code 在工作时自己写的跨会话笔记，按项目存放在
//! `~/.claude/projects/<编码>/memory/`（含 `MEMORY.md` 索引与若干主题 markdown）。
//! 编码规则与 git 仓库根有关（见 `history::encoded_project_path`）。
//!
//! 本模块只做「解析 memory 目录 + 读取设置状态」，遍历/预览/删除全部委托给
//! `claude_directory` 的 root-based helper（已内置软链、`..`、绝对路径越界防护）。

use std::fs;
use std::path::{Component, Path, PathBuf};

use serde::Serialize;

use crate::claude_directory::{
    delete_claude_directory_entry_in_root, read_claude_file_preview_from_root,
    resolve_existing_path_inside_root, scan_claude_directory_with_options,
    validate_relative_claude_path, ClaudeDirectoryEntryKind, ClaudeDirectoryOverview,
    ClaudeFilePreview, ScanOptions,
};

const AUTO_MEMORY_OVERVIEW_MAX_ENTRIES: usize = 10_000;
const AUTO_MEMORY_OVERVIEW_MAX_DEPTH: usize = 16;
const AUTO_MEMORY_PREVIEW_MAX_BYTES: usize = 512 * 1024;
/// 未配置默认编辑器的稳定错误码，前端据此映射友好文案，与 project.rs 保持一致。
const EDITOR_NOT_CONFIGURED_ERROR: &str = "editor_not_configured";
/// memory 目录在 ~/.claude 之外时，浏览/读取/删除一律拒绝，仅在状态里展示路径。
const MEMORY_DIR_OUTSIDE_ERROR: &str = "记忆目录在 ~/.claude 之外，请用文件管理器或编辑器查看";

#[derive(Debug, Clone, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ProjectAutoMemoryStatus {
    /// `autoMemoryEnabled`（默认开启）；缺省即视为启用。
    pub enabled: bool,
    /// 设置里的 `autoMemoryDirectory` 原始值（绝对或 `~/` 开头）；未自定义为 None。
    pub directory_override: Option<String>,
    /// 解析后的 memory 目录是否位于 ~/.claude 内；为 false 时不提供应用内浏览。
    pub is_inside_claude_dir: bool,
    /// memory 目录是否存在。
    pub exists: bool,
    /// memory 目录内的文件数（递归，不含目录条目）。
    pub memory_file_count: usize,
    /// 解析后的 memory 目录展示路径。
    pub resolved_dir_label: String,
}

/// memory 目录解析结果。
struct MemoryDirResolution {
    dir: PathBuf,
    is_override: bool,
}

fn claude_dir() -> Result<PathBuf, String> {
    crate::utils::get_claude_dir()
}

/// 把 `~/` 或 `~` 开头的路径展开为绝对路径；其它原样返回。
fn expand_tilde(home: &Path, value: &str) -> PathBuf {
    if value == "~" {
        return home.to_path_buf();
    }
    if let Some(rest) = value.strip_prefix("~/") {
        return home.join(rest);
    }
    PathBuf::from(value)
}

/// `autoMemoryDirectory` 仅接受绝对路径或 `~/` 开头（与官方文档一致），否则忽略。
fn is_valid_directory_override(value: &str) -> bool {
    value == "~" || value.starts_with("~/") || Path::new(value).is_absolute()
}

fn default_memory_dir(claude_dir: &Path, base: &str) -> PathBuf {
    claude_dir
        .join("projects")
        .join(crate::history::encoded_project_path(base))
        .join("memory")
}

/// 解析项目对应的 memory 目录：
/// 1. 设置了 `autoMemoryDirectory` → 直接展开为该目录；
/// 2. 否则按 `repo_root`（优先）/ `project` 编码到 `~/.claude/projects/<编码>/memory`；
/// 3. repo_root 推导的目录不存在但 project 推导的存在时，回退到后者（兼容 cwd≠repo root）。
fn resolve_memory_dir(
    project: &str,
    repo_root: Option<&str>,
    dir_override: Option<&str>,
) -> Result<MemoryDirResolution, String> {
    let home = crate::utils::get_home_dir()?;
    let claude_dir = home.join(".claude");

    if let Some(value) = dir_override {
        return Ok(MemoryDirResolution {
            dir: expand_tilde(&home, value),
            is_override: true,
        });
    }

    let mut candidates: Vec<&str> = Vec::new();
    if let Some(repo_root) = repo_root.map(str::trim).filter(|value| !value.is_empty()) {
        candidates.push(repo_root);
    }
    let project = project.trim();
    if !project.is_empty() && !candidates.contains(&project) {
        candidates.push(project);
    }

    // 优先取「编码目录已存在」的候选，否则回退到第一个候选（repo_root 优先）
    let mut dirs = candidates
        .into_iter()
        .map(|base| default_memory_dir(&claude_dir, base));
    let first = dirs.next().ok_or_else(|| "项目路径不能为空".to_string())?;
    let dir = if first.is_dir() {
        first
    } else {
        dirs.find(|dir| dir.is_dir()).unwrap_or(first)
    };
    Ok(MemoryDirResolution {
        dir,
        is_override: false,
    })
}

/// 校验输入的项目路径：非空、无 NUL、绝对路径。
fn validate_project_input(project: &str) -> Result<(), String> {
    let trimmed = project.trim();
    if trimmed.is_empty() {
        return Err("项目路径不能为空".to_string());
    }
    if trimmed.contains('\0') {
        return Err("项目路径包含非法字符".to_string());
    }
    if !Path::new(trimmed).is_absolute() {
        return Err("项目路径必须是绝对路径".to_string());
    }
    Ok(())
}

/// 读取 auto-memory 相关设置：按 user < project < local 优先级合并。
/// `autoMemoryEnabled` 默认 true；`autoMemoryDirectory` 仅接受合法的绝对 / `~/` 路径。
fn read_auto_memory_settings(claude_dir: &Path, project: &str) -> (bool, Option<String>) {
    let project_claude = Path::new(project).join(".claude");
    let files = [
        claude_dir.join("settings.json"),
        project_claude.join("settings.json"),
        project_claude.join("settings.local.json"),
    ];

    let mut enabled = true;
    let mut dir_override: Option<String> = None;
    for file in files {
        let value: serde_json::Value = crate::utils::read_json_file(&file);
        if let Some(flag) = value.get("autoMemoryEnabled").and_then(|v| v.as_bool()) {
            enabled = flag;
        }
        if let Some(dir) = value.get("autoMemoryDirectory").and_then(|v| v.as_str()) {
            let dir = dir.trim();
            if is_valid_directory_override(dir) {
                dir_override = Some(dir.to_string());
            }
        }
    }
    (enabled, dir_override)
}

/// 统计 memory 目录内的文件数（递归），目录缺失返回 0。
fn count_memory_files(dir: &Path) -> usize {
    if !dir.is_dir() {
        return 0;
    }
    scan_claude_directory_with_options(
        dir,
        ScanOptions {
            max_entries: AUTO_MEMORY_OVERVIEW_MAX_ENTRIES,
            max_depth: AUTO_MEMORY_OVERVIEW_MAX_DEPTH,
        },
    )
    .map(|overview| {
        overview
            .entries
            .iter()
            .filter(|entry| entry.kind == ClaudeDirectoryEntryKind::File)
            .count()
    })
    .unwrap_or(0)
}

fn strip_memory_dir_prefix(memory_dir: &Path, claude_dir: &Path) -> Option<PathBuf> {
    if let Ok(rel_path) = memory_dir.strip_prefix(claude_dir) {
        return Some(rel_path.to_path_buf());
    }

    #[cfg(any(target_os = "macos", windows))]
    {
        let mut memory_components = memory_dir.components();
        for claude_component in claude_dir.components() {
            let memory_component = memory_components.next()?;
            if !memory_component
                .as_os_str()
                .to_string_lossy()
                .eq_ignore_ascii_case(&claude_component.as_os_str().to_string_lossy())
            {
                return None;
            }
        }

        let mut rel_path = PathBuf::new();
        for component in memory_components {
            rel_path.push(component.as_os_str());
        }
        Some(rel_path)
    }

    #[cfg(not(any(target_os = "macos", windows)))]
    None
}

/// 判断 memory 目录是否安全地位于 ~/.claude 树内。
///
/// 这里不能只做字符串/组件前缀判断：memory 目录本身或其中某个已存在父目录
/// 可能是软链，后续 root-based helper 会把这个软链目标当作新的根目录。
fn is_safe_memory_dir_inside_claude_dir(memory_dir: &Path, claude_dir: &Path) -> bool {
    let rel_path = match strip_memory_dir_prefix(memory_dir, claude_dir) {
        Some(path) => path,
        None => return false,
    };
    if rel_path
        .components()
        .any(|component| !matches!(component, Component::Normal(_)))
    {
        return false;
    }

    let mut current = claude_dir.to_path_buf();
    for component in rel_path.components() {
        current.push(component.as_os_str());
        match fs::symlink_metadata(&current) {
            Ok(metadata) if metadata.file_type().is_symlink() => return false,
            Ok(_) => {}
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => break,
            Err(_) => return false,
        }
    }

    let claude_dir_canonical = match fs::canonicalize(claude_dir) {
        Ok(path) => path,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return true,
        Err(_) => return false,
    };
    match fs::canonicalize(memory_dir) {
        Ok(path) => path.starts_with(claude_dir_canonical),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => true,
        Err(_) => false,
    }
}

fn is_existing_memory_dir_inside_claude_dir(memory_dir: &Path, claude_dir: &Path) -> bool {
    match fs::symlink_metadata(memory_dir) {
        Ok(metadata) if metadata.file_type().is_symlink() => return false,
        Ok(_) => {}
        Err(_) => return false,
    }
    match fs::metadata(memory_dir) {
        Ok(metadata) if metadata.is_dir() => {}
        Ok(_) | Err(_) => return false,
    }
    let claude_dir_canonical = match fs::canonicalize(claude_dir) {
        Ok(path) => path,
        Err(_) => return false,
    };
    match fs::canonicalize(memory_dir) {
        Ok(path) => path.starts_with(claude_dir_canonical),
        Err(_) => false,
    }
}

/// 解析出可浏览的 memory 目录：必须在 ~/.claude 内，否则拒绝（仅状态展示）。
fn resolve_browsable_memory_dir(project: &str, repo_root: Option<&str>) -> Result<PathBuf, String> {
    validate_project_input(project)?;
    let claude_dir = claude_dir()?;
    let (_, dir_override) = read_auto_memory_settings(&claude_dir, project.trim());
    let resolution = resolve_memory_dir(project, repo_root, dir_override.as_deref())?;
    if !is_safe_memory_dir_inside_claude_dir(&resolution.dir, &claude_dir) {
        return Err(MEMORY_DIR_OUTSIDE_ERROR.to_string());
    }
    Ok(resolution.dir)
}

#[tauri::command]
#[specta::specta]
pub fn get_project_auto_memory_status(
    project: &str,
    repo_root: Option<String>,
) -> Result<ProjectAutoMemoryStatus, String> {
    let result = (|| {
        validate_project_input(project)?;
        let claude_dir = claude_dir()?;
        let (enabled, dir_override) = read_auto_memory_settings(&claude_dir, project.trim());
        let resolution =
            resolve_memory_dir(project, repo_root.as_deref(), dir_override.as_deref())?;
        let is_inside_claude_dir =
            is_safe_memory_dir_inside_claude_dir(&resolution.dir, &claude_dir);
        let exists = resolution.dir.is_dir();
        let memory_file_count = if is_inside_claude_dir {
            count_memory_files(&resolution.dir)
        } else {
            0
        };
        Ok(ProjectAutoMemoryStatus {
            enabled,
            directory_override: if resolution.is_override {
                dir_override
            } else {
                None
            },
            is_inside_claude_dir,
            exists,
            memory_file_count,
            resolved_dir_label: crate::utils::normalize_path_for_display(&resolution.dir),
        })
    })();
    crate::logging::log_command_result("auto_memory.status", &result, |status| {
        format!(
            "enabled={} inside={} exists={} files={}",
            status.enabled, status.is_inside_claude_dir, status.exists, status.memory_file_count
        )
    });
    result
}

#[tauri::command]
#[specta::specta]
pub fn get_project_auto_memory_overview(
    project: &str,
    repo_root: Option<String>,
) -> Result<ClaudeDirectoryOverview, String> {
    let result = (|| {
        let memory_dir = resolve_browsable_memory_dir(project, repo_root.as_deref())?;
        scan_claude_directory_with_options(
            &memory_dir,
            ScanOptions {
                max_entries: AUTO_MEMORY_OVERVIEW_MAX_ENTRIES,
                max_depth: AUTO_MEMORY_OVERVIEW_MAX_DEPTH,
            },
        )
    })();
    crate::logging::log_command_result("auto_memory.overview", &result, |overview| {
        format!(
            "entry_count={} truncated={}",
            overview.entries.len(),
            overview.truncated
        )
    });
    result
}

#[tauri::command]
#[specta::specta]
pub fn read_project_auto_memory_file(
    project: &str,
    repo_root: Option<String>,
    relative_path: String,
) -> Result<ClaudeFilePreview, String> {
    let result = (|| {
        let memory_dir = resolve_browsable_memory_dir(project, repo_root.as_deref())?;
        read_claude_file_preview_from_root(
            &memory_dir,
            &relative_path,
            AUTO_MEMORY_PREVIEW_MAX_BYTES,
        )
    })();
    crate::logging::log_command_result("auto_memory.preview", &result, |preview| {
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
#[specta::specta]
pub fn delete_project_auto_memory_entry(
    project: &str,
    repo_root: Option<String>,
    relative_path: String,
) -> Result<(), String> {
    let result = (|| {
        let memory_dir = resolve_browsable_memory_dir(project, repo_root.as_deref())?;
        // 空相对路径表示清空整个 memory 目录；否则删除目录内的单个条目。
        if relative_path.trim().is_empty() {
            if memory_dir.is_dir() {
                let claude_dir = claude_dir()?;
                if !is_existing_memory_dir_inside_claude_dir(&memory_dir, &claude_dir) {
                    return Err(MEMORY_DIR_OUTSIDE_ERROR.to_string());
                }
                fs::remove_dir_all(&memory_dir).map_err(|_| "删除记忆目录失败".to_string())?;
            }
            return Ok(());
        }
        delete_claude_directory_entry_in_root(&memory_dir, &relative_path)
    })();
    crate::logging::log_command_result("auto_memory.delete", &result, |_| {
        format!(
            "project={} rel={}",
            crate::utils::truncate(project, 160),
            crate::utils::truncate(&relative_path, 160)
        )
    });
    result
}

#[tauri::command]
#[specta::specta]
pub fn open_project_auto_memory_file_in_editor(
    project: &str,
    repo_root: Option<String>,
    relative_path: String,
) -> Result<(), String> {
    let result = (|| {
        let memory_dir = resolve_browsable_memory_dir(project, repo_root.as_deref())?;
        let rel_path = validate_relative_claude_path(&relative_path)
            .map_err(|_| "只能打开记忆目录内的文件".to_string())?;
        let target = resolve_existing_path_inside_root(&memory_dir, &rel_path)
            .map_err(|_| "只能打开记忆目录内的文件".to_string())?;
        let metadata = fs::metadata(&target).map_err(|_| "读取文件元数据失败".to_string())?;
        if !metadata.is_file() {
            return Err("只能用默认编辑器打开记忆目录内的文件".to_string());
        }
        let preferences = crate::config::load_app_preferences();
        let editor = preferences
            .default_editor_app
            .as_deref()
            .ok_or_else(|| EDITOR_NOT_CONFIGURED_ERROR.to_string())?;
        crate::native_open::open_path_in_editor(&target, editor)
    })();
    crate::logging::log_command_result("auto_memory.open_editor", &result, |_| {
        format!(
            "project={} rel={}",
            crate::utils::truncate(project, 160),
            crate::utils::truncate(&relative_path, 160)
        )
    });
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::env;
    use std::fs;
    use std::path::PathBuf;
    use std::sync::MutexGuard;
    use std::time::{SystemTime, UNIX_EPOCH};

    /// 构造一个用于路径编码的绝对项目路径(无需真实存在)。
    /// Windows 绝对路径需盘符前缀,Unix 用 `/` 前缀;两端编码一致即可。
    fn fake_project_path(segments: &str) -> String {
        let trimmed = segments.trim_start_matches('/');
        if cfg!(windows) {
            format!("C:\\{}", trimmed.replace('/', "\\"))
        } else {
            format!("/{trimmed}")
        }
    }

    struct TestEnv {
        _guard: MutexGuard<'static, ()>,
        root: PathBuf,
        previous_home: Option<std::ffi::OsString>,
    }

    impl TestEnv {
        fn new(name: &str) -> Self {
            let guard = crate::utils::TEST_ENV_LOCK
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            let suffix = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_nanos();
            let root = env::temp_dir().join(format!(
                "code-manager-auto-memory-{name}-{}-{suffix}",
                std::process::id()
            ));
            fs::create_dir_all(root.join(".claude")).expect("应可创建测试 ~/.claude 目录");
            let previous_home = env::var_os("CODE_MANAGER_HOME_OVERRIDE");
            env::set_var("CODE_MANAGER_HOME_OVERRIDE", &root);
            Self {
                _guard: guard,
                root,
                previous_home,
            }
        }

        fn claude_dir(&self) -> PathBuf {
            self.root.join(".claude")
        }

        fn memory_dir_for(&self, project: &str) -> PathBuf {
            self.claude_dir()
                .join("projects")
                .join(crate::history::encoded_project_path(project))
                .join("memory")
        }
    }

    impl Drop for TestEnv {
        fn drop(&mut self) {
            match &self.previous_home {
                Some(value) => env::set_var("CODE_MANAGER_HOME_OVERRIDE", value),
                None => env::remove_var("CODE_MANAGER_HOME_OVERRIDE"),
            }
            let _ = fs::remove_dir_all(&self.root);
        }
    }

    #[test]
    fn status_reports_default_dir_enabled_and_file_count() {
        let env = TestEnv::new("status-default");
        let project = fake_project_path("Users/test/Work/demo-app");
        let memory_dir = env.memory_dir_for(&project);
        fs::create_dir_all(&memory_dir).expect("应可创建 memory 目录");
        fs::write(memory_dir.join("MEMORY.md"), "# index").expect("应可写入索引");
        fs::write(memory_dir.join("debugging.md"), "notes").expect("应可写入主题文件");

        let status = get_project_auto_memory_status(&project, None).expect("状态应可读取");

        assert!(status.enabled, "缺省 autoMemoryEnabled 应视为启用");
        assert!(status.is_inside_claude_dir);
        assert!(status.exists);
        assert_eq!(status.memory_file_count, 2);
        assert!(status.directory_override.is_none());
    }

    #[test]
    fn status_prefers_repo_root_but_falls_back_to_project_dir() {
        let env = TestEnv::new("status-fallback");
        let repo_root = fake_project_path("Users/test/Work/monorepo");
        let project = fake_project_path("Users/test/Work/monorepo/packages/app");
        // 只有 project（cwd）编码目录存在，repo_root 的不存在 → 应回退到 project
        let project_memory = env.memory_dir_for(&project);
        fs::create_dir_all(&project_memory).expect("应可创建 project memory 目录");
        fs::write(project_memory.join("MEMORY.md"), "# index").expect("应可写入索引");

        let status =
            get_project_auto_memory_status(&project, Some(repo_root)).expect("状态应可读取");
        assert!(status.exists, "应回退到存在的 project 编码目录");
        assert_eq!(status.memory_file_count, 1);
    }

    #[test]
    fn status_reads_disabled_flag_from_project_settings() {
        let env = TestEnv::new("status-disabled");
        let project = env.root.join("workspace");
        let project_str = project.to_string_lossy().to_string();
        fs::create_dir_all(project.join(".claude")).expect("应可创建项目 .claude 目录");
        fs::write(
            project.join(".claude/settings.json"),
            "{\"autoMemoryEnabled\": false}",
        )
        .expect("应可写入项目设置");

        let status = get_project_auto_memory_status(&project_str, None).expect("状态应可读取");
        assert!(!status.enabled, "项目设置禁用时应反映为 false");
    }

    #[test]
    fn status_marks_outside_override_as_not_browsable() {
        let env = TestEnv::new("status-outside");
        let project = env.root.join("workspace");
        let project_str = project.to_string_lossy().to_string();
        let outside_dir = env.root.join("custom-memory");
        fs::create_dir_all(&outside_dir).expect("应可创建外部目录");
        fs::write(outside_dir.join("MEMORY.md"), "# index").expect("应可写入");
        fs::create_dir_all(project.join(".claude")).expect("应可创建项目 .claude 目录");
        fs::write(
            project.join(".claude/settings.json"),
            serde_json::json!({
                "autoMemoryDirectory": outside_dir.to_string_lossy()
            })
            .to_string(),
        )
        .expect("应可写入项目设置");

        let status = get_project_auto_memory_status(&project_str, None).expect("状态应可读取");
        assert!(status.directory_override.is_some());
        assert!(
            !status.is_inside_claude_dir,
            "~/.claude 外的自定义目录不可应用内浏览"
        );
        assert!(status.exists);

        let err = get_project_auto_memory_overview(&project_str, None)
            .expect_err("~/.claude 外的目录浏览应被拒绝");
        assert_eq!(err, MEMORY_DIR_OUTSIDE_ERROR);
    }

    #[test]
    fn status_rejects_parent_dir_escape_for_missing_override() {
        let env = TestEnv::new("status-parent-escape");
        let project = env.root.join("workspace");
        let project_str = project.to_string_lossy().to_string();
        fs::create_dir_all(project.join(".claude")).expect("应可创建项目 .claude 目录");
        fs::write(
            project.join(".claude/settings.json"),
            "{\"autoMemoryDirectory\": \"~/.claude/projects/../../outside-missing\"}",
        )
        .expect("应可写入项目设置");

        let status = get_project_auto_memory_status(&project_str, None).expect("状态应可读取");
        assert!(
            !status.is_inside_claude_dir,
            "包含 .. 的不存在树外路径不可应用内浏览"
        );

        let err = get_project_auto_memory_overview(&project_str, None)
            .expect_err(".. 逃逸路径浏览应被拒绝");
        assert_eq!(err, MEMORY_DIR_OUTSIDE_ERROR);
    }

    #[cfg(any(target_os = "macos", windows))]
    #[test]
    fn status_accepts_existing_case_variant_inside_claude_dir() {
        let env = TestEnv::new("status-case-variant");
        let project = env.root.join("workspace");
        let project_str = project.to_string_lossy().to_string();
        let memory_dir = env.claude_dir().join("case-memory");
        fs::create_dir_all(&memory_dir).expect("应可创建 memory 目录");
        fs::write(memory_dir.join("MEMORY.md"), "# index").expect("应可写入索引");
        fs::create_dir_all(project.join(".claude")).expect("应可创建项目 .claude 目录");
        fs::write(
            project.join(".claude/settings.json"),
            "{\"autoMemoryDirectory\": \"~/.Claude/case-memory\"}",
        )
        .expect("应可写入项目设置");

        let status = get_project_auto_memory_status(&project_str, None).expect("状态应可读取");

        assert!(status.is_inside_claude_dir);
        assert!(status.exists);
        assert_eq!(status.memory_file_count, 1);
    }

    #[test]
    fn delete_whole_dir_rejects_missing_parent_dir_escape() {
        let env = TestEnv::new("delete-parent-escape");
        let project = env.root.join("workspace");
        let project_str = project.to_string_lossy().to_string();
        fs::create_dir_all(project.join(".claude")).expect("应可创建项目 .claude 目录");
        fs::write(
            project.join(".claude/settings.json"),
            "{\"autoMemoryDirectory\": \"~/.claude/projects/../../outside-missing\"}",
        )
        .expect("应可写入项目设置");

        let err = delete_project_auto_memory_entry(&project_str, None, String::new())
            .expect_err(".. 逃逸路径清空目录应被拒绝");
        assert_eq!(err, MEMORY_DIR_OUTSIDE_ERROR);
    }

    #[cfg(unix)]
    #[test]
    fn status_marks_symlink_override_as_not_browsable() {
        let env = TestEnv::new("status-symlink-override");
        let project = env.root.join("workspace");
        let project_str = project.to_string_lossy().to_string();
        let outside_dir = env.root.join("outside-memory");
        fs::create_dir_all(&outside_dir).expect("应可创建外部目录");
        fs::write(outside_dir.join("MEMORY.md"), "# outside").expect("应可写入外部 memory");
        let linked_dir = env.claude_dir().join("linked-memory");
        std::os::unix::fs::symlink(&outside_dir, &linked_dir).expect("应可创建软链");
        fs::create_dir_all(project.join(".claude")).expect("应可创建项目 .claude 目录");
        fs::write(
            project.join(".claude/settings.json"),
            "{\"autoMemoryDirectory\": \"~/.claude/linked-memory\"}",
        )
        .expect("应可写入项目设置");

        let status = get_project_auto_memory_status(&project_str, None).expect("状态应可读取");
        assert!(
            !status.is_inside_claude_dir,
            "memory 根目录是软链时不可应用内浏览"
        );
        assert_eq!(status.memory_file_count, 0);

        let err = get_project_auto_memory_overview(&project_str, None)
            .expect_err("软链 memory 根目录浏览应被拒绝");
        assert_eq!(err, MEMORY_DIR_OUTSIDE_ERROR);
    }

    #[cfg(unix)]
    #[test]
    fn status_marks_default_symlink_memory_dir_as_not_browsable() {
        let env = TestEnv::new("status-symlink-default");
        let project = "/Users/test/Work/demo";
        let outside_dir = env.root.join("outside-default-memory");
        fs::create_dir_all(&outside_dir).expect("应可创建外部目录");
        fs::write(outside_dir.join("MEMORY.md"), "# outside").expect("应可写入外部 memory");
        let memory_dir = env.memory_dir_for(project);
        fs::create_dir_all(memory_dir.parent().expect("memory 目录应有父目录"))
            .expect("应可创建 memory 父目录");
        std::os::unix::fs::symlink(&outside_dir, &memory_dir).expect("应可创建 memory 软链");

        let status = get_project_auto_memory_status(project, None).expect("状态应可读取");
        assert!(
            !status.is_inside_claude_dir,
            "默认 memory 根目录是软链时不可应用内浏览"
        );
        assert_eq!(status.memory_file_count, 0);

        let err = get_project_auto_memory_overview(project, None)
            .expect_err("默认 memory 软链浏览应被拒绝");
        assert_eq!(err, MEMORY_DIR_OUTSIDE_ERROR);
    }

    #[test]
    fn overview_and_preview_read_memory_files() {
        let env = TestEnv::new("overview");
        let project = fake_project_path("Users/test/Work/demo");
        let memory_dir = env.memory_dir_for(&project);
        fs::create_dir_all(&memory_dir).expect("应可创建 memory 目录");
        fs::write(memory_dir.join("MEMORY.md"), "# index\n- topic").expect("应可写入索引");

        let overview = get_project_auto_memory_overview(&project, None).expect("总览应可读取");
        let paths: Vec<_> = overview.entries.iter().map(|e| e.path.as_str()).collect();
        assert_eq!(paths, vec!["MEMORY.md"]);

        let preview = read_project_auto_memory_file(&project, None, "MEMORY.md".to_string())
            .expect("预览应成功");
        assert_eq!(preview.content, "# index\n- topic");
    }

    #[test]
    fn delete_entry_and_whole_dir() {
        let env = TestEnv::new("delete");
        let project = fake_project_path("Users/test/Work/demo");
        let memory_dir = env.memory_dir_for(&project);
        fs::create_dir_all(&memory_dir).expect("应可创建 memory 目录");
        fs::write(memory_dir.join("MEMORY.md"), "# index").expect("应可写入索引");
        fs::write(memory_dir.join("api.md"), "api notes").expect("应可写入主题");

        delete_project_auto_memory_entry(&project, None, "api.md".to_string())
            .expect("应可删除单个文件");
        assert!(!memory_dir.join("api.md").exists());
        assert!(memory_dir.join("MEMORY.md").exists());

        delete_project_auto_memory_entry(&project, None, String::new())
            .expect("空路径应清空整个 memory 目录");
        assert!(!memory_dir.exists());
    }
}
