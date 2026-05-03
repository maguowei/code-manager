use crate::config::{apply_profile_inner, load_registry_or_default, ConfigRegistry};
use serde::Deserialize;
use std::fs;
use std::path::Path;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::thread;
use std::time::Duration;
use tauri::{
    menu::{Menu, MenuItemBuilder, PredefinedMenuItem},
    tray::TrayIconBuilder,
    AppHandle, Emitter, Manager,
};
use tauri_plugin_notification::NotificationExt;

const MAIN_TRAY_ID: &str = "main_tray";
const SESSIONS_TRAY_ID: &str = "sessions_tray";
const SESSION_MENU_LABEL_MAX_CHARS: usize = 64;
// Braille 等宽 spinner，10 帧覆盖一整圈；运行中 / 待处理时替代项目名与状态之间的分隔点。
const SESSION_TRAY_ANIMATION_FRAMES: &[&str] = &["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const SESSION_TRAY_ANIMATION_INTERVAL: Duration = Duration::from_millis(300);
/// 托盘 title 中项目名的最大字符数，超出追加省略号。
/// macOS 菜单栏宽度有限，长项目名会挤占其它状态栏图标，需要主动截断。
const SESSION_TRAY_TITLE_PROJECT_MAX_CHARS: usize = 16;
static SESSION_TRAY_ANIMATION_FRAME: AtomicUsize = AtomicUsize::new(0);

struct TrayLabels<'a> {
    language: &'a str,
    show_window: &'a str,
    nav_configs: &'a str,
    no_configs: &'a str,
    active_sessions: &'a str,
    sessions_title: &'a str,
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
            language: "en",
            show_window: "Open AI Manager",
            nav_configs: "Configuration",
            no_configs: "No configs",
            active_sessions: "Active Sessions",
            sessions_title: "Sessions",
            nav_memory: "Memory",
            nav_skills: "Skills",
            nav_providers: "Preset Management",
            nav_projects: "Projects",
            nav_history: "History",
            nav_stats: "Usage Statistics",
            quit: "Quit",
        },
        _ => TrayLabels {
            language: "zh",
            show_window: "打开 AI Manager",
            nav_configs: "配置管理",
            no_configs: "暂无配置",
            active_sessions: "当前会话",
            sessions_title: "会话",
            nav_memory: "记忆管理",
            nav_skills: "Skills 管理",
            nav_providers: "预设管理",
            nav_projects: "项目管理",
            nav_history: "历史记录",
            nav_stats: "使用统计",
            quit: "退出",
        },
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RawTraySession {
    pid: u32,
    session_id: String,
    cwd: String,
    status: String,
    updated_at: u64,
    #[serde(default)]
    waiting_for: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct TraySession {
    pid: u32,
    session_id: String,
    cwd: String,
    status: String,
    updated_at: u64,
    waiting_for: Option<String>,
}

impl From<RawTraySession> for TraySession {
    fn from(raw: RawTraySession) -> Self {
        Self {
            pid: raw.pid,
            session_id: raw.session_id.trim().to_string(),
            cwd: raw.cwd.trim().to_string(),
            status: raw.status.trim().to_string(),
            updated_at: raw.updated_at,
            waiting_for: raw
                .waiting_for
                .map(|value| value.trim().to_string())
                .filter(|value| !value.is_empty()),
        }
    }
}

fn load_tray_sessions() -> Vec<TraySession> {
    let Ok(home_dir) = crate::utils::get_home_dir() else {
        return Vec::new();
    };
    load_tray_sessions_from_dir(&home_dir.join(".claude").join("sessions"))
}

fn load_tray_sessions_from_dir(sessions_dir: &Path) -> Vec<TraySession> {
    let Ok(entries) = fs::read_dir(sessions_dir) else {
        return Vec::new();
    };

    let mut sessions = entries
        .filter_map(Result::ok)
        .filter_map(|entry| read_tray_session_file(&entry.path()))
        .collect::<Vec<_>>();
    sessions.sort_by(|left, right| {
        right
            .updated_at
            .cmp(&left.updated_at)
            .then_with(|| left.cwd.cmp(&right.cwd))
            .then_with(|| left.pid.cmp(&right.pid))
    });
    sessions
}

fn read_tray_session_file(path: &Path) -> Option<TraySession> {
    let metadata = fs::symlink_metadata(path).ok()?;
    if !metadata.file_type().is_file() {
        return None;
    }
    if path.extension().and_then(|ext| ext.to_str()) != Some("json") {
        return None;
    }

    let content = fs::read_to_string(path).ok()?;
    let raw = serde_json::from_str::<RawTraySession>(&content).ok()?;
    let session = TraySession::from(raw);
    if session.cwd.is_empty() || session.status.is_empty() || session.session_id.is_empty() {
        None
    } else {
        Some(session)
    }
}

fn session_project_name(cwd: &str) -> String {
    Path::new(cwd)
        .file_name()
        .and_then(|name| name.to_str())
        .filter(|name| !name.trim().is_empty())
        .map(str::to_string)
        .unwrap_or_else(|| cwd.to_string())
}

fn session_status_label(status: &str, language: &str) -> String {
    let normalized = status.trim().to_ascii_lowercase();
    let label = match (language, normalized.as_str()) {
        ("en", "idle") => "Idle",
        ("en", "waiting") => "Waiting",
        ("en", "running" | "busy" | "active") => "Running",
        ("en", "starting") => "Starting",
        ("en", "exited" | "ended") => "Ended",
        (_, "idle") => "空闲",
        (_, "waiting") => "待处理",
        (_, "running" | "busy" | "active") => "运行中",
        (_, "starting") => "启动中",
        (_, "exited" | "ended") => "已结束",
        _ => status.trim(),
    };
    label.to_string()
}

fn sessions_tray_title(sessions: &[TraySession], labels: &TrayLabels<'_>) -> Option<String> {
    sessions_tray_title_for_frame(
        sessions,
        labels,
        SESSION_TRAY_ANIMATION_FRAME.load(Ordering::Relaxed),
    )
}

fn sessions_tray_title_for_frame(
    sessions: &[TraySession],
    labels: &TrayLabels<'_>,
    frame: usize,
) -> Option<String> {
    let highlighted = sessions
        .iter()
        .find(|session| is_waiting_session_status(&session.status))
        .or_else(|| {
            sessions
                .iter()
                .find(|session| is_running_session_status(&session.status))
        });

    match sessions {
        [] => None,
        [session] => Some(session_tray_summary(session, labels.language, frame)),
        _ => highlighted
            .map(|session| session_tray_summary(session, labels.language, frame))
            .or_else(|| {
                sessions
                    .iter()
                    .any(|session| is_idle_session_status(&session.status))
                    .then(|| match labels.language {
                        "en" => format!("Idle Sessions x{}", sessions.len()),
                        _ => format!("空闲会话x{}", sessions.len()),
                    })
            })
            .or_else(|| Some(format!("{} {}", labels.sessions_title, sessions.len()))),
    }
}

fn session_tray_summary(session: &TraySession, language: &str, frame: usize) -> String {
    let status = session_status_label(&session.status, language);
    let separator = session_tray_separator(&session.status, frame);
    format!(
        "{} {} {}",
        crate::utils::truncate(
            &session_project_name(&session.cwd),
            SESSION_TRAY_TITLE_PROJECT_MAX_CHARS
        ),
        separator,
        status
    )
}

/// 运行中 / 待处理：用 Braille spinner 替代静态分隔点，让"忙"状态本身带动画；
/// 其它状态保留 `·` 分隔，避免无意义的视觉跳动。
fn session_tray_separator(status: &str, frame: usize) -> &'static str {
    if is_waiting_session_status(status) || is_running_session_status(status) {
        SESSION_TRAY_ANIMATION_FRAMES[frame % SESSION_TRAY_ANIMATION_FRAMES.len()]
    } else {
        "·"
    }
}

