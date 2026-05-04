//! Token 用量与花费统计模块
//!
//! 数据源：~/.claude/projects/<project_dir>/<sessionId>.jsonl 及其 subagents/*.jsonl
//!
//! 提取每条 assistant 记录的 message.usage，按价格表计算 cost，提供按
//! 日期 / 项目 / 会话 / 模型四个维度的聚合查询。message.id 全局合并，保留最大用量快照。
//!
//! 价格表加载顺序：本地缓存 -> 内置兜底 -> 启动后异步从 models.dev 拉取覆盖。

use crate::utils;
use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use sqlx::{QueryBuilder, Row, Sqlite, SqlitePool};
use std::collections::{HashMap, HashSet};
use std::fs::{self, File};
use std::io::{Read, Seek, SeekFrom};
use std::path::{Component, Path, PathBuf};
use std::sync::RwLock;
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

fn usage_record_token_total(record: &UsageRecord) -> u128 {
    record.input_tokens as u128
        + record.output_tokens as u128
        + record.cache_creation_total() as u128
        + record.cache_read as u128
}

fn should_replace_usage_record(existing: &UsageRecord, candidate: &UsageRecord) -> bool {
    usage_record_token_total(candidate) > usage_record_token_total(existing)
}

fn merge_usage_record(
    records: &mut Vec<UsageRecord>,
    seen: &mut HashSet<String>,
    record: UsageRecord,
) -> bool {
    if record.message_id.is_empty() {
        records.push(record);
        return true;
    }

    if seen.insert(record.message_id.clone()) {
        records.push(record);
        return true;
    }

    if let Some(existing) = records
        .iter_mut()
        .find(|existing| existing.message_id == record.message_id)
    {
        if should_replace_usage_record(existing, &record) {
            *existing = record;
            return true;
        }
        return false;
    }

    records.push(record);
    true
}

/// 单文件扫描索引
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct FileIndex {
    pub mtime_ms: i64,
    pub size: u64,
    pub last_offset: u64,
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
    db: RwLock<Option<SqlitePool>>,
}

impl UsageState {
    pub fn new() -> Self {
        Self {
            inner: RwLock::new(UsageStateInner::default()),
            db: RwLock::new(None),
        }
    }

    fn set_db_pool(&self, pool: SqlitePool) -> Result<(), String> {
        *self.db.write().map_err(|e| e.to_string())? = Some(pool);
        Ok(())
    }

    fn db_pool(&self) -> Result<SqlitePool, String> {
        self.db
            .read()
            .map_err(|e| e.to_string())?
            .clone()
            .ok_or_else(|| "usage SQLite 数据库尚未初始化".to_string())
    }
}

impl Default for UsageState {
    fn default() -> Self {
        Self::new()
    }
}

/// 互斥锁：避免多个扫描同时跑
pub static USAGE_SCAN_LOCK: Lazy<tokio::sync::Mutex<()>> =
    Lazy::new(|| tokio::sync::Mutex::new(()));

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

