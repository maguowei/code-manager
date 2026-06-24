mod auto_memory;
mod claude_directory;
mod claude_directory_watcher;
mod config;
mod history;
mod led;
mod logging;
#[cfg(target_os = "macos")]
mod macos_notifications;
mod memory;
mod migration;
mod native_open;
mod plugins;
mod project;
mod skills;
mod stats;
mod terminal_focus;
mod tray;
mod usage;
mod utils;
mod widget;
mod work_summary;

use std::path::Path;
#[cfg(any(debug_assertions, test))]
use std::path::PathBuf;

use auto_memory::{
    delete_project_auto_memory_entry, get_project_auto_memory_overview,
    get_project_auto_memory_status, open_project_auto_memory_file_in_editor,
    read_project_auto_memory_file,
};
use claude_directory::{
    create_claude_directory_entry, delete_claude_directory_entry, get_claude_directory_children,
    get_claude_directory_overview, open_claude_file_in_editor, read_claude_file_preview,
    rename_claude_directory_entry,
};
use config::{
    apply_profile, delete_profile, duplicate_profile, export_profile, get_config_workspace,
    import_profile_from_file, import_user_settings_profile, install_status_line_preset,
    prepare_profile_launch, preview_profile, preview_profile_export, preview_profile_import,
    reorder_profiles, set_app_preferences, sync_shared_profile_settings, test_profile_model,
    upsert_profile,
};
use history::{
    get_history, get_history_if_changed, get_session_detail, open_session_file_in_editor,
    open_session_plan_in_editor, read_session_plan,
};
use led::{led_probe_status, led_test_mode};
use logging::{clear_app_logs, get_app_logs, open_logs_dir};
use memory::{
    add_memory, apply_memory_preset, delete_memory, duplicate_memory, get_memories,
    get_memory_preset_content, import_memories_from_directory, import_unmanaged_memory,
    preview_delete_memory, toggle_memory, update_memory,
};
use native_open::get_native_open_app_options;
use plugins::refresh_plugin_install_counts;
use project::{
    cleanup_project_branches, cleanup_project_worktrees, create_project_agents_skills_symlink,
    create_project_agents_symlink, create_project_claude_settings_file,
    get_project_claude_directory_overview, get_project_claude_file_preview, get_project_detail,
    open_project_claude_file_in_editor, open_project_in_editor, open_project_in_terminal,
    preview_project_branch_cleanup, preview_project_local_data_purge,
    preview_project_worktree_cleanup, purge_project_local_data,
};
use skills::{
    add_skill, delete_skill, duplicate_skill, get_skill_file_tree, get_skills,
    import_skills_from_directory, open_skill_in_editor, sync_skill_to_codex, toggle_skill,
    update_skill,
};
use stats::{get_stats, open_claude_json_in_editor};
use tauri::Manager;
use tauri_plugin_log::{RotationStrategy, Target, TargetKind, TimezoneStrategy};
use usage::{get_session_usage_detail, get_usage_snapshot, refresh_usage_pricing, rescan_usage};
use widget::{open_usage_page, toggle_floating_widget};
use work_summary::{
    check_claude_cli, generate_weekly_summary, list_summaries, read_summary, scan_day_changes,
    summarize_day,
};

