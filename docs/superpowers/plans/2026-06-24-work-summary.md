# 工作总结（Work Summary）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增「工作总结」菜单页，一键扫描昨日有变更（已提交 + 未提交）的 git 项目，调用本机 `claude` CLI 分项目生成自然语言总结并落盘为 Markdown，支持基于日总结的周总结。

**Architecture:** 后端新增 `work_summary.rs` 模块，复用 `project.rs::run_git` 取 git 数据、复用 `plugins.rs` 的 `claude` CLI 调用模式做总结、复用 `utils.rs` 原子写入落盘到 `~/.config/code-manager/summaries/{daily,weekly}/`。前端新增顶级 tab + `useWorkSummaries` hook + `WorkSummaryPage`，通过 `ipc.*` 调用生成命令并用现有 `MarkdownPreview` 渲染。

**Tech Stack:** Rust + Tauri command + tauri-specta；React 19 + TypeScript + Tailwind v4 + shadcn/ui；本机 `claude` CLI（headless）；`git` 子进程。

## Global Constraints

- 代码注释使用中文，技术术语保留英文。
- 所有用户可见文本走 `useI18n()` 的 `t()`；新增 key 同步 `src/i18n.ts` 的 `zh` 与 `en` 两块。
- 用户反馈走 `useToast()`，不要用 `console.error` 当反馈。
- Rust 文件读写、时间、子进程窗口隐藏优先复用 `src-tauri/src/utils.rs`（`ensure_dir_and_write_atomic` / `read_json_file` / `current_rfc3339_timestamp` / `hide_command_window` / `merge_process_output` / `truncate`）。
- 公共边界返回 `Result`，错误带上下文，不用 `unwrap()`/`expect()` 处理可恢复错误。
- 路径相关入参必须防 `..`、绝对路径与路径分隔符逃逸。
- 新增/修改 Tauri command 同步链：Rust `#[tauri::command] + #[specta::specta]` → `lib.rs::build_specta_builder()` 的 `collect_commands![]` → `make bindings` → `make bindings-check` → 前端经 `src/ipc.ts` 的 `ipc` 调用（不直接 `invoke`）。
- 应用数据目录统一用 `utils::get_app_data_dir()`，不硬编码单平台路径。
- 日志不记录 diff 正文、commit 正文、claude 输出等业务大块数据；只记 `event=... status=...` 稳定标识。
- 业务前端类型直接从自动生成的 `./bindings` import（generated 类型已完整），不手工在 `src/types.ts` 复制后端 struct；`src/types.ts` 仅新增 `TabType` 成员 `"worklog"`。

## 文件结构

后端（新增/修改）：

- Create: `src-tauri/src/work_summary.rs` —— 模块全部逻辑：类型、纯函数（日期/ISO 周、conventional 检测、git log 解析、diff 截断、prompt 构造、markdown 拼装、claude 输出解析）、副作用（git 采集、claude 调用、落盘）、6 个 command。
- Modify: `src-tauri/src/project.rs:430` —— 把 `run_git` 与 `git_repo_root` 可见性改为 `pub(crate)` 供复用。
- Modify: `src-tauri/src/lib.rs:1`（`mod` 区）+ `:44` 附近（`use`）+ `:83` 的 `collect_commands![]` —— 声明模块、导入并注册 6 个 command。

前端（新增/修改）：

- Modify: `src/types.ts:6` —— `TabType` 增加 `"worklog"`。
- Modify: `src/i18n.ts` —— `zh`/`en` 各新增 `nav.worklog` 与 `worklog.*` 文案。
- Modify: `src/components/Sidebar.tsx:1`（icon import）+ `:34`（`NAV_ITEMS`）—— 新增导航项。
- Modify: `src/App.tsx:24`（lazy import）+ `:285`（render 分支）—— 挂载页面。
- Create: `src/lib/work-summary-date.ts` —— 前端纯函数 `localDateKey(date)`（YYYY-MM-DD，本地时区）。
- Create: `src/hooks/useWorkSummaries.ts` —— 列表加载 + 扫描 + 生成日/周总结 + loading 状态。
- Create: `src/components/WorkSummaryPage.tsx` —— 列表 + 操作按钮 + Markdown 渲染。
- Create: `src/components/__tests__/WorkSummaryPage.test.tsx`、`src/lib/__tests__/work-summary-date.test.ts`。

数据落盘：

```
~/.config/code-manager/summaries/
  daily/2026-06-23.md
  weekly/2026-W26.md
```

---

## 阶段 A：后端纯函数与类型

### Task 1: 模块骨架与类型

**Files:**
- Create: `src-tauri/src/work_summary.rs`
- Modify: `src-tauri/src/lib.rs:1`（mod 区，按字母序插入 `mod work_summary;`，紧邻 `mod widget;`）

**Interfaces:**
- Produces: 类型 `ProjectCommit`、`ProjectChangeset`、`ClaudeCliStatus`、`SummaryDocument`、`SummaryListItem`，均 `Serialize`/`Deserialize`（按需）+ `specta::Type` + `#[serde(rename_all = "camelCase")]`。

- [ ] **Step 1: 写模块骨架与类型**

创建 `src-tauri/src/work_summary.rs`：

```rust
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
```

在 `src-tauri/src/lib.rs` 的 mod 区按字母序加入：

```rust
mod widget;
mod work_summary;
```

- [ ] **Step 2: 编译验证**

Run: `cargo check --manifest-path src-tauri/Cargo.toml`
Expected: 通过（可能有 `dead_code` 警告，后续任务消除）。

- [ ] **Step 3: 提交**

```bash
git add src-tauri/src/work_summary.rs src-tauri/src/lib.rs
git commit -m "feat(work-summary): 新增工作总结模块骨架与类型"
```

---

### Task 2: 日期与 ISO 周纯函数

**Files:**
- Modify: `src-tauri/src/work_summary.rs`

