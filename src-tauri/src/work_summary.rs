//! 工作总结：扫描昨日有变更的 git 项目，调用本机 claude CLI 生成分项目总结并落盘。
use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use std::collections::BTreeSet;
use std::path::Path;
use std::process::Command;
use tauri::{AppHandle, Emitter};

/// 单条提交的结构化信息（body 在 v1 不采集，subject 已足够表达意图）。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ProjectCommit {
    pub hash: String,
    pub subject: String,
    pub author: String,
    pub timestamp: u64,
    pub files_changed: u32,
    pub insertions: u32,
    pub deletions: u32,
}

/// 单个项目某日的变更集合：提交 + 未提交素材。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ProjectChangeset {
    /// 项目绝对路径
    pub project: String,
    /// 路径最后一级，用于展示
    pub short_name: String,
    pub branch: Option<String>,
    /// 是否遵循 conventional commits
    pub is_conventional: bool,
    pub commits: Vec<ProjectCommit>,
    pub has_uncommitted: bool,
    /// 截断后的未提交 diff 素材；无未提交时为空串
    pub uncommitted_material: String,
    /// 扫描该项目时的错误（git 失败等）；正常为 None
    pub scan_error: Option<String>,
}

/// 本机 claude CLI 探测结果
#[derive(Debug, Clone, PartialEq, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeCliStatus {
    pub available: bool,
    pub version: Option<String>,
}

/// 一份已落盘的总结文档
#[derive(Debug, Clone, PartialEq, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct SummaryDocument {
    /// "daily" | "weekly"
    pub kind: String,
    /// daily 为 "2026-06-23"，weekly 为 "2026-W26"
    pub key: String,
    pub path: String,
    pub content: String,
}

/// 总结列表项（不含正文）
#[derive(Debug, Clone, PartialEq, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct SummaryListItem {
    pub kind: String,
    pub key: String,
    pub path: String,
}

/// 解析 "YYYY-MM-DD" 为 (year, month, day)
fn parse_ymd(date: &str) -> Result<(i64, i64, i64), String> {
    let parts: Vec<&str> = date.split('-').collect();
    if parts.len() != 3 {
        return Err(format!("非法日期格式: {date}"));
    }
    let y = parts[0]
        .parse::<i64>()
        .map_err(|_| format!("非法年份: {date}"))?;
    let m = parts[1]
        .parse::<i64>()
        .map_err(|_| format!("非法月份: {date}"))?;
    let d = parts[2]
        .parse::<i64>()
        .map_err(|_| format!("非法日期: {date}"))?;
    if !(1..=12).contains(&m) || !(1..=31).contains(&d) {
        return Err(format!("日期越界: {date}"));
    }
    Ok((y, m, d))
}

/// 公历 → 自 1970-01-01 起的天数（Howard Hinnant days_from_civil）
fn days_from_civil(y: i64, m: i64, d: i64) -> i64 {
    let y = if m <= 2 { y - 1 } else { y };
    let era = if y >= 0 { y } else { y - 399 } / 400;
    let yoe = y - era * 400;
    let doy = (153 * (if m > 2 { m - 3 } else { m + 9 }) + 2) / 5 + d - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146_097 + doe - 719_468
}

/// 天数 → 公历 (year, month, day)
fn civil_from_days(z: i64) -> (i64, i64, i64) {
    let z = z + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    (if m <= 2 { y + 1 } else { y }, m, d)
}

fn format_ymd(y: i64, m: i64, d: i64) -> String {
    format!("{y:04}-{m:02}-{d:02}")
}

/// 下一天
fn next_date(date: &str) -> Result<String, String> {
    let (y, m, d) = parse_ymd(date)?;
    let (ny, nm, nd) = civil_from_days(days_from_civil(y, m, d) + 1);
    Ok(format_ymd(ny, nm, nd))
}

/// git --since/--until 区间值：[当天 00:00, 次日 00:00)
fn day_range_args(date: &str) -> Result<(String, String), String> {
    let next = next_date(date)?;
    Ok((format!("{date} 00:00:00"), format!("{next} 00:00:00")))
}

/// ISO weekday：周一=1 .. 周日=7（1970-01-01 是周四）
fn iso_weekday(days: i64) -> i64 {
    (days + 3).rem_euclid(7) + 1
}

/// 该日期所在 ISO 周的 (iso_year, iso_week)
fn iso_year_week(date: &str) -> Result<(i64, i64), String> {
    let (y, m, d) = parse_ymd(date)?;
    let days = days_from_civil(y, m, d);
    let weekday = iso_weekday(days); // 1..7
                                     // 移动到本周周四，周四所在年即 ISO 年
    let thursday = days + (4 - weekday);
    let (ty, _, _) = civil_from_days(thursday);
    let jan1 = days_from_civil(ty, 1, 1);
    let week = (thursday - jan1) / 7 + 1;
    Ok((ty, week))
}

fn iso_week_key(date: &str) -> Result<String, String> {
    let (y, w) = iso_year_week(date)?;
    Ok(format!("{y:04}-W{w:02}"))
}

/// 该日期所在 ISO 周的周一到周日 7 个日期字符串
fn week_dates(date: &str) -> Result<Vec<String>, String> {
    let (y, m, d) = parse_ymd(date)?;
    let days = days_from_civil(y, m, d);
    let weekday = iso_weekday(days); // 1..7
    let monday = days - (weekday - 1);
    Ok((0..7)
        .map(|offset| {
            let (yy, mm, dd) = civil_from_days(monday + offset);
            format_ymd(yy, mm, dd)
        })
        .collect())
}

