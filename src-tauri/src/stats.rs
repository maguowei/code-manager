use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;

/// 会话性能指标
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, specta::Type)]
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
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct UsageEntry {
    #[serde(default)]
    pub usage_count: u32,
    #[serde(default)]
    pub last_used_at: u64,
}

/// 单个模型的使用明细
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ModelUsageEntry {
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
    #[serde(default)]
    pub cost_usd: f64,
}

/// 项目级统计
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, specta::Type)]
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
    #[serde(default)]
    pub last_lines_added: u64,
    #[serde(default)]
    pub last_lines_removed: u64,
    #[serde(default)]
    pub last_total_web_search_requests: u64,
    #[serde(default)]
    pub last_model_usage: Option<HashMap<String, ModelUsageEntry>>,
    #[serde(default)]
    pub last_session_first_prompt: Option<String>,
}

/// 从 ~/.claude.json 解析的完整统计数据
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, specta::Type)]
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
#[specta::specta]
pub fn get_stats() -> Result<ClaudeStats, String> {
    Ok(read_claude_stats())
}

/// 用默认编辑器打开 ~/.claude.json
#[tauri::command]
#[specta::specta]
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
    crate::native_open::open_path_in_editor(&path, editor)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::env;
    use std::fs;
    use std::sync::MutexGuard;
    use std::time::{SystemTime, UNIX_EPOCH};

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

    #[test]
    fn deserializes_project_extended_fields() {
        let json = r#"{
            "projects": {
                "/tmp/demo": {
                    "lastCost": 5.5,
                    "lastDuration": 1000,
                    "lastLinesAdded": 120,
                    "lastLinesRemoved": 30,
                    "lastTotalWebSearchRequests": 2,
                    "lastModelUsage": {
                        "claude-opus-4-7": {
                            "inputTokens": 1000,
                            "outputTokens": 500,
                            "cacheReadInputTokens": 200,
                            "cacheCreationInputTokens": 100,
                            "webSearchRequests": 1,
                            "costUsd": 3.2
                        }
                    },
                    "lastSessionFirstPrompt": "帮我重构这个函数"
                }
            }
        }"#;

        let stats: ClaudeStats = serde_json::from_str(json).expect("stats should deserialize");
        let project = stats
            .projects
            .get("/tmp/demo")
            .expect("project should exist");

        assert_eq!(project.last_lines_added, 120);
        assert_eq!(project.last_lines_removed, 30);
        assert_eq!(project.last_total_web_search_requests, 2);
        assert_eq!(
            project.last_session_first_prompt.as_deref(),
            Some("帮我重构这个函数")
        );
        let model_usage = project
            .last_model_usage
            .as_ref()
            .expect("model usage should exist");
        let opus = model_usage
            .get("claude-opus-4-7")
            .expect("opus entry should exist");
        assert_eq!(opus.input_tokens, 1000);
        assert!((opus.cost_usd - 3.2).abs() < f64::EPSILON);
    }

    // ─── 隔离 ~/.claude.json 路径，覆盖 get_stats 与读取失败回退 ───

    struct StatsTestEnv {
        _guard: MutexGuard<'static, ()>,
        _config_guard: MutexGuard<'static, ()>,
        root: PathBuf,
        previous_home: Option<String>,
    }

    impl StatsTestEnv {
        fn new(name: &str) -> Self {
            let guard = crate::utils::TEST_ENV_LOCK
                .lock()
                .unwrap_or_else(|error| error.into_inner());
            // 同时获取 config 锁，避免与 config::tests 的 set_test_env 竞态
            let config_guard = crate::utils::lock_config().expect("配置锁应可获取");
            let suffix = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_nanos();
            let root = env::temp_dir().join(format!(
                "code-manager-stats-{name}-{}-{suffix}",
                std::process::id()
            ));
            fs::create_dir_all(&root).expect("应可创建测试目录");

            let previous_home = env::var("CODE_MANAGER_HOME_OVERRIDE").ok();
            env::set_var("CODE_MANAGER_HOME_OVERRIDE", &root);

            Self {
                _guard: guard,
                _config_guard: config_guard,
                root,
                previous_home,
            }
        }

        fn write_claude_json(&self, content: &str) {
            fs::write(self.root.join(".claude.json"), content).expect("写入 .claude.json 失败");
        }
    }

    impl Drop for StatsTestEnv {
        fn drop(&mut self) {
            match &self.previous_home {
                Some(value) => env::set_var("CODE_MANAGER_HOME_OVERRIDE", value),
                None => env::remove_var("CODE_MANAGER_HOME_OVERRIDE"),
            }
            let _ = fs::remove_dir_all(&self.root);
        }
    }

    #[test]
    fn get_stats_returns_default_when_claude_json_missing() {
        let _env = StatsTestEnv::new("missing");
        let stats = get_stats().expect("缺文件时应返回 Default 而不是 Err");
        assert_eq!(stats, ClaudeStats::default());
    }

    #[test]
    fn get_stats_returns_default_when_claude_json_is_malformed() {
        let env = StatsTestEnv::new("malformed");
        env.write_claude_json("{not valid json");

        let stats = get_stats().expect("read_json_file 应吞掉解析错误并返回 Default");
        assert_eq!(
            stats,
            ClaudeStats::default(),
            "损坏的 .claude.json 必须降级为默认值，避免阻塞前端"
        );
    }

    #[test]
    fn get_stats_reads_real_claude_json_payload() {
        let env = StatsTestEnv::new("ok");
        env.write_claude_json(
            r#"{
                "numStartups": 42,
                "projects": {
                    "/p1": {"lastCost": 1.0, "lastSessionId": "s-a"},
                    "/p2": {"lastCost": 2.0, "lastSessionId": "s-b"}
                },
                "toolUsage": {
                    "Read": {"usageCount": 3, "lastUsedAt": 1700000000}
                }
            }"#,
        );

        let stats = get_stats().expect("正常文件应能读取");
        assert_eq!(stats.num_startups, 42);
        assert_eq!(stats.projects.len(), 2);
        assert_eq!(
            stats
                .projects
                .get("/p1")
                .and_then(|p| p.last_session_id.as_deref()),
            Some("s-a")
        );
        let read_usage = stats
            .tool_usage
            .get("Read")
            .expect("tool usage 应包含 Read");
        assert_eq!(read_usage.usage_count, 3);
    }

    #[test]
    fn get_stats_tolerates_unknown_top_level_fields() {
        let env = StatsTestEnv::new("unknown-fields");
        // 真实 ~/.claude.json 可能含未知顶层键；serde 默认忽略未知字段不应让我们崩溃
        env.write_claude_json(
            r#"{
                "numStartups": 1,
                "newFutureField": {"foo": "bar"},
                "anotherUnknown": [1, 2, 3]
            }"#,
        );

        let stats = get_stats().expect("未知字段不应导致 Err");
        assert_eq!(stats.num_startups, 1);
    }

    #[test]
    fn open_claude_json_in_editor_errors_when_file_missing() {
        let _env = StatsTestEnv::new("editor-missing");
        let err = open_claude_json_in_editor().expect_err("缺文件时应明确报错，不应静默成功");
        assert!(err.contains(".claude.json"));
    }
}
