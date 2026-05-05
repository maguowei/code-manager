use crate::config::{AppPreferences, EDITOR_APPS, TERMINAL_APPS};
use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum AgentsStatus {
    Missing,
    CorrectSymlink,
    WrongSymlink,
    PlainFileConflict,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectBranch {
    pub name: String,
    pub is_current: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_commit_at: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_commit_subject: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectWorktree {
    pub path: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub branch: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub head: Option<String>,
    pub is_current: bool,
    pub is_detached: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectDetail {
    pub path: String,
    pub short_name: String,
    pub exists: bool,
    pub is_git_repo: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub repo_root: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub repository_url: Option<String>,
    pub has_claude_md: bool,
    pub agents_status: AgentsStatus,
    pub branches: Vec<ProjectBranch>,
    pub worktrees: Vec<ProjectWorktree>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectPurgeOutput {
    pub project: String,
    pub output: String,
}

#[derive(Debug, PartialEq, Eq)]
struct ProjectFileStatus {
    has_claude_md: bool,
    agents_status: AgentsStatus,
}

#[derive(Debug, PartialEq, Eq)]
struct OpenAppRequest {
    app_name: String,
    args: Vec<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ProjectPurgeMode {
    DryRun,
    Execute,
}

impl ProjectPurgeMode {
    fn flag(self) -> &'static str {
        match self {
            Self::DryRun => "--dry-run",
            Self::Execute => "--yes",
        }
    }
}

#[tauri::command]
pub fn get_project_detail(project: &str) -> Result<ProjectDetail, String> {
    let project_path = validate_project_path(project)?;
    let project_display = project_path.to_string_lossy().to_string();
    let short_name = short_project_name(&project_path);

    if !project_path.is_dir() {
        return Ok(ProjectDetail {
            path: project_display,
            short_name,
            exists: false,
            is_git_repo: false,
            repo_root: None,
            repository_url: None,
            has_claude_md: false,
            agents_status: AgentsStatus::Missing,
            branches: Vec::new(),
            worktrees: Vec::new(),
        });
    }

    let file_status = inspect_project_files(&project_path)?;
    let repo_root = git_repo_root(&project_path).ok();

    let (is_git_repo, repo_root_str, repository_url, branches, worktrees) =
        if let Some(repo_root) = repo_root {
            let branches_output = run_git(
                &project_path,
                &[
                    "for-each-ref",
                    "refs/heads",
                    "--sort=-committerdate",
                    "--format=%(refname:short)%00%(HEAD)%00%(committerdate:unix)%00%(subject)",
                ],
            )?;
            let worktrees_output = run_git(&project_path, &["worktree", "list", "--porcelain"])?;
            let repo_root_path = PathBuf::from(&repo_root);
            (
                true,
                Some(repo_root),
                resolve_repository_url(&project_path),
                parse_branches_output(&branches_output),
                parse_worktrees_output(&worktrees_output, &repo_root_path),
            )
        } else {
            (false, None, None, Vec::new(), Vec::new())
        };

    Ok(ProjectDetail {
        path: project_display,
        short_name,
        exists: true,
        is_git_repo,
        repo_root: repo_root_str,
        repository_url,
        has_claude_md: file_status.has_claude_md,
        agents_status: file_status.agents_status,
        branches,
        worktrees,
    })
}

#[tauri::command]
pub fn create_project_agents_symlink(project: &str) -> Result<(), String> {
    let result = (|| {
        let project_path = validate_project_path(project)?;
        if !project_path.is_dir() {
            return Err("项目目录不存在".to_string());
        }
        create_agents_symlink(&project_path)
    })();
    crate::logging::log_command_result("project.agents_symlink", &result, |_| {
        format!("project={}", crate::utils::truncate(project, 160))
    });
    result
}

#[tauri::command]
pub fn open_project_in_terminal(project: &str) -> Result<(), String> {
    let result = (|| {
        let project_path = validate_project_path(project)?;
        let preferences = crate::config::load_app_preferences();
        let request = build_terminal_open_request(&project_path, &preferences)?;
        run_open_app_request(&request)
    })();
    crate::logging::log_command_result("project.open_terminal", &result, |_| {
        format!("project={}", crate::utils::truncate(project, 160))
    });
    result
}

#[tauri::command]
pub fn open_project_in_editor(project: &str) -> Result<(), String> {
    let result = (|| {
        let project_path = validate_project_path(project)?;
        let preferences = crate::config::load_app_preferences();
        let request = build_editor_open_request(&project_path, &preferences)?;
        run_open_app_request(&request)
    })();
    crate::logging::log_command_result("project.open_editor", &result, |_| {
        format!("project={}", crate::utils::truncate(project, 160))
    });
    result
}

#[tauri::command]
pub fn preview_project_local_data_purge(project: &str) -> Result<ProjectPurgeOutput, String> {
    let result = run_claude_project_purge(project, ProjectPurgeMode::DryRun);
    log_project_purge_result("project.local_data_purge.preview", project, &result);
    result
}

#[tauri::command]
pub fn purge_project_local_data(project: &str) -> Result<ProjectPurgeOutput, String> {
    let result = run_claude_project_purge(project, ProjectPurgeMode::Execute);
    log_project_purge_result("project.local_data_purge.execute", project, &result);
    result
}

fn validate_project_path(project: &str) -> Result<PathBuf, String> {
    let trimmed = project.trim();
    if trimmed.is_empty() {
        return Err("项目路径不能为空".to_string());
    }
    // 防御性校验：拒绝 NUL 字符（部分系统调用的路径终止符），避免被截断绕过后续判断
    if trimmed.contains('\0') {
        return Err("项目路径包含非法字符".to_string());
    }
    let path = PathBuf::from(trimmed);
    // 项目路径应当通过文件选择对话框获得，必须是绝对路径；
    // 拒绝相对路径可避免后续命令在意外的工作目录上执行
    if !path.is_absolute() {
        return Err("项目路径必须是绝对路径".to_string());
    }
    Ok(path)
}

fn short_project_name(path: &Path) -> String {
    path.file_name()
        .map(|name| name.to_string_lossy().to_string())
        .filter(|name| !name.is_empty())
        .unwrap_or_else(|| path.to_string_lossy().to_string())
}

fn git_repo_root(project: &Path) -> Result<String, String> {
    run_git(project, &["rev-parse", "--show-toplevel"]).map(|output| output.trim().to_string())
}

fn run_git(project: &Path, args: &[&str]) -> Result<String, String> {
    let output = Command::new("git")
        .arg("-C")
        .arg(project)
        .args(args)
        .output()
        .map_err(|e| format!("执行 git 命令失败: {}", e))?;

    if output.status.success() {
        return String::from_utf8(output.stdout).map_err(|e| format!("解析 git 输出失败: {}", e));
    }

    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let message = if !stderr.is_empty() { stderr } else { stdout };
    Err(if message.is_empty() {
        format!("git 命令执行失败，退出码: {:?}", output.status.code())
    } else {
        message
    })
}

fn parse_branches_output(output: &str) -> Vec<ProjectBranch> {
    let mut branches: Vec<ProjectBranch> = output
        .lines()
        .filter_map(|line| {
            let mut parts = line.split('\0');
            let name = parts.next()?.trim();
            if name.is_empty() {
                return None;
            }

            let is_current = parts
                .next()
                .map(|value| value.trim() == "*")
                .unwrap_or(false);
            let last_commit_at = parts.next().and_then(|value| {
                let trimmed = value.trim();
                if trimmed.is_empty() || trimmed == "0" {
                    None
                } else {
                    trimmed.parse::<u64>().ok()
                }
            });
            let last_commit_subject = parts
                .next()
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(ToOwned::to_owned);

            Some(ProjectBranch {
                name: name.to_string(),
                is_current,
                last_commit_at,
                last_commit_subject,
            })
        })
        .collect();

    branches.sort_by(|a, b| {
        b.is_current
            .cmp(&a.is_current)
            .then_with(|| b.last_commit_at.cmp(&a.last_commit_at))
            .then_with(|| a.name.cmp(&b.name))
    });
    branches
}

fn parse_worktrees_output(output: &str, current_root: &Path) -> Vec<ProjectWorktree> {
    let mut worktrees = Vec::new();
    let mut current_path: Option<String> = None;
    let mut current_branch: Option<String> = None;
    let mut current_head: Option<String> = None;
    let mut current_detached = false;

    let push_current = |worktrees: &mut Vec<ProjectWorktree>,
                        current_path: &mut Option<String>,
                        current_branch: &mut Option<String>,
                        current_head: &mut Option<String>,
                        current_detached: &mut bool| {
        if let Some(path) = current_path.take() {
            let path_buf = PathBuf::from(&path);
            worktrees.push(ProjectWorktree {
                is_current: paths_match(&path_buf, current_root),
                path,
                branch: current_branch.take(),
                head: current_head.take(),
                is_detached: *current_detached,
            });
            *current_detached = false;
        }
    };

    for line in output.lines() {
        if line.trim().is_empty() {
            push_current(
                &mut worktrees,
                &mut current_path,
                &mut current_branch,
                &mut current_head,
                &mut current_detached,
            );
            continue;
        }

        if let Some(path) = line.strip_prefix("worktree ") {
            push_current(
                &mut worktrees,
                &mut current_path,
                &mut current_branch,
                &mut current_head,
                &mut current_detached,
            );
            current_path = Some(path.trim().to_string());
            continue;
        }

        if let Some(head) = line.strip_prefix("HEAD ") {
            current_head = Some(head.trim().to_string());
            continue;
        }

        if let Some(branch) = line.strip_prefix("branch ") {
            let normalized = branch.trim().trim_start_matches("refs/heads/").to_string();
            current_branch = Some(normalized);
            current_detached = false;
            continue;
        }

        if line == "detached" {
            current_detached = true;
        }
    }

    push_current(
        &mut worktrees,
        &mut current_path,
        &mut current_branch,
        &mut current_head,
        &mut current_detached,
    );

    worktrees.sort_by(|a, b| {
        b.is_current
            .cmp(&a.is_current)
            .then_with(|| a.path.cmp(&b.path))
    });
    worktrees
}

fn resolve_repository_url(project: &Path) -> Option<String> {
    let remotes_output = run_git(project, &["remote"]).ok()?;
    let mut remote_names: Vec<&str> = remotes_output
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .collect();

    remote_names.sort_unstable();
    remote_names.dedup();
    remote_names.sort_by(|left, right| {
        let left_priority = if *left == "origin" { 0 } else { 1 };
        let right_priority = if *right == "origin" { 0 } else { 1 };
        left_priority
            .cmp(&right_priority)
            .then_with(|| left.cmp(right))
    });

    for remote_name in remote_names {
        let remote_url = match run_git(project, &["remote", "get-url", remote_name]) {
            Ok(output) => output,
            Err(_) => continue,
        };

        if let Some(repository_url) = normalize_repository_url(remote_url.trim()) {
            return Some(repository_url);
        }
    }

    None
}

fn normalize_repository_url(remote_url: &str) -> Option<String> {
    let trimmed = remote_url.trim();
    if trimmed.is_empty() {
        return None;
    }

    if trimmed.starts_with("https://") || trimmed.starts_with("http://") {
        return normalize_http_repository_url(trimmed);
    }

    if let Some(url) = trimmed.strip_prefix("ssh://") {
        return normalize_ssh_repository_url(url);
    }

    normalize_scp_repository_url(trimmed)
}

fn normalize_http_repository_url(remote_url: &str) -> Option<String> {
    let scheme_end = remote_url.find("://")?;
    let scheme = &remote_url[..scheme_end];
    let remainder = &remote_url[(scheme_end + 3)..];
    let slash_index = remainder.find('/')?;
    let authority = strip_userinfo(&remainder[..slash_index]);
    let path = sanitize_repository_path(&remainder[(slash_index + 1)..])?;

    if authority.is_empty() {
        return None;
    }

    Some(format!("{scheme}://{authority}/{path}"))
}

fn normalize_ssh_repository_url(remote_url: &str) -> Option<String> {
    let slash_index = remote_url.find('/')?;
    let authority = &remote_url[..slash_index];
    let path = sanitize_repository_path(&remote_url[(slash_index + 1)..])?;
    let host = strip_port(strip_userinfo(authority));

    if host.is_empty() {
        return None;
    }

    Some(format!("https://{host}/{path}"))
}

fn normalize_scp_repository_url(remote_url: &str) -> Option<String> {
    if remote_url.contains("://") {
        return None;
    }

    let (host_part, path_part) = remote_url.rsplit_once(':')?;
    if host_part.is_empty() || host_part.contains('/') || host_part.contains('\\') {
        return None;
    }

    let host = strip_port(strip_userinfo(host_part));
    let path = sanitize_repository_path(path_part)?;
    if host.is_empty() {
        return None;
    }

    Some(format!("https://{host}/{path}"))
}

fn strip_userinfo(authority: &str) -> &str {
    authority.rsplit('@').next().unwrap_or(authority).trim()
}

fn strip_port(authority: &str) -> &str {
    if authority.starts_with('[') {
        if let Some(end_index) = authority.find(']') {
            return &authority[..=end_index];
        }
    }

    authority
        .rsplit_once(':')
        .map(|(host, _)| host)
        .unwrap_or(authority)
}

fn sanitize_repository_path(path: &str) -> Option<String> {
    let without_query = path
        .split(['?', '#'])
        .next()
        .unwrap_or(path)
        .trim_matches('/');
    if without_query.is_empty() {
        return None;
    }

    let normalized = without_query
        .strip_suffix(".git")
        .unwrap_or(without_query)
        .trim_matches('/');
    if normalized.is_empty() {
        return None;
    }

    Some(normalized.to_string())
}

fn build_terminal_open_request(
    project: &Path,
    preferences: &AppPreferences,
) -> Result<OpenAppRequest, String> {
    ensure_project_dir_exists(project)?;
    let app_name = terminal_app_name(&preferences.default_terminal_app)?;
    Ok(build_open_app_request(project, app_name))
}

fn build_editor_open_request(
    project: &Path,
    preferences: &AppPreferences,
) -> Result<OpenAppRequest, String> {
    ensure_project_dir_exists(project)?;
    let editor = preferences
        .default_editor_app
        .as_deref()
        .ok_or_else(|| "请先在设置中选择默认编辑器".to_string())?;
    let app_name = editor_app_name(editor)?;
    Ok(build_open_app_request(project, app_name))
}

fn ensure_project_dir_exists(project: &Path) -> Result<(), String> {
    if project.is_dir() {
        Ok(())
    } else {
        Err("项目目录不存在".to_string())
    }
}

fn build_open_app_request(project: &Path, app_name: &str) -> OpenAppRequest {
    OpenAppRequest {
        app_name: app_name.to_string(),
        args: vec![
            "-a".to_string(),
            app_name.to_string(),
            project.to_string_lossy().to_string(),
        ],
    }
}

fn terminal_app_name(app: &str) -> Result<&'static str, String> {
    TERMINAL_APPS
        .iter()
        .find(|(slug, _)| *slug == app)
        .map(|(_, display)| *display)
        .ok_or_else(|| "默认终端配置无效，请重新选择".to_string())
}

fn editor_app_name(app: &str) -> Result<&'static str, String> {
    EDITOR_APPS
        .iter()
        .find(|(slug, _)| *slug == app)
        .map(|(_, display)| *display)
        .ok_or_else(|| "默认编辑器配置无效，请重新选择".to_string())
}

fn run_open_app_request(request: &OpenAppRequest) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let status = Command::new("open")
            .args(&request.args)
            .status()
            .map_err(|e| format!("启动 {} 失败: {}", request.app_name, e))?;

        if status.success() {
            Ok(())
        } else {
            Err(format!(
                "启动 {} 失败，退出码: {:?}",
                request.app_name,
                status.code()
            ))
        }
    }

    #[cfg(not(target_os = "macos"))]
    {
        let _ = request;
        Err("当前平台暂不支持打开本地应用".to_string())
    }
}

