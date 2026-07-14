//! 防止空闲休眠：Claude Code 会话运行时阻止 macOS 进入空闲休眠，避免长任务被系统休眠打断。
//!
//! 边界（见 `docs/adr/0001-sleep-prevention-idle-only-no-privilege.md`）：默认只阻止「系统空闲休眠」
//! (`PreventUserIdleSystemSleep`，放任屏幕熄灭)；用户可选「同时保持屏幕常亮」改用
//! (`PreventUserIdleDisplaySleep`，屏幕连带系统都不熄)。均不提权、不处理合盖，只在盖子开着时有效。
//!
//! 两个正交维度：
//! - 何时（`should_stay_awake`）：由三态模式 + running 会话数决定是否该保持唤醒。
//! - 保持什么（`desired_assertion_kind`）：由 `keep_display_awake` 决定断言类型（仅系统 / 系统+屏幕）。
//!
//! 分层：
//! - 判定层 `should_stay_awake` / `reconcile_action`：纯逻辑，跨平台，有单测。
//! - 设备层（`#[cfg(target_os = "macos")]`）：IOKit 电源断言 `IOPMAssertion`，句柄是整型 assertion id，
//!   天然 `Send + Sync`，进程内持有；非 macOS 全部 no-op。
//! - 运行时 `reconcile`：读最新偏好 + running 会话数，acquire/release/reacquire 使实际持有与期望一致（幂等）。
//! - 驱动入口 `on_session_state_changed`：托盘每次复算会话状态时调用。

use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};

/// 防止休眠状态变化事件名：`active` 翻转（开始/停止保持唤醒）时广播，供设置页实时刷新徽标。
const SLEEP_PREVENTION_CHANGED_EVENT: &str = "sleep-prevention-changed";

/// 防止休眠模式，作为 `AppPreferences.sleep_prevention` 持久化。三态互斥。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum SleepPreventionMode {
    /// 不干预，系统正常休眠（默认）。
    #[default]
    Off,
    /// 仅存在 running 类会话（running/busy/active/starting，waiting 不计入）时保持唤醒。
    WhileActive,
    /// 无条件保持唤醒。
    Always,
}

/// 电源断言范围：仅阻止系统空闲休眠 / 连显示器一起不熄。由 `keep_display_awake` 决定。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum AssertionKind {
    /// 仅阻止系统空闲休眠，放任屏幕熄灭（默认）。
    System,
    /// 阻止显示器空闲休眠，连带系统（屏幕常亮）。
    Display,
}

impl AssertionKind {
    /// 对应的 IOKit 断言类型字符串。
    #[cfg(target_os = "macos")]
    fn assertion_type(self) -> &'static str {
        match self {
            AssertionKind::System => "PreventUserIdleSystemSleep",
            AssertionKind::Display => "PreventUserIdleDisplaySleep",
        }
    }
}

/// 由「屏幕常亮」偏好解析目标断言范围。
fn desired_assertion_kind(keep_display_awake: bool) -> AssertionKind {
    if keep_display_awake {
        AssertionKind::Display
    } else {
        AssertionKind::System
    }
}

/// 防止休眠运行时状态：当前持有的电源断言（句柄 + 范围）；`None` 表示未持有。
/// 句柄是 IOKit 的整型 `IOPMAssertionID`，因此本结构天然 `Send + Sync`，可直接交 Tauri 托管。
#[derive(Default)]
pub struct SleepState {
    assertion: Mutex<Option<(u32, AssertionKind)>>,
}

/// 防止休眠对外状态快照：当前模式 + 此刻是否正持有断言（正在保持唤醒）。供设置页展示。
#[derive(Debug, Clone, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct SleepPreventionStatus {
    /// 当前防止休眠模式。
    pub mode: SleepPreventionMode,
    /// 此刻是否正持有电源断言（true=正在保持唤醒，false=空闲可休眠）。
    pub active: bool,
}

/// 读取当前防止休眠状态（模式 + 是否正在保持唤醒）。设置页挂载时拉一次，之后靠事件增量刷新。
#[tauri::command]
#[specta::specta]
pub fn get_sleep_prevention_status(app: AppHandle) -> SleepPreventionStatus {
    current_status(&app)
}