**Interfaces:**
- Consumes: 无。
- Produces:
  - `fn next_date(date: &str) -> Result<String, String>` —— "2026-06-23" → "2026-06-24"。
  - `fn day_range_args(date: &str) -> Result<(String, String), String>` —— 返回 git `--since`/`--until` 值，如 `("2026-06-23 00:00:00", "2026-06-24 00:00:00")`。
  - `fn iso_week_key(date: &str) -> Result<String, String>` —— "2026-06-24" → "2026-W26"。
  - `fn week_dates(date: &str) -> Result<Vec<String>, String>` —— 该日期所在 ISO 周的周一到周日 7 个日期。

- [ ] **Step 1: 写失败测试**

在 `work_summary.rs` 追加：

```rust
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
}
```

- [ ] **Step 2: 运行确认失败**

Run: `cargo test --manifest-path src-tauri/Cargo.toml work_summary::tests::next_date_handles -- --exact 2>&1 | tail -5`
Expected: 编译失败（`next_date` 未定义）。

- [ ] **Step 3: 写实现**

在 `work_summary.rs`（types 之后、tests 之前）加入。算法用 Howard Hinnant 的 civil/days 互转，自洽不依赖额外 crate：

```rust
/// 解析 "YYYY-MM-DD" 为 (year, month, day)
fn parse_ymd(date: &str) -> Result<(i64, i64, i64), String> {
    let parts: Vec<&str> = date.split('-').collect();
    if parts.len() != 3 {
        return Err(format!("非法日期格式: {date}"));
    }
    let y = parts[0].parse::<i64>().map_err(|_| format!("非法年份: {date}"))?;
    let m = parts[1].parse::<i64>().map_err(|_| format!("非法月份: {date}"))?;
    let d = parts[2].parse::<i64>().map_err(|_| format!("非法日期: {date}"))?;
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

/// ISO weekday：周一=1 .. 周日=7
fn iso_weekday(days: i64) -> i64 {
    // 1970-01-01 是周四（4）。((days % 7) + 4) 映射到 1..7
    let w = (days % 7 + 7) % 7; // 0=周四 .. 对齐
    // days=0 → 周四。构造 Mon=1 的映射：
    ((days - 0).rem_euclid(7) + 3) % 7 + 1 + ({ let _ = w; 0 })
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
```

> 注：`iso_weekday` 已简化为 `((days + 3).rem_euclid(7)) + 1`（1970-01-01=周四）。实现时用该单行表达式替换上面演示体，保持等价：
> ```rust
> fn iso_weekday(days: i64) -> i64 {
>     (days + 3).rem_euclid(7) + 1
> }
> ```

- [ ] **Step 4: 运行测试确认通过**

Run: `cargo test --manifest-path src-tauri/Cargo.toml work_summary::tests 2>&1 | tail -15`
Expected: 4 个日期相关测试 PASS。

- [ ] **Step 5: 提交**

```bash
git add src-tauri/src/work_summary.rs
git commit -m "feat(work-summary): 日期区间与 ISO 周纯函数"
```

---

### Task 3: conventional commits 检测

**Files:**
- Modify: `src-tauri/src/work_summary.rs`

**Interfaces:**
- Produces:
  - `fn is_conventional_subject(subject: &str) -> bool`
  - `fn detect_conventional_repo(subjects: &[String]) -> bool` —— 命中比例 ≥ 0.6 视为 conventional。

- [ ] **Step 1: 写失败测试**

在 `mod tests` 追加：

```rust
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
    let few = vec!["feat: a".to_string(), "改了点东西".to_string(), "WIP".to_string()];
    assert!(!detect_conventional_repo(&few)); // 1/3 ≈ 0.33
    assert!(!detect_conventional_repo(&[]));
}
```

- [ ] **Step 2: 运行确认失败**

Run: `cargo test --manifest-path src-tauri/Cargo.toml work_summary::tests::detects_conventional 2>&1 | tail -5`
Expected: 编译失败。

- [ ] **Step 3: 写实现**

不引新依赖，用手写前缀匹配（避免拉 `regex`）：

```rust
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
    let hits = subjects.iter().filter(|s| is_conventional_subject(s)).count();
    hits as f64 / subjects.len() as f64 >= 0.6
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cargo test --manifest-path src-tauri/Cargo.toml work_summary::tests 2>&1 | tail -15`
Expected: 全 PASS。

- [ ] **Step 5: 提交**

```bash
git add src-tauri/src/work_summary.rs
git commit -m "feat(work-summary): conventional commits 检测"
```

---

### Task 4: git log 输出解析

**Files:**
- Modify: `src-tauri/src/work_summary.rs`

**Interfaces:**
- Consumes: `ProjectCommit`（Task 1）。
- Produces:
  - `const GIT_LOG_FORMAT: &str` —— 供命令构造与解析共享的 `--pretty=format:` 字符串。
  - `fn parse_commits(log_output: &str) -> Vec<ProjectCommit>` —— 解析 `git log <GIT_LOG_FORMAT> --numstat` 输出。

- [ ] **Step 1: 写失败测试**

```rust
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
```

- [ ] **Step 2: 运行确认失败**

Run: `cargo test --manifest-path src-tauri/Cargo.toml work_summary::tests::parse_commits 2>&1 | tail -5`
Expected: 编译失败。

- [ ] **Step 3: 写实现**

```rust
/// 提交行前缀哨兵 + 字段分隔符（\x1f 不会出现在正常 subject 中）
const COMMIT_MARKER: &str = "@@C@@\u{1f}";
/// git log 格式：单行元数据，subject 用 %s（单行）
pub(crate) const GIT_LOG_FORMAT: &str = "@@C@@%x1f%H%x1f%at%x1f%an%x1f%s";

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
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cargo test --manifest-path src-tauri/Cargo.toml work_summary::tests 2>&1 | tail -15`
Expected: 全 PASS。

- [ ] **Step 5: 提交**

