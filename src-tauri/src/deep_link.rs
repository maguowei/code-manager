//! 深度链接：配置导入（`code-manager://profiles/import`）。
//!
//! 契约见 `docs/adr/0003-deeplink-profile-import.md` 与 `CONTEXT.md`。

use std::collections::VecDeque;
use std::net::{IpAddr, SocketAddr, ToSocketAddrs};
use std::sync::Mutex;
use std::time::Duration;

use base64::engine::general_purpose::{URL_SAFE, URL_SAFE_NO_PAD};
use base64::Engine;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{AppHandle, Emitter, Manager, State};
use url::Url;

/// 与前端 / 系统协议处理器约定的 scheme。
pub const DEEP_LINK_SCHEME: &str = "code-manager";
/// 配置导入动作 path（不含前导 `/` 的规范化形式为 `profiles/import`）。
pub const PROFILE_IMPORT_PATH: &str = "profiles/import";
/// 内嵌 payload 解码后硬上限（字节）。
pub const MAX_PAYLOAD_DECODED_BYTES: usize = 16 * 1024;
/// 远端响应体上限。
pub const MAX_REMOTE_BODY_BYTES: usize = 256 * 1024;
/// 远端 HTTPS 最大跳转次数。
pub const MAX_REMOTE_REDIRECTS: usize = 3;
/// 远端拉取超时。
pub const REMOTE_FETCH_TIMEOUT: Duration = Duration::from_secs(10);

const EVENT_PROFILE_IMPORT_DEEP_LINK: &str = "profile-import-deep-link";