/// 提交行前缀哨兵 + 字段分隔符（\x1f 不会出现在正常 subject 中）
const COMMIT_MARKER: &str = "@@C@@\u{1f}";

/// git log 格式：单行元数据，subject 用 %s（单行）
pub(crate) const GIT_LOG_FORMAT: &str = "@@C@@%x1f%H%x1f%at%x1f%an%x1f%s";

const CONVENTIONAL_TYPES: [&str; 11] = [
    "feat", "fix", "docs", "style", "refactor", "perf", "test", "build", "ci", "chore", "revert",
];

/// 判断单条 subject 是否符合 `type(scope)!?: ` 形态
fn is_conventional_subject(subject: &str) -> bool {
    let subject = subject.trim_start();
    for ty in CONVENTIONAL_TYPES {
        if let Some(rest) = subject.strip_prefix(ty) {
            let rest = rest.strip_prefix('!').unwrap_or(rest);
            // 可选 scope：(....)
            let rest = if let Some(after) = rest.strip_prefix('(') {
                match after.find(')') {
                    Some(idx) => &after[idx + 1..],
                    None => continue,
                }
            } else {
                rest
            };
            let rest = rest.strip_prefix('!').unwrap_or(rest);
            if rest.starts_with(": ") || rest == ":" {
                return true;
            }
        }
    }
    false
}

const MAX_FILE_DIFF_LINES: usize = 400;
const MAX_TOTAL_DIFF_CHARS: usize = 12_000;

/// 把 `git diff HEAD` 输出按文件分段、逐段限行截断，再整体限长；末尾追加 untracked 文件名清单。
fn build_uncommitted_material(diff: &str, untracked: &[String]) -> String {
    let mut out = String::new();
    // 标记是否因总量超限而截断，防止在「总量超限」标记后继续追加未跟踪清单
    let mut total_truncated = false;

    // 按 "diff --git" 切分文件段（保留分隔行）
    let mut sections: Vec<String> = Vec::new();
    for line in diff.lines() {
        if line.starts_with("diff --git") {
            sections.push(String::new());
        }
        if let Some(last) = sections.last_mut() {
            last.push_str(line);
            last.push('\n');
        }
    }

    for section in sections {
        let lines: Vec<&str> = section.lines().collect();
        if lines.len() > MAX_FILE_DIFF_LINES {
            for line in lines.iter().take(MAX_FILE_DIFF_LINES) {
                out.push_str(line);
                out.push('\n');
            }
            out.push_str(&format!("... (已截断，共 {} 行)\n", lines.len()));
        } else {
            out.push_str(&section);
        }
        if out.chars().count() >= MAX_TOTAL_DIFF_CHARS {
            out = crate::utils::truncate(&out, MAX_TOTAL_DIFF_CHARS);
            out.push_str("\n... (总量超限，已截断)\n");
            total_truncated = true;
            break;
        }
    }

    // 只有在未因总量超限截断时才追加未跟踪文件清单，保证「总量超限」标记是输出末尾
    if !total_truncated && !untracked.is_empty() {
        out.push_str("\n未跟踪文件:\n");
        for path in untracked {
            out.push_str(&format!("- {path}\n"));
        }
    }

    out.trim().to_string()
}

/// 命中比例 ≥ 0.6 视为 conventional 仓库
fn detect_conventional_repo(subjects: &[String]) -> bool {
    if subjects.is_empty() {
        return false;
    }
    let hits = subjects
        .iter()
        .filter(|s| is_conventional_subject(s))
        .count();
    hits as f64 / subjects.len() as f64 >= 0.6
}

/// 解析 `git log <GIT_LOG_FORMAT> --numstat` 输出
fn parse_commits(log_output: &str) -> Vec<ProjectCommit> {
    let mut commits: Vec<ProjectCommit> = Vec::new();
    for line in log_output.lines() {
        if let Some(rest) = line.strip_prefix(COMMIT_MARKER) {
            let mut parts = rest.splitn(4, '\u{1f}');
            let hash = parts.next().unwrap_or("").to_string();
            let timestamp = parts.next().unwrap_or("").parse::<u64>().unwrap_or(0);
            let author = parts.next().unwrap_or("").to_string();
            let subject = parts.next().unwrap_or("").to_string();
            commits.push(ProjectCommit {
                hash,
                subject,
                author,
                timestamp,
                files_changed: 0,
                insertions: 0,
                deletions: 0,
            });
        } else if let Some(current) = commits.last_mut() {
            // numstat 行：<add>\t<del>\t<path>
            let mut cols = line.splitn(3, '\t');
            let add = cols.next().unwrap_or("");
            let del = cols.next().unwrap_or("");
            let path = cols.next().unwrap_or("");
            if path.is_empty() {
                continue;
            }
            current.files_changed += 1;
            current.insertions += add.parse::<u32>().unwrap_or(0);
            current.deletions += del.parse::<u32>().unwrap_or(0);
        }
    }
    commits
}

fn language_label(language: &str) -> &str {
    if language == "en" {
        "English"
    } else {
        "中文"
    }
}

