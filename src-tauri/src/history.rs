use once_cell::sync::Lazy;
use regex::Regex;
use serde::Serialize;
use std::fs;
use std::io::{BufRead, BufReader};
use std::path::PathBuf;

/// 用于匹配 "Implement the following plan:" 前缀的常量
const PLAN_PREFIX: &str = "Implement the following plan:";

/// 历史记录读取结果
#[derive(Debug, Serialize, specta::Type)]
pub struct HistoryResult {
    pub content: String,
    pub mtime: u64,
}

/// 获取 history.jsonl 文件路径
fn get_history_path() -> std::path::PathBuf {
    crate::utils::home_dir_or_fallback()
        .join(".claude")
        .join("history.jsonl")
}

fn encoded_project_path(project: &str) -> String {
    project.replace(['/', '\\', '.', ':'], "-")
}

fn validate_session_file_inputs(
    project: &str,
    session_id: &str,
) -> Result<(String, String), String> {
    let project = project.trim();
    let session_id = session_id.trim();
    if project.is_empty() {
        return Err("项目路径不能为空".to_string());
    }
    if project.contains('\0') {
        return Err("项目路径包含非法字符".to_string());
    }
    if session_id.is_empty() {
        return Err("会话 ID 不能为空".to_string());
    }
    if session_id.contains(['/', '\\', '\0']) {
        return Err("会话 ID 包含非法字符".to_string());
    }
    Ok((project.to_string(), session_id.to_string()))
}

fn session_file_path_unchecked(project: &str, session_id: &str) -> PathBuf {
    crate::utils::home_dir_or_fallback()
        .join(".claude")
        .join("projects")
        .join(encoded_project_path(project))
        .join(format!("{}.jsonl", session_id))
}

fn session_file_path(project: &str, session_id: &str) -> Result<PathBuf, String> {
    let (project, session_id) = validate_session_file_inputs(project, session_id)?;
    Ok(session_file_path_unchecked(&project, &session_id))
}

/// 获取文件修改时间（Unix 秒）
fn file_mtime(path: &std::path::Path) -> Result<u64, String> {
    let metadata = fs::metadata(path).map_err(|e| format!("读取文件元数据失败: {}", e))?;
    Ok(crate::utils::metadata_modified_secs(&metadata))
}

/// 读取历史记录文件，返回内容和 mtime；文件不存在时返回空内容
#[tauri::command]
#[specta::specta]
pub fn get_history() -> Result<HistoryResult, String> {
    let path = get_history_path();
    if !path.exists() {
        return Ok(HistoryResult {
            content: String::new(),
            mtime: 0,
        });
    }
    let content = fs::read_to_string(&path).map_err(|e| format!("读取历史文件失败: {}", e))?;
    let mtime = file_mtime(&path)?;
    Ok(HistoryResult { content, mtime })
}

/// 仅当文件有变化时返回新内容，否则返回 None
#[tauri::command]
#[specta::specta]
pub fn get_history_if_changed(last_mtime: u64) -> Result<Option<HistoryResult>, String> {
    let path = get_history_path();
    if !path.exists() {
        return Ok(None);
    }
    let mtime = file_mtime(&path)?;
    if mtime == last_mtime {
        return Ok(None);
    }
    // 返回上面已取得的 mtime（而非重新读取），确保 mtime 不晚于内容读取时刻：
    // 若读取期间有新写入，mtime 偏旧，下次轮询会再次检测到变化并重读（安全侧）
    let content = fs::read_to_string(&path).map_err(|e| format!("读取历史文件失败: {}", e))?;
    Ok(Some(HistoryResult { content, mtime }))
}

/// 对话消息内容块
#[derive(Debug, Serialize, specta::Type)]
#[serde(tag = "type")]
pub enum MessageBlock {
    /// 文本内容
    #[serde(rename = "text")]
    Text { text: String },
    /// 思考过程
    #[serde(rename = "thinking")]
    Thinking { thinking: String },
    /// 工具调用
    #[serde(rename = "tool_use")]
    ToolUse { name: String, input_preview: String },
    /// 工具返回结果
    #[serde(rename = "tool_result")]
    ToolResult { content: String },
    /// 斜杠命令
    #[serde(rename = "command")]
    Command { name: String, args: Option<String> },
    /// 系统信息
    #[serde(rename = "system")]
    System { summary: String },
    /// 图片内容
    #[serde(rename = "image")]
    Image {
        source_type: String,
        media_type: String,
        data: Option<String>,
    },
    /// 计划内容（用户审批的 plan）
    #[serde(rename = "plan")]
    Plan { summary: String, content: String },
}