/// 冷启动时前端尚未订阅事件，先入队；前端 `drain` 与热事件合并处理。
#[derive(Default)]
pub struct PendingProfileImportDeepLinks {
    urls: Mutex<VecDeque<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ResolvedProfileImportDeepLink {
    /// 预填名称（query 或默认值）。
    pub name: String,
    /// 预填描述。
    pub description: String,
    /// 校验后的 settings 美化 JSON，供预览与入库。
    pub settings_json: String,
    /// 是否含非空认证类敏感字段。
    pub contains_secrets: bool,
    /// `payload` 或 `url`。
    pub source: String,
}

/// 解析配置导入 deep link（含远端拉取 / payload 解码与 schema 校验）。
#[tauri::command]
#[specta::specta]
pub async fn resolve_profile_import_deep_link(
    url: String,
) -> Result<ResolvedProfileImportDeepLink, String> {
    let parsed = parse_profile_import_deep_link(&url)?;
    let source_label = match &parsed.source {
        ProfileImportSource::Payload(_) => "payload",
        ProfileImportSource::RemoteUrl(_) => "url",
    }
    .to_string();
    let settings = match parsed.source {
        ProfileImportSource::Payload(payload) => {
            let raw = decode_payload(&payload)?;
            crate::config::parse_and_validate_import_content(&raw)?
        }
        ProfileImportSource::RemoteUrl(remote) => {
            let raw = fetch_remote_settings_json(&remote).await?;
            crate::config::parse_and_validate_import_content(&raw)?
        }
    };
    let settings_json =
        serde_json::to_string_pretty(&settings).map_err(|error| error.to_string())?;
    let contains_secrets = settings_contain_secrets(&settings);
    Ok(ResolvedProfileImportDeepLink {
        name: parsed.name,
        description: parsed.description,
        settings_json,
        contains_secrets,
        source: source_label,
    })
}

/// 从配置导出内容生成内嵌载荷 deep link（默认路径 A）。
#[tauri::command]
#[specta::specta]
pub fn build_profile_import_deep_link(id: String, include_secrets: bool) -> Result<String, String> {
    let registry = crate::config::load_registry()?;
    let profile = registry
        .profiles
        .iter()
        .find(|profile| profile.id == id)
        .ok_or_else(|| format!("未找到 profile '{}'", id))?;
    let export_json = crate::config::build_profile_export_public(&registry, &id, include_secrets)?;
    if export_json.len() > MAX_PAYLOAD_DECODED_BYTES {
        return Err(format!(
            "导出内容超过内嵌载荷上限 {} 字节，请改用文件导出或托管后使用 url= 链接",
            MAX_PAYLOAD_DECODED_BYTES
        ));
    }
    // 校验导出 JSON 仍是合法 settings（含密钥时同样走 schema）
    let _ = crate::config::parse_and_validate_import_content(&export_json)?;
    let payload = URL_SAFE_NO_PAD.encode(export_json.as_bytes());
    // 使用 host+path 形态，与系统/浏览器打开自定义 scheme 时的常见解析一致
    let mut url = Url::parse(&format!("{DEEP_LINK_SCHEME}://profiles/import"))
        .map_err(|error| format!("构造 deep link 失败: {error}"))?;
    {
        let mut pairs = url.query_pairs_mut();
        pairs.append_pair("payload", &payload);
        if !profile.name.trim().is_empty() {
            pairs.append_pair("name", profile.name.trim());
        }
        if !profile.description.trim().is_empty() {
            pairs.append_pair("description", profile.description.trim());
        }
    }
    Ok(url.into())
}

/// 取出冷启动积压的配置导入 deep link（取出后清空）。
#[tauri::command]
#[specta::specta]
pub fn drain_pending_profile_import_deep_links(
    pending: State<'_, PendingProfileImportDeepLinks>,
) -> Result<Vec<String>, String> {
    let mut guard = pending
        .urls
        .lock()
        .map_err(|_| "深度链接队列锁异常".to_string())?;
    Ok(guard.drain(..).collect())
}

/// 注册 deep-link 监听与 pending 队列；在 setup 中调用。
pub fn setup_deep_link_handlers(app: &AppHandle) -> Result<(), String> {
    app.manage(PendingProfileImportDeepLinks::default());

    use tauri_plugin_deep_link::DeepLinkExt;

    // Linux/Windows 开发态与 AppImage 需运行时注册；macOS 仅打包安装后生效
    #[cfg(any(windows, target_os = "linux"))]
    {
        if let Err(error) = app.deep_link().register_all() {
            log::warn!("event=deep_link.register_all status=err error={error}");
        }
    }

    let handle = app.clone();
    app.deep_link().on_open_url(move |event| {
        let urls: Vec<String> = event.urls().iter().map(|url| url.to_string()).collect();
        for url in urls {
            enqueue_profile_import_deep_link(&handle, url);
        }
    });

    // 冷启动：get_current 可能已有 URL
    match app.deep_link().get_current() {
        Ok(Some(urls)) => {
            for url in urls {
                enqueue_profile_import_deep_link(app, url.to_string());
            }
        }
        Ok(None) => {}
        Err(error) => {
            log::warn!("event=deep_link.get_current status=err error={error}");
        }
    }

    Ok(())
}

fn enqueue_profile_import_deep_link(app: &AppHandle, url: String) {
    if !url_looks_like_profile_import(&url) {
        log::warn!("event=deep_link.enqueue status=skip reason=unsupported_url");
        return;
    }
    log::info!("event=deep_link.enqueue status=ok action=profiles.import");
    // 唯一事实源是 pending 队列；事件仅唤醒前端 drain，避免「事件 + 队列」双投递
    if let Some(pending) = app.try_state::<PendingProfileImportDeepLinks>() {
        if let Ok(mut guard) = pending.urls.lock() {
            if guard.back() != Some(&url) {
                guard.push_back(url);
            }
        }
    }
    let _ = app.emit(EVENT_PROFILE_IMPORT_DEEP_LINK, ());
    crate::tray::show_main_window(app);
}

fn url_looks_like_profile_import(raw: &str) -> bool {
    Url::parse(raw)
        .map(|url| {
            url.scheme() == DEEP_LINK_SCHEME && deep_link_action_path(&url) == PROFILE_IMPORT_PATH
        })
        .unwrap_or(false)
}

#[derive(Debug)]
enum ProfileImportSource {
    Payload(String),
    RemoteUrl(String),
}

#[derive(Debug)]
struct ParsedProfileImportDeepLink {
    source: ProfileImportSource,
    name: String,
    description: String,
}

fn parse_profile_import_deep_link(raw: &str) -> Result<ParsedProfileImportDeepLink, String> {
    let url = Url::parse(raw).map_err(|error| format!("无效的深度链接: {error}"))?;
    if url.scheme() != DEEP_LINK_SCHEME {
        return Err(format!(
            "不支持的 scheme '{}', 期望 '{}'",
            url.scheme(),
            DEEP_LINK_SCHEME
        ));
    }
    let action = deep_link_action_path(&url);
    if action != PROFILE_IMPORT_PATH {
        return Err(format!(
            "不支持的 deep link 路径 '{}', 期望 '{PROFILE_IMPORT_PATH}'",
            action
        ));
    }

    let mut payload: Option<String> = None;
    let mut remote_url: Option<String> = None;
    let mut name = String::new();
    let mut description = String::new();

    for (key, value) in url.query_pairs() {
        match key.as_ref() {
            "payload" => payload = Some(value.into_owned()),
            "url" => remote_url = Some(value.into_owned()),
            "name" => name = value.into_owned(),
            "description" => description = value.into_owned(),
            _ => {}
        }
    }

    let source = match (payload, remote_url) {
        (Some(payload), None) => ProfileImportSource::Payload(payload),
        (None, Some(remote)) => ProfileImportSource::RemoteUrl(remote),
        (None, None) => {
            return Err("配置导入链接缺少 payload 或 url 参数".to_string());
        }
        (Some(_), Some(_)) => {
            return Err("配置导入链接不能同时包含 payload 与 url".to_string());
        }
    };

    if name.trim().is_empty() {
        name = "Imported Profile".to_string();
    }

    Ok(ParsedProfileImportDeepLink {
        source,
        name: name.trim().to_string(),
        description: description.trim().to_string(),
    })
}

/// 自定义 scheme 下 `code-manager://profiles/import` 的 host 是 `profiles`、path 是 `/import`，
/// 拼成动作路径 `profiles/import`；也兼容 `code-manager:///profiles/import`。
fn deep_link_action_path(url: &Url) -> String {
    let host = url.host_str().unwrap_or("").trim_matches('/');
    let path = url.path().trim_matches('/');
    match (host.is_empty(), path.is_empty()) {
        (true, true) => String::new(),
        (true, false) => path.to_string(),
        (false, true) => host.to_string(),
        (false, false) => format!("{host}/{path}"),
    }
}

fn decode_payload(payload: &str) -> Result<String, String> {
    let trimmed = payload.trim();
    if trimmed.is_empty() {
        return Err("payload 为空".to_string());
    }
    let bytes = URL_SAFE_NO_PAD
        .decode(trimmed)
        .or_else(|_| URL_SAFE.decode(trimmed))
        .map_err(|error| format!("payload base64url 解码失败: {error}"))?;
    if bytes.len() > MAX_PAYLOAD_DECODED_BYTES {
        return Err(format!(
            "payload 解码后超过 {} 字节上限",
            MAX_PAYLOAD_DECODED_BYTES
        ));
    }
    String::from_utf8(bytes).map_err(|error| format!("payload 不是合法 UTF-8: {error}"))
}

fn settings_contain_secrets(value: &Value) -> bool {
    match value {
        Value::Object(object) => {
            for (key, child) in object {
                if crate::config::is_sensitive_settings_key(key) {
                    if let Value::String(text) = child {
                        if !text.trim().is_empty() {
                            return true;
                        }
                    } else if !child.is_null() {
                        return true;
                    }
                } else if settings_contain_secrets(child) {
                    return true;
                }
            }
            false
        }
        Value::Array(items) => items.iter().any(settings_contain_secrets),
        _ => false,
    }
}

async fn fetch_remote_settings_json(remote: &str) -> Result<String, String> {
    let mut current = validate_https_url_for_fetch(remote)?;
    let client = reqwest::Client::builder()
        .timeout(REMOTE_FETCH_TIMEOUT)
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|error| format!("创建 HTTP 客户端失败: {error}"))?;