/// 单次调用的当日总结 prompt：把所有项目素材一次交给 claude，要求输出分项目、可读的 Markdown 正文。
/// conventional 项目仅给 commit 列表；非 conventional 且有未提交时附截断后的 diff。
fn build_daily_prompt(date: &str, changesets: &[ProjectChangeset], language: &str) -> String {
    let mut p = format!(
        "你是工作总结助手。下面是 {date} 这一天我在多个项目里的 git 变更素材。\
请用{}写一份分项目的工作总结，直接输出 Markdown 正文，并严格遵守以下规则：\n\
- 不要输出顶层一级标题（# 开头），也不要复述本说明。\n\
- 每个项目用二级标题 `## 项目名` 开头。\n\
- 每个项目段内：先一段概述（做了什么、为什么），再用 `**主要变更**` 列出 3-6 条要点。\n\
- 用自然语言归纳，不要原样粘贴 diff 代码。\n\
- 若某项目存在未提交变更，在该项目段末尾用一行引用块明确标注：`> ⚠️ 有未提交变更：<简述>`。\n\n",
        language_label(language)
    );
    for cs in changesets {
        p.push_str(&format!("\n=== 项目：{} ===\n", cs.short_name));
        if let Some(branch) = &cs.branch {
            p.push_str(&format!("分支：{branch}\n"));
        }
        if cs.is_conventional {
            p.push_str("（该项目遵循 Conventional Commits，可借助 type/scope 归纳）\n");
        }
        if let Some(err) = &cs.scan_error {
            p.push_str(&format!("扫描存在错误：{err}\n"));
        }
        if !cs.commits.is_empty() {
            p.push_str("已提交：\n");
            for c in &cs.commits {
                p.push_str(&format!(
                    "- {} (+{} -{}, {} 文件)\n",
                    c.subject, c.insertions, c.deletions, c.files_changed
                ));
            }
        }
        if cs.has_uncommitted {
            p.push_str("未提交变更（请在该项目段标注存在未提交变更）：\n");
            if cs.uncommitted_material.is_empty() {
                p.push_str("（有未提交变更，但无可展示的 diff 内容）\n");
            } else {
                p.push_str("```diff\n");
                p.push_str(&cs.uncommitted_material);
                p.push_str("\n```\n");
            }
        }
    }
    p
}

/// 周总结里某天缺日总结时的紧凑素材
fn build_changeset_brief(cs: &ProjectChangeset) -> String {
    let mut b = format!("### {}\n", cs.short_name);
    for c in &cs.commits {
        b.push_str(&format!("- {}\n", c.subject));
    }
    if cs.has_uncommitted {
        b.push_str("- ⚠️ 有未提交变更\n");
    }
    b
}

fn build_weekly_prompt(week_key: &str, materials: &[String], language: &str) -> String {
    let mut p = format!(
        "你是工作总结助手。下面是本周（{}）每天的工作素材（已有日总结或当天提交清单）。请用{}汇总成一份分项目、有重点的周总结，直接输出 Markdown 正文。\n\n",
        week_key,
        language_label(language)
    );
    for m in materials {
        p.push_str(m);
        p.push_str("\n\n");
    }
    p
}

/// 解析 claude headless 输出，提取最终回答文本。
/// 处理三种形态：单个 result 对象、消息数组、逐行 JSONL。
/// 全部失败返回 `Err`——绝不把原始 stdout 当作总结回退（那正是旧实现满屏 JSON 的根因）。
fn parse_claude_result(stdout: &str) -> Result<String, String> {
    let trimmed = stdout.trim();
    if trimmed.is_empty() {
        return Err("claude 未返回任何内容".into());
    }
    // 1. 整体 JSON：对象取 .result；数组找 result 元素或拼接 assistant 文本
    if let Ok(value) = serde_json::from_str::<serde_json::Value>(trimmed) {
        if let Some(text) = extract_result_from_value(&value) {
            return Ok(text);
        }
    }
    // 2. 退化为 JSONL：逐行解析，取最后一个含结果的行
    let mut last: Option<String> = None;
    for line in trimmed.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        if let Ok(value) = serde_json::from_str::<serde_json::Value>(line) {
            if let Some(text) = extract_result_from_value(&value) {
                last = Some(text);
            }
        }
    }
    last.ok_or_else(|| "无法解析 claude 输出".into())
}

/// 从单个 JSON Value 提取总结文本：优先 `.result` 字符串；数组则找 result 元素或退而拼 assistant 文本。
fn extract_result_from_value(value: &serde_json::Value) -> Option<String> {
    if let Some(result) = value.get("result").and_then(|v| v.as_str()) {
        let t = result.trim();
        if !t.is_empty() {
            return Some(t.to_string());
        }
    }
    if let Some(arr) = value.as_array() {
        for item in arr.iter().rev() {
            if let Some(result) = item.get("result").and_then(|v| v.as_str()) {
                let t = result.trim();
                if !t.is_empty() {
                    return Some(t.to_string());
                }
            }
        }
        let assistant_text = collect_assistant_text(arr);
        if !assistant_text.is_empty() {
            return Some(assistant_text);
        }
    }
    None
}

/// 从消息数组里收集 assistant 文本块（`content[].text`），作为没有 result 字段时的兜底。
fn collect_assistant_text(arr: &[serde_json::Value]) -> String {
    let mut out = String::new();
    for item in arr {
        if item.get("type").and_then(|v| v.as_str()) != Some("assistant") {
            continue;
        }
        let content = item
            .get("message")
            .and_then(|m| m.get("content"))
            .or_else(|| item.get("content"));
        if let Some(blocks) = content.and_then(|c| c.as_array()) {
            for block in blocks {
                if block.get("type").and_then(|v| v.as_str()) == Some("text") {
                    if let Some(text) = block.get("text").and_then(|v| v.as_str()) {
                        out.push_str(text);
                    }
                }
            }
        }
    }
    out.trim().to_string()
}

/// 顶层头（标题 + 元信息）+ claude 生成的分项目正文。
fn assemble_daily_markdown(
    date: &str,
    generated_at: &str,
    project_count: usize,
    body: &str,
) -> String {
    format!(
        "# 昨日工作总结 · {date}\n生成于 {generated_at} · {project_count} 个项目有变更\n\n{}\n",
        body.trim()
    )
}

