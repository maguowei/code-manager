mod config;
mod memory;
mod tray;

use config::{
    activate_config, add_config, delete_config, duplicate_config, get_configs, get_defaults,
    reorder_configs, update_config, update_defaults,
};
use memory::{add_memory, delete_memory, get_memories, toggle_memory, update_memory};
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            tray::setup_tray(app)?;
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
            get_configs,
            add_config,
            update_config,
            delete_config,
            duplicate_config,
            activate_config,
            reorder_configs,
            get_defaults,
            update_defaults,
            get_memories,
            add_memory,
            update_memory,
            delete_memory,
            toggle_memory
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
