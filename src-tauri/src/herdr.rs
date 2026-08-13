//! herdr（https://github.com/herdrdev/herdr）会话聚焦支持。
//!
//! herdr 是跑在宿主终端里的 agent 多路复用器（类 tmux）：TUI client 跑在宿主终端
//! 的 tab 里，并 spawn 一个 detached 的 headless server daemon；daemon 为每个 pane
//! 创建自己的 pty。因此 Claude Code 会话进程的 tty 属于 herdr 而非宿主终端，
//! 宿主终端的 AppleScript 按 tty 匹配必然失配，需要"两跳"聚焦：
//!
//! 1. socket 跳：连接 herdr 的 unix socket API，按 pid 精确匹配 pane 并 `pane.focus`；
//!    该调用只改 herdr 内部焦点，server 是 headless 的，没有任何 API 能激活宿主窗口。
//! 2. 宿主跳：扫描本机 `herdr` 进程找到附着同一会话的 client（其 tty 即宿主 tab
//!    的 tty），复用 `terminal_focus` 的 AppleScript 链路激活宿主终端。
//!    找不到 client（ssh 远程附着 / detach 状态）或宿主跳失败时按"部分成功"降级，
//!    只记 warn 日志，不打扰用户。
//!
//! 协议事实来自 herdr 源码（Apache-2.0，socket API 为 NDJSON over unix socket）：
//! - socket 路径：env `HERDR_SOCKET_PATH` 优先，否则 `<config>/herdr/herdr.sock`；
//!   命名会话（`herdr --session <name>`）为 `<config>/herdr/sessions/<name>/herdr.sock`，
//!   config = `XDG_CONFIG_HOME` 或 `~/.config`。
//! - 请求：`{"id": "...", "method": "...", "params": {...}}`；
//!   响应：`{"id": "...", "result": {...}}` 或 `{"id": "...", "error": {...}}`，
//!   result 内带 `type` 标签（`pane_list` / `pane_process_info` / `agent_list` / `pane_info`）。
//! - 检测：命名会话的 pane 进程 env 继承 `HERDR_SESSION=<name>`；默认会话没有任何
//!   环境标记，只能沿 ppid 链向上找到名为 `herdr` 的 server 进程。

#[cfg(unix)]
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::Command;
#[cfg(unix)]
use std::time::Duration;

use serde_json::{json, Value};

use crate::terminal_focus::FocusFailure;

/// herdr 设置的会话名环境变量（命名会话才存在）。
const HERDR_SESSION_ENV: &str = "HERDR_SESSION";
/// herdr socket 路径覆盖环境变量。
const HERDR_SOCKET_PATH_ENV: &str = "HERDR_SOCKET_PATH";
/// herdr 会话名最大长度（与其源码 validate_name 对齐）。
const HERDR_SESSION_NAME_MAX: usize = 64;
/// ppid 链向上查找 herdr server 的最大层数。
const ANCESTOR_WALK_MAX: usize = 8;
/// socket 读写超时：herdr server 是本地进程，1 秒足够，超时避免后台线程卡死。
#[cfg(unix)]
const SOCKET_TIMEOUT: Duration = Duration::from_secs(1);

/// 一个 herdr 会话上下文：从 pane 进程环境解析出的定位信息。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct HerdrSessionContext {
    /// `HERDR_SESSION` 值（命名会话）；默认会话为 None。
    pub session_name: Option<String>,
    /// `HERDR_SOCKET_PATH` 覆盖值。
    pub socket_override: Option<String>,
    /// pane 环境的 `TERM_PROGRAM` 白名单值，即宿主终端。
    pub host_terminal: Option<&'static str>,
}

/// 检测 pid 是否运行在 herdr pane 里，命中返回会话上下文。
///
/// 先读一次 `ps eww`：命中 `HERDR_SESSION` / `HERDR_SOCKET_PATH` 即 herdr；
/// 都没有再沿 ppid 链找名为 `herdr` 的祖先（覆盖默认会话）。
pub fn detect_herdr_session(pid: u32) -> Option<HerdrSessionContext> {
    let env_output = ps_env_output(pid)?;
    let ctx = herdr_context_from_ps_output(&env_output);
    if ctx.session_name.is_some() || ctx.socket_override.is_some() {
        return Some(ctx);
    }
    has_herdr_ancestor(pid).then_some(ctx)
}

/// 会话是否运行在 herdr pane 里（托盘门禁用，只做存在性判断，不解析上下文）。
/// 与 `detect_herdr_session` 共用一条检测路径，但返回更便宜。
pub fn session_runs_in_herdr(pid: u32) -> bool {
    detect_herdr_session(pid).is_some()
}

