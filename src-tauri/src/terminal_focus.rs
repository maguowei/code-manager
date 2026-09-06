//! 托盘会话项点击后的"聚焦终端 tab"实现。
//!
//! 设计要点：
//! - 一次 `ps eww -p <pid> -o tty=,etime=,command=` 同时取进程环境（TERM_PROGRAM /
//!   herdr 标记）、控制终端与运行时长，检测、终端识别与 tty 反查不再各自 spawn。
//! - pid 回收校验：会话文件记录的 `procStart`（UTC）必须能与按 etime 推算的进程启动时间
//!   对上；缺失、非法或不一致时拒绝使用该 pid，避免把 tty / herdr pane 交给新进程。
//! - Terminal.app / iTerm2 走 pid → tty → AppleScript 精确定位。
//! - Ghostty 的 `tty` 属性由上游 #11592 引入（1.4 起随 PR #11922 发布，1.3.x 的 sdef
//!   还没有）：脚本里只对 `tty of term` 属性读取做 try 包裹，新版按 tty 精确命中，
//!   旧版探测失败后自然落到既有兜底——herdr 宿主按命名会话 title 匹配，普通会话
//!   排除 herdr client 后按 working directory 唯一匹配。空 cwd 不生成兜底分支，
//!   避免 AppleScript 的 `"" is ""` 误命中没有工作目录的 tab。
//! - 无官方 AppleScript 的宿主终端（托盘菜单项会被设为 disabled）正常不会调到本模块。
//! - 命中失败会记 warn 日志，并把失败原因作为 Err 返回给调用方用于给用户反馈。
//!   调用方负责决定是否新开窗口；本模块本身绝不自动新开 tab。

use std::process::Command;

/// 聚焦终端失败的可枚举原因，用于生成面向用户的提示文案。
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum FocusFailure {
    /// pid 无法反查到 tty，通常是会话进程已退出。
    TtyNotFound,
    /// 会话文件中的 procStart 缺失/非法，或与当前 pid 的启动时间不一致。
    ProcessIdentityMismatch,
    /// tty/cwd 匹配不到任何 tab，通常是 tab 已被手动关闭。
    TabNotFound,
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
            (true, Self::ProcessIdentityMismatch) => {
                "The session process identity could not be verified; focus was skipped.".to_string()
            }
            (true, Self::TabNotFound) => {
                "No matching terminal tab was found. It may have been closed.".to_string()
            }
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
            (false, Self::ProcessIdentityMismatch) => {
                "无法验证会话进程身份，已跳过聚焦。".to_string()
            }
            (false, Self::TabNotFound) => "未找到对应的终端 tab，可能已被关闭。".to_string(),
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
        // 保留不支持宿主的身份，阻止普通会话与 herdr 回退默认终端后误聚焦。
        "warp" | "warpterminal" => Some("warp"),
        _ => None,
    }
}

/// 尝试聚焦到 pid/cwd 对应的终端 tab。
/// - 命中：返回 Ok(())。
/// - 未命中或调用失败：返回 Err(FocusFailure)，同时在内部记 warn 日志。
///   调用方仅负责把失败原因转成系统通知 / Toast，不会自动新开 tab。
/// - `proc_start` 是会话文件记录的进程启动时间（`procStart`，UTC），用于校验 pid
///   未被回收；缺失或非法时拒绝聚焦。
pub fn focus_session_in_terminal(
    pid: u32,
    cwd: &str,
    app_slug: &str,
    proc_start: Option<&str>,
) -> Result<(), FocusFailure> {
    let Some(proc_start) = proc_start else {
        log::warn!(
            "event=tray.session_focus status=miss reason=process_identity_unavailable pid={pid}"
        );
        return Err(FocusFailure::ProcessIdentityMismatch);
    };
    if !proc_start_is_valid(proc_start) {
        log::warn!(
            "event=tray.session_focus status=miss reason=process_identity_invalid pid={pid}"
        );
        return Err(FocusFailure::ProcessIdentityMismatch);
    }

    // 一次 ps 同时取环境（TERM_PROGRAM / herdr 标记）、控制终端与运行时长。
    let Some(info) = ps_tty_and_env(pid) else {
        return Err(FocusFailure::TtyNotFound);
    };
    let tty = verified_pid_tty(pid, &info, proc_start)?;
    let env_output = info.env_output.as_str();
    // herdr 会话优先走两跳聚焦：socket 定位 pane + 宿主终端激活。
    // 检测本身也是从 pid 环境/进程树判断，失败即视为非 herdr 会话。
    if let Some(ctx) = crate::herdr::detect_herdr_session_from_env(pid, env_output) {
        return crate::herdr::focus_herdr_session(pid, cwd, &ctx, app_slug);
    }
    // 优先使用目标进程的终端，读取失败再回退设置中的默认终端。
    let app_slug = terminal_app_from_ps_output(env_output).unwrap_or(app_slug);
    match app_slug {
        // Ghostty 优先按 tty 精确匹配（上游 #11592 起支持），旧版降级为唯一 working directory。
        "ghostty" => {
            let run_script = |script: &str| run_osascript_returning_bool(script);
            focus_ghostty_regular_session(tty.as_deref(), cwd, &run_script)
        }
        // tty 类终端（Terminal/iTerm）共用 pid → tty → AppleScript 路径。
        slug => match tty_terminal_script(slug) {
            Some((label, build_script)) => match tty.as_deref() {
                Some(tty) => focus_tty(label, tty, build_script),
                None => {
                    log::warn!(
                        "event=tray.session_focus status=miss reason=tty_not_found app={label} pid={pid}"
                    );
                    Err(FocusFailure::TtyNotFound)
                }
            },
            None => Err(FocusFailure::Unsupported(slug.to_string())),
        },
    }
}

/// pid 回收校验的容忍窗口（秒）：procStart 记录与 etime 推算同源系统时钟，
/// 正常偏差只有亚秒级；超过窗口即认为 pid 已被新进程回收。
const PID_START_TOLERANCE_SECS: i64 = 30;

