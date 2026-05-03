//! Token 用量与花费统计模块
//!
//! 数据源：~/.claude/projects/<project_dir>/<sessionId>.jsonl
//!
//! 提取每条 assistant 记录的 message.usage，按价格表计算 cost，提供按
//! 日期 / 项目 / 会话 / 模型四个维度的聚合查询。message.id 全局去重。
//!
//! 价格表加载顺序：本地缓存 -> 内置兜底 -> 启动后异步从 models.dev 拉取覆盖。

use crate::utils;
use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::fs::{self, File};
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::sync::{Mutex, RwLock};
use std::time::{Instant, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Listener, Manager, State};

// ============ 数据结构 ============

/// 单模型价格（per million tokens）
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub struct ModelPrice {
    #[serde(default)]
    pub input: f64,
    #[serde(default)]
    pub output: f64,
    #[serde(default)]
    pub cache_read: f64,
    #[serde(default)]
    pub cache_write: f64,
}

/// 价格表来源
#[derive(Debug, Clone, Copy, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum PricingSource {
    #[default]
    Builtin,
    Cache,
    Network,
}

/// 完整价格表
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PricingTable {
    pub source: PricingSource,
    pub fetched_at_ms: Option<i64>,
    pub models: HashMap<String, ModelPrice>,
}

/// 单条 usage 原始记录
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UsageRecord {
    pub message_id: String,
    pub session_id: String,
    pub project_path: String,
    pub project_dir: String,
    pub timestamp_ms: i64,
    pub model: String,
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub cache_creation_5m: u64,
    pub cache_creation_1h: u64,
    pub cache_read: u64,
    pub cost_usd: f64,
    pub git_branch: Option<String>,
    pub cc_version: Option<String>,
}

impl UsageRecord {
    fn cache_creation_total(&self) -> u64 {
        self.cache_creation_5m + self.cache_creation_1h
    }
}

/// 单文件扫描索引
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileIndex {
    pub mtime_ms: i64,
    pub size: u64,
    pub last_offset: u64,
}

/// 持久化的索引文件结构
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
struct PersistedIndex {
    #[serde(default)]
    files: HashMap<String, FileIndex>,
}

/// 内存状态
#[derive(Debug, Default)]
pub struct UsageStateInner {
    pub records: Vec<UsageRecord>,
    pub seen_message_ids: HashSet<String>,
    pub file_index: HashMap<PathBuf, FileIndex>,
    pub pricing: PricingTable,
    pub unknown_models: HashSet<String>,
    pub last_scan_ms: Option<i64>,
}

pub struct UsageState {
    pub inner: RwLock<UsageStateInner>,
}

impl UsageState {
    pub fn new() -> Self {
        Self {
            inner: RwLock::new(UsageStateInner::default()),
        }
    }
}

impl Default for UsageState {
    fn default() -> Self {
        Self::new()
    }
}

/// 互斥锁：避免多个扫描同时跑
pub static USAGE_SCAN_LOCK: Lazy<Mutex<()>> = Lazy::new(|| Mutex::new(()));

// ============ Filter / 视图 ============

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UsageFilter {
    #[serde(default)]
    pub start_date: Option<String>,
    #[serde(default)]
    pub end_date: Option<String>,
    #[serde(default)]
    pub project_path: Option<String>,
    #[serde(default)]
    pub session_id: Option<String>,
    #[serde(default)]
    pub model: Option<String>,
    #[serde(default)]
    pub include_unknown_models: Option<bool>,
}

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelUsageStat {
    pub model: String,
    pub messages: u64,
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub cache_creation_tokens: u64,
    pub cache_read_tokens: u64,
    pub cost: f64,
}

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DailyUsage {
    pub date: String,
    pub messages: u64,
    pub sessions: u64,
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub cache_creation_tokens: u64,
    pub cache_read_tokens: u64,
    pub cost: f64,
    pub by_model: Vec<ModelUsageStat>,
}

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectUsage {
    pub project_path: String,
    pub project_dir: String,
    pub sessions: u64,
    pub messages: u64,
    pub last_active_ms: i64,
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub cache_creation_tokens: u64,
    pub cache_read_tokens: u64,
    pub cost: f64,
    pub by_model: Vec<ModelUsageStat>,
}

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionUsage {
    pub session_id: String,
    pub project_path: String,
    pub project_dir: String,
    pub started_at_ms: i64,
    pub last_active_ms: i64,
    pub messages: u64,
    pub models: Vec<String>,
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub cache_creation_tokens: u64,
    pub cache_read_tokens: u64,
    pub cost: f64,
}

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectOption {
    pub project_path: String,
    pub project_dir: String,
}

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UsageSummary {
    pub total_messages: u64,
    pub total_sessions: u64,
    pub total_projects: u64,
    pub total_input: u64,
    pub total_output: u64,
    pub total_cache_creation: u64,
    pub total_cache_read: u64,
    pub total_cost: f64,
    pub last_scan_ms: Option<i64>,
    pub pricing: PricingTable,
    pub unknown_models: Vec<String>,
    pub all_projects: Vec<ProjectOption>,
    pub all_models: Vec<String>,
}

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionUsageDetail {
    pub session: SessionUsage,
    pub messages: Vec<UsageRecord>,
}

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanResult {
    pub files_scanned: u64,
    pub new_records: u64,
    pub elapsed_ms: u64,
}

// ============ 路径与价格加载 ============

const BUILTIN_PRICING: &str = include_str!("../resources/model-pricing.json");
const MODELS_DEV_URL: &str = "https://models.dev/api.json";

#[derive(Debug, Default, Deserialize)]
struct PricingFile {
    #[serde(default)]
    models: HashMap<String, ModelPrice>,
    #[serde(default, rename = "fetchedAtMs")]
    fetched_at_ms: Option<i64>,
}

fn pricing_cache_path() -> PathBuf {
    utils::get_app_data_dir().join("model-pricing.json")
}

fn index_cache_path() -> PathBuf {
    utils::get_app_data_dir().join("usage_index.json")
}

fn projects_root() -> PathBuf {
    utils::home_dir_or_fallback().join(".claude").join("projects")
}

fn load_builtin_pricing() -> PricingTable {
    let parsed: PricingFile = serde_json::from_str(BUILTIN_PRICING).unwrap_or_default();
    PricingTable {
        source: PricingSource::Builtin,
        fetched_at_ms: None,
        models: parsed.models,
    }
}

fn load_pricing() -> PricingTable {
    let cache_path = pricing_cache_path();
    if cache_path.exists() {
        if let Ok(content) = fs::read_to_string(&cache_path) {
            if let Ok(parsed) = serde_json::from_str::<PricingFile>(&content) {
                if !parsed.models.is_empty() {
                    return PricingTable {
                        source: PricingSource::Cache,
                        fetched_at_ms: parsed.fetched_at_ms,
                        models: parsed.models,
                    };
                }
            }
        }
    }
    load_builtin_pricing()
}

