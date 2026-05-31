use crate::tray::PendingSessionFocusTarget;
use block2::RcBlock;
use objc2::rc::Retained;
use objc2::runtime::{AnyObject, Bool, ProtocolObject};
use objc2::{define_class, msg_send, AnyThread, ClassType, DefinedClass};
use objc2_foundation::{NSDictionary, NSError, NSObject, NSObjectProtocol, NSString};
use objc2_user_notifications::{
    UNAuthorizationOptions, UNMutableNotificationContent, UNNotification,
    UNNotificationDefaultActionIdentifier, UNNotificationPresentationOptions,
    UNNotificationRequest, UNNotificationResponse, UNUserNotificationCenter,
    UNUserNotificationCenterDelegate,
};
use std::collections::BTreeMap;
use std::sync::Once;
use tauri::AppHandle;
use tauri_plugin_notification::NotificationExt;

const PENDING_SESSION_FOCUS_KIND: &str = "pending-session-focus";
const PAYLOAD_KIND: &str = "kind";
const PAYLOAD_SESSION_ID: &str = "session_id";
const PAYLOAD_PID: &str = "pid";
const PAYLOAD_CWD: &str = "cwd";
const PAYLOAD_TERMINAL_APP: &str = "terminal_app";
const NOTIFICATION_THREAD: &str = "pending-session-focus";

static NOTIFICATION_DELEGATE_SETUP: Once = Once::new();

struct NotificationDelegateIvars {
    app_handle: AppHandle,
}

define_class!(
    // SAFETY:
    // - NSObject 没有额外子类化约束。
    // - delegate 被应用生命周期级保留，不实现 Drop。
    #[unsafe(super(NSObject))]
    #[name = "AiManagerNotificationDelegate"]
    #[thread_kind = AnyThread]
    #[ivars = NotificationDelegateIvars]
    struct NotificationDelegate;

    // SAFETY: NSObjectProtocol 没有额外安全约束。
    unsafe impl NSObjectProtocol for NotificationDelegate {}

    // SAFETY: 方法签名与 UNUserNotificationCenterDelegate 定义一致。
    unsafe impl UNUserNotificationCenterDelegate for NotificationDelegate {
        #[unsafe(method(userNotificationCenter:willPresentNotification:withCompletionHandler:))]
        fn user_notification_center_will_present_notification(
            &self,
            _center: &UNUserNotificationCenter,
            _notification: &UNNotification,
            completion_handler: &block2::DynBlock<dyn Fn(UNNotificationPresentationOptions)>,
        ) {
            completion_handler.call((UNNotificationPresentationOptions::Banner
                | UNNotificationPresentationOptions::List
                | UNNotificationPresentationOptions::Sound,));
        }

        #[unsafe(method(userNotificationCenter:didReceiveNotificationResponse:withCompletionHandler:))]
        fn user_notification_center_did_receive_notification_response(
            &self,
            _center: &UNUserNotificationCenter,
            response: &UNNotificationResponse,
            completion_handler: &block2::DynBlock<dyn Fn()>,
        ) {
            let target = pending_session_target_from_response(response);
            completion_handler.call(());

            if let Some(target) = target {
                focus_pending_session_from_notification(self.ivars().app_handle.clone(), target);
            }
        }
    }
);

impl NotificationDelegate {
    fn new(app_handle: AppHandle) -> Retained<Self> {
        let this = Self::alloc().set_ivars(NotificationDelegateIvars { app_handle });
        // SAFETY: NSObject 的 init 签名正确。
        unsafe { msg_send![super(this), init] }
    }
}

pub(crate) fn setup_notification_delegate(app: &tauri::App) {
    let app_handle = app.handle().clone();
    NOTIFICATION_DELEGATE_SETUP.call_once(move || {
        let center = UNUserNotificationCenter::currentNotificationCenter();
        let delegate = NotificationDelegate::new(app_handle);
        center.setDelegate(Some(ProtocolObject::from_ref(&*delegate)));
        request_notification_authorization(&center);

        // UNUserNotificationCenter.delegate 是 weak property，delegate 必须强引用到应用退出。
        let _ = Retained::into_raw(delegate);
        log::info!("event=macos_notification.delegate status=ok");
    });
}