/// 执行 herdr 两跳聚焦：socket 跳（定位并聚焦 pane）+ 宿主跳（激活宿主终端 tab）。
///
/// - socket 跳失败：返回对应 `FocusFailure`，调用方负责用户提示；跳过宿主跳。
/// - socket 跳成功但宿主跳失败/找不到 client：按部分成功处理，记 warn 日志并返回
///   Ok，不打扰用户（herdr 内部焦点已切换，detach/远程附着时没有窗口可激活）。
pub fn focus_herdr_session(
    pid: u32,
    cwd: &str,
    ctx: &HerdrSessionContext,
    fallback_slug: &str,
) -> Result<(), FocusFailure> {
    let socket_path = resolve_socket_path(ctx);

    // ---- 第一跳：herdr socket 聚焦 ----
    // pid 精确匹配优先，失配再按 cwd 兜底；两条查找同签名，串联后错误转换只写一次。
    let pane_id = find_pane_by_pid(&socket_path, pid)
        .and_then(|hit| match hit {
            Some(pane_id) => Ok(Some(pane_id)),
            None => find_pane_by_cwd(&socket_path, cwd),
        })
        .map_err(SocketError::into_focus_failure)?;
    let Some(pane_id) = pane_id else {
        log::warn!(
            "event=tray.session_focus status=miss reason=pane_not_found app=herdr pid={pid}"
        );
        return Err(FocusFailure::HerdrPaneNotFound);
    };
    if let Err(e) = focus_pane(&socket_path, &pane_id) {
        log::warn!(
            "event=tray.session_focus status=miss reason=focus_failed app=herdr pane_id={pane_id} error={e:?}"
        );
        return Err(e.into_focus_failure());
    }
    log::info!("event=tray.session_focus status=ok hop=socket app=herdr pane_id={pane_id}");

    // ---- 第二跳：激活宿主终端 ----
    let Some(client) = find_attached_client(ctx) else {
        log::warn!(
            "event=tray.session_focus status=degraded hop=host reason=client_not_found app=herdr"
        );
        return Ok(());
    };
    // client 自己 env 里的 TERM_PROGRAM 最直接；缺失时回退 pane 的，再回退默认终端设置。
    let host_slug = client
        .host_terminal
        .or(ctx.host_terminal)
        .unwrap_or(fallback_slug);
    let host_result = match host_slug {
        // Ghostty 没有 tty API：命名会话优先按 client title 匹配，cwd 只做唯一兜底；
        // cwd 必须是 client 进程的 cwd（用户敲 `herdr` 的目录），而不是 pane 的 cwd。
        "ghostty" => match process_cwd(client.pid) {
            Some(client_cwd) => crate::terminal_focus::focus_ghostty_via_herdr_session(
                &client_cwd,
                ctx.session_name.as_deref(),
            ),
            None => Err(FocusFailure::EmptyCwd),
        },
        // tty 类终端复用 terminal_focus 的单点映射，client.tty 直接聚焦，不重复 pid 反查。
        slug => match crate::terminal_focus::tty_terminal_script(slug) {
            Some((label, build_script)) => {
                crate::terminal_focus::focus_tty(label, &client.tty, build_script)
            }
            None => Err(FocusFailure::Unsupported(slug.to_string())),
        },
    };
    match host_result {
        Ok(()) => {
            log::info!(
                "event=tray.session_focus status=ok hop=host app=herdr host={host_slug} tty={}",
                client.tty
            );
            Ok(())
        }
        Err(failure) => {
            // 宿主跳失败不影响 herdr 内部聚焦，按部分成功处理。
            log::warn!(
                "event=tray.session_focus status=degraded hop=host app=herdr failure={failure:?}"
            );
            Ok(())
        }
    }
}

/// herdr socket 通信错误，仅在模块内部流转，出口统一转成 `FocusFailure`。
#[derive(Debug, Clone, PartialEq, Eq)]
enum SocketError {
    /// 连接失败：server 未运行或 socket 已失效。
    #[cfg(unix)]
    NotRunning,
    /// 读写超时 / 协议解析失败 / 响应里带 error。
    Protocol,
}

impl SocketError {
    fn into_focus_failure(self) -> FocusFailure {
        match self {
            #[cfg(unix)]
            SocketError::NotRunning => FocusFailure::HerdrNotRunning,
            SocketError::Protocol => FocusFailure::ScriptError,
        }
    }
}

/// 解析 `ps eww` 输出中的 herdr 定位信息（白名单提取，原始输出绝不写日志）。
/// 抽成纯函数便于单测。
fn herdr_context_from_ps_output(output: &str) -> HerdrSessionContext {
    let mut session_name = None;
    let mut socket_override = None;
    for part in output.split_ascii_whitespace() {
        if session_name.is_none() {
            if let Some(raw) = part.strip_prefix(format!("{HERDR_SESSION_ENV}=").as_str()) {
                session_name = sanitize_session_name(raw);
                continue;
            }
        }
        if socket_override.is_none() {
            if let Some(raw) = part.strip_prefix(format!("{HERDR_SOCKET_PATH_ENV}=").as_str()) {
                socket_override = (!raw.is_empty()).then(|| raw.to_string());
                continue;
            }
        }
        if session_name.is_some() && socket_override.is_some() {
            break;
        }
    }
    HerdrSessionContext {
        session_name,
        socket_override,
        host_terminal: crate::terminal_focus::terminal_app_from_ps_output(output),
    }
}

