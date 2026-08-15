//! 托盘会话项点击后的"聚焦终端 tab"实现。
//!
//! 设计要点：
//! - Terminal.app / iTerm2 走 pid → tty → AppleScript 精确定位。
//! - Ghostty 1.3 的 AppleScript 还没暴露 pid/tty（见 Issue #11592）；herdr 命名会话优先按
//!   client title 匹配，普通会话排除 herdr client 后按 working directory 唯一匹配。
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
    /// herdr socket 连不上（server 未运行或 socket 已失效）。
    /// 唯一构造点在 `herdr.rs` 的 `#[cfg(unix)]` socket 错误转换里；non-unix 平台
    /// 没有 unix socket，该变体永不构造，但消息表与测试仍需在所有平台引用它。
    #[cfg_attr(not(unix), allow(dead_code))]
    HerdrNotRunning,
    /// herdr 中按 pid 精确匹配与 cwd 兜底都未命中 pane。
    HerdrPaneNotFound,
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
            (true, Self::HerdrNotRunning) => "No running herdr server was found.".to_string(),
            (true, Self::HerdrPaneNotFound) => {
                "No matching herdr pane was found. It may have been closed.".to_string()
            }
            (false, Self::TtyNotFound) => "会话进程已退出，无法定位终端 tab。".to_string(),
            (false, Self::TabNotFound) => "未找到对应的终端 tab，可能已被关闭。".to_string(),
            (false, Self::EmptyCwd) => "会话缺少工作目录，无法聚焦。".to_string(),
            (false, Self::Unsupported(slug)) => format!("终端 {slug} 不支持外部聚焦。"),
            (false, Self::ScriptError) => "调用终端失败，详情可查看日志。".to_string(),
            (false, Self::HerdrNotRunning) => "未检测到运行中的 herdr 服务。".to_string(),
            (false, Self::HerdrPaneNotFound) => {
                "herdr 中未找到对应 pane，可能已被关闭。".to_string()
            }
        };
        (title.to_string(), body)
    }
}

/// 当前默认终端是否支持外部聚焦已有 tab。tray 用它决定菜单项 enabled 状态。
pub fn terminal_supports_focus(app_slug: &str) -> bool {
    matches!(app_slug, "terminal" | "iterm" | "ghostty")
}

/// 从会话进程环境中识别实际承载它的终端。
///
/// `ps eww` 会返回完整环境，所以原始输出绝不能写入日志；这里只提取白名单内的
/// `TERM_PROGRAM` 值，避免用户的默认终端设置与实际会话终端不一致时错误聚焦。
/// pub(crate)：tray 门禁与 herdr 宿主跳都会复用同一检测。
pub(crate) fn terminal_app_from_pid(pid: u32) -> Option<&'static str> {
    let pid = pid.to_string();
    let output = Command::new("ps")
        .args(["eww", "-p", pid.as_str(), "-o", "command="])
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    terminal_app_from_ps_output(&String::from_utf8_lossy(&output.stdout))
}

/// 解析 `ps eww` 输出中白名单化的 `TERM_PROGRAM` 值。
/// pub(crate)：herdr 模块解析 client 进程环境时复用。
pub(crate) fn terminal_app_from_ps_output(output: &str) -> Option<&'static str> {
    let term_program = output
        .split_ascii_whitespace()
        .find_map(|part| part.strip_prefix("TERM_PROGRAM="))?;

    match term_program.to_ascii_lowercase().as_str() {
        "apple_terminal" | "terminal" => Some("terminal"),
        "iterm" | "iterm.app" | "iterm2" => Some("iterm"),
        "ghostty" => Some("ghostty"),
        "warp" | "warpterminal" => Some("warp"),
        _ => None,
    }
}