```bash
git add src-tauri/src/work_summary.rs
git commit -m "feat(work-summary): git log 输出解析"
```

---

### Task 5: 未提交 diff 截断

**Files:**
- Modify: `src-tauri/src/work_summary.rs`

**Interfaces:**
- Produces:
  - `const MAX_FILE_DIFF_LINES: usize = 400;`
  - `const MAX_TOTAL_DIFF_CHARS: usize = 12_000;`
  - `fn build_uncommitted_material(diff: &str, untracked: &[String]) -> String` —— 按文件分段截断 + 追加 untracked 文件名清单。

- [ ] **Step 1: 写失败测试**

```rust
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
    let material = build_uncommitted_material("", &["new.txt".to_string(), "x/y.rs".to_string()]);
    assert!(material.contains("未跟踪文件"));
    assert!(material.contains("new.txt"));
    assert!(material.contains("x/y.rs"));
}

#[test]
fn build_uncommitted_material_empty_when_nothing() {
    assert_eq!(build_uncommitted_material("", &[]), "");
}
```

- [ ] **Step 2: 运行确认失败**

Run: `cargo test --manifest-path src-tauri/Cargo.toml work_summary::tests::build_uncommitted 2>&1 | tail -5`
Expected: 编译失败。

- [ ] **Step 3: 写实现**

```rust
const MAX_FILE_DIFF_LINES: usize = 400;
const MAX_TOTAL_DIFF_CHARS: usize = 12_000;

/// 把 `git diff HEAD` 输出按文件分段、逐段限行截断，再整体限长；末尾追加 untracked 文件名清单。
fn build_uncommitted_material(diff: &str, untracked: &[String]) -> String {
    let mut out = String::new();

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
            out.push_str(&format!(
                "... (已截断，共 {} 行)\n",
                lines.len()
            ));
        } else {
            out.push_str(&section);
        }
        if out.chars().count() >= MAX_TOTAL_DIFF_CHARS {
            out = crate::utils::truncate(&out, MAX_TOTAL_DIFF_CHARS);
            out.push_str("\n... (总量超限，已截断)\n");
            break;
        }
    }

    if !untracked.is_empty() {
        out.push_str("\n未跟踪文件:\n");
        for path in untracked {
            out.push_str(&format!("- {path}\n"));
        }
    }

    out.trim().to_string()
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cargo test --manifest-path src-tauri/Cargo.toml work_summary::tests 2>&1 | tail -15`
Expected: 全 PASS。

- [ ] **Step 5: 提交**

```bash
git add src-tauri/src/work_summary.rs
git commit -m "feat(work-summary): 未提交 diff 截断"
```

---

### Task 6: prompt 构造与 claude 输出解析

**Files:**
- Modify: `src-tauri/src/work_summary.rs`

**Interfaces:**
- Consumes: `ProjectChangeset`、`ProjectCommit`。
- Produces:
  - `fn build_project_prompt(cs: &ProjectChangeset, language: &str) -> String`
  - `fn build_changeset_brief(cs: &ProjectChangeset) -> String` —— 周总结补扫缺失天用的紧凑素材。
  - `fn build_weekly_prompt(week_key: &str, materials: &[String], language: &str) -> String`
  - `fn parse_claude_json_output(stdout: &str) -> String` —— 取 `.result`，失败回退 trim 原文。

- [ ] **Step 1: 写失败测试**

```rust
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
```

- [ ] **Step 2: 运行确认失败**

Run: `cargo test --manifest-path src-tauri/Cargo.toml work_summary::tests::build_project_prompt 2>&1 | tail -5`
Expected: 编译失败。

- [ ] **Step 3: 写实现**

```rust
fn language_label(language: &str) -> &str {
    if language == "en" { "English" } else { "中文" }
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
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cargo test --manifest-path src-tauri/Cargo.toml work_summary::tests 2>&1 | tail -15`
Expected: 全 PASS。

- [ ] **Step 5: 提交**

```bash
git add src-tauri/src/work_summary.rs
git commit -m "feat(work-summary): prompt 构造与 claude 输出解析"
```

---

### Task 7: Markdown 拼装与文件路径

**Files:**
- Modify: `src-tauri/src/work_summary.rs`

**Interfaces:**
- Consumes: `ProjectChangeset`。
- Produces:
  - `fn assemble_daily_markdown(date: &str, generated_at: &str, sections: &[(ProjectChangeset, String)]) -> String`
  - `fn assemble_weekly_markdown(week_key: &str, generated_at: &str, body: &str) -> String`
  - `fn summaries_dir() -> std::path::PathBuf`
  - `fn daily_path(date: &str) -> std::path::PathBuf`
  - `fn weekly_path(week_key: &str) -> std::path::PathBuf`
  - `fn validate_summary_key(key: &str) -> Result<(), String>` —— 仅允许 `[0-9A-Za-z-W]`，防路径逃逸。

- [ ] **Step 1: 写失败测试**

```rust
#[test]
fn assemble_daily_markdown_has_header_and_sections() {
    let cs = ProjectChangeset {
        project: "/x/proj".into(),
        short_name: "proj".into(),
        branch: Some("main".into()),
        is_conventional: true,
        commits: vec![],
        has_uncommitted: true,
        uncommitted_material: "x".into(),
        scan_error: None,
    };
    let md = assemble_daily_markdown("2026-06-23", "2026-06-24T10:00:00Z", &[(cs, "做了登录。".into())]);
    assert!(md.contains("# 昨日工作总结 · 2026-06-23"));
    assert!(md.contains("## proj"));
    assert!(md.contains("`/x/proj`"));
    assert!(md.contains("⚠️ 有未提交变更"));
    assert!(md.contains("做了登录。"));
}

#[test]
fn validate_summary_key_rejects_traversal() {
    assert!(validate_summary_key("2026-06-23").is_ok());
    assert!(validate_summary_key("2026-W26").is_ok());
    assert!(validate_summary_key("../etc/passwd").is_err());
    assert!(validate_summary_key("a/b").is_err());
}
```

