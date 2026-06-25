//! 工作总结：扫描昨日有变更的 git 项目，调用本机 claude CLI 生成分项目总结并落盘。
use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use std::collections::{BTreeSet, HashMap, HashSet};
use std::path::Path;
use std::process::Command;
use tauri::{AppHandle, Emitter};

/// 单条提交的结构化信息。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ProjectCommit {
    pub hash: String,
    pub subject: String,
    /// commit body（`%b`，可多行，无 body 时为空串）
    pub body: String,
    pub author: String,
    pub timestamp: u64,
    pub files_changed: u32,
    pub insertions: u32,
    pub deletions: u32,
}

/// 单个分支某日的变更：当天提交 + 该分支当前工作树的未提交素材。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct BranchChangeset {
    pub branch: String,
    /// 是否为主分支（main 段为 main 当天提交；非主分支段为未并入 main 的提交）
    pub is_main: bool,
    pub commits: Vec<ProjectCommit>,
    pub has_uncommitted: bool,
    /// 截断后的未提交 diff 素材；无未提交时为空串
    pub uncommitted_material: String,
}

/// 单个项目（repo）某日的变更集合：按分支区分 + 项目级意图。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ProjectChangeset {
    /// 项目绝对路径
    pub project: String,
    /// 路径最后一级，用于展示
    pub short_name: String,
    /// 是否遵循 conventional commits（所有分支提交汇总判定）
    pub is_conventional: bool,
    /// 当天对话意图（history.jsonl 的脱敏 display），项目级
    pub intents: Vec<String>,
    /// 按分支区分的变更段
    pub branches: Vec<BranchChangeset>,
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
                body: String::new(),
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

/// 解析 `git log <range> --pretty=format:%H%x1f%b%x1e` 输出为 (hash, body) 列表。
/// 每条记录以 RS(\x1e) 结尾；记录内按第一个 US(\x1f) 切成 hash 与 body（body 可多行）。
fn parse_commit_bodies(out: &str) -> Vec<(String, String)> {
    let mut result = Vec::new();
    for record in out.split('\u{1e}') {
        let record = record.trim_matches('\n');
        if record.trim().is_empty() {
            continue;
        }
        let mut parts = record.splitn(2, '\u{1f}');
        let hash = parts.next().unwrap_or("").trim().to_string();
        let body = parts.next().unwrap_or("").trim().to_string();
        if !hash.is_empty() {
            result.push((hash, body));
        }
    }
    result
}

fn language_label(language: &str) -> &str {
    if language == "en" {
        "English"
    } else {
        "中文"
    }
}

/// 单次调用的当日总结 prompt：把所有项目素材一次交给 claude，要求输出分项目、可读的 Markdown 正文。
/// 含当天对话意图（为什么）与分支区分；conventional 项目可借 type/scope 归纳。
fn build_daily_prompt(date: &str, changesets: &[ProjectChangeset], language: &str) -> String {
    let mut p = format!(
        "你是工作总结助手。下面是 {date} 这一天我在多个项目里的 git 变更素材，以及我当天向 Claude Code 提的需求（意图）。\
请用{}写一份分项目的工作总结，直接输出 Markdown 正文，并严格遵守以下规则：\n\
- 不要输出顶层一级标题（# 开头），也不要复述本说明。\n\
- 每个项目用二级标题 `## 项目名` 开头。\n\
- 每个项目段内：先一段概述（做了什么、为什么——「为什么」请结合「当天对话意图」与 commit body），再用 `**主要变更**` 列出 3-6 条要点。\n\
- 若某项目含多个分支段，请在该项目下用三级标题 `### 分支名` 分别小结；只有一个主分支段时无需分支标题。\n\
- 用自然语言归纳，不要原样粘贴 diff 代码。\n\
- 若某分支存在未提交变更，在对应位置用一行引用块标注：`> ⚠️ 有未提交变更：<简述>`。\n\n",
        language_label(language)
    );
    for cs in changesets {
        p.push_str(&format!("\n=== 项目：{} ===\n", cs.short_name));
        if cs.is_conventional {
            p.push_str("（该项目遵循 Conventional Commits，可借助 type/scope 归纳）\n");
        }
        if !cs.intents.is_empty() {
            p.push_str("当天对话意图（我向 Claude Code 提的需求，已脱敏）：\n");
            for it in &cs.intents {
                p.push_str(&format!("- {it}\n"));
            }
        }
        if let Some(err) = &cs.scan_error {
            p.push_str(&format!("扫描存在错误：{err}\n"));
        }
        let single_main = cs.branches.len() == 1 && cs.branches[0].is_main;
        for seg in &cs.branches {
            if !single_main {
                let tag = if seg.is_main {
                    "主分支"
                } else {
                    "特性分支(未并入主分支)"
                };
                p.push_str(&format!("\n【分支 {} · {tag}】\n", seg.branch));
            }
            if !seg.commits.is_empty() {
                p.push_str("已提交：\n");
                for c in &seg.commits {
                    p.push_str(&format!(
                        "- {} (+{} -{}, {} 文件)\n",
                        c.subject, c.insertions, c.deletions, c.files_changed
                    ));
                    if !c.body.trim().is_empty() {
                        for bl in c.body.trim().lines() {
                            p.push_str(&format!("    {bl}\n"));
                        }
                    }
                }
            }
            if seg.has_uncommitted {
                p.push_str("未提交变更（请标注存在未提交变更）：\n");
                if seg.uncommitted_material.is_empty() {
                    p.push_str("（有未提交变更，但无可展示的 diff 内容）\n");
                } else {
                    p.push_str("```diff\n");
                    p.push_str(&seg.uncommitted_material);
                    p.push_str("\n```\n");
                }
            }
        }
    }
    p
}

