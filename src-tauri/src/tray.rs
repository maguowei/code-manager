use crate::config::{
    apply_profile_inner, load_registry_or_default, AppPreferences, ConfigRegistry,
    SessionTrayCountStyle, UiLanguage,
};
use crate::native_i18n::{
    pending_session_message, pending_sessions_summary_message, session_status_label, tray_labels,
    TrayLabels,
};
use serde::Deserialize;
use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::path::Path;
use std::sync::{Mutex, OnceLock};
use tauri::{
    menu::{Menu, MenuItemBuilder, PredefinedMenuItem},
    tray::TrayIconBuilder,
    AppHandle, Emitter, Manager,
};
use tauri_plugin_notification::NotificationExt;

const MAIN_TRAY_ID: &str = "main_tray";
const SESSIONS_TRAY_ID: &str = "sessions_tray";
const SESSION_MENU_LABEL_MAX_CHARS: usize = 64;
// 会话状态分类 emoji：托盘 title 与下拉菜单项共用，保持视觉一致。
// 🔴 待处理（最需关注）、🟢 进行中、⚪ 其它（空闲等）；语义可按需调整。
const SESSION_STATUS_WAITING_EMOJI: &str = "🔴";
const SESSION_STATUS_RUNNING_EMOJI: &str = "🟢";
const SESSION_STATUS_OTHER_EMOJI: &str = "⚪";
// 待处理会话呼吸灯的暗帧 emoji：⭕ U+2B55 空心圆，与 🔴 同为全角，宽度稳定。
// 有待处理会话时，托盘 title 在 🔴 / ⭕ 间交替制造"呼吸"动画提示。
const SESSION_STATUS_WAITING_DIM_EMOJI: &str = "⭕";
// 呼吸灯半周期：🔴↔⭕ 每次切换的间隔；整周期约 1.2s，远低于 3Hz 光敏阈值。
// 如需支持 macOS 系统 reduce-motion，可在此基础上读取系统设置覆盖，
// 但当前优先走 app 内 `tray_pulse_waiting` 开关，避免引入额外 unsafe / objc 调用。
const PULSE_HALF_PERIOD_MS: u64 = 600;
static PENDING_SESSION_NOTIFIER: OnceLock<Mutex<PendingSessionNotifier>> = OnceLock::new();