- [ ] **Step 2: 运行确认失败**

Run: `cargo test --manifest-path src-tauri/Cargo.toml work_summary::tests::assemble_daily 2>&1 | tail -5`
Expected: 编译失败。

- [ ] **Step 3: 写实现**

```rust
fn assemble_daily_markdown(
    date: &str,
    generated_at: &str,
    sections: &[(ProjectChangeset, String)],
) -> String {
    let mut md = format!("# 昨日工作总结 · {date}\n");
    md.push_str(&format!(
        "生成于 {generated_at} · {} 个项目有变更\n",
        sections.len()
    ));
    for (cs, body) in sections {
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
        md.push_str(body.trim());
        md.push('\n');
    }
    md
}

fn assemble_weekly_markdown(week_key: &str, generated_at: &str, body: &str) -> String {
    format!("# 周工作总结 · {week_key}\n生成于 {generated_at}\n\n{}\n", body.trim())
}

fn summaries_dir() -> std::path::PathBuf {
    crate::utils::get_app_data_dir().join("summaries")
}

fn daily_path(date: &str) -> std::path::PathBuf {
    summaries_dir().join("daily").join(format!("{date}.md"))
}

fn weekly_path(week_key: &str) -> std::path::PathBuf {
    summaries_dir().join("weekly").join(format!("{week_key}.md"))
}

/// 总结 key 安全校验：仅允许日期/周 key 用到的字符，杜绝路径逃逸
fn validate_summary_key(key: &str) -> Result<(), String> {
    if key.is_empty()
        || !key
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-')
    {
        return Err(format!("非法的总结 key: {key}"));
    }
    Ok(())
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cargo test --manifest-path src-tauri/Cargo.toml work_summary::tests 2>&1 | tail -20`
Expected: 全 PASS（阶段 A 全部纯函数测试绿）。

- [ ] **Step 5: 提交**

```bash
git add src-tauri/src/work_summary.rs
git commit -m "feat(work-summary): markdown 拼装与文件路径"
```

---

## 阶段 B：后端副作用（git / claude / 落盘）与命令

> 这些函数依赖真实 `git` / `claude` / 文件系统，单测覆盖有限；纯解析逻辑已在阶段 A 锁定。验证以 `cargo check` + `cargo clippy` + 后续 `make dev` 手动联调为主，符合「验证强度匹配风险」。

### Task 8: 暴露 run_git 并实现项目发现与单项目采集

**Files:**
- Modify: `src-tauri/src/project.rs:430`、`:426`（`run_git`、`git_repo_root` 改 `pub(crate)`）
- Modify: `src-tauri/src/work_summary.rs`

**Interfaces:**
- Consumes: `project::run_git`、`history::get_history`、`detect_conventional_repo`、`parse_commits`、`day_range_args`、`build_uncommitted_material`、`GIT_LOG_FORMAT`。
- Produces:
  - `fn parse_history_projects(content: &str) -> Vec<String>` —— 从 history JSONL 提取去重项目路径。
  - `fn gather_changeset(project: &str, date: &str) -> Option<ProjectChangeset>` —— 单项目采集；非 git 仓库返回 None；无任何变更也返回 None。
  - `fn gather_day_changesets(date: &str) -> Result<Vec<ProjectChangeset>, String>`。

- [ ] **Step 1: 改 project.rs 可见性**

`src-tauri/src/project.rs:430` 把 `fn run_git` 改为 `pub(crate) fn run_git`；`:426` 把 `fn git_repo_root` 改为 `pub(crate) fn git_repo_root`。

- [ ] **Step 2: 写 parse_history_projects 失败测试**

在 `work_summary.rs` 的 `mod tests` 追加：

```rust
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
```

- [ ] **Step 3: 运行确认失败**

Run: `cargo test --manifest-path src-tauri/Cargo.toml work_summary::tests::parse_history_projects 2>&1 | tail -5`
Expected: 编译失败。

- [ ] **Step 4: 写实现**

```rust
use std::collections::BTreeSet;
use std::path::Path;

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

    let status = crate::project::run_git(path, &["status", "--porcelain"]).unwrap_or_default();
    let has_uncommitted = !status.trim().is_empty();
    let uncommitted_material = if has_uncommitted {
        let diff = crate::project::run_git(path, &["diff", "HEAD"]).unwrap_or_default();
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

    let is_conventional =
        detect_conventional_repo(&commits.iter().map(|c| c.subject.clone()).collect::<Vec<_>>());

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
```

- [ ] **Step 5: 运行测试 + 编译**

Run: `cargo test --manifest-path src-tauri/Cargo.toml work_summary::tests 2>&1 | tail -10`
Expected: 全 PASS。
Run: `cargo check --manifest-path src-tauri/Cargo.toml 2>&1 | tail -5`
Expected: 通过。

- [ ] **Step 6: 提交**

```bash
git add src-tauri/src/project.rs src-tauri/src/work_summary.rs
git commit -m "feat(work-summary): 项目发现与单项目 git 采集"
```

---

### Task 9: claude CLI 调用与命令实现

**Files:**
- Modify: `src-tauri/src/work_summary.rs`

**Interfaces:**
- Consumes: 阶段 A 全部纯函数、`gather_day_changesets`、`parse_claude_json_output`、`utils::{ensure_dir_and_write_atomic, current_rfc3339_timestamp, merge_process_output, hide_command_window}`、`logging::log_command_result`。
- Produces（6 个 `#[tauri::command] #[specta::specta]`）：
  - `check_claude_cli() -> Result<ClaudeCliStatus, String>`
  - `scan_day_changes(date: String) -> Result<Vec<ProjectChangeset>, String>`
  - `summarize_day(date: String, language: String) -> Result<SummaryDocument, String>`
  - `generate_weekly_summary(date: String, language: String) -> Result<SummaryDocument, String>`
  - `list_summaries() -> Result<Vec<SummaryListItem>, String>`
  - `read_summary(kind: String, key: String) -> Result<SummaryDocument, String>`