/// 周总结里某天缺日总结时的紧凑素材
fn build_changeset_brief(cs: &ProjectChangeset) -> String {
    let mut b = format!("### {}\n", cs.short_name);
    for it in cs.intents.iter().take(2) {
        b.push_str(&format!("- 意图：{it}\n"));
    }
    for seg in &cs.branches {
        for c in &seg.commits {
            if seg.is_main {
                b.push_str(&format!("- {}\n", c.subject));
            } else {
                b.push_str(&format!("- [{}] {}\n", seg.branch, c.subject));
            }
        }
        if seg.has_uncommitted {
            b.push_str(&format!("- ⚠️ {} 有未提交变更\n", seg.branch));
        }
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
        if !cs.intents.is_empty() {
            md.push_str("当天意图：\n");
            for it in &cs.intents {
                md.push_str(&format!("- {it}\n"));
            }
        }
        if let Some(err) = &cs.scan_error {
            md.push_str(&format!("> 扫描错误：{err}\n"));
        }
        if cs.branches.is_empty() {
            md.push_str("- （无变更记录）\n");
        }
        for seg in &cs.branches {
            let mut meta: Vec<String> = vec![format!("分支 {}", seg.branch)];
            if seg.is_main {
                meta.push("主分支".to_string());
            }
            meta.push(format!("{} commits", seg.commits.len()));
            if seg.has_uncommitted {
                meta.push("⚠️ 有未提交变更".to_string());
            }
            md.push_str(&format!("\n**{}**\n", meta.join(" · ")));
            for c in &seg.commits {
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

/// history.jsonl 单行的结构化视图（仅内部使用，不进绑定）。
struct HistoryEntry {
    project: String,
    timestamp_ms: i64,
    display: String,
}

/// 解析 history.jsonl 内容为条目列表（保留 timestamp 与 display）。
fn parse_history_entries(content: &str) -> Vec<HistoryEntry> {
    let mut entries = Vec::new();
    for line in content.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        let Ok(value) = serde_json::from_str::<serde_json::Value>(line) else {
            continue;
        };
        let project = value
            .get("project")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        if project.is_empty() {
            continue;
        }
        let timestamp_ms = value.get("timestamp").and_then(|v| v.as_i64()).unwrap_or(0);
        let display = value
            .get("display")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        entries.push(HistoryEntry {
            project,
            timestamp_ms,
            display,
        });
    }
    entries
}

/// 候选项目集：history 中出现过的 distinct 项目路径（保证 commit 不漏项）。
fn distinct_projects(entries: &[HistoryEntry]) -> Vec<String> {
    let set: BTreeSet<String> = entries.iter().map(|e| e.project.clone()).collect();
    set.into_iter().collect()
}

const MAX_INTENTS: usize = 12;
const MAX_INTENT_CHARS: usize = 200;

/// 窗口 [start_ms, end_ms) 内、匹配 project 的脱敏 display：去重 + 时间序 + 截断 + 限条数。
fn intents_for_day(
    entries: &[HistoryEntry],
    project: &str,
    start_ms: i64,
    end_ms: i64,
) -> Vec<String> {
    let mut picked: Vec<&HistoryEntry> = entries
        .iter()
        .filter(|e| e.project == project && e.timestamp_ms >= start_ms && e.timestamp_ms < end_ms)
        .filter(|e| !e.display.trim().is_empty())
        .collect();
    picked.sort_by_key(|e| e.timestamp_ms);
    let mut seen: BTreeSet<String> = BTreeSet::new();
    let mut out: Vec<String> = Vec::new();
    for e in picked {
        let text = crate::utils::truncate(e.display.trim(), MAX_INTENT_CHARS);
        if seen.insert(text.clone()) {
            out.push(text);
            if out.len() >= MAX_INTENTS {
                break;
            }
        }
    }
    out
}

/// 窗口内该 project 是否有任何 history 记录（未提交门控用）。
fn history_active(entries: &[HistoryEntry], project: &str, start_ms: i64, end_ms: i64) -> bool {
    entries
        .iter()
        .any(|e| e.project == project && e.timestamp_ms >= start_ms && e.timestamp_ms < end_ms)
}

/// 当天本地时区毫秒窗口 [当天00:00, 次日00:00)
fn day_window_ms(date: &str) -> Option<(i64, i64)> {
    let start = crate::usage::parse_local_date_to_ms(date, false)?;
    let next = next_date(date).ok()?;
    let end = crate::usage::parse_local_date_to_ms(&next, false)?;
    Some((start, end))
}

fn short_name_of(project: &str) -> String {
    Path::new(project)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or(project)
        .to_string()
}

/// 检测仓库主分支：origin/HEAD → main/master → 当前 HEAD 分支。
fn detect_main_branch(path: &Path) -> Option<String> {
    if let Ok(out) = crate::project::run_git(
        path,
        &["symbolic-ref", "--quiet", "refs/remotes/origin/HEAD"],
    ) {
        if let Some(name) = out.trim().rsplit('/').next() {
            if !name.is_empty() {
                return Some(name.to_string());
            }
        }
    }
    for cand in ["main", "master"] {
        let exists = crate::project::run_git(
            path,
            &[
                "rev-parse",
                "--verify",
                "--quiet",
                &format!("refs/heads/{cand}"),
            ],
        )
        .map(|s| !s.trim().is_empty())
        .unwrap_or(false);
        if exists {
            return Some(cand.to_string());
        }
    }
    crate::project::run_git(path, &["rev-parse", "--abbrev-ref", "HEAD"])
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty() && s != "HEAD")
}

const MAX_BRANCHES: usize = 30;

/// 列本地分支，按提交时间倒序，限 MAX_BRANCHES 个。
fn list_local_branches(path: &Path) -> Vec<String> {
    crate::project::run_git(
        path,
        &[
            "for-each-ref",
            "--sort=-committerdate",
            "--format=%(refname:short)",
            "refs/heads",
        ],
    )
    .map(|out| {
        out.lines()
            .map(|l| l.trim().to_string())
            .filter(|s| !s.is_empty())
            .take(MAX_BRANCHES)
            .collect()
    })
    .unwrap_or_default()
}

/// 采集某 rev（分支名或 `main..B` 区间）当天提交，并回填 commit body。
fn collect_commits(
    path: &Path,
    rev: &str,
    since: &str,
    until: &str,
    email: Option<&str>,
    scan_error: &mut Option<String>,
) -> Vec<ProjectCommit> {
    let mut args: Vec<String> = vec![
        "log".into(),
        rev.into(),
        format!("--since={since}"),
        format!("--until={until}"),
        "--numstat".into(),
        format!("--pretty=format:{GIT_LOG_FORMAT}"),
    ];
    if let Some(email) = email {
        args.push(format!("--author={email}"));
    }
    let refs: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
    let mut commits = match crate::project::run_git(path, &refs) {
        Ok(out) => parse_commits(&out),
        Err(e) => {
            scan_error.get_or_insert(e);
            Vec::new()
        }
    };
    if commits.is_empty() {
        return commits;
    }
    // body 单独取（不与 numstat 混，避免多行 body 破坏 marker/numstat 行解析）
    let mut bargs: Vec<String> = vec![
        "log".into(),
        rev.into(),
        format!("--since={since}"),
        format!("--until={until}"),
        "--pretty=format:%H%x1f%b%x1e".into(),
    ];
    if let Some(email) = email {
        bargs.push(format!("--author={email}"));
    }
    let brefs: Vec<&str> = bargs.iter().map(|s| s.as_str()).collect();
    if let Ok(out) = crate::project::run_git(path, &brefs) {
        let bodies: HashMap<String, String> = parse_commit_bodies(&out).into_iter().collect();
        for c in commits.iter_mut() {
            if let Some(b) = bodies.get(&c.hash) {
                c.body = b.clone();
            }
        }
    }
    commits
}

/// 采集单个项目某日变更（多分支区分 + 未提交门控）。非 git 仓库 / 无变更 → None。
/// `intents`/`active` 由上层基于 history 时间戳计算后传入。
fn gather_changeset(
    project: &str,
    date: &str,
    intents: Vec<String>,
    active: bool,
) -> Option<ProjectChangeset> {
    let path = Path::new(project);
    if crate::project::git_repo_root(path).is_err() {
        return None;
    }

    let (since, until) = match day_range_args(date) {
        Ok(v) => v,
        Err(e) => {
            return Some(ProjectChangeset {
                project: project.to_string(),
                short_name: short_name_of(project),
                is_conventional: false,
                intents,
                branches: Vec::new(),
                scan_error: Some(e),
            });
        }
    };

    let mut scan_error: Option<String> = None;

    // 当前用户邮箱过滤「我的工作」；无邮箱则不加 --author
    let email = crate::project::run_git(path, &["config", "user.email"])
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());
    let current = crate::project::run_git(path, &["rev-parse", "--abbrev-ref", "HEAD"])
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty() && s != "HEAD");
    let main_branch = detect_main_branch(path);

    let mut branches: Vec<BranchChangeset> = Vec::new();
    let mut seen: HashSet<String> = HashSet::new();

    match &main_branch {
        Some(main) => {
            // 主分支段：main 当天提交
            let commits = collect_commits(
                path,
                main,
                &since,
                &until,
                email.as_deref(),
                &mut scan_error,
            );
            for c in &commits {
                seen.insert(c.hash.clone());
            }
            if !commits.is_empty() {
                branches.push(BranchChangeset {
                    branch: main.clone(),
                    is_main: true,
                    commits,
                    has_uncommitted: false,
                    uncommitted_material: String::new(),
                });
            }
            // 非主分支段：main..B 为空=已并入→跳过；非空=独立进度→单列
            for b in list_local_branches(path) {
                if &b == main {
                    continue;
                }
                let range = format!("{main}..{b}");
                let mut commits = collect_commits(
                    path,
                    &range,
                    &since,
                    &until,
                    email.as_deref(),
                    &mut scan_error,
                );
                commits.retain(|c| !seen.contains(&c.hash));
                for c in &commits {
                    seen.insert(c.hash.clone());
                }
                if !commits.is_empty() {
                    branches.push(BranchChangeset {
                        branch: b,
                        is_main: false,
                        commits,
                        has_uncommitted: false,
                        uncommitted_material: String::new(),
                    });
                }
            }
        }
        None => {
            // 无主分支（detached / 空仓库）：退化为当前 rev 当天提交
            let rev = current.clone().unwrap_or_else(|| "HEAD".into());
            let commits = collect_commits(
                path,
                &rev,
                &since,
                &until,
                email.as_deref(),
                &mut scan_error,
            );
            if !commits.is_empty() {
                branches.push(BranchChangeset {
                    branch: rev,
                    is_main: true,
                    commits,
                    has_uncommitted: false,
                    uncommitted_material: String::new(),
                });
            }
        }
    }

    // 未提交：仅当 history 当天 active（避免他日 WIP 误归类）。挂到当前分支段。
    if active {
        let status =
            crate::project::run_git(path, &["status", "--porcelain"]).unwrap_or_else(|e| {
                scan_error.get_or_insert(e);
                String::new()
            });
        if !status.trim().is_empty() {
            let diff = crate::project::run_git(path, &["diff", "HEAD"]).unwrap_or_else(|e| {
                scan_error.get_or_insert(e);
                String::new()
            });
            let untracked: Vec<String> = status
                .lines()
                .filter_map(|l| l.strip_prefix("?? ").map(|p| p.trim().to_string()))
                .collect();
            let material = build_uncommitted_material(&diff, &untracked);
            let cur = current.clone().unwrap_or_else(|| "(当前工作树)".into());
            if let Some(seg) = branches.iter_mut().find(|s| s.branch == cur) {
                seg.has_uncommitted = true;
                seg.uncommitted_material = material;
            } else {
                let is_main = main_branch.as_deref() == Some(cur.as_str());
                branches.push(BranchChangeset {
                    branch: cur,
                    is_main,
                    commits: Vec::new(),
                    has_uncommitted: true,
                    uncommitted_material: material,
                });
            }
        }
    }

    if branches.is_empty() && scan_error.is_none() {
        return None;
    }

    // 主分支段在前，其余按分支名稳定排序
    branches.sort_by(|a, b| b.is_main.cmp(&a.is_main).then(a.branch.cmp(&b.branch)));

    let all_subjects: Vec<String> = branches
        .iter()
        .flat_map(|s| s.commits.iter().map(|c| c.subject.clone()))
        .collect();
    let is_conventional = detect_conventional_repo(&all_subjects);

    Some(ProjectChangeset {
        project: project.to_string(),
        short_name: short_name_of(project),
        is_conventional,
        intents,
        branches,
        scan_error,
    })
}