pub(crate) fn show_pending_session_focus_notification(
    app: &AppHandle,
    title: &str,
    body: &str,
    target: &PendingSessionFocusTarget,
) -> Result<(), String> {
    let center = UNUserNotificationCenter::currentNotificationCenter();
    let content = UNMutableNotificationContent::new();
    let title_string = NSString::from_str(title);
    let body_string = NSString::from_str(body);
    let thread_string = NSString::from_str(NOTIFICATION_THREAD);
    content.setTitle(&title_string);
    content.setBody(&body_string);
    content.setThreadIdentifier(&thread_string);

    let user_info = build_pending_session_user_info(target);
    // SAFETY: userInfo 按 Apple API 允许使用字符串字典；这里所有 key/value 都是 NSString。
    unsafe { content.setUserInfo(user_info.cast_unchecked()) };

    let request_id = NSString::from_str(&format!(
        "{}-{}",
        NOTIFICATION_THREAD,
        crate::utils::truncate(&target.session_id, 80)
    ));
    let request = UNNotificationRequest::requestWithIdentifier_content_trigger(
        &request_id,
        content.as_super(),
        None,
    );

    let fallback_app = app.clone();
    let fallback_title = title.to_string();
    let fallback_body = body.to_string();
    let completion = RcBlock::new(move |error: *mut NSError| {
        if error.is_null() {
            return;
        }

        log::warn!("event=tray.pending_session_notify status=err mode=macos_callback");
        if let Err(e) = fallback_app
            .notification()
            .builder()
            .title(&fallback_title)
            .body(&fallback_body)
            .show()
        {
            log::warn!("event=tray.pending_session_notify status=err mode=plain error={e}");
        }
    });

    center.addNotificationRequest_withCompletionHandler(&request, Some(&completion));
    Ok(())
}

pub(crate) fn parse_pending_session_payload(
    fields: &BTreeMap<String, String>,
) -> Option<PendingSessionFocusTarget> {
    if fields.get(PAYLOAD_KIND)? != PENDING_SESSION_FOCUS_KIND {
        return None;
    }

    let pid = fields.get(PAYLOAD_PID)?.parse::<u32>().ok()?;
    let session_id = non_empty_payload_value(fields, PAYLOAD_SESSION_ID)?;
    let cwd = non_empty_payload_value(fields, PAYLOAD_CWD)?;
    let terminal_app = non_empty_payload_value(fields, PAYLOAD_TERMINAL_APP)?;

    Some(PendingSessionFocusTarget {
        pid,
        cwd,
        session_id,
        terminal_app,
    })
}

fn non_empty_payload_value(fields: &BTreeMap<String, String>, key: &str) -> Option<String> {
    fields
        .get(key)
        .map(|value| value.trim())
        .filter(|value| !value.is_empty())
        .map(ToString::to_string)
}

fn build_pending_session_user_info(
    target: &PendingSessionFocusTarget,
) -> Retained<NSDictionary<NSString, NSString>> {
    let keys = [
        NSString::from_str(PAYLOAD_KIND),
        NSString::from_str(PAYLOAD_SESSION_ID),
        NSString::from_str(PAYLOAD_PID),
        NSString::from_str(PAYLOAD_CWD),
        NSString::from_str(PAYLOAD_TERMINAL_APP),
    ];
    let values = [
        NSString::from_str(PENDING_SESSION_FOCUS_KIND),
        NSString::from_str(&target.session_id),
        NSString::from_str(&target.pid.to_string()),
        NSString::from_str(&target.cwd),
        NSString::from_str(&target.terminal_app),
    ];
    let key_refs = keys.iter().map(|key| &**key).collect::<Vec<_>>();
    let value_refs = values.iter().map(|value| &**value).collect::<Vec<_>>();

    NSDictionary::from_slices(&key_refs, &value_refs)
}

fn pending_session_target_from_response(
    response: &UNNotificationResponse,
) -> Option<PendingSessionFocusTarget> {
    let action_identifier = response.actionIdentifier();
    // SAFETY: UNNotificationDefaultActionIdentifier 是 UserNotifications 暴露的静态 NSString。
    let is_default_action =
        unsafe { action_identifier.isEqualToString(UNNotificationDefaultActionIdentifier) };
    if !is_default_action {
        return None;
    }

    let notification = response.notification();
    let request = notification.request();
    let content = request.content();
    let user_info = content.userInfo();
    // SAFETY: 只假定 key 使用 NSString 查询；value 仍按 AnyObject 读取并在下游校验类型。
    let user_info = unsafe { user_info.cast_unchecked::<NSString, AnyObject>() };

    parse_pending_session_payload(&payload_fields_from_user_info(user_info))
}

