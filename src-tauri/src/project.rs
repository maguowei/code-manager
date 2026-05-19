use serde::{Deserialize, Serialize};
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

/// 两端配对的整体状态，覆盖 CLAUDE.md ↔ AGENTS.md 与 `.claude/skills` ↔ `.agents/skills`
#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum PairStatus {
    /// 两端都不存在
    BothMissing,
    /// 仅 Claude 端为真文件 / 真目录，可派生 Codex 端软链
    OnlyClaude,
    /// 仅 Codex 端为真文件 / 真目录，可派生 Claude 端软链
    OnlyAgents,
    /// 已成对（hard link / 内容相同 / 软链方向正确）
    Paired,
    /// 一端是真源，另一端是错误软链，可删除旧软链后重建
    WrongSymlink,
    /// 两端都是真文件且无法判源（内容不同或互不相关）
    Conflict,
    /// 两端都是软链，或仅有孤儿软链而无真源，无法修复
    OrphanSymlink,
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

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ProjectSkillSummary {
    pub id: String,
    pub is_symlink: bool,
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
    pub has_project_claude_dir: bool,
    pub has_project_claude_skills: bool,
    pub has_project_claude_settings: bool,
    pub has_project_claude_settings_local: bool,
    pub project_claude_rules_count: usize,
    pub agents_status: AgentsStatus,
    pub agents_skills_status: AgentsStatus,
    pub memory_pair_status: PairStatus,
    pub skills_pair_status: PairStatus,
    pub project_skills: Vec<ProjectSkillSummary>,
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
    has_project_claude_dir: bool,
    has_project_claude_skills: bool,
    has_project_claude_settings: bool,
    has_project_claude_settings_local: bool,
    project_claude_rules_count: usize,
    agents_status: AgentsStatus,
    agents_skills_status: AgentsStatus,
    memory_pair_status: PairStatus,
    skills_pair_status: PairStatus,
    project_skills: Vec<ProjectSkillSummary>,
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
            has_project_claude_dir: false,
            has_project_claude_skills: false,
            has_project_claude_settings: false,
            has_project_claude_settings_local: false,
            project_claude_rules_count: 0,
            agents_status: AgentsStatus::Missing,
            agents_skills_status: AgentsStatus::Missing,
            memory_pair_status: PairStatus::BothMissing,
            skills_pair_status: PairStatus::BothMissing,
            project_skills: Vec::new(),
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
        has_project_claude_dir: file_status.has_project_claude_dir,
        has_project_claude_skills: file_status.has_project_claude_skills,
        has_project_claude_settings: file_status.has_project_claude_settings,
        has_project_claude_settings_local: file_status.has_project_claude_settings_local,
        project_claude_rules_count: file_status.project_claude_rules_count,
        agents_status: file_status.agents_status,
        agents_skills_status: file_status.agents_skills_status,
        memory_pair_status: file_status.memory_pair_status,
        skills_pair_status: file_status.skills_pair_status,
        project_skills: file_status.project_skills,
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
pub fn create_project_agents_skills_symlink(project: &str) -> Result<(), String> {
    let result = (|| {
        let project_path = validate_project_path(project)?;
        if !project_path.is_dir() {
            return Err("项目目录不存在".to_string());
        }
        create_project_agents_skills_symlink_for_dir(&project_path)
    })();
    crate::logging::log_command_result("project.agents_skills_symlink", &result, |_| {
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
    let project_claude_dir = project_dir.join(".claude");
    let project_claude_skills_path = project_claude_dir.join("skills");
    let project_claude_rules_path = project_claude_dir.join("rules");
    let has_claude_md = claude_path.is_file();
    let has_project_claude_dir = project_claude_dir.is_dir();
    let has_project_claude_skills = project_claude_skills_path.is_dir();
    let has_project_claude_settings = project_claude_dir.join("settings.json").is_file();
    let has_project_claude_settings_local =
        project_claude_dir.join("settings.local.json").is_file();
    let project_claude_rules_count = count_project_claude_rules(&project_claude_rules_path);
    let project_skills = scan_project_skills(&project_claude_skills_path);

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

    let memory_pair_status = inspect_memory_pair_status(&claude_path, &agents_path)?;

    let agents_skills_status = inspect_agents_skills_status(
        project_dir,
        &project_claude_skills_path,
        has_project_claude_skills,
    )?;

    let skills_pair_status = inspect_skills_pair_status(project_dir, &project_claude_skills_path)?;

    Ok(ProjectFileStatus {
        has_claude_md,
        has_project_claude_dir,
        has_project_claude_skills,
        has_project_claude_settings,
        has_project_claude_settings_local,
        project_claude_rules_count,
        agents_status,
        agents_skills_status,
        memory_pair_status,
        skills_pair_status,
        project_skills,
    })
}

/// 端点种类：用于 PairStatus 的分支判定
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum EndpointKind {
    /// 不存在
    Missing,
    /// 真文件 / 真目录（包含 hard link）
    Source,
    /// 软链接（无论 target 是否可达）
    Symlink,
    /// 既不是普通文件 / 目录也不是软链（FIFO、socket 等），或类型不匹配预期
    Foreign,
}

fn classify_file_endpoint(path: &Path) -> Result<EndpointKind, String> {
    match fs::symlink_metadata(path) {
        Ok(meta) if meta.file_type().is_symlink() => Ok(EndpointKind::Symlink),
        Ok(meta) if meta.is_file() => Ok(EndpointKind::Source),
        Ok(_) => Ok(EndpointKind::Foreign),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(EndpointKind::Missing),
        Err(e) => Err(format!("读取 {:?} 状态失败: {}", path, e)),
    }
}

fn classify_dir_endpoint(path: &Path) -> Result<EndpointKind, String> {
    match fs::symlink_metadata(path) {
        Ok(meta) if meta.file_type().is_symlink() => Ok(EndpointKind::Symlink),
        Ok(meta) if meta.is_dir() => Ok(EndpointKind::Source),
        Ok(_) => Ok(EndpointKind::Foreign),
        Err(e)
            if e.kind() == std::io::ErrorKind::NotFound
                || e.kind() == std::io::ErrorKind::NotADirectory =>
        {
            Ok(EndpointKind::Missing)
        }
        Err(e) => Err(format!("读取 {:?} 状态失败: {}", path, e)),
    }
}

/// 比较 Claude / Agents 两端的 Memory 配对状态
fn inspect_memory_pair_status(
    claude_path: &Path,
    agents_path: &Path,
) -> Result<PairStatus, String> {
    let claude_kind = classify_file_endpoint(claude_path)?;
    let agents_kind = classify_file_endpoint(agents_path)?;

    let pair = match (claude_kind, agents_kind) {
        (EndpointKind::Missing, EndpointKind::Missing) => PairStatus::BothMissing,
        (EndpointKind::Source, EndpointKind::Missing) => PairStatus::OnlyClaude,
        (EndpointKind::Missing, EndpointKind::Source) => PairStatus::OnlyAgents,
        (EndpointKind::Source, EndpointKind::Source) => {
            if files_are_same(claude_path, agents_path) {
                PairStatus::Paired
            } else {
                PairStatus::Conflict
            }
        }
        (EndpointKind::Source, EndpointKind::Symlink) => {
            if symlink_points_to(agents_path, claude_path)? {
                PairStatus::Paired
            } else {
                PairStatus::WrongSymlink
            }
        }
        (EndpointKind::Symlink, EndpointKind::Source) => {
            if symlink_points_to(claude_path, agents_path)? {
                PairStatus::Paired
            } else {
                PairStatus::WrongSymlink
            }
        }
        (EndpointKind::Symlink, EndpointKind::Symlink) => PairStatus::OrphanSymlink,
        (EndpointKind::Symlink, EndpointKind::Missing)
        | (EndpointKind::Missing, EndpointKind::Symlink) => PairStatus::OrphanSymlink,
        // 任何 Foreign / 非常规组合都按冲突处理，让用户手动介入
        _ => PairStatus::Conflict,
    };

    Ok(pair)
}

/// 比较项目级 Skills 目录两端的配对状态
fn inspect_skills_pair_status(
    project_dir: &Path,
    project_claude_skills_path: &Path,
) -> Result<PairStatus, String> {
    let agents_dir = project_dir.join(".agents");
    let agents_skills_path = agents_dir.join("skills");

    let claude_kind = classify_dir_endpoint(project_claude_skills_path)?;
    let agents_kind = classify_dir_endpoint(&agents_skills_path)?;

    let pair = match (claude_kind, agents_kind) {
        (EndpointKind::Missing, EndpointKind::Missing) => PairStatus::BothMissing,
        (EndpointKind::Source, EndpointKind::Missing) => PairStatus::OnlyClaude,
        (EndpointKind::Missing, EndpointKind::Source) => PairStatus::OnlyAgents,
        (EndpointKind::Source, EndpointKind::Source) => {
            // 两个真目录都存在但没有软链关系，无法判源
            PairStatus::Conflict
        }
        (EndpointKind::Source, EndpointKind::Symlink) => {
            if symlink_points_to(&agents_skills_path, project_claude_skills_path)? {
                PairStatus::Paired
            } else {
                PairStatus::WrongSymlink
            }
        }
        (EndpointKind::Symlink, EndpointKind::Source) => {
            if symlink_points_to(project_claude_skills_path, &agents_skills_path)? {
                PairStatus::Paired
            } else {
                PairStatus::WrongSymlink
            }
        }
        (EndpointKind::Symlink, EndpointKind::Symlink) => PairStatus::OrphanSymlink,
        (EndpointKind::Symlink, EndpointKind::Missing)
        | (EndpointKind::Missing, EndpointKind::Symlink) => PairStatus::OrphanSymlink,
        _ => PairStatus::Conflict,
    };

    Ok(pair)
}

/// 读取软链 target 并与期望目标做规范化比对
fn symlink_points_to(symlink_path: &Path, expected_target: &Path) -> Result<bool, String> {
    let target = fs::read_link(symlink_path)
        .map_err(|e| format!("读取 {:?} 软链接失败: {}", symlink_path, e))?;
    let parent = symlink_path.parent().unwrap_or(Path::new(""));
    let resolved = if target.is_absolute() {
        target
    } else {
        parent.join(target)
    };
    Ok(paths_match(&resolved, expected_target))
}

fn inspect_agents_skills_status(
    project_dir: &Path,
    project_claude_skills_path: &Path,
    has_project_claude_skills: bool,
) -> Result<AgentsStatus, String> {
    let agents_dir = project_dir.join(".agents");
    let agents_skills_path = agents_dir.join("skills");

    match fs::symlink_metadata(&agents_skills_path) {
        Ok(meta) if meta.file_type().is_symlink() => {
            let target = fs::read_link(&agents_skills_path)
                .map_err(|e| format!("读取 .agents/skills 软链接失败: {}", e))?;
            let resolved = if target.is_absolute() {
                target
            } else {
                agents_dir.join(target)
            };

            if has_project_claude_skills && paths_match(&resolved, project_claude_skills_path) {
                Ok(AgentsStatus::CorrectSymlink)
            } else {
                Ok(AgentsStatus::WrongSymlink)
            }
        }
        Ok(_) => Ok(AgentsStatus::PlainFileConflict),
        Err(e)
            if e.kind() == std::io::ErrorKind::NotFound
                || e.kind() == std::io::ErrorKind::NotADirectory =>
        {
            match fs::symlink_metadata(&agents_dir) {
                Ok(meta) if !meta.is_dir() => Ok(AgentsStatus::PlainFileConflict),
                Ok(_) => Ok(AgentsStatus::Missing),
                Err(parent_error)
                    if parent_error.kind() == std::io::ErrorKind::NotFound
                        || parent_error.kind() == std::io::ErrorKind::NotADirectory =>
                {
                    Ok(AgentsStatus::Missing)
                }
                Err(parent_error) => Err(format!("读取 .agents 状态失败: {}", parent_error)),
            }
        }
        Err(e) => Err(format!("读取 .agents/skills 状态失败: {}", e)),
    }
}

fn scan_project_skills(skills_dir: &Path) -> Vec<ProjectSkillSummary> {
    let entries = match fs::read_dir(skills_dir) {
        Ok(entries) => entries,
        Err(_) => return Vec::new(),
    };

    let mut skills = Vec::new();
    for entry in entries.flatten() {
        let file_type = match entry.file_type() {
            Ok(file_type) => file_type,
            Err(_) => continue,
        };
        let id = match entry.file_name().to_str() {
            Some(id) if !id.is_empty() => id.to_string(),
            _ => continue,
        };
        let skill_root = if file_type.is_symlink() {
            match entry.path().canonicalize() {
                Ok(target) => target,
                Err(_) => continue,
            }
        } else if file_type.is_dir() {
            entry.path()
        } else {
            continue;
        };

        if skill_root.join("SKILL.md").is_file() {
            skills.push(ProjectSkillSummary {
                id,
                is_symlink: file_type.is_symlink(),
            });
        }
    }

    skills.sort_by(|a, b| a.id.cmp(&b.id));
    skills
}

// 递归统计 `.claude/rules/` 下 `.md` 文件总数。
// 遵循 Claude Code 官方约定：rules 支持嵌套目录，每个 .md 都是一条规则。
// 跳过软链接以防止逃逸或环路；目录不存在 / 读取失败时返回 0，与 scan_project_skills 风格保持一致。
fn count_project_claude_rules(rules_dir: &Path) -> usize {
    if !rules_dir.is_dir() {
        return 0;
    }
    let mut total = 0;
    let mut stack: Vec<PathBuf> = vec![rules_dir.to_path_buf()];
    while let Some(dir) = stack.pop() {
        let entries = match fs::read_dir(&dir) {
            Ok(entries) => entries,
            Err(_) => continue,
        };
        for entry in entries.flatten() {
            let file_type = match entry.file_type() {
                Ok(file_type) => file_type,
                Err(_) => continue,
            };
            if file_type.is_symlink() {
                continue;
            }
            if file_type.is_dir() {
                stack.push(entry.path());
                continue;
            }
            if !file_type.is_file() {
                continue;
            }
            if is_markdown_file_name(entry.file_name().to_str()) {
                total += 1;
            }
        }
    }
    total
}

fn is_markdown_file_name(name: Option<&str>) -> bool {
    match name {
        Some(name) => {
            let lower = name.to_ascii_lowercase();
            lower.ends_with(".md") || lower.ends_with(".markdown")
        }
        None => false,
    }
}

fn create_agents_symlink(project_dir: &Path) -> Result<(), String> {
    let claude_path = project_dir.join("CLAUDE.md");
    let agents_path = project_dir.join("AGENTS.md");
    let pair = inspect_memory_pair_status(&claude_path, &agents_path)?;

    match pair {
        PairStatus::Paired => Ok(()),
        PairStatus::OnlyClaude => create_memory_symlink_to(&claude_path, &agents_path),
        PairStatus::OnlyAgents => create_memory_symlink_to(&agents_path, &claude_path),
        PairStatus::WrongSymlink => repair_memory_symlink(&claude_path, &agents_path),
        PairStatus::BothMissing => {
            Err("项目根目录缺少 CLAUDE.md 和 AGENTS.md，无法生成软链接".to_string())
        }
        PairStatus::Conflict => Err(format!(
            "CLAUDE.md 与 AGENTS.md 都已存在为普通文件且内容不一致，请先手动处理: {:?}",
            agents_path
        )),
        PairStatus::OrphanSymlink => Err(format!(
            "两端都是软链或仅有孤儿软链，无法确定源文件，请先手动处理: {:?}",
            agents_path
        )),
    }
}

/// 在 `link_path` 处创建一条相对软链指向同目录下的 `source_path`
fn create_memory_symlink_to(source_path: &Path, link_path: &Path) -> Result<(), String> {
    let source_name = source_path
        .file_name()
        .ok_or_else(|| format!("无法解析源文件名: {:?}", source_path))?;
    let relative_target = Path::new(source_name);

    #[cfg(unix)]
    std::os::unix::fs::symlink(relative_target, link_path)
        .map_err(|e| format!("创建软链接失败: {}", e))?;

    #[cfg(windows)]
    std::os::windows::fs::symlink_file(relative_target, link_path).or_else(|symlink_error| {
        fs::hard_link(source_path, link_path).map_err(|hard_link_error| {
            format!(
                "创建软链接失败: {}; 创建硬链接也失败: {}",
                symlink_error, hard_link_error
            )
        })
    })?;

    let _ = source_path;
    Ok(())
}

/// 删除指向错误目标的旧软链接，再按"以真源为方向"重建
fn repair_memory_symlink(claude_path: &Path, agents_path: &Path) -> Result<(), String> {
    let claude_kind = classify_file_endpoint(claude_path)?;
    let agents_kind = classify_file_endpoint(agents_path)?;

    match (claude_kind, agents_kind) {
        (EndpointKind::Source, EndpointKind::Symlink) => {
            fs::remove_file(agents_path).map_err(|e| format!("删除旧的软链接失败: {}", e))?;
            create_memory_symlink_to(claude_path, agents_path)
        }
        (EndpointKind::Symlink, EndpointKind::Source) => {
            fs::remove_file(claude_path).map_err(|e| format!("删除旧的软链接失败: {}", e))?;
            create_memory_symlink_to(agents_path, claude_path)
        }
        _ => Err("当前状态不可修复，请手动处理".to_string()),
    }
}

fn create_project_agents_skills_symlink_for_dir(project_dir: &Path) -> Result<(), String> {
    let project_claude_skills_path = project_dir.join(".claude").join("skills");
    let agents_skills_path = project_dir.join(".agents").join("skills");
    let pair = inspect_skills_pair_status(project_dir, &project_claude_skills_path)?;

    match pair {
        PairStatus::Paired => Ok(()),
        PairStatus::OnlyClaude => create_skills_symlink_at_agents(
            project_dir,
            &project_claude_skills_path,
            &agents_skills_path,
        ),
        PairStatus::OnlyAgents => create_skills_symlink_at_claude(project_dir, &agents_skills_path),
        PairStatus::WrongSymlink => repair_skills_symlink(
            project_dir,
            &project_claude_skills_path,
            &agents_skills_path,
        ),
        PairStatus::BothMissing => {
            Err("项目缺少 .claude/skills 与 .agents/skills，无法生成软链接".to_string())
        }
        PairStatus::Conflict => Err(format!(
            ".claude/skills 与 .agents/skills 都已存在为真目录，请先手动处理: {:?}",
            agents_skills_path
        )),
        PairStatus::OrphanSymlink => Err(format!(
            "两端都是软链或仅有孤儿软链，无法确定源目录，请先手动处理: {:?}",
            agents_skills_path
        )),
    }
}

/// `.claude/skills` 是真目录时，在 `.agents/skills` 处创建相对软链
fn create_skills_symlink_at_agents(
    project_dir: &Path,
    project_claude_skills_path: &Path,
    agents_skills_path: &Path,
) -> Result<(), String> {
    let agents_dir = project_dir.join(".agents");
    ensure_real_directory(&agents_dir, "创建 .agents 目录失败")?;

    if let Ok(meta) = fs::symlink_metadata(agents_skills_path) {
        if meta.file_type().is_symlink() {
            remove_symlink_node(agents_skills_path)
                .map_err(|e| format!("删除旧的 .agents/skills 软链接失败: {}", e))?;
        } else {
            return Err(format!(
                "目标路径已存在且不是软链接，无法覆盖: {:?}",
                agents_skills_path
            ));
        }
    }

    let relative_target = Path::new("../.claude/skills");

    #[cfg(unix)]
    std::os::unix::fs::symlink(relative_target, agents_skills_path)
        .map_err(|e| format!("创建 .agents/skills 软链接失败: {}", e))?;

    #[cfg(windows)]
    std::os::windows::fs::symlink_dir(relative_target, agents_skills_path)
        .map_err(|e| format!("创建 .agents/skills 软链接失败: {}", e))?;

    let _ = project_claude_skills_path;
    Ok(())
}

/// `.agents/skills` 是真目录时，在 `.claude/skills` 处创建相对软链
fn create_skills_symlink_at_claude(
    project_dir: &Path,
    agents_skills_path: &Path,
) -> Result<(), String> {
    let claude_dir = project_dir.join(".claude");
    ensure_real_directory(&claude_dir, "创建 .claude 目录失败")?;

    let project_claude_skills_path = claude_dir.join("skills");
    if let Ok(meta) = fs::symlink_metadata(&project_claude_skills_path) {
        if meta.file_type().is_symlink() {
            remove_symlink_node(&project_claude_skills_path)
                .map_err(|e| format!("删除旧的 .claude/skills 软链接失败: {}", e))?;
        } else {
            return Err(format!(
                "目标路径已存在且不是软链接，无法覆盖: {:?}",
                project_claude_skills_path
            ));
        }
    }

    let relative_target = Path::new("../.agents/skills");

    #[cfg(unix)]
    std::os::unix::fs::symlink(relative_target, &project_claude_skills_path)
        .map_err(|e| format!("创建 .claude/skills 软链接失败: {}", e))?;

    #[cfg(windows)]
    std::os::windows::fs::symlink_dir(relative_target, &project_claude_skills_path)
        .map_err(|e| format!("创建 .claude/skills 软链接失败: {}", e))?;

    let _ = agents_skills_path;
    Ok(())
}

fn repair_skills_symlink(
    project_dir: &Path,
    project_claude_skills_path: &Path,
    agents_skills_path: &Path,
) -> Result<(), String> {
    let claude_kind = classify_dir_endpoint(project_claude_skills_path)?;
    let agents_kind = classify_dir_endpoint(agents_skills_path)?;

    match (claude_kind, agents_kind) {
        (EndpointKind::Source, EndpointKind::Symlink) => create_skills_symlink_at_agents(
            project_dir,
            project_claude_skills_path,
            agents_skills_path,
        ),
        (EndpointKind::Symlink, EndpointKind::Source) => {
            create_skills_symlink_at_claude(project_dir, agents_skills_path)
        }
        _ => Err("当前状态不可修复，请手动处理".to_string()),
    }
}

/// 确保 `dir` 是真目录；不存在时创建，存在但不是目录时报错
fn ensure_real_directory(dir: &Path, create_err_label: &str) -> Result<(), String> {
    match fs::symlink_metadata(dir) {
        Ok(meta) if meta.is_dir() && !meta.file_type().is_symlink() => Ok(()),
        Ok(_) => Err(format!("目标路径已存在且不是普通目录，无法继续: {:?}", dir)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            fs::create_dir_all(dir).map_err(|e| format!("{}: {}", create_err_label, e))
        }
        Err(e) => Err(format!("读取 {:?} 状态失败: {}", dir, e)),
    }
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

fn remove_symlink_node(path: &Path) -> std::io::Result<()> {
    #[cfg(unix)]
    {
        fs::remove_file(path)
    }

    #[cfg(windows)]
    {
        fs::remove_dir(path).or_else(|_| fs::remove_file(path))
    }

    #[cfg(not(any(unix, windows)))]
    {
        fs::remove_file(path)
    }
}

fn paths_match(left: &Path, right: &Path) -> bool {
    let left = fs::canonicalize(left).unwrap_or_else(|_| left.to_path_buf());
    let right = fs::canonicalize(right).unwrap_or_else(|_| right.to_path_buf());
    left == right
}

// =========================================================================
// 项目级 .claude/ 目录预览：嵌入「项目目录」卡片，与全局 ~/.claude/ 隔离。
// 仅 settings.json / settings.local.json 支持一键创建；其它创建/删除/重命名
// 走全局 ClaudeOverviewPage，不在这里复刻。
// =========================================================================

/// 项目级 settings 文件的归属（共享 vs 本地覆盖）
#[derive(Debug, Clone, Copy, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ProjectClaudeSettingsScope {
    Shared,
    Local,
}

const PROJECT_CLAUDE_OVERVIEW_MAX_ENTRIES: usize = 10_000;
const PROJECT_CLAUDE_OVERVIEW_MAX_DEPTH: usize = 16;
const PROJECT_CLAUDE_PREVIEW_MAX_BYTES: usize = 512 * 1024;

fn project_claude_root(project: &str) -> Result<PathBuf, String> {
    let project_path = validate_project_path(project)?;
    let claude_root = project_path.join(".claude");
    if !claude_root.is_dir() {
        return Err("项目 .claude/ 目录不存在".to_string());
    }
    Ok(claude_root)
}

/// 解析项目级 .claude/ 内的相对路径，沿用 claude_directory 的校验，错误文案改为项目场景
fn resolve_project_claude_file(claude_root: &Path, relative_path: &str) -> Result<PathBuf, String> {
    let rel_path = crate::claude_directory::validate_relative_claude_path(relative_path)
        .map_err(|_| "只能访问项目 .claude/ 内的文件".to_string())?;
    crate::claude_directory::resolve_existing_path_inside_root(claude_root, &rel_path)
        .map_err(|_| "只能访问项目 .claude/ 内的文件".to_string())
}

#[tauri::command]
pub fn get_project_claude_directory_overview(
    project: &str,
) -> Result<crate::claude_directory::ClaudeDirectoryOverview, String> {
    let result = (|| {
        let claude_root = project_claude_root(project)?;
        crate::claude_directory::scan_claude_directory_with_options(
            &claude_root,
            crate::claude_directory::ScanOptions {
                max_entries: PROJECT_CLAUDE_OVERVIEW_MAX_ENTRIES,
                max_depth: PROJECT_CLAUDE_OVERVIEW_MAX_DEPTH,
            },
        )
    })();
    crate::logging::log_command_result("project.claude_directory_overview", &result, |overview| {
        format!(
            "entry_count={} truncated={}",
            overview.entries.len(),
            overview.truncated
        )
    });
    result
}

#[tauri::command]
pub fn get_project_claude_file_preview(
    project: &str,
    relative_path: String,
) -> Result<crate::claude_directory::ClaudeFilePreview, String> {
    let result = (|| {
        let claude_root = project_claude_root(project)?;
        // 先用项目侧错误文案过一次路径校验；通过后再调全局预览实现
        let _ = resolve_project_claude_file(&claude_root, &relative_path)?;
        crate::claude_directory::read_claude_file_preview_from_root(
            &claude_root,
            &relative_path,
            PROJECT_CLAUDE_PREVIEW_MAX_BYTES,
        )
    })();
    crate::logging::log_command_result("project.claude_directory_preview", &result, |preview| {
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
pub fn create_project_claude_settings_file(
    project: &str,
    scope: ProjectClaudeSettingsScope,
) -> Result<(), String> {
    let result = (|| {
        let project_path = validate_project_path(project)?;
        if !project_path.is_dir() {
            return Err("项目目录不存在".to_string());
        }
        let claude_root = project_path.join(".claude");
        let filename = match scope {
            ProjectClaudeSettingsScope::Shared => "settings.json",
            ProjectClaudeSettingsScope::Local => "settings.local.json",
        };
        let target = claude_root.join(filename);
        if target.exists() {
            return Err("文件已存在".to_string());
        }
        fs::create_dir_all(&claude_root)
            .map_err(|e| format!("创建项目 .claude/ 目录失败: {}", e))?;
        crate::utils::ensure_dir_and_write_atomic(&target, "{}\n")
    })();
    crate::logging::log_command_result("project.claude_settings_create", &result, |_| {
        format!(
            "project={} scope={:?}",
            crate::utils::truncate(project, 160),
            scope
        )
    });
    result
}

#[tauri::command]
pub fn open_project_claude_file_in_editor(
    project: &str,
    relative_path: String,
) -> Result<(), String> {
    let result = (|| {
        let claude_root = project_claude_root(project)?;
        let target = resolve_project_claude_file(&claude_root, &relative_path)?;
        let metadata = fs::metadata(&target).map_err(|e| format!("读取文件元数据失败: {}", e))?;
        if !metadata.is_file() {
            return Err("只能用默认编辑器打开项目 .claude/ 内的文件".to_string());
        }
        let preferences = crate::config::load_app_preferences();
        let editor = preferences
            .default_editor_app
            .as_deref()
            .ok_or_else(|| "请先在设置中选择默认编辑器".to_string())?;
        crate::native_open::open_path_in_editor(&target, editor)
    })();
    crate::logging::log_command_result("project.claude_directory_open_editor", &result, |_| {
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
        assert!(err.contains("内容不一致"));
    }

    #[test]
    fn create_agents_symlink_reverse_creates_claude_md_from_agents_md() {
        let sandbox = TestDir::new();
        std::fs::write(sandbox.path().join("AGENTS.md"), "agents-source").unwrap();

        create_agents_symlink(sandbox.path()).unwrap();

        let status = inspect_project_files(sandbox.path()).unwrap();
        assert!(status.has_claude_md);
        assert_eq!(status.memory_pair_status, PairStatus::Paired);

        let link_target = std::fs::read_link(sandbox.path().join("CLAUDE.md")).unwrap();
        assert_eq!(link_target, Path::new("AGENTS.md"));
    }

    #[test]
    fn inspect_memory_pair_status_reports_only_agents_when_claude_missing() {
        let sandbox = TestDir::new();
        std::fs::write(sandbox.path().join("AGENTS.md"), "agents").unwrap();

        let status = inspect_project_files(sandbox.path()).unwrap();
        assert_eq!(status.memory_pair_status, PairStatus::OnlyAgents);
    }

    #[test]
    fn inspect_memory_pair_status_reports_conflict_when_both_plain_differ() {
        let sandbox = TestDir::new();
        std::fs::write(sandbox.path().join("CLAUDE.md"), "claude").unwrap();
        std::fs::write(sandbox.path().join("AGENTS.md"), "agents").unwrap();

        let status = inspect_project_files(sandbox.path()).unwrap();
        assert_eq!(status.memory_pair_status, PairStatus::Conflict);
    }

    #[test]
    fn inspect_project_files_exposes_project_claude_skills_and_agents_skills_status() {
        let sandbox = TestDir::new();
        fs::create_dir_all(sandbox.path().join(".claude/skills/review-skill")).unwrap();
        fs::write(
            sandbox.path().join(".claude/skills/review-skill/SKILL.md"),
            "---\nname: Review Skill\n---\n",
        )
        .unwrap();

        let initial = inspect_project_files(sandbox.path()).unwrap();
        assert!(initial.has_project_claude_dir);
        assert!(initial.has_project_claude_skills);
        assert_eq!(initial.agents_skills_status, AgentsStatus::Missing);
        assert_eq!(initial.project_skills.len(), 1);
        assert_eq!(initial.project_skills[0].id, "review-skill");
        assert_eq!(initial.project_claude_rules_count, 0);

        create_project_agents_skills_symlink_for_dir(sandbox.path()).unwrap();
        let linked = inspect_project_files(sandbox.path()).unwrap();
        assert_eq!(linked.agents_skills_status, AgentsStatus::CorrectSymlink);

        let link_target = fs::read_link(sandbox.path().join(".agents/skills")).unwrap();
        assert_eq!(link_target, Path::new("../.claude/skills"));
    }

    #[test]
    fn inspect_project_files_counts_rules_recursively_and_ignores_non_markdown_and_symlinks() {
        let sandbox = TestDir::new();
        fs::create_dir_all(sandbox.path().join(".claude/rules/nested")).unwrap();
        fs::write(sandbox.path().join(".claude/rules/a.md"), "rule a").unwrap();
        fs::write(sandbox.path().join(".claude/rules/b.markdown"), "rule b").unwrap();
        fs::write(sandbox.path().join(".claude/rules/note.txt"), "ignored").unwrap();
        fs::write(
            sandbox.path().join(".claude/rules/nested/c.md"),
            "nested rule",
        )
        .unwrap();
        // 软链应被跳过，不计入 rules 数量
        let link_source = sandbox.path().join(".claude/rules/a.md");
        let link_path = sandbox.path().join(".claude/rules/link.md");
        create_test_symlink(&link_source, &link_path);

        let status = inspect_project_files(sandbox.path()).unwrap();
        assert_eq!(status.project_claude_rules_count, 3);
    }

    #[test]
    fn inspect_project_files_reports_zero_rules_when_directory_missing() {
        let sandbox = TestDir::new();
        // 仅创建 .claude/ 但不创建 rules/
        fs::create_dir_all(sandbox.path().join(".claude")).unwrap();

        let status = inspect_project_files(sandbox.path()).unwrap();
        assert!(status.has_project_claude_dir);
        assert_eq!(status.project_claude_rules_count, 0);
    }

    #[test]
    fn create_project_agents_skills_symlink_rejects_missing_source_or_conflict() {
        let missing = TestDir::new();
        let err = create_project_agents_skills_symlink_for_dir(missing.path()).unwrap_err();
        assert!(err.contains(".claude/skills") || err.contains(".agents/skills"));

        let conflict = TestDir::new();
        fs::create_dir_all(conflict.path().join(".claude/skills")).unwrap();
        fs::create_dir_all(conflict.path().join(".agents/skills")).unwrap();

        let err = create_project_agents_skills_symlink_for_dir(conflict.path()).unwrap_err();
        assert!(err.contains("都已存在为真目录"));
    }

    #[test]
    fn create_project_agents_skills_symlink_reverse_creates_claude_skills_from_agents_skills() {
        let sandbox = TestDir::new();
        fs::create_dir_all(sandbox.path().join(".agents/skills/codex-skill")).unwrap();
        fs::write(
            sandbox.path().join(".agents/skills/codex-skill/SKILL.md"),
            "---\nname: Codex Skill\n---\n",
        )
        .unwrap();

        create_project_agents_skills_symlink_for_dir(sandbox.path()).unwrap();

        let linked = inspect_project_files(sandbox.path()).unwrap();
        assert!(linked.has_project_claude_skills);
        assert_eq!(linked.skills_pair_status, PairStatus::Paired);

        let link_target = fs::read_link(sandbox.path().join(".claude/skills")).unwrap();
        assert_eq!(link_target, Path::new("../.agents/skills"));
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

    // ------------------------------------------------------------------------
    // 项目级 .claude/ Explorer 相关测试
    // ------------------------------------------------------------------------

    #[test]
    fn get_project_claude_directory_overview_requires_claude_subdir() {
        let project = TestDir::new();
        let err = get_project_claude_directory_overview(project.path().to_str().unwrap())
            .expect_err("无 .claude/ 时应拒绝");
        assert!(err.contains(".claude/"));
    }

    #[test]
    fn get_project_claude_directory_overview_lists_entries_under_claude() {
        let project = TestDir::new();
        let claude = project.path().join(".claude");
        std::fs::create_dir_all(&claude).unwrap();
        std::fs::write(claude.join("settings.json"), "{}\n").unwrap();
        std::fs::create_dir_all(claude.join("commands")).unwrap();
        std::fs::write(claude.join("commands/run.md"), "hello\n").unwrap();

        let overview = get_project_claude_directory_overview(project.path().to_str().unwrap())
            .expect("应可读取目录");
        let names: Vec<&str> = overview
            .entries
            .iter()
            .map(|entry| entry.path.as_str())
            .collect();
        assert!(names.contains(&"settings.json"));
        assert!(names.contains(&"commands"));
        assert!(names.contains(&"commands/run.md"));
    }

    #[test]
    fn get_project_claude_file_preview_rejects_path_escape() {
        let project = TestDir::new();
        let claude = project.path().join(".claude");
        std::fs::create_dir_all(&claude).unwrap();
        std::fs::write(claude.join("settings.json"), "{}\n").unwrap();

        for bad in ["../etc/passwd", "/etc/passwd", "", "../settings.json"] {
            let err =
                get_project_claude_file_preview(project.path().to_str().unwrap(), bad.to_string())
                    .expect_err(&format!("路径 {bad} 应被拒"));
            assert!(
                err.contains("项目 .claude/") || err.contains("项目路径"),
                "非预期错误: {err}"
            );
        }
    }

    #[test]
    fn get_project_claude_file_preview_truncates_large_file() {
        let project = TestDir::new();
        let claude = project.path().join(".claude");
        std::fs::create_dir_all(&claude).unwrap();
        // 600 KB 全 'a'，应被 512 KB 截断
        let big_content = "a".repeat(600 * 1024);
        std::fs::write(claude.join("big.txt"), &big_content).unwrap();

        let preview = get_project_claude_file_preview(
            project.path().to_str().unwrap(),
            "big.txt".to_string(),
        )
        .expect("应可读取");
        assert!(preview.truncated);
        assert_eq!(preview.content.len(), 512 * 1024);
        assert!(!preview.is_binary);
    }

    #[test]
    fn get_project_claude_file_preview_detects_binary() {
        let project = TestDir::new();
        let claude = project.path().join(".claude");
        std::fs::create_dir_all(&claude).unwrap();
        // 包含 NUL 字节的内容会被识别为二进制
        std::fs::write(claude.join("bin.dat"), [0u8, 1, 2, 3, 0xff]).unwrap();

        let preview = get_project_claude_file_preview(
            project.path().to_str().unwrap(),
            "bin.dat".to_string(),
        )
        .expect("应可读取");
        assert!(preview.is_binary);
        assert_eq!(preview.content, "");
    }

    #[test]
    fn create_project_claude_settings_file_writes_skeleton_when_missing() {
        let project = TestDir::new();
        // .claude/ 不存在，create 应自动建目录
        create_project_claude_settings_file(
            project.path().to_str().unwrap(),
            ProjectClaudeSettingsScope::Shared,
        )
        .expect("应可创建");
        let content =
            std::fs::read_to_string(project.path().join(".claude/settings.json")).unwrap();
        assert_eq!(content, "{}\n");

        create_project_claude_settings_file(
            project.path().to_str().unwrap(),
            ProjectClaudeSettingsScope::Local,
        )
        .expect("应可创建 local");
        let local =
            std::fs::read_to_string(project.path().join(".claude/settings.local.json")).unwrap();
        assert_eq!(local, "{}\n");
    }

    #[test]
    fn create_project_claude_settings_file_rejects_when_exists() {
        let project = TestDir::new();
        let claude = project.path().join(".claude");
        std::fs::create_dir_all(&claude).unwrap();
        std::fs::write(claude.join("settings.json"), "{\"existing\":true}").unwrap();

        let err = create_project_claude_settings_file(
            project.path().to_str().unwrap(),
            ProjectClaudeSettingsScope::Shared,
        )
        .expect_err("已存在时应拒绝");
        assert!(err.contains("已存在"));
        // 原文件内容保留不被覆盖
        let content = std::fs::read_to_string(claude.join("settings.json")).unwrap();
        assert_eq!(content, "{\"existing\":true}");
    }

    #[test]
    fn inspect_project_files_reports_settings_presence() {
        let project = TestDir::new();
        let claude = project.path().join(".claude");
        std::fs::create_dir_all(&claude).unwrap();
        std::fs::write(claude.join("settings.json"), "{}\n").unwrap();

        let status = inspect_project_files(project.path()).unwrap();
        assert!(status.has_project_claude_dir);
        assert!(status.has_project_claude_settings);
        assert!(!status.has_project_claude_settings_local);

        std::fs::write(claude.join("settings.local.json"), "{}\n").unwrap();
        let status = inspect_project_files(project.path()).unwrap();
        assert!(status.has_project_claude_settings_local);
    }
}