/// 扫描所有候选项目（按 repo root 去重），返回当日有变更的项目集合。
fn gather_day_changesets(date: &str) -> Result<Vec<ProjectChangeset>, String> {
    let history = crate::history::get_history()?;
    let entries = parse_history_entries(&history.content);
    let window = day_window_ms(date);

    let mut seen_roots: BTreeSet<String> = BTreeSet::new();
    let mut result: Vec<ProjectChangeset> = Vec::new();
    for project in distinct_projects(&entries) {
        // repo 去重：同一 repo（toplevel）只处理一次，避免分支提交被重复汇总
        let root = match crate::project::git_repo_root(Path::new(&project)) {
            Ok(r) => r,
            Err(_) => continue,
        };
        if !seen_roots.insert(root) {
            continue;
        }
        let (intents, active) = match window {
            Some((s, e)) => (
                intents_for_day(&entries, &project, s, e),
                history_active(&entries, &project, s, e),
            ),
            None => (Vec::new(), false),
        };
        if let Some(cs) = gather_changeset(&project, date, intents, active) {
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
            is_conventional: true,
            intents: vec!["实现登录功能".into()],
            branches: vec![BranchChangeset {
                branch: "main".into(),
                is_main: true,
                commits: vec![ProjectCommit {
                    hash: "h".into(),
                    subject: "feat: add login".into(),
                    body: "为什么：用户需要登录".into(),
                    author: "Alice".into(),
                    timestamp: 1,
                    files_changed: 2,
                    insertions: 10,
                    deletions: 1,
                }],
                has_uncommitted: true,
                uncommitted_material: "diff --git a/x b/x".into(),
            }],
            scan_error: None,
        }
    }

    #[test]
    fn build_daily_prompt_includes_intent_body_and_language() {
        let prompt = build_daily_prompt("2026-06-23", &[sample_changeset()], "zh");
        assert!(prompt.contains("feat: add login"));
        assert!(prompt.contains("未提交"));
        assert!(prompt.contains("中文"));
        assert!(prompt.contains("## 项目名")); // 模板要求每项目用二级标题
        assert!(prompt.contains("=== 项目：proj ==="));
        assert!(prompt.contains("当天对话意图"));
        assert!(prompt.contains("实现登录功能"));
        assert!(prompt.contains("用户需要登录")); // commit body
                                                  // 单一主分支段不加分支标题
        assert!(!prompt.contains("【分支"));
    }

    #[test]
    fn build_daily_prompt_marks_feature_branch_section() {
        let mut cs = sample_changeset();
        cs.branches.push(BranchChangeset {
            branch: "feature-x".into(),
            is_main: false,
            commits: vec![ProjectCommit {
                hash: "h2".into(),
                subject: "wip: x".into(),
                body: String::new(),
                author: "A".into(),
                timestamp: 2,
                files_changed: 1,
                insertions: 1,
                deletions: 0,
            }],
            has_uncommitted: false,
            uncommitted_material: String::new(),
        });
        let prompt = build_daily_prompt("2026-06-23", &[cs], "zh");
        assert!(prompt.contains("【分支 main · 主分支】"));
        assert!(prompt.contains("【分支 feature-x · 特性分支(未并入主分支)】"));
        assert!(prompt.contains("wip: x"));
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
        assert!(md.contains("分支 main"));
        assert!(md.contains("主分支"));
        assert!(md.contains("实现登录功能")); // 意图
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
    fn parse_history_entries_extracts_and_distinct_dedupes() {
        let content =
            "{\"project\":\"/a\",\"timestamp\":1000,\"display\":\"做A\",\"sessionId\":\"1\"}\n\
{\"project\":\"/b\",\"timestamp\":2000,\"display\":\"做B\"}\n\
{\"project\":\"/a\",\"timestamp\":3000,\"display\":\"再做A\"}\n\
not-json\n";
        let entries = parse_history_entries(content);
        assert_eq!(entries.len(), 3);
        assert_eq!(entries[0].timestamp_ms, 1000);
        assert_eq!(entries[0].display, "做A");
        let mut projects = distinct_projects(&entries);
        projects.sort();
        assert_eq!(projects, vec!["/a".to_string(), "/b".to_string()]);
    }

    #[test]
    fn intents_for_day_filters_window_dedupes_and_skips_empty() {
        let entries = vec![
            HistoryEntry {
                project: "/a".into(),
                timestamp_ms: 1000,
                display: "做A".into(),
            },
            HistoryEntry {
                project: "/a".into(),
                timestamp_ms: 1500,
                display: "做A".into(),
            }, // 重复
            HistoryEntry {
                project: "/a".into(),
                timestamp_ms: 5000,
                display: "做B".into(),
            }, // 窗口外
            HistoryEntry {
                project: "/b".into(),
                timestamp_ms: 1200,
                display: "别的".into(),
            }, // 别的项目
            HistoryEntry {
                project: "/a".into(),
                timestamp_ms: 1200,
                display: "  ".into(),
            }, // 空
        ];
        let out = intents_for_day(&entries, "/a", 1000, 2000);
        assert_eq!(out, vec!["做A".to_string()]);
    }

    #[test]
    fn history_active_respects_window_and_project() {
        let entries = vec![HistoryEntry {
            project: "/a".into(),
            timestamp_ms: 1500,
            display: "x".into(),
        }];
        assert!(history_active(&entries, "/a", 1000, 2000));
        assert!(!history_active(&entries, "/a", 2000, 3000)); // 窗口外
        assert!(!history_active(&entries, "/b", 1000, 2000)); // 别的项目
    }

    #[test]
    fn parse_commit_bodies_splits_records() {
        let out = "h1\u{1f}body line1\nbody line2\u{1e}h2\u{1f}\u{1e}h3\u{1f}third\u{1e}";
        let bodies = parse_commit_bodies(out);
        assert_eq!(bodies.len(), 3);
        assert_eq!(bodies[0], ("h1".into(), "body line1\nbody line2".into()));
        assert_eq!(bodies[1], ("h2".into(), String::new()));
        assert_eq!(bodies[2], ("h3".into(), "third".into()));
    }

    #[test]
    fn validate_summary_key_rejects_traversal() {
        assert!(validate_summary_key("2026-06-23").is_ok());
        assert!(validate_summary_key("2026-W26").is_ok());
        assert!(validate_summary_key("../etc/passwd").is_err());
        assert!(validate_summary_key("a/b").is_err());
    }

    // ===== 多分支 git 集成测试（临时 repo，shell 调用 git，hermetic）=====

    /// 在临时 repo 内跑 git；忽略用户/系统 config 保证 hermetic；可注入提交日期。
    fn tg(dir: &Path, args: &[&str], date: Option<&str>) {
        let mut c = Command::new("git");
        c.current_dir(dir)
            .args(args)
            .env("GIT_CONFIG_GLOBAL", "/dev/null")
            .env("GIT_CONFIG_SYSTEM", "/dev/null");
        if let Some(d) = date {
            c.env("GIT_AUTHOR_DATE", d).env("GIT_COMMITTER_DATE", d);
        }
        let out = c.output().expect("运行 git 失败");
        assert!(
            out.status.success(),
            "git {args:?} 失败: {}",
            String::from_utf8_lossy(&out.stderr)
        );
    }

    fn init_repo(p: &Path) {
        tg(p, &["init"], None);
        tg(p, &["config", "user.email", "test@example.com"], None);
        tg(p, &["config", "user.name", "T"], None);
        tg(p, &["config", "commit.gpgsign", "false"], None);
    }

    #[test]
    fn gather_changeset_folds_merged_branch_and_separates_diverged() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path();
        let date = "2026-06-23";
        let d = "2026-06-23 12:00:00";

        init_repo(p);
        // main: M1
        std::fs::write(p.join("a.txt"), "a").unwrap();
        tg(p, &["add", "."], None);
        tg(p, &["commit", "-m", "feat: m1"], Some(d));
        tg(p, &["branch", "-M", "main"], None);

        // feature-merged: F1 → fast-forward 并入 main
        tg(p, &["checkout", "-b", "feature-merged"], None);
        std::fs::write(p.join("b.txt"), "b").unwrap();
        tg(p, &["add", "."], None);
        tg(p, &["commit", "-m", "feat: f1 merged"], Some(d));
        tg(p, &["checkout", "main"], None);
        tg(p, &["merge", "--no-edit", "feature-merged"], Some(d));

        // feature-diverged: F2 → 不并入
        tg(p, &["checkout", "-b", "feature-diverged"], None);
        std::fs::write(p.join("c.txt"), "c").unwrap();
        tg(p, &["add", "."], None);
        tg(p, &["commit", "-m", "feat: f2 diverged"], Some(d));
        tg(p, &["checkout", "main"], None);

        // 当前在 main，制造未提交（未跟踪）
        std::fs::write(p.join("d.txt"), "d").unwrap();

        let proj = p.to_str().unwrap();
        let cs = gather_changeset(proj, date, vec!["写测试".into()], true).expect("changeset");

        assert_eq!(cs.intents, vec!["写测试".to_string()]);

        let main_seg = cs
            .branches
            .iter()
            .find(|s| s.branch == "main")
            .expect("main 段");
        assert!(main_seg.is_main);
        assert!(main_seg.commits.iter().any(|c| c.subject == "feat: m1"));
        assert!(main_seg
            .commits
            .iter()
            .any(|c| c.subject == "feat: f1 merged"));
        assert!(main_seg.has_uncommitted, "当前分支 main 应挂未提交");

        let div = cs
            .branches
            .iter()
            .find(|s| s.branch == "feature-diverged")
            .expect("diverged 段");
        assert!(!div.is_main);
        assert!(div.commits.iter().any(|c| c.subject == "feat: f2 diverged"));

        // 已并入主分支的 feature-merged 不单列
        assert!(cs.branches.iter().all(|s| s.branch != "feature-merged"));
    }

    #[test]
    fn gather_changeset_gates_uncommitted_by_history_active() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path();
        let date = "2026-06-23";
        let d = "2026-06-23 12:00:00";
        init_repo(p);
        std::fs::write(p.join("a.txt"), "a").unwrap();
        tg(p, &["add", "."], None);
        tg(p, &["commit", "-m", "feat: m1"], Some(d));
        tg(p, &["branch", "-M", "main"], None);
        // 未提交（模拟他日 WIP）
        std::fs::write(p.join("wip.txt"), "wip").unwrap();

        let proj = p.to_str().unwrap();
        // active=false：未提交不计入（避免他日 WIP 误归类）
        let cs = gather_changeset(proj, date, vec![], false).expect("changeset");
        let seg = cs.branches.iter().find(|s| s.branch == "main").unwrap();
        assert!(!seg.has_uncommitted, "active=false 时不应计入未提交");

        // active=true：计入
        let cs2 = gather_changeset(proj, date, vec![], true).expect("changeset");
        let seg2 = cs2.branches.iter().find(|s| s.branch == "main").unwrap();
        assert!(seg2.has_uncommitted, "active=true 时应计入未提交");
    }
}