fn save_pricing_cache(table: &PricingTable) -> Result<(), String> {
    let path = pricing_cache_path();
    let content = serde_json::to_string_pretty(table).map_err(|e| e.to_string())?;
    utils::ensure_dir_and_write_atomic(&path, &content)
}

fn load_index() -> HashMap<PathBuf, FileIndex> {
    let path = index_cache_path();
    let persisted: PersistedIndex = utils::read_json_file(&path);
    persisted
        .files
        .into_iter()
        .map(|(k, v)| (PathBuf::from(k), v))
        .collect()
}

fn save_index(index: &HashMap<PathBuf, FileIndex>) -> Result<(), String> {
    let persisted = PersistedIndex {
        files: index
            .iter()
            .map(|(k, v)| (k.to_string_lossy().to_string(), v.clone()))
            .collect(),
    };
    let path = index_cache_path();
    let content = serde_json::to_string(&persisted).map_err(|e| e.to_string())?;
    utils::ensure_dir_and_write_atomic(&path, &content)
}

// ============ 模型价格匹配与成本计算 ============

#[derive(Debug, Default, Clone)]
pub struct RawUsage {
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub cache_creation_5m: u64,
    pub cache_creation_1h: u64,
    pub cache_read: u64,
}

/// 根据 model id 查价格，未命中时按子串模糊匹配（opus / sonnet / haiku）
pub fn match_model_price(model: &str, table: &PricingTable) -> Option<ModelPrice> {
    if let Some(p) = table.models.get(model) {
        return Some(p.clone());
    }
    let lower = model.to_lowercase();
    for (k, v) in &table.models {
        if lower == k.to_lowercase() {
            return Some(v.clone());
        }
    }
    let category = if lower.contains("opus") {
        "opus"
    } else if lower.contains("sonnet") {
        "sonnet"
    } else if lower.contains("haiku") {
        "haiku"
    } else {
        return None;
    };
    let mut candidate: Option<&ModelPrice> = None;
    for (k, v) in &table.models {
        if k.to_lowercase().contains(category) {
            match &candidate {
                None => candidate = Some(v),
                Some(cur) if v.input < cur.input => candidate = Some(v),
                _ => {}
            }
        }
    }
    candidate.cloned()
}

pub fn compute_cost(model: &str, table: &PricingTable, usage: &RawUsage) -> f64 {
    let Some(price) = match_model_price(model, table) else {
        return 0.0;
    };
    let total_cache_creation = usage.cache_creation_5m + usage.cache_creation_1h;
    (usage.input_tokens as f64 * price.input
        + usage.output_tokens as f64 * price.output
        + total_cache_creation as f64 * price.cache_write
        + usage.cache_read as f64 * price.cache_read)
        / 1_000_000.0
}

// ============ 时间工具 ============

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// 缓存的本地时区偏移（首次访问时尝试获取，失败回退 UTC）
fn local_offset() -> time::UtcOffset {
    static OFFSET: Lazy<time::UtcOffset> = Lazy::new(|| {
        time::UtcOffset::current_local_offset().unwrap_or(time::UtcOffset::UTC)
    });
    *OFFSET
}

/// 解析 ISO 8601 / RFC3339 时间戳为毫秒
fn parse_iso8601_ms(s: &str) -> Option<i64> {
    if s.is_empty() {
        return None;
    }
    use time::format_description::well_known::Rfc3339;
    use time::OffsetDateTime;
    OffsetDateTime::parse(s, &Rfc3339).ok().map(|t| {
        let secs = t.unix_timestamp();
        let nanos = t.nanosecond() as i64;
        secs * 1000 + nanos / 1_000_000
    })
}

/// timestamp_ms -> "YYYY-MM-DD"（使用本地时区）
fn ms_to_local_date(ms: i64) -> String {
    use time::OffsetDateTime;
    let secs = ms / 1000;
    let nanos = ((ms % 1000) * 1_000_000) as u32;
    let dt = match OffsetDateTime::from_unix_timestamp(secs) {
        Ok(t) => t.replace_nanosecond(nanos).unwrap_or(t).to_offset(local_offset()),
        Err(_) => return String::new(),
    };
    format!("{:04}-{:02}-{:02}", dt.year(), dt.month() as u8, dt.day())
}

fn parse_local_date_to_ms(s: &str, end_of_day: bool) -> Option<i64> {
    use time::macros::format_description;
    use time::{Date, OffsetDateTime, Time};
    let fmt = format_description!("[year]-[month]-[day]");
    let date = Date::parse(s, fmt).ok()?;
    let time = if end_of_day {
        Time::from_hms_milli(23, 59, 59, 999).ok()?
    } else {
        Time::from_hms(0, 0, 0).ok()?
    };
    let dt = OffsetDateTime::new_in_offset(date, time, local_offset());
    let secs = dt.unix_timestamp();
    let nanos = dt.nanosecond() as i64;
    Some(secs * 1000 + nanos / 1_000_000)
}

// ============ JSONL 解析 ============

