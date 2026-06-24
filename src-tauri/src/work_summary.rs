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
            if rest.starts_with(": ") || rest == ":" || rest.starts_with(':') {
                return true;
            }
        }
    }
    false
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
}