/// 组装当前状态快照：模式取自偏好，active 取自是否持有断言。
fn current_status(app: &AppHandle) -> SleepPreventionStatus {
    let mode = crate::config::load_app_preferences().sleep_prevention;
    let active = app
        .try_state::<SleepState>()
        .and_then(|state| {
            state
                .inner()
                .assertion
                .lock()
                .ok()
                .map(|held| held.is_some())
        })
        .unwrap_or(false);
    SleepPreventionStatus { mode, active }
}

/// 判定给定模式 + running 会话数下是否应保持唤醒。纯函数，单测锚点。
fn should_stay_awake(mode: SleepPreventionMode, running_count: usize) -> bool {
    match mode {
        SleepPreventionMode::Off => false,
        SleepPreventionMode::Always => true,
        SleepPreventionMode::WhileActive => running_count > 0,
    }
}

/// reconcile 的纯决策：给定「是否该唤醒 + 当前持有范围 + 目标范围」，算出该执行的动作。
#[derive(Debug, PartialEq, Eq)]
enum ReconcileAction {
    /// 无需动作（已一致）。
    None,
    /// 未持有，需按目标范围获取。
    Acquire(AssertionKind),
    /// 已持有但不再需要，释放。
    Release,
    /// 已持有但范围变了，释放旧的再按新范围获取。
    Reacquire(AssertionKind),
}

/// 使实际持有与期望一致的决策函数。纯逻辑，单测锚点。
fn reconcile_action(
    awake: bool,
    held: Option<AssertionKind>,
    desired_kind: AssertionKind,
) -> ReconcileAction {
    match (awake, held) {
        (false, Some(_)) => ReconcileAction::Release,
        (false, None) => ReconcileAction::None,
        (true, None) => ReconcileAction::Acquire(desired_kind),
        (true, Some(kind)) if kind == desired_kind => ReconcileAction::None,
        (true, Some(_)) => ReconcileAction::Reacquire(desired_kind),
    }
}

/// 启动防止休眠运行时：注册 `SleepState`，并按当前偏好 + 会话状态评估一次。
/// 在 `lib.rs::setup` 中 LED runtime 之后调用一次。
pub fn start_sleep_runtime(app: &tauri::App) {
    app.manage(SleepState::default());
    reconcile(app.handle(), crate::tray::current_running_session_count());
}

/// 会话聚合状态变化时调用（托盘 `rebuild_sessions_tray`）。`running_count` 为 running 类会话数。
pub fn on_session_state_changed(app: &AppHandle, running_count: usize) {
    reconcile(app, running_count);
}

/// 偏好变更时调用（`set_app_preferences` / 托盘切换）。按当前会话状态重新评估。
pub fn apply_sleep_preference(app: &AppHandle) {
    reconcile(app, crate::tray::current_running_session_count());
}

/// 应用退出时释放断言（`lib.rs` 的 `RunEvent::ExitRequested` / `RunEvent::Exit`）。幂等。
pub fn release_on_exit(app: &AppHandle) {
    let Some(state) = app.try_state::<SleepState>() else {
        return;
    };
    let state = state.inner();
    if let Ok(mut held) = state.assertion.lock() {
        if let Some((id, _)) = held.take() {
            release_assertion(id);
        }
    }
}

/// 读最新偏好 + running 数，acquire/release 使实际持有与期望一致（幂等，重复调用无副作用）。
fn reconcile(app: &AppHandle, running_count: usize) {
    let Some(state) = app.try_state::<SleepState>() else {
        return;
    };
    let state = state.inner();
    let prefs = crate::config::load_app_preferences();
    let mode = prefs.sleep_prevention;
    let awake = should_stay_awake(mode, running_count);
    let desired_kind = desired_assertion_kind(prefs.keep_display_awake);

    let Ok(mut held) = state.assertion.lock() else {
        return;
    };
    let held_kind = held.as_ref().map(|&(_, kind)| kind);
    match reconcile_action(awake, held_kind, desired_kind) {
        ReconcileAction::None => {}
        ReconcileAction::Acquire(kind) => match acquire_assertion(kind) {
            Some(id) => {
                *held = Some((id, kind));
                log::info!(
                    "event=sleep.assert status=ok mode={mode:?} kind={kind:?} running={running_count}"
                );
                emit_status(app, mode, true);
            }
            None => log::warn!("event=sleep.assert status=err mode={mode:?} kind={kind:?}"),
        },
        ReconcileAction::Release => {
            if let Some((id, _)) = held.take() {
                release_assertion(id);
                log::info!("event=sleep.release status=ok");
                emit_status(app, mode, false);
            }
        }
        ReconcileAction::Reacquire(kind) => {
            // 范围变化（如切换屏幕常亮）：释放旧断言、按新范围重取。active 仍为 true，
            // 徽标范围由前端偏好驱动，无需重复发 active 事件。
            if let Some((old_id, _)) = held.take() {
                release_assertion(old_id);
            }
            match acquire_assertion(kind) {
                Some(id) => {
                    *held = Some((id, kind));
                    log::info!("event=sleep.reacquire status=ok mode={mode:?} kind={kind:?}");
                }
                None => {
                    // 重取失败：旧断言已释放，实际已不再保持唤醒，据实广播 active=false
                    log::warn!("event=sleep.reacquire status=err mode={mode:?} kind={kind:?}");
                    emit_status(app, mode, false);
                }
            }
        }
    }
}

