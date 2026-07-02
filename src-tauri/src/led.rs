//! USB LED 灯效控制：把系统托盘的会话红绿状态镜像到外接 ANTICATER 设备。
//!
//! 协议逆向自 codepass(Swift+IOKit)。本模块只移植「LED 模式切换」：
//! 设备一次只能亮 6 种灯效动画(0=关、1 顺时针、2 逆时针、3 交替、4 跳跃、5 闪烁),无 RGB 颜色。
//!
//! 分层:
//! - 协议层 `mode_reports`:纯逻辑,跨平台,有单测。
//! - 设备层(`#[cfg(target_os = "macos")]`):hidapi 枚举 vendor 接口、写两包报文。
//! - 运行时:独立 worker 线程独占设备句柄,经 channel 收 mode;USB I/O 不阻塞托盘/监听线程。
//! - 驱动入口 `on_session_state_changed`:托盘每次复算会话状态时调用,按偏好映射→去重→下发。

use std::sync::{mpsc, Mutex};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

#[cfg(target_os = "macos")]
use hidapi::{HidApi, HidDevice};

// ── 协议常量(逆向自 codepass OfficialLEDReports) ──
/// 报文首字节固定为 report ID 0x03。
#[allow(dead_code)] // 非 macOS 平台仅协议单测使用,运行时不下发
pub const REPORT_ID: u8 = 0x03;
/// 每包定长 65 字节(1 字节 report ID + 64 字节 payload)。
#[allow(dead_code)] // 非 macOS 平台仅协议单测使用,运行时不下发
pub const REPORT_LEN: usize = 65;
/// 合法模式上界,mode ∈ 0..=5。
pub const MAX_MODE: u8 = 5;

// ── 设备匹配参数(复合设备里挑 vendor 接口) ──
#[cfg(target_os = "macos")]
const VENDOR_ID: u16 = 0x514c;
#[cfg(target_os = "macos")]
const PRODUCT_ID: u16 = 0x8850;
#[cfg(target_os = "macos")]
const USAGE_PAGE: u16 = 0xff00;
#[cfg(target_os = "macos")]
const USAGE: u16 = 0x0001;

/// LED 控制错误。`Device` 用字符串承载底层 HID 错误,保持本类型跨平台可用。
#[derive(Debug)]
pub enum LedError {
    /// mode 超出 0..=5。
    InvalidMode(u8),
    /// 底层 HID 写入/打开失败。
    #[allow(dead_code)] // 仅 macOS 设备层构造
    Device(String),
}

impl std::fmt::Display for LedError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            // 文案对齐 codepass,便于跨实现核对
            LedError::InvalidMode(mode) => write!(f, "invalid LED mode '{mode}'. Use 0...5"),
            LedError::Device(msg) => write!(f, "hid device error: {msg}"),
        }
    }
}

impl std::error::Error for LedError {}

#[cfg(target_os = "macos")]
impl From<hidapi::HidError> for LedError {
    fn from(error: hidapi::HidError) -> Self {
        LedError::Device(error.to_string())
    }
}

/// 生成「设置包 + 提交包」两包 65 字节报文。
///
/// 设置包: `03 fe b0 01 08 00..00 01 00 <0x50+mode> 00..`
/// 提交包: `03 fd fe ff 00..`
/// 顺序:先发设置包,再发提交包。
#[allow(dead_code)] // 非 macOS 平台仅协议单测使用,运行时由 macOS 设备层 apply_mode 调用
pub fn mode_reports(mode: u8) -> Result<[[u8; REPORT_LEN]; 2], LedError> {
    if mode > MAX_MODE {
        return Err(LedError::InvalidMode(mode));
    }

    let mut setup = [0u8; REPORT_LEN];
    setup[0] = REPORT_ID;
    setup[1] = 0xfe;
    setup[2] = 0xb0;
    setup[3] = 0x01;
    setup[4] = 0x08;
    setup[10] = 0x01;
    setup[12] = 0x50 + mode;

    let mut commit = [0u8; REPORT_LEN];
    commit[0] = REPORT_ID;
    commit[1] = 0xfd;
    commit[2] = 0xfe;
    commit[3] = 0xff;

    Ok([setup, commit])
}