/// `ps eww -p <pid> -o tty=,etime=,command=` 的解析结果。
pub(crate) struct PsProcessInfo {
    /// 控制终端的绝对路径；后台进程为 None。
    pub(crate) tty: Option<String>,
    /// 进程已运行的秒数，用于 pid 回收校验；解析失败为 None。
    pub(crate) etime_secs: Option<i64>,
    /// command + 完整环境输出。包含敏感信息，只做白名单提取，绝不能写入日志。
    pub(crate) env_output: String,
}

/// 一次 `ps eww -p <pid> -o tty=,etime=,command=` 同时取控制终端、运行时长与进程
/// 环境，替代原先 tty 反查 / 终端识别 / herdr 检测各自的独立 spawn。
/// 进程不存在（已退出）时返回 None。
pub(crate) fn ps_tty_and_env(pid: u32) -> Option<PsProcessInfo> {
    let output = Command::new("ps")
        .args(["eww", "-p", &pid.to_string(), "-o", "tty=,etime=,command="])
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    ps_process_info_from_output(&String::from_utf8_lossy(&output.stdout))
}

/// 解析 `ps -o tty=,etime=,command=` 输出：前两个 token 是 tty 与 etime 列，
/// 其余整体是 command + 环境。抽成纯函数便于单测。
fn ps_process_info_from_output(raw: &str) -> Option<PsProcessInfo> {
    let mut tokens = raw.split_ascii_whitespace();
    // 后台进程没有控制终端（`??`）时 tty 为 None，但环境仍要保留给后续白名单提取。
    let tty = parse_ps_tty_output(tokens.next()?);
    let etime_secs = parse_ps_etime_secs(tokens.next()?);
    let env_output = tokens.collect::<Vec<_>>().join(" ");
    Some(PsProcessInfo {
        tty,
        etime_secs,
        env_output,
    })
}

/// 校验 pid 未被回收后才放行 tty：会话记录的 `procStart` 与按 etime 推算的进程
/// 启动时间一致才返回 tty；不一致说明 pid 已被新进程占用，tty 指向无关 tab，
/// 必须拒绝整个聚焦请求，不能回退到 cwd 或 herdr 的 pid 匹配。
fn verified_pid_tty(
    pid: u32,
    info: &PsProcessInfo,
    proc_start: &str,
) -> Result<Option<String>, FocusFailure> {
    if !pid_start_matches_recorded(info.etime_secs, Some(proc_start)) {
        log::warn!("event=tray.session_focus status=miss reason=pid_identity_mismatch pid={pid}");
        return Err(FocusFailure::ProcessIdentityMismatch);
    }
    Ok(info.tty.clone())
}

/// 比较"当前时间 - etime"推算出的进程启动时间与会话记录的 `procStart`（UTC）。
fn pid_start_matches_recorded(etime_secs: Option<i64>, proc_start: Option<&str>) -> bool {
    let Some(etime) = etime_secs else {
        return false;
    };
    let Some(recorded) = proc_start.and_then(parse_proc_start_epoch) else {
        return false;
    };
    let derived = crate::utils::current_timestamp() as i64 - etime;
    (derived - recorded).abs() <= PID_START_TOLERANCE_SECS
}

/// 解析 `ps -o etime=` 输出（`MM:SS` / `HH:MM:SS` / `D-HH:MM:SS`）为秒数。
fn parse_ps_etime_secs(raw: &str) -> Option<i64> {
    let trimmed = raw.trim();
    let (days, time_part) = match trimmed.split_once('-') {
        Some((days, rest)) => (days.parse::<i64>().ok()?, rest),
        None => (0, trimmed),
    };
    let mut secs = days * 86_400;
    let parts: Vec<&str> = time_part.split(':').collect();
    match parts.len() {
        // HH:MM:SS
        3 => {
            secs += parts[0].parse::<i64>().ok()? * 3_600
                + parts[1].parse::<i64>().ok()? * 60
                + parse_ps_etime_seconds(parts[2])?;
        }
        // MM:SS
        2 => {
            secs += parts[0].parse::<i64>().ok()? * 60 + parse_ps_etime_seconds(parts[1])?;
        }
        _ => return None,
    }
    Some(secs)
}

/// macOS 的 `etime` 在部分版本中会把秒写成 `SS.hh`；身份校验只需整秒精度，
/// 但必须拒绝非数字的小数部分，不能因宽松解析把异常输出当成有效时长。
fn parse_ps_etime_seconds(raw: &str) -> Option<i64> {
    let (whole, fraction) = raw.split_once('.').unwrap_or((raw, ""));
    if !fraction.is_empty() && !fraction.chars().all(|ch| ch.is_ascii_digit()) {
        return None;
    }
    whole.parse::<i64>().ok()
}

/// 解析会话文件 `procStart`（`Www Mmm dd HH:MM:SS yyyy`，UTC）为 epoch 秒。
/// 星期部分不参与解析（只用于展示）；字段缺失或非法返回 None。
fn parse_proc_start_epoch(raw: &str) -> Option<i64> {
    const MONTHS: [&str; 12] = [
        "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
    ];
    let parts: Vec<&str> = raw.split_ascii_whitespace().collect();
    if parts.len() != 5 {
        return None;
    }
    let month = MONTHS.iter().position(|month| *month == parts[1])? as i64 + 1;
    let day = parts[2].parse::<i64>().ok()?;
    let year = parts[4].parse::<i64>().ok()?;
    let time_parts: Vec<&str> = parts[3].split(':').collect();
    if time_parts.len() != 3 {
        return None;
    }
    let (hour, minute, second) = (
        time_parts[0].parse::<i64>().ok()?,
        time_parts[1].parse::<i64>().ok()?,
        time_parts[2].parse::<i64>().ok()?,
    );
    Some(days_from_civil(year, month, day) * 86_400 + hour * 3_600 + minute * 60 + second)
}

/// 判断会话文件中的进程启动时间是否可用于聚焦身份校验。
pub(crate) fn proc_start_is_valid(raw: &str) -> bool {
    parse_proc_start_epoch(raw).is_some()
}