/// 解析单行 jsonl，仅当 type=assistant 且含 message.usage 时返回 Some
fn parse_jsonl_line(
    line: &str,
    project_dir_name: &str,
    pricing: &PricingTable,
    unknown_models: &mut HashSet<String>,
) -> Option<UsageRecord> {
    let v: serde_json::Value = serde_json::from_str(line).ok()?;
    if v.get("type").and_then(|x| x.as_str()) != Some("assistant") {
        return None;
    }
    let msg = v.get("message")?;
    let usage_v = msg.get("usage")?;

    let message_id = msg
        .get("id")
        .and_then(|x| x.as_str())
        .unwrap_or("")
        .to_string();
    let session_id = v
        .get("sessionId")
        .and_then(|x| x.as_str())
        .unwrap_or("")
        .to_string();
    let cwd = v
        .get("cwd")
        .and_then(|x| x.as_str())
        .unwrap_or("")
        .to_string();
    let model = msg
        .get("model")
        .and_then(|x| x.as_str())
        .unwrap_or("unknown")
        .to_string();
    let timestamp_str = v.get("timestamp").and_then(|x| x.as_str()).unwrap_or("");
    let timestamp_ms = parse_iso8601_ms(timestamp_str).unwrap_or(0);
    let git_branch = v
        .get("gitBranch")
        .and_then(|x| x.as_str())
        .map(String::from)
        .filter(|s| !s.is_empty());
    let cc_version = v
        .get("version")
        .and_then(|x| x.as_str())
        .map(String::from)
        .filter(|s| !s.is_empty());

    // 优先使用 cache_creation 子对象细分；回退到 cache_creation_input_tokens
    let (cache_5m, cache_1h) = if let Some(cc) = usage_v.get("cache_creation") {
        (
            cc.get("ephemeral_5m_input_tokens")
                .and_then(|x| x.as_u64())
                .unwrap_or(0),
            cc.get("ephemeral_1h_input_tokens")
                .and_then(|x| x.as_u64())
                .unwrap_or(0),
        )
    } else {
        (
            usage_v
                .get("cache_creation_input_tokens")
                .and_then(|x| x.as_u64())
                .unwrap_or(0),
            0,
        )
    };

    let raw = RawUsage {
        input_tokens: usage_v
            .get("input_tokens")
            .and_then(|x| x.as_u64())
            .unwrap_or(0),
        output_tokens: usage_v
            .get("output_tokens")
            .and_then(|x| x.as_u64())
            .unwrap_or(0),
        cache_read: usage_v
            .get("cache_read_input_tokens")
            .and_then(|x| x.as_u64())
            .unwrap_or(0),
        cache_creation_5m: cache_5m,
        cache_creation_1h: cache_1h,
    };

    if raw.input_tokens == 0
        && raw.output_tokens == 0
        && raw.cache_read == 0
        && raw.cache_creation_5m == 0
        && raw.cache_creation_1h == 0
    {
        return None;
    }

    if match_model_price(&model, pricing).is_none() {
        unknown_models.insert(model.clone());
    }

    let cost_usd = compute_cost(&model, pricing, &raw);

    Some(UsageRecord {
        message_id,
        session_id,
        project_path: cwd,
        project_dir: project_dir_name.to_string(),
        timestamp_ms,
        model,
        input_tokens: raw.input_tokens,
        output_tokens: raw.output_tokens,
        cache_creation_5m: raw.cache_creation_5m,
        cache_creation_1h: raw.cache_creation_1h,
        cache_read: raw.cache_read,
        cost_usd,
        git_branch,
        cc_version,
    })
}

// ============ 扫描 ============

/// 全量扫描；尊重已持久化的 file_index，未变文件跳过；full_rescan=true 强制清空内存与索引
pub fn scan_all(state: &UsageState, full_rescan: bool) -> Result<ScanResult, String> {
    let _lock = USAGE_SCAN_LOCK.lock().map_err(|e| e.to_string())?;
    let started = Instant::now();

    let projects_dir = projects_root();
    if !projects_dir.exists() {
        log::info!("event=usage.scan status=skip reason=projects_dir_missing");
        if let Ok(mut inner) = state.inner.write() {
            inner.last_scan_ms = Some(now_ms());
        }
        return Ok(ScanResult::default());
    }

    let pricing = state
        .inner
        .read()
        .map_err(|e| e.to_string())?
        .pricing
        .clone();

    let persisted_index = if full_rescan {
        HashMap::new()
    } else {
        state
            .inner
            .read()
            .map(|s| s.file_index.clone())
            .unwrap_or_default()
    };
    let persisted_index = if persisted_index.is_empty() && !full_rescan {
        load_index()
    } else {
        persisted_index
    };

    let mut new_records: Vec<UsageRecord> = Vec::new();
    let mut new_index: HashMap<PathBuf, FileIndex> = HashMap::new();
    let mut new_unknown: HashSet<String> = HashSet::new();
    let mut local_seen: HashSet<String> = if full_rescan {
        HashSet::new()
    } else {
        state
            .inner
            .read()
            .map(|s| s.seen_message_ids.clone())
            .unwrap_or_default()
    };
    let mut files_count: u64 = 0;

    let entries = match fs::read_dir(&projects_dir) {
        Ok(e) => e,
        Err(err) => {
            log::warn!("event=usage.scan status=warn reason=read_projects_failed err={err}");
            return Ok(ScanResult::default());
        }
    };

    for entry in entries.flatten() {
        let path = entry.path();
        let metadata = match fs::symlink_metadata(&path) {
            Ok(m) => m,
            Err(_) => continue,
        };
        if !metadata.is_dir() || metadata.file_type().is_symlink() {
            continue;
        }
        let dir_name = match path.file_name().and_then(|s| s.to_str()) {
            Some(s) => s.to_string(),
            None => continue,
        };

        let inner_entries = match fs::read_dir(&path) {
            Ok(e) => e,
            Err(_) => continue,
        };
        for ie in inner_entries.flatten() {
            let p = ie.path();
            let im = match fs::symlink_metadata(&p) {
                Ok(m) => m,
                Err(_) => continue,
            };
            if !im.is_file() || im.file_type().is_symlink() {
                continue;
            }
            let Some(ext) = p.extension().and_then(|s| s.to_str()) else {
                continue;
            };
            if ext != "jsonl" {
                continue;
            }

            files_count += 1;

            let mtime = im
                .modified()
                .ok()
                .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                .map(|d| d.as_millis() as i64)
                .unwrap_or(0);
            let size = im.len();
            let prev = persisted_index.get(&p).cloned();

            let start_offset = match &prev {
                Some(idx) if idx.mtime_ms == mtime && idx.size == size => {
                    new_index.insert(p.clone(), idx.clone());
                    continue;
                }
                Some(idx) if idx.size <= size && idx.mtime_ms <= mtime => idx.last_offset,
                _ => 0,
            };

            match scan_file_from_offset(
                &p,
                start_offset,
                &dir_name,
                &pricing,
                &mut new_unknown,
                &mut local_seen,
                &mut new_records,
            ) {
                Ok(end_offset) => {
                    new_index.insert(
                        p.clone(),
                        FileIndex {
                            mtime_ms: mtime,
                            size,
                            last_offset: end_offset,
                        },
                    );
                }
                Err(err) => {
                    log::warn!(
                        "event=usage.scan.file status=warn file={} err={}",
                        p.display(),
                        err
                    );
                }
            }
        }
    }

    let new_records_count = new_records.len() as u64;

    {
        let mut inner = state.inner.write().map_err(|e| e.to_string())?;
        if full_rescan {
            inner.records.clear();
            inner.seen_message_ids.clear();
            inner.unknown_models.clear();
        }
        for r in new_records {
            if !r.message_id.is_empty() && !inner.seen_message_ids.insert(r.message_id.clone()) {
                continue;
            }
            inner.records.push(r);
        }
        for m in new_unknown {
            inner.unknown_models.insert(m);
        }
        inner.file_index = new_index.clone();
        inner.last_scan_ms = Some(now_ms());
    }

    let _ = save_index(&new_index);

    let elapsed_ms = started.elapsed().as_millis() as u64;
    let total_records = state
        .inner
        .read()
        .map(|s| s.records.len())
        .unwrap_or_default();
    log::info!(
        "event=usage.scan status=ok files={files_count} new_records={new_records_count} \
         total_records={total_records} elapsed_ms={elapsed_ms}"
    );

    Ok(ScanResult {
        files_scanned: files_count,
        new_records: new_records_count,
        elapsed_ms,
    })
}