/// 会话聚合状态(优先级 waiting > running > idle > none),驱动 LED 灯效选择。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SessionLedState {
    /// 有会话在等待用户输入/确认(🔴)。
    Waiting,
    /// 有会话在运行/启动(🟢)。
    Running,
    /// 有会话但均空闲/已结束(⚪)。
    Idle,
    /// 无任何会话(熄灯)。
    None,
}

impl SessionLedState {
    /// 从托盘 `count_session_states` 的 `(waiting, running, other)` 计数映射,优先级与托盘呼吸灯一致。
    pub fn from_counts(waiting: usize, running: usize, other: usize) -> Self {
        if waiting > 0 {
            SessionLedState::Waiting
        } else if running > 0 {
            SessionLedState::Running
        } else if other > 0 {
            SessionLedState::Idle
        } else {
            SessionLedState::None
        }
    }
}

/// 「会话状态 → 灯效」映射偏好,作为 `AppPreferences.led_control` 持久化。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct LedControlPreferences {
    /// 是否启用 LED 联动(默认关,opt-in)。关闭时不主动驱动设备。
    #[serde(default)]
    pub enabled: bool,
    /// 等待输入时的灯效模式(默认 5 闪烁)。
    #[serde(default = "default_waiting_mode")]
    pub waiting_mode: u8,
    /// 工作中时的灯效模式(默认 1 顺时针)。
    #[serde(default = "default_running_mode")]
    pub running_mode: u8,
    /// 已完成/空闲时的灯效模式(默认 2 逆时针)。
    #[serde(default = "default_idle_mode")]
    pub idle_mode: u8,
}

fn default_waiting_mode() -> u8 {
    5
}
fn default_running_mode() -> u8 {
    1
}
fn default_idle_mode() -> u8 {
    2
}

impl Default for LedControlPreferences {
    fn default() -> Self {
        Self {
            enabled: false,
            waiting_mode: default_waiting_mode(),
            running_mode: default_running_mode(),
            idle_mode: default_idle_mode(),
        }
    }
}

/// LED 运行时共享状态:向 worker 线程发 mode 的 channel + 去重用的上次已下发 mode。
pub struct LedState {
    tx: Mutex<mpsc::Sender<u8>>,
    /// 上次实际下发的 mode;`None` 表示当前未驱动(功能关闭或尚未下发)。
    last: Mutex<Option<u8>>,
}

/// 设备连接探测结果,供设置页展示。
#[derive(Debug, Clone, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct LedProbeStatus {
    pub connected: bool,
}

/// 探测 ANTICATER 设备是否连接(设置页显式调用)。
#[tauri::command]
#[specta::specta]
pub fn led_probe_status() -> LedProbeStatus {
    LedProbeStatus {
        connected: device_connected(),
    }
}

/// 测试某个灯效(设置页「测试」按钮 / 真机验证门)。立即下发,不受 enabled 影响。
#[tauri::command]
#[specta::specta]
pub fn led_test_mode(
    state: tauri::State<'_, LedState>,
    mode: u8,
) -> Result<(), crate::error::CommandError> {
    if mode > MAX_MODE {
        return Err(LedError::InvalidMode(mode).to_string().into());
    }
    // 测试只是临时预览:清空去重状态,下次会话状态评估会重新下发会话灯效。
    if let Ok(mut last) = state.last.lock() {
        *last = None;
    }
    state
        .tx
        .lock()
        .map_err(|_| "LED 通道锁中毒".to_string())?
        .send(mode)
        .map_err(|error| format!("LED worker 已退出: {error}"))?;
    Ok(())
}