/// 尝试聚焦到 pid/cwd 对应的终端 tab。
/// - 命中：返回 Ok(())。
/// - 未命中或调用失败：返回 Err(FocusFailure)，同时在内部记 warn 日志。
///   调用方仅负责把失败原因转成系统通知 / Toast，不会自动新开 tab。
pub fn focus_session_in_terminal(pid: u32, cwd: &str, app_slug: &str) -> Result<(), FocusFailure> {
    // herdr 会话优先走两跳聚焦：socket 定位 pane + 宿主终端激活。
    // 检测本身也是从 pid 环境/进程树判断，失败即视为非 herdr 会话。
    if let Some(ctx) = crate::herdr::detect_herdr_session(pid) {
        return crate::herdr::focus_herdr_session(pid, cwd, &ctx, app_slug);
    }
    // 优先使用目标进程的终端，读取失败再回退设置中的默认终端。
    let app_slug = terminal_app_from_pid(pid).unwrap_or(app_slug);
    match app_slug {
        // 普通会话没有可区分的 identity，Ghostty 按唯一 working directory 匹配。
        "ghostty" => focus_ghostty_via_cwd(cwd),
        // tty 类终端（Terminal/iTerm）共用 pid → tty → AppleScript 路径。
        slug => match tty_terminal_script(slug) {
            Some((label, build_script)) => focus_via_tty(label, pid, build_script),
            None => Err(FocusFailure::Unsupported(slug.to_string())),
        },
    }
}

/// tty 类终端的 AppleScript 生成器：入参是转义后的 tty，返回完整脚本。
pub(crate) type TtyScriptBuilder = fn(&str) -> String;