/// 从指定 offset 处开始扫描文件，返回扫描结束时的新 offset
fn scan_file_from_offset(
    path: &Path,
    start_offset: u64,
    project_dir_name: &str,
    pricing: &PricingTable,
    unknown_models: &mut HashSet<String>,
    seen: &mut HashSet<String>,
    out: &mut Vec<UsageRecord>,
) -> Result<u64, String> {
    let mut file = File::open(path).map_err(|e| e.to_string())?;
    let total_size = file.metadata().map_err(|e| e.to_string())?.len();
    if start_offset >= total_size {
        return Ok(total_size);
    }
    file.seek(SeekFrom::Start(start_offset))
        .map_err(|e| e.to_string())?;

    let mut buf = String::new();
    file.read_to_string(&mut buf).map_err(|e| e.to_string())?;

    // 末尾不完整行回退到上一个 '\n'
    let mut effective_end = buf.len();
    let trailing_incomplete = !buf.ends_with('\n') && !buf.is_empty();
    if trailing_incomplete {
        if let Some(last_newline) = buf.rfind('\n') {
            effective_end = last_newline + 1;
        } else {
            return Ok(start_offset);
        }
    }
    let usable = &buf[..effective_end];

    for line in usable.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        if let Some(record) = parse_jsonl_line(trimmed, project_dir_name, pricing, unknown_models) {
            if record.message_id.is_empty() || seen.insert(record.message_id.clone()) {
                out.push(record);
            }
        }
    }

    Ok(start_offset + effective_end as u64)
}

/// 处理 watcher 触发的增量扫描
pub fn handle_files_changed(state: &UsageState, files: Vec<PathBuf>) -> Result<u64, String> {
    let _lock = USAGE_SCAN_LOCK.lock().map_err(|e| e.to_string())?;
    let pricing = state
        .inner
        .read()
        .map_err(|e| e.to_string())?
        .pricing
        .clone();

    let mut new_records: Vec<UsageRecord> = Vec::new();
    let mut updated_index: HashMap<PathBuf, FileIndex> = HashMap::new();
    let mut removed: Vec<PathBuf> = Vec::new();
    let mut unknown_local: HashSet<String> = HashSet::new();
    let mut local_seen: HashSet<String> = state
        .inner
        .read()
        .map(|s| s.seen_message_ids.clone())
        .unwrap_or_default();

    for path in files {
        let metadata = match fs::symlink_metadata(&path) {
            Ok(m) => m,
            Err(_) => {
                removed.push(path);
                continue;
            }
        };
        if !metadata.is_file() || metadata.file_type().is_symlink() {
            continue;
        }
        let project_dir_name = path
            .parent()
            .and_then(|p| p.file_name())
            .and_then(|s| s.to_str())
            .unwrap_or("")
            .to_string();
        let mtime = metadata
            .modified()
            .ok()
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as i64)
            .unwrap_or(0);
        let size = metadata.len();

        let start_offset = {
            let inner = state.inner.read().map_err(|e| e.to_string())?;
            match inner.file_index.get(&path) {
                Some(idx) if idx.size <= size && idx.mtime_ms <= mtime => idx.last_offset,
                _ => 0,
            }
        };

        match scan_file_from_offset(
            &path,
            start_offset,
            &project_dir_name,
            &pricing,
            &mut unknown_local,
            &mut local_seen,
            &mut new_records,
        ) {
            Ok(end_offset) => {
                updated_index.insert(
                    path,
                    FileIndex {
                        mtime_ms: mtime,
                        size,
                        last_offset: end_offset,
                    },
                );
            }
            Err(err) => {
                log::warn!("event=usage.incremental.file status=warn err={err}");
            }
        }
    }

    let new_count = new_records.len() as u64;
    {
        let mut inner = state.inner.write().map_err(|e| e.to_string())?;
        for r in new_records {
            if !r.message_id.is_empty() && !inner.seen_message_ids.insert(r.message_id.clone()) {
                continue;
            }
            inner.records.push(r);
        }
        for (k, v) in &updated_index {
            inner.file_index.insert(k.clone(), v.clone());
        }
        for k in &removed {
            inner.file_index.remove(k);
        }
        for m in unknown_local {
            inner.unknown_models.insert(m);
        }
    }

    if new_count > 0 || !removed.is_empty() {
        let snapshot = state
            .inner
            .read()
            .map(|s| s.file_index.clone())
            .unwrap_or_default();
        let _ = save_index(&snapshot);
    }

    if new_count > 0 {
        log::info!("event=usage.incremental status=ok new_records={new_count}");
    }
    Ok(new_count)
}

// ============ 价格刷新 ============

#[derive(Debug, Deserialize)]
struct ModelsDevApi {
    #[serde(flatten)]
    providers: HashMap<String, ProviderEntry>,
}

#[derive(Debug, Deserialize)]
struct ProviderEntry {
    #[serde(default)]
    id: Option<String>,
    #[serde(default)]
    models: HashMap<String, ModelEntry>,
}

#[derive(Debug, Deserialize)]
struct ModelEntry {
    #[serde(default)]
    cost: Option<ModelCostEntry>,
}

#[derive(Debug, Deserialize)]
struct ModelCostEntry {
    #[serde(default)]
    input: Option<f64>,
    #[serde(default)]
    output: Option<f64>,
    #[serde(default)]
    cache_read: Option<f64>,
    #[serde(default)]
    cache_write: Option<f64>,
}

async fn fetch_pricing_from_network() -> Result<PricingTable, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| format!("client build error: {e}"))?;
    let resp = client
        .get(MODELS_DEV_URL)
        .send()
        .await
        .map_err(|e| format!("network error: {e}"))?;
    let api: ModelsDevApi = resp
        .json()
        .await
        .map_err(|e| format!("parse error: {e}"))?;

    let mut models: HashMap<String, ModelPrice> = HashMap::new();
    for (key, prov) in &api.providers {
        let pid = prov.id.as_deref().unwrap_or(key);
        if !pid.eq_ignore_ascii_case("anthropic") {
            continue;
        }
        for (mid, m) in &prov.models {
            if let Some(c) = &m.cost {
                let input = c.input.unwrap_or(0.0);
                let output = c.output.unwrap_or(0.0);
                models.insert(
                    mid.clone(),
                    ModelPrice {
                        input,
                        output,
                        cache_read: c.cache_read.unwrap_or(input * 0.1),
                        cache_write: c.cache_write.unwrap_or(input * 1.25),
                    },
                );
            }
        }
    }

    if models.is_empty() {
        return Err("no anthropic models found in api response".into());
    }

    Ok(PricingTable {
        source: PricingSource::Network,
        fetched_at_ms: Some(now_ms()),
        models,
    })
}