/// 启动 LED 运行时:spawn worker 线程,注册 `LedState`,并按当前会话状态点亮一次。
/// 在 `lib.rs::setup` 中 usage runtime 之后调用一次。
pub fn start_led_runtime(app: &tauri::App) {
    let (tx, rx) = mpsc::channel::<u8>();
    let spawn_result = std::thread::Builder::new()
        .name("led-worker".to_string())
        .spawn(move || worker_loop(rx));
    if let Err(error) = spawn_result {
        // LED 是增强功能,线程创建失败不影响主流程,只记日志(不注册 State,命令将优雅降级)。
        log::warn!("event=led.runtime status=err reason=thread_failed error={error}");
        return;
    }

    app.manage(LedState {
        tx: Mutex::new(tx),
        last: Mutex::new(None),
    });

    // 启动时立即按当前会话状态评估一次(如已有 waiting 会话则立刻点亮)。
    on_session_state_changed(app.handle(), crate::tray::current_session_led_state());
}

/// 会话聚合状态变化时调用(托盘 `rebuild_sessions_tray` 与启动初始同步)。
/// 每次都读最新偏好(改设置即时生效),按映射解析目标 mode,去重后下发。
pub fn on_session_state_changed(app: &AppHandle, state: SessionLedState) {
    let Some(led_state) = app.try_state::<LedState>() else {
        return;
    };
    let led_state = led_state.inner();
    let prefs = crate::config::load_app_preferences().led_control;

    let Ok(mut last) = led_state.last.lock() else {
        return;
    };

    if !prefs.enabled {
        // 功能关闭:若之前在驱动,主动熄灯一次干净交还设备;否则完全不碰设备。
        if last.is_some() {
            send_mode(led_state, 0);
            *last = None;
        }
        return;
    }

    let target = match state {
        SessionLedState::Waiting => prefs.waiting_mode,
        SessionLedState::Running => prefs.running_mode,
        SessionLedState::Idle => prefs.idle_mode,
        SessionLedState::None => 0,
    };

    if *last != Some(target) {
        send_mode(led_state, target);
        *last = Some(target);
    }
}

/// 向 worker 线程发一个 mode,发送失败只记日志(worker 已退出属不可恢复但不应 panic)。
fn send_mode(state: &LedState, mode: u8) {
    let Ok(tx) = state.tx.lock() else {
        return;
    };
    if let Err(error) = tx.send(mode) {
        log::warn!("event=led.send status=err mode={mode} error={error}");
    }
}

// ── 设备层:macOS 走 hidapi,其它平台优雅降级 ──

#[cfg(target_os = "macos")]
fn worker_loop(rx: mpsc::Receiver<u8>) {
    let mut api: Option<HidApi> = None;
    let mut device: Option<HidDevice> = None;

    while let Ok(mode) = rx.recv() {
        // 惰性初始化 hidapi(创建较重,只做一次)。
        if api.is_none() {
            match HidApi::new() {
                Ok(handle) => api = Some(handle),
                Err(error) => {
                    log::warn!("event=led.hidapi status=err error={error}");
                    continue;
                }
            }
        }
        // 上方已确保初始化；防御性兜底：意外为 None 时跳过本周期而非 panic 让 worker 永久失效
        let Some(api_ref) = api.as_mut() else {
            continue;
        };

        // 设备未打开时(首次或拔出后)刷新枚举并重连。
        if device.is_none() {
            let _ = api_ref.refresh_devices();
            device = open_vendor_device(api_ref);
        }

        match device.as_ref() {
            Some(handle) => match apply_mode(handle, mode) {
                Ok(()) => log::info!("event=led.apply status=ok mode={mode}"),
                Err(error) => {
                    // 写失败(多半是拔出):丢弃句柄,下次消息重连。
                    log::warn!("event=led.apply status=err mode={mode} error={error}");
                    device = None;
                }
            },
            None => {
                log::warn!("event=led.apply status=skip reason=device_not_found mode={mode}");
            }
        }
    }
}

