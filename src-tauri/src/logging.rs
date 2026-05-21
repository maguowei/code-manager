use once_cell::sync::Lazy;
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::fs;
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};
use tauri_plugin_opener::OpenerExt;
use time::{macros::format_description, OffsetDateTime};

const APP_LOG_FILE_NAME: &str = "ai-manager";
const DEFAULT_LOG_LIMIT: usize = 500;
const MAX_LOG_LIMIT: usize = 5_000;
const MAX_LOG_READ_BYTES: u64 = 512 * 1024;
const LOG_DATE_FORMAT: &[time::format_description::FormatItem<'_>] =
    format_description!("[year]-[month]-[day]");
const LOG_TIME_FORMAT: &[time::format_description::FormatItem<'_>] =
    format_description!("[hour]:[minute]:[second][offset_hour sign:mandatory]:[offset_minute]");

static ENV_SECRET_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(
        r"(?i)\b([A-Z0-9_]*(?:TOKEN|SECRET|PASSWORD|API_KEY|AUTH_TOKEN)[A-Z0-9_]*)=([^\s,;]+)",
    )
    .expect("日志脱敏正则应有效")
});
static GENERIC_SECRET_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r#"(?i)\b(token|api[_-]?key|secret|password)(["']?\s*[:=]\s*["']?)([^"',\s;}{]+)"#)
        .expect("日志脱敏正则应有效")
});
static AUTHORIZATION_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"(?i)\b(authorization)\s*:\s*(?:bearer\s+)?([^\s,;]+)").expect("日志脱敏正则应有效")
});

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum LogLevel {
    Error,
    Warn,
    Info,
    Debug,
    Trace,
    Unknown,
}