/// 校验/清洗 `HERDR_SESSION`：只放行 herdr 命名规则（ASCII 字母数字 `._-`，≤64），
/// `default` 与非法值视为默认会话（None），防路径穿越。
fn sanitize_session_name(raw: &str) -> Option<String> {
    if raw.is_empty() || raw == "default" || raw.len() > HERDR_SESSION_NAME_MAX {
        return None;
    }
    raw.chars()
        .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-'))
        .then(|| raw.to_string())
}

/// 解析 herdr socket 路径。优先级：`HERDR_SOCKET_PATH` > 命名会话路径 > 默认路径。
fn resolve_socket_path(ctx: &HerdrSessionContext) -> PathBuf {
    resolve_socket_path_with(std::env::var("XDG_CONFIG_HOME").ok().as_deref(), ctx)
}

/// 当前机器上的默认 herdr socket 路径，用于区分默认会话与真正的自定义 socket。
fn resolve_default_socket_path() -> PathBuf {
    let default_ctx = HerdrSessionContext {
        session_name: None,
        socket_override: None,
        host_terminal: None,
    };
    resolve_socket_path(&default_ctx)
}

/// 纯函数版 socket 路径解析，便于单测（config_home 为 None 时用 `~/.config`）。
fn resolve_socket_path_with(config_home: Option<&str>, ctx: &HerdrSessionContext) -> PathBuf {
    if let Some(override_path) = &ctx.socket_override {
        return PathBuf::from(override_path);
    }
    let config = match config_home {
        Some(home) => PathBuf::from(home),
        None => crate::utils::home_dir_or_fallback().join(".config"),
    };
    match &ctx.session_name {
        Some(name) => config
            .join("herdr")
            .join("sessions")
            .join(name)
            .join("herdr.sock"),
        None => config.join("herdr").join("herdr.sock"),
    }
}

/// 读进程完整环境（`ps eww`）；失败返回 None。原始输出绝不能写入日志。
fn ps_env_output(pid: u32) -> Option<String> {
    let output = Command::new("ps")
        .args(["eww", "-p", &pid.to_string(), "-o", "command="])
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    Some(String::from_utf8_lossy(&output.stdout).to_string())
}

/// 沿 ppid 链向上找名为 `herdr` 的祖先进程（默认会话没有 env 标记，只能靠进程树）。
/// 注意 daemon 的 comm 可能是完整路径（如 `/opt/homebrew/bin/herdr`），需同时匹配。
fn has_herdr_ancestor(pid: u32) -> bool {
    let mut current = pid;
    for _ in 0..ANCESTOR_WALK_MAX {
        let Some((ppid, comm)) = read_ppid_comm(current) else {
            return false;
        };
        if ppid == 0 {
            return false;
        }
        if is_herdr_comm(&comm) {
            return true;
        }
        current = ppid;
    }
    false
}

/// herdr 进程名匹配：直接叫 `herdr`，或以 `/herdr` 结尾的完整路径
/// （launchd/daemon 方式启动的进程 comm 显示 argv[0] 全路径）。
fn is_herdr_comm(comm: &str) -> bool {
    comm == "herdr" || comm.ends_with("/herdr")
}

/// 一次 `ps -p <pid> -o ppid=,comm=`，返回 (ppid, comm)。
fn read_ppid_comm(pid: u32) -> Option<(u32, String)> {
    let output = Command::new("ps")
        .args(["-p", &pid.to_string(), "-o", "ppid=,comm="])
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    parse_ppid_comm_output(&String::from_utf8_lossy(&output.stdout))
}

/// 解析 `ps -o ppid=,comm=` 输出（如 `"12345 herdr"`）；抽出来便于单测。
fn parse_ppid_comm_output(raw: &str) -> Option<(u32, String)> {
    let mut parts = raw.split_ascii_whitespace();
    let ppid: u32 = parts.next()?.parse().ok()?;
    let comm = parts.next()?.to_string();
    Some((ppid, comm))
}

/// 向 herdr socket 发一个 NDJSON 请求并返回 `result` 对象。
#[cfg(unix)]
fn request_socket(socket_path: &Path, method: &str, params: Value) -> Result<Value, SocketError> {
    use std::os::unix::net::UnixStream;

    let mut stream = UnixStream::connect(socket_path).map_err(|_| SocketError::NotRunning)?;
    // 超时兜底：server 异常时避免后台线程无限阻塞。
    let _ = stream.set_read_timeout(Some(SOCKET_TIMEOUT));
    let _ = stream.set_write_timeout(Some(SOCKET_TIMEOUT));

    let request = json!({ "id": "code-manager:herdr", "method": method, "params": params });
    let mut line = serde_json::to_string(&request).map_err(|_| SocketError::Protocol)?;
    line.push('\n');
    stream
        .write_all(line.as_bytes())
        .map_err(|_| SocketError::Protocol)?;

    let mut reader = BufReader::new(stream);
    let mut response = String::new();
    reader
        .read_line(&mut response)
        .map_err(|_| SocketError::Protocol)?;
    if response.trim().is_empty() {
        return Err(SocketError::Protocol);
    }
    let value: Value = serde_json::from_str(&response).map_err(|_| SocketError::Protocol)?;
    if value.get("error").is_some() {
        return Err(SocketError::Protocol);
    }
    value.get("result").cloned().ok_or(SocketError::Protocol)
}

