//! 集成测试：~/.claude/history.jsonl 与 ~/.claude/projects/<encoded>/<id>.jsonl 端到端。
//!
//! 走 lib 公开的 test_api 入口，模拟真实用户目录布局，验证 history 与 session detail
//! 的读取链路在跨模块调用时仍然一致。

mod common;

use ai_manager_lib::test_api::{
    MessageBlock, SessionDetail, get_history, get_history_if_changed, get_session_detail,
};
use common::IntegrationEnv;
use serial_test::serial;

#[test]
#[serial]
fn get_history_reads_real_jsonl_under_isolated_home() {
    let env = IntegrationEnv::new("history-read");
    // 真实 history.jsonl 是若干 user 输入行
    env.write_claude_file(
        "history.jsonl",
        "{\"project\":\"/p1\",\"sessionId\":\"s1\",\"timestamp\":1,\"role\":\"user\",\"text\":\"hi\"}\n\
         {\"project\":\"/p1\",\"sessionId\":\"s1\",\"timestamp\":2,\"role\":\"user\",\"text\":\"bye\"}\n",
    );

    let result = get_history().expect("get_history 应成功");

    assert!(result.content.contains("\"text\":\"hi\""));
    assert!(result.content.contains("\"text\":\"bye\""));
    assert!(result.mtime > 0, "mtime 应来自真实文件元数据");
}

#[test]
#[serial]
fn get_history_if_changed_round_trips_with_real_mtime() {
    let env = IntegrationEnv::new("history-if-changed");
    env.write_claude_file("history.jsonl", "{\"role\":\"user\",\"text\":\"a\"}\n");

    let first = get_history().expect("初次读取应成功");
    // 同 mtime 应返回 None
    let unchanged =
        get_history_if_changed(first.mtime).expect("同 mtime 调用应正常返回");
    assert!(unchanged.is_none(), "mtime 未变时应返回 None");

    // 用一个明显小于真实 mtime 的值，应返回 Some
    let changed =
        get_history_if_changed(0).expect("mtime=0 必触发重读").expect("应返回 Some");
    assert_eq!(changed.content, first.content);
}

#[test]
#[serial]
fn get_session_detail_parses_real_session_file_layout() {
    // 项目路径 /Users/demo/proj 经 encoded_project_path 编码为 -Users-demo-proj
    let env = IntegrationEnv::new("session-layout");
    let project = "/Users/demo/proj";
    let session_id = "abc-123";
    env.write_claude_file(
        &format!(
            "projects/-Users-demo-proj/{}.jsonl",
            session_id
        ),
        // 一行 assistant 调 tool_use，下一行 user 全是 tool_result（应合并到上一条 assistant）
        "{\"type\":\"assistant\",\"timestamp\":\"2026-05-20T10:00:00Z\",\
         \"message\":{\"role\":\"assistant\",\"content\":[\
         {\"type\":\"text\",\"text\":\"开始读取\"},\
         {\"type\":\"tool_use\",\"name\":\"Read\",\"input\":{\"path\":\"a.md\"}}\
         ]}}\n\
         {\"type\":\"user\",\
         \"message\":{\"role\":\"user\",\"content\":[\
         {\"type\":\"tool_result\",\"content\":\"file body\"}\
         ]}}\n",
    );

    let detail: SessionDetail =
        get_session_detail(project, session_id).expect("get_session_detail 应成功");

    assert_eq!(detail.session_id, session_id);
    assert_eq!(detail.project, project);
    assert_eq!(
        detail.messages.len(),
        1,
        "tool_result 合并后应只剩 1 条 assistant 消息"
    );
    let assistant = &detail.messages[0];
    assert_eq!(assistant.role, "assistant");
    assert_eq!(assistant.timestamp.as_deref(), Some("2026-05-20T10:00:00Z"));
    assert_eq!(assistant.blocks.len(), 3, "text + tool_use + tool_result");
    assert!(matches!(&assistant.blocks[0], MessageBlock::Text { text } if text == "开始读取"));
    assert!(matches!(&assistant.blocks[1], MessageBlock::ToolUse { name, .. } if name == "Read"));
    assert!(
        matches!(&assistant.blocks[2], MessageBlock::ToolResult { content } if content == "file body"),
    );
}

#[test]
#[serial]
fn get_session_detail_rejects_path_escape_with_real_filesystem_present() {
    // 即便底层目录存在，validate 也必须先拒绝带 `..` 的 session_id
    let env = IntegrationEnv::new("session-escape");
    env.write_claude_file("projects/-Users-demo-proj/legit.jsonl", "");

    let err = get_session_detail("/Users/demo/proj", "../legit")
        .expect_err("含 .. 的 session_id 必须被拒绝");
    assert!(err.contains("会话 ID"));
}