/// 应用新价格表：保存缓存、写入内存、重算所有 records 的 cost
fn apply_new_pricing(state: &UsageState, table: PricingTable) -> Result<PricingTable, String> {
    save_pricing_cache(&table)?;
    let mut inner = state.inner.write().map_err(|e| e.to_string())?;
    inner.pricing = table.clone();
    let pricing = inner.pricing.clone();
    let mut unknown_local: HashSet<String> = HashSet::new();
    for r in inner.records.iter_mut() {
        let raw = RawUsage {
            input_tokens: r.input_tokens,
            output_tokens: r.output_tokens,
            cache_creation_5m: r.cache_creation_5m,
            cache_creation_1h: r.cache_creation_1h,
            cache_read: r.cache_read,
        };
        r.cost_usd = compute_cost(&r.model, &pricing, &raw);
        if match_model_price(&r.model, &pricing).is_none() {
            unknown_local.insert(r.model.clone());
        }
    }
    inner.unknown_models = unknown_local;
    Ok(table)
}

// ============ 聚合 ============

fn apply_filter<'a>(
    records: &'a [UsageRecord],
    filter: &UsageFilter,
    pricing: &PricingTable,
) -> Vec<&'a UsageRecord> {
    let start_ms = filter
        .start_date
        .as_deref()
        .and_then(|s| parse_local_date_to_ms(s, false));
    let end_ms = filter
        .end_date
        .as_deref()
        .and_then(|s| parse_local_date_to_ms(s, true));
    let include_unknown = filter.include_unknown_models.unwrap_or(true);

    records
        .iter()
        .filter(|r| {
            if let Some(s) = start_ms {
                if r.timestamp_ms < s {
                    return false;
                }
            }
            if let Some(e) = end_ms {
                if r.timestamp_ms > e {
                    return false;
                }
            }
            if let Some(p) = filter.project_path.as_ref() {
                if !p.is_empty() && r.project_path != *p && r.project_dir != *p {
                    return false;
                }
            }
            if let Some(s) = filter.session_id.as_ref() {
                if !s.is_empty() && r.session_id != *s {
                    return false;
                }
            }
            if let Some(m) = filter.model.as_ref() {
                if !m.is_empty() && r.model != *m {
                    return false;
                }
            }
            if !include_unknown && match_model_price(&r.model, pricing).is_none() {
                return false;
            }
            true
        })
        .collect()
}

fn aggregate_model_stats(records: &[&UsageRecord]) -> Vec<ModelUsageStat> {
    let mut by_model: HashMap<String, ModelUsageStat> = HashMap::new();
    for r in records {
        let entry = by_model.entry(r.model.clone()).or_insert(ModelUsageStat {
            model: r.model.clone(),
            ..Default::default()
        });
        entry.messages += 1;
        entry.input_tokens += r.input_tokens;
        entry.output_tokens += r.output_tokens;
        entry.cache_creation_tokens += r.cache_creation_total();
        entry.cache_read_tokens += r.cache_read;
        entry.cost += r.cost_usd;
    }
    let mut list: Vec<_> = by_model.into_values().collect();
    list.sort_by(|a, b| b.cost.partial_cmp(&a.cost).unwrap_or(std::cmp::Ordering::Equal));
    list
}

// ============ Tauri commands ============

#[tauri::command]
pub fn get_usage_summary(
    filter: UsageFilter,
    state: State<'_, UsageState>,
) -> Result<UsageSummary, String> {
    let inner = state.inner.read().map_err(|e| e.to_string())?;
    let filtered = apply_filter(&inner.records, &filter, &inner.pricing);

    let mut sessions: HashSet<&str> = HashSet::new();
    let mut projects: HashSet<&str> = HashSet::new();
    let mut total = UsageSummary {
        last_scan_ms: inner.last_scan_ms,
        pricing: inner.pricing.clone(),
        unknown_models: inner.unknown_models.iter().cloned().collect(),
        ..Default::default()
    };
    total.unknown_models.sort();

    for r in &filtered {
        total.total_messages += 1;
        total.total_input += r.input_tokens;
        total.total_output += r.output_tokens;
        total.total_cache_creation += r.cache_creation_total();
        total.total_cache_read += r.cache_read;
        total.total_cost += r.cost_usd;
        sessions.insert(r.session_id.as_str());
        projects.insert(r.project_path.as_str());
    }
    total.total_sessions = sessions.len() as u64;
    total.total_projects = projects.len() as u64;

    let mut project_set: HashMap<String, String> = HashMap::new();
    let mut model_set: HashSet<String> = HashSet::new();
    for r in &inner.records {
        project_set
            .entry(r.project_path.clone())
            .or_insert_with(|| r.project_dir.clone());
        model_set.insert(r.model.clone());
    }
    let mut all_projects: Vec<ProjectOption> = project_set
        .into_iter()
        .map(|(path, dir)| ProjectOption {
            project_path: path,
            project_dir: dir,
        })
        .collect();
    all_projects.sort_by(|a, b| a.project_path.cmp(&b.project_path));
    let mut all_models: Vec<String> = model_set.into_iter().collect();
    all_models.sort();
    total.all_projects = all_projects;
    total.all_models = all_models;
    Ok(total)
}

#[tauri::command]
pub fn get_usage_daily(
    filter: UsageFilter,
    state: State<'_, UsageState>,
) -> Result<Vec<DailyUsage>, String> {
    let inner = state.inner.read().map_err(|e| e.to_string())?;
    let filtered = apply_filter(&inner.records, &filter, &inner.pricing);

    let mut buckets: HashMap<String, Vec<&UsageRecord>> = HashMap::new();
    for r in filtered {
        let date = ms_to_local_date(r.timestamp_ms);
        if date.is_empty() {
            continue;
        }
        buckets.entry(date).or_default().push(r);
    }

    let mut list: Vec<DailyUsage> = buckets
        .into_iter()
        .map(|(date, items)| {
            let mut s = DailyUsage {
                date,
                ..Default::default()
            };
            let mut sessions: HashSet<&str> = HashSet::new();
            for r in &items {
                s.messages += 1;
                s.input_tokens += r.input_tokens;
                s.output_tokens += r.output_tokens;
                s.cache_creation_tokens += r.cache_creation_total();
                s.cache_read_tokens += r.cache_read;
                s.cost += r.cost_usd;
                sessions.insert(r.session_id.as_str());
            }
            s.sessions = sessions.len() as u64;
            s.by_model = aggregate_model_stats(&items);
            s
        })
        .collect();
    list.sort_by(|a, b| a.date.cmp(&b.date));
    Ok(list)
}

