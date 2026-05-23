//! 集成测试：~/.claude.json 统计快照端到端。
//!
//! 验证 get_stats 在隔离 home 下能正确解析项目级 lastSessionId、模型用量与扩展字段，
//! 并在损坏 / 缺文件 / 未知顶层字段三种边界下都降级为安全的 Default。

mod common;

use ai_manager_lib::test_api::{get_stats, ClaudeStats};
use common::IntegrationEnv;
use serial_test::serial;

#[test]
#[serial]
fn get_stats_returns_default_when_claude_json_missing() {
    let _env = IntegrationEnv::new("stats-missing");
    let stats = get_stats().expect("缺文件时应返回 Default 而不是 Err");
    assert_eq!(stats, ClaudeStats::default());
}

#[test]
#[serial]
fn get_stats_reads_real_payload_with_projects_and_tool_usage() {
    let env = IntegrationEnv::new("stats-real");
    env.write_claude_file(
        "../.claude.json",
        r#"{
            "numStartups": 7,
            "projects": {
                "/Users/demo/proj-a": {
                    "lastCost": 1.5,
                    "lastSessionId": "sess-a",
                    "lastSessionFirstPrompt": "重构这个模块",
                    "lastModelUsage": {
                        "claude-opus-4-7": {
                            "inputTokens": 1000,
                            "outputTokens": 500,
                            "costUsd": 1.5
                        }
                    }
                }
            },
            "toolUsage": {
                "Read": {"usageCount": 12, "lastUsedAt": 1700000000}
            }
        }"#,
    );

    let stats = get_stats().expect("正常文件应能读取");

    assert_eq!(stats.num_startups, 7);
    let proj = stats
        .projects
        .get("/Users/demo/proj-a")
        .expect("应包含 proj-a");
    assert_eq!(proj.last_session_id.as_deref(), Some("sess-a"));
    assert_eq!(
        proj.last_session_first_prompt.as_deref(),
        Some("重构这个模块")
    );
    let model_usage = proj.last_model_usage.as_ref().expect("model usage 应存在");
    let opus = model_usage.get("claude-opus-4-7").expect("opus 模型应存在");
    assert_eq!(opus.input_tokens, 1000);

    let read_usage = stats.tool_usage.get("Read").expect("Read 工具应存在");
    assert_eq!(read_usage.usage_count, 12);
}

#[test]
#[serial]
fn get_stats_returns_default_when_claude_json_is_malformed() {
    let env = IntegrationEnv::new("stats-malformed");
    env.write_claude_file("../.claude.json", "{this is not valid json");

    let stats = get_stats().expect("损坏文件应降级为 Default，不应阻塞前端");
    assert_eq!(stats, ClaudeStats::default());
}

#[test]
#[serial]
fn get_stats_tolerates_unknown_top_level_fields() {
    let env = IntegrationEnv::new("stats-unknown");
    env.write_claude_file(
        "../.claude.json",
        r#"{
            "numStartups": 1,
            "newFutureField": {"foo": "bar"}
        }"#,
    );

    let stats = get_stats().expect("未知字段不应导致 Err");
    assert_eq!(stats.num_startups, 1);
}