/// claude 不可用时的降级：纯 git 事实清单，保证永远可读、不报错给用户空屏。
fn assemble_daily_fallback(
    date: &str,
    generated_at: &str,
    changesets: &[ProjectChangeset],
    reason: &str,
) -> String {
    let mut md = format!("# 昨日工作总结 · {date}\n");
    md.push_str(&format!(
        "生成于 {generated_at} · {} 个项目有变更\n\n",
        changesets.len()
    ));
    md.push_str(&format!(
        "> AI 总结不可用（{reason}），以下为基于 git 的变更清单。\n"
    ));
    for cs in changesets {
        md.push_str(&format!("\n## {}  `{}`\n", cs.short_name, cs.project));
        let mut meta: Vec<String> = Vec::new();
        if let Some(branch) = &cs.branch {
            meta.push(format!("分支 {branch}"));
        }
        meta.push(format!("{} commits", cs.commits.len()));
        if cs.has_uncommitted {
            meta.push("⚠️ 有未提交变更".to_string());
        }
        md.push_str(&format!("{}\n\n", meta.join(" · ")));
        if let Some(err) = &cs.scan_error {
            md.push_str(&format!("> 扫描错误：{err}\n"));
        }
        if cs.commits.is_empty() {
            md.push_str("- （无提交记录）\n");
        } else {
            for c in &cs.commits {
                md.push_str(&format!("- {}\n", c.subject));
            }
        }
    }
    md
}

fn assemble_weekly_markdown(week_key: &str, generated_at: &str, body: &str) -> String {
    format!(
        "# 周工作总结 · {week_key}\n生成于 {generated_at}\n\n{}\n",
        body.trim()
    )
}

/// claude 不可用时的周总结降级：直接汇总本周各日素材，保证可读。
fn assemble_weekly_fallback(
    week_key: &str,
    generated_at: &str,
    materials: &[String],
    reason: &str,
) -> String {
    let mut md = format!("# 周工作总结 · {week_key}\n生成于 {generated_at}\n\n");
    md.push_str(&format!(
        "> AI 总结不可用（{reason}），以下为本周各日素材汇总。\n\n"
    ));
    md.push_str(&materials.join("\n\n"));
    md.push('\n');
    md
}

fn summaries_dir() -> std::path::PathBuf {
    crate::utils::get_app_data_dir().join("summaries")
}

fn daily_path(date: &str) -> std::path::PathBuf {
    summaries_dir().join("daily").join(format!("{date}.md"))
}

fn weekly_path(week_key: &str) -> std::path::PathBuf {
    summaries_dir()
        .join("weekly")
        .join(format!("{week_key}.md"))
}

/// 总结 key 安全校验：仅允许日期/周 key 用到的字符，杜绝路径逃逸
fn validate_summary_key(key: &str) -> Result<(), String> {
    if key.is_empty() || !key.chars().all(|c| c.is_ascii_alphanumeric() || c == '-') {
        return Err(format!("非法的总结 key: {key}"));
    }
    Ok(())
}

/// 从 history.jsonl 内容提取去重项目绝对路径
fn parse_history_projects(content: &str) -> Vec<String> {
    let mut set: BTreeSet<String> = BTreeSet::new();
    for line in content.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        if let Ok(value) = serde_json::from_str::<serde_json::Value>(line) {
            if let Some(project) = value.get("project").and_then(|v| v.as_str()) {
                if !project.is_empty() {
                    set.insert(project.to_string());
                }
            }
        }
    }
    set.into_iter().collect()
}

fn short_name_of(project: &str) -> String {
    Path::new(project)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or(project)
        .to_string()
}

/// 采集单个项目某日变更。非 git 仓库 / 无变更 → None。
fn gather_changeset(project: &str, date: &str) -> Option<ProjectChangeset> {
    let path = Path::new(project);
    if crate::project::git_repo_root(path).is_err() {
        return None;
    }

    let branch = crate::project::run_git(path, &["rev-parse", "--abbrev-ref", "HEAD"])
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty() && s != "HEAD");

    let (since, until) = match day_range_args(date) {
        Ok(v) => v,
        Err(e) => {
            return Some(ProjectChangeset {
                project: project.to_string(),
                short_name: short_name_of(project),
                branch,
                is_conventional: false,
                commits: Vec::new(),
                has_uncommitted: false,
                uncommitted_material: String::new(),
                scan_error: Some(e),
            });
        }
    };

    // 当前用户邮箱过滤「我的工作」；无邮箱则不加 --author
    let email = crate::project::run_git(path, &["config", "user.email"])
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());

    let mut log_args: Vec<String> = vec![
        "log".into(),
        format!("--since={since}"),
        format!("--until={until}"),
        "--numstat".into(),
        format!("--pretty=format:{GIT_LOG_FORMAT}"),
    ];
    if let Some(email) = &email {
        log_args.push(format!("--author={email}"));
    }
    let log_refs: Vec<&str> = log_args.iter().map(|s| s.as_str()).collect();

    let mut scan_error: Option<String> = None;
    let commits = match crate::project::run_git(path, &log_refs) {
        Ok(out) => parse_commits(&out),
        Err(e) => {
            scan_error = Some(e);
            Vec::new()
        }
    };

    // git status 失败不静默吞错，记入 scan_error 并视为无未提交（避免误标）
    let status = crate::project::run_git(path, &["status", "--porcelain"]).unwrap_or_else(|e| {
        scan_error.get_or_insert(e);
        String::new()
    });
    let has_uncommitted = !status.trim().is_empty();
    let uncommitted_material = if has_uncommitted {
        // diff HEAD 失败（如仓库无任何 commit）时不静默吞错，记入 scan_error 供上层展示
        let diff = crate::project::run_git(path, &["diff", "HEAD"]).unwrap_or_else(|e| {
            scan_error.get_or_insert(e);
            String::new()
        });
        let untracked: Vec<String> = status
            .lines()
            .filter_map(|l| l.strip_prefix("?? ").map(|p| p.trim().to_string()))
            .collect();
        build_uncommitted_material(&diff, &untracked)
    } else {
        String::new()
    };

    if commits.is_empty() && !has_uncommitted && scan_error.is_none() {
        return None;
    }

    let is_conventional = detect_conventional_repo(
        &commits
            .iter()
            .map(|c| c.subject.clone())
            .collect::<Vec<_>>(),
    );

    Some(ProjectChangeset {
        project: project.to_string(),
        short_name: short_name_of(project),
        branch,
        is_conventional,
        commits,
        has_uncommitted,
        uncommitted_material,
        scan_error,
    })
}