fn is_waiting_session_status(status: &str) -> bool {
    status.trim().eq_ignore_ascii_case("waiting")
}

fn is_running_session_status(status: &str) -> bool {
    matches!(
        status.trim().to_ascii_lowercase().as_str(),
        "running" | "busy" | "active"
    )
}

fn is_idle_session_status(status: &str) -> bool {
    status.trim().eq_ignore_ascii_case("idle")
}

fn session_menu_item_label(session: &TraySession, language: &str) -> String {
    let mut parts = vec![
        crate::utils::truncate(&session_project_name(&session.cwd), 32),
        session_status_label(&session.status, language),
    ];
    if is_waiting_session_status(&session.status) {
        if let Some(waiting_for) = &session.waiting_for {
            parts.push(crate::utils::truncate(
                waiting_for,
                SESSION_MENU_LABEL_MAX_CHARS,
            ));
        }
    }
    parts.join(" · ")
}

/// 编码会话菜单项 id，格式 `session_<pid>::<hex(cwd)>`。
/// 用 hex 是为了让 cwd 中的中文 / 空格 / 引号 / `::` 都不会破坏 menu id 解析，
/// 同时省去引入 base64 依赖。
fn session_menu_item_id(session: &TraySession) -> String {
    format!(
        "session_{}::{}",
        session.pid,
        hex_encode(session.cwd.as_bytes())
    )
}