- [ ] **Step 1: 写实现**

在 `work_summary.rs` 追加（`use std::process::{Command, Stdio};` 顶部补充；实际只需 `Command`）：

```rust
use std::process::Command;

/// 调用本机 claude CLI headless 生成总结。
fn run_claude_summary(prompt: &str) -> Result<String, String> {
    let mut command = Command::new("claude");
    command.args(["-p", prompt, "--output-format", "json"]);
    crate::utils::hide_command_window(&mut command);
    let output = command.output().map_err(|e| {
        if e.kind() == std::io::ErrorKind::NotFound {
            "未找到 claude CLI，请确认 Claude Code 已安装并在 PATH 中".to_string()
        } else {
            format!("执行 claude 失败: {e}")
        }
    })?;
    if output.status.success() {
        Ok(parse_claude_json_output(
            &String::from_utf8_lossy(&output.stdout),
        ))
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
pub fn scan_day_changes(date: String) -> Result<Vec<ProjectChangeset>, String> {
    validate_summary_key(&date)?;
    gather_day_changesets(&date)
}

#[tauri::command]
#[specta::specta]
pub fn summarize_day(date: String, language: String) -> Result<SummaryDocument, String> {
    validate_summary_key(&date)?;
    let changesets = gather_day_changesets(&date)?;
    if changesets.is_empty() {
        return Err("没有检测到该日的变更项目".to_string());
    }

    let mut sections: Vec<(ProjectChangeset, String)> = Vec::new();
    for cs in changesets {
        let body = if let Some(err) = &cs.scan_error {
            format!("> 扫描失败：{err}")
        } else {
            match run_claude_summary(&build_project_prompt(&cs, &language)) {
                Ok(text) => text,
                Err(err) => format!("> 总结失败：{err}"),
            }
        };
        sections.push((cs, body));
    }

    let generated_at = crate::utils::current_rfc3339_timestamp();
    let content = assemble_daily_markdown(&date, &generated_at, &sections);
    let path = daily_path(&date);
    crate::utils::ensure_dir_and_write_atomic(&path, &content)?;

    let result = SummaryDocument {
        kind: "daily".into(),
        key: date.clone(),
        path: path.to_string_lossy().to_string(),
        content,
    };
    crate::logging::log_command_result(
        "work_summary.summarize_day",
        &Ok::<(), String>(()),
        |_| format!("date={date} projects={}", sections.len()),
    );
    Ok(result)
}

#[tauri::command]
#[specta::specta]
pub fn generate_weekly_summary(date: String, language: String) -> Result<SummaryDocument, String> {
    validate_summary_key(&date)?;
    let week_key = iso_week_key(&date)?;
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

    let text = run_claude_summary(&build_weekly_prompt(&week_key, &materials, &language))?;
    let generated_at = crate::utils::current_rfc3339_timestamp();
    let content = assemble_weekly_markdown(&week_key, &generated_at, &text);
    let path = weekly_path(&week_key);
    crate::utils::ensure_dir_and_write_atomic(&path, &content)?;

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
    let content = std::fs::read_to_string(&path)
        .map_err(|e| format!("读取总结失败 {:?}: {e}", path))?;
    Ok(SummaryDocument {
        kind,
        key,
        path: path.to_string_lossy().to_string(),
        content,
    })
}
```

> 注：若 `logging::log_command_result` 的签名与上面不符，参照 `plugins.rs:14` 的真实用法调整（已知它接受 `(&str, &Result<T, E>, impl Fn(&T) -> String)`）。

- [ ] **Step 2: 编译 + clippy**

Run: `cargo check --manifest-path src-tauri/Cargo.toml 2>&1 | tail -5`
Expected: 通过。
Run: `cargo clippy --manifest-path src-tauri/Cargo.toml 2>&1 | tail -15`
Expected: 无 error（warning 按需消除）。

- [ ] **Step 3: 提交**

```bash
git add src-tauri/src/work_summary.rs
git commit -m "feat(work-summary): claude 调用与 6 个 Tauri command"
```

---

### Task 10: 注册命令并生成绑定

**Files:**
- Modify: `src-tauri/src/lib.rs:44`（use 区）、`:83`（`collect_commands![]`）
- Generated: `src/bindings.ts`（由 `make bindings` 重写）

**Interfaces:**
- Consumes: Task 9 的 6 个 command。
- Produces: `src/bindings.ts` 中新增 `commands.checkClaudeCli` 等 6 个，及对应类型。

- [ ] **Step 1: 加 use 导入**

`src-tauri/src/lib.rs` 在 `use widget::...;`（:74）之后加入：

```rust
use work_summary::{
    check_claude_cli, generate_weekly_summary, list_summaries, read_summary, scan_day_changes,
    summarize_day,
};
```

- [ ] **Step 2: 注册到 collect_commands**

在 `collect_commands![` 内 `led_test_mode,`（:169）之后加入：

```rust
            check_claude_cli,
            scan_day_changes,
            summarize_day,
            generate_weekly_summary,
            list_summaries,
            read_summary,
```

- [ ] **Step 3: 生成绑定并校验**

Run: `make bindings`
Expected: `src/bindings.ts` 更新，包含 `checkClaudeCli` 等。
Run: `make bindings-check`
Expected: 无漂移（exit 0）。

- [ ] **Step 4: Rust 全量测试**

Run: `make test-rust 2>&1 | tail -15`
Expected: 全 PASS。

- [ ] **Step 5: 提交**

```bash
git add src-tauri/src/lib.rs src/bindings.ts
git commit -m "feat(work-summary): 注册命令并生成 IPC 绑定"
```

---

## 阶段 C：前端

### Task 11: i18n 文案、TabType 与日期工具