fn main_tray_navigation_items(labels: &TrayLabels) -> [(&'static str, &'static str); 6] {
    [
        ("nav_memory", labels.nav_memory),
        ("nav_skills", labels.nav_skills),
        ("nav_projects", labels.nav_projects),
        ("nav_history", labels.nav_history),
        ("nav_stats", labels.nav_stats),
        ("nav_usage", labels.nav_usage),
    ]
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

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct PendingSessionFocusTarget {
    pub(crate) pid: u32,
    pub(crate) cwd: String,
    pub(crate) session_id: String,
    pub(crate) terminal_app: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct PendingSessionNotification {
    title: String,
    body: String,
    language: String,
    focus_target: Option<PendingSessionFocusTarget>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum PendingSessionNotificationInteraction {
    FocusTerminal,
    Plain,
}

#[derive(Debug, Default)]
struct PendingSessionNotifier {
    seen_snapshot: bool,
    waiting_session_ids: BTreeSet<String>,
    /// 最近一次 observe 是否出现真正的新等待会话（已排除启动首帧）。
    /// 供音效门控读取，独立于 system_notifications_enabled。
    last_had_new_waiting: bool,
}

impl PendingSessionNotifier {
    fn observe(
        &mut self,
        preferences: &AppPreferences,
        sessions: &[TraySession],
        language: UiLanguage,
        interaction: PendingSessionNotificationInteraction,
    ) -> Vec<PendingSessionNotification> {
        let waiting_sessions = sessions
            .iter()
            .filter(|session| is_waiting_session_status(&session.status))
            .map(|session| (session.session_id.clone(), session))
            .collect::<BTreeMap<_, _>>();
        let waiting_session_ids = waiting_sessions.keys().cloned().collect::<BTreeSet<_>>();
        let new_waiting_sessions = waiting_sessions
            .iter()
            .filter(|(session_id, _)| !self.waiting_session_ids.contains(*session_id))
            .map(|(_, session)| (*session).clone())
            .collect::<Vec<_>>();

        let has_new_waiting = self.seen_snapshot && !new_waiting_sessions.is_empty();
        let can_notify = self.seen_snapshot && preferences.system_notifications_enabled;
        self.last_had_new_waiting = has_new_waiting;
        self.seen_snapshot = true;
        self.waiting_session_ids = waiting_session_ids;

        if !can_notify || new_waiting_sessions.is_empty() {
            return Vec::new();
        }

        if new_waiting_sessions.len() == 1 {
            return vec![build_pending_session_notification(
                &new_waiting_sessions[0],
                language,
                &preferences.default_terminal_app,
                interaction,
            )];
        }

        vec![build_pending_sessions_summary_notification(
            &new_waiting_sessions,
            language,
        )]
    }
}

fn pending_session_notifier() -> &'static Mutex<PendingSessionNotifier> {
    PENDING_SESSION_NOTIFIER.get_or_init(|| Mutex::new(PendingSessionNotifier::default()))
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

    let raw = crate::utils::read_json_file_strict::<RawTraySession>(path).ok()?;
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

/// 呼吸动画相位：Active=🔴 实心帧，Dim=⭕ 空心帧。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
enum PulsePhase {
    #[default]
    Active,
    Dim,
}

impl PulsePhase {
    /// 翻转相位，驱动 🔴 / ⭕ 交替。
    fn toggle(self) -> Self {
        match self {
            PulsePhase::Active => PulsePhase::Dim,
            PulsePhase::Dim => PulsePhase::Active,
        }
    }
}

/// 会话托盘呼吸灯的共享状态。
/// rebuild 路径是数据所有者：计算两帧标题并写入；脉动线程只读取并按相位切换 set_title。
#[derive(Debug, Default)]
struct PulseState {
    /// 是否正在脉动（waiting>0 且开关开启 且 show_tray_sessions=true）。
    enabled: bool,
    /// 当前相位；rebuild 更新 enabled 时保持相位不变，保证视觉连续。
    phase: PulsePhase,
    /// 🔴 实心帧完整标题。
    title_active: String,
    /// ⭕ 空心帧完整标题。
    title_dim: String,
}

/// 全局呼吸灯状态，惰性初始化，生命周期与进程相同（参照 PENDING_SESSION_NOTIFIER）。
static PULSE_STATE: OnceLock<Mutex<PulseState>> = OnceLock::new();

fn pulse_state() -> &'static Mutex<PulseState> {
    PULSE_STATE.get_or_init(|| Mutex::new(PulseState::default()))
}

/// 是否应启动呼吸灯：三个条件全真才脉动。抽成纯函数便于单测。
fn should_pulse(waiting_count: usize, pulse_enabled: bool, show_sessions: bool) -> bool {
    waiting_count > 0 && pulse_enabled && show_sessions
}

/// 把更新写入给定状态并返回"当前相位对应帧"——纯函数，便于单测。
/// 保持 phase 不变以维持视觉连续。
fn apply_pulse_update(
    state: &mut PulseState,
    enabled: bool,
    title_active: String,
    title_dim: String,
) -> String {
    state.enabled = enabled;
    state.title_active = title_active;
    state.title_dim = title_dim;
    match state.phase {
        PulsePhase::Active => state.title_active.clone(),
        PulsePhase::Dim => state.title_dim.clone(),
    }
}

/// 推进一拍：disabled 返回 None；enabled 翻转相位并返回对应帧——纯函数，便于单测。
fn tick_pulse(state: &mut PulseState) -> Option<String> {
    if !state.enabled {
        return None;
    }
    state.phase = state.phase.toggle();
    Some(match state.phase {
        PulsePhase::Active => state.title_active.clone(),
        PulsePhase::Dim => state.title_dim.clone(),
    })
}

/// 更新全局共享状态，返回当前相位帧供 set_title。锁临界区只做内存操作，不在锁内做 I/O。
fn update_pulse_state(enabled: bool, title_active: String, title_dim: String) -> String {
    // 锁中毒时恢复 guard 继续工作（临界区只做内存操作），不因 panic 影响后续托盘刷新
    let mut state = pulse_state()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    apply_pulse_update(&mut state, enabled, title_active, title_dim)
}

/// 会话托盘 title：状态分类计数总览，如 `🔴 1 🟢 1 ⚪ 2`。
/// 只输出计数大于 0 的类别，让用户一眼看全各状态分布；无会话时返回 `no_sessions` 文案。
/// `style` 控制数字呈现：普通数字 / 上标角标 / 紧凑上标角标。
/// `waiting_emoji` 控制待处理段的图标：通常传 🔴；呼吸灯暗帧传 ⭕。
fn sessions_tray_title(
    sessions: &[TraySession],
    labels: &TrayLabels,
    style: SessionTrayCountStyle,
    waiting_emoji: &str,
) -> Option<String> {
    if sessions.is_empty() {
        return Some(labels.no_sessions.to_string());
    }
    let (waiting, running, other) = count_session_states(sessions);
    let segments = [
        (waiting_emoji, waiting),
        (SESSION_STATUS_RUNNING_EMOJI, running),
        (SESSION_STATUS_OTHER_EMOJI, other),
    ];
    let parts = segments
        .iter()
        .filter(|(_, count)| *count > 0)
        .map(|(emoji, count)| format_count_segment(emoji, *count, style))
        .collect::<Vec<_>>();
    // 紧凑模式段间不留空格，其余用空格分隔。
    let joiner = if style == SessionTrayCountStyle::SuperscriptCompact {
        ""
    } else {
        " "
    };
    // sessions 非空 ⇒ 至少一类计数 > 0，parts 必非空。
    Some(parts.join(joiner))
}

/// 单个状态段的文本：普通模式 `emoji 数字`，上标模式 `emoji上标数字`。
fn format_count_segment(emoji: &str, count: usize, style: SessionTrayCountStyle) -> String {
    match style {
        SessionTrayCountStyle::Plain => format!("{emoji} {count}"),
        SessionTrayCountStyle::Superscript | SessionTrayCountStyle::SuperscriptCompact => {
            format!("{emoji}{}", to_superscript(count))
        }
    }
}

/// 把十进制数字逐位映射为 Unicode 上标字符（多位数如 12 → `¹²`）。
fn to_superscript(n: usize) -> String {
    const SUPERSCRIPT: [char; 10] = ['⁰', '¹', '²', '³', '⁴', '⁵', '⁶', '⁷', '⁸', '⁹'];
    n.to_string()
        .bytes()
        .map(|b| SUPERSCRIPT[(b - b'0') as usize])
        .collect()
}

/// 按状态把会话三分类计数：(待处理, 进行中, 其它)。
/// starting 归入"进行中"；idle 及未知状态归入"其它"。
fn count_session_states(sessions: &[TraySession]) -> (usize, usize, usize) {
    let (mut waiting, mut running, mut other) = (0usize, 0usize, 0usize);
    for session in sessions {
        if is_waiting_session_status(&session.status) {
            waiting += 1;
        } else if is_running_session_status(&session.status)
            || is_starting_session_status(&session.status)
        {
            running += 1;
        } else {
            other += 1;
        }
    }
    (waiting, running, other)
}

/// 会话状态对应的分类 emoji，托盘 title 与下拉菜单项共用，保证三处归类一致。
fn session_status_emoji(status: &str) -> &'static str {
    if is_waiting_session_status(status) {
        SESSION_STATUS_WAITING_EMOJI
    } else if is_running_session_status(status) || is_starting_session_status(status) {
        SESSION_STATUS_RUNNING_EMOJI
    } else {
        SESSION_STATUS_OTHER_EMOJI
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

fn is_starting_session_status(status: &str) -> bool {
    status.trim().eq_ignore_ascii_case("starting")
}

/// 把 Tauri accelerator 字符串格式化为 macOS 符号形式,如 `Command+Control+J` → `⌘⌃J`。
/// 与前端 `shortcut-utils.ts::formatAccelerator` 同语义,用于托盘菜单提示展示。
fn format_shortcut_for_display(accelerator: &str) -> String {
    accelerator
        .split('+')
        .map(|token| match token {
            "Command" | "CommandOrControl" | "Cmd" | "Super" | "Meta" => "⌘",
            "Control" | "Ctrl" => "⌃",
            "Alt" | "Option" => "⌥",
            "Shift" => "⇧",
            other => other,
        })
        .collect()
}

/// 从会话列表中挑选"最该处理"的会话作为快捷键聚焦目标：
/// 待处理 > 运行中/启动中 > 其它；同优先级取最近活跃（sessions 已按 updated_at 降序排序）。
fn pick_focus_target_session(sessions: &[TraySession]) -> Option<&TraySession> {
    sessions
        .iter()
        .find(|session| is_waiting_session_status(&session.status))
        .or_else(|| {
            sessions.iter().find(|session| {
                is_running_session_status(&session.status)
                    || is_starting_session_status(&session.status)
            })
        })
        .or_else(|| sessions.first())
}

fn session_focus_failure_notification_enabled(preferences: &AppPreferences) -> bool {
    preferences.system_notifications_enabled
}

fn pending_session_notification_interaction(
    default_terminal_app: &str,
) -> PendingSessionNotificationInteraction {
    pending_session_notification_interaction_for_platform(
        default_terminal_app,
        cfg!(target_os = "macos"),
    )
}

fn pending_session_notification_interaction_for_platform(
    default_terminal_app: &str,
    is_macos: bool,
) -> PendingSessionNotificationInteraction {
    if is_macos && crate::terminal_focus::terminal_supports_focus(default_terminal_app) {
        PendingSessionNotificationInteraction::FocusTerminal
    } else {
        PendingSessionNotificationInteraction::Plain
    }
}

fn session_menu_focus_enabled(default_terminal_app: &str) -> bool {
    session_menu_focus_enabled_for_platform(default_terminal_app, cfg!(target_os = "macos"))
}

fn session_menu_focus_enabled_for_platform(default_terminal_app: &str, is_macos: bool) -> bool {
    is_macos && crate::terminal_focus::terminal_supports_focus(default_terminal_app)
}

fn build_pending_session_notification(
    session: &TraySession,
    language: UiLanguage,
    default_terminal_app: &str,
    interaction: PendingSessionNotificationInteraction,
) -> PendingSessionNotification {
    let project_name = session_project_name(&session.cwd);
    let truncated_project_name = crate::utils::truncate(&project_name, 48);
    let truncated_waiting_for = session
        .waiting_for
        .as_deref()
        .map(|waiting_for| crate::utils::truncate(waiting_for, SESSION_MENU_LABEL_MAX_CHARS));
    let (title, body) = pending_session_message(
        language,
        &truncated_project_name,
        truncated_waiting_for.as_deref(),
    );
    let focus_target =
        (interaction == PendingSessionNotificationInteraction::FocusTerminal).then(|| {
            PendingSessionFocusTarget {
                pid: session.pid,
                cwd: session.cwd.clone(),
                session_id: session.session_id.clone(),
                terminal_app: default_terminal_app.to_string(),
            }
        });

    PendingSessionNotification {
        title,
        body,
        language: language.as_str().to_string(),
        focus_target,
    }
}

fn build_pending_sessions_summary_notification(
    sessions: &[TraySession],
    language: UiLanguage,
) -> PendingSessionNotification {
    let project_names = sessions
        .iter()
        .map(|session| crate::utils::truncate(&session_project_name(&session.cwd), 32))
        .collect::<Vec<_>>()
        .join(", ");
    let (title, body) = pending_sessions_summary_message(language, sessions.len(), &project_names);

    PendingSessionNotification {
        title,
        body,
        language: language.as_str().to_string(),
        focus_target: None,
    }
}

fn session_menu_item_label(session: &TraySession, language: UiLanguage) -> String {
    let mut parts = vec![
        crate::utils::truncate(&session_project_name(&session.cwd), 32),
        session_status_label(language, &session.status),
    ];
    if is_waiting_session_status(&session.status) {
        if let Some(waiting_for) = &session.waiting_for {
            parts.push(crate::utils::truncate(
                waiting_for,
                SESSION_MENU_LABEL_MAX_CHARS,
            ));
        }
    }
    // 前缀加状态 emoji，与托盘 title 风格统一，让下拉菜单状态更醒目。
    format!(
        "{} {}",
        session_status_emoji(&session.status),
        parts.join(" · ")
    )
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
    let labels = tray_labels(state.app.ui_language);

    // 顶部：点击打开主窗口
    let show = MenuItemBuilder::with_id("show_window", labels.show_window).build(app)?;
    items.push(Box::new(show));
    // 显示/隐藏桌面用量浮窗（瞬时显隐，不写入偏好）
    let toggle_widget =
        MenuItemBuilder::with_id("toggle_widget", labels.toggle_widget).build(app)?;
    items.push(Box::new(toggle_widget));
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
    for (id, label) in main_tray_navigation_items(&labels) {
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
    let labels = tray_labels(state.app.ui_language);

    let header = MenuItemBuilder::with_id("sessions_header", labels.active_sessions)
        .enabled(false)
        .build(app)?;
    items.push(Box::new(header));
    items.push(Box::new(PredefinedMenuItem::separator(app)?));

    let supports_focus = session_menu_focus_enabled(&state.app.default_terminal_app);
    for session in sessions {
        let item = MenuItemBuilder::with_id(
            session_menu_item_id(session),
            session_menu_item_label(session, labels.language),
        )
        .enabled(supports_focus)
        .build(app)?;
        items.push(Box::new(item));
    }

    // 底部提示行：当聚焦快捷键可用且有会话时，展示快捷键告知用户可一键聚焦。
    // 禁用项不可点击；非 session_ 前缀 id 在 on_menu_event 中天然被忽略。
    if supports_focus && !sessions.is_empty() {
        if let Some(accelerator) = &state.app.focus_session_shortcut {
            items.push(Box::new(PredefinedMenuItem::separator(app)?));
            let hint = MenuItemBuilder::with_id(
                "sessions_focus_hint",
                format!(
                    "{} · {}",
                    format_shortcut_for_display(accelerator),
                    labels.focus_shortcut_hint
                ),
            )
            .enabled(false)
            .build(app)?;
            items.push(Box::new(hint));
        }
    }

    let refs: Vec<&dyn tauri::menu::IsMenuItem<tauri::Wry>> = items
        .iter()
        .map(|b| b.as_ref() as &dyn tauri::menu::IsMenuItem<tauri::Wry>)
        .collect();
    Menu::with_items(app, &refs)
}

/// 获取托盘 title：当设置开启且有激活配置时返回配置名（可按字数限制截断）
fn get_tray_title(state: &ConfigRegistry) -> Option<String> {
    if !state.app.show_tray_title {
        return None;
    }
    let active_id = state.bindings.user_profile_id.as_ref()?;
    let name = state
        .profiles
        .iter()
        .find(|profile| &profile.id == active_id)
        .map(|profile| profile.name.clone())?;
    Some(match state.app.tray_title_max_chars {
        // 菜单栏标题按字数限制截断，不追加省略号，直接取前 max 个字符
        Some(max) if max > 0 => name.chars().take(max as usize).collect(),
        _ => name,
    })
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

/// 读取当前会话并聚合为 LED 状态，供 LED 运行时启动时初始同步。
pub(crate) fn current_session_led_state() -> crate::led::SessionLedState {
    let sessions = load_tray_sessions();
    let (waiting, running, other) = count_session_states(&sessions);
    crate::led::SessionLedState::from_counts(waiting, running, other)
}

fn rebuild_sessions_tray(app_handle: &AppHandle, state: &ConfigRegistry) {
    let sessions = load_tray_sessions();
    handle_pending_session_notifications(app_handle, state, &sessions);

    // 把会话聚合状态镜像到 LED 设备（独立于会话托盘是否可见，故放在可见性早返回之前）。
    let (waiting, running, other) = count_session_states(&sessions);
    crate::led::on_session_state_changed(
        app_handle,
        crate::led::SessionLedState::from_counts(waiting, running, other),
    );

    let Some(tray) = app_handle.tray_by_id(SESSIONS_TRAY_ID) else {
        return;
    };

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
    if let Err(e) = tray.set_visible(state.app.show_tray_sessions) {
        log::warn!(
            "event=tray.sessions_visible status=err visible={} error={e}",
            state.app.show_tray_sessions
        );
    }

    // macOS 会话托盘仅靠 title 显示；开启时必须保持非空 title，
    // 避免状态栏项进入零宽后在部分机器上无法稳定恢复。Windows 不支持 title，
    // Linux title 依赖 icon，因此非 macOS 在创建时会补一个图标。
    if !state.app.show_tray_sessions {
        // 关闭会话托盘时一并停掉呼吸灯，避免脉动线程继续写 title。
        update_pulse_state(false, String::new(), String::new());
        if let Err(e) = tray.set_title(Some("")) {
            log::warn!("event=tray.sessions_title status=err action=clear error={e}");
        }
        return false;
    }

    let labels = tray_labels(state.app.ui_language);
    let style = state.app.session_tray_count_style;
    let (waiting, _, _) = count_session_states(sessions);
    let do_pulse = should_pulse(waiting, state.app.tray_pulse_waiting, true);

    // 🔴 实心帧，同时也是不脉动时的静态标题。
    let title_active = sessions_tray_title(sessions, &labels, style, SESSION_STATUS_WAITING_EMOJI)
        .unwrap_or_else(|| labels.no_sessions.to_string());
    // ⭕ 空心帧：仅在需要脉动时生成，否则与实心帧一致（节省一次拼接）。
    let title_dim = if do_pulse {
        sessions_tray_title(sessions, &labels, style, SESSION_STATUS_WAITING_DIM_EMOJI)
            .unwrap_or_else(|| labels.no_sessions.to_string())
    } else {
        title_active.clone()
    };

    // 更新共享状态并取回当前相位帧；脉动线程随后接管 🔴 / ⭕ 交替。
    let current_title = update_pulse_state(do_pulse, title_active, title_dim);
    if let Err(e) = tray.set_title(Some(current_title.as_str())) {
        log::warn!("event=tray.sessions_title status=err action=set error={e}");
    }
    true
}

/// 启动全局唯一的呼吸灯脉动线程。
/// 在 setup 中托盘创建后调用一次；通过 PULSE_STATE 与 rebuild 路径通信。
/// 单一半周期循环：每周期翻转一次相位；enabled=false 时本周期不写 title。
/// 用 std::thread 而非 tokio 定时器：项目未启用 tokio `time` feature，
/// 且与 watcher / osascript 的 std::thread 用法一致；跨线程 set_title 已被 watcher 链路验证安全。
pub fn start_pulse_task(app_handle: AppHandle) {
    let spawn_result = std::thread::Builder::new()
        .name("tray-pulse".to_string())
        .spawn(move || {
            let half = std::time::Duration::from_millis(PULSE_HALF_PERIOD_MS);
            loop {
                std::thread::sleep(half);
                // 锁内只做内存操作：disabled 返回 None；enabled 翻转相位并取出对应帧。
                let next_title = {
                    // 锁中毒时恢复 guard 继续工作，不让呼吸灯线程因 panic 永久失效
                    let mut state = pulse_state()
                        .lock()
                        .unwrap_or_else(|poisoned| poisoned.into_inner());
                    tick_pulse(&mut state)
                };
                // set_title 一律在锁外。
                if let Some(title) = next_title {
                    if let Some(tray) = app_handle.tray_by_id(SESSIONS_TRAY_ID) {
                        let _ = tray.set_title(Some(title.as_str()));
                    }
                }
            }
        });
    if let Err(e) = spawn_result {
        // 呼吸灯是增强功能，线程创建失败不影响主流程，只记日志。
        log::warn!("event=tray.pulse status=err reason=thread_failed error={e}");
    }
}

/// 仅刷新会话托盘（标题与菜单项），不重建主托盘。
/// watcher 检测到 `~/.claude/sessions/` 变化时使用：sessions 变化对主托盘配置无影响，
/// 不需要重新构造 Profile 子菜单和绑定状态。
pub fn rebuild_sessions_tray_only(app_handle: &AppHandle) {
    let state = load_registry_or_default();
    rebuild_sessions_tray(app_handle, &state);
}

/// 全局快捷键触发：聚焦"最该处理"的会话终端。
/// 复用与会话托盘点击相同的链路（守卫、osascript 聚焦、失败通知）。
pub fn focus_most_urgent_session(app: &AppHandle) {
    let prefs = load_registry_or_default().app;
    let slug = prefs.default_terminal_app.clone();
    // 非 macOS 或当前终端不支持聚焦时直接返回
    if !session_menu_focus_enabled(&slug) {
        return;
    }
    let sessions = load_tray_sessions();
    let Some(target) = pick_focus_target_session(&sessions) else {
        // 无活跃会话：不弹通知，仅记日志
        log::info!("event=tray.focus_shortcut status=skip reason=no_sessions");
        return;
    };
    let pid = target.pid;
    let cwd = target.cwd.clone();
    let notifications_enabled = session_focus_failure_notification_enabled(&prefs);
    let language = prefs.ui_language;
    // osascript 可能耗数百毫秒，丢线程避免阻塞快捷键回调线程。
    let app_handle = app.clone();
    std::thread::spawn(move || {
        if let Err(failure) = crate::terminal_focus::focus_session_in_terminal(pid, &cwd, &slug) {
            notify_session_focus_failure(&app_handle, language, notifications_enabled, &failure);
        }
    });
}

/// 按当前偏好注册"聚焦会话终端"全局快捷键。
/// 先解除旧注册再注册新组合；`None`、空组合、非 macOS 或解析失败都只解除不注册。
/// `set_app_preferences` 保存后与 `setup` 启动时各调用一次，做到改键即时生效。
pub fn apply_focus_session_shortcut(app: &AppHandle) {
    use tauri_plugin_global_shortcut::GlobalShortcutExt;

    let shortcuts = app.global_shortcut();
    // 我们只拥有这一个全局快捷键，全部解除最简单且安全。
    let _ = shortcuts.unregister_all();

    // 聚焦仅 macOS 支持，其它平台不注册
    if !cfg!(target_os = "macos") {
        return;
    }
    let Some(accelerator) = load_registry_or_default().app.focus_session_shortcut else {
        return;
    };
    match shortcuts.register(accelerator.as_str()) {
        Ok(()) => log::info!("event=tray.focus_shortcut.register status=ok"),
        Err(e) => log::warn!(
            "event=tray.focus_shortcut.register status=err accelerator={accelerator} error={e}"
        ),
    }
}

/// 显示并聚焦主窗口
pub(crate) fn show_main_window(app: &AppHandle) {
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
pub(crate) fn notify_session_focus_failure(
    app: &AppHandle,
    language: UiLanguage,
    notifications_enabled: bool,
    failure: &crate::terminal_focus::FocusFailure,
) {
    if !notifications_enabled {
        log::warn!("event=tray.session_focus.notify status=skip reason=disabled");
        return;
    }

    let (title, body) = failure.user_message(language);
    if let Err(e) = app
        .notification()
        .builder()
        .title(&title)
        .body(&body)
        .show()
    {
        // 通知失败不是核心路径，只记日志避免用户什么都看不到时噪声堆叠。
        log::warn!("event=tray.session_focus.notify status=err error={e}");
    }
}

fn handle_pending_session_notifications(
    app: &AppHandle,
    state: &ConfigRegistry,
    sessions: &[TraySession],
) {
    let labels = tray_labels(state.app.ui_language);
    let interaction = pending_session_notification_interaction(&state.app.default_terminal_app);
    let (notifications, has_new_waiting) = match pending_session_notifier().lock() {
        Ok(mut notifier) => {
            let notifications =
                notifier.observe(&state.app, sessions, labels.language, interaction);
            (notifications, notifier.last_had_new_waiting)
        }
        Err(e) => {
            log::warn!("event=tray.pending_session_notify status=err reason=lock error={e}");
            return;
        }
    };

    // 音效独立门控：仅看自身开关 + 是否出现新等待会话，每轮最多播一次
    if state.app.waiting_sound_enabled && has_new_waiting {
        crate::sound::play_waiting_sound(state.app.waiting_sound);
    }

    for notification in notifications {
        show_pending_session_notification(app, notification);
    }
}

fn show_pending_session_notification(app: &AppHandle, notification: PendingSessionNotification) {
    if let Some(target) = notification.focus_target.clone() {
        show_clickable_pending_session_notification(app, notification, target);
    } else {
        show_plain_pending_session_notification(app, &notification);
    }
}

fn show_plain_pending_session_notification(
    app: &AppHandle,
    notification: &PendingSessionNotification,
) {
    if let Err(e) = app
        .notification()
        .builder()
        .title(&notification.title)
        .body(&notification.body)
        .show()
    {
        log::warn!("event=tray.pending_session_notify status=err mode=plain error={e}");
    }
}

#[cfg(target_os = "macos")]
fn show_clickable_pending_session_notification(
    app: &AppHandle,
    notification: PendingSessionNotification,
    target: PendingSessionFocusTarget,
) {
    deliver_clickable_pending_session_notification_with(
        || {
            crate::macos_notifications::show_pending_session_focus_notification(
                app,
                &notification.title,
                &notification.body,
                &target,
            )
        },
        |e| {
            log::warn!("event=tray.pending_session_notify status=err mode=clickable error={e}");
            show_plain_pending_session_notification(app, &notification);
        },
    );
}

#[cfg(target_os = "macos")]
fn deliver_clickable_pending_session_notification_with(
    send_clickable: impl FnOnce() -> Result<(), String>,
    fallback_plain: impl FnOnce(&str),
) {
    if let Err(e) = send_clickable() {
        fallback_plain(&e);
    }
}

#[cfg(not(target_os = "macos"))]
fn show_clickable_pending_session_notification(
    app: &AppHandle,
    notification: PendingSessionNotification,
    _target: PendingSessionFocusTarget,
) {
    show_plain_pending_session_notification(app, &notification);
}

/// 初始化系统托盘
pub fn setup_tray(app: &tauri::App) -> tauri::Result<()> {
    let handle = app.handle();
    let state = load_registry_or_default();
    let menu = build_tray_menu(handle, &state)?;
    let sessions = load_tray_sessions();
    handle_pending_session_notifications(handle, &state, &sessions);
    let sessions_menu = build_sessions_tray_menu(handle, &state, &sessions)?;
    let labels = tray_labels(state.app.ui_language);
    let sessions_title = if state.app.show_tray_sessions {
        sessions_tray_title(
            &sessions,
            &labels,
            state.app.session_tray_count_style,
            SESSION_STATUS_WAITING_EMOJI,
        )
    } else {
        None
    };

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
        .tooltip(labels.sessions_tooltip)
        .menu(&sessions_menu)
        .show_menu_on_left_click(true)
        .on_menu_event(|app, event| {
            let id = event.id().as_ref();
            let Some((pid, cwd)) = parse_session_menu_item_id(id) else {
                return;
            };
            let prefs = load_registry_or_default().app;
            let notifications_enabled = session_focus_failure_notification_enabled(&prefs);
            let slug = prefs.default_terminal_app;
            let language = prefs.ui_language;
            if !session_menu_focus_enabled(&slug) {
                return;
            }
            // osascript 可能耗数百毫秒，丢线程避免阻塞 UI 事件循环。
            let app_handle = app.clone();
            std::thread::spawn(move || {
                if let Err(failure) =
                    crate::terminal_focus::focus_session_in_terminal(pid, &cwd, &slug)
                {
                    notify_session_focus_failure(
                        &app_handle,
                        language,
                        notifications_enabled,
                        &failure,
                    );
                }
            });
        });
    if let Some(title) = &sessions_title {
        sessions_builder = sessions_builder.title(title);
    }
    #[cfg(not(target_os = "macos"))]
    {
        sessions_builder = sessions_builder.icon(icon.clone());
    }
    let sessions_tray = sessions_builder.build(app)?;
    let _ = sessions_tray.set_visible(state.app.show_tray_sessions);
    // 初始化呼吸灯状态：启动时若已有待处理会话且开关开启，让脉动线程立即接管。
    // 通知 baseline 已在上方 handle_pending_session_notifications 建立，
    // 这里复用 apply_sessions_tray_title（只管 title 与 PulseState，不触发通知）。
    apply_sessions_tray_title(&sessions_tray, &state, &sessions);

    // 构建托盘图标，若设置开启且有激活配置则在图标旁显示配置名
    let mut builder = TrayIconBuilder::with_id(MAIN_TRAY_ID)
        .icon(icon)
        .tooltip("Code Manager")
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
                    "toggle_widget" => {
                        // 读取浮窗当前可见性后取反，瞬时显隐（不持久化偏好）
                        let visible = app
                            .get_webview_window(crate::widget::WIDGET_WINDOW_LABEL)
                            .and_then(|window| window.is_visible().ok())
                            .unwrap_or(false);
                        let _ = crate::widget::toggle_floating_widget(app.clone(), !visible);
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
    #[cfg(target_os = "macos")]
    use super::deliver_clickable_pending_session_notification_with;
    use super::{
        apply_pulse_update, build_pending_session_notification, format_shortcut_for_display,
        get_tray_title, is_running_session_status, is_starting_session_status,
        is_waiting_session_status, load_tray_sessions_from_dir, main_tray_navigation_items,
        parse_session_menu_item_id, pending_session_notification_interaction_for_platform,
        pick_focus_target_session, session_focus_failure_notification_enabled,
        session_menu_focus_enabled_for_platform, session_menu_item_id, session_menu_item_label,
        session_project_name, session_status_emoji, session_status_label, sessions_tray_title,
        should_pulse, tick_pulse, to_superscript, tray_labels, PendingSessionFocusTarget,
        PendingSessionNotificationInteraction, PendingSessionNotifier, PulsePhase, PulseState,
        RawTraySession, TraySession, SESSION_STATUS_WAITING_DIM_EMOJI,
        SESSION_STATUS_WAITING_EMOJI,
    };
    use crate::config::{
        AppPreferences, BindingState, ConfigProfile, ConfigRegistry, SessionTrayCountStyle,
        UiLanguage,
    };
    use serde_json::json;
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

    fn test_session_with_id(
        session_id: &str,
        cwd: &str,
        status: &str,
        updated_at: u64,
    ) -> TraySession {
        TraySession {
            session_id: session_id.to_string(),
            ..test_session(cwd, status, updated_at)
        }
    }

    fn test_preferences(
        system_notifications_enabled: bool,
        default_terminal_app: &str,
    ) -> AppPreferences {
        AppPreferences {
            show_tray_title: true,
            show_tray_sessions: true,
            system_notifications_enabled,
            collapse_sidebar_by_default: false,
            third_party_provider_pricing_enabled: true,
            ui_language: crate::config::UiLanguage::Zh,
            default_terminal_app: default_terminal_app.to_string(),
            default_editor_app: None,
            tray_title_max_chars: None,
            session_tray_count_style: SessionTrayCountStyle::default(),
            tray_pulse_waiting: true,
            focus_session_shortcut: None,
            led_control: crate::led::LedControlPreferences::default(),
            floating_widget_enabled: false,
            floating_widget_metrics: Vec::new(),
            floating_widget_opacity: 92,
            waiting_sound_enabled: false,
            waiting_sound: crate::config::WaitingSound::default(),
        }
    }

    #[test]
    fn tray_labels_follow_selected_language() {
        let zh = tray_labels(UiLanguage::Zh);
        assert_eq!(zh.show_window, "打开 Code Manager");
        assert_eq!(zh.toggle_widget, "显示/隐藏浮窗");
        assert_eq!(zh.nav_configs, "配置");
        assert_eq!(zh.no_sessions, "无会话");
        assert_eq!(zh.nav_memory, "记忆");
        assert_eq!(zh.nav_skills, "Skills");
        assert_eq!(zh.nav_projects, "项目");
        assert_eq!(zh.nav_history, "历史");
        assert_eq!(zh.nav_stats, "统计");
        assert_eq!(zh.nav_usage, "用量");
        assert_eq!(zh.quit, "退出");

        let en = tray_labels(UiLanguage::En);
        assert_eq!(en.show_window, "Open Code Manager");
        assert_eq!(en.toggle_widget, "Toggle Floating Widget");
        assert_eq!(en.nav_configs, "Profiles");
        assert_eq!(en.no_sessions, "No Sessions");
        assert_eq!(en.nav_memory, "Memory");
        assert_eq!(en.nav_skills, "Skills");
        assert_eq!(en.nav_projects, "Projects");
        assert_eq!(en.nav_history, "History");
        assert_eq!(en.nav_stats, "Stats");
        assert_eq!(en.nav_usage, "Usage");
        assert_eq!(en.quit, "Quit");
    }

    #[test]
    fn main_tray_navigation_omits_presets() {
        let zh = tray_labels(UiLanguage::Zh);
        let items = main_tray_navigation_items(&zh);

        assert!(items.iter().all(|(id, _)| *id != "nav_providers"));
        assert!(items.iter().all(|(_, label)| *label != "预设"));
        assert_eq!(
            items.iter().map(|(id, _)| *id).collect::<Vec<_>>(),
            vec![
                "nav_memory",
                "nav_skills",
                "nav_projects",
                "nav_history",
                "nav_stats",
                "nav_usage"
            ],
        );
    }

    #[test]
    fn load_tray_sessions_reads_valid_json_and_skips_invalid_entries() {
        let root = std::env::temp_dir().join(format!(
            "code-manager-tray-sessions-{}",
            uuid::Uuid::new_v4()
        ));
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
        assert_eq!(session_status_label(UiLanguage::Zh, "waiting"), "待处理");
        assert_eq!(session_status_label(UiLanguage::Zh, "idle"), "空闲");
        assert_eq!(session_status_label(UiLanguage::En, "running"), "Running");
        assert_eq!(session_status_label(UiLanguage::En, "custom"), "custom");
    }

    #[test]
    fn sessions_tray_title_shows_status_counts() {
        let zh = tray_labels(UiLanguage::Zh);
        let plain = SessionTrayCountStyle::Plain;
        let idle = test_session("/Users/demo/work/code-manager", "idle", 1000);
        let another_idle = test_session("/Users/demo/work/docs", "idle", 900);
        let waiting = test_session("/Users/demo/work/waiting-repo", "waiting", 2000);
        let running = test_session("/Users/demo/work/running-repo", "running", 1500);

        // 空：回退到"无会话"文案
        assert_eq!(
            sessions_tray_title(&[], &zh, plain, SESSION_STATUS_WAITING_EMOJI).as_deref(),
            Some("无会话")
        );
        // 单个空闲：只输出 ⚪ 类别
        assert_eq!(
            sessions_tray_title(
                std::slice::from_ref(&idle),
                &zh,
                plain,
                SESSION_STATUS_WAITING_EMOJI
            )
            .as_deref(),
            Some("⚪ 1")
        );
        // 混合：按 待处理 → 进行中 → 其它 顺序输出，各类别独立计数
        assert_eq!(
            sessions_tray_title(
                &[idle.clone(), running.clone(), waiting],
                &zh,
                plain,
                SESSION_STATUS_WAITING_EMOJI
            )
            .as_deref(),
            Some("🔴 1 🟢 1 ⚪ 1")
        );
        // 只输出计数 > 0 的类别：无待处理时不出现 🔴
        assert_eq!(
            sessions_tray_title(
                &[idle.clone(), running],
                &zh,
                plain,
                SESSION_STATUS_WAITING_EMOJI
            )
            .as_deref(),
            Some("🟢 1 ⚪ 1")
        );
        // 全空闲：聚合为 ⚪ N
        assert_eq!(
            sessions_tray_title(
                &[idle, another_idle],
                &zh,
                plain,
                SESSION_STATUS_WAITING_EMOJI
            )
            .as_deref(),
            Some("⚪ 2")
        );
        // starting 归入"进行中"
        assert_eq!(
            sessions_tray_title(
                &[test_session("/tmp/repo", "starting", 1000)],
                &zh,
                plain,
                SESSION_STATUS_WAITING_EMOJI,
            )
            .as_deref(),
            Some("🟢 1")
        );
    }

    #[test]
    fn sessions_tray_title_renders_each_count_style() {
        let zh = tray_labels(UiLanguage::Zh);
        // 1 待处理 + 1 进行中 + 2 空闲
        let sessions = [
            test_session("/a", "waiting", 4000),
            test_session("/b", "running", 3000),
            test_session("/c", "idle", 2000),
            test_session("/d", "idle", 1000),
        ];
        assert_eq!(
            sessions_tray_title(
                &sessions,
                &zh,
                SessionTrayCountStyle::Plain,
                SESSION_STATUS_WAITING_EMOJI
            )
            .as_deref(),
            Some("🔴 1 🟢 1 ⚪ 2")
        );
        assert_eq!(
            sessions_tray_title(
                &sessions,
                &zh,
                SessionTrayCountStyle::Superscript,
                SESSION_STATUS_WAITING_EMOJI
            )
            .as_deref(),
            Some("🔴¹ 🟢¹ ⚪²")
        );
        assert_eq!(
            sessions_tray_title(
                &sessions,
                &zh,
                SessionTrayCountStyle::SuperscriptCompact,
                SESSION_STATUS_WAITING_EMOJI,
            )
            .as_deref(),
            Some("🔴¹🟢¹⚪²")
        );
    }

    #[test]
    fn to_superscript_maps_each_digit() {
        assert_eq!(to_superscript(0), "⁰");
        assert_eq!(to_superscript(7), "⁷");
        assert_eq!(to_superscript(12), "¹²");
        assert_eq!(to_superscript(2030), "²⁰³⁰");
    }

    #[test]
    fn should_pulse_requires_waiting_enabled_and_visible() {
        // 三个条件必须全部满足才脉动
        assert!(!should_pulse(0, true, true)); // 无待处理会话
        assert!(!should_pulse(1, false, true)); // 开关关闭
        assert!(!should_pulse(1, true, false)); // 会话托盘隐藏
        assert!(should_pulse(1, true, true)); // 全满足
        assert!(should_pulse(9, true, true)); // 多个待处理也脉动
    }

    #[test]
    fn pulse_phase_toggle_alternates() {
        assert_eq!(PulsePhase::Active.toggle(), PulsePhase::Dim);
        assert_eq!(PulsePhase::Dim.toggle(), PulsePhase::Active);
    }

    #[test]
    fn sessions_tray_title_dim_emoji_replaces_only_waiting_segment() {
        let zh = tray_labels(UiLanguage::Zh);
        let sessions = [
            test_session("/w", "waiting", 3000),
            test_session("/r", "running", 2000),
            test_session("/i", "idle", 1000),
        ];
        // 暗帧：⭕ 替代 🔴，🟢 / ⚪ 段保持不变
        assert_eq!(
            sessions_tray_title(
                &sessions,
                &zh,
                SessionTrayCountStyle::Plain,
                SESSION_STATUS_WAITING_DIM_EMOJI,
            )
            .as_deref(),
            Some("⭕ 1 🟢 1 ⚪ 1")
        );
        // 实心帧保持 🔴
        assert_eq!(
            sessions_tray_title(
                &sessions,
                &zh,
                SessionTrayCountStyle::Plain,
                SESSION_STATUS_WAITING_EMOJI,
            )
            .as_deref(),
            Some("🔴 1 🟢 1 ⚪ 1")
        );
    }

    #[test]
    fn sessions_tray_title_dim_emoji_across_all_styles() {
        let zh = tray_labels(UiLanguage::Zh);
        // 1 待处理 + 1 进行中 + 2 空闲
        let sessions = [
            test_session("/a", "waiting", 4000),
            test_session("/b", "running", 3000),
            test_session("/c", "idle", 2000),
            test_session("/d", "idle", 1000),
        ];
        assert_eq!(
            sessions_tray_title(
                &sessions,
                &zh,
                SessionTrayCountStyle::Plain,
                SESSION_STATUS_WAITING_DIM_EMOJI,
            )
            .as_deref(),
            Some("⭕ 1 🟢 1 ⚪ 2")
        );
        assert_eq!(
            sessions_tray_title(
                &sessions,
                &zh,
                SessionTrayCountStyle::Superscript,
                SESSION_STATUS_WAITING_DIM_EMOJI,
            )
            .as_deref(),
            Some("⭕¹ 🟢¹ ⚪²")
        );
        assert_eq!(
            sessions_tray_title(
                &sessions,
                &zh,
                SessionTrayCountStyle::SuperscriptCompact,
                SESSION_STATUS_WAITING_DIM_EMOJI,
            )
            .as_deref(),
            Some("⭕¹🟢¹⚪²")
        );
    }

    #[test]
    fn apply_pulse_update_returns_current_phase_frame_and_keeps_phase() {
        let mut state = PulseState::default(); // 默认 phase=Active
        let frame = apply_pulse_update(&mut state, true, "ACTIVE".to_string(), "DIM".to_string());
        assert_eq!(frame, "ACTIVE"); // 当前 Active 相位返回实心帧
        assert!(state.enabled);
        assert_eq!(state.phase, PulsePhase::Active); // 相位不被重置

        // 切到 Dim 相位后再更新，应返回暗帧
        state.phase = PulsePhase::Dim;
        let frame = apply_pulse_update(&mut state, true, "A2".to_string(), "D2".to_string());
        assert_eq!(frame, "D2");
        assert_eq!(state.phase, PulsePhase::Dim);
    }

    #[test]
    fn tick_pulse_returns_none_when_disabled() {
        let mut state = PulseState::default(); // enabled=false
        assert_eq!(tick_pulse(&mut state), None);
    }

    #[test]
    fn tick_pulse_alternates_frames_when_enabled() {
        let mut state = PulseState {
            enabled: true,
            phase: PulsePhase::Active,
            title_active: "ACTIVE".to_string(),
            title_dim: "DIM".to_string(),
        };
        // Active→Dim，返回暗帧
        assert_eq!(tick_pulse(&mut state).as_deref(), Some("DIM"));
        // Dim→Active，返回实心帧
        assert_eq!(tick_pulse(&mut state).as_deref(), Some("ACTIVE"));
    }

    #[test]
    fn format_shortcut_for_display_maps_modifiers_to_symbols() {
        assert_eq!(format_shortcut_for_display("Command+Control+J"), "⌘⌃J");
        assert_eq!(format_shortcut_for_display("Alt+Shift+1"), "⌥⇧1");
        // 未知 token 原样透传
        assert_eq!(format_shortcut_for_display("Command+Space"), "⌘Space");
    }

    #[test]
    fn pick_focus_target_prefers_waiting_then_running_then_recent() {
        // 入参假定已按 updated_at 降序（load_tray_sessions 的排序）
        let waiting = test_session("/w", "waiting", 100);
        let running = test_session("/r", "running", 200);
        let idle_new = test_session("/i1", "idle", 300);
        let idle_old = test_session("/i2", "idle", 50);

        // 有 waiting：即便它不是最近活跃，也优先聚焦
        let sessions = [idle_new.clone(), running.clone(), waiting.clone()];
        assert_eq!(
            pick_focus_target_session(&sessions).map(|s| s.cwd.as_str()),
            Some("/w")
        );

        // 无 waiting，有 running：聚焦 running
        let sessions = [idle_new.clone(), running, idle_old.clone()];
        assert_eq!(
            pick_focus_target_session(&sessions).map(|s| s.cwd.as_str()),
            Some("/r")
        );

        // 全 idle：取列表第一个（最近活跃）
        let sessions = [idle_new, idle_old];
        assert_eq!(
            pick_focus_target_session(&sessions).map(|s| s.cwd.as_str()),
            Some("/i1")
        );

        // 空列表：None
        assert_eq!(pick_focus_target_session(&[]).map(|s| s.cwd.as_str()), None);
    }

    #[test]
    fn session_status_emoji_classifies_by_priority() {
        assert_eq!(session_status_emoji("waiting"), "🔴");
        assert_eq!(session_status_emoji("running"), "🟢");
        assert_eq!(session_status_emoji("busy"), "🟢");
        assert_eq!(session_status_emoji("starting"), "🟢");
        assert_eq!(session_status_emoji("idle"), "⚪");
        assert_eq!(session_status_emoji("exited"), "⚪");
        assert_eq!(session_status_emoji("unknown"), "⚪");
    }

    #[test]
    fn session_menu_item_label_includes_status_project_and_waiting_reason() {
        let mut session = test_session("/Users/demo/work/code-manager", "waiting", 2000);
        session.pid = 2491;
        session.waiting_for = Some("approve Bash".to_string());

        assert_eq!(
            session_menu_item_label(&session, UiLanguage::Zh),
            "🔴 code-manager · 待处理 · approve Bash"
        );
        assert_eq!(
            session_menu_item_label(&session, UiLanguage::En),
            "🔴 code-manager · Waiting · approve Bash"
        );
    }

    #[test]
    fn pending_session_notifier_uses_first_snapshot_as_baseline() {
        let mut notifier = PendingSessionNotifier::default();
        let waiting = test_session("/Users/demo/work/code-manager", "waiting", 2000);

        let notifications = notifier.observe(
            &test_preferences(true, "terminal"),
            std::slice::from_ref(&waiting),
            UiLanguage::Zh,
            PendingSessionNotificationInteraction::Plain,
        );

        assert!(notifications.is_empty());
    }

    #[test]
    fn pending_session_notifier_reports_new_waiting_session_once() {
        let mut notifier = PendingSessionNotifier::default();
        let idle = test_session("/Users/demo/work/code-manager", "idle", 1000);
        let mut waiting = test_session("/Users/demo/work/code-manager", "waiting", 2000);
        waiting.waiting_for = Some("approve Bash".to_string());
        notifier.observe(
            &test_preferences(true, "terminal"),
            std::slice::from_ref(&idle),
            UiLanguage::Zh,
            PendingSessionNotificationInteraction::Plain,
        );

        let first_notifications = notifier.observe(
            &test_preferences(true, "terminal"),
            std::slice::from_ref(&waiting),
            UiLanguage::Zh,
            PendingSessionNotificationInteraction::Plain,
        );
        let repeated_notifications = notifier.observe(
            &test_preferences(true, "terminal"),
            std::slice::from_ref(&waiting),
            UiLanguage::Zh,
            PendingSessionNotificationInteraction::Plain,
        );

        assert_eq!(first_notifications.len(), 1);
        assert_eq!(first_notifications[0].title, "Claude 会话待处理");
        assert_eq!(first_notifications[0].body, "code-manager · approve Bash");
        assert!(first_notifications[0].focus_target.is_none());
        assert!(repeated_notifications.is_empty());
    }

    #[test]
    fn pending_session_notifier_flags_new_waiting_independent_of_system_notifications() {
        let mut notifier = PendingSessionNotifier::default();
        let idle = test_session("/Users/demo/work/code-manager", "idle", 1000);
        let waiting = test_session("/Users/demo/work/code-manager", "waiting", 2000);

        // 首帧基线：即便有 waiting 也不算"新出现"
        notifier.observe(
            &test_preferences(false, "terminal"),
            std::slice::from_ref(&idle),
            UiLanguage::Zh,
            PendingSessionNotificationInteraction::Plain,
        );
        assert!(!notifier.last_had_new_waiting, "首帧不应触发音效信号");

        // 出现新 waiting：系统通知关闭（false）时仍应置位音效信号，且不产生通知
        let notifications = notifier.observe(
            &test_preferences(false, "terminal"),
            std::slice::from_ref(&waiting),
            UiLanguage::Zh,
            PendingSessionNotificationInteraction::Plain,
        );
        assert!(notifier.last_had_new_waiting, "新等待会话应置位音效信号");
        assert!(notifications.is_empty(), "系统通知关闭时不产生通知");

        // 同一 waiting 重复：不再是"新"
        notifier.observe(
            &test_preferences(false, "terminal"),
            std::slice::from_ref(&waiting),
            UiLanguage::Zh,
            PendingSessionNotificationInteraction::Plain,
        );
        assert!(!notifier.last_had_new_waiting, "重复 waiting 不应再置位");
    }

    #[test]
    fn pending_session_notifier_ignores_repeated_waiting_snapshots() {
        let mut notifier = PendingSessionNotifier::default();
        let idle = test_session("/Users/demo/work/code-manager", "idle", 1000);
        let waiting = test_session("/Users/demo/work/code-manager", "waiting", 2000);
        notifier.observe(
            &test_preferences(true, "terminal"),
            std::slice::from_ref(&idle),
            UiLanguage::Zh,
            PendingSessionNotificationInteraction::Plain,
        );

        let first_notifications = notifier.observe(
            &test_preferences(true, "terminal"),
            std::slice::from_ref(&waiting),
            UiLanguage::Zh,
            PendingSessionNotificationInteraction::Plain,
        );
        let repeated_count = (0..10)
            .map(|_| {
                notifier
                    .observe(
                        &test_preferences(true, "terminal"),
                        std::slice::from_ref(&waiting),
                        UiLanguage::Zh,
                        PendingSessionNotificationInteraction::Plain,
                    )
                    .len()
            })
            .sum::<usize>();

        assert_eq!(first_notifications.len(), 1);
        assert_eq!(repeated_count, 0);
    }

    #[test]
    fn pending_session_notifier_reports_waiting_again_after_recovery() {
        let mut notifier = PendingSessionNotifier::default();
        let idle = test_session("/Users/demo/work/code-manager", "idle", 1000);
        let waiting = test_session("/Users/demo/work/code-manager", "waiting", 2000);
        notifier.observe(
            &test_preferences(true, "terminal"),
            std::slice::from_ref(&idle),
            UiLanguage::Zh,
            PendingSessionNotificationInteraction::Plain,
        );
        let _ = notifier.observe(
            &test_preferences(true, "terminal"),
            std::slice::from_ref(&waiting),
            UiLanguage::Zh,
            PendingSessionNotificationInteraction::Plain,
        );
        let _ = notifier.observe(
            &test_preferences(true, "terminal"),
            std::slice::from_ref(&idle),
            UiLanguage::Zh,
            PendingSessionNotificationInteraction::Plain,
        );

        let notifications = notifier.observe(
            &test_preferences(true, "terminal"),
            std::slice::from_ref(&waiting),
            UiLanguage::Zh,
            PendingSessionNotificationInteraction::Plain,
        );

        assert_eq!(notifications.len(), 1);
    }

    #[test]
    fn pending_session_notifier_updates_baseline_when_system_notifications_disabled() {
        let mut notifier = PendingSessionNotifier::default();
        let idle = test_session("/Users/demo/work/code-manager", "idle", 1000);
        let waiting = test_session("/Users/demo/work/code-manager", "waiting", 2000);
        notifier.observe(
            &test_preferences(false, "terminal"),
            std::slice::from_ref(&idle),
            UiLanguage::Zh,
            PendingSessionNotificationInteraction::Plain,
        );
        let disabled_notifications = notifier.observe(
            &test_preferences(false, "terminal"),
            std::slice::from_ref(&waiting),
            UiLanguage::Zh,
            PendingSessionNotificationInteraction::Plain,
        );

        let enabled_notifications = notifier.observe(
            &test_preferences(true, "terminal"),
            std::slice::from_ref(&waiting),
            UiLanguage::Zh,
            PendingSessionNotificationInteraction::Plain,
        );

        assert!(disabled_notifications.is_empty());
        assert!(enabled_notifications.is_empty());
    }

    #[test]
    fn session_focus_failure_notification_respects_system_notification_preference() {
        assert!(!session_focus_failure_notification_enabled(
            &test_preferences(false, "terminal")
        ));
        assert!(session_focus_failure_notification_enabled(
            &test_preferences(true, "terminal")
        ));
    }

    #[test]
    fn pending_session_notifier_summarizes_multiple_new_waiting_sessions_without_focus_target() {
        let mut notifier = PendingSessionNotifier::default();
        notifier.observe(
            &test_preferences(true, "terminal"),
            &[],
            UiLanguage::Zh,
            PendingSessionNotificationInteraction::FocusTerminal,
        );
        let first = test_session_with_id(
            "session-1",
            "/Users/demo/work/code-manager",
            "waiting",
            2000,
        );
        let second = test_session_with_id("session-2", "/Users/demo/work/docs", "waiting", 1900);

        let notifications = notifier.observe(
            &test_preferences(true, "terminal"),
            &[first, second],
            UiLanguage::Zh,
            PendingSessionNotificationInteraction::FocusTerminal,
        );

        assert_eq!(notifications.len(), 1);
        assert_eq!(notifications[0].title, "多个 Claude 会话待处理");
        assert!(notifications[0].body.contains("2 个会话需要处理"));
        assert!(notifications[0].body.contains("code-manager"));
        assert!(notifications[0].body.contains("docs"));
        assert!(notifications[0].focus_target.is_none());
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn clickable_pending_session_notification_falls_back_when_bridge_errors() {
        let mut fallback_error = None;

        deliver_clickable_pending_session_notification_with(
            || Err("bridge failed".to_string()),
            |error| fallback_error = Some(error.to_string()),
        );

        assert_eq!(fallback_error.as_deref(), Some("bridge failed"));
    }

    #[test]
    fn pending_session_notification_keeps_focus_target_when_terminal_can_focus() {
        let session = TraySession {
            pid: 4242,
            session_id: "session-focus".to_string(),
            cwd: "/Users/demo/work/code-manager".to_string(),
            status: "waiting".to_string(),
            updated_at: 2000,
            waiting_for: None,
        };

        let notification = build_pending_session_notification(
            &session,
            UiLanguage::Zh,
            "terminal",
            PendingSessionNotificationInteraction::FocusTerminal,
        );

        assert_eq!(
            notification.focus_target,
            Some(PendingSessionFocusTarget {
                pid: 4242,
                cwd: "/Users/demo/work/code-manager".to_string(),
                session_id: "session-focus".to_string(),
                terminal_app: "terminal".to_string(),
            })
        );
    }

    #[test]
    fn pending_session_notification_omits_focus_target_when_terminal_cannot_focus() {
        let session = test_session("/Users/demo/work/code-manager", "waiting", 2000);

        let notification = build_pending_session_notification(
            &session,
            UiLanguage::Zh,
            "warp",
            PendingSessionNotificationInteraction::Plain,
        );

        assert!(notification.focus_target.is_none());
    }

    #[test]
    fn pending_session_notification_interaction_requires_macos_and_focusable_terminal() {
        assert_eq!(
            pending_session_notification_interaction_for_platform("terminal", true),
            PendingSessionNotificationInteraction::FocusTerminal
        );
        assert_eq!(
            pending_session_notification_interaction_for_platform("warp", true),
            PendingSessionNotificationInteraction::Plain
        );
        assert_eq!(
            pending_session_notification_interaction_for_platform("terminal", false),
            PendingSessionNotificationInteraction::Plain
        );
    }

    #[test]
    fn session_menu_focus_enablement_requires_macos_and_focusable_terminal() {
        assert!(session_menu_focus_enabled_for_platform("terminal", true));
        assert!(session_menu_focus_enabled_for_platform("ghostty", true));
        assert!(!session_menu_focus_enabled_for_platform("warp", true));
        assert!(!session_menu_focus_enabled_for_platform("terminal", false));
        assert!(!session_menu_focus_enabled_for_platform("ghostty", false));
    }

    /// 回归测试：会话托盘开启时，空 sessions 也必须返回非空占位标题，
    /// 防止无 icon 的 sessions tray 进入零宽状态后无法稳定恢复。
    #[test]
    fn sessions_tray_title_returns_placeholder_for_empty_sessions() {
        let style = SessionTrayCountStyle::default();
        let zh = tray_labels(UiLanguage::Zh);
        assert_eq!(
            sessions_tray_title(&[], &zh, style, SESSION_STATUS_WAITING_EMOJI).as_deref(),
            Some("无会话")
        );
        let en = tray_labels(UiLanguage::En);
        assert_eq!(
            sessions_tray_title(&[], &en, style, SESSION_STATUS_WAITING_EMOJI).as_deref(),
            Some("No Sessions")
        );
    }

    /// 回归测试：菜单项 id 必须能 round-trip 出原始 pid 与 cwd，
    /// 否则点击 handler 无法恢复 cwd 去聚焦终端。覆盖中文、空格、引号、`::` 等易错字符。
    #[test]
    fn session_menu_item_id_round_trip() {
        let cases = [
            "/Users/demo/work/code-manager",
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

    /// `get_tray_title` 仅在偏好开启且存在绑定且能在 profiles 中匹配到 active id 时
    /// 才返回 profile 名；否则一律返回 None。覆盖 4 个判断分支，避免菜单栏意外显示陈旧 profile。
    #[test]
    fn get_tray_title_resolves_only_when_enabled_and_bound_to_existing_profile() {
        let make_profile = |id: &str, name: &str| ConfigProfile {
            id: id.to_string(),
            name: name.to_string(),
            description: String::new(),
            provider_id: None,
            settings: json!({}),
            created_at: String::new(),
            updated_at: String::new(),
        };
        let make_registry =
            |show: bool, active: Option<&str>, profiles: Vec<ConfigProfile>| -> ConfigRegistry {
                let mut registry = ConfigRegistry {
                    app: AppPreferences {
                        show_tray_title: show,
                        ..AppPreferences::default()
                    },
                    profiles,
                    bindings: BindingState {
                        user_profile_id: active.map(str::to_string),
                        user_last_applied_at: None,
                    },
                    ..ConfigRegistry::default()
                };
                registry.app.show_tray_title = show;
                registry
            };

        // 1. show_tray_title=false：即便有绑定也不显示
        assert_eq!(
            get_tray_title(&make_registry(
                false,
                Some("p1"),
                vec![make_profile("p1", "Profile One")],
            )),
            None
        );

        // 2. 无绑定：返回 None
        assert_eq!(
            get_tray_title(&make_registry(
                true,
                None,
                vec![make_profile("p1", "Profile One")],
            )),
            None
        );

        // 3. 绑定的 id 不在 profiles 列表（被删除后未清理 bindings）
        assert_eq!(
            get_tray_title(&make_registry(
                true,
                Some("missing"),
                vec![make_profile("p1", "Profile One")],
            )),
            None
        );

        // 4. 正常命中：返回 profile name
        assert_eq!(
            get_tray_title(&make_registry(
                true,
                Some("p2"),
                vec![
                    make_profile("p1", "Profile One"),
                    make_profile("p2", "Profile Two"),
                ],
            )),
            Some("Profile Two".to_string())
        );

        // 5. 设置了字数限制：按字符数截断，且不追加省略号
        let mut limited = make_registry(true, Some("p1"), vec![make_profile("p1", "团队默认配置")]);
        limited.app.tray_title_max_chars = Some(4);
        assert_eq!(get_tray_title(&limited), Some("团队默认".to_string()));

        // 6. 字数限制大于名称长度：原样返回，不截断
        limited.app.tray_title_max_chars = Some(100);
        assert_eq!(get_tray_title(&limited), Some("团队默认配置".to_string()));
    }

    /// `session_project_name` 取 cwd 最后一段作为项目名；
    /// 边界：空字符串、仅一个段、根路径、纯空白文件名全部回退到原始 cwd。
    #[test]
    fn session_project_name_handles_edge_paths() {
        // 正常 macOS 路径：取最后一段
        assert_eq!(
            session_project_name("/Users/demo/work/code-manager"),
            "code-manager"
        );
        // 仅一个段：当作项目名
        assert_eq!(session_project_name("standalone"), "standalone");
        // 空 cwd 回退到原值（虽然 read_tray_session_file 会过滤空 cwd，但函数本身需稳健）
        assert_eq!(session_project_name(""), "");
        // 根路径无 file_name，回退到原 cwd
        assert_eq!(session_project_name("/"), "/");
        // 中文目录名
        assert_eq!(session_project_name("/Users/demo/中文项目"), "中文项目");
    }

    /// `From<RawTraySession>` 必须 trim 所有字符串字段，且把空白 / 空字符串的 `waiting_for`
    /// 规约为 None；否则下游菜单项会显示 ` · ` 这样的空段。
    #[test]
    fn from_raw_tray_session_trims_whitespace_and_filters_empty_waiting_for() {
        // 全 trim
        let raw = RawTraySession {
            pid: 42,
            session_id: "  s1  ".to_string(),
            cwd: "  /tmp/demo  ".to_string(),
            status: "  waiting  ".to_string(),
            updated_at: 100,
            waiting_for: Some("   approve Bash   ".to_string()),
        };
        let session = TraySession::from(raw);
        assert_eq!(session.session_id, "s1");
        assert_eq!(session.cwd, "/tmp/demo");
        assert_eq!(session.status, "waiting");
        assert_eq!(session.waiting_for.as_deref(), Some("approve Bash"));

        // 纯空白 waiting_for 视为缺省
        let raw = RawTraySession {
            pid: 42,
            session_id: "s1".to_string(),
            cwd: "/tmp".to_string(),
            status: "idle".to_string(),
            updated_at: 0,
            waiting_for: Some("   ".to_string()),
        };
        assert_eq!(TraySession::from(raw).waiting_for, None);

        // None waiting_for 直接保留为 None
        let raw = RawTraySession {
            pid: 42,
            session_id: "s1".to_string(),
            cwd: "/tmp".to_string(),
            status: "idle".to_string(),
            updated_at: 0,
            waiting_for: None,
        };
        assert_eq!(TraySession::from(raw).waiting_for, None);
    }

    /// status 比对必须大小写不敏感、忽略前后空白；
    /// running 同时接受 `running` / `busy` / `active` 三种历史别名；starting 单独识别。
    #[test]
    fn waiting_running_starting_session_status_match_case_insensitive_with_trim() {
        // waiting
        assert!(is_waiting_session_status("waiting"));
        assert!(is_waiting_session_status("WAITING"));
        assert!(is_waiting_session_status("  Waiting  "));
        assert!(!is_waiting_session_status("idle"));
        assert!(!is_waiting_session_status(""));

        // running 三个别名
        assert!(is_running_session_status("running"));
        assert!(is_running_session_status("busy"));
        assert!(is_running_session_status("active"));
        assert!(is_running_session_status("  Active  "));
        assert!(!is_running_session_status("idle"));
        assert!(!is_running_session_status("starting"));

        // starting
        assert!(is_starting_session_status("starting"));
        assert!(is_starting_session_status("  STARTING  "));
        assert!(!is_starting_session_status("running"));
    }

    /// `session_menu_item_label`:
    /// - 非 waiting 状态：始终省略 waiting_for（即便后端误设也不渲染）；
    /// - waiting 状态 + waiting_for=None：仅渲染项目名与状态；
    /// - 项目名超过 32 字符必须截断。
    #[test]
    fn session_menu_item_label_omits_waiting_for_outside_waiting_and_when_absent() {
        // 非 waiting 状态 + 有 waiting_for：应忽略 waiting_for
        let mut running = test_session("/Users/demo/work/code-manager", "running", 1000);
        running.waiting_for = Some("不应渲染".to_string());
        assert_eq!(
            session_menu_item_label(&running, UiLanguage::Zh),
            "🟢 code-manager · 运行中"
        );

        // waiting 状态但 waiting_for=None
        let waiting = test_session("/Users/demo/work/code-manager", "waiting", 2000);
        assert_eq!(
            session_menu_item_label(&waiting, UiLanguage::Zh),
            "🔴 code-manager · 待处理"
        );

        // 长项目名截断到 32 字符（truncate 在末尾追加 "..."）
        let long = test_session(
            "/Users/demo/work/this-is-a-really-really-long-project-name-that-exceeds-limit",
            "idle",
            0,
        );
        let label = session_menu_item_label(&long, UiLanguage::En);
        // 截断后应仍带状态后缀
        assert!(label.ends_with(" · Idle"));
        // 去掉状态后缀和 "⚪ " emoji 前缀后，项目名不超过 32 + "..." 的截断长度
        let project_part = label.trim_end_matches(" · Idle").trim_start_matches("⚪ ");
        assert!(
            project_part.chars().count() <= 35,
            "label 项目段过长: {project_part}"
        );
    }

    /// 加载 sessions 目录时：缺 sessionId / 缺 status 视作非法条目跳过，
    /// 但有空白填充的字段经 trim 后非空仍应被接受。补充 `load_tray_sessions_reads_valid_json_...`
    /// 没覆盖到的「空白字段被 trim 后为空」边界。
    #[test]
    fn load_tray_sessions_filters_entries_with_only_whitespace_required_fields() {
        let root = std::env::temp_dir().join(format!(
            "code-manager-tray-whitespace-{}",
            uuid::Uuid::new_v4()
        ));
        fs::create_dir_all(&root).expect("应可创建测试目录");

        // status 仅空白：trim 后为空，应被跳过
        fs::write(
            root.join("ws_status.json"),
            br#"{"pid":1,"sessionId":"s","cwd":"/tmp","status":"   ","updatedAt":1}"#,
        )
        .unwrap();
        // sessionId 仅空白：同样跳过
        fs::write(
            root.join("ws_id.json"),
            br#"{"pid":2,"sessionId":"  ","cwd":"/tmp","status":"idle","updatedAt":2}"#,
        )
        .unwrap();
        // cwd 仅空白：跳过
        fs::write(
            root.join("ws_cwd.json"),
            br#"{"pid":3,"sessionId":"x","cwd":"  ","status":"idle","updatedAt":3}"#,
        )
        .unwrap();
        // 全部合法（带前后空白）
        fs::write(
            root.join("ok.json"),
            br#"{"pid":4,"sessionId":"  ok  ","cwd":"  /tmp/ok  ","status":"  idle  ","updatedAt":4}"#,
        )
        .unwrap();

        let sessions = load_tray_sessions_from_dir(&root);
        assert_eq!(sessions.len(), 1, "仅留下 ok.json");
        assert_eq!(sessions[0].session_id, "ok");
        assert_eq!(sessions[0].cwd, "/tmp/ok");
        assert_eq!(sessions[0].status, "idle");

        fs::remove_dir_all(root).ok();
    }

    /// 边界：starting 归入"进行中"(🟢)，exited 等未知状态归入"其它"(⚪)。
    /// title 为纯 emoji+数字，跨语言一致，不再有语言相关 fallback 文案。
    #[test]
    fn sessions_tray_title_classifies_starting_and_unknown_status() {
        let zh = tray_labels(UiLanguage::Zh);
        let en = tray_labels(UiLanguage::En);
        let style = SessionTrayCountStyle::Plain;
        let sessions = vec![
            test_session("/a", "starting", 100),
            test_session("/b", "exited", 200),
        ];
        assert_eq!(
            sessions_tray_title(&sessions, &zh, style, SESSION_STATUS_WAITING_EMOJI).as_deref(),
            Some("🟢 1 ⚪ 1")
        );
        // 同一份数据在英文环境下输出完全一致
        assert_eq!(
            sessions_tray_title(&sessions, &en, style, SESSION_STATUS_WAITING_EMOJI).as_deref(),
            Some("🟢 1 ⚪ 1")
        );
    }
}
