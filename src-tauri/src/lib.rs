mod config;
mod memory;

use config::{
    activate_config, add_config, delete_config, duplicate_config, get_configs, get_defaults,
    reorder_configs, update_config, update_defaults,
};
use memory::{add_memory, delete_memory, get_memories, toggle_memory, update_memory};

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