**Files:**
- Modify: `src/types.ts:6`
- Modify: `src/i18n.ts`
- Create: `src/lib/work-summary-date.ts`
- Create: `src/lib/__tests__/work-summary-date.test.ts`

**Interfaces:**
- Produces: `TabType` 增加 `"worklog"`；i18n key `nav.worklog`、`worklog.title`、`worklog.summarizeYesterday`、`worklog.generateWeek`、`worklog.empty`、`worklog.cliMissing`、`worklog.noChanges`、`worklog.generating`、`worklog.daily`、`worklog.weekly`、`worklog.loadError`、`worklog.generateError`、`worklog.generated`；`localDateKey(date: Date): string`。

- [ ] **Step 1: 写日期工具失败测试**

`src/lib/__tests__/work-summary-date.test.ts`：

```ts
import { describe, expect, it } from "vitest";
import { localDateKey } from "../work-summary-date";

describe("localDateKey", () => {
  it("formats local date as YYYY-MM-DD", () => {
    const d = new Date(2026, 5, 23, 8, 30); // 本地 2026-06-23
    expect(localDateKey(d)).toBe("2026-06-23");
  });
  it("pads month and day", () => {
    const d = new Date(2026, 0, 5);
    expect(localDateKey(d)).toBe("2026-01-05");
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm exec vitest run src/lib/__tests__/work-summary-date.test.ts`
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 写日期工具实现**

`src/lib/work-summary-date.ts`：

```ts
// 本地时区下把 Date 格式化为 YYYY-MM-DD
export function localDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// 昨天的本地日期 key
export function yesterdayKey(now: Date = new Date()): string {
  const d = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  return localDateKey(d);
}
```

- [ ] **Step 4: 加 TabType 成员**

`src/types.ts:6` 的 `TabType` 联合追加 `| "worklog"`（放在 `"cheatsheet"` 前）。

- [ ] **Step 5: 加 i18n 文案**

在 `src/i18n.ts` 的 `zh` 块（nav 区与功能区）加入：

```ts
    "nav.worklog": "工作总结",
    "worklog.title": "工作总结",
    "worklog.summarizeYesterday": "总结昨日",
    "worklog.generateWeek": "生成本周",
    "worklog.empty": "还没有任何总结，点击「总结昨日」开始。",
    "worklog.cliMissing": "未检测到 claude CLI，请确认 Claude Code 已安装并在 PATH 中。",
    "worklog.noChanges": "昨日没有检测到有变更的项目。",
    "worklog.generating": "正在生成总结…",
    "worklog.daily": "日总结",
    "worklog.weekly": "周总结",
    "worklog.loadError": "加载总结列表失败",
    "worklog.generateError": "生成总结失败",
    "worklog.generated": "总结已生成",
```

在 `en` 块对应位置加入：

```ts
    "nav.worklog": "Work Summary",
    "worklog.title": "Work Summary",
    "worklog.summarizeYesterday": "Summarize Yesterday",
    "worklog.generateWeek": "Generate This Week",
    "worklog.empty": "No summaries yet. Click \"Summarize Yesterday\" to start.",
    "worklog.cliMissing": "claude CLI not found. Make sure Claude Code is installed and on PATH.",
    "worklog.noChanges": "No changed projects detected for yesterday.",
    "worklog.generating": "Generating summary…",
    "worklog.daily": "Daily",
    "worklog.weekly": "Weekly",
    "worklog.loadError": "Failed to load summaries",
    "worklog.generateError": "Failed to generate summary",
    "worklog.generated": "Summary generated",
```

- [ ] **Step 6: 运行测试 + 类型检查**

Run: `pnpm exec vitest run src/lib/__tests__/work-summary-date.test.ts`
Expected: PASS。
Run: `make lint-frontend 2>&1 | tail -5`
Expected: 无类型错误（`TabType` 已含 worklog，i18n key 齐全）。

- [ ] **Step 7: 提交**

```bash
git add src/types.ts src/i18n.ts src/lib/work-summary-date.ts src/lib/__tests__/work-summary-date.test.ts
git commit -m "feat(work-summary): 前端 i18n、TabType 与日期工具"
```

---

### Task 12: useWorkSummaries hook

**Files:**
- Create: `src/hooks/useWorkSummaries.ts`

**Interfaces:**
- Consumes: `ipc.listSummaries`、`ipc.checkClaudeCli`、`ipc.scanDayChanges`、`ipc.summarizeDay`、`ipc.generateWeeklySummary`、`ipc.readSummary`（均来自生成 bindings）；类型 `SummaryListItem`、`SummaryDocument` from `../bindings`；`yesterdayKey`、`localDateKey`。
- Produces: `useWorkSummaries(language: "zh" | "en")` 返回 `{ items, selected, loading, generating, cliAvailable, reload, select, summarizeYesterday, generateWeek }`。

- [ ] **Step 1: 写实现**

`src/hooks/useWorkSummaries.ts`：