/// 一条对话消息
#[derive(Debug, Serialize, specta::Type)]
pub struct SessionMessage {
    pub role: String,
    pub blocks: Vec<MessageBlock>,
    pub timestamp: Option<String>,
}

/// 会话详情返回结果
#[derive(Debug, Serialize, specta::Type)]
pub struct SessionDetail {
    pub session_id: String,
    pub project: String,
    pub messages: Vec<SessionMessage>,
}

/// 预编译的 XML 标签正则
static RE_COMMAND_NAME: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"<command-name>([\s\S]*?)</command-name>").unwrap());
static RE_COMMAND_ARGS: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"<command-args>([\s\S]*?)</command-args>").unwrap());
static RE_SYSTEM_REMINDER: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"<system-reminder>([\s\S]*?)</system-reminder>").unwrap());
static RE_LOCAL_CAVEAT: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"<local-command-caveat>[\s\S]*?</local-command-caveat>").unwrap());
static RE_COMMAND_MSG: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"<command-message>[\s\S]*?</command-message>").unwrap());
static RE_ANY_TAG: Lazy<Regex> = Lazy::new(|| Regex::new(r"<[^>]+>").unwrap());

/// 清除噪音 XML 标签，strip_structured=true 时额外移除结构化标签
fn strip_noise_tags(text: &str, strip_structured: bool) -> String {
    let mut s = text.to_string();
    if strip_structured {
        s = RE_COMMAND_NAME.replace_all(&s, "").to_string();
        s = RE_COMMAND_ARGS.replace_all(&s, "").to_string();
        s = RE_SYSTEM_REMINDER.replace_all(&s, "").to_string();
    }
    s = RE_COMMAND_MSG.replace_all(&s, "").to_string();
    s = RE_LOCAL_CAVEAT.replace_all(&s, "").to_string();
    RE_ANY_TAG.replace_all(&s, "").to_string()
}

/// 解析文本中的 XML 标签，提取 command/system 信息，过滤噪音标签
fn parse_text_with_tags(text: &str) -> Vec<MessageBlock> {
    let mut blocks = Vec::new();

    // 1. 提取 command-name
    if let Some(cap) = RE_COMMAND_NAME.captures(text) {
        let name = cap[1].trim().to_string();
        let args = RE_COMMAND_ARGS
            .captures(text)
            .map(|c| c[1].trim().to_string())
            .filter(|s| !s.is_empty());
        blocks.push(MessageBlock::Command { name, args });
    }

    // 2. 提取 system-reminder（可能有多个）
    for cap in RE_SYSTEM_REMINDER.captures_iter(text) {
        let content = cap[1].trim();
        if !content.is_empty() {
            let summary = crate::utils::truncate(content, 80);
            blocks.push(MessageBlock::System { summary });
        }
    }

    // 3. 如果提取了 command 或 system，检查是否还有有意义的剩余文本
    if !blocks.is_empty() {
        let remaining = strip_noise_tags(text, true);
        let remaining = remaining.trim();
        if !remaining.is_empty() {
            // Command 后的剩余内容是 skill 展开的 prompt，不是用户输入
            // 用 System block 折叠展示，避免误认为用户消息
            let has_command = blocks
                .iter()
                .any(|b| matches!(b, MessageBlock::Command { .. }));
            if has_command {
                let summary = crate::utils::truncate(remaining, 200);
                blocks.push(MessageBlock::System { summary });
            } else {
                blocks.push(MessageBlock::Text {
                    text: remaining.to_string(),
                });
            }
        }
        return blocks;
    }

    // 4. 没有匹配到结构化标签 -- 检查是否只有噪音标签
    let cleaned = strip_noise_tags(text, false);
    let cleaned = cleaned.trim();

    if cleaned.is_empty() {
        return blocks;
    }

    // 5. 普通文本，无标签
    blocks.push(MessageBlock::Text {
        text: cleaned.to_string(),
    });
    blocks
}