/// 广播状态变化事件，供设置页实时刷新徽标（active 翻转时调用）。
fn emit_status(app: &AppHandle, mode: SleepPreventionMode, active: bool) {
    let _ = app.emit(
        SLEEP_PREVENTION_CHANGED_EVENT,
        SleepPreventionStatus { mode, active },
    );
}

// ── 设备层：macOS 走 IOKit 电源断言，其它平台 no-op ──

#[cfg(target_os = "macos")]
mod ffi {
    use std::os::raw::{c_char, c_void};

    pub type CFTypeRef = *const c_void;
    pub type CFStringRef = *const c_void;
    pub type CFAllocatorRef = *const c_void;
    pub type IOPMAssertionID = u32;
    pub type IOReturn = i32;
    pub type IOPMAssertionLevel = u32;

    /// 断言开启电平。
    pub const IOPM_ASSERTION_LEVEL_ON: IOPMAssertionLevel = 255;
    /// CFString UTF-8 编码常量。
    pub const CF_STRING_ENCODING_UTF8: u32 = 0x0800_0100;
    /// `kIOReturnSuccess`。
    pub const IO_RETURN_SUCCESS: IOReturn = 0;

    #[link(name = "CoreFoundation", kind = "framework")]
    extern "C" {
        pub fn CFStringCreateWithCString(
            alloc: CFAllocatorRef,
            c_str: *const c_char,
            encoding: u32,
        ) -> CFStringRef;
        pub fn CFRelease(cf: CFTypeRef);
    }

    #[link(name = "IOKit", kind = "framework")]
    extern "C" {
        pub fn IOPMAssertionCreateWithName(
            assertion_type: CFStringRef,
            assertion_level: IOPMAssertionLevel,
            assertion_name: CFStringRef,
            assertion_id: *mut IOPMAssertionID,
        ) -> IOReturn;
        pub fn IOPMAssertionRelease(assertion_id: IOPMAssertionID) -> IOReturn;
    }
}

/// 按范围创建一个电源断言，返回其整型句柄。失败返回 `None`。
#[cfg(target_os = "macos")]
fn acquire_assertion(kind: AssertionKind) -> Option<u32> {
    use std::ffi::CString;
    use std::ptr;

    let type_c = CString::new(kind.assertion_type()).ok()?;
    let name_c = CString::new("Code Manager keeping Claude Code sessions awake").ok()?;

    // SAFETY: 两个入参 CFString 由 CFStringCreateWithCString 从合法 nul 结尾字符串创建；分配器传 NULL
    // 表示默认分配器（CF 约定）。创建断言成功后 IOKit 内部保留所需引用，故这里立即 CFRelease 两个
    // CFString，无泄漏。返回的整型句柄由 reconcile/release_on_exit 恰好释放一次。
    unsafe {
        let type_cf = ffi::CFStringCreateWithCString(
            ptr::null(),
            type_c.as_ptr(),
            ffi::CF_STRING_ENCODING_UTF8,
        );
        let name_cf = ffi::CFStringCreateWithCString(
            ptr::null(),
            name_c.as_ptr(),
            ffi::CF_STRING_ENCODING_UTF8,
        );
        if type_cf.is_null() || name_cf.is_null() {
            if !type_cf.is_null() {
                ffi::CFRelease(type_cf);
            }
            if !name_cf.is_null() {
                ffi::CFRelease(name_cf);
            }
            return None;
        }

        let mut id: u32 = 0;
        let ret = ffi::IOPMAssertionCreateWithName(
            type_cf,
            ffi::IOPM_ASSERTION_LEVEL_ON,
            name_cf,
            &mut id,
        );
        ffi::CFRelease(type_cf);
        ffi::CFRelease(name_cf);

        if ret == ffi::IO_RETURN_SUCCESS {
            Some(id)
        } else {
            None
        }
    }
}

