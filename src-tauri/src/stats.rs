use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;

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
    pub last_session_id: Option<String>,
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
    #[serde(default)]
    pub last_session_modified: u64,
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
    #[serde(default)]
    pub last_plan_mode_use: Option<u64>,
    #[serde(default)]
    pub btw_use_count: Option<u32>,
}

/// 获取 ~/.claude.json 路径
fn get_claude_json_path() -> PathBuf {
    crate::utils::home_dir_or_fallback().join(".claude.json")
}

/// 从 ~/.claude.json 读取统计数据
fn read_claude_stats() -> ClaudeStats {
    let path = get_claude_json_path();
    crate::utils::read_json_file(&path)
}

/// 获取当前统计数据
#[tauri::command]
pub fn get_stats() -> Result<ClaudeStats, String> {
    Ok(read_claude_stats())
}

/// 用默认编辑器打开 ~/.claude.json
#[tauri::command]
pub fn open_claude_json_in_editor() -> Result<(), String> {
    let path = get_claude_json_path();
    if !path.exists() {
        return Err("~/.claude.json 不存在".to_string());
    }
    let preferences = crate::config::load_app_preferences();
    let editor = preferences
        .default_editor_app
        .as_deref()
        .ok_or_else(|| "请先在设置中选择默认编辑器".to_string())?;
    let app_name = crate::config::EDITOR_APPS
        .iter()
        .find(|(slug, _)| *slug == editor)
        .map(|(_, display)| *display)
        .ok_or_else(|| "默认编辑器配置无效，请重新选择".to_string())?;
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg("-a")
            .arg(app_name)
            .arg(&path)
            .status()
            .map_err(|e| format!("启动 {app_name} 失败: {e}"))
            .and_then(|s| {
                if s.success() {
                    Ok(())
                } else {
                    Err(format!(
                        "启动 {app_name} 失败，退出码: {:?}",
                        s.code()
                    ))
                }
            })
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (path, app_name);
        Err("当前平台暂不支持打开本地应用".to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::ClaudeStats;

    #[test]
    fn deserializes_project_last_session_id() {
        let json = r#"{
            "projects": {
                "/tmp/demo": {
                    "lastCost": 1.25,
                    "lastDuration": 4200,
                    "lastSessionId": "session-123"
                }
            }
        }"#;

        let stats: ClaudeStats = serde_json::from_str(json).expect("stats should deserialize");
        let project = stats
            .projects
            .get("/tmp/demo")
            .expect("project should exist");

        assert_eq!(project.last_session_id.as_deref(), Some("session-123"));
    }
}
