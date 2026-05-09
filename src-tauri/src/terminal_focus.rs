//! 托盘会话项点击后的"聚焦终端 tab"实现。
//!
//! 设计要点：
//! - Terminal.app / iTerm2 走 pid → tty → AppleScript 精确定位。
//! - Ghostty 1.3 的 AppleScript 还没暴露 pid/tty（见 Issue #11592），只能按 working directory 近似匹配。
//! - Warp 没有官方 AppleScript，托盘菜单项会被设为 disabled，正常不会调到本模块。
//! - 命中失败会记 warn 日志，并把失败原因作为 Err 返回给调用方用于给用户反馈。
//!   调用方负责决定是否新开窗口；本模块本身绝不自动新开 tab。

use std::process::Command;

/// 聚焦终端失败的可枚举原因，用于生成面向用户的提示文案。
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum FocusFailure {
    /// pid 无法反查到 tty，通常是会话进程已退出。
    TtyNotFound,
    /// tty/cwd 匹配不到任何 tab，通常是 tab 已被手动关闭。
    TabNotFound,
    /// 会话记录里没有 cwd，无法按工作目录匹配（仅 Ghostty 路径）。
    EmptyCwd,
    /// 当前默认终端 slug 不支持外部聚焦。
    Unsupported(String),
    /// osascript 调用本身失败，详情已写入日志。
    ScriptError,
}

impl FocusFailure {
    /// 生成本地化的 (title, body)，供系统通知或 UI Toast 使用。
    pub fn user_message(&self, language: &str) -> (String, String) {
        let is_en = language == "en";
        let title = if is_en {
            "Session focus failed"
        } else {
            "会话聚焦失败"
        };
        let body = match (is_en, self) {
            (true, Self::TtyNotFound) => {
                "The session process has exited; cannot locate the terminal tab.".to_string()
            }
            (true, Self::TabNotFound) => {
                "No matching terminal tab was found. It may have been closed.".to_string()
            }
            (true, Self::EmptyCwd) => "Session has no working directory to focus.".to_string(),
            (true, Self::Unsupported(slug)) => {
                format!("Terminal '{slug}' does not support external focus.")
            }
            (true, Self::ScriptError) => {
                "Failed to invoke the terminal. See logs for details.".to_string()
            }
            (false, Self::TtyNotFound) => "会话进程已退出，无法定位终端 tab。".to_string(),
            (false, Self::TabNotFound) => "未找到对应的终端 tab，可能已被关闭。".to_string(),
            (false, Self::EmptyCwd) => "会话缺少工作目录，无法聚焦。".to_string(),
            (false, Self::Unsupported(slug)) => format!("终端 {slug} 不支持外部聚焦。"),
            (false, Self::ScriptError) => "调用终端失败，详情可查看日志。".to_string(),
        };
        (title.to_string(), body)
    }
}

/// 当前默认终端是否支持外部聚焦已有 tab。tray 用它决定菜单项 enabled 状态。
pub fn terminal_supports_focus(app_slug: &str) -> bool {
    matches!(app_slug, "terminal" | "iterm" | "ghostty")
}

/// 尝试聚焦到 pid/cwd 对应的终端 tab。
/// - 命中：返回 Ok(())。
/// - 未命中或调用失败：返回 Err(FocusFailure)，同时在内部记 warn 日志。
///   调用方仅负责把失败原因转成系统通知 / Toast，不会自动新开 tab。
pub fn focus_session_in_terminal(pid: u32, cwd: &str, app_slug: &str) -> Result<(), FocusFailure> {
    match app_slug {
        "terminal" => focus_via_tty("Terminal", pid, terminal_app_script),
        "iterm" => focus_via_tty("iTerm", pid, iterm_script),
        "ghostty" => focus_ghostty_via_cwd(cwd),
        _ => Err(FocusFailure::Unsupported(app_slug.to_string())),
    }
}

/// 通过 pid 反查 tty，再用对应终端的 AppleScript 选中 tab。
fn focus_via_tty(
    app_label: &'static str,
    pid: u32,
    build_script: fn(&str) -> String,
) -> Result<(), FocusFailure> {
    let Some(tty) = pid_to_tty(pid) else {
        log::warn!(
            "event=tray.session_focus status=miss reason=tty_not_found app={app_label} pid={pid}"
        );
        return Err(FocusFailure::TtyNotFound);
    };
    let script = build_script(&escape_applescript_string(&tty));
    match run_osascript_returning_bool(&script) {
        Ok(true) => Ok(()),
        Ok(false) => {
            log::warn!(
                "event=tray.session_focus status=miss reason=tab_not_found app={app_label} pid={pid} tty={tty}"
            );
            Err(FocusFailure::TabNotFound)
        }
        Err(e) => {
            log::warn!("event=tray.session_focus status=err app={app_label} pid={pid} error={e}");
            Err(FocusFailure::ScriptError)
        }
    }
}

