//! 集成测试：对话线程 jsonl 持久化端到端往返。
//!
//! 验证 save_conversation 落盘 + load_conversation 读回，结果完全一致。

mod common;

use code_manager_lib::test_api;
use common::IntegrationEnv;
use serial_test::serial;

#[test]
#[serial]
fn conversation_round_trips_under_isolated_env() {
    let _env = IntegrationEnv::new("conversation-rtt");
    let msgs = vec![test_api::sample_conversation_message(
        "u1",
        "user",
        "总结昨天",
    )];
    test_api::save_conversation(msgs.clone()).unwrap();
    let loaded = test_api::load_conversation().unwrap();
    assert_eq!(loaded.len(), 1);
    assert_eq!(loaded[0].id, "u1");
    assert_eq!(loaded[0].content, "总结昨天");
}