/// 将 serde_json::Value 的 content 字段解析为 MessageBlock 列表
fn parse_content_blocks(content: &serde_json::Value) -> Vec<MessageBlock> {
    let mut blocks = Vec::new();
    match content {
        serde_json::Value::String(s) if !s.is_empty() => {
            blocks.extend(parse_text_with_tags(s));
        }
        serde_json::Value::String(_) => {}
        serde_json::Value::Array(arr) => {
            for item in arr {
                let block_type = item.get("type").and_then(|t| t.as_str()).unwrap_or("");
                match block_type {
                    "text" => {
                        if let Some(text) = item.get("text").and_then(|t| t.as_str()) {
                            if !text.is_empty() {
                                blocks.extend(parse_text_with_tags(text));
                            }
                        }
                    }
                    "thinking" => {
                        if let Some(text) = item.get("thinking").and_then(|t| t.as_str()) {
                            if !text.is_empty() {
                                blocks.push(MessageBlock::Thinking {
                                    thinking: text.to_string(),
                                });
                            }
                        }
                    }
                    "tool_use" => {
                        let name = item
                            .get("name")
                            .and_then(|n| n.as_str())
                            .unwrap_or("unknown")
                            .to_string();
                        let input_preview = item
                            .get("input")
                            .map(|v| {
                                serde_json::to_string_pretty(v).unwrap_or_else(|_| v.to_string())
                            })
                            .unwrap_or_default();
                        blocks.push(MessageBlock::ToolUse {
                            name,
                            input_preview,
                        });
                    }
                    "tool_result" => {
                        let content = item
                            .get("content")
                            .map(|v| {
                                if let Some(s) = v.as_str() {
                                    // content 是字符串，直接使用
                                    s.to_string()
                                } else if let Some(arr) = v.as_array() {
                                    // content 是数组（如 [{"type":"text","text":"..."}]），提取所有 text 字段
                                    arr.iter()
                                        .filter_map(|item| {
                                            item.get("text").and_then(|t| t.as_str())
                                        })
                                        .collect::<Vec<_>>()
                                        .join("\n")
                                } else {
                                    // 其他类型忽略
                                    String::new()
                                }
                            })
                            .unwrap_or_default();
                        // 过滤 system-reminder 标签内容
                        let content = RE_SYSTEM_REMINDER
                            .replace_all(&content, "")
                            .trim()
                            .to_string();
                        if !content.is_empty() {
                            blocks.push(MessageBlock::ToolResult { content });
                        }
                    }
                    "image" => {
                        let source = item.get("source");
                        let source_type = source
                            .and_then(|s| s.get("type"))
                            .and_then(|t| t.as_str())
                            .unwrap_or("unknown")
                            .to_string();
                        let media_type = source
                            .and_then(|s| s.get("media_type"))
                            .and_then(|t| t.as_str())
                            .unwrap_or("unknown")
                            .to_string();
                        let data = source
                            .and_then(|s| s.get("data"))
                            .and_then(|d| d.as_str())
                            .map(|s| s.to_string());
                        blocks.push(MessageBlock::Image {
                            source_type,
                            media_type,
                            data,
                        });
                    }
                    _ => {
                        // 忽略未知类型
                    }
                }
            }
        }
        _ => {}
    }
    blocks
}