/// 构造 tauri-specta Builder，收集所有 IPC command。
///
/// `dangerously_cast_bigints_to_number()`：把 `u64`/`i64` 等大整数导出为 TS `number`。
/// Code Manager 当前 IPC 数值（token 计数、毫秒时间戳）远小于 Number.MAX_SAFE_INTEGER。
/// 后续若新增可能超过该范围的整数 IPC 字段，必须单字段加 `#[specta(type = String)]` 走字符串传输。
fn build_specta_builder() -> tauri_specta::Builder<tauri::Wry> {
    tauri_specta::Builder::<tauri::Wry>::new()
        .commands(tauri_specta::collect_commands![
            get_config_workspace,
            get_claude_directory_overview,
            get_claude_directory_children,
            read_claude_file_preview,
            open_claude_file_in_editor,
            create_claude_directory_entry,
            rename_claude_directory_entry,
            delete_claude_directory_entry,
            upsert_profile,
            duplicate_profile,
            reorder_profiles,
            sync_shared_profile_settings,
            delete_profile,
            apply_profile,
            import_user_settings_profile,
            install_status_line_preset,
            preview_profile,
            prepare_profile_launch,
            preview_profile_export,
            export_profile,
            preview_profile_import,
            import_profile_from_file,
            test_profile_model,
            set_app_preferences,
            toggle_floating_widget,
            open_usage_page,
            get_native_open_app_options,
            get_memories,
            add_memory,
            apply_memory_preset,
            get_memory_preset_content,
            update_memory,
            duplicate_memory,
            preview_delete_memory,
            delete_memory,
            toggle_memory,
            import_unmanaged_memory,
            import_memories_from_directory,
            get_stats,
            open_claude_json_in_editor,
            get_history,
            get_history_if_changed,
            get_session_detail,
            open_session_file_in_editor,
            read_session_plan,
            open_session_plan_in_editor,
            get_app_logs,
            open_logs_dir,
            clear_app_logs,
            get_project_detail,
            get_project_claude_directory_overview,
            get_project_claude_file_preview,
            create_project_claude_settings_file,
            open_project_claude_file_in_editor,
            create_project_agents_skills_symlink,
            create_project_agents_symlink,
            open_project_in_terminal,
            open_project_in_editor,
            preview_project_local_data_purge,
            purge_project_local_data,
            preview_project_branch_cleanup,
            cleanup_project_branches,
            preview_project_worktree_cleanup,
            cleanup_project_worktrees,
            get_project_auto_memory_status,
            get_project_auto_memory_overview,
            read_project_auto_memory_file,
            delete_project_auto_memory_entry,
            open_project_auto_memory_file_in_editor,
            get_skills,
            add_skill,
            update_skill,
            duplicate_skill,
            delete_skill,
            toggle_skill,
            get_skill_file_tree,
            open_skill_in_editor,
            import_skills_from_directory,
            sync_skill_to_codex,
            get_usage_snapshot,
            get_session_usage_detail,
            refresh_usage_pricing,
            rescan_usage,
            refresh_plugin_install_counts,
            led_probe_status,
            led_test_mode,
            check_claude_cli,
            scan_day_changes,
            summarize_day,
            generate_weekly_summary,
            list_summaries,
            read_summary,
        ])
        .dangerously_cast_bigints_to_number()
}

pub fn export_typescript_bindings(path: impl AsRef<Path>) -> Result<(), String> {
    let path = path.as_ref();
    build_specta_builder()
        .export(specta_typescript::Typescript::default(), path)
        .map_err(|error| format!("specta: 导出 TypeScript bindings 失败: {error}"))?;

    let generated = std::fs::read_to_string(path)
        .map_err(|error| format!("specta: 读取 TypeScript bindings 失败: {error}"))?;
    let normalized = normalize_typescript_bindings(&generated);
    if normalized != generated {
        utils::ensure_dir_and_write_atomic(path, &normalized)
            .map_err(|error| format!("specta: 清理 TypeScript bindings 失败: {error}"))?;
    }

    Ok(())
}

#[cfg(any(debug_assertions, test))]
fn default_typescript_bindings_path() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../src/bindings.ts")
}