fn run_claude_project_purge(
    project: &str,
    mode: ProjectPurgeMode,
) -> Result<ProjectPurgeOutput, String> {
    let project_path = validate_project_path(project)?;
    let project_display = project_path.to_string_lossy().to_string();
    let args = build_claude_project_purge_args(&project_display, mode);
    let output = Command::new("claude").args(&args).output().map_err(|e| {
        if e.kind() == std::io::ErrorKind::NotFound {
            "未找到 claude CLI，请确认 Claude Code 已安装并可在 PATH 中访问".to_string()
        } else {
            format!("执行 claude project purge 失败: {}", e)
        }
    })?;

    parse_claude_project_purge_output(
        project_display,
        output.status.success(),
        output.status.code(),
        &output.stdout,
        &output.stderr,
    )
}

fn build_claude_project_purge_args(project: &str, mode: ProjectPurgeMode) -> Vec<String> {
    vec![
        "project".to_string(),
        "purge".to_string(),
        project.to_string(),
        mode.flag().to_string(),
    ]
}

fn parse_claude_project_purge_output(
    project: String,
    success: bool,
    code: Option<i32>,
    stdout: &[u8],
    stderr: &[u8],
) -> Result<ProjectPurgeOutput, String> {
    let output = merge_process_output(stdout, stderr);
    if success {
        return Ok(ProjectPurgeOutput { project, output });
    }

    if output.is_empty() {
        Err(format!("claude project purge 执行失败，退出码: {:?}", code))
    } else {
        Err(format!(
            "claude project purge 执行失败，退出码: {:?}\n{}",
            code, output
        ))
    }
}