/// 获取指定 session 的完整对话记录
#[tauri::command]
#[specta::specta]
pub fn get_session_detail(project: &str, session_id: &str) -> Result<SessionDetail, String> {
    // 必须走 validate 路径，防止 session_id 携带 `../` 等片段穿出 projects 目录
    let session_file = session_file_path(project, session_id)?;

    // 文件不存在时返回空 messages（保留旧契约）；统一在 open() 中处理避免 TOCTOU
    let file = match fs::File::open(&session_file) {
        Ok(f) => f,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            return Ok(SessionDetail {
                session_id: session_id.to_string(),
                project: project.to_string(),
                messages: Vec::new(),
            });
        }
        Err(e) => return Err(format!("打开会话文件失败: {}", e)),
    };
    // 使用 BufReader 流式逐行读取，避免将大文件（含 base64 图片）全量加载到内存
    let reader = BufReader::new(file);

    let mut messages: Vec<SessionMessage> = Vec::new();
    for line_result in reader.lines() {
        let line = match line_result {
            Ok(l) => l,
            Err(_) => continue,
        };
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        let record: serde_json::Value = match serde_json::from_str(trimmed) {
            Ok(v) => v,
            Err(_) => continue,
        };

        // 只处理 user 和 assistant 类型
        let msg_type = record.get("type").and_then(|t| t.as_str()).unwrap_or("");
        if msg_type != "user" && msg_type != "assistant" {
            continue;
        }

        // 跳过 sidechain 消息
        if record
            .get("isSidechain")
            .and_then(|v| v.as_bool())
            .unwrap_or(false)
        {
            continue;
        }

        // isMeta 消息（如 skill 展开内容）折叠为 System block，避免误显示为用户输入
        let is_meta = record
            .get("isMeta")
            .and_then(|v| v.as_bool())
            .unwrap_or(false);

        let message = match record.get("message") {
            Some(m) => m,
            None => continue,
        };

        let role = message
            .get("role")
            .and_then(|r| r.as_str())
            .unwrap_or(msg_type)
            .to_string();
        let content_val = message
            .get("content")
            .cloned()
            .unwrap_or(serde_json::Value::Null);
        let mut blocks = parse_content_blocks(&content_val);

        // 如果是 meta 消息，将所有 Text block 替换为 System block（折叠展示）
        if is_meta {
            blocks = blocks
                .into_iter()
                .map(|b| match b {
                    MessageBlock::Text { text } => {
                        let summary = crate::utils::truncate(&text, 200);
                        MessageBlock::System { summary }
                    }
                    other => other,
                })
                .collect();
        }

        // 检测 planContent 字段，将计划内容从用户消息中分离
        if let Some(plan_content) = record
            .get("planContent")
            .and_then(|v| v.as_str())
            .filter(|s| !s.is_empty())
        {
            let plan_content = plan_content.to_string();
            let summary = crate::utils::truncate(&plan_content, 80);

            // 单次遍历：移除/截断包含计划前缀的 text blocks
            blocks.retain_mut(|b| {
                if let MessageBlock::Text { text } = b {
                    let t = text.trim();
                    // 完整匹配计划内容的 block 直接移除
                    if t == PLAN_PREFIX
                        || (t.starts_with(PLAN_PREFIX)
                            && t[PLAN_PREFIX.len()..].trim() == plan_content.trim())
                    {
                        return false;
                    }
                    // 包含计划前缀的 block 截断处理
                    if let Some(pos) = text.find(PLAN_PREFIX) {
                        let before = text[..pos].trim();
                        if before.is_empty() {
                            return false;
                        }
                        *text = before.to_string();
                    }
                }
                true
            });

            blocks.push(MessageBlock::Plan {
                summary,
                content: plan_content,
            });
        }

        // 跳过无内容的消息
        if blocks.is_empty() {
            continue;
        }

        // 若当前 user 消息全部 block 都是 tool_result，合并到上一条 assistant 消息中
        // 这样前端的 tool_use + tool_result 配对逻辑可以正常工作
        let all_tool_results = role == "user"
            && blocks
                .iter()
                .all(|b| matches!(b, MessageBlock::ToolResult { .. }));
        if all_tool_results {
            if let Some(last) = messages.last_mut() {
                if last.role == "assistant" {
                    last.blocks.extend(blocks);
                    continue;
                }
            }
        }

        let timestamp = record
            .get("timestamp")
            .and_then(|t| t.as_str())
            .map(|s| s.to_string());

        messages.push(SessionMessage {
            role,
            blocks,
            timestamp,
        });
    }

    Ok(SessionDetail {
        session_id: session_id.to_string(),
        project: project.to_string(),
        messages,
    })
}

