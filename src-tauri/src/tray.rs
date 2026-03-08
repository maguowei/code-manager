use crate::config::{activate_config_inner, load_state};
use tauri::{
    menu::{Menu, MenuItemBuilder, PredefinedMenuItem},
    tray::TrayIconBuilder,
    AppHandle, Emitter, Manager,
};

/// 构建托盘菜单
fn build_tray_menu(app: &AppHandle) -> tauri::Result<Menu<tauri::Wry>> {
    let state = load_state();

    let mut items: Vec<Box<dyn tauri::menu::IsMenuItem<tauri::Wry>>> = Vec::new();

    // 顶部：点击打开主窗口
    let show = MenuItemBuilder::with_id("show_window", "打开 AI Manager").build(app)?;
    items.push(Box::new(show));
    items.push(Box::new(PredefinedMenuItem::separator(app)?));

    // 配置列表
    let section = MenuItemBuilder::with_id("section_configs", "切换配置")
        .enabled(false)
        .build(app)?;
    items.push(Box::new(section));
    if state.configs.is_empty() {
        let empty = MenuItemBuilder::with_id("no_configs", "暂无配置")
            .enabled(false)
            .build(app)?;
        items.push(Box::new(empty));
    } else {
        for config in &state.configs {
            let is_active = state.active_config_id.as_ref() == Some(&config.id);
            let label = if is_active {
                format!("✓ {}", config.name)
            } else {
                format!("   {}", config.name)
            };
            let item =
                MenuItemBuilder::with_id(format!("config_{}", config.id), label).build(app)?;
            items.push(Box::new(item));
        }
    }

    items.push(Box::new(PredefinedMenuItem::separator(app)?));

    // 退出
    let quit = MenuItemBuilder::with_id("quit", "退出").build(app)?;
    items.push(Box::new(quit));

    // 构建菜单：将 items 转为引用切片
    let refs: Vec<&dyn tauri::menu::IsMenuItem<tauri::Wry>> = items
        .iter()
        .map(|b| b.as_ref() as &dyn tauri::menu::IsMenuItem<tauri::Wry>)
        .collect();
    Menu::with_items(app, &refs)
}

/// 重建托盘菜单（配置变化后调用）
pub fn rebuild_tray_menu(app_handle: &AppHandle) {
    if let Some(tray) = app_handle.tray_by_id("main_tray") {
        match build_tray_menu(app_handle) {
            Ok(menu) => {
                let _ = tray.set_menu(Some(menu));
            }
            Err(e) => {
                eprintln!("Failed to rebuild tray menu: {}", e);
            }
        }
    }
}

/// 显示并聚焦主窗口
fn show_main_window(app: &AppHandle) {
    #[cfg(target_os = "macos")]
    let _ = app.set_activation_policy(tauri::ActivationPolicy::Regular);
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

/// 初始化系统托盘
pub fn setup_tray(app: &tauri::App) -> tauri::Result<()> {
    let handle = app.handle();
    let menu = build_tray_menu(handle)?;

    // 获取应用图标，若不存在则返回 IO 错误
    let icon = app
        .default_window_icon()
        .ok_or_else(|| {
            tauri::Error::Io(std::io::Error::new(
                std::io::ErrorKind::NotFound,
                "无法获取应用图标",
            ))
        })?
        .clone();

    let _tray = TrayIconBuilder::with_id("main_tray")
        .icon(icon)
        .tooltip("AI Manager")
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(|app, event| {
            let id = event.id().as_ref();

            if let Some(config_id) = id.strip_prefix("config_") {
                // 切换配置
                match activate_config_inner(config_id.to_string()) {
                    Ok(_) => {
                        rebuild_tray_menu(app);
                        // 通知前端刷新配置状态
                        let _ = app.emit("config-changed", ());
                    }
                    Err(e) => {
                        eprintln!("Failed to activate config from tray: {}", e);
                    }
                }
            } else {
                match id {
                    "show_window" => {
                        show_main_window(app);
                    }
                    "quit" => {
                        app.exit(0);
                    }
                    _ => {}
                }
            }
        })
        .build(app)?;

    Ok(())
}