```ts
import { useCallback, useEffect, useState } from "react";
import { showOperationError } from "@/lib/user-facing-error";
import type { SummaryDocument, SummaryListItem } from "../bindings";
import { useI18n } from "../i18n";
import { ipc } from "../ipc";
import { isTauri } from "../types";
import { localDateKey, yesterdayKey } from "../lib/work-summary-date";
import { useToast } from "./useToast";

export function useWorkSummaries(language: "zh" | "en") {
  const { t } = useI18n();
  const { showToast } = useToast();
  const [items, setItems] = useState<SummaryListItem[]>([]);
  const [selected, setSelected] = useState<SummaryDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [cliAvailable, setCliAvailable] = useState(true);

  const reload = useCallback(async () => {
    if (!isTauri()) {
      setLoading(false);
      return;
    }
    try {
      const [list, cli] = await Promise.all([ipc.listSummaries(), ipc.checkClaudeCli()]);
      setItems(list);
      setCliAvailable(cli.available);
    } catch (error) {
      showOperationError(showToast, t("worklog.loadError"), error);
    } finally {
      setLoading(false);
    }
  }, [showToast, t]);

  const select = useCallback(
    async (item: SummaryListItem) => {
      try {
        const doc = await ipc.readSummary(item.kind, item.key);
        setSelected(doc);
      } catch (error) {
        showOperationError(showToast, t("worklog.loadError"), error);
      }
    },
    [showToast, t],
  );

  const summarizeYesterday = useCallback(async () => {
    setGenerating(true);
    try {
      const date = yesterdayKey();
      const changes = await ipc.scanDayChanges(date);
      if (changes.length === 0) {
        showToast({ type: "info", message: t("worklog.noChanges") });
        return;
      }
      const doc = await ipc.summarizeDay(date, language);
      setSelected(doc);
      await reload();
      showToast({ type: "success", message: t("worklog.generated") });
    } catch (error) {
      showOperationError(showToast, t("worklog.generateError"), error);
    } finally {
      setGenerating(false);
    }
  }, [language, reload, showToast, t]);

  const generateWeek = useCallback(async () => {
    setGenerating(true);
    try {
      const doc = await ipc.generateWeeklySummary(localDateKey(new Date()), language);
      setSelected(doc);
      await reload();
      showToast({ type: "success", message: t("worklog.generated") });
    } catch (error) {
      showOperationError(showToast, t("worklog.generateError"), error);
    } finally {
      setGenerating(false);
    }
  }, [language, reload, showToast, t]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return {
    items,
    selected,
    loading,
    generating,
    cliAvailable,
    reload,
    select,
    summarizeYesterday,
    generateWeek,
  };
}
```

> 注：`showToast` 的入参形态以 `useToast` 真实签名为准（参照现有调用，如 `MemoryPage`）。若签名不同，按现有用法调整 `{ type, message }`。

- [ ] **Step 2: 类型检查**

Run: `make lint-frontend 2>&1 | tail -8`
Expected: 无错误。

- [ ] **Step 3: 提交**

```bash
git add src/hooks/useWorkSummaries.ts
git commit -m "feat(work-summary): useWorkSummaries hook"
```

---

### Task 13: WorkSummaryPage 组件

**Files:**
- Create: `src/components/WorkSummaryPage.tsx`
- Create: `src/components/__tests__/WorkSummaryPage.test.tsx`

**Interfaces:**
- Consumes: `useWorkSummaries`、`useI18n`、`useTheme`（themeType）、`MarkdownPreview`、shadcn `Button`、`PageHeader`、`EmptyState`/`empty`、`Spinner`、`useI18n().language`。
- Produces: `export default function WorkSummaryPage()`。

- [ ] **Step 1: 写失败测试**

`src/components/__tests__/WorkSummaryPage.test.tsx`：

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../hooks/useWorkSummaries", () => ({
  useWorkSummaries: () => ({
    items: [],
    selected: null,
    loading: false,
    generating: false,
    cliAvailable: true,
    reload: vi.fn(),
    select: vi.fn(),
    summarizeYesterday: vi.fn(),
    generateWeek: vi.fn(),
  }),
}));

import { I18nProvider } from "../../i18n";
import WorkSummaryPage from "../WorkSummaryPage";

describe("WorkSummaryPage", () => {
  it("renders action buttons and empty state", () => {
    render(
      <I18nProvider>
        <WorkSummaryPage />
      </I18nProvider>,
    );
    expect(screen.getByRole("button", { name: "总结昨日" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "生成本周" })).toBeInTheDocument();
    expect(screen.getByText("还没有任何总结，点击「总结昨日」开始。")).toBeInTheDocument();
  });
});
```

> 注：`I18nProvider` 默认语言以实际实现为准；若默认 en，断言改用英文文案，或在 provider 上设置 zh。先读 `src/i18n.ts:3409` 确认 Provider props。

- [ ] **Step 2: 运行确认失败**

Run: `pnpm exec vitest run src/components/__tests__/WorkSummaryPage.test.tsx`
Expected: FAIL（组件不存在）。

- [ ] **Step 3: 写实现**

`src/components/WorkSummaryPage.tsx`：

```tsx
import { CalendarRange, NotebookPen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useI18n } from "../i18n";
import { useWorkSummaries } from "../hooks/useWorkSummaries";
import { useTheme } from "./theme-provider";
import MarkdownPreview from "./claude-overview/MarkdownPreview";
import PageHeader from "./PageHeader";