/// slug → (终端展示名, tty AppleScript 生成器)。tty 类终端（Terminal/iTerm）的唯一映射源，
/// terminal_focus 的 pid 分发与 herdr 宿主跳共用；Ghostty 走 cwd 不在此表内。
/// 新增 tty 类终端只改这一处。
pub(crate) fn tty_terminal_script(slug: &str) -> Option<(&'static str, TtyScriptBuilder)> {
    match slug {
        "terminal" => Some(("Terminal", terminal_app_script)),
        "iterm" => Some(("iTerm", iterm_script)),
        _ => None,
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
    focus_tty(app_label, &tty, build_script)
}

/// 对已知 tty 执行对应终端的 AppleScript 选中 tab。
/// herdr 宿主跳拿到的 client tty 直接复用此函数，不重复 pid 反查。
pub(crate) fn focus_tty(
    app_label: &'static str,
    tty: &str,
    build_script: fn(&str) -> String,
) -> Result<(), FocusFailure> {
    let script = build_script(&escape_applescript_string(tty));
    match run_osascript_returning_bool(&script) {
        Ok(true) => Ok(()),
        Ok(false) => {
            log::warn!(
                "event=tray.session_focus status=miss reason=tab_not_found app={app_label} tty={tty}"
            );
            Err(FocusFailure::TabNotFound)
        }
        Err(e) => {
            log::warn!("event=tray.session_focus status=err app={app_label} error={e}");
            Err(FocusFailure::ScriptError)
        }
    }
}

pub(crate) fn focus_ghostty_via_cwd(cwd: &str) -> Result<(), FocusFailure> {
    focus_ghostty(cwd, None)
}

/// 聚焦 herdr 宿主 Ghostty terminal：命名会话优先按 client title 匹配，cwd 只做唯一兜底。
pub(crate) fn focus_ghostty_via_herdr_session(
    cwd: &str,
    session_name: Option<&str>,
) -> Result<(), FocusFailure> {
    focus_ghostty(cwd, session_name)
}

fn focus_ghostty(cwd: &str, session_name: Option<&str>) -> Result<(), FocusFailure> {
    if cwd.is_empty() {
        log::warn!("event=tray.session_focus status=miss reason=empty_cwd app=Ghostty");
        return Err(FocusFailure::EmptyCwd);
    }
    let escaped_cwd = escape_applescript_string(cwd);
    let escaped_session_name = session_name.map(escape_applescript_string);
    let script = match escaped_session_name.as_deref() {
        Some(session_name) => ghostty_script_with_session(&escaped_cwd, Some(session_name)),
        None => ghostty_script(&escaped_cwd),
    };
    match run_osascript_returning_bool(&script) {
        Ok(true) => Ok(()),
        Ok(false) => {
            log::warn!(
                "event=tray.session_focus status=miss reason=tab_not_found app=Ghostty session={} cwd={}",
                session_name.unwrap_or("default"),
                crate::utils::truncate(cwd, 160),
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
/// pub(crate)：herdr 宿主跳需要反查 client 进程的 tty。
pub(crate) fn pid_to_tty(pid: u32) -> Option<String> {
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
    ghostty_script_with_options(escaped_cwd, None, true)
}

fn ghostty_script_with_session(escaped_cwd: &str, escaped_session_name: Option<&str>) -> String {
    ghostty_script_with_options(escaped_cwd, escaped_session_name, false)
}

fn ghostty_script_with_options(
    escaped_cwd: &str,
    escaped_session_name: Option<&str>,
    exclude_herdr_clients: bool,
) -> String {
    let session_match = escaped_session_name
        .map(|session_name| {
            format!(
                r#"
set targetSessionName to "{session_name}"
repeat with term in terminals
set termName to name of term
if termName is ("herdr --session " & targetSessionName) or termName is ("herdr --session=" & targetSessionName) or termName is ("herdr session attach " & targetSessionName) then
focus term
return true
end if
end repeat"#
            )
        })
        .unwrap_or_default();
    let cwd_match_condition = if exclude_herdr_clients {
        r#"if (working directory of term is targetCwd) and (not isHerdrClient) then"#
    } else {
        r#"if working directory of term is targetCwd then"#
    };
    let herdr_client_check = if exclude_herdr_clients {
        r#"set isHerdrClient to (termName is "herdr") or (termName starts with "herdr --session ") or (termName starts with "herdr --session=") or (termName starts with "herdr session attach ")"#
    } else {
        ""
    };
    format!(
        r#"tell application "Ghostty"
set targetCwd to "{escaped_cwd}"{session_match}
set cwdMatchCount to 0
repeat with term in terminals
set termName to name of term
{herdr_client_check}
{cwd_match_condition}
set cwdMatchCount to cwdMatchCount + 1
end if
end repeat
if cwdMatchCount is 1 then
repeat with term in terminals
set termName to name of term
{herdr_client_check}
{cwd_match_condition}
focus term
return true
end if
end repeat
end if
return false
end tell"#
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 必然不存在的 pid：真实 pid 不可能达到 u32::MAX。聚焦链路会做真实 ps 检测
    /// （TERM_PROGRAM / herdr 进程树），用小 pid（如 123）在装有 herdr 的机器上
    /// 可能命中真实进程，导致单测依赖宿主环境而偶发失败。
    const GHOST_PID: u32 = u32::MAX;

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
    fn process_terminal_program_resolves_supported_macos_terminals() {
        assert_eq!(
            terminal_app_from_ps_output("zsh TERM_PROGRAM=Apple_Terminal TERM=xterm-256color"),
            Some("terminal")
        );
        assert_eq!(
            terminal_app_from_ps_output("zsh TERM_PROGRAM=iTerm.app TERM=xterm-256color"),
            Some("iterm")
        );
        assert_eq!(
            terminal_app_from_ps_output("zsh TERM_PROGRAM=ghostty TERM=xterm-ghostty"),
            Some("ghostty")
        );
        assert_eq!(
            terminal_app_from_ps_output("zsh TERM_PROGRAM=WarpTerminal TERM=xterm-256color"),
            Some("warp")
        );
    }

    #[test]
    fn process_terminal_program_ignores_unknown_or_missing_values() {
        assert_eq!(
            terminal_app_from_ps_output("zsh TERM_PROGRAM=Alacritty"),
            None
        );
        assert_eq!(terminal_app_from_ps_output("zsh TERM=xterm-256color"), None);
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
        let err = focus_session_in_terminal(GHOST_PID, "/tmp", "warp").expect_err("warp 应被拒绝");
        assert_eq!(err, FocusFailure::Unsupported("warp".to_string()));
        let err = focus_session_in_terminal(GHOST_PID, "/tmp", "").expect_err("空 slug 应被拒绝");
        assert_eq!(err, FocusFailure::Unsupported(String::new()));
    }

    #[test]
    fn ghostty_rejects_empty_cwd_with_focus_failure() {
        let err = focus_session_in_terminal(GHOST_PID, "", "ghostty")
            .expect_err("空 cwd 应返回 EmptyCwd");
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
    fn ghostty_script_does_not_choose_first_terminal_when_cwd_is_ambiguous() {
        let script = ghostty_script("/Users/demo/project");

        assert!(script.contains("cwdMatchCount"));
        assert!(script.contains("if cwdMatchCount is 1 then"));
    }

    #[test]
    fn ghostty_script_for_regular_session_excludes_herdr_clients() {
        let script = ghostty_script("/Users/demo/project");

        assert!(script.contains("set isHerdrClient to"));
        assert!(script.contains("termName starts with \"herdr --session \""));
        assert!(script.contains("and (not isHerdrClient)"));
    }

    #[test]
    fn ghostty_script_prefers_herdr_session_title_before_cwd_fallback() {
        let script = ghostty_script_with_session("/Users/demo/project", Some("cloudhub"));

        let session_match = script
            .find("set targetSessionName")
            .expect("应先生成 herdr session title 匹配");
        let cwd_fallback = script
            .find("set cwdMatchCount")
            .expect("应生成 cwd 唯一匹配兜底");
        assert!(session_match < cwd_fallback);
        assert!(script.contains("herdr --session "));
        assert!(script.contains("herdr --session="));
        assert!(script.contains("herdr session attach "));
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

        let (_, body_zh_herdr_not_running) = FocusFailure::HerdrNotRunning.user_message("zh");
        assert!(body_zh_herdr_not_running.contains("herdr"));
        assert!(body_zh_herdr_not_running.contains("未检测到"));

        let (_, body_zh_pane) = FocusFailure::HerdrPaneNotFound.user_message("zh");
        assert!(body_zh_pane.contains("pane"));
        assert!(body_zh_pane.contains("可能已被关闭"));

        // 英文
        let (title_en, body_en) = FocusFailure::TabNotFound.user_message("en");
        assert_eq!(title_en, "Session focus failed");
        assert!(body_en.to_lowercase().contains("terminal tab"));

        // 未知语言回退中文
        let (title_fallback, _) = FocusFailure::TabNotFound.user_message("fr");
        assert_eq!(title_fallback, "会话聚焦失败");
    }

    /// 补足英文 body 覆盖：TtyNotFound / EmptyCwd / Unsupported / ScriptError
    /// 之前只测了 TabNotFound 的英文，其它分支没有 assert。
    #[test]
    fn focus_failure_user_message_english_branches_cover_all_variants() {
        let (_, body) = FocusFailure::TtyNotFound.user_message("en");
        assert!(body.to_lowercase().contains("session process has exited"));

        let (_, body) = FocusFailure::EmptyCwd.user_message("en");
        assert!(body.to_lowercase().contains("working directory"));

        let (_, body) = FocusFailure::Unsupported("warp".to_string()).user_message("en");
        assert!(body.contains("'warp'"));
        assert!(body.to_lowercase().contains("does not support"));

        let (_, body) = FocusFailure::ScriptError.user_message("en");
        assert!(body
            .to_lowercase()
            .contains("failed to invoke the terminal"));

        let (_, body) = FocusFailure::HerdrNotRunning.user_message("en");
        assert!(body.to_lowercase().contains("no running herdr"));

        let (_, body) = FocusFailure::HerdrPaneNotFound.user_message("en");
        assert!(body.to_lowercase().contains("herdr pane"));
        assert!(body.to_lowercase().contains("may have been closed"));
    }

    /// 之前的 applescript_templates 只验证了 Terminal.app 与 Ghostty 的模板,
    /// 补足 iterm_script 的核心结构:必须遍历 windows -> tabs -> sessions 三层
    /// 并按 tty 字段匹配,命中后调用 select 链与 activate。
    #[test]
    fn iterm_script_template_walks_sessions_and_matches_tty() {
        let script = iterm_script("/dev/ttys012");
        assert!(script.contains(r#"tell application "iTerm""#));
        assert!(script.contains(r#"set targetTty to "/dev/ttys012""#));
        assert!(script.contains("repeat with w in windows"));
        assert!(script.contains("repeat with aTab in tabs of w"));
        assert!(script.contains("repeat with aSession in sessions of aTab"));
        assert!(script.contains("if tty of aSession is targetTty then"));
        assert!(script.contains("tell w to select"));
        assert!(script.contains("tell aTab to select"));
        assert!(script.contains("activate"));
        assert!(script.contains("return true"));
        assert!(script.contains("return false"));
    }
}
