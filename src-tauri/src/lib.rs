mod claude_directory;
mod claude_directory_watcher;
mod config;
mod history;
mod logging;
mod memory;
mod project;
mod skills;
mod stats;
mod terminal_focus;
mod tray;
mod usage;
mod utils;

use claude_directory::{
    create_claude_directory_entry, delete_claude_directory_entry, get_claude_directory_children,
    get_claude_directory_overview, open_claude_file_in_editor, read_claude_file_preview,
    rename_claude_directory_entry,
};
use config::{
    apply_profile, delete_preset, delete_profile, duplicate_profile, get_config_workspace,
    install_status_line_preset, preview_profile, reorder_profiles, set_app_preferences,
    test_profile_model, upsert_preset, upsert_profile,
};
use history::{
    get_history, get_history_if_changed, get_session_detail, open_session_file_in_editor,
};
use logging::{clear_app_logs, get_app_logs, open_logs_dir};
use memory::{
    add_memory, delete_memory, duplicate_memory, get_memories, import_memories_from_directory,
    import_unmanaged_memory, preview_delete_memory, toggle_memory, update_memory,
};
use project::{
    create_project_agents_symlink, get_project_detail, open_project_in_editor,
    open_project_in_terminal, preview_project_local_data_purge, purge_project_local_data,
};
use skills::{
    add_skill, add_skill_file, delete_skill, delete_skill_file, get_skill_files, get_skills,
    sync_skill_to_codex, toggle_skill, update_skill, update_skill_file,
};
use stats::{get_stats, open_claude_json_in_editor};
use tauri::Manager;
use tauri_plugin_log::{RotationStrategy, Target, TargetKind, TimezoneStrategy};
use usage::{
    get_session_usage_detail, get_usage_by_model, get_usage_by_project, get_usage_by_session,
    get_usage_daily, get_usage_summary, get_usage_time_series, refresh_usage_pricing, rescan_usage,
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    logging::install_panic_hook();

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
                        file_name: Some("ai-manager".to_string()),
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
            tauri_plugin_sql::Builder::default()
                .add_migrations(usage::USAGE_DB_URL, usage::sql_migrations())
                .build(),
        )
        .setup(|app| {
            tray::setup_tray(app)?;
            log::info!("event=app.setup status=ok");
            let claude_directory_watcher =
                claude_directory_watcher::start_claude_directory_watcher(app.handle().clone());
            app.manage(claude_directory_watcher);
            // 启动 token/cost 用量统计运行时（管理状态、首扫、价格刷新、watcher 增量）
            usage::start_usage_runtime(app).map_err(std::io::Error::other)?;
            Ok(())
        })
        .on_window_event(|window, event| {
            // 点击关闭按钮时隐藏窗口而非退出，保留系统托盘
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let _ = window.hide();
                // macOS: 隐藏 Dock 图标
                #[cfg(target_os = "macos")]
                {
                    let app = window.app_handle();
                    let _ = app.set_activation_policy(tauri::ActivationPolicy::Accessory);
                }
                api.prevent_close();
            }
        })
        .invoke_handler(tauri::generate_handler![
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
            delete_profile,
            apply_profile,
            install_status_line_preset,
            preview_profile,
            test_profile_model,
            upsert_preset,
            delete_preset,
            set_app_preferences,
            get_memories,
            add_memory,
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
            get_app_logs,
            open_logs_dir,
            clear_app_logs,
            get_project_detail,
            create_project_agents_symlink,
            open_project_in_terminal,
            open_project_in_editor,
            preview_project_local_data_purge,
            purge_project_local_data,
            get_skills,
            add_skill,
            update_skill,
            delete_skill,
            toggle_skill,
            get_skill_files,
            add_skill_file,
            update_skill_file,
            delete_skill_file,
            sync_skill_to_codex,
            get_usage_summary,
            get_usage_daily,
            get_usage_time_series,
            get_usage_by_project,
            get_usage_by_session,
            get_usage_by_model,
            get_session_usage_detail,
            refresh_usage_pricing,
            rescan_usage,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