fn merge_process_output(stdout: &[u8], stderr: &[u8]) -> String {
    let stdout = String::from_utf8_lossy(stdout).trim().to_string();
    let stderr = String::from_utf8_lossy(stderr).trim().to_string();

    match (stdout.is_empty(), stderr.is_empty()) {
        (true, true) => String::new(),
        (false, true) => stdout,
        (true, false) => stderr,
        (false, false) => format!("{stdout}\n{stderr}"),
    }
}

fn log_project_purge_result(
    event: &str,
    project: &str,
    result: &Result<ProjectPurgeOutput, String>,
) {
    let project = crate::utils::truncate(project, 160);
    if result.is_ok() {
        log::info!("event={event} status=ok project={project}");
    } else {
        log::error!("event={event} status=error project={project}");
    }
}

fn inspect_project_files(project_dir: &Path) -> Result<ProjectFileStatus, String> {
    let claude_path = project_dir.join("CLAUDE.md");
    let agents_path = project_dir.join("AGENTS.md");
    let has_claude_md = claude_path.is_file();

    let agents_status = match fs::symlink_metadata(&agents_path) {
        Ok(meta) if meta.file_type().is_symlink() => {
            let target = fs::read_link(&agents_path)
                .map_err(|e| format!("读取 AGENTS.md 软链接失败: {}", e))?;
            let resolved = if target.is_absolute() {
                target
            } else {
                project_dir.join(target)
            };

            if has_claude_md && paths_match(&resolved, &claude_path) {
                AgentsStatus::CorrectSymlink
            } else {
                AgentsStatus::WrongSymlink
            }
        }
        Ok(_) => AgentsStatus::PlainFileConflict,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => AgentsStatus::Missing,
        Err(e) => return Err(format!("读取 AGENTS.md 状态失败: {}", e)),
    };

    Ok(ProjectFileStatus {
        has_claude_md,
        agents_status,
    })
}