/// 公历日期 → 自 1970-01-01 起的天数（Howard Hinnant 的 days_from_civil 算法）。
fn days_from_civil(year: i64, month: i64, day: i64) -> i64 {
    let year = if month <= 2 { year - 1 } else { year };
    let era = if year >= 0 { year } else { year - 399 } / 400;
    let year_of_era = year - era * 400;
    let day_of_year = (153 * (if month > 2 { month - 3 } else { month + 9 }) + 2) / 5 + day - 1;
    let day_of_era = year_of_era * 365 + year_of_era / 4 - year_of_era / 100 + day_of_year;
    era * 146_097 + day_of_era - 719_468
}

/// tty 类终端的 AppleScript 生成器：入参是转义后的 tty，返回完整脚本。
pub(crate) type TtyScriptBuilder = fn(&str) -> String;

/// slug → (终端展示名, tty AppleScript 生成器)。tty 类终端（Terminal/iTerm）的唯一映射源，
/// terminal_focus 的 pid 分发与 herdr 宿主跳共用；Ghostty 走 tty/cwd 不在此表内。
/// 新增 tty 类终端只改这一处。
pub(crate) fn tty_terminal_script(slug: &str) -> Option<(&'static str, TtyScriptBuilder)> {
    match slug {
        "terminal" => Some(("Terminal", terminal_app_script)),
        "iterm" => Some(("iTerm", iterm_script)),
        _ => None,
    }
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

/// 普通 Ghostty 会话：身份校验通过后，tty 精确匹配优先（上游 #11592 起支持），没有
/// tty 或未命中时落到会话记录 cwd 的唯一匹配；cwd 匹配先排除 herdr client，避免误激活
/// 同目录的 herdr 宿主 tab。仍 miss 且 tty 在手时用 tty 标题标记法精确定位
/// （Ghostty <1.4 无 `tty` 属性、同目录多 tab 时的降级方案）。身份校验失败时不会进入兜底。
pub(crate) fn focus_ghostty_regular_session(
    tty: Option<&str>,
    cwd: &str,
    run_script: &impl Fn(&str) -> Result<bool, String>,
) -> Result<(), FocusFailure> {
    // tty 与 cwd 都没有时无法定位；tty 拿不到通常是会话进程已退出，
    // 与 Terminal/iTerm 的 TtyNotFound 口径一致。
    if tty.is_none() && cwd.is_empty() {
        log::warn!("event=tray.session_focus status=miss reason=tty_not_found app=Ghostty");
        return Err(FocusFailure::TtyNotFound);
    }
    let spec = GhosttyFocusSpec::regular(tty, cwd);
    if focus_ghostty_attempt_with(&spec, run_script)? {
        return Ok(());
    }
    if focus_ghostty_via_title_marker(tty, run_script)? {
        return Ok(());
    }
    log::warn!(
        "event=tray.session_focus status=miss reason=tab_not_found app=Ghostty kind=regular tty={} cwd={}",
        tty.unwrap_or("none"),
        crate::utils::truncate(cwd, 160)
    );
    Err(FocusFailure::TabNotFound)
}

/// 聚焦 herdr 宿主 Ghostty terminal：title 与 client tty 精确匹配优先（默认会话的
/// 宿主 tab 标题稳定为 "herdr"，同样按 title 命中），都未命中才解析 client cwd
/// （lsof）做唯一兜底，最后落到 tty 标题标记法。tty 来自 herdr client 进程
/// （宿主 tab 的 tty），发现 client 时必有值（tty 是过滤条件）。
pub(crate) fn focus_ghostty_herdr_host(
    tty: &str,
    session_name: Option<&str>,
    client_cwd: impl FnOnce() -> Option<String>,
    run_script: &impl Fn(&str) -> Result<bool, String>,
) -> Result<(), FocusFailure> {
    // 第一段只做精确匹配（title/tty），不解析 cwd——lsof 是宿主跳里最贵的 spawn，
    // Ghostty ≥1.4 时 tty 通常直接命中，1.3.x 默认会话 title 也能命中，不应白付。
    let mut spec = GhosttyFocusSpec::herdr_host(tty, "", session_name);
    if focus_ghostty_attempt_with(&spec, run_script)? {
        return Ok(());
    }
    // 第二段：精确匹配未命中，才取 client 进程的 cwd（用户敲 `herdr` 的目录，
    // 不是 pane 的 cwd）做唯一兜底。
    let client_cwd = client_cwd().filter(|cwd| !cwd.is_empty());
    if let Some(cwd) = client_cwd.as_deref() {
        spec.cwd = cwd;
        if focus_ghostty_attempt_with(&spec, run_script)? {
            return Ok(());
        }
    }
    if focus_ghostty_via_title_marker(Some(tty), run_script)? {
        return Ok(());
    }
    log::warn!(
        "event=tray.session_focus status=miss reason=tab_not_found app=Ghostty kind=herdr_host session={} tty={} cwd={}",
        session_name.unwrap_or("default"),
        tty,
        crate::utils::truncate(spec.cwd, 160)
    );
    Err(FocusFailure::TabNotFound)
}

/// 执行一次 Ghostty 聚焦脚本；Ok(true) 表示已命中聚焦，Ok(false) 表示未命中。
/// runner 作为内部测试 seam 注入，生产路径仍只使用 osascript。
fn focus_ghostty_attempt_with(
    spec: &GhosttyFocusSpec,
    run_script: &impl Fn(&str) -> Result<bool, String>,
) -> Result<bool, FocusFailure> {
    run_ghostty_script(&ghostty_script(spec), run_script)
}

/// 跑一段 Ghostty AppleScript 并统一错误口径。
fn run_ghostty_script(
    script: &str,
    run_script: &impl Fn(&str) -> Result<bool, String>,
) -> Result<bool, FocusFailure> {
    match run_script(script) {
        Ok(hit) => Ok(hit),
        Err(e) => {
            log::warn!("event=tray.session_focus status=err app=Ghostty error={e}");
            Err(FocusFailure::ScriptError)
        }
    }
}

/// 标记标题的全局序号：并发点击多个会话时保证各自标记不同，避免互相误命中。
static TITLE_MARKER_SEQ: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);