#[tauri::command]
#[specta::specta]
pub fn open_session_file_in_editor(project: &str, session_id: &str) -> Result<(), String> {
    let result = (|| {
        let session_file = session_file_path(project, session_id)?;
        if !session_file.is_file() {
            return Err("原始对话记录文件不存在".to_string());
        }
        let preferences = crate::config::load_app_preferences();
        let editor = preferences
            .default_editor_app
            .as_deref()
            .ok_or_else(|| "请先在设置中选择默认编辑器".to_string())?;
        crate::native_open::open_path_in_editor(&session_file, editor)
    })();
    crate::logging::log_command_result("history.open_session_file_editor", &result, |_| {
        format!(
            "project={} session_id={}",
            crate::utils::truncate(project, 120),
            crate::utils::truncate(session_id, 80)
        )
    });
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::env;
    use std::fs;
    use std::path::Path;
    use std::sync::MutexGuard;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn session_file_path_uses_claude_project_encoding() {
        let path = session_file_path("/Users/demo/project.name", "session-123").unwrap();

        assert!(path.ends_with(Path::new(
            ".claude/projects/-Users-demo-project-name/session-123.jsonl"
        )));

        let windows_path = session_file_path(r"C:\Users\demo\project.name", "session-123").unwrap();

        assert!(windows_path.ends_with(Path::new(
            ".claude/projects/C--Users-demo-project-name/session-123.jsonl"
        )));
    }

    #[test]
    fn session_file_path_rejects_unsafe_session_ids() {
        let err = session_file_path("/Users/demo/project", "../session").unwrap_err();

        assert!(err.contains("会话 ID"));
    }

    #[test]
    fn session_file_path_rejects_empty_project_and_null_chars() {
        // 空项目路径
        let err = session_file_path("   ", "session-1").unwrap_err();
        assert!(err.contains("项目路径"));

        // 项目路径含 NUL 字符
        let err = session_file_path("/Users/demo\0/project", "session-1").unwrap_err();
        assert!(err.contains("项目路径"));

        // 空 session id
        let err = session_file_path("/Users/demo/project", "").unwrap_err();
        assert!(err.contains("会话 ID"));
    }

    #[test]
    fn get_session_detail_rejects_path_escape_session_id() {
        // 防止 session_id 含 `..` 或路径分隔符穿越 projects 目录
        let err = get_session_detail("/Users/demo/project", "../session")
            .expect_err("含 `..` 的 session_id 必须被拒绝");
        assert!(err.contains("会话 ID"));

        let err = get_session_detail("/Users/demo/project", "../../etc/passwd")
            .expect_err("路径穿越的 session_id 必须被拒绝");
        assert!(err.contains("会话 ID"));
    }

    // ─── 隔离测试环境：覆盖 AI_MANAGER_HOME_OVERRIDE 让 get_history_path 指向临时目录 ───

    struct TestEnv {
        _guard: MutexGuard<'static, ()>,
        _config_guard: MutexGuard<'static, ()>,
        root: PathBuf,
        previous_home: Option<String>,
    }

    impl TestEnv {
        fn new(name: &str) -> Self {
            let guard = crate::utils::TEST_ENV_LOCK
                .lock()
                .unwrap_or_else(|error| error.into_inner());
            // 同时获取 config 锁，避免与 config::tests 的 set_test_env 竞态
            let config_guard = crate::utils::lock_config().expect("配置锁应可获取");
            let suffix = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_nanos();
            let root = env::temp_dir().join(format!(
                "ai-manager-history-{name}-{}-{suffix}",
                std::process::id()
            ));
            fs::create_dir_all(root.join(".claude")).expect("应可创建 .claude 目录");

            let previous_home = env::var("AI_MANAGER_HOME_OVERRIDE").ok();
            env::set_var("AI_MANAGER_HOME_OVERRIDE", &root);

            Self {
                _guard: guard,
                _config_guard: config_guard,
                root,
                previous_home,
            }
        }

        fn write_history(&self, content: &str) -> PathBuf {
            let path = self.root.join(".claude").join("history.jsonl");
            fs::write(&path, content).expect("写入 history.jsonl 失败");
            path
        }

        fn write_session(&self, project: &str, session_id: &str, content: &str) -> PathBuf {
            let dir = self
                .root
                .join(".claude")
                .join("projects")
                .join(encoded_project_path(project));
            fs::create_dir_all(&dir).expect("应可创建 project 目录");
            let path = dir.join(format!("{}.jsonl", session_id));
            fs::write(&path, content).expect("写入 session jsonl 失败");
            path
        }
    }

    impl Drop for TestEnv {
        fn drop(&mut self) {
            match &self.previous_home {
                Some(value) => env::set_var("AI_MANAGER_HOME_OVERRIDE", value),
                None => env::remove_var("AI_MANAGER_HOME_OVERRIDE"),
            }
            let _ = fs::remove_dir_all(&self.root);
        }
    }

    // ─── get_history / get_history_if_changed ───

    #[test]
    fn get_history_returns_empty_when_file_missing() {
        let _env = TestEnv::new("get-history-missing");
        let result = get_history().expect("文件不存在时应返回空结果而不是 Err");
        assert_eq!(result.content, "");
        assert_eq!(result.mtime, 0);
    }

    #[test]
    fn get_history_reads_existing_file_content() {
        let env = TestEnv::new("get-history-read");
        env.write_history("line1\nline2\n");

        let result = get_history().expect("get_history 应成功");

        assert_eq!(result.content, "line1\nline2\n");
        assert!(result.mtime > 0, "mtime 应来自真实文件元数据");
    }

    #[test]
    fn get_history_if_changed_returns_none_when_missing() {
        let _env = TestEnv::new("history-changed-missing");
        let result = get_history_if_changed(0).expect("缺文件时应正常返回 None");
        assert!(result.is_none());
    }

    #[test]
    fn get_history_if_changed_returns_none_when_mtime_matches() {
        let env = TestEnv::new("history-changed-same");
        let path = env.write_history("a\n");
        let mtime = file_mtime(&path).unwrap();

        let result = get_history_if_changed(mtime).expect("同 mtime 应返回 None");

        assert!(result.is_none(), "mtime 未变时不应返回新内容");
    }

    #[test]
    fn get_history_if_changed_returns_content_when_mtime_differs() {
        let env = TestEnv::new("history-changed-diff");
        env.write_history("new content\n");

        let result = get_history_if_changed(0)
            .expect("正常调用应成功")
            .expect("mtime 差异应返回新内容");

        assert_eq!(result.content, "new content\n");
        assert!(result.mtime > 0);
    }

    // ─── get_session_detail：恶劣输入与基本路径 ───

    #[test]
    fn get_session_detail_returns_empty_when_session_file_missing() {
        let _env = TestEnv::new("session-missing");
        let detail = get_session_detail("/Users/demo/project", "ghost-session")
            .expect("文件不存在时应返回空 messages 而不是 Err");
        assert!(detail.messages.is_empty());
        assert_eq!(detail.session_id, "ghost-session");
        assert_eq!(detail.project, "/Users/demo/project");
    }

    #[test]
    fn get_session_detail_skips_malformed_and_non_dialog_lines() {
        let env = TestEnv::new("session-malformed");
        // 一行无效 JSON、一行 system 消息、一行无 message 字段、一行 user 文本
        let content = "not-a-json\n\
            {\"type\":\"system\",\"message\":{\"role\":\"system\",\"content\":\"hi\"}}\n\
            {\"type\":\"user\"}\n\
            {\"type\":\"user\",\"message\":{\"role\":\"user\",\"content\":\"hello\"}}\n";
        env.write_session("/p", "s1", content);

        let detail = get_session_detail("/p", "s1").expect("解析不应整体失败");

        assert_eq!(detail.messages.len(), 1, "只保留 1 条有效 user 消息");
        assert_eq!(detail.messages[0].role, "user");
        match &detail.messages[0].blocks[0] {
            MessageBlock::Text { text } => assert_eq!(text, "hello"),
            other => panic!("应为 Text block: {:?}", serde_json::to_string(other).ok()),
        }
    }

    #[test]
    fn get_session_detail_skips_sidechain_messages() {
        let env = TestEnv::new("session-sidechain");
        let content = "{\"type\":\"user\",\"isSidechain\":true,\
            \"message\":{\"role\":\"user\",\"content\":\"skip me\"}}\n";
        env.write_session("/p", "s1", content);

        let detail = get_session_detail("/p", "s1").expect("解析不应失败");
        assert!(detail.messages.is_empty(), "sidechain 消息必须被忽略");
    }

    #[test]
    fn get_session_detail_handles_empty_file() {
        let env = TestEnv::new("session-empty");
        env.write_session("/p", "s1", "");
        let detail = get_session_detail("/p", "s1").expect("空文件应正常处理");
        assert!(detail.messages.is_empty());
    }

    #[test]
    fn get_session_detail_merges_user_tool_result_into_previous_assistant() {
        let env = TestEnv::new("session-tool-result-merge");
        // assistant 调用 tool_use，下一条 user 全是 tool_result，应合并到 assistant
        let content = "{\"type\":\"assistant\",\"message\":{\"role\":\"assistant\",\
            \"content\":[{\"type\":\"tool_use\",\"name\":\"Read\",\"input\":{\"p\":1}}]}}\n\
            {\"type\":\"user\",\"message\":{\"role\":\"user\",\
            \"content\":[{\"type\":\"tool_result\",\"content\":\"file body\"}]}}\n";
        env.write_session("/p", "s1", content);

        let detail = get_session_detail("/p", "s1").expect("解析应成功");

        assert_eq!(
            detail.messages.len(),
            1,
            "tool_result 合并后应只剩 1 条消息"
        );
        assert_eq!(detail.messages[0].role, "assistant");
        assert_eq!(
            detail.messages[0].blocks.len(),
            2,
            "tool_use + tool_result 两个 block"
        );
    }

    #[test]
    fn get_session_detail_folds_is_meta_text_into_system() {
        let env = TestEnv::new("session-meta");
        let content = "{\"type\":\"user\",\"isMeta\":true,\"message\":{\"role\":\"user\",\
            \"content\":\"some meta text\"}}\n";
        env.write_session("/p", "s1", content);

        let detail = get_session_detail("/p", "s1").expect("解析应成功");

        assert_eq!(detail.messages.len(), 1);
        match &detail.messages[0].blocks[0] {
            MessageBlock::System { summary } => assert!(summary.contains("some meta text")),
            other => panic!(
                "isMeta 应折叠为 System: {:?}",
                serde_json::to_string(other).ok()
            ),
        }
    }

    #[test]
    fn get_session_detail_separates_plan_content_from_text() {
        let env = TestEnv::new("session-plan");
        let content = format!(
            "{{\"type\":\"user\",\"planContent\":\"步骤A\\n步骤B\",\"message\":{{\"role\":\"user\",\
            \"content\":\"{} 步骤A\\n步骤B\"}}}}\n",
            PLAN_PREFIX
        );
        env.write_session("/p", "s1", &content);

        let detail = get_session_detail("/p", "s1").expect("解析应成功");

        assert_eq!(detail.messages.len(), 1);
        let blocks = &detail.messages[0].blocks;
        // 应只剩 Plan block，原文本被识别为计划完整匹配并移除
        assert_eq!(
            blocks.len(),
            1,
            "完整匹配的计划文本应被移除，仅留 Plan: {:?}",
            serde_json::to_string(blocks).ok()
        );
        assert!(matches!(&blocks[0], MessageBlock::Plan { .. }));
    }

    // ─── parse_content_blocks 单独覆盖各种 block 类型 ───

    #[test]
    fn parse_content_blocks_handles_thinking_and_tool_use() {
        let value: serde_json::Value = serde_json::from_str(
            r#"[
                {"type":"thinking","thinking":"思考过程"},
                {"type":"tool_use","name":"Bash","input":{"command":"ls"}},
                {"type":"unknown_type","payload":"ignored"}
            ]"#,
        )
        .unwrap();

        let blocks = parse_content_blocks(&value);

        assert_eq!(blocks.len(), 2, "未知类型必须被跳过");
        assert!(
            matches!(&blocks[0], MessageBlock::Thinking { thinking } if thinking == "思考过程")
        );
        assert!(matches!(&blocks[1], MessageBlock::ToolUse { name, .. } if name == "Bash"));
    }

    #[test]
    fn parse_content_blocks_handles_tool_result_string_and_array_shapes() {
        // tool_result.content 既可能是字符串，也可能是 [{type:text,text:...}] 数组
        let str_form: serde_json::Value =
            serde_json::from_str(r#"[{"type":"tool_result","content":"plain text"}]"#).unwrap();
        let arr_form: serde_json::Value = serde_json::from_str(
            r#"[{"type":"tool_result","content":[
                {"type":"text","text":"line1"},
                {"type":"text","text":"line2"}
            ]}]"#,
        )
        .unwrap();

        let str_blocks = parse_content_blocks(&str_form);
        assert!(
            matches!(&str_blocks[0], MessageBlock::ToolResult { content } if content == "plain text")
        );

        let arr_blocks = parse_content_blocks(&arr_form);
        assert!(
            matches!(&arr_blocks[0], MessageBlock::ToolResult { content } if content == "line1\nline2"),
        );
    }

    #[test]
    fn parse_content_blocks_handles_image_payload() {
        let value: serde_json::Value = serde_json::from_str(
            r#"[{"type":"image","source":{"type":"base64","media_type":"image/png","data":"AAAA"}}]"#,
        )
        .unwrap();

        let blocks = parse_content_blocks(&value);

        match &blocks[0] {
            MessageBlock::Image {
                source_type,
                media_type,
                data,
            } => {
                assert_eq!(source_type, "base64");
                assert_eq!(media_type, "image/png");
                assert_eq!(data.as_deref(), Some("AAAA"));
            }
            other => panic!("应为 Image: {:?}", serde_json::to_string(other).ok()),
        }
    }

    #[test]
    fn parse_content_blocks_handles_plain_string() {
        let value = serde_json::Value::String("hello world".into());
        let blocks = parse_content_blocks(&value);
        assert!(matches!(&blocks[0], MessageBlock::Text { text } if text == "hello world"));
    }

    #[test]
    fn parse_content_blocks_returns_empty_for_empty_string_or_null() {
        let empty_str = serde_json::Value::String(String::new());
        assert!(parse_content_blocks(&empty_str).is_empty());

        let null = serde_json::Value::Null;
        assert!(parse_content_blocks(&null).is_empty());
    }

    // ─── parse_text_with_tags / strip_noise_tags ───

    #[test]
    fn parse_text_with_tags_extracts_command_and_drops_skill_expansion_text() {
        let blocks = parse_text_with_tags(
            "<command-name>/foo</command-name><command-args>arg1</command-args>展开后的 skill 内容",
        );

        assert_eq!(blocks.len(), 2, "应同时产出 Command 与折叠后的 System");
        assert!(
            matches!(&blocks[0], MessageBlock::Command { name, args } if name == "/foo" && args.as_deref() == Some("arg1"))
        );
        // 命令后的内容应被折叠为 System，避免误显示为用户输入
        assert!(matches!(&blocks[1], MessageBlock::System { .. }));
    }

    #[test]
    fn parse_text_with_tags_extracts_system_reminders_with_truncation() {
        // system-reminder 内容超过 80 字符时会被截断
        let long_payload = "X".repeat(120);
        let input = format!("<system-reminder>{}</system-reminder>", long_payload);

        let blocks = parse_text_with_tags(&input);

        assert_eq!(blocks.len(), 1);
        match &blocks[0] {
            MessageBlock::System { summary } => {
                assert!(
                    summary.len() <= 80 + 3,
                    "应被 truncate 到 ≤80 字符（含省略号）"
                ); // truncate 通常追加 "..."
                assert!(summary.starts_with('X'));
            }
            _ => panic!("应为 System block"),
        }
    }

    #[test]
    fn parse_text_with_tags_keeps_plain_text_without_tags() {
        let blocks = parse_text_with_tags("hello world");
        assert_eq!(blocks.len(), 1);
        assert!(matches!(&blocks[0], MessageBlock::Text { text } if text == "hello world"));
    }

    #[test]
    fn parse_text_with_tags_drops_pure_noise_tags() {
        // 只有 local-command-caveat 噪音标签，没有真实内容，应返回空 blocks
        let blocks =
            parse_text_with_tags("<local-command-caveat>some caveat</local-command-caveat>");
        assert!(blocks.is_empty(), "纯噪音标签应被剥离后留空");
    }
}