fn payload_fields_from_user_info(
    user_info: &NSDictionary<NSString, AnyObject>,
) -> BTreeMap<String, String> {
    [
        PAYLOAD_KIND,
        PAYLOAD_SESSION_ID,
        PAYLOAD_PID,
        PAYLOAD_CWD,
        PAYLOAD_TERMINAL_APP,
    ]
    .into_iter()
    .filter_map(|key| {
        let key_string = NSString::from_str(key);
        user_info.objectForKey(&key_string).and_then(|value| {
            value
                .downcast_ref::<NSString>()
                .map(|value| (key.to_string(), value.to_string()))
        })
    })
    .collect()
}

fn request_notification_authorization(center: &UNUserNotificationCenter) {
    let completion = RcBlock::new(|granted: Bool, error: *mut NSError| {
        if !error.is_null() {
            log::warn!("event=macos_notification.authorization status=err");
            return;
        }

        log::info!(
            "event=macos_notification.authorization status=ok granted={}",
            granted.as_bool()
        );
    });
    center.requestAuthorizationWithOptions_completionHandler(
        UNAuthorizationOptions::Alert | UNAuthorizationOptions::Sound,
        &completion,
    );
}

fn focus_pending_session_from_notification(
    app_handle: AppHandle,
    target: PendingSessionFocusTarget,
) {
    let _ = std::thread::Builder::new()
        .name("pending-session-focus".to_string())
        .spawn(move || {
            log::info!(
                "event=tray.pending_session_notify.click status=ok session_id={}",
                crate::utils::truncate(&target.session_id, 80)
            );
            if let Err(failure) = crate::terminal_focus::focus_session_in_terminal(
                target.pid,
                &target.cwd,
                &target.terminal_app,
            ) {
                let prefs = crate::config::load_registry_or_default().app;
                crate::tray::notify_session_focus_failure(
                    &app_handle,
                    &prefs.ui_language,
                    prefs.system_notifications_enabled,
                    &failure,
                );
            }
        });
}

#[cfg(test)]
mod tests {
    use super::*;

    fn payload(fields: &[(&str, &str)]) -> BTreeMap<String, String> {
        fields
            .iter()
            .map(|(key, value)| ((*key).to_string(), (*value).to_string()))
            .collect()
    }

    #[test]
    fn parse_pending_session_payload_restores_focus_target() {
        let fields = payload(&[
            (PAYLOAD_KIND, PENDING_SESSION_FOCUS_KIND),
            (PAYLOAD_SESSION_ID, "session-123"),
            (PAYLOAD_PID, "4242"),
            (PAYLOAD_CWD, "/Users/demo/work/ai-manager"),
            (PAYLOAD_TERMINAL_APP, "ghostty"),
        ]);

        let target = parse_pending_session_payload(&fields).expect("payload should parse");

        assert_eq!(
            target,
            PendingSessionFocusTarget {
                pid: 4242,
                cwd: "/Users/demo/work/ai-manager".to_string(),
                session_id: "session-123".to_string(),
                terminal_app: "ghostty".to_string(),
            }
        );
    }

    #[test]
    fn parse_pending_session_payload_rejects_unknown_kind() {
        let fields = payload(&[
            (PAYLOAD_KIND, "other"),
            (PAYLOAD_SESSION_ID, "session-123"),
            (PAYLOAD_PID, "4242"),
            (PAYLOAD_CWD, "/Users/demo/work/ai-manager"),
            (PAYLOAD_TERMINAL_APP, "ghostty"),
        ]);

        assert!(parse_pending_session_payload(&fields).is_none());
    }

    #[test]
    fn parse_pending_session_payload_rejects_invalid_pid() {
        let fields = payload(&[
            (PAYLOAD_KIND, PENDING_SESSION_FOCUS_KIND),
            (PAYLOAD_SESSION_ID, "session-123"),
            (PAYLOAD_PID, "not-a-pid"),
            (PAYLOAD_CWD, "/Users/demo/work/ai-manager"),
            (PAYLOAD_TERMINAL_APP, "ghostty"),
        ]);

        assert!(parse_pending_session_payload(&fields).is_none());
    }

    #[test]
    fn parse_pending_session_payload_rejects_missing_field() {
        let fields = payload(&[
            (PAYLOAD_KIND, PENDING_SESSION_FOCUS_KIND),
            (PAYLOAD_SESSION_ID, "session-123"),
            (PAYLOAD_PID, "4242"),
            (PAYLOAD_TERMINAL_APP, "ghostty"),
        ]);

        assert!(parse_pending_session_payload(&fields).is_none());
    }
}
