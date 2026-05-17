use serde::Serialize;
use std::collections::HashSet;
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

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ProjectGitCleanupReason {
    Merged,
    UpstreamGone,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ProjectBranchCleanupCandidate {
    pub name: String,
    pub reason: ProjectGitCleanupReason,
    pub force_delete: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_commit_at: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_commit_subject: Option<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ProjectWorktreeCleanupCandidate {
    pub path: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub branch: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub head: Option<String>,
    pub reason: ProjectGitCleanupReason,
    pub is_detached: bool,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ProjectGitCleanupPreview {
    pub project: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub repo_root: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub base_branch: Option<String>,
    pub branch_candidates: Vec<ProjectBranchCleanupCandidate>,
    pub worktree_candidates: Vec<ProjectWorktreeCleanupCandidate>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ProjectGitCleanupResult {
    pub project: String,
    pub deleted_branches: Vec<String>,
    pub deleted_worktrees: Vec<String>,
    pub errors: Vec<String>,
}

#[derive(Debug, PartialEq, Eq)]
struct ProjectFileStatus {
    has_claude_md: bool,
    agents_status: AgentsStatus,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct BranchCleanupInfo {
    name: String,
    is_current: bool,
    last_commit_at: Option<u64>,
    last_commit_subject: Option<String>,
    upstream_track: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct WorktreeCleanupInfo {
    path: String,
    branch: Option<String>,
    head: Option<String>,
    is_current: bool,
    is_detached: bool,
    is_locked: bool,
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

const PROTECTED_BRANCHES: &[&str] = &["main", "master", "dev", "develop", "trunk"];

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
        crate::native_open::open_dir_in_terminal(&project_path, &preferences.default_terminal_app)
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
        let editor = preferences
            .default_editor_app
            .as_deref()
            .ok_or_else(|| "请先在设置中选择默认编辑器".to_string())?;
        crate::native_open::open_path_in_editor(&project_path, editor)
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

#[tauri::command]
pub fn preview_project_branch_cleanup(project: &str) -> Result<ProjectGitCleanupPreview, String> {
    let result = build_project_branch_cleanup_preview(project);
    log_project_git_cleanup_result("project.branch_cleanup.preview", project, result.is_ok());
    result
}

#[tauri::command]
pub fn cleanup_project_branches(
    project: &str,
    branches: Vec<String>,
) -> Result<ProjectGitCleanupResult, String> {
    let result = run_project_branch_cleanup(project, branches);
    log_project_git_cleanup_result("project.branch_cleanup.execute", project, result.is_ok());
    result
}

#[tauri::command]
pub fn preview_project_worktree_cleanup(project: &str) -> Result<ProjectGitCleanupPreview, String> {
    let result = build_project_worktree_cleanup_preview(project);
    log_project_git_cleanup_result("project.worktree_cleanup.preview", project, result.is_ok());
    result
}

#[tauri::command]
pub fn cleanup_project_worktrees(
    project: &str,
    worktrees: Vec<String>,
) -> Result<ProjectGitCleanupResult, String> {
    let result = run_project_worktree_cleanup(project, worktrees);
    log_project_git_cleanup_result("project.worktree_cleanup.execute", project, result.is_ok());
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

fn build_project_branch_cleanup_preview(project: &str) -> Result<ProjectGitCleanupPreview, String> {
    let project_path = validate_existing_project_dir(project)?;
    let project_display = project_path.to_string_lossy().to_string();
    let repo_root = git_repo_root(&project_path)?;
    let branch_infos = load_branch_cleanup_infos(&project_path)?;
    let worktree_infos = load_worktree_cleanup_infos(&project_path, Path::new(&repo_root))?;
    let local_branches = branch_infos
        .iter()
        .map(|branch| branch.name.clone())
        .collect::<HashSet<_>>();
    let current_branch = branch_infos
        .iter()
        .find(|branch| branch.is_current)
        .map(|branch| branch.name.as_str());
    let remote_default_branch = resolve_remote_default_local_branch(&project_path, &local_branches);
    let base_branch = select_cleanup_base_branch(
        current_branch,
        remote_default_branch.as_deref(),
        &local_branches,
    );

    let occupied_branches = worktree_infos
        .iter()
        .filter_map(|worktree| worktree.branch.clone())
        .collect::<HashSet<_>>();
    let branch_candidates = base_branch
        .as_deref()
        .map(|base| {
            build_branch_cleanup_candidates(
                &project_path,
                &branch_infos,
                base,
                &occupied_branches,
                remote_default_branch.as_deref(),
                true,
            )
        })
        .unwrap_or_default();

    Ok(ProjectGitCleanupPreview {
        project: project_display,
        repo_root: Some(repo_root),
        base_branch,
        branch_candidates,
        worktree_candidates: Vec::new(),
    })
}

fn run_project_branch_cleanup(
    project: &str,
    branches: Vec<String>,
) -> Result<ProjectGitCleanupResult, String> {
    let project_path = validate_existing_project_dir(project)?;
    let project_display = project_path.to_string_lossy().to_string();
    let preview = build_project_branch_cleanup_preview(project)?;
    let candidates = preview
        .branch_candidates
        .into_iter()
        .map(|candidate| (candidate.name.clone(), candidate))
        .collect::<std::collections::HashMap<_, _>>();
    let mut requested = HashSet::new();
    let mut deleted_branches = Vec::new();
    let mut errors = Vec::new();

    for branch in branches {
        if !requested.insert(branch.clone()) {
            continue;
        }
        let Some(candidate) = candidates.get(&branch) else {
            continue;
        };
        let flag = if candidate.force_delete { "-D" } else { "-d" };
        match run_git(&project_path, &["branch", flag, &candidate.name]) {
            Ok(_) => deleted_branches.push(candidate.name.clone()),
            Err(error) => errors.push(format!("{}: {}", candidate.name, error)),
        }
    }

    Ok(ProjectGitCleanupResult {
        project: project_display,
        deleted_branches,
        deleted_worktrees: Vec::new(),
        errors,
    })
}

fn build_project_worktree_cleanup_preview(
    project: &str,
) -> Result<ProjectGitCleanupPreview, String> {
    let project_path = validate_existing_project_dir(project)?;
    let project_display = project_path.to_string_lossy().to_string();
    let repo_root = git_repo_root(&project_path)?;
    let branch_infos = load_branch_cleanup_infos(&project_path)?;
    let worktree_infos = load_worktree_cleanup_infos(&project_path, Path::new(&repo_root))?;
    let local_branches = branch_infos
        .iter()
        .map(|branch| branch.name.clone())
        .collect::<HashSet<_>>();
    let current_branch = branch_infos
        .iter()
        .find(|branch| branch.is_current)
        .map(|branch| branch.name.as_str());
    let remote_default_branch = resolve_remote_default_local_branch(&project_path, &local_branches);
    let base_branch = select_cleanup_base_branch(
        current_branch,
        remote_default_branch.as_deref(),
        &local_branches,
    );
    let branch_lookup = branch_infos
        .iter()
        .map(|branch| (branch.name.as_str(), branch))
        .collect::<std::collections::HashMap<_, _>>();
    let worktree_candidates = base_branch
        .as_deref()
        .map(|base| {
            build_worktree_cleanup_candidates(
                &project_path,
                &worktree_infos,
                &branch_lookup,
                base,
                remote_default_branch.as_deref(),
            )
        })
        .unwrap_or_default();

    Ok(ProjectGitCleanupPreview {
        project: project_display,
        repo_root: Some(repo_root),
        base_branch,
        branch_candidates: Vec::new(),
        worktree_candidates,
    })
}

fn run_project_worktree_cleanup(
    project: &str,
    worktrees: Vec<String>,
) -> Result<ProjectGitCleanupResult, String> {
    let project_path = validate_existing_project_dir(project)?;
    let project_display = project_path.to_string_lossy().to_string();
    let preview = build_project_worktree_cleanup_preview(project)?;
    let candidates = preview
        .worktree_candidates
        .into_iter()
        .map(|candidate| (candidate.path.clone(), candidate))
        .collect::<std::collections::HashMap<_, _>>();
    let mut requested = HashSet::new();
    let mut deleted_worktrees = Vec::new();
    let mut errors = Vec::new();

    for worktree in worktrees {
        if !requested.insert(worktree.clone()) {
            continue;
        }
        let Some(candidate) = candidates.get(&worktree) else {
            continue;
        };
        match run_git(&project_path, &["worktree", "remove", &candidate.path]) {
            Ok(_) => deleted_worktrees.push(candidate.path.clone()),
            Err(error) => errors.push(format!("{}: {}", candidate.path, error)),
        }
    }

    if let Err(error) = run_git(&project_path, &["worktree", "prune"]) {
        errors.push(format!("worktree prune: {}", error));
    }

    Ok(ProjectGitCleanupResult {
        project: project_display,
        deleted_branches: Vec::new(),
        deleted_worktrees,
        errors,
    })
}

fn validate_existing_project_dir(project: &str) -> Result<PathBuf, String> {
    let project_path = validate_project_path(project)?;
    if !project_path.is_dir() {
        return Err("项目目录不存在".to_string());
    }
    Ok(project_path)
}

fn load_branch_cleanup_infos(project: &Path) -> Result<Vec<BranchCleanupInfo>, String> {
    let output = run_git(
        project,
        &[
            "for-each-ref",
            "refs/heads",
            "--sort=-committerdate",
            "--format=%(refname:short)%00%(HEAD)%00%(committerdate:unix)%00%(subject)%00%(upstream:track)",
        ],
    )?;
    Ok(parse_branch_cleanup_infos(&output))
}

fn parse_branch_cleanup_infos(output: &str) -> Vec<BranchCleanupInfo> {
    output
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
            let upstream_track = parts
                .next()
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(ToOwned::to_owned);

            Some(BranchCleanupInfo {
                name: name.to_string(),
                is_current,
                last_commit_at,
                last_commit_subject,
                upstream_track,
            })
        })
        .collect()
}

fn load_worktree_cleanup_infos(
    project: &Path,
    current_root: &Path,
) -> Result<Vec<WorktreeCleanupInfo>, String> {
    let output = run_git(project, &["worktree", "list", "--porcelain"])?;
    Ok(parse_worktree_cleanup_infos(&output, current_root))
}

fn parse_worktree_cleanup_infos(output: &str, current_root: &Path) -> Vec<WorktreeCleanupInfo> {
    let mut worktrees = Vec::new();
    let mut current_path: Option<String> = None;
    let mut current_branch: Option<String> = None;
    let mut current_head: Option<String> = None;
    let mut current_detached = false;
    let mut current_locked = false;

    let push_current = |worktrees: &mut Vec<WorktreeCleanupInfo>,
                        current_path: &mut Option<String>,
                        current_branch: &mut Option<String>,
                        current_head: &mut Option<String>,
                        current_detached: &mut bool,
                        current_locked: &mut bool| {
        if let Some(path) = current_path.take() {
            let path_buf = PathBuf::from(&path);
            worktrees.push(WorktreeCleanupInfo {
                is_current: paths_match(&path_buf, current_root),
                path,
                branch: current_branch.take(),
                head: current_head.take(),
                is_detached: *current_detached,
                is_locked: *current_locked,
            });
            *current_detached = false;
            *current_locked = false;
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
                &mut current_locked,
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
                &mut current_locked,
            );
            current_path = Some(path.trim().to_string());
            continue;
        }

        if let Some(head) = line.strip_prefix("HEAD ") {
            current_head = Some(head.trim().to_string());
            continue;
        }

        if let Some(branch) = line.strip_prefix("branch ") {
            current_branch = Some(branch.trim().trim_start_matches("refs/heads/").to_string());
            current_detached = false;
            continue;
        }

        if line == "detached" {
            current_detached = true;
            continue;
        }

        if line == "locked" || line.starts_with("locked ") {
            current_locked = true;
        }
    }

    push_current(
        &mut worktrees,
        &mut current_path,
        &mut current_branch,
        &mut current_head,
        &mut current_detached,
        &mut current_locked,
    );

    worktrees
}

fn select_cleanup_base_branch(
    current_branch: Option<&str>,
    remote_default_branch: Option<&str>,
    local_branches: &HashSet<String>,
) -> Option<String> {
    if current_branch.is_some_and(is_protected_branch) {
        return current_branch.map(ToOwned::to_owned);
    }

    if let Some(remote_default_branch) = remote_default_branch {
        return Some(remote_default_branch.to_string());
    }

    PROTECTED_BRANCHES
        .iter()
        .find(|branch| local_branches.contains(**branch))
        .map(|branch| (*branch).to_string())
        .or_else(|| current_branch.map(ToOwned::to_owned))
}

fn resolve_remote_default_local_branch(
    project: &Path,
    local_branches: &HashSet<String>,
) -> Option<String> {
    let output = run_git(
        project,
        &[
            "symbolic-ref",
            "--quiet",
            "--short",
            "refs/remotes/origin/HEAD",
        ],
    )
    .ok()?;
    let local_name = output.trim().strip_prefix("origin/")?.to_string();
    if local_branches.contains(&local_name) {
        Some(local_name)
    } else {
        None
    }
}

fn build_branch_cleanup_candidates(
    project: &Path,
    branch_infos: &[BranchCleanupInfo],
    base_branch: &str,
    occupied_branches: &HashSet<String>,
    remote_default_branch: Option<&str>,
    skip_occupied_branches: bool,
) -> Vec<ProjectBranchCleanupCandidate> {
    branch_infos
        .iter()
        .filter_map(|branch| {
            evaluate_branch_cleanup_candidate(
                project,
                branch,
                base_branch,
                occupied_branches,
                remote_default_branch,
                skip_occupied_branches,
            )
        })
        .collect()
}

fn evaluate_branch_cleanup_candidate(
    project: &Path,
    branch: &BranchCleanupInfo,
    base_branch: &str,
    occupied_branches: &HashSet<String>,
    remote_default_branch: Option<&str>,
    skip_occupied_branches: bool,
) -> Option<ProjectBranchCleanupCandidate> {
    if branch.is_current
        || branch.name == base_branch
        || is_protected_branch(&branch.name)
        || remote_default_branch == Some(branch.name.as_str())
        || (skip_occupied_branches && occupied_branches.contains(&branch.name))
    {
        return None;
    }

    if git_status_success(
        project,
        &["merge-base", "--is-ancestor", &branch.name, base_branch],
    ) {
        return Some(ProjectBranchCleanupCandidate {
            name: branch.name.clone(),
            reason: ProjectGitCleanupReason::Merged,
            force_delete: false,
            last_commit_at: branch.last_commit_at,
            last_commit_subject: branch.last_commit_subject.clone(),
        });
    }

    if branch_upstream_is_gone(branch)
        && git_cherry_has_no_unique_patches(project, base_branch, &branch.name)
    {
        return Some(ProjectBranchCleanupCandidate {
            name: branch.name.clone(),
            reason: ProjectGitCleanupReason::UpstreamGone,
            force_delete: true,
            last_commit_at: branch.last_commit_at,
            last_commit_subject: branch.last_commit_subject.clone(),
        });
    }

    None
}

fn build_worktree_cleanup_candidates(
    project: &Path,
    worktree_infos: &[WorktreeCleanupInfo],
    branch_lookup: &std::collections::HashMap<&str, &BranchCleanupInfo>,
    base_branch: &str,
    remote_default_branch: Option<&str>,
) -> Vec<ProjectWorktreeCleanupCandidate> {
    let occupied_branches = HashSet::new();
    worktree_infos
        .iter()
        .filter_map(|worktree| {
            evaluate_worktree_cleanup_candidate(
                project,
                worktree,
                branch_lookup,
                base_branch,
                remote_default_branch,
                &occupied_branches,
            )
        })
        .collect()
}

fn evaluate_worktree_cleanup_candidate(
    project: &Path,
    worktree: &WorktreeCleanupInfo,
    branch_lookup: &std::collections::HashMap<&str, &BranchCleanupInfo>,
    base_branch: &str,
    remote_default_branch: Option<&str>,
    occupied_branches: &HashSet<String>,
) -> Option<ProjectWorktreeCleanupCandidate> {
    if worktree.is_current || worktree.is_locked || !Path::new(&worktree.path).is_dir() {
        return None;
    }
    if !worktree_is_clean(&worktree.path) {
        return None;
    }

    let reason = if let Some(branch) = &worktree.branch {
        let branch_info = branch_lookup.get(branch.as_str())?;
        evaluate_branch_cleanup_candidate(
            project,
            branch_info,
            base_branch,
            occupied_branches,
            remote_default_branch,
            false,
        )
        .map(|candidate| candidate.reason)?
    } else if let Some(head) = &worktree.head {
        if git_status_success(project, &["merge-base", "--is-ancestor", head, base_branch])
            || git_cherry_has_no_unique_patches(project, base_branch, head)
        {
            ProjectGitCleanupReason::Merged
        } else {
            return None;
        }
    } else {
        return None;
    };

    Some(ProjectWorktreeCleanupCandidate {
        path: worktree.path.clone(),
        branch: worktree.branch.clone(),
        head: worktree.head.clone(),
        reason,
        is_detached: worktree.is_detached,
    })
}

fn is_protected_branch(branch: &str) -> bool {
    PROTECTED_BRANCHES.contains(&branch)
}

fn branch_upstream_is_gone(branch: &BranchCleanupInfo) -> bool {
    branch
        .upstream_track
        .as_deref()
        .is_some_and(|track| track.contains("gone"))
}

fn git_cherry_has_no_unique_patches(project: &Path, base_branch: &str, branch: &str) -> bool {
    run_git(project, &["cherry", base_branch, branch])
        .map(|output| {
            !output
                .lines()
                .any(|line| line.trim_start().starts_with('+'))
        })
        .unwrap_or(false)
}

fn worktree_is_clean(worktree_path: &str) -> bool {
    let path = Path::new(worktree_path);
    run_git(path, &["status", "--porcelain", "--untracked-files=normal"])
        .map(|output| output.trim().is_empty())
        .unwrap_or(false)
}

fn git_status_success(project: &Path, args: &[&str]) -> bool {
    Command::new("git")
        .arg("-C")
        .arg(project)
        .args(args)
        .status()
        .map(|status| status.success())
        .unwrap_or(false)
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

fn log_project_git_cleanup_result(event: &str, project: &str, ok: bool) {
    let project = crate::utils::truncate(project, 160);
    if ok {
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
        Ok(_) if has_claude_md && files_are_same(&agents_path, &claude_path) => {
            AgentsStatus::CorrectSymlink
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
        Ok(_) if files_are_same(&agents_path, &claude_path) => {
            return Ok(());
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
    std::os::windows::fs::symlink_file(Path::new("CLAUDE.md"), &agents_path).or_else(
        |symlink_error| {
            fs::hard_link(&claude_path, &agents_path).map_err(|hard_link_error| {
                format!(
                    "创建软链接失败: {}; 创建硬链接也失败: {}",
                    symlink_error, hard_link_error
                )
            })
        },
    )?;

    Ok(())
}

fn files_are_same(left: &Path, right: &Path) -> bool {
    let (Ok(left), Ok(right)) = (fs::metadata(left), fs::metadata(right)) else {
        return false;
    };

    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        left.dev() == right.dev() && left.ino() == right.ino()
    }

    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        left.volume_serial_number() == right.volume_serial_number()
            && left.file_index() == right.file_index()
    }

    #[cfg(not(any(unix, windows)))]
    {
        false
    }
}

fn paths_match(left: &Path, right: &Path) -> bool {
    let left = fs::canonicalize(left).unwrap_or_else(|_| left.to_path_buf());
    let right = fs::canonicalize(right).unwrap_or_else(|_| right.to_path_buf());
    left == right
}

#[cfg(test)]
mod tests {
    use super::*;
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
    fn preview_branch_cleanup_skips_protected_current_and_worktree_branches() {
        let repo = TestDir::new();
        init_git_repo_with_commit(repo.path());
        create_merged_branch(repo.path(), "feature/merged");
        run_git_command(repo.path(), &["branch", "dev"]);
        run_git_command(repo.path(), &["branch", "feature/worktree"]);
        let worktree_dir = TestDir::new();
        run_git_command(
            repo.path(),
            &[
                "worktree",
                "add",
                worktree_dir.path().to_str().unwrap(),
                "feature/worktree",
            ],
        );

        let preview = preview_project_branch_cleanup(repo.path().to_str().unwrap()).unwrap();

        assert_eq!(preview.base_branch.as_deref(), Some("main"));
        assert_eq!(preview.branch_candidates.len(), 1);
        assert_eq!(preview.branch_candidates[0].name, "feature/merged");
        assert_eq!(
            preview.branch_candidates[0].reason,
            ProjectGitCleanupReason::Merged
        );
        assert!(!preview.branch_candidates[0].force_delete);
    }

    #[test]
    fn preview_branch_cleanup_includes_upstream_gone_when_patch_equivalent() {
        let repo = TestDir::new();
        init_git_repo_with_commit(repo.path());
        run_git_command(
            repo.path(),
            &["remote", "add", "origin", "https://example.com/repo.git"],
        );
        create_patch_equivalent_upstream_gone_branch(repo.path(), "feature/gone");
        create_unmerged_upstream_gone_branch(repo.path(), "feature/unique");

        let preview = preview_project_branch_cleanup(repo.path().to_str().unwrap()).unwrap();
        let names = preview
            .branch_candidates
            .iter()
            .map(|candidate| candidate.name.as_str())
            .collect::<Vec<_>>();

        assert!(names.contains(&"feature/gone"));
        assert!(!names.contains(&"feature/unique"));
        let gone = preview
            .branch_candidates
            .iter()
            .find(|candidate| candidate.name == "feature/gone")
            .unwrap();
        assert_eq!(gone.reason, ProjectGitCleanupReason::UpstreamGone);
        assert!(gone.force_delete);
    }

    #[test]
    fn cleanup_project_branches_deletes_only_current_safe_candidates() {
        let repo = TestDir::new();
        init_git_repo_with_commit(repo.path());
        create_merged_branch(repo.path(), "feature/merged");
        create_unmerged_upstream_gone_branch(repo.path(), "feature/unique");

        let result = cleanup_project_branches(
            repo.path().to_str().unwrap(),
            vec![
                "feature/merged".to_string(),
                "feature/unique".to_string(),
                "main".to_string(),
            ],
        )
        .unwrap();

        assert_eq!(result.deleted_branches, vec!["feature/merged"]);
        assert!(branch_exists(repo.path(), "main"));
        assert!(!branch_exists(repo.path(), "feature/merged"));
        assert!(branch_exists(repo.path(), "feature/unique"));
    }

    #[test]
    fn preview_worktree_cleanup_skips_current_dirty_and_locked_worktrees() {
        let repo = TestDir::new();
        init_git_repo_with_commit(repo.path());
        create_merged_branch(repo.path(), "feature/clean-worktree");
        create_merged_branch(repo.path(), "feature/dirty-worktree");
        create_merged_branch(repo.path(), "feature/locked-worktree");

        let clean_worktree = TestDir::new();
        let dirty_worktree = TestDir::new();
        let locked_worktree = TestDir::new();
        run_git_command(
            repo.path(),
            &[
                "worktree",
                "add",
                clean_worktree.path().to_str().unwrap(),
                "feature/clean-worktree",
            ],
        );
        run_git_command(
            repo.path(),
            &[
                "worktree",
                "add",
                dirty_worktree.path().to_str().unwrap(),
                "feature/dirty-worktree",
            ],
        );
        std::fs::write(dirty_worktree.path().join("dirty.txt"), "dirty").unwrap();
        run_git_command(
            repo.path(),
            &[
                "worktree",
                "add",
                locked_worktree.path().to_str().unwrap(),
                "feature/locked-worktree",
            ],
        );
        run_git_command(
            repo.path(),
            &["worktree", "lock", locked_worktree.path().to_str().unwrap()],
        );

        let preview = preview_project_worktree_cleanup(repo.path().to_str().unwrap()).unwrap();
        let paths = preview
            .worktree_candidates
            .iter()
            .map(|candidate| candidate.path.as_str())
            .collect::<Vec<_>>();

        let clean_worktree_path = worktree_path_in_git_format(clean_worktree.path());
        assert_eq!(paths, vec![clean_worktree_path.as_str()]);
        assert_eq!(
            preview.worktree_candidates[0].reason,
            ProjectGitCleanupReason::Merged
        );
        assert_eq!(
            preview.worktree_candidates[0].branch.as_deref(),
            Some("feature/clean-worktree")
        );
    }

    #[test]
    fn cleanup_project_worktrees_removes_only_current_safe_candidates() {
        let repo = TestDir::new();
        init_git_repo_with_commit(repo.path());
        create_merged_branch(repo.path(), "feature/clean-worktree");
        create_merged_branch(repo.path(), "feature/dirty-worktree");

        let clean_worktree = TestDir::new();
        let dirty_worktree = TestDir::new();
        run_git_command(
            repo.path(),
            &[
                "worktree",
                "add",
                clean_worktree.path().to_str().unwrap(),
                "feature/clean-worktree",
            ],
        );
        run_git_command(
            repo.path(),
            &[
                "worktree",
                "add",
                dirty_worktree.path().to_str().unwrap(),
                "feature/dirty-worktree",
            ],
        );
        std::fs::write(dirty_worktree.path().join("dirty.txt"), "dirty").unwrap();

        let clean_worktree_path = worktree_path_in_git_format(clean_worktree.path());
        let dirty_worktree_path = worktree_path_in_git_format(dirty_worktree.path());
        let repo_path = worktree_path_in_git_format(repo.path());
        let result = cleanup_project_worktrees(
            repo.path().to_str().unwrap(),
            vec![clean_worktree_path.clone(), dirty_worktree_path, repo_path],
        )
        .unwrap();

        assert_eq!(result.deleted_worktrees, vec![clean_worktree_path]);
        assert!(!clean_worktree.path().exists());
        assert!(dirty_worktree.path().exists());
        assert!(repo.path().exists());
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
    fn inspect_agents_status_accepts_hard_link_alias() {
        let sandbox = TestDir::new();
        let claude_path = sandbox.path().join("CLAUDE.md");
        let agents_path = sandbox.path().join("AGENTS.md");
        std::fs::write(&claude_path, "hello").unwrap();
        std::fs::hard_link(&claude_path, &agents_path).unwrap();

        let status = inspect_project_files(sandbox.path()).unwrap();

        assert_eq!(status.agents_status, AgentsStatus::CorrectSymlink);
    }

    #[test]
    fn create_agents_symlink_accepts_existing_hard_link_alias() {
        let sandbox = TestDir::new();
        let claude_path = sandbox.path().join("CLAUDE.md");
        let agents_path = sandbox.path().join("AGENTS.md");
        std::fs::write(&claude_path, "hello").unwrap();
        std::fs::hard_link(&claude_path, &agents_path).unwrap();

        create_agents_symlink(sandbox.path()).unwrap();

        let status = inspect_project_files(sandbox.path()).unwrap();
        assert_eq!(status.agents_status, AgentsStatus::CorrectSymlink);
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

    fn init_git_repo_with_commit(path: &Path) {
        run_git_command(path, &["init"]);
        run_git_command(path, &["config", "user.email", "test@example.com"]);
        run_git_command(path, &["config", "user.name", "AI Manager Test"]);
        std::fs::write(path.join("README.md"), "initial\n").unwrap();
        run_git_command(path, &["add", "README.md"]);
        run_git_command(path, &["commit", "-m", "initial"]);
        run_git_command(path, &["branch", "-M", "main"]);
    }

    fn create_merged_branch(path: &Path, branch: &str) {
        run_git_command(path, &["checkout", "-b", branch]);
        let file_name = branch.replace('/', "-");
        std::fs::write(path.join(format!("{file_name}.txt")), format!("{branch}\n")).unwrap();
        run_git_command(path, &["add", "."]);
        run_git_command(path, &["commit", "-m", branch]);
        run_git_command(path, &["checkout", "main"]);
        run_git_command(
            path,
            &["merge", "--no-ff", branch, "-m", &format!("merge {branch}")],
        );
    }

    fn create_patch_equivalent_upstream_gone_branch(path: &Path, branch: &str) {
        run_git_command(path, &["checkout", "-b", branch]);
        std::fs::write(path.join("gone.txt"), "gone\n").unwrap();
        run_git_command(path, &["add", "gone.txt"]);
        run_git_command(path, &["commit", "-m", branch]);
        run_git_command(path, &["checkout", "main"]);
        std::fs::write(path.join("main-shift.txt"), "main shift\n").unwrap();
        run_git_command(path, &["add", "main-shift.txt"]);
        run_git_command(path, &["commit", "-m", "main shift"]);
        run_git_command(path, &["cherry-pick", branch]);
        set_upstream_gone(path, branch);
    }

    fn create_unmerged_upstream_gone_branch(path: &Path, branch: &str) {
        run_git_command(path, &["checkout", "-b", branch]);
        let file_name = branch.replace('/', "-");
        std::fs::write(path.join(format!("{file_name}.txt")), format!("{branch}\n")).unwrap();
        run_git_command(path, &["add", "."]);
        run_git_command(path, &["commit", "-m", branch]);
        run_git_command(path, &["checkout", "main"]);
        set_upstream_gone(path, branch);
    }

    fn set_upstream_gone(path: &Path, branch: &str) {
        run_git_command(
            path,
            &["config", &format!("branch.{branch}.remote"), "origin"],
        );
        run_git_command(
            path,
            &[
                "config",
                &format!("branch.{branch}.merge"),
                &format!("refs/heads/{branch}"),
            ],
        );
    }

    fn branch_exists(path: &Path, branch: &str) -> bool {
        Command::new("git")
            .arg("-C")
            .arg(path)
            .args([
                "show-ref",
                "--verify",
                "--quiet",
                &format!("refs/heads/{branch}"),
            ])
            .status()
            .unwrap()
            .success()
    }

    /// 把本机绝对路径转换为 `git worktree list --porcelain` 在 Windows 上输出的格式：
    /// 去掉 `\\?\` verbatim 前缀，并把反斜杠替换成正斜杠；其它平台直接使用 `to_string_lossy()`。
    fn worktree_path_in_git_format(path: &Path) -> String {
        let canon = std::fs::canonicalize(path).expect("测试路径应可 canonicalize");
        crate::utils::normalize_path_for_display(&canon)
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

    #[cfg(unix)]
    fn create_test_symlink(src: &Path, dest: &Path) {
        std::os::unix::fs::symlink(src, dest).unwrap();
    }

    #[cfg(windows)]
    fn create_test_symlink(src: &Path, dest: &Path) {
        std::os::windows::fs::symlink_file(src, dest).unwrap();
    }
}
