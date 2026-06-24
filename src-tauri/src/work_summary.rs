//! 工作总结：扫描昨日有变更的 git 项目，调用本机 claude CLI 生成分项目总结并落盘。
use serde::{Deserialize, Serialize};

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

/// 单个项目的总结 prompt。conventional 项目不传 diff（仅 commit 列表）；
/// 未提交素材始终附带（已在采集阶段截断）。
fn build_project_prompt(cs: &ProjectChangeset, language: &str) -> String {
    let mut p = String::new();
    p.push_str(&format!(
        "你是工作总结助手。请用{}为项目「{}」写一段简洁的工作总结，说明做了什么、为什么。直接输出 Markdown 段落正文，不要加标题。\n\n",
        language_label(language),
        cs.short_name
    ));
    if let Some(branch) = &cs.branch {
        p.push_str(&format!("分支: {branch}\n"));
    }
    if !cs.commits.is_empty() {
        p.push_str("\n## 已提交\n");
        for c in &cs.commits {
            p.push_str(&format!(
                "- {} (+{} -{}, {} 文件)\n",
                c.subject, c.insertions, c.deletions, c.files_changed
            ));
        }
    }
    if cs.has_uncommitted {
        p.push_str("\n## 未提交变更（请在总结中明确标注存在未提交变更）\n");
        p.push_str("```diff\n");
        p.push_str(&cs.uncommitted_material);
        p.push_str("\n```\n");
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

/// 解析 `claude -p --output-format json` 输出，取 `.result`；非 JSON 时回退原文
fn parse_claude_json_output(stdout: &str) -> String {
    if let Ok(value) = serde_json::from_str::<serde_json::Value>(stdout) {
        if let Some(result) = value.get("result").and_then(|v| v.as_str()) {
            return result.trim().to_string();
        }
    }
    stdout.trim().to_string()
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

    #[test]
    fn build_project_prompt_marks_uncommitted_and_language() {
        let cs = ProjectChangeset {
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
        };
        let prompt = build_project_prompt(&cs, "zh");
        assert!(prompt.contains("feat: add login"));
        assert!(prompt.contains("未提交"));
        assert!(prompt.contains("中文"));
    }

    #[test]
    fn parse_claude_json_output_extracts_result() {
        let stdout = r#"{"type":"result","subtype":"success","result":"完成了登录功能"}"#;
        assert_eq!(parse_claude_json_output(stdout), "完成了登录功能");
    }

    #[test]
    fn parse_claude_json_output_falls_back_to_raw() {
        assert_eq!(parse_claude_json_output("纯文本输出"), "纯文本输出");
    }
}