#[cfg(not(target_os = "macos"))]
fn worker_loop(rx: mpsc::Receiver<u8>) {
    // 非 macOS 暂不支持设备访问,消费消息避免发送端阻塞,只记日志。
    while let Ok(mode) = rx.recv() {
        log::warn!("event=led.apply status=skip reason=unsupported_platform mode={mode}");
    }
}

/// 按 vendor_id/product_id/usage_page/usage 四项匹配,从复合设备里挑出 vendor 接口并打开。
#[cfg(target_os = "macos")]
fn open_vendor_device(api: &HidApi) -> Option<HidDevice> {
    let info = api.device_list().find(|device| {
        device.vendor_id() == VENDOR_ID
            && device.product_id() == PRODUCT_ID
            && device.usage_page() == USAGE_PAGE
            && device.usage() == USAGE
    })?;
    match info.open_device(api) {
        Ok(handle) => Some(handle),
        Err(error) => {
            log::warn!("event=led.open status=err error={error}");
            None
        }
    }
}

/// 依次写设置包、提交包。hidapi 把 buffer 首字节当 report id,正好对应 0x03。
#[cfg(target_os = "macos")]
fn apply_mode(device: &HidDevice, mode: u8) -> Result<(), LedError> {
    let reports = mode_reports(mode)?;
    for report in &reports {
        device.write(report.as_slice())?;
    }
    Ok(())
}

#[cfg(target_os = "macos")]
fn device_connected() -> bool {
    match HidApi::new() {
        Ok(api) => api.device_list().any(|device| {
            device.vendor_id() == VENDOR_ID
                && device.product_id() == PRODUCT_ID
                && device.usage_page() == USAGE_PAGE
                && device.usage() == USAGE
        }),
        Err(_) => false,
    }
}

#[cfg(not(target_os = "macos"))]
fn device_connected() -> bool {
    false
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mode_reports_match_official_save_packet() {
        let reports = mode_reports(1).unwrap();
        assert_eq!(reports.len(), 2);
        assert!(reports.iter().all(|report| report.len() == 65));
        // 设置包前 13 字节,[12]=0x50+1=0x51
        assert_eq!(
            &reports[0][..13],
            &[0x03, 0xfe, 0xb0, 0x01, 0x08, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x51]
        );
        assert!(reports[0][13..].iter().all(|&byte| byte == 0));
        // 提交包前 4 字节固定,其余补 0
        assert_eq!(&reports[1][..4], &[0x03, 0xfd, 0xfe, 0xff]);
        assert!(reports[1][4..].iter().all(|&byte| byte == 0));
    }

    #[test]
    fn mode_byte_is_0x50_plus_mode() {
        for mode in 0..=MAX_MODE {
            assert_eq!(mode_reports(mode).unwrap()[0][12], 0x50 + mode);
        }
    }

    #[test]
    fn invalid_mode_rejected() {
        let error = mode_reports(6).unwrap_err();
        assert_eq!(error.to_string(), "invalid LED mode '6'. Use 0...5");
        assert!(matches!(error, LedError::InvalidMode(6)));
    }

    #[test]
    fn aggregate_priority_waiting_over_running_over_idle() {
        assert_eq!(
            SessionLedState::from_counts(1, 2, 3),
            SessionLedState::Waiting
        );
        assert_eq!(
            SessionLedState::from_counts(0, 2, 3),
            SessionLedState::Running
        );
        assert_eq!(SessionLedState::from_counts(0, 0, 3), SessionLedState::Idle);
        assert_eq!(SessionLedState::from_counts(0, 0, 0), SessionLedState::None);
    }

    #[test]
    fn default_led_control_is_disabled_with_distinct_modes() {
        let prefs = LedControlPreferences::default();
        assert!(!prefs.enabled);
        assert_eq!(
            (prefs.waiting_mode, prefs.running_mode, prefs.idle_mode),
            (5, 1, 2)
        );
    }
}