fn create_agents_symlink(project_dir: &Path) -> Result<(), String> {
    let claude_path = project_dir.join("CLAUDE.md");
    if !claude_path.is_file() {
        return Err("项目根目录缺少 CLAUDE.md，无法创建 AGENTS.md".to_string());
    }

    let agents_path = project_dir.join("AGENTS.md");
    match fs::symlink_metadata(&agents_path) {
        Ok(meta) if meta.file_type().is_symlink() => {
            let status = inspect_project_files(project_dir)?;
            if status.agents_status == AgentsStatus::CorrectSymlink {
                return Ok(());
            }
            fs::remove_file(&agents_path).map_err(|e| format!("删除旧的软链接失败: {}", e))?;
        }
        Ok(_) => {
            return Err(format!(
                "目标路径已存在且不是软链接，无法覆盖: {:?}",
                agents_path
            ));
        }
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
        Err(e) => return Err(format!("获取 AGENTS.md 元数据失败: {}", e)),
    }

    #[cfg(unix)]
    std::os::unix::fs::symlink(Path::new("CLAUDE.md"), &agents_path)
        .map_err(|e| format!("创建软链接失败: {}", e))?;

    #[cfg(windows)]
    std::os::windows::fs::symlink_file(Path::new("CLAUDE.md"), &agents_path)
        .map_err(|e| format!("创建软链接失败: {}", e))?;

    Ok(())
}

