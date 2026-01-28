mod config;

use config::{
    activate_config, add_config, delete_config, duplicate_config, get_configs, update_config,
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            get_configs,
            add_config,
            update_config,
            delete_config,
            duplicate_config,
            activate_config
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