#[tauri::command]
pub fn get_usage_by_project(
    filter: UsageFilter,
    state: State<'_, UsageState>,
) -> Result<Vec<ProjectUsage>, String> {
    let inner = state.inner.read().map_err(|e| e.to_string())?;
    let filtered = apply_filter(&inner.records, &filter, &inner.pricing);

    let mut buckets: HashMap<String, Vec<&UsageRecord>> = HashMap::new();
    for r in filtered {
        buckets.entry(r.project_path.clone()).or_default().push(r);
    }

    let mut list: Vec<ProjectUsage> = buckets
        .into_iter()
        .map(|(path, items)| {
            let dir = items
                .first()
                .map(|r| r.project_dir.clone())
                .unwrap_or_default();
            let mut s = ProjectUsage {
                project_path: path,
                project_dir: dir,
                ..Default::default()
            };
            let mut sessions: HashSet<&str> = HashSet::new();
            for r in &items {
                s.messages += 1;
                s.input_tokens += r.input_tokens;
                s.output_tokens += r.output_tokens;
                s.cache_creation_tokens += r.cache_creation_total();
                s.cache_read_tokens += r.cache_read;
                s.cost += r.cost_usd;
                if r.timestamp_ms > s.last_active_ms {
                    s.last_active_ms = r.timestamp_ms;
                }
                sessions.insert(r.session_id.as_str());
            }
            s.sessions = sessions.len() as u64;
            s.by_model = aggregate_model_stats(&items);
            s
        })
        .collect();
    list.sort_by(|a, b| b.cost.partial_cmp(&a.cost).unwrap_or(std::cmp::Ordering::Equal));
    Ok(list)
}

#[tauri::command]
pub fn get_usage_by_session(
    filter: UsageFilter,
    state: State<'_, UsageState>,
) -> Result<Vec<SessionUsage>, String> {
    let inner = state.inner.read().map_err(|e| e.to_string())?;
    let filtered = apply_filter(&inner.records, &filter, &inner.pricing);

    let mut buckets: HashMap<String, Vec<&UsageRecord>> = HashMap::new();
    for r in filtered {
        buckets.entry(r.session_id.clone()).or_default().push(r);
    }

    let mut list: Vec<SessionUsage> = buckets
        .into_iter()
        .map(|(sid, items)| {
            let mut s = SessionUsage {
                session_id: sid,
                project_path: items
                    .first()
                    .map(|r| r.project_path.clone())
                    .unwrap_or_default(),
                project_dir: items
                    .first()
                    .map(|r| r.project_dir.clone())
                    .unwrap_or_default(),
                started_at_ms: i64::MAX,
                last_active_ms: 0,
                ..Default::default()
            };
            let mut models: HashSet<String> = HashSet::new();
            for r in &items {
                s.messages += 1;
                s.input_tokens += r.input_tokens;
                s.output_tokens += r.output_tokens;
                s.cache_creation_tokens += r.cache_creation_total();
                s.cache_read_tokens += r.cache_read;
                s.cost += r.cost_usd;
                if r.timestamp_ms > s.last_active_ms {
                    s.last_active_ms = r.timestamp_ms;
                }
                if r.timestamp_ms < s.started_at_ms {
                    s.started_at_ms = r.timestamp_ms;
                }
                models.insert(r.model.clone());
            }
            if s.started_at_ms == i64::MAX {
                s.started_at_ms = 0;
            }
            let mut sm: Vec<String> = models.into_iter().collect();
            sm.sort();
            s.models = sm;
            s
        })
        .collect();
    list.sort_by_key(|s| std::cmp::Reverse(s.last_active_ms));
    Ok(list)
}

#[tauri::command]
pub fn get_usage_by_model(
    filter: UsageFilter,
    state: State<'_, UsageState>,
) -> Result<Vec<ModelUsageStat>, String> {
    let inner = state.inner.read().map_err(|e| e.to_string())?;
    let filtered = apply_filter(&inner.records, &filter, &inner.pricing);
    Ok(aggregate_model_stats(&filtered))
}

#[tauri::command]
pub fn get_session_usage_detail(
    session_id: String,
    state: State<'_, UsageState>,
) -> Result<SessionUsageDetail, String> {
    let inner = state.inner.read().map_err(|e| e.to_string())?;
    let session_records: Vec<&UsageRecord> = inner
        .records
        .iter()
        .filter(|r| r.session_id == session_id)
        .collect();
    if session_records.is_empty() {
        return Err(format!("session {session_id} 不存在或无 usage 数据"));
    }
    let mut session_view = SessionUsage {
        session_id: session_id.clone(),
        project_path: session_records[0].project_path.clone(),
        project_dir: session_records[0].project_dir.clone(),
        started_at_ms: i64::MAX,
        last_active_ms: 0,
        ..Default::default()
    };
    let mut models: HashSet<String> = HashSet::new();
    for r in &session_records {
        session_view.messages += 1;
        session_view.input_tokens += r.input_tokens;
        session_view.output_tokens += r.output_tokens;
        session_view.cache_creation_tokens += r.cache_creation_total();
        session_view.cache_read_tokens += r.cache_read;
        session_view.cost += r.cost_usd;
        if r.timestamp_ms > session_view.last_active_ms {
            session_view.last_active_ms = r.timestamp_ms;
        }
        if r.timestamp_ms < session_view.started_at_ms {
            session_view.started_at_ms = r.timestamp_ms;
        }
        models.insert(r.model.clone());
    }
    if session_view.started_at_ms == i64::MAX {
        session_view.started_at_ms = 0;
    }
    let mut sm: Vec<String> = models.into_iter().collect();
    sm.sort();
    session_view.models = sm;

    let mut messages: Vec<UsageRecord> = session_records.into_iter().cloned().collect();
    messages.sort_by_key(|r| r.timestamp_ms);

    Ok(SessionUsageDetail {
        session: session_view,
        messages,
    })
}

#[tauri::command]
pub async fn refresh_usage_pricing(app: AppHandle) -> Result<PricingTable, String> {
    let table = match fetch_pricing_from_network().await {
        Ok(t) => t,
        Err(e) => {
            log::warn!("event=usage.pricing.refresh status=warn reason=network_failed err={e}");
            return Err(e);
        }
    };
    let state = app.state::<UsageState>();
    let table = apply_new_pricing(&state, table)?;
    let _ = app.emit("usage-pricing-updated", ());
    log::info!(
        "event=usage.pricing.refresh status=ok models={} source=network",
        table.models.len()
    );
    Ok(table)
}

#[tauri::command]
pub fn rescan_usage(state: State<'_, UsageState>) -> Result<ScanResult, String> {
    scan_all(&state, true)
}

// ============ 启动入口 ============