/// 非 unix 平台没有 unix socket，直接按协议失败处理（功能整体由 tray 层 macOS 门禁把关）。
#[cfg(not(unix))]
fn request_socket(
    _socket_path: &Path,
    _method: &str,
    _params: Value,
) -> Result<Value, SocketError> {
    Err(SocketError::Protocol)
}

/// 按 pid 精确匹配 pane：`pane.list` + 逐 pane `pane.process_info`。
/// 命中 foreground_processes[].pid / shell_pid / foreground_process_group_id 即命中。
fn find_pane_by_pid(socket_path: &Path, pid: u32) -> Result<Option<String>, SocketError> {
    let result = request_socket(socket_path, "pane.list", json!({}))?;
    let panes = result
        .get("panes")
        .and_then(Value::as_array)
        .ok_or(SocketError::Protocol)?;
    for pane in panes {
        let Some(pane_id) = pane.get("pane_id").and_then(Value::as_str) else {
            continue;
        };
        // 单个 pane 在 list 与 process_info 之间被关闭（pane_not_found）时跳过
        // 继续查下一个；server 掉线（NotRunning）才整体失败。
        let Ok(info_result) = request_socket(
            socket_path,
            "pane.process_info",
            json!({ "pane_id": pane_id }),
        ) else {
            continue;
        };
        let process_info = info_result
            .get("process_info")
            .ok_or(SocketError::Protocol)?;
        if pane_process_contains_pid(process_info, pid) {
            return Ok(Some(pane_id.to_string()));
        }
    }
    Ok(None)
}

/// 判断 pane.process_info 响应是否包含目标 pid（三个字段任一命中即可）。
fn pane_process_contains_pid(process_info: &Value, pid: u32) -> bool {
    let target = pid as u64;
    if process_info.get("shell_pid").and_then(Value::as_u64) == Some(target) {
        return true;
    }
    if process_info
        .get("foreground_process_group_id")
        .and_then(Value::as_u64)
        == Some(target)
    {
        return true;
    }
    process_info
        .get("foreground_processes")
        .and_then(Value::as_array)
        .is_some_and(|processes| {
            processes
                .iter()
                .any(|p| p.get("pid").and_then(Value::as_u64) == Some(target))
        })
}

/// cwd 兜底匹配：`agent.list` 一次往返，按 pane/foreground cwd 找 agent。
/// 0 个或多个匹配都视为未命中（歧义时宁可失败，不聚焦错 pane）。
fn find_pane_by_cwd(socket_path: &Path, cwd: &str) -> Result<Option<String>, SocketError> {
    let result = request_socket(socket_path, "agent.list", json!({}))?;
    let agents = result
        .get("agents")
        .and_then(Value::as_array)
        .ok_or(SocketError::Protocol)?;
    let matches: Vec<&str> = agents
        .iter()
        .filter_map(|agent| {
            let cwd_matches = [agent.get("cwd"), agent.get("foreground_cwd")]
                .into_iter()
                .flatten()
                .any(|v| v.as_str() == Some(cwd));
            cwd_matches
                .then(|| agent.get("pane_id").and_then(Value::as_str))
                .flatten()
        })
        .collect();
    Ok((matches.len() == 1).then(|| matches[0].to_string()))
}

/// 聚焦指定 pane（`pane.focus` 接受 pane.list / agent.list 返回的 public pane_id）。
fn focus_pane(socket_path: &Path, pane_id: &str) -> Result<(), SocketError> {
    let result = request_socket(socket_path, "pane.focus", json!({ "pane_id": pane_id }))?;
    result.get("pane").ok_or(SocketError::Protocol).map(|_| ())
}

/// 找到附着同一 herdr 会话的本地 client 进程；其 tty 就是宿主终端 tab 的 tty。
///
/// 策略：扫全部 `herdr` 进程 → 逐个按 env / argv 做会话一致性匹配 → 过滤出有真实
/// tty 的（server daemon 是 detached 进程没有 tty，天然被排除）→ 取第一个。
///
/// 会话匹配双通道（herdr 0.7.x 实测：client 进程 env 不带 `HERDR_SESSION`，会话名
/// 只体现在 argv 的 `--session <name>`；而新版 herdr 会把标记注入 env）:
/// - env 通道：`HERDR_SESSION` / `HERDR_SOCKET_PATH` 相等；
/// - argv 通道：`--session <name>` / `--session=<name>` / `session attach <name>`。
///
/// `--remote` 与 `--no-session` 不承载本机持久会话，即使有 tty 也必须排除。
fn find_attached_client(ctx: &HerdrSessionContext) -> Option<HerdrClientInfo> {
    let processes = list_herdr_processes()?;
    processes.into_iter().find_map(|(pid, argv)| {
        let env = ps_env_output(pid)?;
        if !client_matches_session(&env, &argv, ctx) {
            return None;
        }
        let tty = crate::terminal_focus::pid_to_tty(pid)?;
        Some(HerdrClientInfo {
            pid,
            tty,
            host_terminal: crate::terminal_focus::terminal_app_from_ps_output(&env),
        })
    })
}