/// 生成一次性标记标题：只含 ASCII 字母数字、连字符与下划线，可安全嵌入
/// AppleScript 字面量，且不会与真实 tab 标题冲突。
fn title_marker() -> String {
    format!(
        "code-manager-focus-{}-{}",
        std::process::id(),
        TITLE_MARKER_SEQ.fetch_add(1, std::sync::atomic::Ordering::Relaxed)
    )
}

/// Ghostty <1.4 没有 `tty` 属性，同目录多 tab 时 cwd 唯一匹配也无法区分；
/// 此时向会话 tty 写一条 OSC 标题标记（终端只解析该序列、不显示字符、不影响
/// 前台程序输入），AppleScript 按标记标题命中 tab 后聚焦并 activate，
/// 最后清回空标题（shell / Claude Code 下次更新标题时自然恢复）。
/// 这是 tty 精确匹配在旧版 Ghostty 上的降级实现；tty 打不开或一直查不到
/// 标记都视为未命中，交由调用方继续兜底。
fn focus_ghostty_via_title_marker(
    tty: Option<&str>,
    run_script: &impl Fn(&str) -> Result<bool, String>,
) -> Result<bool, FocusFailure> {
    let Some(tty) = tty else {
        return Ok(false);
    };
    let marker = title_marker();
    if write_osc_title_to_tty(tty, &marker).is_err() {
        return Ok(false);
    }
    let script = ghostty_title_marker_script(&escape_applescript_string(&marker));
    let hit = run_ghostty_script(&script, run_script);
    // 无论命中与否都清掉标记，避免标题残留。
    if let Err(e) = write_osc_title_to_tty(tty, "") {
        log::warn!("event=tray.session_focus status=degraded reason=marker_clear_failed error={e}");
    }
    hit
}

/// 构造 OSC 0 标题序列（`\x1b]0;<title>\x07`）；title 为空即清空标题。
/// 抽成纯函数便于单测。
fn osc_title_sequence(title: &str) -> Vec<u8> {
    let mut seq = b"\x1b]0;".to_vec();
    seq.extend_from_slice(title.as_bytes());
    seq.push(0x07);
    seq
}

/// 向会话 tty 设备写入 OSC 标题序列。写设备输出流等价于终端程序自己输出该序列，
/// 终端只解析不显示；不会向会话前台程序的 stdin 注入任何输入。
fn write_osc_title_to_tty(tty: &str, title: &str) -> std::io::Result<()> {
    use std::io::Write;
    let mut device = std::fs::OpenOptions::new().write(true).open(tty)?;
    device.write_all(&osc_title_sequence(title))
}

/// 生成按标记标题定位的脚本：轮询若干轮消化 Ghostty 处理 OSC 的微小延迟，
/// 命中即 focus + activate（跨桌面/非前台场景必须 activate 才可见）。
fn ghostty_title_marker_script(escaped_marker: &str) -> String {
    format!(
        r#"tell application "Ghostty"
repeat 8 times
repeat with term in terminals
set termName to name of term
if termName is "{escaped_marker}" then
focus term
activate
return true
end if
end repeat
delay 0.05
end repeat
return false
end tell"#
    )
}

/// Ghostty 聚焦脚本参数：title/tty 精确匹配与 cwd 兜底的组合由调用场景显式决定，
/// `kind` 不做隐式推导——普通会话无 title 匹配且 cwd 兜底要排除 herdr client；
/// herdr 宿主跳的目标 tab 本身就是 herdr client，永不排除（含默认会话，
/// 否则 cwd 兜底会跳过标题为 "herdr" 的目标 tab）。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct GhosttyFocusSpec<'a> {
    /// 精确匹配的宿主 tab tty；None 表示没有可用 tty。
    tty: Option<&'a str>,
    /// cwd 唯一兜底；空串表示不生成兜底分支（空 cwd 会误命中无工作目录的 tab）。
    cwd: &'a str,
    /// 会话角色，决定 title 匹配形态与 cwd 兜底是否排除 herdr client。
    kind: GhosttyFocusKind<'a>,
}

/// Ghostty 聚焦的会话角色。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum GhosttyFocusKind<'a> {
    /// 普通会话：无 title 匹配；cwd 兜底排除 herdr client。
    Regular,
    /// herdr 宿主跳：永不排除 herdr client；命名会话按 client title 三形态匹配，
    /// 默认会话宿主 tab 的标题稳定为 "herdr"，按该标题匹配。
    HerdrHost { session_name: Option<&'a str> },
}

impl<'a> GhosttyFocusSpec<'a> {
    /// 普通会话：tty 精确匹配 + 排除 herdr client 的 cwd 兜底。
    fn regular(tty: Option<&'a str>, cwd: &'a str) -> Self {
        Self {
            tty,
            cwd,
            kind: GhosttyFocusKind::Regular,
        }
    }