/// 扫描所有候选项目，返回当日有变更的项目集合
fn gather_day_changesets(date: &str) -> Result<Vec<ProjectChangeset>, String> {
    let history = crate::history::get_history()?;
    let projects = parse_history_projects(&history.content);
    let mut result: Vec<ProjectChangeset> = Vec::new();
    for project in projects {
        if let Some(cs) = gather_changeset(&project, date) {
            result.push(cs);
        }
    }
    result.sort_by(|a, b| a.short_name.cmp(&b.short_name));
    Ok(result)
}

/// 总结用的快速模型别名（纯文本任务，不需要 opus）。
const SUMMARY_MODEL: &str = "sonnet";

/// 生成进度事件名
const WORK_SUMMARY_EVENT: &str = "work-summary-progress";

/// 生成进度负载（仅用于 emit，不进 specta 绑定）。
/// phase: "scanning" | "summarizing" | "writing" | "done"
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct WorkSummaryProgress {
    phase: &'static str,
    project_count: u32,
}

/// 防止并发生成（双击重入）。
static WORK_SUMMARY_LOCK: Lazy<tokio::sync::Mutex<()>> = Lazy::new(|| tokio::sync::Mutex::new(()));

/// 单次 claude 调用的硬超时，避免极端情况下命令永不返回、前端一直 loading。
const CLAUDE_TIMEOUT_SECS: u64 = 180;

fn emit_progress(app: &AppHandle, phase: &'static str, project_count: u32) {
    let _ = app.emit(
        WORK_SUMMARY_EVENT,
        WorkSummaryProgress {
            phase,
            project_count,
        },
    );
}

/// 调用本机 claude CLI headless 生成总结（快速模型 + 精简环境）。
/// 阻塞调用，由命令在 `spawn_blocking` 中执行。
fn run_claude_summary(prompt: &str) -> Result<String, String> {
    let mut command = Command::new("claude");
    command.args([
        "-p",
        prompt,
        "--output-format",
        "json",
        "--model",
        SUMMARY_MODEL,
        // 精简环境：只用空 MCP 集，跳过用户/项目 MCP 服务器，冷启动更快、输出更干净
        "--strict-mcp-config",
        "--mcp-config",
        "{\"mcpServers\":{}}",
    ]);
    crate::utils::hide_command_window(&mut command);
    let output = command.output().map_err(|e| {
        if e.kind() == std::io::ErrorKind::NotFound {
            "未找到 claude CLI，请确认 Claude Code 已安装并在 PATH 中".to_string()
        } else {
            format!("执行 claude 失败: {e}")
        }
    })?;
    if output.status.success() {
        parse_claude_result(&String::from_utf8_lossy(&output.stdout))
    } else {
        let detail = crate::utils::merge_process_output(&output.stdout, &output.stderr);
        Err(if detail.is_empty() {
            format!("claude 执行失败，退出码: {:?}", output.status.code())
        } else {
            format!("claude 执行失败: {detail}")
        })
    }
}

#[tauri::command]
#[specta::specta]
pub fn check_claude_cli() -> Result<ClaudeCliStatus, String> {
    let mut command = Command::new("claude");
    command.arg("--version");
    crate::utils::hide_command_window(&mut command);
    match command.output() {
        Ok(output) if output.status.success() => Ok(ClaudeCliStatus {
            available: true,
            version: Some(String::from_utf8_lossy(&output.stdout).trim().to_string()),
        }),
        _ => Ok(ClaudeCliStatus {
            available: false,
            version: None,
        }),
    }
}

#[tauri::command]
#[specta::specta]
pub async fn scan_day_changes(date: String) -> Result<Vec<ProjectChangeset>, String> {
    validate_summary_key(&date)?;
    tokio::task::spawn_blocking(move || gather_day_changesets(&date))
        .await
        .map_err(|e| format!("扫描任务失败: {e}"))?
}