fn paths_match(left: &Path, right: &Path) -> bool {
    let left = fs::canonicalize(left).unwrap_or_else(|_| left.to_path_buf());
    let right = fs::canonicalize(right).unwrap_or_else(|_| right.to_path_buf());
    left == right
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::AppPreferences;
    use std::path::Path;

    #[test]
    fn parse_branches_output_marks_current_branch_and_metadata() {
        // 使用 \x00 而非 \0 区分 null 字节与紧随的数字字面量，避免 clippy::octal_escapes 误警告
        let output =
            "main\0*\x00001710000000\0Main branch\nfeature/test\0 \x00001700000000\0Feature branch\n";

        let branches = parse_branches_output(output);

        assert_eq!(branches.len(), 2);
        assert_eq!(branches[0].name, "main");
        assert!(branches[0].is_current);
        assert_eq!(branches[0].last_commit_at, Some(1710000000));
        assert_eq!(
            branches[0].last_commit_subject.as_deref(),
            Some("Main branch")
        );
        assert_eq!(branches[1].name, "feature/test");
        assert!(!branches[1].is_current);
    }

    #[test]
    fn parse_worktrees_output_marks_current_and_detached_entries() {
        let output = concat!(
            "worktree /tmp/repo\n",
            "HEAD 1111111\n",
            "branch refs/heads/main\n",
            "\n",
            "worktree /tmp/repo-feature\n",
            "HEAD 2222222\n",
            "detached\n",
            "\n"
        );

        let worktrees = parse_worktrees_output(output, Path::new("/tmp/repo"));

        assert_eq!(worktrees.len(), 2);
        assert_eq!(worktrees[0].path, "/tmp/repo");
        assert!(worktrees[0].is_current);
        assert_eq!(worktrees[0].branch.as_deref(), Some("main"));
        assert!(!worktrees[0].is_detached);
        assert_eq!(worktrees[1].path, "/tmp/repo-feature");
        assert!(!worktrees[1].is_current);
        assert!(worktrees[1].is_detached);
        assert_eq!(worktrees[1].head.as_deref(), Some("2222222"));
    }

    #[test]
    fn inspect_agents_status_distinguishes_symlink_states() {
        let sandbox = TestDir::new();
        std::fs::write(sandbox.path().join("CLAUDE.md"), "hello").unwrap();

        let initial = inspect_project_files(sandbox.path()).unwrap();
        assert!(initial.has_claude_md);
        assert_eq!(initial.agents_status, AgentsStatus::Missing);

        create_agents_symlink(sandbox.path()).unwrap();
        let linked = inspect_project_files(sandbox.path()).unwrap();
        assert_eq!(linked.agents_status, AgentsStatus::CorrectSymlink);

        std::fs::remove_file(sandbox.path().join("AGENTS.md")).unwrap();
        std::fs::write(sandbox.path().join("OTHER.md"), "other").unwrap();
        create_test_symlink(Path::new("OTHER.md"), &sandbox.path().join("AGENTS.md"));

        let wrong = inspect_project_files(sandbox.path()).unwrap();
        assert_eq!(wrong.agents_status, AgentsStatus::WrongSymlink);
    }

    #[test]
    fn create_agents_symlink_is_idempotent_and_replaces_wrong_symlink() {
        let sandbox = TestDir::new();
        std::fs::write(sandbox.path().join("CLAUDE.md"), "hello").unwrap();
        std::fs::write(sandbox.path().join("OTHER.md"), "other").unwrap();
        create_test_symlink(Path::new("OTHER.md"), &sandbox.path().join("AGENTS.md"));

        create_agents_symlink(sandbox.path()).unwrap();
        create_agents_symlink(sandbox.path()).unwrap();

        let status = inspect_project_files(sandbox.path()).unwrap();
        assert_eq!(status.agents_status, AgentsStatus::CorrectSymlink);
    }

    #[test]
    fn create_agents_symlink_rejects_missing_claude_or_plain_file() {
        let missing = TestDir::new();
        let err = create_agents_symlink(missing.path()).unwrap_err();
        assert!(err.contains("CLAUDE.md"));

        let plain = TestDir::new();
        std::fs::write(plain.path().join("CLAUDE.md"), "hello").unwrap();
        std::fs::write(plain.path().join("AGENTS.md"), "plain").unwrap();

        let err = create_agents_symlink(plain.path()).unwrap_err();
        assert!(err.contains("不是软链接"));
    }

    #[test]
    fn get_project_detail_exposes_repository_url_from_origin_remote() {
        let repo = TestDir::new();
        init_git_repo(
            repo.path(),
            &[("origin", "git@gitlab.example.com:team/ai-manager.git")],
        );

        let detail = get_project_detail(repo.path().to_str().unwrap()).unwrap();
        let value = serde_json::to_value(detail).unwrap();

        assert_eq!(
            value.get("repositoryUrl").and_then(|item| item.as_str()),
            Some("https://gitlab.example.com/team/ai-manager")
        );
    }

    #[test]
    fn get_project_detail_falls_back_when_origin_remote_cannot_convert() {
        let repo = TestDir::new();
        init_git_repo(
            repo.path(),
            &[
                ("origin", "file:///tmp/local-only.git"),
                (
                    "upstream",
                    "https://user:pass@github.example.com/org/repo.git?ref=main",
                ),
            ],
        );

        let detail = get_project_detail(repo.path().to_str().unwrap()).unwrap();
        let value = serde_json::to_value(detail).unwrap();

        assert_eq!(
            value.get("repositoryUrl").and_then(|item| item.as_str()),
            Some("https://github.example.com/org/repo")
        );
    }

    #[test]
    fn get_project_detail_omits_repository_url_for_non_convertible_remote() {
        let repo = TestDir::new();
        init_git_repo(repo.path(), &[("origin", "file:///tmp/local-only.git")]);

        let detail = get_project_detail(repo.path().to_str().unwrap()).unwrap();
        let value = serde_json::to_value(detail).unwrap();

        assert!(value.get("repositoryUrl").is_none());
    }

    #[test]
    fn normalize_repository_url_supports_http_and_ssh_formats() {
        assert_eq!(
            normalize_repository_url(
                "https://user:pass@gitlab.example.com/group/repo.git/?foo=bar"
            ),
            Some("https://gitlab.example.com/group/repo".to_string())
        );
        assert_eq!(
            normalize_repository_url("ssh://git@github.example.com:2222/org/repo.git"),
            Some("https://github.example.com/org/repo".to_string())
        );
        assert_eq!(
            normalize_repository_url("git@github.example.com:org/repo.git"),
            Some("https://github.example.com/org/repo".to_string())
        );
    }

    #[test]
    fn build_terminal_open_request_uses_configured_terminal_app() {
        let sandbox = TestDir::new();
        let state = sample_app_state("iterm", Some("cursor"));

        let request = build_terminal_open_request(sandbox.path(), &state).unwrap();

        assert_eq!(request.app_name, "iTerm");
        assert_eq!(
            request.args,
            vec![
                "-a".to_string(),
                "iTerm".to_string(),
                sandbox.path().to_string_lossy().to_string()
            ]
        );
    }

    #[test]
    fn build_terminal_open_request_supports_ghostty() {
        let sandbox = TestDir::new();
        let state = sample_app_state("ghostty", Some("cursor"));

        let request = build_terminal_open_request(sandbox.path(), &state).unwrap();

        assert_eq!(request.app_name, "Ghostty");
        assert_eq!(
            request.args,
            vec![
                "-a".to_string(),
                "Ghostty".to_string(),
                sandbox.path().to_string_lossy().to_string()
            ]
        );
    }

    #[test]
    fn build_editor_open_request_requires_configured_editor() {
        let sandbox = TestDir::new();
        let state = sample_app_state("terminal", None);

        let err = build_editor_open_request(sandbox.path(), &state).unwrap_err();

        assert!(err.contains("默认编辑器"));
    }

    #[test]
    fn build_open_requests_reject_missing_directory() {
        let missing = std::env::temp_dir().join(format!(
            "ai-manager-project-missing-{}",
            uuid::Uuid::new_v4()
        ));
        let state = sample_app_state("terminal", Some("vscode"));

        let err = build_terminal_open_request(&missing, &state).unwrap_err();
        assert!(err.contains("项目目录不存在"));
    }

    #[test]
    fn build_editor_open_request_uses_configured_editor_app() {
        let sandbox = TestDir::new();
        let state = sample_app_state("terminal", Some("vscode"));

        let request = build_editor_open_request(sandbox.path(), &state).unwrap();

        assert_eq!(request.app_name, "Visual Studio Code");
        assert_eq!(
            request.args,
            vec![
                "-a".to_string(),
                "Visual Studio Code".to_string(),
                sandbox.path().to_string_lossy().to_string()
            ]
        );
    }

    #[test]
    fn build_claude_project_purge_args_uses_expected_flags() {
        assert_eq!(
            build_claude_project_purge_args("/tmp/my-repo", ProjectPurgeMode::DryRun),
            vec![
                "project".to_string(),
                "purge".to_string(),
                "/tmp/my-repo".to_string(),
                "--dry-run".to_string()
            ]
        );
        assert_eq!(
            build_claude_project_purge_args("/tmp/my-repo", ProjectPurgeMode::Execute),
            vec![
                "project".to_string(),
                "purge".to_string(),
                "/tmp/my-repo".to_string(),
                "--yes".to_string()
            ]
        );
    }

    #[test]
    fn run_claude_project_purge_rejects_empty_project_path() {
        let err = run_claude_project_purge(" ", ProjectPurgeMode::DryRun).unwrap_err();

        assert!(err.contains("项目路径不能为空"));
    }

    #[test]
    fn parse_claude_project_purge_output_merges_stdout_and_stderr() {
        let output = parse_claude_project_purge_output(
            "/tmp/my-repo".to_string(),
            true,
            Some(0),
            b"stdout plan\n",
            b"stderr warning\n",
        )
        .unwrap();

        assert_eq!(output.project, "/tmp/my-repo");
        assert_eq!(output.output, "stdout plan\nstderr warning");
    }

    #[test]
    fn parse_claude_project_purge_output_reports_non_zero_exit() {
        let err = parse_claude_project_purge_output(
            "/tmp/my-repo".to_string(),
            false,
            Some(1),
            b"",
            b"no state matched\n",
        )
        .unwrap_err();

        assert!(err.contains("claude project purge 执行失败"));
        assert!(err.contains("退出码: Some(1)"));
        assert!(err.contains("no state matched"));
    }

    struct TestDir {
        path: std::path::PathBuf,
    }

    impl TestDir {
        fn new() -> Self {
            let path =
                std::env::temp_dir().join(format!("ai-manager-project-{}", uuid::Uuid::new_v4()));
            std::fs::create_dir_all(&path).unwrap();
            Self { path }
        }

        fn path(&self) -> &Path {
            &self.path
        }
    }

    impl Drop for TestDir {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.path);
        }
    }

    fn init_git_repo(path: &Path, remotes: &[(&str, &str)]) {
        run_git_command(path, &["init"]);
        for (name, url) in remotes {
            run_git_command(path, &["remote", "add", name, url]);
        }
    }

    fn run_git_command(path: &Path, args: &[&str]) {
        let status = Command::new("git")
            .arg("-C")
            .arg(path)
            .args(args)
            .status()
            .unwrap();
        assert!(status.success(), "git command failed: {:?}", args);
    }

    fn sample_app_state(
        default_terminal_app: &str,
        default_editor_app: Option<&str>,
    ) -> AppPreferences {
        AppPreferences {
            show_tray_title: true,
            show_tray_sessions: true,
            ui_language: "zh".to_string(),
            default_terminal_app: default_terminal_app.to_string(),
            default_editor_app: default_editor_app.map(ToOwned::to_owned),
        }
    }

    #[cfg(unix)]
    fn create_test_symlink(src: &Path, dest: &Path) {
        std::os::unix::fs::symlink(src, dest).unwrap();
    }

    #[cfg(windows)]
    fn create_test_symlink(src: &Path, dest: &Path) {
        std::os::windows::fs::symlink_file(src, dest).unwrap();
    }
}