    for redirect_count in 0..=MAX_REMOTE_REDIRECTS {
        // 每次请求前解析并拦截私网/环回，降低 DNS rebinding 窗口
        ensure_host_not_blocked(&current)?;

        let response = client
            .get(current.clone())
            .send()
            .await
            .map_err(|error| format!("拉取远端配置失败: {error}"))?;

        let status = response.status();
        if status.is_redirection() {
            if redirect_count == MAX_REMOTE_REDIRECTS {
                return Err(format!("远端配置跳转超过 {MAX_REMOTE_REDIRECTS} 次上限"));
            }
            let location = response
                .headers()
                .get(reqwest::header::LOCATION)
                .and_then(|value| value.to_str().ok())
                .ok_or_else(|| "远端配置跳转缺少 Location".to_string())?;
            current = resolve_redirect_url(&current, location)?;
            continue;
        }

        if !status.is_success() {
            return Err(format!("拉取远端配置失败: HTTP {status}"));
        }

        let bytes = response
            .bytes()
            .await
            .map_err(|error| format!("读取远端配置失败: {error}"))?;
        if bytes.len() > MAX_REMOTE_BODY_BYTES {
            return Err(format!("远端配置超过 {} 字节上限", MAX_REMOTE_BODY_BYTES));
        }
        return String::from_utf8(bytes.to_vec())
            .map_err(|error| format!("远端配置不是合法 UTF-8: {error}"));
    }

