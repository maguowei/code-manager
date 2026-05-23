//! 集成测试：apply_profile_inner 端到端写盘 ~/.claude/settings.json。
//!
//! 验证配置系统最关键链路：Profile → resolve_profile_settings → 原子写入 settings.json
//! → 更新 config-registry.json 的 bindings。不依赖 Tauri AppHandle。

mod common;

use ai_manager_lib::test_api::{ConfigRegistry, apply_profile_inner};
use common::IntegrationEnv;
use serde_json::Value;
use serial_test::serial;
use std::fs;

/// 写入一个最小但合法的 config-registry.json，包含一个无 preset 的 profile。
fn seed_registry(env: &IntegrationEnv, profile_id: &str, settings: Value) {
    let registry = serde_json::json!({
        "$schema": "https://json.schemastore.org/ai-manager-config-registry.json",
        "version": 2,
        "app": {},
        "customPresets": [],
        "profiles": [{
            "id": profile_id,
            "name": profile_id,
            "description": "",
            "settings": settings,
            "createdAt": "2026-01-01T00:00:00Z",
            "updatedAt": "2026-01-01T00:00:00Z"
        }],
        "bindings": {}
    });
    env.write_app_data_file(
        "config-registry.json",
        &serde_json::to_string_pretty(&registry).unwrap(),
    );
}

#[test]
#[serial]
fn apply_profile_writes_settings_json_and_updates_binding() {
    let env = IntegrationEnv::new("apply-basic");
    seed_registry(
        &env,
        "demo-profile",
        serde_json::json!({
            "model": "claude-sonnet-4-6",
            "permissions": {"defaultMode": "plan"}
        }),
    );

    let registry: ConfigRegistry =
        apply_profile_inner("demo-profile".into()).expect("apply 应成功");

    // 1) settings.json 落到 ~/.claude/settings.json
    let settings_path = env.claude_dir().join("settings.json");
    assert!(settings_path.is_file(), "apply 后必须写入 settings.json");
    let raw = fs::read_to_string(&settings_path).unwrap();
    let written: Value = serde_json::from_str(&raw).expect("settings.json 应是合法 JSON");
    assert_eq!(written["model"], "claude-sonnet-4-6");
    assert_eq!(written["permissions"]["defaultMode"], "plan");
    assert!(
        written.get("$schema").is_some(),
        "resolve_profile_settings 应写入 $schema 字段"
    );

    // 2) registry 中 binding 已更新为该 profile
    assert_eq!(
        registry.bindings.user_profile_id.as_deref(),
        Some("demo-profile")
    );
    assert!(
        registry.bindings.user_last_applied_at.is_some(),
        "应记录 lastAppliedAt"
    );

    // 3) registry 文件也已被持久化
    let registry_path = env.app_data_dir().join("config-registry.json");
    let registry_raw = fs::read_to_string(&registry_path).unwrap();
    let registry_json: Value = serde_json::from_str(&registry_raw).unwrap();
    assert_eq!(registry_json["bindings"]["userProfileId"], "demo-profile");
}

#[test]
#[serial]
fn apply_profile_overwrites_settings_on_subsequent_apply() {
    let env = IntegrationEnv::new("apply-overwrite");
    seed_registry(&env, "p1", serde_json::json!({"model": "claude-opus-4-7"}));
    apply_profile_inner("p1".into()).expect("首次 apply 应成功");

    // 用户外部修改 settings.json（模拟手动编辑）
    let settings_path = env.claude_dir().join("settings.json");
    fs::write(
        &settings_path,
        r#"{"model":"manually-edited","extra":"keep-me"}"#,
    )
    .unwrap();

    // 再次 apply 同一个 profile：apply 必须以 registry 为权威
    apply_profile_inner("p1".into()).expect("再次 apply 应成功");
    let raw = fs::read_to_string(&settings_path).unwrap();
    let written: Value = serde_json::from_str(&raw).unwrap();
    assert_eq!(
        written["model"], "claude-opus-4-7",
        "apply 必须覆盖外部手动编辑的内容"
    );
    assert!(
        written.get("extra").is_none(),
        "外部新增的未知键不应在 apply 后保留"
    );
}

#[test]
#[serial]
fn apply_profile_errors_when_profile_id_missing() {
    let env = IntegrationEnv::new("apply-missing");
    seed_registry(&env, "existing", serde_json::json!({}));

    let err = apply_profile_inner("ghost".into())
        .expect_err("不存在的 profile id 必须报错");
    assert!(
        !err.is_empty(),
        "错误信息不应为空字符串：{err}"
    );

    // 不应写入 settings.json
    let settings_path = env.claude_dir().join("settings.json");
    assert!(
        !settings_path.exists(),
        "查找失败的 profile 不应留下 settings.json"
    );
}