function WorkSummaryPage() {
  const { t, language } = useI18n();
  const { themeType } = useTheme();
  const {
    items,
    selected,
    generating,
    cliAvailable,
    select,
    summarizeYesterday,
    generateWeek,
  } = useWorkSummaries(language === "en" ? "en" : "zh");

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title={t("worklog.title")}
        actions={
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              disabled={!cliAvailable || generating}
              onClick={() => void summarizeYesterday()}
            >
              <NotebookPen aria-hidden="true" />
              {t("worklog.summarizeYesterday")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={!cliAvailable || generating}
              onClick={() => void generateWeek()}
            >
              <CalendarRange aria-hidden="true" />
              {t("worklog.generateWeek")}
            </Button>
          </div>
        }
      />

      {!cliAvailable && (
        <p className="px-4 py-2 text-sm text-muted-foreground">{t("worklog.cliMissing")}</p>
      )}

      <div className="flex min-h-0 flex-1">
        <aside className="w-56 shrink-0 overflow-y-auto border-r border-border p-2">
          {items.length === 0 ? (
            <p className="p-3 text-sm text-muted-foreground">{t("worklog.empty")}</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {items.map((item) => (
                <li key={`${item.kind}-${item.key}`}>
                  <button
                    type="button"
                    onClick={() => void select(item)}
                    className={cn(
                      "w-full rounded-md px-3 py-2 text-left text-sm hover:bg-accent",
                      selected?.kind === item.kind &&
                        selected?.key === item.key &&
                        "bg-accent",
                    )}
                  >
                    <span className="block truncate font-medium">{item.key}</span>
                    <span className="text-xs text-muted-foreground">
                      {item.kind === "weekly" ? t("worklog.weekly") : t("worklog.daily")}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        <main className="min-w-0 flex-1 overflow-y-auto p-4">
          {generating ? (
            <p className="text-sm text-muted-foreground">{t("worklog.generating")}</p>
          ) : selected ? (
            <MarkdownPreview content={selected.content} themeType={themeType} />
          ) : (
            <p className="text-sm text-muted-foreground">{t("worklog.empty")}</p>
          )}
        </main>
      </div>
    </div>
  );
}

export default WorkSummaryPage;
```

> 注：`PageHeader` 的 props（`title`/`actions`）、`useTheme` 返回的 `themeType` 字段名以现有实现为准——实现前先读 `src/components/PageHeader.tsx` 与 `src/components/theme-provider.tsx` 对齐命名。

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm exec vitest run src/components/__tests__/WorkSummaryPage.test.tsx`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add src/components/WorkSummaryPage.tsx src/components/__tests__/WorkSummaryPage.test.tsx
git commit -m "feat(work-summary): WorkSummaryPage 组件"
```

---

### Task 14: 接入导航与页面挂载，全量验证

**Files:**
- Modify: `src/components/Sidebar.tsx:1`、`:34`
- Modify: `src/App.tsx:24`、`:285`

**Interfaces:**
- Consumes: `WorkSummaryPage`、`TabType "worklog"`、`nav.worklog`。

- [ ] **Step 1: Sidebar 加导航项**

`src/components/Sidebar.tsx` 顶部 lucide import 加入 `NotebookPen`（保持字母序）；`NAV_ITEMS`（:34）在 `projects` 之后加入：

```ts
  { key: "worklog", label: "nav.worklog", icon: NotebookPen },
```

- [ ] **Step 2: App.tsx lazy import**

`src/App.tsx:33` 之后加入：

```ts
const WorkSummaryPage = lazy(() => import("./components/WorkSummaryPage"));
```

- [ ] **Step 3: App.tsx 渲染分支**

`src/App.tsx` 在 `activeTab === "history"` 分支（:290）之前加入：

```tsx
            ) : activeTab === "worklog" ? (
              <WorkSummaryPage />
```

- [ ] **Step 4: 前端构建 + 全量前端测试**

Run: `make build-frontend 2>&1 | tail -8`
Expected: 构建成功。
Run: `make test-frontend 2>&1 | tail -10`
Expected: 全 PASS。
Run: `make lint-frontend 2>&1 | tail -5`
Expected: 无错误。

- [ ] **Step 5: 手动联调（真实 claude + git）**

Run: `make dev`
验证：侧边栏出现「工作总结」→ 点「总结昨日」→ 昨日有提交/未提交的项目生成分项目总结并渲染 → 文件落在 `~/.config/code-manager/summaries/daily/<昨日>.md`；未装 claude 时按钮禁用并显示提示。
（无法截图时说明限制。）

- [ ] **Step 6: 全量门禁**

Run: `make verify 2>&1 | tail -20`
Expected: 全绿。

- [ ] **Step 7: 提交**

```bash
git add src/components/Sidebar.tsx src/App.tsx
git commit -m "feat(work-summary): 接入侧边栏导航与页面挂载"
```

---

## Self-Review

**1. Spec coverage：**

| spec 要求 | 对应任务 |
| --- | --- |
| 新功能菜单入口 | Task 14（Sidebar + App） |
| 一键总结昨日、覆盖昨日有变更项目 | Task 8（采集）+ Task 9（summarize_day）+ Task 12/13（UI） |
| 已提交 + 未提交都纳入 | Task 8（log + status/diff） |
| conventional 简化扫描 | Task 3 + Task 6（conventional 时仅传 commit 列表） |
| 未提交需扫描代码并明确标注 | Task 5（diff 截断）+ Task 6（prompt 标注）+ Task 7（markdown ⚠️ 标注） |
| 分项目说明 | Task 6（按项目独立 prompt）+ Task 7（按项目分段） |
| 保存方便回归（Markdown 落盘 daily/weekly 子目录） | Task 7（路径）+ Task 9（写盘 + list/read） |
| 周总结混合（有日总结复用、缺失补扫） | Task 9（generate_weekly_summary） |
| 仅手动触发 | Task 13（两个按钮，无调度） |
| claude CLI preflight + 容错 | Task 9（check_claude_cli、逐项目错误隔离）+ Task 13（按钮禁用） |
| 不引入 Agent SDK | 全程仅 shell out `claude` CLI |

无缺口。

**2. Placeholder 扫描：** 无 TBD/TODO；所有代码步骤含完整代码；命令体完整。三处「注」是要求实现者按真实签名对齐（`logging::log_command_result`、`useToast`、`PageHeader`/`useTheme`/`I18nProvider`），非占位——给出了核对入口。

**3. 类型一致性：** Rust 命令名 `scan_day_changes`/`summarize_day`/`generate_weekly_summary`/`list_summaries`/`read_summary`/`check_claude_cli` ↔ 前端 `ipc.scanDayChanges`/`summarizeDay`/`generateWeeklySummary`/`listSummaries`/`readSummary`/`checkClaudeCli`（specta camelCase）一致；`ProjectChangeset`/`SummaryDocument`/`SummaryListItem`/`ClaudeCliStatus` 字段在 Task 1 定义、各任务引用一致；`GIT_LOG_FORMAT` 的 `@@C@@%x1f...` 与 `parse_commits` 的 `COMMIT_MARKER`/分隔符一致。

> 与 spec 命名差异：spec 写 `scan_yesterday_changes`，计划改为更诚实的 `scan_day_changes(date)`（扫描指定日，前端传昨日），功能等价。