    Err(format!("远端配置跳转超过 {MAX_REMOTE_REDIRECTS} 次上限"))
}

fn validate_https_url_for_fetch(raw: &str) -> Result<Url, String> {
    let url = Url::parse(raw).map_err(|error| format!("无效的远端 URL: {error}"))?;
    if url.scheme() != "https" {
        return Err("远端导入仅支持 HTTPS".to_string());
    }
    if url.username() != "" || url.password().is_some() {
        return Err("远端导入不支持带用户名密码的 URL".to_string());
    }
    if url.host_str().is_none() {
        return Err("远端 URL 缺少主机名".to_string());
    }
    Ok(url)
}

fn resolve_redirect_url(base: &Url, location: &str) -> Result<Url, String> {
    let next = if let Ok(absolute) = Url::parse(location) {
        absolute
    } else {
        base.join(location)
            .map_err(|error| format!("无效的跳转 Location: {error}"))?
    };
    validate_https_url_for_fetch(next.as_str())
}

fn ensure_host_not_blocked(url: &Url) -> Result<(), String> {
    let host = url
        .host_str()
        .ok_or_else(|| "远端 URL 缺少主机名".to_string())?;
    // 字面量 IP
    if let Ok(ip) = host.parse::<IpAddr>() {
        if is_blocked_ip(ip) {
            return Err("远端导入禁止访问内网或本机地址".to_string());
        }
        return Ok(());
    }

    let port = url.port_or_known_default().unwrap_or(443);
    let addrs = (host, port)
        .to_socket_addrs()
        .map_err(|error| format!("解析远端主机失败: {error}"))?;
    let mut saw_any = false;
    for addr in addrs {
        saw_any = true;
        if is_blocked_ip(addr.ip()) {
            return Err("远端导入禁止访问内网或本机地址".to_string());
        }
        // 仅检查 IP，不实际连接
        let _: SocketAddr = addr;
    }
    if !saw_any {
        return Err("远端主机未能解析到任何地址".to_string());
    }
    Ok(())
}