/// 在 lib.rs setup 中调用：构造状态、加载价格、启动后台扫描与价格刷新、监听 watcher 事件。
pub fn start_usage_runtime(app: &tauri::App) {
    let state = UsageState::new();
    let pricing = load_pricing();
    if let Ok(mut inner) = state.inner.write() {
        inner.pricing = pricing;
    }
    app.manage(state);

    let app_handle = app.handle().clone();
    tauri::async_runtime::spawn(async move {
        // 1. 启动全量扫描
        {
            let state = app_handle.state::<UsageState>();
            if let Err(e) = scan_all(&state, false) {
                log::warn!("event=usage.scan status=warn err={e}");
            } else {
                let _ = app_handle.emit("usage-records-changed", ());
            }
        }
        // 2. 联网刷新价格
        match fetch_pricing_from_network().await {
            Ok(table) => {
                let state = app_handle.state::<UsageState>();
                match apply_new_pricing(&state, table) {
                    Ok(t) => {
                        let _ = app_handle.emit("usage-pricing-updated", ());
                        log::info!(
                            "event=usage.pricing.refresh status=ok models={} source=network",
                            t.models.len()
                        );
                    }
                    Err(e) => {
                        log::warn!("event=usage.pricing.apply status=warn err={e}");
                    }
                }
            }
            Err(e) => {
                log::warn!("event=usage.pricing.refresh status=warn reason=network_failed err={e}");
            }
        }
    });

    // 监听 ~/.claude 目录变更事件做增量
    let app_handle = app.handle().clone();
    app.handle().listen("claude-directory-changed", move |event| {
        let payload_str = event.payload();
        let parsed: serde_json::Value = match serde_json::from_str(payload_str) {
            Ok(v) => v,
            Err(_) => return,
        };
        let Some(arr) = parsed.get("paths").and_then(|x| x.as_array()) else {
            return;
        };
        let claude_root = utils::home_dir_or_fallback().join(".claude");
        let files: Vec<PathBuf> = arr
            .iter()
            .filter_map(|x| x.as_str())
            .filter(|s| s.starts_with("projects/") && s.ends_with(".jsonl"))
            .map(|s| claude_root.join(s))
            .collect();
        if files.is_empty() {
            return;
        }
        let app_handle = app_handle.clone();
        tauri::async_runtime::spawn(async move {
            let state = app_handle.state::<UsageState>();
            match handle_files_changed(&state, files) {
                Ok(n) if n > 0 => {
                    let _ = app_handle.emit("usage-records-changed", ());
                }
                Ok(_) => {}
                Err(e) => log::warn!("event=usage.incremental status=warn err={e}"),
            }
        });
    });
}