/// 已附着的 herdr client 进程信息。
struct HerdrClientInfo {
    pid: u32,
    /// 宿主终端 tab 的 tty。
    tty: String,
    /// client 环境里的宿主终端（TERM_PROGRAM 白名单值）。
    host_terminal: Option<&'static str>,
}

/// 列出本机所有 `herdr` 进程的 (pid, argv)。
/// `-ww` 防止长命令行被截断；daemon 的 argv[0] 可能是完整路径，用 `is_herdr_comm` 匹配。
fn list_herdr_processes() -> Option<Vec<(u32, String)>> {
    let output = Command::new("ps")
        .args(["axww", "-o", "pid=,command="])
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let raw = String::from_utf8_lossy(&output.stdout);
    Some(
        raw.lines()
            .filter_map(|line| {
                let mut parts = line.split_ascii_whitespace();
                let pid: u32 = parts.next()?.parse().ok()?;
                let argv0 = parts.next()?;
                is_herdr_comm(argv0).then(|| (pid, line.trim().to_string()))
            })
            .collect(),
    )
}

/// remote attach 与 monolithic 模式不属于本机持久会话 client，不能参与宿主终端匹配。
fn herdr_argv_uses_non_local_mode(argv: &str) -> bool {
    argv.split_ascii_whitespace()
        .any(|arg| matches!(arg, "--remote" | "--no-session") || arg.starts_with("--remote="))
}

/// client 进程与 pane 会话上下文是否一致：env / argv 双通道（见 `find_attached_client` 文档）。
fn client_matches_session(env: &str, argv: &str, ctx: &HerdrSessionContext) -> bool {
    if herdr_argv_uses_non_local_mode(argv) {
        return false;
    }
    let env_ctx = herdr_context_from_ps_output(env);
    let argv_session = herdr_session_from_argv(argv);
    match (&ctx.session_name, &ctx.socket_override) {
        (Some(name), _) => {
            env_ctx.session_name.as_deref() == Some(name.as_str())
                // herdr 0.7.x 的 client env 不带标记，会话名只在 argv 里
                || (env_ctx.session_name.is_none() && argv_session.as_deref() == Some(name.as_str()))
        }
        (None, Some(socket_path)) => {
            let client_socket_matches =
                env_ctx.socket_override.as_deref() == Some(socket_path.as_str());
            // herdr 0.7.x 会把默认 socket 注入 pane env，但 bare client 不继承该变量。
            // 仅对当前机器的标准默认路径放宽；真正的自定义 socket 仍要求精确匹配。
            let unmarked_default_client = env_ctx.socket_override.is_none()
                && Path::new(socket_path) == resolve_default_socket_path();
            (client_socket_matches || unmarked_default_client)
                && env_ctx.session_name.is_none()
                && argv_session.is_none()
        }
        // 默认会话：client 必须既无 env 标记、argv 也无 `--session` / `session attach`，
        // 避免误配到命名会话的 client（0.7.x 下命名会话 client env 无标记，只能靠 argv 区分）。
        (None, None) => {
            env_ctx.session_name.is_none()
                && env_ctx.socket_override.is_none()
                && argv_session.is_none()
        }
    }
}

/// 从 herdr client 命令行提取会话名：`--session <name>` / `--session=<name>` /
/// `session attach <name>`；输入可能保留 `ps` 的 pid 前缀，因此不能依赖固定下标。
/// 无会话参数返回 None。会话名校验与 env 通道同规则。
fn herdr_session_from_argv(argv: &str) -> Option<String> {
    let args: Vec<&str> = argv.split_ascii_whitespace().collect();
    for (i, arg) in args.iter().enumerate() {
        if *arg == "--session" {
            if let Some(name) = args.get(i + 1) {
                return sanitize_session_name(name);
            }
        }
        if let Some(name) = arg.strip_prefix("--session=") {
            return sanitize_session_name(name);
        }
    }
    for command in args.windows(3) {
        if command[0] == "session" && command[1] == "attach" {
            return sanitize_session_name(command[2]);
        }
    }
    None
}

/// 取进程当前工作目录（macOS 的 ps 没有 cwd 列，走 `lsof -a -p <pid> -d cwd -Fn`）。
fn process_cwd(pid: u32) -> Option<String> {
    let output = Command::new("lsof")
        .args(["-a", "-p", &pid.to_string(), "-d", "cwd", "-Fn"])
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    parse_lsof_cwd_output(&String::from_utf8_lossy(&output.stdout))
}

