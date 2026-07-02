use crate::config::UiLanguage;

pub(crate) struct TrayLabels {
    pub(crate) language: UiLanguage,
    pub(crate) show_window: &'static str,
    pub(crate) toggle_widget: &'static str,
    pub(crate) nav_configs: &'static str,
    pub(crate) no_configs: &'static str,
    pub(crate) active_sessions: &'static str,
    pub(crate) no_sessions: &'static str,
    pub(crate) sessions_tooltip: &'static str,
    pub(crate) focus_shortcut_hint: &'static str,
    pub(crate) nav_memory: &'static str,
    pub(crate) nav_skills: &'static str,
    pub(crate) nav_projects: &'static str,
    pub(crate) nav_history: &'static str,
    pub(crate) nav_stats: &'static str,
    pub(crate) nav_usage: &'static str,
    pub(crate) quit: &'static str,
}

pub(crate) fn tray_labels(language: UiLanguage) -> TrayLabels {
    match language {
        UiLanguage::En => TrayLabels {
            language,
            show_window: "Open Code Manager",
            toggle_widget: "Toggle Floating Widget",
            nav_configs: "Profiles",
            no_configs: "No configs",
            active_sessions: "Active Sessions",
            no_sessions: "No Sessions",
            sessions_tooltip: "Code Manager Sessions",
            focus_shortcut_hint: "Focus most urgent session",
            nav_memory: "Memory",
            nav_skills: "Skills",
            nav_projects: "Projects",
            nav_history: "History",
            nav_stats: "Stats",
            nav_usage: "Usage",
            quit: "Quit",
        },
        UiLanguage::Zh => TrayLabels {
            language,
            show_window: "打开 Code Manager",
            toggle_widget: "显示/隐藏浮窗",
            nav_configs: "配置",
            no_configs: "暂无配置",
            active_sessions: "当前会话",
            no_sessions: "无会话",
            sessions_tooltip: "Code Manager 会话",
            focus_shortcut_hint: "聚焦最该处理会话",
            nav_memory: "记忆",
            nav_skills: "Skills",
            nav_projects: "项目",
            nav_history: "历史",
            nav_stats: "统计",
            nav_usage: "用量",
            quit: "退出",
        },
    }
}

pub(crate) fn session_status_label(language: UiLanguage, status: &str) -> String {
    let normalized = status.trim().to_ascii_lowercase();
    let label = match (language, normalized.as_str()) {
        (UiLanguage::En, "idle") => "Idle",
        (UiLanguage::En, "waiting") => "Waiting",
        (UiLanguage::En, "running" | "busy" | "active") => "Running",
        (UiLanguage::En, "starting") => "Starting",
        (UiLanguage::En, "exited" | "ended") => "Ended",
        (UiLanguage::Zh, "idle") => "空闲",
        (UiLanguage::Zh, "waiting") => "待处理",
        (UiLanguage::Zh, "running" | "busy" | "active") => "运行中",
        (UiLanguage::Zh, "starting") => "启动中",
        (UiLanguage::Zh, "exited" | "ended") => "已结束",
        _ => status.trim(),
    };
    label.to_string()
}

pub(crate) fn pending_session_message(
    language: UiLanguage,
    project_name: &str,
    waiting_for: Option<&str>,
) -> (String, String) {
    let title = match language {
        UiLanguage::Zh => "Claude 会话待处理",
        UiLanguage::En => "Claude session needs attention",
    };
    let body = match (language, waiting_for) {
        (_, Some(reason)) => format!("{project_name} · {reason}"),
        (UiLanguage::Zh, None) => format!("{project_name} 需要处理"),
        (UiLanguage::En, None) => format!("{project_name} needs attention"),
    };
    (title.to_string(), body)
}

pub(crate) fn pending_sessions_summary_message(
    language: UiLanguage,
    count: usize,
    project_names: &str,
) -> (String, String) {
    match language {
        UiLanguage::Zh => (
            "多个 Claude 会话待处理".to_string(),
            format!("{count} 个会话需要处理：{project_names}"),
        ),
        UiLanguage::En => (
            "Multiple Claude sessions need attention".to_string(),
            format!("{count} sessions need attention: {project_names}"),
        ),
    }
}

pub(crate) enum FocusFailureMessage<'a> {
    TtyNotFound,
    TabNotFound,
    EmptyCwd,
    Unsupported(&'a str),
    ScriptError,
}

pub(crate) fn focus_failure_message(
    language: UiLanguage,
    failure: FocusFailureMessage<'_>,
) -> (String, String) {
    let title = match language {
        UiLanguage::Zh => "会话聚焦失败",
        UiLanguage::En => "Session focus failed",
    };
    let body = match (language, failure) {
        (UiLanguage::En, FocusFailureMessage::TtyNotFound) => {
            "The session process has exited; cannot locate the terminal tab.".to_string()
        }
        (UiLanguage::En, FocusFailureMessage::TabNotFound) => {
            "No matching terminal tab was found. It may have been closed.".to_string()
        }
        (UiLanguage::En, FocusFailureMessage::EmptyCwd) => {
            "Session has no working directory to focus.".to_string()
        }
        (UiLanguage::En, FocusFailureMessage::Unsupported(slug)) => {
            format!("Terminal '{slug}' does not support external focus.")
        }
        (UiLanguage::En, FocusFailureMessage::ScriptError) => {
            "Failed to invoke the terminal. See logs for details.".to_string()
        }
        (UiLanguage::Zh, FocusFailureMessage::TtyNotFound) => {
            "会话进程已退出，无法定位终端 tab。".to_string()
        }
        (UiLanguage::Zh, FocusFailureMessage::TabNotFound) => {
            "未找到对应的终端 tab，可能已被关闭。".to_string()
        }
        (UiLanguage::Zh, FocusFailureMessage::EmptyCwd) => {
            "会话缺少工作目录，无法聚焦。".to_string()
        }
        (UiLanguage::Zh, FocusFailureMessage::Unsupported(slug)) => {
            format!("终端 {slug} 不支持外部聚焦。")
        }
        (UiLanguage::Zh, FocusFailureMessage::ScriptError) => {
            "调用终端失败，详情可查看日志。".to_string()
        }
    };
    (title.to_string(), body)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn native_catalog_has_complete_tray_labels_for_both_languages() {
        for language in [UiLanguage::Zh, UiLanguage::En] {
            let labels = tray_labels(language);
            assert!(!labels.show_window.is_empty());
            assert!(!labels.toggle_widget.is_empty());
            assert!(!labels.nav_configs.is_empty());
            assert!(!labels.no_configs.is_empty());
            assert!(!labels.active_sessions.is_empty());
            assert!(!labels.no_sessions.is_empty());
            assert!(!labels.sessions_tooltip.is_empty());
            assert!(!labels.focus_shortcut_hint.is_empty());
            assert!(!labels.quit.is_empty());
        }
    }

    #[test]
    fn pending_summary_localizes_count_message() {
        let (_, zh) = pending_sessions_summary_message(UiLanguage::Zh, 2, "alpha, beta");
        let (_, en) = pending_sessions_summary_message(UiLanguage::En, 2, "alpha, beta");
        assert_eq!(zh, "2 个会话需要处理：alpha, beta");
        assert_eq!(en, "2 sessions need attention: alpha, beta");
    }
}
