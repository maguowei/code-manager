use crate::config::{activate_config_inner, load_state, AppState};
use tauri::{
    menu::{Menu, MenuItemBuilder, PredefinedMenuItem},
    tray::TrayIconBuilder,
    AppHandle, Emitter, Manager,
};

/// 构建托盘菜单
fn build_tray_menu(app: &AppHandle, state: &AppState) -> tauri::Result<Menu<tauri::Wry>> {
    let mut items: Vec<Box<dyn tauri::menu::IsMenuItem<tauri::Wry>>> = Vec::new();

    // 顶部：点击打开主窗口
    let show = MenuItemBuilder::with_id("show_window", "打开 AI Manager").build(app)?;
    items.push(Box::new(show));
    items.push(Box::new(PredefinedMenuItem::separator(app)?));

    // 配置管理导航项（可点击，同时作为配置列表标题）
    let nav_configs = MenuItemBuilder::with_id("nav_configs", "配置管理").build(app)?;
    items.push(Box::new(nav_configs));

    // 配置列表
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

    // 页面导航项
    for (id, label) in [
        ("nav_memory", "记忆管理"),
        ("nav_skills", "Skills 管理"),
        ("nav_providers", "Provider 管理"),
        ("nav_projects", "项目管理"),
        ("nav_history", "历史记录"),
        ("nav_stats", "使用统计"),
    ] {
        let item = MenuItemBuilder::with_id(id, label).build(app)?;
        items.push(Box::new(item));
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

/// 获取托盘 title：当设置开启且有激活配置时返回配置名
fn get_tray_title(state: &AppState) -> Option<String> {
    if !state.show_tray_title {
        return None;
    }
    let active_id = state.active_config_id.as_ref()?;
    state
        .configs
        .iter()
        .find(|c| &c.id == active_id)
        .map(|c| c.name.clone())
}

/// 重建托盘菜单（配置变化后调用）
/// 可传入已有的 state 避免重复读磁盘，传 None 则从磁盘读取
pub fn rebuild_tray_menu(app_handle: &AppHandle, state: Option<&AppState>) {
    if let Some(tray) = app_handle.tray_by_id("main_tray") {
        let owned_state;
        let state = match state {
            Some(s) => s,
            None => {
                owned_state = load_state();
                &owned_state
            }
        };
        match build_tray_menu(app_handle, state) {
            Ok(menu) => {
                let _ = tray.set_menu(Some(menu));
            }
            Err(e) => {
                eprintln!("Failed to rebuild tray menu: {}", e);
            }
        }
        // 同步更新托盘 title：传 Some("") 清除，Some(name) 设置
        let title = get_tray_title(state).unwrap_or_default();
        let _ = tray.set_title(Some(title.as_str()));
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
    let state = load_state();
    let menu = build_tray_menu(handle, &state)?;

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

    // 构建托盘图标，若设置开启且有激活配置则在图标旁显示配置名
    let mut builder = TrayIconBuilder::with_id("main_tray")
        .icon(icon)
        .tooltip("AI Manager")
        .menu(&menu)
        .show_menu_on_left_click(true);
    if let Some(title) = get_tray_title(&state) {
        builder = builder.title(&title);
    }
    let _tray = builder
        .on_menu_event(|app, event| {
            let id = event.id().as_ref();

            if let Some(config_id) = id.strip_prefix("config_") {
                // 切换配置
                match activate_config_inner(config_id.to_string()) {
                    Ok(state) => {
                        rebuild_tray_menu(app, Some(&state));
                        // 通知前端刷新配置状态
                        let _ = app.emit("config-changed", ());
                    }
                    Err(e) => {
                        eprintln!("Failed to activate config from tray: {}", e);
                    }
                }
            } else if let Some(tab) = id.strip_prefix("nav_") {
                // 页面导航
                show_main_window(app);
                let _ = app.emit("navigate-to-tab", tab.to_string());
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