fn is_blocked_ip(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => {
            v4.is_loopback()
                || v4.is_private()
                || v4.is_link_local()
                || v4.is_broadcast()
                || v4.is_unspecified()
                || v4.is_multicast()
                // CGNAT 100.64.0.0/10
                || (v4.octets()[0] == 100 && (v4.octets()[1] & 0xc0) == 64)
                // 文档/基准 198.18.0.0/15、192.0.2.0/24 等一并拦截常见非公网
                || v4.is_documentation()
                || (v4.octets()[0] == 0)
        }
        IpAddr::V6(v6) => {
            v6.is_loopback()
                || v6.is_unique_local()
                || v6.is_unicast_link_local()
                || v6.is_unspecified()
                || v6.is_multicast()
                || v6
                    .to_ipv4_mapped()
                    .is_some_and(|v4| is_blocked_ip(IpAddr::V4(v4)))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn parse_payload_link_accepts_name_description() {
        let settings = br#"{"env":{"ANTHROPIC_BASE_URL":"https://example.com"}}"#;
        let payload = URL_SAFE_NO_PAD.encode(settings);
        let raw =
            format!("code-manager://profiles/import?payload={payload}&name=Demo&description=Note");
        let parsed = parse_profile_import_deep_link(&raw).unwrap();
        assert_eq!(parsed.name, "Demo");
        assert_eq!(parsed.description, "Note");
        assert!(matches!(parsed.source, ProfileImportSource::Payload(_)));
    }

    #[test]
    fn parse_rejects_both_payload_and_url() {
        let err = parse_profile_import_deep_link(
            "code-manager://profiles/import?payload=abc&url=https://example.com/a.json",
        )
        .unwrap_err();
        assert!(err.contains("不能同时"));
    }

    #[test]
    fn parse_rejects_missing_source() {
        let err =
            parse_profile_import_deep_link("code-manager://profiles/import?name=x").unwrap_err();
        assert!(err.contains("缺少"));
    }

    #[test]
    fn decode_payload_enforces_size_limit() {
        let big = "x".repeat(MAX_PAYLOAD_DECODED_BYTES + 1);
        let payload = URL_SAFE_NO_PAD.encode(big.as_bytes());
        let err = decode_payload(&payload).unwrap_err();
        assert!(err.contains("上限"));
    }

    #[test]
    fn decode_payload_accepts_valid_json_bytes() {
        let payload = URL_SAFE_NO_PAD.encode(br#"{"model":"claude"}"#);
        let raw = decode_payload(&payload).unwrap();
        assert!(raw.contains("claude"));
    }

    #[test]
    fn settings_contain_secrets_detects_non_empty_token() {
        let value = json!({
            "env": {
                "ANTHROPIC_AUTH_TOKEN": "secret",
                "ANTHROPIC_BASE_URL": "https://api.example.com"
            }
        });
        assert!(settings_contain_secrets(&value));
    }

    #[test]
    fn settings_contain_secrets_ignores_blank_token() {
        let value = json!({
            "env": {
                "ANTHROPIC_AUTH_TOKEN": "",
                "ANTHROPIC_BASE_URL": "https://api.example.com"
            }
        });
        assert!(!settings_contain_secrets(&value));
    }

    #[test]
    fn validate_https_url_rejects_http_and_credentials() {
        assert!(validate_https_url_for_fetch("http://example.com/a.json").is_err());
        assert!(validate_https_url_for_fetch("https://user:pass@example.com/a.json").is_err());
        assert!(validate_https_url_for_fetch("https://example.com/a.json").is_ok());
    }

    #[test]
    fn is_blocked_ip_catches_private_and_metadata() {
        assert!(is_blocked_ip("127.0.0.1".parse().unwrap()));
        assert!(is_blocked_ip("10.0.0.1".parse().unwrap()));
        assert!(is_blocked_ip("192.168.1.1".parse().unwrap()));
        assert!(is_blocked_ip("169.254.169.254".parse().unwrap()));
        assert!(is_blocked_ip("::1".parse().unwrap()));
        assert!(!is_blocked_ip("1.1.1.1".parse().unwrap()));
    }

    #[test]
    fn url_looks_like_profile_import_filters_other_actions() {
        assert!(url_looks_like_profile_import(
            "code-manager://profiles/import?payload=x"
        ));
        assert!(!url_looks_like_profile_import(
            "code-manager://memory/import?payload=x"
        ));
        assert!(!url_looks_like_profile_import("https://example.com"));
    }
}
