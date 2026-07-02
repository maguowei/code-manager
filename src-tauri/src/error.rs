use serde::Serialize;
use std::collections::BTreeMap;
use std::fmt;
use std::ops::Deref;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum CommandErrorCode {
    InvalidInput,
    NotFound,
    AlreadyExists,
    Conflict,
    Unsupported,
    PermissionDenied,
    AuthenticationFailed,
    NetworkFailed,
    Timeout,
    ExternalCommandFailed,
    IoFailed,
    InvalidData,
    Internal,
}

#[derive(Debug, Clone, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct CommandError {
    pub code: CommandErrorCode,
    pub args: BTreeMap<String, String>,
    #[serde(skip)]
    #[specta(skip)]
    internal_message: String,
}

impl CommandError {
    pub fn new(code: CommandErrorCode, internal_message: impl Into<String>) -> Self {
        Self {
            code,
            args: BTreeMap::new(),
            internal_message: internal_message.into(),
        }
    }

    fn classify(message: &str) -> CommandErrorCode {
        let normalized = message.to_lowercase();
        let contains_any =
            |patterns: &[&str]| patterns.iter().any(|item| normalized.contains(item));

        if contains_any(&["timeout", "timed out", "超时"]) {
            CommandErrorCode::Timeout
        } else if contains_any(&[
            "authentication",
            "unauthorized",
            "invalid token",
            "认证失败",
            "鉴权失败",
        ]) {
            CommandErrorCode::AuthenticationFailed
        } else if contains_any(&[
            "permission denied",
            "operation not permitted",
            "权限不足",
            "无权限",
        ]) {
            CommandErrorCode::PermissionDenied
        } else if contains_any(&[
            "network",
            "connection refused",
            "connection reset",
            "dns",
            "网络",
            "连接失败",
        ]) {
            CommandErrorCode::NetworkFailed
        } else if contains_any(&["already exists", "已存在"]) {
            CommandErrorCode::AlreadyExists
        } else if contains_any(&["not found", "no such file", "不存在", "未找到"]) {
            CommandErrorCode::NotFound
        } else if contains_any(&["unsupported", "not supported", "不支持"]) {
            CommandErrorCode::Unsupported
        } else if contains_any(&["conflict", "冲突", "已被修改"]) {
            CommandErrorCode::Conflict
        } else if contains_any(&[
            "invalid json",
            "parse json",
            "schema",
            "解析 json",
            "格式错误",
            "数据无效",
        ]) {
            CommandErrorCode::InvalidData
        } else if contains_any(&[
            "不能为空",
            "必须",
            "invalid input",
            "invalid path",
            "非法",
            "超出范围",
        ]) {
            CommandErrorCode::InvalidInput
        } else if contains_any(&[
            "external command",
            "command failed",
            "process exited",
            "osascript",
            "外部命令",
            "命令执行失败",
        ]) {
            CommandErrorCode::ExternalCommandFailed
        } else if contains_any(&[
            "io error",
            "failed to read",
            "failed to write",
            "读取文件失败",
            "写入文件失败",
            "创建目录失败",
        ]) {
            CommandErrorCode::IoFailed
        } else {
            CommandErrorCode::Internal
        }
    }
}

impl From<String> for CommandError {
    fn from(message: String) -> Self {
        let code = Self::classify(&message);
        let safe_message = crate::logging::redact_sensitive_message(&message);
        log::error!(
            "event=ipc.command_error code={code:?} error={}",
            crate::utils::truncate(&safe_message, 500)
        );
        Self::new(code, message)
    }
}

impl From<&str> for CommandError {
    fn from(message: &str) -> Self {
        message.to_string().into()
    }
}

impl fmt::Display for CommandError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(&self.internal_message)
    }
}

impl std::error::Error for CommandError {}

impl PartialEq<&str> for CommandError {
    fn eq(&self, other: &&str) -> bool {
        self.internal_message == *other
    }
}

impl Deref for CommandError {
    type Target = str;

    fn deref(&self) -> &Self::Target {
        &self.internal_message
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn command_error_serializes_only_safe_contract_fields() {
        let error = CommandError::from("项目目录不存在: /private/example".to_string());

        assert_eq!(error.code, CommandErrorCode::NotFound);
        assert_eq!(
            serde_json::to_value(&error).unwrap(),
            serde_json::json!({ "code": "notFound", "args": {} })
        );
        assert!(error.to_string().contains("/private/example"));
    }

    #[test]
    fn command_error_classifies_stable_failure_categories() {
        assert_eq!(
            CommandError::from("输入不能为空".to_string()).code,
            CommandErrorCode::InvalidInput
        );
        assert_eq!(
            CommandError::from("operation timed out".to_string()).code,
            CommandErrorCode::Timeout
        );
        assert_eq!(
            CommandError::from("unexpected invariant".to_string()).code,
            CommandErrorCode::Internal
        );
    }
}
