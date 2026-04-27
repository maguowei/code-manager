mod config;
mod history;
mod memory;
mod project;
mod skills;
mod stats;
mod tray;
mod utils;

use config::{
    apply_profile, delete_preset, delete_profile, duplicate_profile, get_config_workspace,
    preview_profile, reorder_profiles, set_app_preferences, test_profile_model, upsert_preset,
    upsert_profile,
};
use history::{get_history, get_history_if_changed, get_session_detail};
use memory::{add_memory, delete_memory, get_memories, toggle_memory, update_memory};
use project::{
    create_project_agents_symlink, get_project_detail, open_project_in_editor,
    open_project_in_terminal,
};
use skills::{
    add_skill, add_skill_file, delete_skill, delete_skill_file, get_skill_files, get_skills,
    sync_skill_to_codex, toggle_skill, update_skill, update_skill_file,
};
use stats::{get_stats, get_stats_history, take_stats_snapshot};
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            tray::setup_tray(app)?;
            let snapshot_handle = stats::start_snapshot_timer();
            // 保存句柄，app 退出时 handle drop 但线程也会随进程终止
            app.manage(snapshot_handle);
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
            upsert_profile,
            duplicate_profile,
            reorder_profiles,
            delete_profile,
            apply_profile,
            preview_profile,
            test_profile_model,
            upsert_preset,
            delete_preset,
            set_app_preferences,
            get_memories,
            add_memory,
            update_memory,
            delete_memory,
            toggle_memory,
            get_stats,
            get_stats_history,
            take_stats_snapshot,
            get_history,
            get_history_if_changed,
            get_session_detail,
            get_project_detail,
            create_project_agents_symlink,
            open_project_in_terminal,
            open_project_in_editor,
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