impl LogLevel {
    fn from_plugin_level(level: &str) -> Self {
        match level.trim().to_ascii_lowercase().as_str() {
            "error" => Self::Error,
            "warn" => Self::Warn,
            "info" => Self::Info,
            "debug" => Self::Debug,
            "trace" => Self::Trace,
            _ => Self::Unknown,
        }
    }
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LogEntry {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub timestamp: Option<String>,
    pub level: LogLevel,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub target: Option<String>,
    pub message: String,
    pub raw: String,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LogQuery {
    #[serde(default)]
    pub level: Option<LogLevel>,
    #[serde(default)]
    pub search: Option<String>,
    #[serde(default)]
    pub limit: Option<usize>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LogView {
    pub log_dir: String,
    pub entries: Vec<LogEntry>,
    pub truncated: bool,
}

pub fn install_panic_hook() {
    std::panic::set_hook(Box::new(|info| {
        log::error!(
            "event=panic status=error message={}",
            redact_sensitive_message(&info.to_string())
        );
    }));
}

pub fn app_log_file_path(log_dir: &Path) -> PathBuf {
    log_dir.join(APP_LOG_FILE_NAME).with_extension("log")
}

pub fn local_log_timestamp_parts() -> (String, String) {
    let now = OffsetDateTime::now_local().unwrap_or_else(|_| OffsetDateTime::now_utc());
    // 格式化基本不会失败（常量格式描述符），失败时降级到固定串，避免日志钩子 panic
    let date = now
        .format(LOG_DATE_FORMAT)
        .unwrap_or_else(|_| "0000-00-00".to_string());
    let time = now
        .format(LOG_TIME_FORMAT)
        .unwrap_or_else(|_| "00:00:00+00:00".to_string());
    (date, time)
}

pub fn format_log_record(
    message: &std::fmt::Arguments<'_>,
    target: &str,
    level: log::Level,
) -> String {
    let (date, time) = local_log_timestamp_parts();
    format!("[{date}][{time}][{target}][{level}] {message}")
}

pub fn log_command_result<T, F>(event: &str, result: &Result<T, String>, success_details: F)
where
    F: FnOnce(&T) -> String,
{
    match result {
        Ok(value) => {
            let details = success_details(value);
            if details.is_empty() {
                log::info!("event={event} status=ok");
            } else {
                log::info!("event={event} status=ok {details}");
            }
        }
        Err(error) => {
            log::error!(
                "event={event} status=error error={}",
                redact_sensitive_message(error)
            );
        }
    }
}

pub fn log_command_error(event: &str, error: &str) {
    log::error!(
        "event={event} status=error error={}",
        redact_sensitive_message(error)
    );
}

fn app_log_dir(app_handle: &AppHandle) -> Result<PathBuf, String> {
    app_handle
        .path()
        .app_log_dir()
        .map_err(|e| format!("获取日志目录失败: {e}"))
}

#[tauri::command]
pub fn get_app_logs(app_handle: AppHandle, query: Option<LogQuery>) -> Result<LogView, String> {
    let result = (|| {
        let log_dir = app_log_dir(&app_handle)?;
        read_log_entries_from_dir(&log_dir, &query.unwrap_or_default())
    })();
    if let Err(error) = &result {
        log_command_error("logs.read", error);
    }
    result
}

#[tauri::command]
pub fn open_logs_dir(app_handle: AppHandle) -> Result<(), String> {
    let result = (|| {
        let log_dir = app_log_dir(&app_handle)?;
        fs::create_dir_all(&log_dir).map_err(|e| format!("创建日志目录失败: {e}"))?;
        app_handle
            .opener()
            .open_path(log_dir.to_string_lossy().as_ref(), None::<&str>)
            .map_err(|e| format!("打开日志目录失败: {e}"))
    })();
    log_command_result("logs.open_dir", &result, |_| String::new());
    result
}

#[tauri::command]
pub fn clear_app_logs(app_handle: AppHandle) -> Result<LogView, String> {
    let result = (|| {
        let log_dir = app_log_dir(&app_handle)?;
        clear_log_files_in_dir(&log_dir)?;
        read_log_entries_from_dir(&log_dir, &LogQuery::default())
    })();
    if let Err(error) = &result {
        log_command_error("logs.clear", error);
    }
    result
}

pub fn parse_log_line(line: &str) -> LogEntry {
    let redacted_raw = redact_sensitive_message(line);
    let Some((date, rest)) = take_bracket_value(line) else {
        return unknown_log_entry(redacted_raw);
    };
    let Some((time, rest)) = take_bracket_value(rest) else {
        return unknown_log_entry(redacted_raw);
    };
    let Some((target, rest)) = take_bracket_value(rest) else {
        return unknown_log_entry(redacted_raw);
    };
    let Some((level, rest)) = take_bracket_value(rest) else {
        return unknown_log_entry(redacted_raw);
    };
    let message = redact_sensitive_message(rest.trim_start());

    LogEntry {
        timestamp: Some(format!("{date} {time}")),
        level: LogLevel::from_plugin_level(level),
        target: Some(target.to_string()),
        message,
        raw: redacted_raw,
    }
}

fn unknown_log_entry(raw: String) -> LogEntry {
    LogEntry {
        timestamp: None,
        level: LogLevel::Unknown,
        target: None,
        message: raw.clone(),
        raw,
    }
}

fn take_bracket_value(input: &str) -> Option<(&str, &str)> {
    let input = input.strip_prefix('[')?;
    let end = input.find(']')?;
    Some((&input[..end], &input[end + 1..]))
}

pub fn redact_sensitive_message(message: &str) -> String {
    let redacted = ENV_SECRET_RE.replace_all(message, "$1=<redacted>");
    let redacted = GENERIC_SECRET_RE.replace_all(&redacted, "$1$2<redacted>");
    AUTHORIZATION_RE
        .replace_all(&redacted, "$1: <redacted>")
        .into_owned()
}

pub fn read_log_entries_from_dir(log_dir: &Path, query: &LogQuery) -> Result<LogView, String> {
    let log_files = collect_log_files(log_dir)?;
    let mut file_truncated = false;
    let mut entries = Vec::new();
    for log_file in log_files {
        let (content, truncated) = read_recent_log_content(&log_file)?;
        file_truncated |= truncated;
        entries.extend(
            content
                .lines()
                .filter(|line| !line.trim().is_empty())
                .map(parse_log_line),
        );
    }

    let search = query
        .search
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_ascii_lowercase);
    let mut filtered: Vec<LogEntry> = entries
        .into_iter()
        .filter(|entry| query.level.is_none_or(|level| entry.level == level))
        .filter(|entry| {
            search.as_deref().is_none_or(|needle| {
                entry.message.to_ascii_lowercase().contains(needle)
                    || entry.raw.to_ascii_lowercase().contains(needle)
                    || entry
                        .target
                        .as_deref()
                        .unwrap_or_default()
                        .to_ascii_lowercase()
                        .contains(needle)
            })
        })
        .collect();

    let limit = query
        .limit
        .unwrap_or(DEFAULT_LOG_LIMIT)
        .clamp(1, MAX_LOG_LIMIT);
    let truncated = file_truncated || filtered.len() > limit;
    if filtered.len() > limit {
        let start = filtered.len() - limit;
        filtered = filtered.split_off(start);
    }
    filtered.reverse();

    Ok(LogView {
        log_dir: log_dir.to_string_lossy().to_string(),
        entries: filtered,
        truncated,
    })
}

pub fn clear_log_files_in_dir(log_dir: &Path) -> Result<usize, String> {
    let active_log_path = app_log_file_path(log_dir);
    let mut cleared_count = 0;
    for log_file in collect_log_files(log_dir)? {
        if log_file == active_log_path {
            fs::OpenOptions::new()
                .write(true)
                .truncate(true)
                .open(&log_file)
                .map_err(|e| format!("清空日志文件失败 {:?}: {e}", log_file))?;
        } else {
            fs::remove_file(&log_file)
                .map_err(|e| format!("删除日志文件失败 {:?}: {e}", log_file))?;
        }
        cleared_count += 1;
    }
    Ok(cleared_count)
}

fn collect_log_files(log_dir: &Path) -> Result<Vec<PathBuf>, String> {
    let active_log_path = app_log_file_path(log_dir);
    let entries = match fs::read_dir(log_dir) {
        Ok(entries) => entries,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(error) => return Err(format!("读取日志目录失败: {error}")),
    };

    let mut files = entries
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(|path| {
            path.file_name()
                .and_then(|name| name.to_str())
                .map(|name| {
                    path == &active_log_path
                        || (name.starts_with(&format!("{APP_LOG_FILE_NAME}_"))
                            && name.ends_with(".log"))
                })
                .unwrap_or(false)
        })
        .collect::<Vec<_>>();

    files.sort_by_key(|left| log_file_sort_key(left));
    Ok(files)
}

fn log_file_sort_key(path: &Path) -> (u8, String) {
    let name = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or_default()
        .to_string();
    let active = if name == format!("{APP_LOG_FILE_NAME}.log") {
        1
    } else {
        0
    };
    (active, name)
}

fn read_recent_log_content(path: &Path) -> Result<(String, bool), String> {
    let mut file = fs::File::open(path).map_err(|e| format!("打开日志文件失败 {:?}: {e}", path))?;
    let len = file
        .metadata()
        .map_err(|e| format!("读取日志文件元数据失败 {:?}: {e}", path))?
        .len();
    let start = len.saturating_sub(MAX_LOG_READ_BYTES);
    if start > 0 {
        file.seek(SeekFrom::Start(start))
            .map_err(|e| format!("读取日志文件失败 {:?}: {e}", path))?;
    }

    let mut bytes = Vec::new();
    file.read_to_end(&mut bytes)
        .map_err(|e| format!("读取日志文件失败 {:?}: {e}", path))?;
    let mut content = String::from_utf8_lossy(&bytes).into_owned();

    if start > 0 {
        if let Some(newline_index) = content.find('\n') {
            content = content[newline_index + 1..].to_string();
        }
    }

    Ok((content, start > 0))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::Path;

    fn temp_log_dir(name: &str) -> std::path::PathBuf {
        let root = std::env::temp_dir().join(format!(
            "ai-manager-log-test-{name}-{}",
            crate::utils::current_timestamp()
        ));
        fs::create_dir_all(&root).unwrap();
        root
    }

    #[test]
    fn app_log_file_path_uses_expected_file_name() {
        let dir = Path::new("/tmp/ai-manager-logs");

        assert_eq!(app_log_file_path(dir), dir.join("ai-manager.log"));
    }

    #[test]
    fn local_log_timestamp_includes_timezone_offset() {
        let (date, time) = local_log_timestamp_parts();
        let offset_start = time.len() - 6;

        assert_eq!(date.len(), 10);
        assert!(matches!(&time[offset_start..offset_start + 1], "+" | "-"));
        assert_eq!(&time[offset_start + 3..offset_start + 4], ":");
    }

    #[test]
    fn parse_log_line_extracts_timestamp_target_level_and_message() {
        let line = "[2026-04-29][12:34:56][ai_manager_lib::config][INFO] event=profile.upsert status=ok profile_id=profile-1";

        let entry = parse_log_line(line);

        assert_eq!(entry.timestamp.as_deref(), Some("2026-04-29 12:34:56"));
        assert_eq!(entry.target.as_deref(), Some("ai_manager_lib::config"));
        assert_eq!(entry.level, LogLevel::Info);
        assert_eq!(
            entry.message,
            "event=profile.upsert status=ok profile_id=profile-1"
        );
        assert_eq!(entry.raw, line);
    }

    #[test]
    fn parse_log_line_preserves_unknown_lines() {
        let line = "plain line without structured fields";

        let entry = parse_log_line(line);

        assert_eq!(entry.level, LogLevel::Unknown);
        assert_eq!(entry.message, line);
        assert_eq!(entry.raw, line);
    }

    #[test]
    fn redact_sensitive_message_masks_tokens_and_env_values() {
        let message = r#"ANTHROPIC_AUTH_TOKEN=sk-secret token=abc123 api_key:"json-secret" password='quoted' authorization: Bearer hidden"#;

        let redacted = redact_sensitive_message(message);

        assert!(!redacted.contains("sk-secret"));
        assert!(!redacted.contains("abc123"));
        assert!(!redacted.contains("json-secret"));
        assert!(!redacted.contains("quoted"));
        assert!(!redacted.contains("hidden"));
        assert!(redacted.contains("ANTHROPIC_AUTH_TOKEN=<redacted>"));
        assert!(redacted.contains("token=<redacted>"));
        assert!(redacted.contains(r#"api_key:"<redacted>""#));
        assert!(redacted.contains("password=<redacted>"));
        assert!(redacted.contains("authorization: <redacted>"));
    }

    #[test]
    fn read_log_entries_applies_level_search_limit_and_truncation() {
        let dir = temp_log_dir("filter");
        fs::write(
            app_log_file_path(&dir),
            [
                "[2026-04-29][12:00:00][target][INFO] event=profile.upsert status=ok",
                "[2026-04-29][12:00:01][target][WARN] event=memory.toggle status=warn",
                "[2026-04-29][12:00:02][target][ERROR] event=skill.delete status=error",
            ]
            .join("\n"),
        )
        .unwrap();

        let query = LogQuery {
            level: Some(LogLevel::Error),
            search: Some("skill".to_string()),
            limit: Some(1),
        };
        let view = read_log_entries_from_dir(&dir, &query).unwrap();

        assert_eq!(view.log_dir, dir.to_string_lossy());
        assert!(!view.truncated);
        assert_eq!(view.entries.len(), 1);
        assert_eq!(view.entries[0].level, LogLevel::Error);
        assert!(view.entries[0].message.contains("skill.delete"));
    }

    #[test]
    fn read_log_entries_returns_recent_entries_first_after_limit() {
        let dir = temp_log_dir("reverse");
        fs::write(
            app_log_file_path(&dir),
            [
                "[2026-04-29][12:00:00][target][INFO] event=first status=ok",
                "[2026-04-29][12:00:01][target][INFO] event=second status=ok",
                "[2026-04-29][12:00:02][target][INFO] event=third status=ok",
            ]
            .join("\n"),
        )
        .unwrap();

        let view = read_log_entries_from_dir(
            &dir,
            &LogQuery {
                limit: Some(2),
                ..LogQuery::default()
            },
        )
        .unwrap();

        assert!(view.truncated);
        assert_eq!(view.entries.len(), 2);
        assert!(view.entries[0].message.contains("event=third"));
        assert!(view.entries[1].message.contains("event=second"));
    }

    #[test]
    fn read_log_entries_returns_empty_view_when_log_file_is_missing() {
        let dir = temp_log_dir("missing");

        let view = read_log_entries_from_dir(&dir, &LogQuery::default()).unwrap();

        assert_eq!(view.log_dir, dir.to_string_lossy());
        assert!(view.entries.is_empty());
        assert!(!view.truncated);
    }

    #[test]
    fn clear_log_files_truncates_active_file_and_removes_rotated_files() {
        let dir = temp_log_dir("clear");
        let active_log = app_log_file_path(&dir);
        let rotated_log = dir.join("ai-manager_2026-04-29_12-00-00.log");
        let unrelated_log = dir.join("other.log");
        fs::write(&active_log, "active log").unwrap();
        fs::write(&rotated_log, "rotated log").unwrap();
        fs::write(&unrelated_log, "unrelated log").unwrap();

        let removed_count = clear_log_files_in_dir(&dir).unwrap();

        assert_eq!(removed_count, 2);
        assert!(active_log.exists());
        assert_eq!(fs::metadata(&active_log).unwrap().len(), 0);
        assert!(!rotated_log.exists());
        assert!(unrelated_log.exists());
    }
}