/// 解析 `lsof -Fn` 输出（`p<pid>` / `fcwd` / `n<path>` 三行一组），取 `n` 行。
/// 抽出来便于单测。
fn parse_lsof_cwd_output(raw: &str) -> Option<String> {
    raw.lines()
        .find_map(|line| line.strip_prefix('n').map(str::to_string))
        .filter(|cwd| !cwd.is_empty())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn herdr_context_parses_named_session_env() {
        let ctx = herdr_context_from_ps_output(
            "zsh TERM_PROGRAM=Apple_Terminal HERDR_SESSION=work TERM=xterm-256color",
        );
        assert_eq!(ctx.session_name.as_deref(), Some("work"));
        assert_eq!(ctx.socket_override, None);
        assert_eq!(ctx.host_terminal, Some("terminal"));
    }

    #[test]
    fn herdr_context_parses_socket_override_env() {
        let ctx = herdr_context_from_ps_output(
            "zsh TERM_PROGRAM=iTerm.app HERDR_SOCKET_PATH=/tmp/custom-herdr.sock",
        );
        assert_eq!(ctx.session_name, None);
        assert_eq!(
            ctx.socket_override.as_deref(),
            Some("/tmp/custom-herdr.sock")
        );
        assert_eq!(ctx.host_terminal, Some("iterm"));
    }

    #[test]
    fn herdr_context_default_session_has_no_markers() {
        let ctx = herdr_context_from_ps_output("zsh TERM_PROGRAM=ghostty TERM=xterm-ghostty");
        assert_eq!(ctx.session_name, None);
        assert_eq!(ctx.socket_override, None);
        assert_eq!(ctx.host_terminal, Some("ghostty"));
    }

    #[test]
    fn herdr_context_unknown_term_program_is_none() {
        let ctx = herdr_context_from_ps_output("zsh TERM_PROGRAM=WezTerm");
        assert_eq!(ctx.host_terminal, None);
    }

    #[test]
    fn sanitize_session_name_rejects_traversal_and_default() {
        assert_eq!(sanitize_session_name("work"), Some("work".to_string()));
        assert_eq!(
            sanitize_session_name("a.b-c_d"),
            Some("a.b-c_d".to_string())
        );
        // herdr 保留名与非法字符一律视为默认会话，防路径穿越
        assert_eq!(sanitize_session_name("default"), None);
        assert_eq!(sanitize_session_name("../evil"), None);
        assert_eq!(sanitize_session_name("a/b"), None);
        assert_eq!(sanitize_session_name(""), None);
        assert_eq!(sanitize_session_name("工作"), None);
        let long = "x".repeat(HERDR_SESSION_NAME_MAX + 1);
        assert_eq!(sanitize_session_name(&long), None);
    }

    #[test]
    fn resolve_socket_path_prefers_override_then_named_then_default() {
        let override_ctx = HerdrSessionContext {
            session_name: None,
            socket_override: Some("/tmp/custom.sock".to_string()),
            host_terminal: None,
        };
        assert_eq!(
            resolve_socket_path_with(Some("/Users/demo/.config"), &override_ctx),
            PathBuf::from("/tmp/custom.sock")
        );

        let named_ctx = HerdrSessionContext {
            session_name: Some("work".to_string()),
            socket_override: None,
            host_terminal: None,
        };
        assert_eq!(
            resolve_socket_path_with(Some("/Users/demo/.config"), &named_ctx),
            PathBuf::from("/Users/demo/.config/herdr/sessions/work/herdr.sock")
        );

        let default_ctx = HerdrSessionContext {
            session_name: None,
            socket_override: None,
            host_terminal: None,
        };
        assert_eq!(
            resolve_socket_path_with(Some("/Users/demo/.config"), &default_ctx),
            PathBuf::from("/Users/demo/.config/herdr/herdr.sock")
        );
        // XDG_CONFIG_HOME 未设置时回退 ~/.config
        assert!(resolve_socket_path_with(None, &default_ctx).ends_with(".config/herdr/herdr.sock"));
    }

    #[test]
    fn parse_ppid_comm_output_handles_normal_and_garbage() {
        assert_eq!(
            parse_ppid_comm_output("12345 herdr"),
            Some((12345, "herdr".to_string()))
        );
        assert_eq!(
            parse_ppid_comm_output("0 launchd"),
            Some((0, "launchd".to_string()))
        );
        assert_eq!(parse_ppid_comm_output(""), None);
        assert_eq!(parse_ppid_comm_output("abc herdr"), None);
    }

    #[test]
    fn pane_process_contains_pid_matches_any_foreground_process() {
        let info = json!({
            "pane_id": "ws1:p1",
            "shell_pid": 100,
            "foreground_process_group_id": 200,
            "tty": "/dev/ttys003",
            "foreground_processes": [
                { "pid": 201, "name": "claude" },
                { "pid": 202, "name": "node" }
            ]
        });
        // 前台进程列表命中
        assert!(pane_process_contains_pid(&info, 201));
        // 进程组 id 命中
        assert!(pane_process_contains_pid(&info, 200));
        // shell pid 命中
        assert!(pane_process_contains_pid(&info, 100));
        // 未命中
        assert!(!pane_process_contains_pid(&info, 999));
    }

    #[test]
    fn pane_process_contains_pid_handles_missing_fields() {
        let info = json!({ "pane_id": "ws1:p1" });
        assert!(!pane_process_contains_pid(&info, 1));
    }

    #[test]
    fn client_matches_session_by_env_then_socket_then_default() {
        let named = HerdrSessionContext {
            session_name: Some("work".to_string()),
            socket_override: None,
            host_terminal: None,
        };
        // env 通道：新版 herdr 把标记注入 client env
        assert!(client_matches_session(
            "herdr HERDR_SESSION=work TERM_PROGRAM=Apple_Terminal",
            "herdr --session work",
            &named
        ));
        // argv 通道：herdr 0.7.x 的 client env 不带标记，会话名只在 argv
        assert!(client_matches_session(
            "herdr TERM_PROGRAM=Apple_Terminal",
            "herdr --session work",
            &named
        ));
        assert!(client_matches_session(
            "herdr TERM_PROGRAM=Apple_Terminal",
            "herdr --session=work",
            &named
        ));
        assert!(client_matches_session(
            "herdr TERM_PROGRAM=Apple_Terminal",
            "herdr session attach work",
            &named
        ));
        // env 与 argv 都不一致 / 都缺失 → 不匹配
        assert!(!client_matches_session(
            "herdr HERDR_SESSION=other TERM_PROGRAM=Apple_Terminal",
            "herdr --session work",
            &named
        ));
        assert!(!client_matches_session(
            "herdr HERDR_SESSION=other TERM_PROGRAM=Apple_Terminal",
            "herdr",
            &named
        ));
        assert!(!client_matches_session(
            "herdr TERM_PROGRAM=Apple_Terminal",
            "herdr --session other",
            &named
        ));

        let overridden = HerdrSessionContext {
            session_name: None,
            socket_override: Some("/tmp/custom.sock".to_string()),
            host_terminal: None,
        };
        assert!(client_matches_session(
            "herdr HERDR_SOCKET_PATH=/tmp/custom.sock",
            "herdr",
            &overridden
        ));
        assert!(!client_matches_session(
            "herdr HERDR_SOCKET_PATH=/tmp/other.sock",
            "herdr",
            &overridden
        ));

        // 默认会话：client 必须同样没有任何 herdr 标记（env 与 argv 都要干净）
        let default = HerdrSessionContext {
            session_name: None,
            socket_override: None,
            host_terminal: None,
        };
        assert!(client_matches_session(
            "herdr TERM_PROGRAM=Apple_Terminal",
            "herdr",
            &default
        ));
        assert!(!client_matches_session(
            "herdr HERDR_SESSION=work",
            "herdr --session work",
            &default
        ));
        assert!(!client_matches_session(
            "herdr HERDR_SOCKET_PATH=/tmp/custom.sock",
            "herdr",
            &default
        ));
        // 0.7.x 下命名会话 client env 无标记，靠 argv 排除
        assert!(!client_matches_session(
            "herdr TERM_PROGRAM=Apple_Terminal",
            "herdr --session work",
            &default
        ));

        // herdr 会把默认 socket 路径注入 pane，但 0.7.x 的 bare client 不继承该变量。
        // 这仍然是默认会话，应该匹配无标记、无命名参数的 client。
        let default_socket = resolve_socket_path(&default);
        let default_with_socket_marker = HerdrSessionContext {
            session_name: None,
            socket_override: Some(default_socket.to_string_lossy().into_owned()),
            host_terminal: None,
        };
        assert!(client_matches_session(
            "herdr TERM_PROGRAM=ghostty",
            "herdr",
            &default_with_socket_marker
        ));
    }

    #[test]
    fn client_rejects_remote_and_no_session_processes() {
        let default = HerdrSessionContext {
            session_name: None,
            socket_override: None,
            host_terminal: None,
        };
        assert!(!client_matches_session(
            "herdr TERM_PROGRAM=Apple_Terminal",
            "herdr --remote build-host",
            &default
        ));
        assert!(!client_matches_session(
            "herdr TERM_PROGRAM=Apple_Terminal",
            "herdr --no-session",
            &default
        ));

        let named = HerdrSessionContext {
            session_name: Some("work".to_string()),
            socket_override: None,
            host_terminal: None,
        };
        assert!(!client_matches_session(
            "herdr HERDR_SESSION=work TERM_PROGRAM=Apple_Terminal",
            "herdr --remote build-host --session work",
            &named
        ));
    }

    #[test]
    fn herdr_session_from_argv_extracts_session_name() {
        assert_eq!(
            herdr_session_from_argv("herdr --session cloudhub"),
            Some("cloudhub".to_string())
        );
        assert_eq!(
            herdr_session_from_argv("herdr --session=cloudhub"),
            Some("cloudhub".to_string())
        );
        assert_eq!(
            herdr_session_from_argv("herdr session attach cloudhub"),
            Some("cloudhub".to_string())
        );
        // list_herdr_processes 当前传入完整 ps 行，开头包含 pid。
        assert_eq!(
            herdr_session_from_argv("90936 herdr session attach cloudhub"),
            Some("cloudhub".to_string())
        );
        // 无会话参数 / daemon / 非法值
        assert_eq!(herdr_session_from_argv("herdr"), None);
        assert_eq!(
            herdr_session_from_argv("/opt/homebrew/bin/herdr server"),
            None
        );
        assert_eq!(herdr_session_from_argv("herdr --session"), None);
        assert_eq!(herdr_session_from_argv("herdr --session default"), None);
        assert_eq!(herdr_session_from_argv("herdr session attach"), None);
    }

    #[test]
    fn is_herdr_comm_matches_name_and_full_path() {
        assert!(is_herdr_comm("herdr"));
        assert!(is_herdr_comm("/opt/homebrew/bin/herdr"));
        assert!(!is_herdr_comm("herdr-server"));
        assert!(!is_herdr_comm("zsh"));
        assert!(!is_herdr_comm(""));
    }

    #[test]
    fn parse_lsof_cwd_output_extracts_path_line() {
        assert_eq!(
            parse_lsof_cwd_output("p4242\nfcwd\nn/Users/demo/work/code-manager\n"),
            Some("/Users/demo/work/code-manager".to_string())
        );
        // 无输出 / 空路径
        assert_eq!(parse_lsof_cwd_output(""), None);
        assert_eq!(parse_lsof_cwd_output("p4242\nfcwd\nn\n"), None);
    }

    #[test]
    fn socket_error_maps_to_focus_failure() {
        #[cfg(unix)]
        assert_eq!(
            SocketError::NotRunning.into_focus_failure(),
            FocusFailure::HerdrNotRunning
        );
        assert_eq!(
            SocketError::Protocol.into_focus_failure(),
            FocusFailure::ScriptError
        );
    }

    /// 进程内 mock herdr server：temp 目录 unix socket + 线程按脚本应答 NDJSON，
    /// 覆盖 request_socket 的往返、连接失败、畸形响应与超时四条路径。
    #[cfg(unix)]
    #[test]
    fn request_socket_roundtrip_and_error_paths() {
        use std::os::unix::net::UnixListener;
        use std::sync::mpsc;
        use std::thread;

        let dir = std::env::temp_dir().join(format!("herdr-mock-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let socket_path = dir.join("herdr.sock");

        struct MockServer {
            listener: UnixListener,
            responses: Vec<String>,
        }
        let server = MockServer {
            listener: UnixListener::bind(&socket_path).unwrap(),
            responses: vec![
                // 1. 正常响应
                "{\"id\":\"code-manager:herdr\",\"result\":{\"type\":\"pane_list\",\"panes\":[]}}\n".to_string(),
                // 2. 畸形 JSON
                "not-json-at-all\n".to_string(),
                // 3. 响应里带 error
                "{\"id\":\"code-manager:herdr\",\"error\":{\"code\":\"pane_not_found\",\"message\":\"pane not found\"}}\n".to_string(),
            ],
        };

        // server 线程：每次连接读一行请求、按序号回一段响应；4 号连接静默（测超时）。
        let (tx, rx) = mpsc::channel::<()>();
        thread::spawn(move || {
            let MockServer {
                listener,
                responses,
            } = server;
            let mut request_count = 0usize;
            for stream in listener.incoming() {
                let Ok(stream) = stream else { break };
                request_count += 1;
                if request_count == 4 {
                    // 模拟 server 卡死：不读不写，等 client 读超时自行断开
                    tx.send(()).ok();
                    continue;
                }
                let mut reader = BufReader::new(stream.try_clone().unwrap());
                let mut request = String::new();
                let _ = reader.read_line(&mut request);
                if let Some(response) = responses.get(request_count - 1) {
                    use std::io::Write;
                    let mut writer = stream;
                    let _ = writer.write_all(response.as_bytes());
                }
                tx.send(()).ok();
            }
        });

        // 1. 正常往返：pane.list 返回空列表
        let result = request_socket(&socket_path, "pane.list", json!({}));
        assert!(result.is_ok(), "正常响应应成功: {result:?}");
        assert_eq!(result.unwrap()["type"], "pane_list");
        rx.recv_timeout(Duration::from_secs(3)).unwrap();

        // 2. 畸形 JSON → Protocol
        let result = request_socket(&socket_path, "pane.list", json!({}));
        assert_eq!(result, Err(SocketError::Protocol));
        rx.recv_timeout(Duration::from_secs(3)).unwrap();

        // 3. 响应带 error → Protocol
        let result = request_socket(&socket_path, "pane.list", json!({}));
        assert_eq!(result, Err(SocketError::Protocol));
        rx.recv_timeout(Duration::from_secs(3)).unwrap();

        // 4. server 沉默 → 读超时 → Protocol
        let result = request_socket(&socket_path, "pane.list", json!({}));
        assert_eq!(result, Err(SocketError::Protocol));
        rx.recv_timeout(Duration::from_secs(3)).unwrap();

        // 5. socket 不存在 → NotRunning
        let missing = dir.join("missing.sock");
        let result = request_socket(&missing, "pane.list", json!({}));
        assert_eq!(result, Err(SocketError::NotRunning));

        let _ = std::fs::remove_dir_all(&dir);
    }
}