#[derive(Debug, Clone, Copy, Default, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum UsageTimeGranularity {
    #[default]
    Day,
    Hour,
    FiveMinute,
}

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UsageTimeSeriesPoint {
    pub bucket: String,
    pub bucket_start_ms: i64,
    pub messages: u64,
    pub sessions: u64,
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub cache_creation_tokens: u64,
    pub cache_read_tokens: u64,
    pub cost: f64,
    pub input_cost: f64,
    pub output_cost: f64,
    pub cache_creation_cost: f64,
    pub cache_read_cost: f64,
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
const CLAUDE_MODEL_FILTER: &str = "claude-*";
const CLAUDE_MODEL_PREFIX: &str = "claude-";
pub const USAGE_DB_URL: &str = "sqlite:usage.db";

const USAGE_DB_SCHEMA: &str = r#"
CREATE TABLE IF NOT EXISTS usage_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    message_id TEXT NOT NULL DEFAULT '',
    session_id TEXT NOT NULL DEFAULT '',
    project_path TEXT NOT NULL DEFAULT '',
    project_dir TEXT NOT NULL DEFAULT '',
    timestamp_ms INTEGER NOT NULL DEFAULT 0,
    model TEXT NOT NULL DEFAULT 'unknown',
    input_tokens INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0,
    cache_creation_5m INTEGER NOT NULL DEFAULT 0,
    cache_creation_1h INTEGER NOT NULL DEFAULT 0,
    cache_read INTEGER NOT NULL DEFAULT 0,
    cost_usd REAL NOT NULL DEFAULT 0,
    git_branch TEXT,
    cc_version TEXT
);
CREATE INDEX IF NOT EXISTS idx_usage_records_message_id ON usage_records(message_id);
CREATE INDEX IF NOT EXISTS idx_usage_records_timestamp_ms ON usage_records(timestamp_ms);
CREATE INDEX IF NOT EXISTS idx_usage_records_project_path ON usage_records(project_path);
CREATE INDEX IF NOT EXISTS idx_usage_records_session_id ON usage_records(session_id);
CREATE INDEX IF NOT EXISTS idx_usage_records_model ON usage_records(model);
CREATE TABLE IF NOT EXISTS usage_file_index (
    path TEXT PRIMARY KEY NOT NULL,
    mtime_ms INTEGER NOT NULL DEFAULT 0,
    size INTEGER NOT NULL DEFAULT 0,
    last_offset INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS usage_meta (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL
);
"#;

pub fn sql_migrations() -> Vec<tauri_plugin_sql::Migration> {
    vec![tauri_plugin_sql::Migration {
        version: 1,
        description: "create_usage_cache",
        sql: USAGE_DB_SCHEMA,
        kind: tauri_plugin_sql::MigrationKind::Up,
    }]
}

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

fn projects_root() -> PathBuf {
    utils::home_dir_or_fallback()
        .join(".claude")
        .join("projects")
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct UsageFile {
    path: PathBuf,
    project_dir_name: String,
}

fn identify_usage_file(projects_dir: &Path, path: &Path) -> Option<UsageFile> {
    let relative_path = path.strip_prefix(projects_dir).ok()?;
    let mut parts = Vec::new();

    for component in relative_path.components() {
        match component {
            Component::Normal(part) => parts.push(part.to_string_lossy().into_owned()),
            Component::CurDir => {}
            Component::ParentDir | Component::RootDir | Component::Prefix(_) => return None,
        }
    }

    let file_name = parts.last()?;
    let is_jsonl = Path::new(file_name)
        .extension()
        .and_then(|s| s.to_str())
        .is_some_and(|ext| ext == "jsonl");
    if !is_jsonl {
        return None;
    }

    let project_dir_name = match parts.as_slice() {
        [project_dir, _session_file] => project_dir.clone(),
        [project_dir, _session_dir, subagents_dir, _agent_file] if subagents_dir == "subagents" => {
            project_dir.clone()
        }
        _ => return None,
    };

    Some(UsageFile {
        path: path.to_path_buf(),
        project_dir_name,
    })
}

fn collect_usage_files(projects_dir: &Path) -> Vec<UsageFile> {
    fn visit(projects_dir: &Path, current: &Path, out: &mut Vec<UsageFile>) {
        let entries = match fs::read_dir(current) {
            Ok(entries) => entries,
            Err(_) => return,
        };

        for entry in entries.flatten() {
            let path = entry.path();
            let metadata = match fs::symlink_metadata(&path) {
                Ok(metadata) => metadata,
                Err(_) => continue,
            };
            if metadata.file_type().is_symlink() {
                continue;
            }
            if metadata.is_dir() {
                visit(projects_dir, &path, out);
                continue;
            }
            if !metadata.is_file() {
                continue;
            }
            if let Some(file) = identify_usage_file(projects_dir, &path) {
                out.push(file);
            }
        }
    }

    let mut files = Vec::new();
    visit(projects_dir, projects_dir, &mut files);
    files.sort_by(|a, b| a.path.cmp(&b.path));
    files
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

async fn initialize_usage_database(pool: &SqlitePool) -> Result<(), String> {
    sqlx::query("PRAGMA journal_mode = WAL")
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;
    sqlx::query("PRAGMA synchronous = NORMAL")
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;
    for statement in USAGE_DB_SCHEMA
        .split(';')
        .map(str::trim)
        .filter(|statement| !statement.is_empty())
    {
        sqlx::query(statement)
            .execute(pool)
            .await
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

async fn usage_db_pool_from_handle(app: &AppHandle) -> Result<SqlitePool, String> {
    let instances = app.state::<tauri_plugin_sql::DbInstances>();
    let pools = instances.0.read().await;
    let pool = pools
        .get(USAGE_DB_URL)
        .ok_or_else(|| format!("未找到用量 SQLite 连接: {USAGE_DB_URL}"))?;
    match pool {
        tauri_plugin_sql::DbPool::Sqlite(pool) => Ok(pool.clone()),
    }
}

async fn load_file_index_db(pool: &SqlitePool) -> Result<HashMap<PathBuf, FileIndex>, String> {
    let rows = sqlx::query("SELECT path, mtime_ms, size, last_offset FROM usage_file_index")
        .fetch_all(pool)
        .await
        .map_err(|e| e.to_string())?;
    let mut index = HashMap::new();
    for row in rows {
        let path: String = row.try_get("path").map_err(|e| e.to_string())?;
        index.insert(
            PathBuf::from(path),
            FileIndex {
                mtime_ms: row.try_get("mtime_ms").map_err(|e| e.to_string())?,
                size: row_i64_to_u64(&row, "size")?,
                last_offset: row_i64_to_u64(&row, "last_offset")?,
            },
        );
    }
    Ok(index)
}

async fn replace_file_index_db(
    pool: &SqlitePool,
    index: &HashMap<PathBuf, FileIndex>,
) -> Result<(), String> {
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;
    sqlx::query("DELETE FROM usage_file_index")
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    for (path, file_index) in index {
        upsert_file_index_db(&mut tx, path, file_index).await?;
    }
    tx.commit().await.map_err(|e| e.to_string())
}

async fn upsert_file_index_entries_db(
    pool: &SqlitePool,
    index: &HashMap<PathBuf, FileIndex>,
) -> Result<(), String> {
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;
    for (path, file_index) in index {
        upsert_file_index_db(&mut tx, path, file_index).await?;
    }
    tx.commit().await.map_err(|e| e.to_string())
}

async fn upsert_file_index_db(
    tx: &mut sqlx::Transaction<'_, Sqlite>,
    path: &Path,
    file_index: &FileIndex,
) -> Result<(), String> {
    sqlx::query(
        "INSERT INTO usage_file_index (path, mtime_ms, size, last_offset)
         VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT(path) DO UPDATE SET
            mtime_ms = excluded.mtime_ms,
            size = excluded.size,
            last_offset = excluded.last_offset",
    )
    .bind(path.to_string_lossy().to_string())
    .bind(file_index.mtime_ms)
    .bind(u64_to_i64(file_index.size)?)
    .bind(u64_to_i64(file_index.last_offset)?)
    .execute(&mut **tx)
    .await
    .map_err(|e| e.to_string())?;
    Ok(())
}

async fn remove_file_index_entries_db(pool: &SqlitePool, paths: &[PathBuf]) -> Result<(), String> {
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;
    for path in paths {
        sqlx::query("DELETE FROM usage_file_index WHERE path = ?1")
            .bind(path.to_string_lossy().to_string())
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
    }
    tx.commit().await.map_err(|e| e.to_string())
}

async fn clear_usage_records_db(pool: &SqlitePool) -> Result<(), String> {
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;
    sqlx::query("DELETE FROM usage_records")
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    sqlx::query("DELETE FROM usage_file_index")
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    tx.commit().await.map_err(|e| e.to_string())
}

async fn merge_usage_records_db(pool: &SqlitePool, records: &[UsageRecord]) -> Result<u64, String> {
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;
    let mut changed = 0;
    for record in records {
        if record.message_id.is_empty() {
            insert_usage_record_db(&mut tx, record).await?;
            changed += 1;
            continue;
        }

        let existing = sqlx::query(
            "SELECT id, input_tokens, output_tokens, cache_creation_5m, cache_creation_1h, cache_read
             FROM usage_records WHERE message_id = ?1 LIMIT 1",
        )
        .bind(&record.message_id)
        .fetch_optional(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

        if let Some(row) = existing {
            let existing_total = row_i64_to_u128(&row, "input_tokens")?
                + row_i64_to_u128(&row, "output_tokens")?
                + row_i64_to_u128(&row, "cache_creation_5m")?
                + row_i64_to_u128(&row, "cache_creation_1h")?
                + row_i64_to_u128(&row, "cache_read")?;
            if usage_record_token_total(record) > existing_total {
                let id: i64 = row.try_get("id").map_err(|e| e.to_string())?;
                update_usage_record_db(&mut tx, id, record).await?;
                changed += 1;
            }
        } else {
            insert_usage_record_db(&mut tx, record).await?;
            changed += 1;
        }
    }
    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(changed)
}

async fn insert_usage_record_db(
    tx: &mut sqlx::Transaction<'_, Sqlite>,
    record: &UsageRecord,
) -> Result<(), String> {
    sqlx::query(
        "INSERT INTO usage_records (
            message_id, session_id, project_path, project_dir, timestamp_ms, model,
            input_tokens, output_tokens, cache_creation_5m, cache_creation_1h,
            cache_read, cost_usd, git_branch, cc_version
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)",
    )
    .bind(&record.message_id)
    .bind(&record.session_id)
    .bind(&record.project_path)
    .bind(&record.project_dir)
    .bind(record.timestamp_ms)
    .bind(&record.model)
    .bind(u64_to_i64(record.input_tokens)?)
    .bind(u64_to_i64(record.output_tokens)?)
    .bind(u64_to_i64(record.cache_creation_5m)?)
    .bind(u64_to_i64(record.cache_creation_1h)?)
    .bind(u64_to_i64(record.cache_read)?)
    .bind(record.cost_usd)
    .bind(&record.git_branch)
    .bind(&record.cc_version)
    .execute(&mut **tx)
    .await
    .map_err(|e| e.to_string())?;
    Ok(())
}

async fn update_usage_record_db(
    tx: &mut sqlx::Transaction<'_, Sqlite>,
    id: i64,
    record: &UsageRecord,
) -> Result<(), String> {
    sqlx::query(
        "UPDATE usage_records SET
            message_id = ?1,
            session_id = ?2,
            project_path = ?3,
            project_dir = ?4,
            timestamp_ms = ?5,
            model = ?6,
            input_tokens = ?7,
            output_tokens = ?8,
            cache_creation_5m = ?9,
            cache_creation_1h = ?10,
            cache_read = ?11,
            cost_usd = ?12,
            git_branch = ?13,
            cc_version = ?14
         WHERE id = ?15",
    )
    .bind(&record.message_id)
    .bind(&record.session_id)
    .bind(&record.project_path)
    .bind(&record.project_dir)
    .bind(record.timestamp_ms)
    .bind(&record.model)
    .bind(u64_to_i64(record.input_tokens)?)
    .bind(u64_to_i64(record.output_tokens)?)
    .bind(u64_to_i64(record.cache_creation_5m)?)
    .bind(u64_to_i64(record.cache_creation_1h)?)
    .bind(u64_to_i64(record.cache_read)?)
    .bind(record.cost_usd)
    .bind(&record.git_branch)
    .bind(&record.cc_version)
    .bind(id)
    .execute(&mut **tx)
    .await
    .map_err(|e| e.to_string())?;
    Ok(())
}

async fn load_usage_records_db(
    pool: &SqlitePool,
    filter: &UsageFilter,
) -> Result<Vec<UsageRecord>, String> {
    let mut builder = QueryBuilder::<Sqlite>::new(
        "SELECT message_id, session_id, project_path, project_dir, timestamp_ms, model,
            input_tokens, output_tokens, cache_creation_5m, cache_creation_1h,
            cache_read, cost_usd, git_branch, cc_version
         FROM usage_records WHERE 1 = 1",
    );
    push_usage_filter_sql(&mut builder, filter);
    builder.push(" ORDER BY timestamp_ms ASC, id ASC");

    let rows = builder
        .build()
        .fetch_all(pool)
        .await
        .map_err(|e| e.to_string())?;
    rows.into_iter()
        .map(|row| row_to_usage_record(&row))
        .collect()
}

async fn load_usage_record_rows_db(pool: &SqlitePool) -> Result<Vec<(i64, UsageRecord)>, String> {
    let rows = sqlx::query(
        "SELECT id, message_id, session_id, project_path, project_dir, timestamp_ms, model,
            input_tokens, output_tokens, cache_creation_5m, cache_creation_1h,
            cache_read, cost_usd, git_branch, cc_version
         FROM usage_records ORDER BY timestamp_ms ASC, id ASC",
    )
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    rows.into_iter()
        .map(|row| {
            let id: i64 = row.try_get("id").map_err(|e| e.to_string())?;
            Ok((id, row_to_usage_record(&row)?))
        })
        .collect()
}

async fn update_usage_record_costs_db(
    pool: &SqlitePool,
    updates: &[(i64, f64)],
) -> Result<(), String> {
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;
    for (id, cost) in updates {
        sqlx::query("UPDATE usage_records SET cost_usd = ?1 WHERE id = ?2")
            .bind(cost)
            .bind(id)
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
    }
    tx.commit().await.map_err(|e| e.to_string())
}

async fn count_usage_records_db(pool: &SqlitePool) -> Result<u64, String> {
    let row = sqlx::query("SELECT COUNT(*) AS count FROM usage_records")
        .fetch_one(pool)
        .await
        .map_err(|e| e.to_string())?;
    row_i64_to_u64(&row, "count")
}

async fn save_last_scan_ms_db(pool: &SqlitePool, value: i64) -> Result<(), String> {
    sqlx::query(
        "INSERT INTO usage_meta (key, value) VALUES ('last_scan_ms', ?1)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    )
    .bind(value.to_string())
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;
    Ok(())
}

async fn load_last_scan_ms_db(pool: &SqlitePool) -> Result<Option<i64>, String> {
    let row = sqlx::query("SELECT value FROM usage_meta WHERE key = 'last_scan_ms'")
        .fetch_optional(pool)
        .await
        .map_err(|e| e.to_string())?;
    row.map(|row| {
        let value: String = row.try_get("value").map_err(|e| e.to_string())?;
        value.parse::<i64>().map_err(|e| e.to_string())
    })
    .transpose()
}

fn push_usage_filter_sql<'a>(builder: &mut QueryBuilder<'a, Sqlite>, filter: &'a UsageFilter) {
    if let Some(start_ms) = filter
        .start_date
        .as_deref()
        .and_then(|s| parse_local_date_to_ms(s, false))
    {
        builder.push(" AND timestamp_ms >= ");
        builder.push_bind(start_ms);
    }
    if let Some(end_ms) = filter
        .end_date
        .as_deref()
        .and_then(|s| parse_local_date_to_ms(s, true))
    {
        builder.push(" AND timestamp_ms <= ");
        builder.push_bind(end_ms);
    }
    if let Some(project) = filter
        .project_path
        .as_ref()
        .filter(|value| !value.is_empty())
    {
        builder.push(" AND (project_path = ");
        builder.push_bind(project);
        builder.push(" OR project_dir = ");
        builder.push_bind(project);
        builder.push(")");
    }
    if let Some(session_id) = filter.session_id.as_ref().filter(|value| !value.is_empty()) {
        builder.push(" AND session_id = ");
        builder.push_bind(session_id);
    }
    if let Some(model) = filter.model.as_ref().filter(|value| !value.is_empty()) {
        if model == CLAUDE_MODEL_FILTER {
            builder.push(" AND model LIKE ");
            builder.push_bind(format!("{CLAUDE_MODEL_PREFIX}%"));
        } else {
            builder.push(" AND model = ");
            builder.push_bind(model);
        }
    }
}

fn row_to_usage_record(row: &sqlx::sqlite::SqliteRow) -> Result<UsageRecord, String> {
    Ok(UsageRecord {
        message_id: row.try_get("message_id").map_err(|e| e.to_string())?,
        session_id: row.try_get("session_id").map_err(|e| e.to_string())?,
        project_path: row.try_get("project_path").map_err(|e| e.to_string())?,
        project_dir: row.try_get("project_dir").map_err(|e| e.to_string())?,
        timestamp_ms: row.try_get("timestamp_ms").map_err(|e| e.to_string())?,
        model: row.try_get("model").map_err(|e| e.to_string())?,
        input_tokens: row_i64_to_u64(row, "input_tokens")?,
        output_tokens: row_i64_to_u64(row, "output_tokens")?,
        cache_creation_5m: row_i64_to_u64(row, "cache_creation_5m")?,
        cache_creation_1h: row_i64_to_u64(row, "cache_creation_1h")?,
        cache_read: row_i64_to_u64(row, "cache_read")?,
        cost_usd: row.try_get("cost_usd").map_err(|e| e.to_string())?,
        git_branch: row.try_get("git_branch").map_err(|e| e.to_string())?,
        cc_version: row.try_get("cc_version").map_err(|e| e.to_string())?,
    })
}

fn row_i64_to_u64(row: &sqlx::sqlite::SqliteRow, name: &str) -> Result<u64, String> {
    let value: i64 = row.try_get(name).map_err(|e| e.to_string())?;
    u64::try_from(value).map_err(|_| format!("{name} 包含负数: {value}"))
}

fn row_i64_to_u128(row: &sqlx::sqlite::SqliteRow, name: &str) -> Result<u128, String> {
    row_i64_to_u64(row, name).map(u128::from)
}

fn u64_to_i64(value: u64) -> Result<i64, String> {
    i64::try_from(value).map_err(|_| format!("Token 数值过大，无法写入 SQLite: {value}"))
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
    compute_cost_parts(
        model,
        table,
        usage.input_tokens,
        usage.output_tokens,
        usage.cache_creation_5m + usage.cache_creation_1h,
        usage.cache_read,
    )
    .total()
}

#[derive(Debug, Clone, Copy, Default)]
struct UsageCostParts {
    input: f64,
    output: f64,
    cache_creation: f64,
    cache_read: f64,
}

impl UsageCostParts {
    fn total(self) -> f64 {
        self.input + self.output + self.cache_creation + self.cache_read
    }
}

fn compute_cost_parts(
    model: &str,
    table: &PricingTable,
    input_tokens: u64,
    output_tokens: u64,
    cache_creation_tokens: u64,
    cache_read_tokens: u64,
) -> UsageCostParts {
    let Some(price) = match_model_price(model, table) else {
        return UsageCostParts::default();
    };
    UsageCostParts {
        input: input_tokens as f64 * price.input / 1_000_000.0,
        output: output_tokens as f64 * price.output / 1_000_000.0,
        cache_creation: cache_creation_tokens as f64 * price.cache_write / 1_000_000.0,
        cache_read: cache_read_tokens as f64 * price.cache_read / 1_000_000.0,
    }
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
    static OFFSET: Lazy<time::UtcOffset> =
        Lazy::new(|| time::UtcOffset::current_local_offset().unwrap_or(time::UtcOffset::UTC));
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
    let Some(dt) = ms_to_local_datetime(ms) else {
        return String::new();
    };
    format!("{:04}-{:02}-{:02}", dt.year(), dt.month() as u8, dt.day())
}

fn ms_to_local_datetime(ms: i64) -> Option<time::OffsetDateTime> {
    use time::OffsetDateTime;
    let secs = ms / 1000;
    let nanos = ((ms % 1000) * 1_000_000) as u32;
    let dt = OffsetDateTime::from_unix_timestamp(secs).ok()?;
    Some(
        dt.replace_nanosecond(nanos)
            .unwrap_or(dt)
            .to_offset(local_offset()),
    )
}

fn local_bucket_for_ms(ms: i64, granularity: UsageTimeGranularity) -> Option<(String, i64)> {
    use time::{OffsetDateTime, Time};

    let dt = ms_to_local_datetime(ms)?;
    let date = dt.date();
    let bucket_time = match granularity {
        UsageTimeGranularity::Day => Time::from_hms(0, 0, 0).ok()?,
        UsageTimeGranularity::Hour => Time::from_hms(dt.hour(), 0, 0).ok()?,
        UsageTimeGranularity::FiveMinute => {
            let minute = (dt.minute() / 5) * 5;
            Time::from_hms(dt.hour(), minute, 0).ok()?
        }
    };
    let bucket_start = OffsetDateTime::new_in_offset(date, bucket_time, local_offset());
    let bucket_start_ms =
        bucket_start.unix_timestamp() * 1000 + bucket_start.nanosecond() as i64 / 1_000_000;
    let bucket = match granularity {
        UsageTimeGranularity::Day => {
            format!("{:04}-{:02}-{:02}", dt.year(), dt.month() as u8, dt.day())
        }
        UsageTimeGranularity::Hour => format!(
            "{:04}-{:02}-{:02} {:02}:00",
            dt.year(),
            dt.month() as u8,
            dt.day(),
            dt.hour()
        ),
        UsageTimeGranularity::FiveMinute => format!(
            "{:04}-{:02}-{:02} {:02}:{:02}",
            dt.year(),
            dt.month() as u8,
            dt.day(),
            dt.hour(),
            (dt.minute() / 5) * 5
        ),
    };
    Some((bucket, bucket_start_ms))
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

    let cache_creation_input_tokens = usage_v
        .get("cache_creation_input_tokens")
        .and_then(|x| x.as_u64())
        .unwrap_or(0);

    // 优先使用 cache_creation 子对象细分；细分缺失或全为 0 时回退到顶层字段。
    let (cache_5m, cache_1h) = if let Some(cc) = usage_v.get("cache_creation") {
        let cache_5m = cc
            .get("ephemeral_5m_input_tokens")
            .and_then(|x| x.as_u64())
            .unwrap_or(0);
        let cache_1h = cc
            .get("ephemeral_1h_input_tokens")
            .and_then(|x| x.as_u64())
            .unwrap_or(0);
        if cache_5m == 0 && cache_1h == 0 && cache_creation_input_tokens > 0 {
            (cache_creation_input_tokens, 0)
        } else {
            (cache_5m, cache_1h)
        }
    } else {
        (cache_creation_input_tokens, 0)
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
pub async fn scan_all(state: &UsageState, full_rescan: bool) -> Result<ScanResult, String> {
    scan_all_in_projects_dir(state, full_rescan, projects_root()).await
}

async fn scan_all_in_projects_dir(
    state: &UsageState,
    full_rescan: bool,
    projects_dir: PathBuf,
) -> Result<ScanResult, String> {
    let _lock = USAGE_SCAN_LOCK.lock().await;
    let started = Instant::now();
    let pool = state.db_pool()?;

    if !projects_dir.exists() {
        log::info!("event=usage.scan status=skip reason=projects_dir_missing");
        let last_scan_ms = now_ms();
        let _ = save_last_scan_ms_db(&pool, last_scan_ms).await;
        if let Ok(mut inner) = state.inner.write() {
            inner.last_scan_ms = Some(last_scan_ms);
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
        clear_usage_records_db(&pool).await?;
        HashMap::new()
    } else {
        load_file_index_db(&pool).await?
    };

    let mut new_records: Vec<UsageRecord> = Vec::new();
    let mut new_index: HashMap<PathBuf, FileIndex> = HashMap::new();
    let mut new_unknown: HashSet<String> = HashSet::new();
    let mut local_seen: HashSet<String> = HashSet::new();
    let mut files_count: u64 = 0;

    if let Err(err) = fs::read_dir(&projects_dir) {
        log::warn!("event=usage.scan status=warn reason=read_projects_failed err={err}");
        return Ok(ScanResult::default());
    }

    for usage_file in collect_usage_files(&projects_dir) {
        let p = usage_file.path;
        let im = match fs::symlink_metadata(&p) {
            Ok(m) => m,
            Err(_) => continue,
        };
        if !im.is_file() || im.file_type().is_symlink() {
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
            &usage_file.project_dir_name,
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

    let new_records_count = merge_usage_records_db(&pool, &new_records).await?;
    replace_file_index_db(&pool, &new_index).await?;
    let last_scan_ms = now_ms();
    save_last_scan_ms_db(&pool, last_scan_ms).await?;

    {
        let mut inner = state.inner.write().map_err(|e| e.to_string())?;
        if full_rescan {
            inner.records.clear();
            inner.seen_message_ids.clear();
            inner.unknown_models.clear();
        }
        for m in new_unknown {
            inner.unknown_models.insert(m);
        }
        inner.file_index = new_index.clone();
        inner.last_scan_ms = Some(last_scan_ms);
    }

    let elapsed_ms = started.elapsed().as_millis() as u64;
    let total_records = count_usage_records_db(&pool).await.unwrap_or_default();
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
            merge_usage_record(out, seen, record);
        }
    }

    Ok(start_offset + effective_end as u64)
}

/// 处理 watcher 触发的增量扫描
pub async fn handle_files_changed(state: &UsageState, files: Vec<PathBuf>) -> Result<u64, String> {
    handle_files_changed_in_projects_dir(state, files, projects_root()).await
}

async fn handle_files_changed_in_projects_dir(
    state: &UsageState,
    files: Vec<PathBuf>,
    projects_dir: PathBuf,
) -> Result<u64, String> {
    let _lock = USAGE_SCAN_LOCK.lock().await;
    let pool = state.db_pool()?;
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
    let mut local_seen: HashSet<String> = HashSet::new();
    let persisted_index = load_file_index_db(&pool).await?;

    for path in files {
        let Some(usage_file) = identify_usage_file(&projects_dir, &path) else {
            continue;
        };
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
        let mtime = metadata
            .modified()
            .ok()
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as i64)
            .unwrap_or(0);
        let size = metadata.len();

        let start_offset = match persisted_index.get(&path) {
            Some(idx) if idx.size <= size && idx.mtime_ms <= mtime => idx.last_offset,
            _ => 0,
        };

        match scan_file_from_offset(
            &path,
            start_offset,
            &usage_file.project_dir_name,
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

    let new_count = merge_usage_records_db(&pool, &new_records).await?;
    upsert_file_index_entries_db(&pool, &updated_index).await?;
    if !removed.is_empty() {
        remove_file_index_entries_db(&pool, &removed).await?;
    }

    {
        let mut inner = state.inner.write().map_err(|e| e.to_string())?;
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
    let api: ModelsDevApi = resp.json().await.map_err(|e| format!("parse error: {e}"))?;

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
async fn apply_new_pricing(
    state: &UsageState,
    table: PricingTable,
) -> Result<PricingTable, String> {
    save_pricing_cache(&table)?;
    let pool = state.db_pool()?;
    let records = load_usage_record_rows_db(&pool).await?;
    let mut unknown_local: HashSet<String> = HashSet::new();
    let mut updates = Vec::with_capacity(records.len());
    for (id, r) in records {
        let raw = RawUsage {
            input_tokens: r.input_tokens,
            output_tokens: r.output_tokens,
            cache_creation_5m: r.cache_creation_5m,
            cache_creation_1h: r.cache_creation_1h,
            cache_read: r.cache_read,
        };
        updates.push((id, compute_cost(&r.model, &table, &raw)));
        if match_model_price(&r.model, &table).is_none() {
            unknown_local.insert(r.model.clone());
        }
    }
    update_usage_record_costs_db(&pool, &updates).await?;

    let mut inner = state.inner.write().map_err(|e| e.to_string())?;
    inner.pricing = table.clone();
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
                if m == CLAUDE_MODEL_FILTER {
                    if !r.model.starts_with(CLAUDE_MODEL_PREFIX) {
                        return false;
                    }
                } else if !m.is_empty() && r.model != *m {
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
    list.sort_by(|a, b| {
        b.cost
            .partial_cmp(&a.cost)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    list
}

fn aggregate_time_series(
    records: &[UsageRecord],
    filter: &UsageFilter,
    pricing: &PricingTable,
    granularity: UsageTimeGranularity,
) -> Vec<UsageTimeSeriesPoint> {
    let filtered = apply_filter(records, filter, pricing);
    let mut buckets: HashMap<i64, (String, Vec<&UsageRecord>)> = HashMap::new();
    for r in filtered {
        let Some((bucket, bucket_start_ms)) = local_bucket_for_ms(r.timestamp_ms, granularity)
        else {
            continue;
        };
        buckets
            .entry(bucket_start_ms)
            .or_insert_with(|| (bucket, Vec::new()))
            .1
            .push(r);
    }

    let mut list: Vec<UsageTimeSeriesPoint> = buckets
        .into_iter()
        .map(|(bucket_start_ms, (bucket, items))| {
            let mut point = UsageTimeSeriesPoint {
                bucket,
                bucket_start_ms,
                ..Default::default()
            };
            let mut sessions: HashSet<&str> = HashSet::new();
            for r in &items {
                point.messages += 1;
                point.input_tokens += r.input_tokens;
                point.output_tokens += r.output_tokens;
                point.cache_creation_tokens += r.cache_creation_total();
                point.cache_read_tokens += r.cache_read;
                point.cost += r.cost_usd;
                let cost_parts = compute_cost_parts(
                    &r.model,
                    pricing,
                    r.input_tokens,
                    r.output_tokens,
                    r.cache_creation_total(),
                    r.cache_read,
                );
                point.input_cost += cost_parts.input;
                point.output_cost += cost_parts.output;
                point.cache_creation_cost += cost_parts.cache_creation;
                point.cache_read_cost += cost_parts.cache_read;
                sessions.insert(r.session_id.as_str());
            }
            point.sessions = sessions.len() as u64;
            point.by_model = aggregate_model_stats(&items);
            point
        })
        .collect();
    list.sort_by_key(|item| item.bucket_start_ms);
    list
}

// ============ Tauri commands ============

#[tauri::command]
pub async fn get_usage_summary(
    filter: UsageFilter,
    state: State<'_, UsageState>,
) -> Result<UsageSummary, String> {
    let pool = state.db_pool()?;
    let (pricing, state_last_scan_ms) = {
        let inner = state.inner.read().map_err(|e| e.to_string())?;
        (inner.pricing.clone(), inner.last_scan_ms)
    };
    let records = load_usage_records_db(&pool, &filter).await?;
    let filtered = apply_filter(&records, &filter, &pricing);

    let mut sessions: HashSet<&str> = HashSet::new();
    let mut projects: HashSet<&str> = HashSet::new();
    let mut total = UsageSummary {
        last_scan_ms: state_last_scan_ms.or(load_last_scan_ms_db(&pool).await?),
        pricing: pricing.clone(),
        ..Default::default()
    };

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
    let all_records = load_usage_records_db(&pool, &UsageFilter::default()).await?;
    let mut unknown_models: HashSet<String> = HashSet::new();
    for r in &all_records {
        project_set
            .entry(r.project_path.clone())
            .or_insert_with(|| r.project_dir.clone());
        model_set.insert(r.model.clone());
        if match_model_price(&r.model, &pricing).is_none() {
            unknown_models.insert(r.model.clone());
        }
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
    total.unknown_models = unknown_models.into_iter().collect();
    total.unknown_models.sort();
    total.all_projects = all_projects;
    total.all_models = all_models;
    Ok(total)
}

#[tauri::command]
pub async fn get_usage_daily(
    filter: UsageFilter,
    state: State<'_, UsageState>,
) -> Result<Vec<DailyUsage>, String> {
    let pool = state.db_pool()?;
    let pricing = state
        .inner
        .read()
        .map_err(|e| e.to_string())?
        .pricing
        .clone();
    let records = load_usage_records_db(&pool, &filter).await?;
    let filtered = apply_filter(&records, &filter, &pricing);

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
pub async fn get_usage_time_series(
    filter: UsageFilter,
    granularity: UsageTimeGranularity,
    state: State<'_, UsageState>,
) -> Result<Vec<UsageTimeSeriesPoint>, String> {
    let pool = state.db_pool()?;
    let pricing = state
        .inner
        .read()
        .map_err(|e| e.to_string())?
        .pricing
        .clone();
    let records = load_usage_records_db(&pool, &filter).await?;
    Ok(aggregate_time_series(
        &records,
        &filter,
        &pricing,
        granularity,
    ))
}

#[tauri::command]
pub async fn get_usage_by_project(
    filter: UsageFilter,
    state: State<'_, UsageState>,
) -> Result<Vec<ProjectUsage>, String> {
    let pool = state.db_pool()?;
    let pricing = state
        .inner
        .read()
        .map_err(|e| e.to_string())?
        .pricing
        .clone();
    let records = load_usage_records_db(&pool, &filter).await?;
    let filtered = apply_filter(&records, &filter, &pricing);

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
    list.sort_by(|a, b| {
        b.cost
            .partial_cmp(&a.cost)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    Ok(list)
}

#[tauri::command]
pub async fn get_usage_by_session(
    filter: UsageFilter,
    state: State<'_, UsageState>,
) -> Result<Vec<SessionUsage>, String> {
    let pool = state.db_pool()?;
    let pricing = state
        .inner
        .read()
        .map_err(|e| e.to_string())?
        .pricing
        .clone();
    let records = load_usage_records_db(&pool, &filter).await?;
    let filtered = apply_filter(&records, &filter, &pricing);

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
pub async fn get_usage_by_model(
    filter: UsageFilter,
    state: State<'_, UsageState>,
) -> Result<Vec<ModelUsageStat>, String> {
    let pool = state.db_pool()?;
    let pricing = state
        .inner
        .read()
        .map_err(|e| e.to_string())?
        .pricing
        .clone();
    let records = load_usage_records_db(&pool, &filter).await?;
    let filtered = apply_filter(&records, &filter, &pricing);
    Ok(aggregate_model_stats(&filtered))
}

#[tauri::command]
pub async fn get_session_usage_detail(
    session_id: String,
    state: State<'_, UsageState>,
) -> Result<SessionUsageDetail, String> {
    let pool = state.db_pool()?;
    let records = load_usage_records_db(
        &pool,
        &UsageFilter {
            session_id: Some(session_id.clone()),
            ..Default::default()
        },
    )
    .await?;
    let session_records: Vec<&UsageRecord> = records
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
    let table = apply_new_pricing(&state, table).await?;
    let _ = app.emit("usage-pricing-updated", ());
    log::info!(
        "event=usage.pricing.refresh status=ok models={} source=network",
        table.models.len()
    );
    Ok(table)
}

#[tauri::command]
pub async fn rescan_usage(state: State<'_, UsageState>) -> Result<ScanResult, String> {
    scan_all(&state, true).await
}

// ============ 启动入口 ============

/// 在 lib.rs setup 中调用：构造状态、加载价格、启动后台扫描与价格刷新、监听 watcher 事件。
pub fn start_usage_runtime(app: &tauri::App) -> Result<(), String> {
    let state = UsageState::new();
    let pricing = load_pricing();
    let app_handle = app.handle().clone();
    let pool = tauri::async_runtime::block_on(usage_db_pool_from_handle(&app_handle))?;
    tauri::async_runtime::block_on(initialize_usage_database(&pool))?;
    state.set_db_pool(pool.clone())?;
    if let Ok(mut inner) = state.inner.write() {
        inner.pricing = pricing;
        inner.last_scan_ms =
            tauri::async_runtime::block_on(load_last_scan_ms_db(&pool)).unwrap_or_default();
    }
    app.manage(state);

    let app_handle = app.handle().clone();
    tauri::async_runtime::spawn(async move {
        // 1. 启动全量扫描
        {
            let state = app_handle.state::<UsageState>();
            if let Err(e) = scan_all(&state, false).await {
                log::warn!("event=usage.scan status=warn err={e}");
            } else {
                let _ = app_handle.emit("usage-records-changed", ());
            }
        }
        // 2. 联网刷新价格
        match fetch_pricing_from_network().await {
            Ok(table) => {
                let state = app_handle.state::<UsageState>();
                match apply_new_pricing(&state, table).await {
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
    app.handle()
        .listen("claude-directory-changed", move |event| {
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
                match handle_files_changed(&state, files).await {
                    Ok(n) if n > 0 => {
                        let _ = app_handle.emit("usage-records-changed", ());
                    }
                    Ok(_) => {}
                    Err(e) => log::warn!("event=usage.incremental status=warn err={e}"),
                }
            });
        });
    Ok(())
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
    fn parse_jsonl_falls_back_to_top_level_cache_creation_when_object_is_zero() {
        let table = sample_pricing();
        let mut unknown = HashSet::new();
        let line = r#"{
            "type":"assistant",
            "sessionId":"sess-1",
            "timestamp":"2026-04-19T15:48:44.149Z",
            "cwd":"/tmp/demo",
            "message":{"id":"msg-cache","role":"assistant","model":"claude-opus-4-7",
                "usage":{"input_tokens":0,"output_tokens":0,
                    "cache_creation_input_tokens":60882,
                    "cache_read_input_tokens":0,
                    "cache_creation":{"ephemeral_5m_input_tokens":0,"ephemeral_1h_input_tokens":0}}}
        }"#;

        let r = parse_jsonl_line(line, "-tmp-demo", &table, &mut unknown).unwrap();

        assert_eq!(r.cache_creation_5m, 60882);
        assert_eq!(r.cache_creation_1h, 0);
        assert!(r.cost_usd > 0.0);
    }

    #[test]
    fn parse_jsonl_skips_user_records() {
        let table = sample_pricing();
        let mut unknown = HashSet::new();
        let line =
            r#"{"type":"user","sessionId":"s","timestamp":"2026-04-19T00:00:00Z","message":{}}"#;
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
        let off =
            scan_file_from_offset(&path, 0, "dir", &pricing, &mut unknown, &mut seen, &mut out)
                .unwrap();
        assert_eq!(out.len(), 2);
        assert_eq!(off, std::fs::metadata(&path).unwrap().len());

        // 追加一条 + 重复一条 msg-2
        let line3 = make_assistant_line("msg-3", "sess-1", "claude-opus-4-7", 50, 60);
        let line2_dup = make_assistant_line("msg-2", "sess-1", "claude-opus-4-7", 30, 40);
        std::fs::write(&path, format!("{line1}\n{line2}\n{line3}\n{line2_dup}\n")).unwrap();
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
    fn scan_file_keeps_largest_usage_snapshot_for_duplicate_message_id() {
        let dir = tempdir();
        let path = dir.join("session.jsonl");
        let pricing = sample_pricing();
        let mut unknown = HashSet::new();
        let mut seen = HashSet::new();
        let mut out: Vec<UsageRecord> = Vec::new();

        let line_low = make_assistant_line("msg-dup", "sess-1", "claude-opus-4-7", 10, 20);
        let line_high = make_assistant_line("msg-dup", "sess-1", "claude-opus-4-7", 10, 120);
        std::fs::write(&path, format!("{line_low}\n{line_high}\n")).unwrap();

        scan_file_from_offset(&path, 0, "dir", &pricing, &mut unknown, &mut seen, &mut out)
            .unwrap();

        assert_eq!(out.len(), 1);
        assert_eq!(out[0].output_tokens, 120);
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

        let off =
            scan_file_from_offset(&path, 0, "dir", &pricing, &mut unknown, &mut seen, &mut out)
                .unwrap();
        assert_eq!(out.len(), 1, "complete line parsed");
        // offset 应停在第一行末（含换行），避免重复读到不完整行
        assert_eq!(off, (line1.len() + 1) as u64);
    }

    #[test]
    fn usage_file_detection_includes_subagent_jsonl_under_project_dir() {
        let root = PathBuf::from("/tmp/home/.claude/projects");
        let main_file = root.join("-tmp-demo").join("session-1.jsonl");
        let subagent_file = root
            .join("-tmp-demo")
            .join("session-1")
            .join("subagents")
            .join("agent-a.jsonl");
        let meta_file = root
            .join("-tmp-demo")
            .join("session-1")
            .join("subagents")
            .join("agent-a.meta.json");

        let main = identify_usage_file(&root, &main_file).unwrap();
        assert_eq!(main.project_dir_name, "-tmp-demo");
        assert_eq!(main.path, main_file);

        let subagent = identify_usage_file(&root, &subagent_file).unwrap();
        assert_eq!(subagent.project_dir_name, "-tmp-demo");
        assert_eq!(subagent.path, subagent_file);

        assert!(identify_usage_file(&root, &meta_file).is_none());
    }

    #[cfg(unix)]
    #[test]
    fn collect_usage_files_skips_symlink_files_and_dirs() {
        let root = tempdir().join("projects");
        let project_dir = root.join("-tmp-demo");
        let subagent_dir = project_dir.join("session-1").join("subagents");
        std::fs::create_dir_all(&subagent_dir).unwrap();

        let regular_file = project_dir.join("session-1.jsonl");
        let target_file = project_dir.join("target.jsonl");
        let symlink_file = project_dir.join("linked.jsonl");
        let target_dir = root.join("-linked-target");
        let symlink_dir = root.join("-linked-project");
        std::fs::write(&regular_file, "").unwrap();
        std::fs::write(&target_file, "").unwrap();
        std::fs::create_dir_all(&target_dir).unwrap();
        std::fs::write(target_dir.join("session-2.jsonl"), "").unwrap();
        std::os::unix::fs::symlink(&target_file, &symlink_file).unwrap();
        std::os::unix::fs::symlink(&target_dir, &symlink_dir).unwrap();

        let files = collect_usage_files(&root);
        let paths = files
            .iter()
            .map(|file| file.path.clone())
            .collect::<Vec<_>>();

        assert!(paths.contains(&regular_file));
        assert!(paths.contains(&target_file));
        assert!(!paths.contains(&symlink_file));
        assert!(!paths.contains(&symlink_dir.join("session-2.jsonl")));
    }

    #[test]
    fn scan_all_includes_subagent_usage_in_parent_project_and_session() {
        tauri::async_runtime::block_on(async {
            let home = tempdir();
            let projects = home.join(".claude").join("projects").join("-tmp-demo");
            let projects_root = home.join(".claude").join("projects");
            let main_file = projects.join("sess-1.jsonl");
            let subagent_dir = projects.join("sess-1").join("subagents");
            let subagent_file = subagent_dir.join("agent-a.jsonl");
            std::fs::create_dir_all(&subagent_dir).unwrap();
            std::fs::write(
                &main_file,
                format!(
                    "{}\n{}\n",
                    make_assistant_line("msg-main", "sess-1", "claude-opus-4-7", 10, 20),
                    make_assistant_line("msg-dup", "sess-1", "claude-opus-4-7", 30, 40)
                ),
            )
            .unwrap();
            std::fs::write(
                &subagent_file,
                format!(
                    "{}\n{}\n",
                    make_assistant_line("msg-subagent", "sess-1", "claude-opus-4-7", 50, 60),
                    make_assistant_line("msg-dup", "sess-1", "claude-opus-4-7", 30, 40)
                ),
            )
            .unwrap();

            let (state, pool) = test_usage_state().await;

            let result = scan_all_in_projects_dir(&state, true, projects_root)
                .await
                .unwrap();
            let records = load_usage_records_db(&pool, &UsageFilter::default())
                .await
                .unwrap();

            assert_eq!(result.files_scanned, 2);
            assert_eq!(result.new_records, 3);
            assert_eq!(records.len(), 3);
            assert!(records.iter().all(|r| r.project_dir == "-tmp-demo"));
            assert!(records.iter().all(|r| r.session_id == "sess-1"));
            assert!(records.iter().any(|r| r.message_id == "msg-subagent"));
        });
    }

    #[test]
    fn incremental_scan_keeps_subagent_file_on_parent_project_dir() {
        tauri::async_runtime::block_on(async {
            let home = tempdir();
            let projects_root = home.join(".claude").join("projects");
            let subagent_dir = home
                .join(".claude")
                .join("projects")
                .join("-tmp-demo")
                .join("sess-1")
                .join("subagents");
            let subagent_file = subagent_dir.join("agent-a.jsonl");
            std::fs::create_dir_all(&subagent_dir).unwrap();
            std::fs::write(
                &subagent_file,
                format!(
                    "{}\n",
                    make_assistant_line("msg-subagent", "sess-1", "claude-opus-4-7", 50, 60)
                ),
            )
            .unwrap();

            let (state, pool) = test_usage_state().await;

            let new_records =
                handle_files_changed_in_projects_dir(&state, vec![subagent_file], projects_root)
                    .await
                    .unwrap();
            let records = load_usage_records_db(&pool, &UsageFilter::default())
                .await
                .unwrap();

            assert_eq!(new_records, 1);
            assert_eq!(records.len(), 1);
            assert_eq!(records[0].project_dir, "-tmp-demo");
            assert_eq!(records[0].session_id, "sess-1");
        });
    }

    #[test]
    fn incremental_scan_replaces_duplicate_message_with_larger_snapshot() {
        tauri::async_runtime::block_on(async {
            let home = tempdir();
            let projects_root = home.join(".claude").join("projects");
            let project_dir = home.join(".claude").join("projects").join("-tmp-demo");
            let usage_file = project_dir.join("sess-1.jsonl");
            std::fs::create_dir_all(&project_dir).unwrap();

            let low = make_assistant_line("msg-dup", "sess-1", "claude-opus-4-7", 10, 20);
            let high = make_assistant_line("msg-dup", "sess-1", "claude-opus-4-7", 10, 120);
            std::fs::write(&usage_file, format!("{low}\n")).unwrap();

            let (state, pool) = test_usage_state().await;

            assert_eq!(
                handle_files_changed_in_projects_dir(
                    &state,
                    vec![usage_file.clone()],
                    projects_root.clone(),
                )
                .await
                .unwrap(),
                1
            );
            std::fs::write(&usage_file, format!("{low}\n{high}\n")).unwrap();

            assert_eq!(
                handle_files_changed_in_projects_dir(&state, vec![usage_file], projects_root)
                    .await
                    .unwrap(),
                1
            );
            let records = load_usage_records_db(&pool, &UsageFilter::default())
                .await
                .unwrap();
            assert_eq!(records.len(), 1);
            assert_eq!(records[0].output_tokens, 120);
        });
    }

    #[test]
    fn sqlite_usage_store_round_trips_file_index() {
        tauri::async_runtime::block_on(async {
            let pool = test_usage_pool().await;
            let mut index = HashMap::new();
            index.insert(
                PathBuf::from("/tmp/demo/session.jsonl"),
                FileIndex {
                    mtime_ms: 10,
                    size: 20,
                    last_offset: 30,
                },
            );

            replace_file_index_db(&pool, &index).await.unwrap();
            let loaded = load_file_index_db(&pool).await.unwrap();

            assert_eq!(loaded, index);
        });
    }

    #[test]
    fn sqlite_usage_store_keeps_largest_duplicate_snapshot() {
        tauri::async_runtime::block_on(async {
            let pool = test_usage_pool().await;
            let low = make_usage_record("msg-dup", "sess-1", 10, 20);
            let high = make_usage_record("msg-dup", "sess-1", 10, 120);

            assert_eq!(merge_usage_records_db(&pool, &[low]).await.unwrap(), 1);
            assert_eq!(merge_usage_records_db(&pool, &[high]).await.unwrap(), 1);

            let records = load_usage_records_db(&pool, &UsageFilter::default())
                .await
                .unwrap();
            assert_eq!(records.len(), 1);
            assert_eq!(records[0].output_tokens, 120);
        });
    }

    #[test]
    fn sqlite_usage_store_supports_filtered_records() {
        tauri::async_runtime::block_on(async {
            let pool = test_usage_pool().await;
            let mut first = make_usage_record("msg-1", "sess-1", 10, 20);
            first.project_path = "/tmp/one".into();
            first.project_dir = "-tmp-one".into();
            first.model = "claude-opus-4-7".into();
            first.timestamp_ms = parse_iso8601_ms("2026-04-19T12:00:00Z").unwrap();
            let mut second = make_usage_record("msg-2", "sess-2", 30, 40);
            second.project_path = "/tmp/two".into();
            second.project_dir = "-tmp-two".into();
            second.model = "claude-sonnet-4-6".into();
            second.timestamp_ms = parse_iso8601_ms("2026-04-20T12:00:00Z").unwrap();

            merge_usage_records_db(&pool, &[first, second])
                .await
                .unwrap();
            let records = load_usage_records_db(
                &pool,
                &UsageFilter {
                    start_date: Some("2026-04-19".into()),
                    end_date: Some("2026-04-19".into()),
                    project_path: Some("/tmp/one".into()),
                    model: Some("claude-opus-4-7".into()),
                    ..Default::default()
                },
            )
            .await
            .unwrap();

            assert_eq!(records.len(), 1);
            assert_eq!(records[0].message_id, "msg-1");
        });
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

    fn make_usage_record(id: &str, sess: &str, input: u64, output: u64) -> UsageRecord {
        let pricing = sample_pricing();
        let raw = RawUsage {
            input_tokens: input,
            output_tokens: output,
            cache_creation_5m: 0,
            cache_creation_1h: 0,
            cache_read: 0,
        };
        UsageRecord {
            message_id: id.into(),
            session_id: sess.into(),
            project_path: "/tmp/demo".into(),
            project_dir: "-tmp-demo".into(),
            timestamp_ms: parse_iso8601_ms("2026-04-19T15:48:44.149Z").unwrap(),
            model: "claude-opus-4-7".into(),
            input_tokens: input,
            output_tokens: output,
            cache_creation_5m: 0,
            cache_creation_1h: 0,
            cache_read: 0,
            cost_usd: compute_cost("claude-opus-4-7", &pricing, &raw),
            git_branch: Some("main".into()),
            cc_version: Some("2.1.114".into()),
        }
    }

    async fn test_usage_pool() -> sqlx::SqlitePool {
        let pool = sqlx::sqlite::SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .unwrap();
        initialize_usage_database(&pool).await.unwrap();
        pool
    }

    async fn test_usage_state() -> (UsageState, sqlx::SqlitePool) {
        let pool = test_usage_pool().await;
        let state = UsageState::new();
        state.set_db_pool(pool.clone()).unwrap();
        state.inner.write().unwrap().pricing = sample_pricing();
        (state, pool)
    }

    fn tempdir() -> std::path::PathBuf {
        let counter = TEST_DIR_COUNTER.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        let base = std::env::temp_dir().join(format!(
            "ai-manager-usage-test-{}-{}-{}",
            std::process::id(),
            now_ms(),
            counter
        ));
        std::fs::create_dir_all(&base).unwrap();
        base
    }

    static TEST_DIR_COUNTER: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);

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
    fn apply_filter_respects_local_date_range() {
        let pricing = sample_pricing();
        let noon = |date: &str| parse_local_date_to_ms(date, false).unwrap() + 12 * 60 * 60 * 1000;
        let mk = |id: &str, date: &str| UsageRecord {
            message_id: id.into(),
            session_id: "s".into(),
            project_path: "/p".into(),
            project_dir: "-p".into(),
            timestamp_ms: noon(date),
            model: "claude-sonnet-4-6".into(),
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
            mk("before", "2026-04-18"),
            mk("inside", "2026-04-19"),
            mk("after", "2026-04-20"),
        ];

        let f = UsageFilter {
            start_date: Some("2026-04-19".into()),
            end_date: Some("2026-04-19".into()),
            ..Default::default()
        };
        let r = apply_filter(&records, &f, &pricing);

        assert_eq!(r.len(), 1);
        assert_eq!(r[0].message_id, "inside");
    }

    #[test]
    fn aggregate_time_series_supports_hour_and_five_minute_buckets() {
        let pricing = sample_pricing();
        let start = parse_local_date_to_ms("2026-04-19", false).unwrap();
        let mk = |id: &str, session: &str, offset_ms: i64, model: &str, cost: f64| UsageRecord {
            message_id: id.into(),
            session_id: session.into(),
            project_path: "/p".into(),
            project_dir: "-p".into(),
            timestamp_ms: start + offset_ms,
            model: model.into(),
            input_tokens: 10,
            output_tokens: 20,
            cache_creation_5m: 3,
            cache_creation_1h: 4,
            cache_read: 5,
            cost_usd: cost,
            git_branch: None,
            cc_version: None,
        };
        let records = vec![
            mk(
                "a",
                "s1",
                10 * 60 * 60 * 1000 + 2 * 60 * 1000,
                "claude-opus-4-7",
                1.25,
            ),
            mk(
                "b",
                "s1",
                10 * 60 * 60 * 1000 + 6 * 60 * 1000,
                "claude-opus-4-7",
                2.0,
            ),
            mk(
                "c",
                "s2",
                11 * 60 * 60 * 1000 + 1_000,
                "claude-sonnet-4-6",
                3.0,
            ),
        ];
        let filter = UsageFilter {
            start_date: Some("2026-04-19".into()),
            end_date: Some("2026-04-19".into()),
            ..Default::default()
        };

        let hourly = aggregate_time_series(&records, &filter, &pricing, UsageTimeGranularity::Hour);
        assert_eq!(hourly.len(), 2);
        assert_eq!(hourly[0].bucket, "2026-04-19 10:00");
        assert_eq!(hourly[0].messages, 2);
        assert_eq!(hourly[0].sessions, 1);
        assert_eq!(hourly[0].input_tokens, 20);
        assert_eq!(hourly[0].cache_creation_tokens, 14);
        assert!((hourly[0].cost - 3.25).abs() < f64::EPSILON);
        assert!((hourly[0].input_cost - 0.0001).abs() < f64::EPSILON);
        assert!((hourly[0].output_cost - 0.001).abs() < f64::EPSILON);
        assert!((hourly[0].cache_creation_cost - 0.0000875).abs() < f64::EPSILON);
        assert!((hourly[0].cache_read_cost - 0.000005).abs() < f64::EPSILON);
        assert_eq!(hourly[1].bucket, "2026-04-19 11:00");
        assert_eq!(hourly[1].sessions, 1);

        let five_minute = aggregate_time_series(
            &records,
            &filter,
            &pricing,
            UsageTimeGranularity::FiveMinute,
        );
        assert_eq!(five_minute.len(), 3);
        assert_eq!(five_minute[0].bucket, "2026-04-19 10:00");
        assert_eq!(five_minute[1].bucket, "2026-04-19 10:05");
        assert_eq!(five_minute[2].bucket, "2026-04-19 11:00");
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

    #[test]
    fn aggregate_filters_by_claude_model_prefix() {
        let pricing = sample_pricing();
        let mk = |id: &str, model: &str| UsageRecord {
            message_id: id.into(),
            session_id: "s".into(),
            project_path: "/p".into(),
            project_dir: "-p".into(),
            timestamp_ms: parse_iso8601_ms("2026-04-19T10:00:00Z").unwrap(),
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
            mk("a", "claude-opus-4-7"),
            mk("b", "claude-sonnet-4-6"),
            mk("c", "mimo-v2-pro"),
        ];

        let f = UsageFilter {
            model: Some("claude-*".into()),
            ..Default::default()
        };
        let r = apply_filter(&records, &f, &pricing);
        let ids = r
            .into_iter()
            .map(|record| record.message_id.as_str())
            .collect::<Vec<_>>();

        assert_eq!(ids, vec!["a", "b"]);
    }
}