/// 反向解析 `session_menu_item_id`。任一段不合法都返回 None，让 handler 静默忽略。
fn parse_session_menu_item_id(id: &str) -> Option<(u32, String)> {
    let payload = id.strip_prefix("session_")?;
    let (pid_str, hex_cwd) = payload.split_once("::")?;
    let pid = pid_str.parse::<u32>().ok()?;
    let bytes = hex_decode(hex_cwd)?;
    let cwd = String::from_utf8(bytes).ok()?;
    Some((pid, cwd))
}

fn hex_encode(bytes: &[u8]) -> String {
    use std::fmt::Write;
    let mut out = String::with_capacity(bytes.len() * 2);
    for b in bytes {
        let _ = write!(out, "{b:02x}");
    }
    out
}

fn hex_decode(s: &str) -> Option<Vec<u8>> {
    if !s.len().is_multiple_of(2) {
        return None;
    }
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(s.len() / 2);
    for chunk in bytes.chunks(2) {
        let pair = std::str::from_utf8(chunk).ok()?;
        out.push(u8::from_str_radix(pair, 16).ok()?);
    }
    Some(out)
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

fn build_sessions_tray_menu(
    app: &AppHandle,
    state: &ConfigRegistry,
    sessions: &[TraySession],
) -> tauri::Result<Menu<tauri::Wry>> {
    let mut items: Vec<Box<dyn tauri::menu::IsMenuItem<tauri::Wry>>> = Vec::new();
    let labels = tray_labels_for_language(&state.app.ui_language);

    let header = MenuItemBuilder::with_id("sessions_header", labels.active_sessions)
        .enabled(false)
        .build(app)?;
    items.push(Box::new(header));
    items.push(Box::new(PredefinedMenuItem::separator(app)?));

    let supports_focus =
        crate::terminal_focus::terminal_supports_focus(&state.app.default_terminal_app);
    for session in sessions {
        let item = MenuItemBuilder::with_id(
            session_menu_item_id(session),
            session_menu_item_label(session, labels.language),
        )
        .enabled(supports_focus)
        .build(app)?;
        items.push(Box::new(item));
    }

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
    let owned_state;
    let state = match state {
        Some(s) => s,
        None => {
            owned_state = load_registry_or_default();
            &owned_state
        }
    };

    if let Some(tray) = app_handle.tray_by_id(MAIN_TRAY_ID) {
        match build_tray_menu(app_handle, state) {
            Ok(menu) => {
                let _ = tray.set_menu(Some(menu));
            }
            Err(e) => {
                crate::logging::log_command_error("tray.rebuild", &e.to_string());
            }
        }
        // 同步更新托盘 title：传 Some("") 清除，Some(name) 设置
        let title = get_tray_title(state).unwrap_or_default();
        let _ = tray.set_title(Some(title.as_str()));
    }

    rebuild_sessions_tray(app_handle, state);
}

fn rebuild_sessions_tray(app_handle: &AppHandle, state: &ConfigRegistry) {
    let Some(tray) = app_handle.tray_by_id(SESSIONS_TRAY_ID) else {
        return;
    };

    let sessions = load_tray_sessions();
    if !apply_sessions_tray_title(&tray, state, &sessions) {
        return;
    }

    match build_sessions_tray_menu(app_handle, state, &sessions) {
        Ok(menu) => {
            let _ = tray.set_menu(Some(menu));
        }
        Err(e) => {
            crate::logging::log_command_error("tray.sessions_rebuild", &e.to_string());
        }
    }
}

fn apply_sessions_tray_title(
    tray: &tauri::tray::TrayIcon<tauri::Wry>,
    state: &ConfigRegistry,
    sessions: &[TraySession],
) -> bool {
    // 注意：会话托盘没有 icon，仅靠 title 显示。
    // 不能使用 set_visible(false) —— macOS NSStatusItem 一旦隐藏后再 set_visible(true) 不会恢复
    // （Tauri 已知 bug #10150）。改用空 title：title 为空且无 icon 时状态栏宽度为 0，等同隐藏。
    if !state.app.show_tray_sessions {
        let _ = tray.set_title(Some(""));
        return false;
    }

    let labels = tray_labels_for_language(&state.app.ui_language);
    let Some(title) = sessions_tray_title(sessions, &labels) else {
        let _ = tray.set_title(Some(""));
        return false;
    };

    let _ = tray.set_title(Some(title.as_str()));
    true
}

fn refresh_sessions_tray_title(app_handle: &AppHandle) {
    let Some(tray) = app_handle.tray_by_id(SESSIONS_TRAY_ID) else {
        return;
    };

    let state = load_registry_or_default();
    let sessions = load_tray_sessions();
    let _ = apply_sessions_tray_title(&tray, &state, &sessions);
}

fn start_sessions_tray_title_animator(app_handle: AppHandle) {
    let _ = thread::Builder::new()
        .name("sessions-tray-title-animator".to_string())
        .spawn(move || loop {
            thread::sleep(SESSION_TRAY_ANIMATION_INTERVAL);
            SESSION_TRAY_ANIMATION_FRAME.fetch_add(1, Ordering::Relaxed);
            refresh_sessions_tray_title(&app_handle);
        });
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

/// 会话聚焦失败时向用户弹出系统通知。
/// 选择系统通知而非主窗口 Toast，是因为托盘点击多发生在主窗口已隐藏 / 不在前台时，
/// Toast 需要主窗口可见才有意义；弹出主窗口又会打断用户当前终端操作。
fn notify_session_focus_failure(
    app: &AppHandle,
    language: &str,
    failure: &crate::terminal_focus::FocusFailure,
) {
    let (title, body) = failure.user_message(language);
    if let Err(e) = app.notification().builder().title(&title).body(&body).show() {
        // 通知失败不是核心路径，只记日志避免用户什么都看不到时噪声堆叠。
        log::warn!("event=tray.session_focus.notify status=err error={e}");
    }
}

/// 初始化系统托盘
pub fn setup_tray(app: &tauri::App) -> tauri::Result<()> {
    let handle = app.handle();
    let state = load_registry_or_default();
    let menu = build_tray_menu(handle, &state)?;
    let sessions = if state.app.show_tray_sessions {
        load_tray_sessions()
    } else {
        Vec::new()
    };
    let sessions_menu = build_sessions_tray_menu(handle, &state, &sessions)?;
    let labels = tray_labels_for_language(&state.app.ui_language);
    let sessions_title = sessions_tray_title(&sessions, &labels);

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

    // 第二个托盘项只承载会话摘要，形成独立点击区域。
    // 注：macOS 状态栏图标按添加顺序从右往左排列，先创建会话托盘可让其显示在主托盘（配置名）右侧。
    let mut sessions_builder = TrayIconBuilder::with_id(SESSIONS_TRAY_ID)
        .tooltip("AI Manager Sessions")
        .menu(&sessions_menu)
        .show_menu_on_left_click(true)
        .on_menu_event(|app, event| {
            let id = event.id().as_ref();
            let Some((pid, cwd)) = parse_session_menu_item_id(id) else {
                return;
            };
            let prefs = load_registry_or_default().app;
            let slug = prefs.default_terminal_app;
            let language = prefs.ui_language;
            if !crate::terminal_focus::terminal_supports_focus(&slug) {
                return;
            }
            // osascript 可能耗数百毫秒，丢线程避免阻塞 UI 事件循环。
            let app_handle = app.clone();
            std::thread::spawn(move || {
                if let Err(failure) =
                    crate::terminal_focus::focus_session_in_terminal(pid, &cwd, &slug)
                {
                    notify_session_focus_failure(&app_handle, &language, &failure);
                }
            });
        });
    if let Some(title) = &sessions_title {
        sessions_builder = sessions_builder.title(title);
    }
    let _sessions_tray = sessions_builder.build(app)?;
    // sessions_builder 仅在 sessions_title 为 Some 时设置 title（见上方 if let 分支）；
    // 当 show_tray_sessions=false 或当前无会话时，title 本就未设置，状态栏自然为空，无需再调用 set_visible。

    // 构建托盘图标，若设置开启且有激活配置则在图标旁显示配置名
    let mut builder = TrayIconBuilder::with_id(MAIN_TRAY_ID)
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
                        log::info!("event=tray.profile_apply status=ok profile_id={profile_id}");
                        rebuild_tray_menu(app, Some(&state));
                        // 通知前端刷新配置状态
                        let _ = app.emit("config-workspace-changed", ());
                    }
                    Err(e) => {
                        crate::logging::log_command_error("tray.profile_apply", &e);
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

    start_sessions_tray_title_animator(handle.clone());

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{
        load_tray_sessions_from_dir, parse_session_menu_item_id, session_menu_item_id,
        session_menu_item_label, session_status_label, sessions_tray_title,
        sessions_tray_title_for_frame, tray_labels_for_language, TraySession,
    };
    use std::fs;
    use std::path::Path;

    fn write_session_file(path: &Path, content: &str) {
        fs::write(path, content).expect("应可写入测试会话文件");
    }

    fn test_session(cwd: &str, status: &str, updated_at: u64) -> TraySession {
        TraySession {
            pid: 123,
            session_id: "session-1".to_string(),
            cwd: cwd.to_string(),
            status: status.to_string(),
            updated_at,
            waiting_for: None,
        }
    }

    #[test]
    fn tray_labels_follow_selected_language() {
        let zh = tray_labels_for_language("zh");
        assert_eq!(zh.show_window, "打开 AI Manager");
        assert_eq!(zh.nav_providers, "预设管理");
        assert_eq!(zh.nav_projects, "项目管理");
        assert_eq!(zh.quit, "退出");

        let en = tray_labels_for_language("en");
        assert_eq!(en.show_window, "Open AI Manager");
        assert_eq!(en.nav_providers, "Preset Management");
        assert_eq!(en.quit, "Quit");
    }

    #[test]
    fn load_tray_sessions_reads_valid_json_and_skips_invalid_entries() {
        let root =
            std::env::temp_dir().join(format!("ai-manager-tray-sessions-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&root).expect("应可创建测试目录");
        let sessions_dir = root.join("sessions");
        fs::create_dir_all(&sessions_dir).expect("应可创建 sessions 目录");

        write_session_file(
            &sessions_dir.join("100.json"),
            r#"{"pid":100,"sessionId":"older","cwd":"/tmp/older","status":"idle","updatedAt":1000}"#,
        );
        write_session_file(
            &sessions_dir.join("200.json"),
            r#"{"pid":200,"sessionId":"newer","cwd":"/tmp/newer","status":"waiting","updatedAt":2000,"waitingFor":"approve Bash"}"#,
        );
        write_session_file(&sessions_dir.join("broken.json"), "{not json");
        write_session_file(
            &sessions_dir.join("missing-cwd.json"),
            r#"{"pid":300,"sessionId":"missing","status":"idle","updatedAt":3000}"#,
        );
        fs::create_dir_all(sessions_dir.join("nested.json")).expect("应可创建测试子目录");
        #[cfg(unix)]
        std::os::unix::fs::symlink(
            sessions_dir.join("200.json"),
            sessions_dir.join("link.json"),
        )
        .expect("应可创建测试软链接");

        let sessions = load_tray_sessions_from_dir(&sessions_dir);

        assert_eq!(sessions.len(), 2);
        assert_eq!(sessions[0].pid, 200);
        assert_eq!(sessions[0].session_id, "newer");
        assert_eq!(sessions[0].waiting_for.as_deref(), Some("approve Bash"));
        assert_eq!(sessions[1].pid, 100);

        fs::remove_dir_all(root).expect("应可清理测试目录");
    }

    #[test]
    fn session_status_labels_follow_language() {
        assert_eq!(session_status_label("waiting", "zh"), "待处理");
        assert_eq!(session_status_label("idle", "zh"), "空闲");
        assert_eq!(session_status_label("running", "en"), "Running");
        assert_eq!(session_status_label("custom", "en"), "custom");
    }

    #[test]
    fn sessions_tray_title_uses_animated_waiting_running_and_idle_labels() {
        let zh = tray_labels_for_language("zh");
        let en = tray_labels_for_language("en");
        let idle = test_session("/Users/demo/work/ai-manager", "idle", 1000);
        let another_idle = test_session("/Users/demo/work/docs", "idle", 900);
        let waiting = test_session("/Users/demo/work/waiting-repo", "waiting", 2000);
        let running = test_session("/Users/demo/work/running-repo", "running", 1500);

        assert_eq!(sessions_tray_title_for_frame(&[], &zh, 0), None);
        assert_eq!(
            sessions_tray_title_for_frame(std::slice::from_ref(&idle), &zh, 0).as_deref(),
            Some("ai-manager · 空闲")
        );
        assert_eq!(
            sessions_tray_title_for_frame(
                &[idle.clone(), running.clone(), waiting.clone()],
                &zh,
                0
            )
            .as_deref(),
            Some("waiting-repo ⠋ 待处理")
        );
        assert_eq!(
            sessions_tray_title_for_frame(&[idle.clone(), running], &zh, 2).as_deref(),
            Some("running-repo ⠹ 运行中")
        );
        assert_eq!(
            sessions_tray_title_for_frame(&[idle, another_idle], &zh, 1).as_deref(),
            Some("空闲会话x2")
        );
        assert_eq!(
            sessions_tray_title_for_frame(&[test_session("/tmp/repo", "running", 1000)], &en, 0)
                .as_deref(),
            Some("repo ⠋ Running")
        );
        assert_eq!(
            sessions_tray_title(&[waiting], &zh).as_deref(),
            Some("waiting-repo ⠋ 待处理")
        );
    }

    #[test]
    fn session_menu_item_label_includes_status_project_and_waiting_reason() {
        let mut session = test_session("/Users/demo/work/ai-manager", "waiting", 2000);
        session.pid = 2491;
        session.waiting_for = Some("approve Bash".to_string());

        assert_eq!(
            session_menu_item_label(&session, "zh"),
            "ai-manager · 待处理 · approve Bash"
        );
        assert_eq!(
            session_menu_item_label(&session, "en"),
            "ai-manager · Waiting · approve Bash"
        );
    }

    /// 回归测试：空 sessions 时 sessions_tray_title 必须返回 None，
    /// 这是 apply_sessions_tray_title 走"清空 title"路径的契约前提。
    /// 防止未来误改成返回空串等价物，导致 macOS 状态栏继续占位。
    #[test]
    fn sessions_tray_title_returns_none_for_empty_sessions() {
        let zh = tray_labels_for_language("zh");
        assert_eq!(sessions_tray_title(&[], &zh), None);
        let en = tray_labels_for_language("en");
        assert_eq!(sessions_tray_title(&[], &en), None);
    }

    /// 回归测试：项目名超过 SESSION_TRAY_TITLE_PROJECT_MAX_CHARS 必须被截断并追加省略号，
    /// 防止过长项目名挤占 macOS 菜单栏其它状态栏图标。
    #[test]
    fn sessions_tray_title_truncates_long_project_name() {
        let zh = tray_labels_for_language("zh");
        // 项目名 22 字符，超过 16 字符上限，前 16 字符为 "very-long-projec"。
        let session = test_session("/Users/demo/work/very-long-project-name", "running", 1000);
        assert_eq!(
            sessions_tray_title_for_frame(std::slice::from_ref(&session), &zh, 0).as_deref(),
            Some("very-long-projec... ⠋ 运行中")
        );

        // 中文项目名 8 字符未超出上限，不应被截断。
        let cn_session = test_session("/Users/demo/work/中文短名", "idle", 1000);
        assert_eq!(
            sessions_tray_title_for_frame(std::slice::from_ref(&cn_session), &zh, 0).as_deref(),
            Some("中文短名 · 空闲")
        );
    }

    /// 回归测试：菜单项 id 必须能 round-trip 出原始 pid 与 cwd，
    /// 否则点击 handler 无法恢复 cwd 去聚焦终端。覆盖中文、空格、引号、`::` 等易错字符。
    #[test]
    fn session_menu_item_id_round_trip() {
        let cases = [
            "/Users/demo/work/ai-manager",
            "/Users/demo/work/中文 项目",
            r#"/path/with"quote"#,
            "/path/with::double-colon",
            "/path/with\\backslash",
            "/",
        ];
        for cwd in cases {
            let session = TraySession {
                pid: 4242,
                session_id: "s".into(),
                cwd: cwd.into(),
                status: "idle".into(),
                updated_at: 0,
                waiting_for: None,
            };
            let id = session_menu_item_id(&session);
            assert!(id.starts_with("session_4242::"), "id 缺前缀: {id}");
            let (pid, decoded_cwd) = parse_session_menu_item_id(&id).expect("应能反解");
            assert_eq!(pid, 4242);
            assert_eq!(decoded_cwd, cwd);
        }
    }

    /// 回归测试：解析非会话 id（profile_*、nav_*、未知字符串）必须返回 None，
    /// 防止 sessions 托盘 handler 被无关菜单事件误触发。
    #[test]
    fn parse_session_menu_item_id_rejects_invalid_inputs() {
        assert_eq!(parse_session_menu_item_id(""), None);
        assert_eq!(parse_session_menu_item_id("show_window"), None);
        assert_eq!(parse_session_menu_item_id("profile_abc"), None);
        // 缺 `::` 分隔
        assert_eq!(parse_session_menu_item_id("session_123"), None);
        // pid 非数字
        assert_eq!(parse_session_menu_item_id("session_abc::deadbeef"), None);
        // hex 长度奇数
        assert_eq!(parse_session_menu_item_id("session_1::abc"), None);
        // hex 含非法字符
        assert_eq!(parse_session_menu_item_id("session_1::zzzz"), None);
    }
}