fn focus_ghostty_via_cwd(cwd: &str) -> Result<(), FocusFailure> {
    if cwd.is_empty() {
        log::warn!("event=tray.session_focus status=miss reason=empty_cwd app=Ghostty");
        return Err(FocusFailure::EmptyCwd);
    }
    let script = ghostty_script(&escape_applescript_string(cwd));
    match run_osascript_returning_bool(&script) {
        Ok(true) => Ok(()),
        Ok(false) => {
            log::warn!(
                "event=tray.session_focus status=miss reason=tab_not_found app=Ghostty cwd={}",
                crate::utils::truncate(cwd, 160)
            );
            Err(FocusFailure::TabNotFound)
        }
        Err(e) => {
            log::warn!("event=tray.session_focus status=err app=Ghostty error={e}");
            Err(FocusFailure::ScriptError)
        }
    }
}

/// 调 `ps -p <pid> -o tty=` 拿到 tty，trim 后非 `??` 即拼成 `/dev/tty<value>`。
fn pid_to_tty(pid: u32) -> Option<String> {
    let output = Command::new("ps")
        .args(["-p", &pid.to_string(), "-o", "tty="])
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let raw = String::from_utf8(output.stdout).ok()?;
    parse_ps_tty_output(&raw)
}

/// 把 `ps -o tty=` 的输出解析成绝对 tty 路径。
/// 输入示例：`s003`、`ttys003`、`?`、空串；前两者拼出 `/dev/ttys003`，后两者返回 None。
/// 抽出来便于做单元测试。
fn parse_ps_tty_output(raw: &str) -> Option<String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() || trimmed == "?" || trimmed == "??" {
        return None;
    }
    // 仅放行 ASCII 字母数字（macOS tty 名形如 ttys001 / s001），过滤异常输入防注入。
    if !trimmed.chars().all(|c| c.is_ascii_alphanumeric()) {
        return None;
    }
    let path = if trimmed.starts_with("tty") {
        format!("/dev/{trimmed}")
    } else {
        format!("/dev/tty{trimmed}")
    };
    Some(path)
}

/// 执行 osascript 并按 stdout 文本判定 true/false（AppleScript 脚本里 `return true/false`）。
fn run_osascript_returning_bool(script: &str) -> Result<bool, String> {
    let output = Command::new("osascript")
        .arg("-e")
        .arg(script)
        .output()
        .map_err(|e| format!("调用 osascript 失败: {e}"))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(format!(
            "osascript 退出码 {:?}: {}",
            output.status.code(),
            stderr
        ));
    }
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    Ok(stdout == "true")
}

/// 转义 AppleScript 字符串字面量中的 `\` 与 `"`，防止 cwd / tty 含特殊字符破坏脚本。
fn escape_applescript_string(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for ch in s.chars() {
        match ch {
            '\\' => out.push_str("\\\\"),
            '"' => out.push_str("\\\""),
            other => out.push(other),
        }
    }
    out
}

fn terminal_app_script(escaped_tty: &str) -> String {
    format!(
        r#"tell application "Terminal"
set targetTty to "{escaped_tty}"
repeat with w in windows
repeat with t in tabs of w
if tty of t is targetTty then
set selected tab of w to t
set frontmost of w to true
activate
return true
end if
end repeat
end repeat
return false
end tell"#
    )
}

fn iterm_script(escaped_tty: &str) -> String {
    format!(
        r#"tell application "iTerm"
set targetTty to "{escaped_tty}"
repeat with w in windows
repeat with aTab in tabs of w
repeat with aSession in sessions of aTab
if tty of aSession is targetTty then
tell w to select
tell aTab to select
activate
return true
end if
end repeat
end repeat
end repeat
return false
end tell"#
    )
}