fn normalize_typescript_bindings(content: &str) -> String {
    let normalized = content
        .trim_end_matches(['\n', '\r'])
        .lines()
        .map(|line| line.trim_end_matches([' ', '\t']))
        .collect::<Vec<_>>()
        .join("\n");

    if normalized.is_empty() {
        normalized
    } else {
        format!("{normalized}\n")
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    logging::install_panic_hook();

    let specta_builder = build_specta_builder();

    // 仅 debug 构建生成 src/bindings.ts，承载 specta 已标注 command 的强类型契约。
    // release 不生成，避免污染包体；前端 import 自动生成的 commands / 类型。
    #[cfg(debug_assertions)]
    export_typescript_bindings(default_typescript_bindings_path())
        .expect("specta: 导出 TypeScript bindings 失败");

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(
            tauri_plugin_log::Builder::new()
                .level(log::LevelFilter::Info)
                .rotation_strategy(RotationStrategy::KeepSome(8))
                .timezone_strategy(TimezoneStrategy::UseLocal)
                .max_file_size(2_000_000)
                .clear_targets()
                .format(|out, message, record| {
                    let line = logging::format_log_record(message, record.target(), record.level());
                    out.finish(format_args!("{line}"));
                })
                .targets([
                    Target::new(TargetKind::Stdout),
                    Target::new(TargetKind::LogDir {
                        file_name: Some("code-manager".to_string()),
                    }),
                ])
                .build(),
        )
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::AppleScript,
            None,
        ))
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _shortcut, event| {
                    // 按下时聚焦最该处理的会话终端；松开事件忽略，避免重复触发
                    if event.state() == tauri_plugin_global_shortcut::ShortcutState::Pressed {
                        tray::focus_most_urgent_session(app);
                    }
                })
                .build(),
        )
        .invoke_handler(specta_builder.invoke_handler())
        .setup(move |app| {
            // tauri-specta 要求在 setup 内 mount events（即使当前没有 specta event，
            // 这一步也是必须的，以便未来引入事件时无需再改架构）。
            specta_builder.mount_events(app);
            // 一次性把 ai-manager 旧目录的配置/记忆/skills 迁移到 code-manager 新目录；
            // usage.db 与日志可重建，不在迁移范围内
            migration::migrate_legacy_data_dirs();
            #[cfg(target_os = "macos")]
            macos_notifications::setup_notification_delegate(app);
            tray::setup_tray(app)?;
            // 按当前偏好注册"聚焦会话终端"全局快捷键（仅 macOS 生效）
            tray::apply_focus_session_shortcut(app.handle());
            // 启动菜单栏待处理会话呼吸灯脉动线程（仅 macOS 有视觉效果，其它平台空跑无害）
            tray::start_pulse_task(app.handle().clone());
            log::info!("event=app.setup status=ok");
            let claude_directory_watcher =
                claude_directory_watcher::start_claude_directory_watcher(app.handle().clone());
            app.manage(claude_directory_watcher);
            // 启动 token/cost 用量统计运行时（管理状态、首扫、价格刷新、watcher 增量）
            usage::start_usage_runtime(app).map_err(std::io::Error::other)?;
            // 启动 LED 灯效运行时（独立 worker 线程驱动设备，按当前会话状态点亮一次）
            led::start_led_runtime(app);
            // 按当前偏好同步桌面用量浮窗显隐（启用则创建置顶小窗）
            widget::sync_widget_visibility(
                app.handle(),
                config::load_app_preferences().floating_widget_enabled,
            );
            Ok(())
        })
        .on_window_event(|window, event| {
            // 点击关闭按钮时隐藏窗口而非退出，保留系统托盘
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let _ = window.hide();
                // macOS: 仅主窗口关闭时隐藏 Dock 图标；浮窗关闭不应影响 Dock
                #[cfg(target_os = "macos")]
                if window.label() == "main" {
                    let app = window.app_handle();
                    let _ = app.set_activation_policy(tauri::ActivationPolicy::Accessory);
                }
                api.prevent_close();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

/// debug/test 专用集成测试入口：让 `src-tauri/tests/` 能调用内部 command 实现与共享 helper。
///
/// 标记为 `#[doc(hidden)]` 且仅在 debug 构建暴露，release 产物不要依赖这个测试契约。
#[cfg(debug_assertions)]
#[doc(hidden)]
pub mod test_api {
    pub use crate::config::{apply_profile_inner, ConfigProfile, ConfigRegistry};
    pub use crate::history::{
        get_history, get_history_if_changed, get_session_detail, read_session_plan, HistoryResult,
        MessageBlock, SessionDetail, SessionMessage, SessionPlan,
    };
    pub use crate::stats::{get_stats, ClaudeStats, ProjectStats};

    /// 测试可访问的 utils 子集
    pub mod utils {
        pub use crate::utils::{get_app_data_dir, home_dir_or_fallback, lock_config};
    }
}

#[cfg(test)]
mod specta_export_tests {
    use super::{
        default_typescript_bindings_path, export_typescript_bindings, normalize_typescript_bindings,
    };
    use std::fs;

    #[test]
    fn normalize_typescript_bindings_trims_trailing_whitespace_and_keeps_one_eof_newline() {
        let input = "export type Foo = {\t\n  value: string;  \n}\n\n";

        let normalized = normalize_typescript_bindings(input);

        assert_eq!(normalized, "export type Foo = {\n  value: string;\n}\n");
        assert_eq!(normalized.as_bytes().last(), Some(&b'\n'));
        assert!(!normalized.ends_with("\n\n"));
    }

    /// 跑 cargo test 时生成临时 bindings 并与已提交产物比较，防止 Rust IPC 契约和前端产物漂移。
    #[test]
    fn exported_typescript_bindings_match_submitted_artifact() {
        let temp_dir = tempfile::tempdir().expect("创建临时目录失败");
        let generated_path = temp_dir.path().join("bindings.ts");

        export_typescript_bindings(&generated_path).expect("specta: 导出 TypeScript bindings 失败");

        let generated = fs::read_to_string(&generated_path).expect("读取临时 bindings 失败");
        let submitted = fs::read_to_string("../src/bindings.ts").expect("读取已提交 bindings 失败");

        assert_eq!(
            generated, submitted,
            "src/bindings.ts 已过期，请运行 `make bindings` 重新生成"
        );
    }

    #[test]
    fn default_typescript_bindings_path_is_resolved_from_manifest_dir() {
        let expected = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../src/bindings.ts");

        assert_eq!(default_typescript_bindings_path(), expected);
    }
}