// ============ Tests ============

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_pricing() -> PricingTable {
        let mut models = HashMap::new();
        models.insert(
            "claude-opus-4-7".to_string(),
            ModelPrice {
                input: 5.0,
                output: 25.0,
                cache_read: 0.5,
                cache_write: 6.25,
            },
        );
        models.insert(
            "claude-sonnet-4-6".to_string(),
            ModelPrice {
                input: 3.0,
                output: 15.0,
                cache_read: 0.3,
                cache_write: 3.75,
            },
        );
        models.insert(
            "claude-haiku-4-5".to_string(),
            ModelPrice {
                input: 1.0,
                output: 5.0,
                cache_read: 0.1,
                cache_write: 1.25,
            },
        );
        PricingTable {
            source: PricingSource::Builtin,
            fetched_at_ms: None,
            models,
        }
    }

    #[test]
    fn match_model_price_exact() {
        let table = sample_pricing();
        let p = match_model_price("claude-opus-4-7", &table).unwrap();
        assert_eq!(p.input, 5.0);
    }

    #[test]
    fn match_model_price_fallback_by_category() {
        let table = sample_pricing();
        let p = match_model_price("claude-sonnet-4-99", &table).unwrap();
        assert_eq!(p.input, 3.0);
    }

    #[test]
    fn match_model_price_unknown_returns_none() {
        let table = sample_pricing();
        assert!(match_model_price("gpt-4o", &table).is_none());
    }

    #[test]
    fn compute_cost_basic() {
        let table = sample_pricing();
        let usage = RawUsage {
            input_tokens: 1_000_000,
            output_tokens: 1_000_000,
            cache_creation_5m: 0,
            cache_creation_1h: 0,
            cache_read: 0,
        };
        let cost = compute_cost("claude-opus-4-7", &table, &usage);
        assert!((cost - 30.0).abs() < 1e-9, "cost was {cost}");
    }

    #[test]
    fn compute_cost_with_cache() {
        let table = sample_pricing();
        let usage = RawUsage {
            input_tokens: 0,
            output_tokens: 0,
            cache_creation_5m: 1_000_000,
            cache_creation_1h: 1_000_000,
            cache_read: 1_000_000,
        };
        let cost = compute_cost("claude-opus-4-7", &table, &usage);
        // 2M cache_write * 6.25 + 1M cache_read * 0.5 = 12.5 + 0.5 = 13.0
        assert!((cost - 13.0).abs() < 1e-9, "cost was {cost}");
    }

    #[test]
    fn compute_cost_unknown_returns_zero() {
        let table = sample_pricing();
        let usage = RawUsage {
            input_tokens: 1_000_000,
            output_tokens: 0,
            cache_creation_5m: 0,
            cache_creation_1h: 0,
            cache_read: 0,
        };
        let cost = compute_cost("gpt-4o", &table, &usage);
        assert_eq!(cost, 0.0);
    }

    #[test]
    fn parse_jsonl_assistant_with_usage() {
        let table = sample_pricing();
        let mut unknown = HashSet::new();
        let line = r#"{
            "type":"assistant",
            "uuid":"u-1","parentUuid":null,"sessionId":"sess-1",
            "timestamp":"2026-04-19T15:48:44.149Z","cwd":"/tmp/demo",
            "gitBranch":"main","version":"2.1.114",
            "message":{"id":"msg_bdrk_1","role":"assistant","model":"claude-opus-4-7",
                "usage":{"input_tokens":10,"output_tokens":20,
                    "cache_creation_input_tokens":1000,
                    "cache_read_input_tokens":2000,
                    "cache_creation":{"ephemeral_5m_input_tokens":600,"ephemeral_1h_input_tokens":400}}}
        }"#;
        let r = parse_jsonl_line(line, "-tmp-demo", &table, &mut unknown).unwrap();
        assert_eq!(r.message_id, "msg_bdrk_1");
        assert_eq!(r.session_id, "sess-1");
        assert_eq!(r.project_path, "/tmp/demo");
        assert_eq!(r.project_dir, "-tmp-demo");
        assert_eq!(r.input_tokens, 10);
        assert_eq!(r.output_tokens, 20);
        assert_eq!(r.cache_creation_5m, 600);
        assert_eq!(r.cache_creation_1h, 400);
        assert_eq!(r.cache_read, 2000);
        assert_eq!(r.git_branch.as_deref(), Some("main"));
        assert_eq!(r.cc_version.as_deref(), Some("2.1.114"));
        assert!(r.cost_usd > 0.0);
    }

    #[test]
    fn parse_jsonl_skips_user_records() {
        let table = sample_pricing();
        let mut unknown = HashSet::new();
        let line = r#"{"type":"user","sessionId":"s","timestamp":"2026-04-19T00:00:00Z","message":{}}"#;
        assert!(parse_jsonl_line(line, "-x", &table, &mut unknown).is_none());
    }

    #[test]
    fn parse_jsonl_skips_zero_token_records() {
        let table = sample_pricing();
        let mut unknown = HashSet::new();
        let line = r#"{"type":"assistant","sessionId":"s","timestamp":"2026-04-19T00:00:00Z",
            "message":{"id":"m","model":"claude-opus-4-7","usage":{"input_tokens":0,"output_tokens":0}}}"#;
        assert!(parse_jsonl_line(line, "-x", &table, &mut unknown).is_none());
    }

    #[test]
    fn parse_jsonl_unknown_model_records_in_set() {
        let table = sample_pricing();
        let mut unknown = HashSet::new();
        let line = r#"{"type":"assistant","sessionId":"s","timestamp":"2026-04-19T00:00:00Z","cwd":"/x",
            "message":{"id":"m","model":"gpt-4o","usage":{"input_tokens":10,"output_tokens":20}}}"#;
        let r = parse_jsonl_line(line, "-x", &table, &mut unknown).unwrap();
        assert_eq!(r.cost_usd, 0.0);
        assert!(unknown.contains("gpt-4o"));
    }

    #[test]
    fn scan_file_increments_offset_and_dedupes() {
        let dir = tempdir();
        let path = dir.join("session.jsonl");
        let pricing = sample_pricing();
        let mut unknown = HashSet::new();
        let mut seen = HashSet::new();
        let mut out: Vec<UsageRecord> = Vec::new();

        // 写两条
        let line1 = make_assistant_line("msg-1", "sess-1", "claude-opus-4-7", 10, 20);
        let line2 = make_assistant_line("msg-2", "sess-1", "claude-opus-4-7", 30, 40);
        std::fs::write(&path, format!("{line1}\n{line2}\n")).unwrap();
        let off = scan_file_from_offset(
            &path,
            0,
            "dir",
            &pricing,
            &mut unknown,
            &mut seen,
            &mut out,
        )
        .unwrap();
        assert_eq!(out.len(), 2);
        assert_eq!(off, std::fs::metadata(&path).unwrap().len());

        // 追加一条 + 重复一条 msg-2
        let line3 = make_assistant_line("msg-3", "sess-1", "claude-opus-4-7", 50, 60);
        let line2_dup = make_assistant_line("msg-2", "sess-1", "claude-opus-4-7", 30, 40);
        std::fs::write(
            &path,
            format!("{line1}\n{line2}\n{line3}\n{line2_dup}\n"),
        )
        .unwrap();
        let off2 = scan_file_from_offset(
            &path,
            off,
            "dir",
            &pricing,
            &mut unknown,
            &mut seen,
            &mut out,
        )
        .unwrap();
        assert_eq!(out.len(), 3, "msg-3 added, dup msg-2 skipped");
        assert_eq!(off2, std::fs::metadata(&path).unwrap().len());
    }

    #[test]
    fn scan_file_handles_incomplete_trailing_line() {
        let dir = tempdir();
        let path = dir.join("partial.jsonl");
        let pricing = sample_pricing();
        let mut unknown = HashSet::new();
        let mut seen = HashSet::new();
        let mut out: Vec<UsageRecord> = Vec::new();

        let line1 = make_assistant_line("msg-1", "s", "claude-opus-4-7", 10, 20);
        let partial = "{\"type\":\"assistant\",\"sess";
        std::fs::write(&path, format!("{line1}\n{partial}")).unwrap();

        let off = scan_file_from_offset(
            &path,
            0,
            "dir",
            &pricing,
            &mut unknown,
            &mut seen,
            &mut out,
        )
        .unwrap();
        assert_eq!(out.len(), 1, "complete line parsed");
        // offset 应停在第一行末（含换行），避免重复读到不完整行
        assert_eq!(off, (line1.len() + 1) as u64);
    }

    fn make_assistant_line(id: &str, sess: &str, model: &str, input: u64, output: u64) -> String {
        serde_json::json!({
            "type": "assistant",
            "sessionId": sess,
            "timestamp": "2026-04-19T15:48:44.149Z",
            "cwd": "/tmp/demo",
            "message": {
                "id": id,
                "role": "assistant",
                "model": model,
                "usage": {
                    "input_tokens": input,
                    "output_tokens": output
                }
            }
        })
        .to_string()
    }

    fn tempdir() -> std::path::PathBuf {
        let base = std::env::temp_dir().join(format!(
            "ai-manager-usage-test-{}-{}",
            std::process::id(),
            now_ms()
        ));
        std::fs::create_dir_all(&base).unwrap();
        base
    }

    #[test]
    fn parse_local_date_round_trip() {
        // 用 UTC 偏移确保跨时区机器也能跑
        let _ = local_offset(); // 触发缓存
        let s = parse_local_date_to_ms("2026-04-19", false).unwrap();
        let e = parse_local_date_to_ms("2026-04-19", true).unwrap();
        assert!(e > s);
        assert_eq!(ms_to_local_date(s), "2026-04-19");
        assert_eq!(ms_to_local_date(e), "2026-04-19");
    }

    #[test]
    fn aggregate_filters_by_date_and_model() {
        let pricing = sample_pricing();
        let mk = |id: &str, model: &str, ts: &str| UsageRecord {
            message_id: id.into(),
            session_id: "s".into(),
            project_path: "/p".into(),
            project_dir: "-p".into(),
            timestamp_ms: parse_iso8601_ms(ts).unwrap(),
            model: model.into(),
            input_tokens: 1_000_000,
            output_tokens: 0,
            cache_creation_5m: 0,
            cache_creation_1h: 0,
            cache_read: 0,
            cost_usd: 0.0,
            git_branch: None,
            cc_version: None,
        };
        let records = vec![
            mk("a", "claude-opus-4-7", "2026-04-18T10:00:00Z"),
            mk("b", "claude-sonnet-4-6", "2026-04-19T10:00:00Z"),
            mk("c", "claude-haiku-4-5", "2026-04-20T10:00:00Z"),
        ];

        let f = UsageFilter {
            model: Some("claude-sonnet-4-6".into()),
            ..Default::default()
        };
        let r = apply_filter(&records, &f, &pricing);
        assert_eq!(r.len(), 1);
        assert_eq!(r[0].message_id, "b");
    }
}
