use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;

/// ~/.claude.json 中的模型使用统计
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ModelUsage {
    #[serde(default)]
    pub input_tokens: u64,
    #[serde(default)]
    pub output_tokens: u64,
    #[serde(default)]
    pub cache_read_input_tokens: u64,
    #[serde(default)]
    pub cache_creation_input_tokens: u64,
    #[serde(default)]
    pub web_search_requests: u64,
    #[serde(default, alias = "costUSD")]
    pub cost_usd: f64,
}

/// 会话性能指标
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub struct SessionMetrics {
    #[serde(default)]
    pub frame_duration_ms_avg: f64,
    #[serde(default)]
    pub frame_duration_ms_p95: f64,
    #[serde(default)]
    pub hook_duration_ms_avg: Option<f64>,
    #[serde(default)]
    pub hook_duration_ms_p95: Option<f64>,
    #[serde(default)]
    pub hook_duration_ms_count: Option<u64>,
    #[serde(default)]
    pub pre_tool_hook_duration_ms_avg: Option<f64>,
    #[serde(default)]
    pub pre_tool_hook_duration_ms_p95: Option<f64>,
}

/// 使用条目（工具和 Skill 通用）
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct UsageEntry {
    #[serde(default)]
    pub usage_count: u32,
    #[serde(default)]
    pub last_used_at: u64,
}

/// 项目级统计
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ProjectStats {
    #[serde(default)]
    pub last_cost: f64,
    #[serde(default)]
    pub last_duration: u64,
    #[serde(default)]
    pub last_model_usage: HashMap<String, ModelUsage>,
    #[serde(default)]
    pub last_session_metrics: Option<SessionMetrics>,
    #[serde(default)]
    pub last_total_input_tokens: u64,
    #[serde(default)]
    pub last_total_output_tokens: u64,
    #[serde(default)]
    pub last_total_cache_creation_input_tokens: u64,
    #[serde(default)]
    pub last_total_cache_read_input_tokens: u64,
}

/// 从 ~/.claude.json 解析的完整统计数据
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeStats {
    #[serde(default)]
    pub num_startups: u32,
    #[serde(default)]
    pub first_start_time: Option<String>,
    #[serde(default)]
    pub projects: HashMap<String, ProjectStats>,
    #[serde(default)]
    pub tool_usage: HashMap<String, UsageEntry>,
    #[serde(default)]
    pub skill_usage: HashMap<String, UsageEntry>,
}

/// 快照条目
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Snapshot {
    pub timestamp: u64,
    pub data: ClaudeStats,
}

/// 快照历史存储结构
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct StatsHistory {
    #[serde(default)]
    pub snapshots: Vec<Snapshot>,
}

/// 获取 ~/.claude.json 路径
fn get_claude_json_path() -> PathBuf {
    crate::utils::home_dir_or_fallback().join(".claude.json")
}

/// 获取快照存储路径
fn get_stats_history_path() -> PathBuf {
    crate::utils::get_app_data_dir().join("stats_history.json")
}

/// 从 ~/.claude.json 读取统计数据
fn read_claude_stats() -> ClaudeStats {
    let path = get_claude_json_path();
    crate::utils::read_json_file(&path)
}

/// 加载快照历史
fn load_stats_history() -> StatsHistory {
    let path = get_stats_history_path();
    crate::utils::read_json_file(&path)
}

/// 保存快照历史（使用紧凑 JSON 减少磁盘占用）
fn save_stats_history(history: &StatsHistory) -> Result<(), String> {
    let path = get_stats_history_path();
    let content = serde_json::to_string(history).map_err(|e| e.to_string())?;
    crate::utils::ensure_dir_and_write(&path, &content)
}

/// 90 天（秒）
const RETENTION_SECONDS: u64 = 90 * 24 * 60 * 60;

/// 最大快照保留条数（防止无限增长）
const MAX_SNAPSHOTS: usize = 500;

/// 执行快照（内部逻辑，加锁前调用）
fn take_snapshot_inner() -> Result<(), String> {
    let stats = read_claude_stats();
    let now = crate::utils::current_timestamp();
    let mut history = load_stats_history();

    // 去重：与最后一次快照数据相同则跳过
    if let Some(last) = history.snapshots.last() {
        if last.data == stats {
            return Ok(());
        }
    }

    // 清理超过 90 天的快照
    let cutoff = now.saturating_sub(RETENTION_SECONDS);
    history.snapshots.retain(|s| s.timestamp >= cutoff);

    // 超出数量上限时，移除最旧的条目
    if history.snapshots.len() >= MAX_SNAPSHOTS {
        let remove_count = history.snapshots.len() - MAX_SNAPSHOTS + 1;
        history.snapshots.drain(0..remove_count);
    }

    // 新增快照
    history.snapshots.push(Snapshot {
        timestamp: now,
        data: stats,
    });

    save_stats_history(&history)
}

/// 获取当前统计数据
#[tauri::command]
pub fn get_stats() -> Result<ClaudeStats, String> {
    Ok(read_claude_stats())
}

/// 获取历史快照
#[tauri::command]
pub fn get_stats_history() -> Result<Vec<Snapshot>, String> {
    Ok(load_stats_history().snapshots)
}

/// 手动触发快照
#[tauri::command]
pub fn take_stats_snapshot() -> Result<(), String> {
    let _lock = crate::utils::lock_stats()?;
    take_snapshot_inner()
}

/// 启动定时快照线程（每 1 小时执行一次）
pub fn start_snapshot_timer() {
    std::thread::spawn(|| {
        // 启动时立即执行一次快照
        {
            if let Ok(_lock) = crate::utils::STATS_LOCK.lock() {
                let _ = take_snapshot_inner();
            }
        }
        loop {
            std::thread::sleep(std::time::Duration::from_secs(3600));
            if let Ok(_lock) = crate::utils::STATS_LOCK.lock() {
                let _ = take_snapshot_inner();
            }
        }
    });
}