fn ghostty_script(escaped_cwd: &str) -> String {
    format!(
        r#"tell application "Ghostty"
	set targetCwd to "{escaped_cwd}"
	repeat with term in terminals
	if working directory of term is targetCwd then
	focus term
	return true
	end if
	end repeat
	return false
	end tell"#
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn terminal_supports_focus_covers_known_slugs() {
        assert!(terminal_supports_focus("terminal"));
        assert!(terminal_supports_focus("iterm"));
        assert!(terminal_supports_focus("ghostty"));
        assert!(!terminal_supports_focus("warp"));
        assert!(!terminal_supports_focus(""));
        assert!(!terminal_supports_focus("Terminal")); // 大小写敏感，避免与配置里 slug 不一致
    }

    #[test]
    fn escape_applescript_string_handles_quote_and_backslash_and_unicode() {
        assert_eq!(escape_applescript_string(""), "");
        assert_eq!(escape_applescript_string("/Users/demo"), "/Users/demo");
        assert_eq!(
            escape_applescript_string(r#"/path/with"quote"#),
            r#"/path/with\"quote"#
        );
        assert_eq!(
            escape_applescript_string(r"/path\with\backslash"),
            r"/path\\with\\backslash"
        );
        // 中文不需要转义
        assert_eq!(
            escape_applescript_string("/Users/demo/中文目录"),
            "/Users/demo/中文目录"
        );
    }

    #[test]
    fn parse_ps_tty_output_normalizes_or_rejects_inputs() {
        // 常见 macOS 输出
        assert_eq!(
            parse_ps_tty_output("s003\n").as_deref(),
            Some("/dev/ttys003")
        );
        assert_eq!(
            parse_ps_tty_output("ttys012").as_deref(),
            Some("/dev/ttys012")
        );
        // 后台进程没有 controlling terminal
        assert_eq!(parse_ps_tty_output("?"), None);
        assert_eq!(parse_ps_tty_output("??"), None);
        assert_eq!(parse_ps_tty_output(""), None);
        assert_eq!(parse_ps_tty_output("\n  \n"), None);
        // 防注入：空格 / 路径分隔 / 分号都拒绝
        assert_eq!(parse_ps_tty_output("s003; rm -rf /"), None);
        assert_eq!(parse_ps_tty_output("../etc"), None);
    }

    #[test]
    fn focus_session_in_terminal_rejects_unknown_slug() {
        let err = focus_session_in_terminal(123, "/tmp", "warp").expect_err("warp 应被拒绝");
        assert_eq!(err, FocusFailure::Unsupported("warp".to_string()));
        let err = focus_session_in_terminal(123, "/tmp", "").expect_err("空 slug 应被拒绝");
        assert_eq!(err, FocusFailure::Unsupported(String::new()));
    }

    #[test]
    fn ghostty_rejects_empty_cwd_with_focus_failure() {
        let err =
            focus_session_in_terminal(123, "", "ghostty").expect_err("空 cwd 应返回 EmptyCwd");
        assert_eq!(err, FocusFailure::EmptyCwd);
    }

    #[test]
    fn applescript_templates_embed_escaped_input() {
        let escaped = escape_applescript_string(r#"/path/with"quote"#);
        let script = terminal_app_script(&escaped);
        assert!(script.contains(r#"set targetTty to "/path/with\"quote""#));

        let escaped_cwd = escape_applescript_string(r"/cwd\with\bs");
        let script = ghostty_script(&escaped_cwd);
        assert!(script.contains(r#"set targetCwd to "/cwd\\with\\bs""#));
    }

    #[test]
    fn ghostty_script_focuses_matching_terminal_directly() {
        let script = ghostty_script("/Users/demo/project");

        assert!(script.contains("repeat with term in terminals"));
        assert!(script.contains("focus term"));
        assert!(!script.contains("select tab t of w"));
    }

    #[test]
    fn focus_failure_user_message_localizes_by_language() {
        // 中文（默认）
        let (title_zh, body_zh) = FocusFailure::TabNotFound.user_message("zh");
        assert_eq!(title_zh, "会话聚焦失败");
        assert!(body_zh.contains("未找到对应的终端 tab"));

        let (_, body_zh_tty) = FocusFailure::TtyNotFound.user_message("zh");
        assert!(body_zh_tty.contains("会话进程已退出"));

        let (_, body_zh_empty) = FocusFailure::EmptyCwd.user_message("zh");
        assert!(body_zh_empty.contains("缺少工作目录"));

        let (_, body_zh_unsupported) =
            FocusFailure::Unsupported("warp".to_string()).user_message("zh");
        assert!(body_zh_unsupported.contains("warp"));
        assert!(body_zh_unsupported.contains("不支持"));

        let (_, body_zh_script) = FocusFailure::ScriptError.user_message("zh");
        assert!(body_zh_script.contains("调用终端失败"));

        // 英文
        let (title_en, body_en) = FocusFailure::TabNotFound.user_message("en");
        assert_eq!(title_en, "Session focus failed");
        assert!(body_en.to_lowercase().contains("terminal tab"));

        // 未知语言回退中文
        let (title_fallback, _) = FocusFailure::TabNotFound.user_message("fr");
        assert_eq!(title_fallback, "会话聚焦失败");
    }
}