#[tauri::command]
#[specta::specta]
pub async fn summarize_day(
    app: AppHandle,
    date: String,
    language: String,
) -> Result<SummaryDocument, String> {
    validate_summary_key(&date)?;
    let _guard = WORK_SUMMARY_LOCK.lock().await;

    // 1. 扫描当日变更（git 阻塞操作放到 blocking 线程）
    emit_progress(&app, "scanning", 0);
    let scan_date = date.clone();
    let changesets = tokio::task::spawn_blocking(move || gather_day_changesets(&scan_date))
        .await
        .map_err(|e| format!("扫描任务失败: {e}"))??;
    if changesets.is_empty() {
        return Err("没有检测到该日的变更项目".to_string());
    }
    let project_count = changesets.len() as u32;

    // 2. 单次 claude 调用生成分项目正文；失败则降级为基于 git 的可读清单
    emit_progress(&app, "summarizing", project_count);
    let gen_date = date.clone();
    let job = tokio::task::spawn_blocking(move || {
        let generated_at = crate::utils::current_rfc3339_timestamp();
        match run_claude_summary(&build_daily_prompt(&gen_date, &changesets, &language)) {
            Ok(body) => assemble_daily_markdown(&gen_date, &generated_at, changesets.len(), &body),
            Err(e) => assemble_daily_fallback(&gen_date, &generated_at, &changesets, &e),
        }
    });
    let content = match tokio::time::timeout(
        std::time::Duration::from_secs(CLAUDE_TIMEOUT_SECS),
        job,
    )
    .await
    {
        Ok(joined) => joined.map_err(|e| format!("总结任务失败: {e}"))?,
        Err(_) => return Err("总结超时，请重试".to_string()),
    };

    // 3. 落盘
    emit_progress(&app, "writing", project_count);
    let path = daily_path(&date);
    crate::utils::ensure_dir_and_write_atomic(&path, &content)?;
    emit_progress(&app, "done", project_count);

    crate::logging::log_command_result("work_summary.summarize_day", &Ok::<(), String>(()), |_| {
        format!("date={date} projects={project_count}")
    });
    Ok(SummaryDocument {
        kind: "daily".into(),
        key: date,
        path: path.to_string_lossy().to_string(),
        content,
    })
}

#[tauri::command]
#[specta::specta]
pub async fn generate_weekly_summary(
    app: AppHandle,
    date: String,
    language: String,
) -> Result<SummaryDocument, String> {
    validate_summary_key(&date)?;
    let week_key = iso_week_key(&date)?;
    let _guard = WORK_SUMMARY_LOCK.lock().await;

    // 收集素材（读日总结 / 补扫 git）+ 单次 claude 调用，全部放到 blocking 线程
    emit_progress(&app, "scanning", 0);
    let week_key_job = week_key.clone();
    let job = tokio::task::spawn_blocking(move || -> Result<String, String> {
        let dates = week_dates(&date)?;
        let mut materials: Vec<String> = Vec::new();
        for day in &dates {
            let p = daily_path(day);
            if p.exists() {
                if let Ok(text) = std::fs::read_to_string(&p) {
                    materials.push(format!("## {day} 日总结\n{text}"));
                    continue;
                }
            }
            // 缺日总结 → 补扫当天 git
            let changesets = gather_day_changesets(day).unwrap_or_default();
            if changesets.is_empty() {
                continue;
            }
            let mut brief = format!("## {day} 补扫\n");
            for cs in &changesets {
                brief.push_str(&build_changeset_brief(cs));
            }
            materials.push(brief);
        }
        if materials.is_empty() {
            return Err("本周没有可用的工作素材".to_string());
        }
        let generated_at = crate::utils::current_rfc3339_timestamp();
        let content =
            match run_claude_summary(&build_weekly_prompt(&week_key_job, &materials, &language)) {
                Ok(body) => assemble_weekly_markdown(&week_key_job, &generated_at, &body),
                Err(e) => assemble_weekly_fallback(&week_key_job, &generated_at, &materials, &e),
            };
        Ok(content)
    });

    emit_progress(&app, "summarizing", 0);
    let content = match tokio::time::timeout(
        std::time::Duration::from_secs(CLAUDE_TIMEOUT_SECS),
        job,
    )
    .await
    {
        Ok(joined) => joined.map_err(|e| format!("总结任务失败: {e}"))??,
        Err(_) => return Err("总结超时，请重试".to_string()),
    };

    emit_progress(&app, "writing", 0);
    let path = weekly_path(&week_key);
    crate::utils::ensure_dir_and_write_atomic(&path, &content)?;
    emit_progress(&app, "done", 0);

    crate::logging::log_command_result(
        "work_summary.generate_weekly_summary",
        &Ok::<(), String>(()),
        |_| format!("week={week_key}"),
    );
    Ok(SummaryDocument {
        kind: "weekly".into(),
        key: week_key,
        path: path.to_string_lossy().to_string(),
        content,
    })
}

fn list_dir_keys(dir: &std::path::Path, kind: &str) -> Vec<SummaryListItem> {
    let mut items: Vec<SummaryListItem> = Vec::new();
    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) == Some("md") {
                if let Some(key) = path.file_stem().and_then(|s| s.to_str()) {
                    items.push(SummaryListItem {
                        kind: kind.to_string(),
                        key: key.to_string(),
                        path: path.to_string_lossy().to_string(),
                    });
                }
            }
        }
    }
    // 倒序：新日期在前
    items.sort_by(|a, b| b.key.cmp(&a.key));
    items
}

#[tauri::command]
#[specta::specta]
pub fn list_summaries() -> Result<Vec<SummaryListItem>, String> {
    let mut items = list_dir_keys(&summaries_dir().join("daily"), "daily");
    items.extend(list_dir_keys(&summaries_dir().join("weekly"), "weekly"));
    Ok(items)
}