    /// herdr 宿主跳：目标 tab 就是 herdr client，永不排除；tty 必有值。
    fn herdr_host(tty: &'a str, cwd: &'a str, session_name: Option<&'a str>) -> Self {
        Self {
            tty: Some(tty),
            cwd,
            kind: GhosttyFocusKind::HerdrHost { session_name },
        }
    }
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
pub(crate) fn run_osascript_returning_bool(script: &str) -> Result<bool, String> {
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

/// 生成 Ghostty 聚焦脚本。结构：title/tty 共享一次 terminals 遍历的精确匹配段，
/// 之后是 cwd 计数 + 唯一命中才聚焦的兜底段；空 cwd 时兜底段整体不生成。
fn ghostty_script(spec: &GhosttyFocusSpec) -> String {
    let escaped_cwd = escape_applescript_string(spec.cwd);
    let session_name = match spec.kind {
        GhosttyFocusKind::HerdrHost {
            session_name: Some(name),
        } => Some(escape_applescript_string(name)),
        _ => None,
    };
    let escaped_tty = spec.tty.map(escape_applescript_string);
    // 变量声明：只声明本形态会用到的目标值，避免引用未定义变量。
    let mut prelude = String::new();
    if !spec.cwd.is_empty() {
        prelude.push_str(&format!(r#"set targetCwd to "{escaped_cwd}""#));
    }
    if let Some(session_name) = session_name.as_deref() {
        if !prelude.is_empty() {
            prelude.push('\n');
        }
        prelude.push_str(&format!(r#"set targetSessionName to "{session_name}""#));
    }
    if let Some(tty) = escaped_tty.as_deref() {
        if !prelude.is_empty() {
            prelude.push('\n');
        }
        prelude.push_str(&format!(
            r#"set targetTty to "{tty}"
set ttyProbeFailed to false
set termTty to """#
        ));
    }
    // 精确匹配段：title 与 tty 共享一次 terminals 遍历，减少重复的 Apple 事件往返。
    // tty 探测只 try 包住 `tty of term` 属性读取（1.3.x 的 sdef 没有该属性，会抛错）：
    // 失败置 ttyProbeFailed 跳过后续比较，focus/return 留在 try 外，聚焦错误不会被吞掉。
    // 命中后必须 activate：`focus term` 只把窗口在其所在桌面内置前，不切换 Space、
    // 也不会激活非前台应用；activate 才让系统切到该应用窗口所在桌面并取得键盘焦点。
    let mut exact_body = String::new();
    match spec.kind {
        GhosttyFocusKind::HerdrHost {
            session_name: Some(_),
        } => {
            exact_body.push_str(
                r#"set termName to name of term
if termName is ("herdr --session " & targetSessionName) or termName is ("herdr --session=" & targetSessionName) or termName is ("herdr session attach " & targetSessionName) then
focus term
activate
return true
end if
"#,
            );
        }
        GhosttyFocusKind::HerdrHost { session_name: None } => {
            // herdr 默认会话的宿主 tab 标题稳定为 "herdr"，直接按标题命中；
            // 命名会话的标题形态不同，不会误配。
            exact_body.push_str(
                r#"set termName to name of term
if termName is "herdr" then
focus term
activate
return true
end if
"#,
            );
        }
        GhosttyFocusKind::Regular => {}
    }
    if escaped_tty.is_some() {
        exact_body.push_str(
            r#"if not ttyProbeFailed then
try
set termTty to tty of term
on error
set ttyProbeFailed to true
end try
if (not ttyProbeFailed) and (termTty is targetTty) then
focus term
activate
return true
end if
end if
"#,
        );
    }
    let exact_match = if exact_body.is_empty() {
        String::new()
    } else {
        format!("\nrepeat with term in terminals\n{exact_body}end repeat")
    };
    // cwd 兜底段：空 cwd 不生成——AppleScript 的 `"" is ""` 为 true，
    // 会唯一命中没有工作目录（无 shell 集成）的 tab。
    let cwd_fallback = if spec.cwd.is_empty() {
        String::new()
    } else {
        // herdr client 的 termName 读取与判定只在排除分支需要，避免多余 Apple 事件。
        let herdr_client_check = if matches!(spec.kind, GhosttyFocusKind::Regular) {
            r#"set termName to name of term
set isHerdrClient to (termName is "herdr") or (termName starts with "herdr --session ") or (termName starts with "herdr --session=") or (termName starts with "herdr session attach ")"#
        } else {
            ""
        };
        let cwd_match_condition = if matches!(spec.kind, GhosttyFocusKind::Regular) {
            r#"if (working directory of term is targetCwd) and (not isHerdrClient) then"#
        } else {
            r#"if working directory of term is targetCwd then"#
        };
        format!(
            r#"
set cwdMatchCount to 0
repeat with term in terminals
{herdr_client_check}
{cwd_match_condition}
set cwdMatchCount to cwdMatchCount + 1
end if
end repeat
if cwdMatchCount is 1 then
repeat with term in terminals
{herdr_client_check}
{cwd_match_condition}
focus term
activate
return true
end if
end repeat
end if"#
        )
    };
    format!(
        r#"tell application "Ghostty"
{prelude}{exact_match}{cwd_fallback}
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
        assert!(!terminal_supports_focus("unknown"));
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
    fn removed_warp_host_does_not_fall_back_to_ghostty() {
        for term_program in ["Warp", "WarpTerminal", "warpterminal"] {
            let output = format!("zsh TERM_PROGRAM={term_program} TERM=xterm-256color");
            // 普通会话与 herdr 宿主都会在识别失败时回退默认终端；已知不支持的宿主必须阻止回退。
            let app_slug = terminal_app_from_ps_output(&output).unwrap_or("ghostty");
            assert_eq!(app_slug, "warp");
            assert!(!terminal_supports_focus(app_slug));
            assert!(tty_terminal_script(app_slug).is_none());
        }
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
    fn parse_ps_etime_secs_normalizes_formats() {
        // D-HH:MM:SS
        assert_eq!(
            parse_ps_etime_secs("02-21:08:33"),
            Some(2 * 86_400 + 21 * 3_600 + 8 * 60 + 33)
        );
        // HH:MM:SS
        assert_eq!(parse_ps_etime_secs("1:02:03"), Some(3_723));
        // MM:SS
        assert_eq!(parse_ps_etime_secs("05:23"), Some(323));
        assert_eq!(parse_ps_etime_secs("0:01"), Some(1));
        // macOS 部分版本会在秒后带百分之一秒
        assert_eq!(parse_ps_etime_secs("00:01.50"), Some(1));
        // 非法输入
        assert_eq!(parse_ps_etime_secs(""), None);
        assert_eq!(parse_ps_etime_secs("abc"), None);
        assert_eq!(parse_ps_etime_secs("1-02"), None);
        assert_eq!(parse_ps_etime_secs("00:01.xx"), None);
    }

    #[test]
    fn parse_proc_start_epoch_parses_utc_lstart_format() {
        // 与会话文件实际记录一致（UTC；星期部分不参与解析）。
        // 期望值由 python datetime(2026,8,12,15,27,23,UTC).timestamp() 核准。
        assert_eq!(
            parse_proc_start_epoch("Wed Aug 12 15:27:23 2026"),
            Some(1_786_548_443)
        );
        // 单数字日期的双空格由空白切分归一
        assert_eq!(
            parse_proc_start_epoch("Mon Aug  4 09:00:00 2026"),
            Some(1_785_834_000)
        );
        assert_eq!(parse_proc_start_epoch("Thu Jan  1 00:00:00 1970"), Some(0));
        // 非法输入
        assert_eq!(parse_proc_start_epoch(""), None);
        assert_eq!(parse_proc_start_epoch("Wed Aug 12 15:27 2026"), None);
        assert_eq!(parse_proc_start_epoch("Wed Xyz 12 15:27:23 2026"), None);
    }

    #[test]
    fn ps_process_info_from_output_splits_tty_etime_and_env() {
        let info = ps_process_info_from_output(
            "  ttys018 02-21:08:33 zsh TERM_PROGRAM=ghostty TERM=xterm-ghostty",
        )
        .expect("应能解析三段");
        assert_eq!(info.tty.as_deref(), Some("/dev/ttys018"));
        assert_eq!(info.etime_secs, Some(2 * 86_400 + 21 * 3_600 + 8 * 60 + 33));
        assert_eq!(
            terminal_app_from_ps_output(&info.env_output),
            Some("ghostty")
        );

        // 后台进程没有控制终端，环境仍要保留
        let info = ps_process_info_from_output("?? 0:05 herdr HERDR_SESSION=work")
            .expect("无 tty 也应返回环境");
        assert_eq!(info.tty, None);
        assert!(info.env_output.contains("HERDR_SESSION=work"));

        // 空输出 / 缺列 → None
        assert!(ps_process_info_from_output("").is_none());
        assert!(ps_process_info_from_output("ttys018").is_none());
    }

    /// 推算启动时间（now - etime）与 procStart 记录只容忍小偏差，大偏差判定 pid 已回收；
    /// 缺失、非法或无法解析 etime 的输入全部拒绝。
    #[test]
    fn pid_start_matches_recorded_tolerates_small_drift_only() {
        let recorded = "Wed Aug 12 15:27:23 2026";
        let recorded_epoch = parse_proc_start_epoch(recorded).unwrap();
        let now = crate::utils::current_timestamp() as i64;

        // etime = now - recorded - 10 → 推算启动时间比记录晚 10 秒：同一进程
        assert!(pid_start_matches_recorded(
            Some(now - recorded_epoch - 10),
            Some(recorded)
        ));
        // etime = now - recorded - 3600 → 推算晚 1 小时：pid 已被回收
        assert!(!pid_start_matches_recorded(
            Some(now - recorded_epoch - 3_600),
            Some(recorded)
        ));
        // 无法校验的输入全部拒绝，不能退回信任 pid。
        assert!(!pid_start_matches_recorded(None, Some(recorded)));
        assert!(!pid_start_matches_recorded(Some(100), None));
        assert!(!pid_start_matches_recorded(Some(100), Some("garbage")));
    }

    #[test]
    fn focus_session_in_terminal_rejects_missing_or_invalid_process_identity() {
        let err = focus_session_in_terminal(GHOST_PID, "/tmp", "terminal", None)
            .expect_err("缺失 procStart 应拒绝聚焦");
        assert_eq!(err, FocusFailure::ProcessIdentityMismatch);
        let err = focus_session_in_terminal(GHOST_PID, "/tmp", "terminal", Some("garbage"))
            .expect_err("非法 procStart 应拒绝聚焦");
        assert_eq!(err, FocusFailure::ProcessIdentityMismatch);
    }

    /// 进程已退出（无 tty）且会话无 cwd：按进程退出报错，与 Terminal/iTerm 口径一致。
    #[test]
    fn ghostty_regular_without_tty_and_cwd_reports_process_exited() {
        let err =
            focus_session_in_terminal(GHOST_PID, "", "ghostty", Some("Wed Aug 12 15:27:23 2026"))
                .expect_err("无 tty 无 cwd 应报 TtyNotFound");
        assert_eq!(err, FocusFailure::TtyNotFound);
    }

    /// 通过生产入口注入 runner 验证普通会话、命名 herdr 宿主和默认 herdr 宿主的组合，
    /// 防止测试只验证 spec 构造器却漏掉入口中的参数传递或降级顺序。
    #[test]
    fn ghostty_focus_entrypoints_pin_production_composition() {
        use std::cell::RefCell;

        // 测试 tty 用确定不存在的设备名：标记法兜底在写 tty 失败时直接放弃，
        // 既避免单测向真实终端写控制序列，也让脚本捕获数量确定。
        let ghost_tty = "/dev/ttysGHOST";
        let scripts = RefCell::new(Vec::<String>::new());
        let run_script = |script: &str| {
            scripts.borrow_mut().push(script.to_string());
            Ok(false)
        };

        let err = focus_ghostty_regular_session(Some(ghost_tty), "/Users/demo", &run_script)
            .expect_err("runner 返回 false 时普通会话应报告未命中");
        assert_eq!(err, FocusFailure::TabNotFound);
        let regular = scripts.borrow().first().cloned().expect("应生成普通脚本");
        assert!(regular.contains(r#"set targetTty to "/dev/ttysGHOST""#));
        assert!(
            regular.contains("isHerdrClient"),
            "普通会话必须排除 herdr client"
        );

        scripts.borrow_mut().clear();
        let err = focus_ghostty_herdr_host(ghost_tty, Some("work"), || None, &run_script)
            .expect_err("runner 返回 false 时命名宿主应报告未命中");
        assert_eq!(err, FocusFailure::TabNotFound);
        let named_host = scripts
            .borrow()
            .first()
            .cloned()
            .expect("应生成命名宿主脚本");
        assert!(named_host.contains("targetSessionName"));
        assert!(!named_host.contains("isHerdrClient"));

        scripts.borrow_mut().clear();
        let err = focus_ghostty_herdr_host(
            ghost_tty,
            None,
            || Some("/Users/demo".to_string()),
            &run_script,
        )
        .expect_err("runner 返回 false 时默认宿主应报告未命中");
        assert_eq!(err, FocusFailure::TabNotFound);
        let captured = scripts.borrow();
        assert_eq!(captured.len(), 2, "默认宿主应先精确匹配再 cwd 兜底");
        // 默认会话第一段带 "herdr" 标题匹配：宿主 tab 标题稳定为 "herdr"
        assert!(captured[0].contains(r#"termName is "herdr""#));
        assert!(!captured[0].contains("targetSessionName"));
        assert!(!captured[0].contains("isHerdrClient"));
        assert!(captured[1].contains("working directory of term is targetCwd"));
        assert!(!captured[1].contains("isHerdrClient"));
    }

    /// tty 标题标记法：tty 打不开（进程已退出 / 设备不存在）时视为未命中，
    /// 不生成任何脚本、不报错。
    #[test]
    fn title_marker_gives_up_when_tty_unwritable() {
        use std::cell::RefCell;
        let scripts = RefCell::new(Vec::<String>::new());
        let run_script = |script: &str| {
            scripts.borrow_mut().push(script.to_string());
            Ok(false)
        };
        assert_eq!(
            focus_ghostty_via_title_marker(Some("/dev/ttysGHOST"), &run_script),
            Ok(false)
        );
        assert!(scripts.borrow().is_empty(), "不应执行任何脚本");
    }

    /// 标记标题序列：设置与清空的 OSC 0 载荷。
    #[test]
    fn osc_title_sequence_sets_and_clears_title() {
        assert_eq!(
            osc_title_sequence("code-manager-focus-1"),
            b"\x1b]0;code-manager-focus-1\x07".to_vec()
        );
        // 空标题 = 清空
        assert_eq!(osc_title_sequence(""), b"\x1b]0;\x07".to_vec());
    }

    /// 标记标题必须每次唯一（并发点击互不误命中）且只含安全字符。
    #[test]
    fn title_marker_is_unique_and_shell_safe() {
        let first = title_marker();
        let second = title_marker();
        assert_ne!(first, second);
        for marker in [first, second] {
            assert!(marker.starts_with("code-manager-focus-"));
            assert!(
                marker
                    .chars()
                    .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_')),
                "标记不得含 AppleScript 特殊字符: {marker}"
            );
        }
    }

    /// 标记定位脚本：按标记标题轮询命中，focus 后必须 activate，轮询消化 OSC 处理延迟。
    #[test]
    fn title_marker_script_polls_and_activates_on_hit() {
        let marker = escape_applescript_string(&title_marker());
        let script = ghostty_title_marker_script(&marker);

        assert!(script.contains(&format!(r#"if termName is "{marker}" then"#)));
        assert!(script.contains("focus term"));
        assert!(script.contains("activate"));
        assert!(script.contains("repeat 8 times"), "应轮询消化 OSC 延迟");
        assert!(script.contains("delay 0.05"));
        assert!(script.contains("return false"));
    }

    /// herdr 默认会话宿主跳（Ghostty <1.4 时 tty 分支探测失败降级到 cwd 兜底）：
    /// 兜底不得排除 herdr client，否则标题为 "herdr" 的目标 tab 永远匹配不上。
    #[test]
    fn ghostty_herdr_default_host_cwd_fallback_keeps_herdr_clients() {
        let spec = GhosttyFocusSpec::herdr_host("/dev/ttys016", "/Users/demo", None);
        let script = ghostty_script(&spec);

        assert!(
            !script.contains("isHerdrClient"),
            "herdr 默认会话宿主跳不得排除 herdr client"
        );
        assert!(script.contains("if working directory of term is targetCwd then"));
        assert!(script.contains(r#"set targetTty to "/dev/ttys016""#));
        assert!(
            !script.contains("targetSessionName"),
            "默认会话没有 title 匹配分支"
        );
    }

    #[test]
    fn applescript_templates_embed_escaped_input() {
        let escaped = escape_applescript_string(r#"/path/with"quote"#);
        let script = terminal_app_script(&escaped);
        assert!(script.contains(r#"set targetTty to "/path/with\"quote""#));

        let script = ghostty_script(&GhosttyFocusSpec::regular(None, r"/cwd\with\bs"));
        assert!(script.contains(r#"set targetCwd to "/cwd\\with\\bs""#));

        // 模板只负责嵌入已转义的字面量，转义在 ghostty_script 里做（与 cwd 同约定）。
        let script = ghostty_script(&GhosttyFocusSpec::regular(
            Some(r#"/dev/tty"evil"#),
            "/Users/demo",
        ));
        assert!(script.contains(r#"set targetTty to "/dev/tty\"evil""#));
    }

    #[test]
    fn ghostty_script_focuses_matching_terminal_directly() {
        let script = ghostty_script(&GhosttyFocusSpec::regular(None, "/Users/demo/project"));

        assert!(script.contains("repeat with term in terminals"));
        assert!(script.contains("focus term"));
        assert!(!script.contains("select tab t of w"));
    }

    /// 每个命中分支都必须在 `focus term` 后 `activate`：focus 只把窗口在其所在
    /// 桌面内置前，终端在其它 Space 或非前台时用户看不到跳转；activate 才触发
    /// 系统切换桌面并取得键盘焦点（与 Terminal/iTerm 模板同款模式）。
    #[test]
    fn ghostty_script_activates_app_on_every_hit_branch() {
        // 普通会话：tty 分支 + cwd 聚焦分支
        let script = ghostty_script(&GhosttyFocusSpec::regular(
            Some("/dev/ttys016"),
            "/Users/demo/project",
        ));
        assert_eq!(
            script.matches("focus term\nactivate").count(),
            2,
            "每个命中分支都要紧跟 activate"
        );

        // herdr 命名会话宿主跳：title + tty + cwd 聚焦三个分支
        let script = ghostty_script(&GhosttyFocusSpec::herdr_host(
            "/dev/ttys016",
            "/Users/demo/project",
            Some("cloudhub"),
        ));
        assert_eq!(script.matches("focus term\nactivate").count(), 3);
    }

    #[test]
    fn ghostty_script_does_not_choose_first_terminal_when_cwd_is_ambiguous() {
        let script = ghostty_script(&GhosttyFocusSpec::regular(None, "/Users/demo/project"));

        assert!(script.contains("cwdMatchCount"));
        assert!(script.contains("if cwdMatchCount is 1 then"));
    }

    #[test]
    fn ghostty_script_for_regular_session_excludes_herdr_clients() {
        let script = ghostty_script(&GhosttyFocusSpec::regular(None, "/Users/demo/project"));

        assert!(script.contains("set isHerdrClient to"));
        assert!(script.contains("termName starts with \"herdr --session \""));
        assert!(script.contains("and (not isHerdrClient)"));
    }

    #[test]
    fn ghostty_script_matches_tty_before_cwd_fallback() {
        let script = ghostty_script(&GhosttyFocusSpec::regular(
            Some("/dev/ttys016"),
            "/Users/demo/project",
        ));

        let tty_match = script
            .find("set targetTty")
            .expect("应生成 tty 精确匹配分支");
        let cwd_fallback = script
            .find("set cwdMatchCount")
            .expect("应保留 cwd 唯一匹配兜底");
        assert!(tty_match < cwd_fallback, "tty 匹配必须排在 cwd 兜底之前");
        assert!(script.contains("if (not ttyProbeFailed) and (termTty is targetTty) then"));
    }

    /// 旧版 Ghostty（含本机 1.3.1）的 sdef 没有 tty 属性，`tty of term` 会抛错。
    /// try 只包住属性读取：探测失败置标志跳过后续比较（旧版只付一次失败探测），
    /// focus/return 留在 try 外，聚焦错误不会被吞掉重路由到 cwd 兜底。
    #[test]
    fn ghostty_tty_probe_try_scopes_only_property_read() {
        let script = ghostty_script(&GhosttyFocusSpec::regular(
            Some("/dev/ttys016"),
            "/Users/demo/project",
        ));

        let try_open = script.find("try").expect("tty 探测应被 try 包裹");
        let probe = script
            .find("set termTty to tty of term")
            .expect("应存在 tty 属性读取");
        let try_close = script.find("end try").expect("try 应闭合");
        assert!(try_open < probe && probe < try_close);
        // try 块内不得包含聚焦动作
        let block = &script[try_open..try_close];
        assert!(!block.contains("focus term"));
        assert!(!block.contains("return true"));
        assert!(script.contains("set ttyProbeFailed to true"));
    }

    /// pid 反查 tty 失败（会话进程已退出）时不应生成 tty 分支，直接走 cwd。
    #[test]
    fn ghostty_script_without_tty_falls_back_to_cwd_only() {
        let script = ghostty_script(&GhosttyFocusSpec::regular(None, "/Users/demo/project"));

        assert!(!script.contains("set targetTty"));
        assert!(!script.contains("tty of term"));
        assert!(script.contains("set cwdMatchCount"));
    }

    /// herdr 命名会话宿主跳的精确匹配优先级必须是 title > tty > cwd。
    #[test]
    fn ghostty_herdr_host_script_orders_title_then_tty_then_cwd() {
        let script = ghostty_script(&GhosttyFocusSpec::herdr_host(
            "/dev/ttys016",
            "/Users/demo/project",
            Some("cloudhub"),
        ));

        let title = script
            .find("set targetSessionName")
            .expect("herdr title 匹配应存在");
        let tty = script.find("set targetTty").expect("tty 匹配应存在");
        let cwd = script.find("set cwdMatchCount").expect("cwd 兜底应存在");
        assert!(title < tty && tty < cwd);
        assert!(script.contains("herdr --session "));
        assert!(script.contains("herdr --session="));
        assert!(script.contains("herdr session attach "));
    }

    /// 空 cwd 不生成 cwd 兜底分支：AppleScript 的 `"" is ""` 为 true，
    /// 会唯一命中没有工作目录（无 shell 集成）的 tab。
    #[test]
    fn ghostty_script_suppresses_cwd_fallback_when_cwd_empty() {
        let script = ghostty_script(&GhosttyFocusSpec::herdr_host("/dev/ttys016", "", None));

        assert!(!script.contains("cwdMatchCount"));
        assert!(!script.contains("set targetCwd"));
        assert!(!script.contains("working directory of term"));
        // tty 精确匹配仍在
        assert!(script.contains(r#"set targetTty to "/dev/ttys016""#));
    }

    #[test]
    fn focus_failure_user_message_localizes_by_language() {
        // 中文（默认）
        let (title_zh, body_zh) = FocusFailure::TabNotFound.user_message("zh");
        assert_eq!(title_zh, "会话聚焦失败");
        assert!(body_zh.contains("未找到对应的终端 tab"));

        let (_, body_zh_tty) = FocusFailure::TtyNotFound.user_message("zh");
        assert!(body_zh_tty.contains("会话进程已退出"));

        let (_, body_zh_unsupported) =
            FocusFailure::Unsupported("unknown".to_string()).user_message("zh");
        assert!(body_zh_unsupported.contains("unknown"));
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

    /// 补足英文 body 覆盖：TtyNotFound / Unsupported / ScriptError
    /// 之前只测了 TabNotFound 的英文，其它分支没有 assert。
    #[test]
    fn focus_failure_user_message_english_branches_cover_all_variants() {
        let (_, body) = FocusFailure::TtyNotFound.user_message("en");
        assert!(body.to_lowercase().contains("session process has exited"));

        let (_, body) = FocusFailure::Unsupported("unknown".to_string()).user_message("en");
        assert!(body.contains("'unknown'"));
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