/// 释放电源断言。
#[cfg(target_os = "macos")]
fn release_assertion(id: u32) {
    // SAFETY: id 来自成功的 IOPMAssertionCreateWithName；reconcile 用 take() 保证同一句柄只释放一次。
    unsafe {
        let _ = ffi::IOPMAssertionRelease(id);
    }
}

/// 非 macOS 暂不支持阻止休眠：返回占位句柄让状态机正常流转（避免每轮重试），但不产生实际副作用。
#[cfg(not(target_os = "macos"))]
fn acquire_assertion(_kind: AssertionKind) -> Option<u32> {
    log::info!("event=sleep.assert status=skip reason=unsupported_platform");
    Some(0)
}

#[cfg(not(target_os = "macos"))]
fn release_assertion(_id: u32) {}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn off_never_stays_awake() {
        assert!(!should_stay_awake(SleepPreventionMode::Off, 0));
        assert!(!should_stay_awake(SleepPreventionMode::Off, 3));
    }

    #[test]
    fn always_always_stays_awake() {
        assert!(should_stay_awake(SleepPreventionMode::Always, 0));
        assert!(should_stay_awake(SleepPreventionMode::Always, 5));
    }

    #[test]
    fn while_active_tracks_running_count() {
        assert!(!should_stay_awake(SleepPreventionMode::WhileActive, 0));
        assert!(should_stay_awake(SleepPreventionMode::WhileActive, 1));
        assert!(should_stay_awake(SleepPreventionMode::WhileActive, 9));
    }

    #[test]
    fn default_mode_is_off() {
        assert_eq!(SleepPreventionMode::default(), SleepPreventionMode::Off);
    }

    #[test]
    fn desired_kind_follows_keep_display_awake() {
        assert_eq!(desired_assertion_kind(false), AssertionKind::System);
        assert_eq!(desired_assertion_kind(true), AssertionKind::Display);
    }

    #[test]
    fn reconcile_release_when_not_awake_but_held() {
        assert_eq!(
            reconcile_action(false, Some(AssertionKind::System), AssertionKind::System),
            ReconcileAction::Release
        );
    }

    #[test]
    fn reconcile_noop_when_not_awake_and_unheld() {
        assert_eq!(
            reconcile_action(false, None, AssertionKind::Display),
            ReconcileAction::None
        );
    }

    #[test]
    fn reconcile_acquire_when_awake_and_unheld() {
        assert_eq!(
            reconcile_action(true, None, AssertionKind::Display),
            ReconcileAction::Acquire(AssertionKind::Display)
        );
    }

    #[test]
    fn reconcile_noop_when_held_kind_matches() {
        assert_eq!(
            reconcile_action(true, Some(AssertionKind::System), AssertionKind::System),
            ReconcileAction::None
        );
    }

    #[test]
    fn reconcile_reacquire_when_scope_changes_while_awake() {
        // 会话仍在跑但用户切换了屏幕常亮：需换断言类型
        assert_eq!(
            reconcile_action(true, Some(AssertionKind::System), AssertionKind::Display),
            ReconcileAction::Reacquire(AssertionKind::Display)
        );
        assert_eq!(
            reconcile_action(true, Some(AssertionKind::Display), AssertionKind::System),
            ReconcileAction::Reacquire(AssertionKind::System)
        );
    }

    #[test]
    fn mode_serializes_camel_case() {
        assert_eq!(
            serde_json::to_string(&SleepPreventionMode::WhileActive).unwrap(),
            "\"whileActive\""
        );
        assert_eq!(
            serde_json::to_string(&SleepPreventionMode::Off).unwrap(),
            "\"off\""
        );
        assert_eq!(
            serde_json::to_string(&SleepPreventionMode::Always).unwrap(),
            "\"always\""
        );
    }
}