#[tauri::command]
#[specta::specta]
pub fn read_summary(kind: String, key: String) -> Result<SummaryDocument, String> {
    validate_summary_key(&key)?;
    let path = match kind.as_str() {
        "daily" => daily_path(&key),
        "weekly" => weekly_path(&key),
        _ => return Err(format!("未知的总结类型: {kind}")),
    };
    let content =
        std::fs::read_to_string(&path).map_err(|e| format!("读取总结失败 {:?}: {e}", path))?;
    Ok(SummaryDocument {
        kind,
        key,
        path: path.to_string_lossy().to_string(),
        content,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn next_date_handles_month_and_year_boundaries() {
        assert_eq!(next_date("2026-06-23").unwrap(), "2026-06-24");
        assert_eq!(next_date("2026-06-30").unwrap(), "2026-07-01");
        assert_eq!(next_date("2026-12-31").unwrap(), "2027-01-01");
        // 2028 是闰年
        assert_eq!(next_date("2028-02-28").unwrap(), "2028-02-29");
        assert!(next_date("not-a-date").is_err());
    }

    #[test]
    fn day_range_args_spans_one_day() {
        let (since, until) = day_range_args("2026-06-23").unwrap();
        assert_eq!(since, "2026-06-23 00:00:00");
        assert_eq!(until, "2026-06-24 00:00:00");
    }

    #[test]
    fn iso_week_key_for_known_dates() {
        // 2026-01-01 是周四，2026-06-24 是周三 → 第 26 周
        assert_eq!(iso_week_key("2026-06-24").unwrap(), "2026-W26");
        assert_eq!(iso_week_key("2026-06-22").unwrap(), "2026-W26");
    }

    #[test]
    fn week_dates_returns_monday_to_sunday() {
        let dates = week_dates("2026-06-24").unwrap();
        assert_eq!(dates.len(), 7);
        assert_eq!(dates[0], "2026-06-22"); // Monday
        assert_eq!(dates[6], "2026-06-28"); // Sunday
    }

    #[test]
    fn detects_conventional_subjects() {
        assert!(is_conventional_subject("feat: add x"));
        assert!(is_conventional_subject("fix(scope): y"));
        assert!(is_conventional_subject("refactor!: z"));
        assert!(is_conventional_subject("chore(deps): bump"));
        assert!(!is_conventional_subject("update readme"));
        assert!(!is_conventional_subject("WIP"));
        assert!(!is_conventional_subject("feat:nospace"));
    }

    #[test]
    fn detect_conventional_repo_uses_ratio() {
        let mostly = vec![
            "feat: a".to_string(),
            "fix: b".to_string(),
            "docs: c".to_string(),
            "随手改一下".to_string(),
        ];
        assert!(detect_conventional_repo(&mostly)); // 3/4 = 0.75
        let few = vec![
            "feat: a".to_string(),
            "改了点东西".to_string(),
            "WIP".to_string(),
        ];
        assert!(!detect_conventional_repo(&few)); // 1/3 ≈ 0.33
        assert!(!detect_conventional_repo(&[]));
    }

    #[test]
    fn parse_commits_reads_meta_and_numstat() {
        // 每个 commit：一行 "@@C@@\x1f<hash>\x1f<ts>\x1f<author>\x1f<subject>"，
        // 随后若干 numstat 行 "<add>\t<del>\t<path>"，二进制为 "-\t-\t<path>"
        let raw = "@@C@@\u{1f}abc123\u{1f}1700000000\u{1f}Alice\u{1f}feat: add\n\
10\t2\tsrc/a.rs\n\
5\t0\tsrc/b.rs\n\
@@C@@\u{1f}def456\u{1f}1700001000\u{1f}Bob\u{1f}fix: bug\n\
-\t-\tassets/logo.png\n";
        let commits = parse_commits(raw);
        assert_eq!(commits.len(), 2);
        assert_eq!(commits[0].hash, "abc123");
        assert_eq!(commits[0].subject, "feat: add");
        assert_eq!(commits[0].author, "Alice");
        assert_eq!(commits[0].timestamp, 1_700_000_000);
        assert_eq!(commits[0].files_changed, 2);
        assert_eq!(commits[0].insertions, 15);
        assert_eq!(commits[0].deletions, 2);
        // 二进制文件计入 files_changed，但 add/del 不累加
        assert_eq!(commits[1].files_changed, 1);
        assert_eq!(commits[1].insertions, 0);
        assert_eq!(commits[1].deletions, 0);
    }

    #[test]
    fn parse_commits_handles_empty() {
        assert!(parse_commits("").is_empty());
    }

    #[test]
    fn build_uncommitted_material_truncates_long_file() {
        let mut diff = String::from("diff --git a/big.rs b/big.rs\n");
        for i in 0..1000 {
            diff.push_str(&format!("+line {i}\n"));
        }
        let material = build_uncommitted_material(&diff, &[]);
        assert!(material.contains("diff --git a/big.rs"));
        assert!(material.contains("(已截断")); // 文件级截断标记
        assert!(material.lines().count() < 1000);
    }

    #[test]
    fn build_uncommitted_material_lists_untracked() {
        let material =
            build_uncommitted_material("", &["new.txt".to_string(), "x/y.rs".to_string()]);
        assert!(material.contains("未跟踪文件"));
        assert!(material.contains("new.txt"));
        assert!(material.contains("x/y.rs"));
    }

    #[test]
    fn build_uncommitted_material_empty_when_nothing() {
        assert_eq!(build_uncommitted_material("", &[]), "");
    }

    #[test]
    fn build_uncommitted_material_skips_untracked_when_total_truncated() {
        // 构造超过总量上限的 diff（多个大文件段）
        let mut diff = String::new();
        for f in 0..50 {
            diff.push_str(&format!("diff --git a/f{f}.rs b/f{f}.rs\n"));
            for i in 0..300 {
                diff.push_str(&format!("+line {i} in file {f}\n"));
            }
        }
        let material = build_uncommitted_material(&diff, &["should-not-appear.txt".to_string()]);
        // 验证总量超限标记存在
        assert!(material.contains("总量超限"));
        // 验证未跟踪文件名不出现（因为发生了总量截断）
        assert!(!material.contains("should-not-appear.txt"));
        // 验证整个未跟踪清单标题也不出现
        assert!(!material.contains("未跟踪文件"));
    }

    fn sample_changeset() -> ProjectChangeset {
        ProjectChangeset {
            project: "/x/proj".into(),
            short_name: "proj".into(),
            branch: Some("main".into()),
            is_conventional: true,
            commits: vec![ProjectCommit {
                hash: "h".into(),
                subject: "feat: add login".into(),
                author: "Alice".into(),
                timestamp: 1,
                files_changed: 2,
                insertions: 10,
                deletions: 1,
            }],
            has_uncommitted: true,
            uncommitted_material: "diff --git a/x b/x".into(),
            scan_error: None,
        }
    }

    #[test]
    fn build_daily_prompt_includes_projects_uncommitted_and_language() {
        let prompt = build_daily_prompt("2026-06-23", &[sample_changeset()], "zh");
        assert!(prompt.contains("feat: add login"));
        assert!(prompt.contains("未提交"));
        assert!(prompt.contains("中文"));
        assert!(prompt.contains("## 项目名")); // 模板要求每项目用二级标题
        assert!(prompt.contains("=== 项目：proj ==="));
    }

    #[test]
    fn parse_claude_result_extracts_from_object() {
        let stdout = r#"{"type":"result","subtype":"success","result":"完成了登录功能"}"#;
        assert_eq!(parse_claude_result(stdout).unwrap(), "完成了登录功能");
    }

    #[test]
    fn parse_claude_result_extracts_from_array() {
        // 实测 claude --output-format json 可能返回消息数组（旧实现满屏 JSON 的根因）
        let stdout = r#"[{"type":"system","subtype":"init"},{"type":"thinking","thinking":""},{"type":"result","subtype":"success","result":"分项目总结正文"}]"#;
        assert_eq!(parse_claude_result(stdout).unwrap(), "分项目总结正文");
    }

    #[test]
    fn parse_claude_result_extracts_assistant_text_when_no_result() {
        let stdout = r#"[{"type":"assistant","message":{"content":[{"type":"text","text":"来自 assistant 的总结"}]}}]"#;
        assert_eq!(
            parse_claude_result(stdout).unwrap(),
            "来自 assistant 的总结"
        );
    }

    #[test]
    fn parse_claude_result_parses_jsonl() {
        let stdout = "{\"type\":\"system\"}\n{\"type\":\"result\",\"result\":\"逐行结果\"}\n";
        assert_eq!(parse_claude_result(stdout).unwrap(), "逐行结果");
    }

    #[test]
    fn parse_claude_result_errors_on_unparseable() {
        // 纯文本 / 垃圾输出绝不回退为正文，必须报错由上层降级
        assert!(parse_claude_result("纯文本输出").is_err());
        assert!(parse_claude_result("").is_err());
        assert!(parse_claude_result(r#"{"type":"system","subtype":"init"}"#).is_err());
    }

    #[test]
    fn assemble_daily_markdown_wraps_body_with_header() {
        let md = assemble_daily_markdown(
            "2026-06-23",
            "2026-06-24T10:00:00Z",
            2,
            "## proj\n做了登录。",
        );
        assert!(md.contains("# 昨日工作总结 · 2026-06-23"));
        assert!(md.contains("2 个项目有变更"));
        assert!(md.contains("## proj"));
        assert!(md.contains("做了登录。"));
    }

    #[test]
    fn assemble_daily_fallback_lists_projects_from_git() {
        let md = assemble_daily_fallback(
            "2026-06-23",
            "2026-06-24T10:00:00Z",
            &[sample_changeset()],
            "claude 执行失败",
        );
        assert!(md.contains("# 昨日工作总结 · 2026-06-23"));
        assert!(md.contains("AI 总结不可用"));
        assert!(md.contains("claude 执行失败"));
        assert!(md.contains("## proj"));
        assert!(md.contains("`/x/proj`"));
        assert!(md.contains("⚠️ 有未提交变更"));
        assert!(md.contains("- feat: add login"));
    }

    #[test]
    fn assemble_weekly_fallback_joins_materials() {
        let md = assemble_weekly_fallback(
            "2026-W26",
            "2026-06-24T10:00:00Z",
            &[
                "## 2026-06-22 日总结\n内容A".into(),
                "## 2026-06-23 补扫\n内容B".into(),
            ],
            "总结超时",
        );
        assert!(md.contains("# 周工作总结 · 2026-W26"));
        assert!(md.contains("AI 总结不可用"));
        assert!(md.contains("内容A"));
        assert!(md.contains("内容B"));
    }

    #[test]
    fn parse_history_projects_dedupes() {
        let content = "{\"project\":\"/a\",\"sessionId\":\"1\"}\n\
{\"project\":\"/b\",\"sessionId\":\"2\"}\n\
{\"project\":\"/a\",\"sessionId\":\"3\"}\n\
not-json\n";
        let mut projects = parse_history_projects(content);
        projects.sort();
        assert_eq!(projects, vec!["/a".to_string(), "/b".to_string()]);
    }

    #[test]
    fn validate_summary_key_rejects_traversal() {
        assert!(validate_summary_key("2026-06-23").is_ok());
        assert!(validate_summary_key("2026-W26").is_ok());
        assert!(validate_summary_key("../etc/passwd").is_err());
        assert!(validate_summary_key("a/b").is_err());
    }
}
