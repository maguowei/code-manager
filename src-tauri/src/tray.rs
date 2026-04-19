use crate::config::{apply_profile_inner, load_registry_or_default, ConfigRegistry};
use tauri::{
    menu::{Menu, MenuItemBuilder, PredefinedMenuItem},
    tray::TrayIconBuilder,
    AppHandle, Emitter, Manager,
};

struct TrayLabels<'a> {
    show_window: &'a str,
    nav_configs: &'a str,
    no_configs: &'a str,
    nav_memory: &'a str,
    nav_skills: &'a str,
    nav_providers: &'a str,
    nav_projects: &'a str,
    nav_history: &'a str,
    nav_stats: &'a str,
    quit: &'a str,
}

fn tray_labels_for_language(language: &str) -> TrayLabels<'static> {
    match language {
        "en" => TrayLabels {
            show_window: "Open AI Manager",
            nav_configs: "Configuration",
            no_configs: "No configs",
            nav_memory: "Memory",
            nav_skills: "Skills",
            nav_providers: "Provider Management",
            nav_projects: "Projects",
            nav_history: "History",
            nav_stats: "Usage Statistics",
            quit: "Quit",
        },
        _ => TrayLabels {
            show_window: "打开 AI Manager",
            nav_configs: "配置管理",
            no_configs: "暂无配置",
            nav_memory: "记忆管理",
            nav_skills: "Skills 管理",
            nav_providers: "Provider 管理",
            nav_projects: "项目管理",
            nav_history: "历史记录",
            nav_stats: "使用统计",
            quit: "退出",
        },
    }
}

/// 构建托盘菜单
fn build_tray_menu(app: &AppHandle, state: &ConfigRegistry) -> tauri::Result<Menu<tauri::Wry>> {
    let mut items: Vec<Box<dyn tauri::menu::IsMenuItem<tauri::Wry>>> = Vec::new();
    let labels = tray_labels_for_language(&state.app.ui_language);

    // 顶部：点击打开主窗口
    let show = MenuItemBuilder::with_id("show_window", labels.show_window).build(app)?;
    items.push(Box::new(show));
    items.push(Box::new(PredefinedMenuItem::separator(app)?));

    // 配置管理导航项（可点击，同时作为配置列表标题）
    let nav_configs = MenuItemBuilder::with_id("nav_configs", labels.nav_configs).build(app)?;
    items.push(Box::new(nav_configs));

    // 配置列表
    if state.profiles.is_empty() {
        let empty = MenuItemBuilder::with_id("no_configs", labels.no_configs)
            .enabled(false)
            .build(app)?;
        items.push(Box::new(empty));
    } else {
        for profile in &state.profiles {
            let is_active = state.bindings.user_profile_id.as_ref() == Some(&profile.id);
            let label = if is_active {
                format!("✓ {}", profile.name)
            } else {
                format!("   {}", profile.name)
            };
            let item =
                MenuItemBuilder::with_id(format!("profile_{}", profile.id), label).build(app)?;
            items.push(Box::new(item));
        }
    }

    items.push(Box::new(PredefinedMenuItem::separator(app)?));

    // 页面导航项
    for (id, label) in [
        ("nav_memory", labels.nav_memory),
        ("nav_skills", labels.nav_skills),
        ("nav_providers", labels.nav_providers),
        ("nav_projects", labels.nav_projects),
        ("nav_history", labels.nav_history),
        ("nav_stats", labels.nav_stats),
    ] {
        let item = MenuItemBuilder::with_id(id, label).build(app)?;
        items.push(Box::new(item));
    }

    items.push(Box::new(PredefinedMenuItem::separator(app)?));

    // 退出
    let quit = MenuItemBuilder::with_id("quit", labels.quit).build(app)?;
    items.push(Box::new(quit));

    // 构建菜单：将 items 转为引用切片
    let refs: Vec<&dyn tauri::menu::IsMenuItem<tauri::Wry>> = items
        .iter()
        .map(|b| b.as_ref() as &dyn tauri::menu::IsMenuItem<tauri::Wry>)
        .collect();
    Menu::with_items(app, &refs)
}

/// 获取托盘 title：当设置开启且有激活配置时返回配置名
fn get_tray_title(state: &ConfigRegistry) -> Option<String> {
    if !state.app.show_tray_title {
        return None;
    }
    let active_id = state.bindings.user_profile_id.as_ref()?;
    state
        .profiles
        .iter()
        .find(|profile| &profile.id == active_id)
        .map(|profile| profile.name.clone())
}

/// 重建托盘菜单（配置变化后调用）
/// 可传入已有的 state 避免重复读磁盘，传 None 则从磁盘读取
pub fn rebuild_tray_menu(app_handle: &AppHandle, state: Option<&ConfigRegistry>) {
    if let Some(tray) = app_handle.tray_by_id("main_tray") {
        let owned_state;
        let state = match state {
            Some(s) => s,
            None => {
                owned_state = load_registry_or_default();
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
    let state = load_registry_or_default();
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

            if let Some(profile_id) = id.strip_prefix("profile_") {
                // 切换用户级 profile
                match apply_profile_inner(profile_id.to_string()) {
                    Ok(state) => {
                        rebuild_tray_menu(app, Some(&state));
                        // 通知前端刷新配置状态
                        let _ = app.emit("config-workspace-changed", ());
                    }
                    Err(e) => {
                        eprintln!("Failed to apply profile from tray: {}", e);
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

#[cfg(test)]
mod tests {
    use super::tray_labels_for_language;

    #[test]
    fn tray_labels_follow_selected_language() {
        let zh = tray_labels_for_language("zh");
        assert_eq!(zh.show_window, "打开 AI Manager");
        assert_eq!(zh.nav_projects, "项目管理");
        assert_eq!(zh.quit, "退出");

        let en = tray_labels_for_language("en");
        assert_eq!(en.show_window, "Open AI Manager");
        assert_eq!(en.nav_providers, "Provider Management");
        assert_eq!(en.quit, "Quit");
    }
}
