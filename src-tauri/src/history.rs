use serde::Serialize;
use std::fs;

/// 历史记录读取结果
#[derive(Serialize)]
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

/// 获取文件修改时间（Unix 秒）
fn file_mtime(path: &std::path::Path) -> Result<u64, String> {
    let metadata = fs::metadata(path).map_err(|e| format!("读取文件元数据失败: {}", e))?;
    let modified = metadata.modified().map_err(|e| format!("获取修改时间失败: {}", e))?;
    Ok(crate::utils::systime_to_secs(modified))
}

/// 读取历史记录文件，返回内容和 mtime；文件不存在时返回空内容
#[tauri::command]
pub fn get_history() -> Result<HistoryResult, String> {
    let path = get_history_path();
    if !path.exists() {
        return Ok(HistoryResult { content: String::new(), mtime: 0 });
    }
    let content = fs::read_to_string(&path).map_err(|e| format!("读取历史文件失败: {}", e))?;
    let mtime = file_mtime(&path)?;
    Ok(HistoryResult { content, mtime })
}

/// 仅当文件有变化时返回新内容，否则返回 None
#[tauri::command]
pub fn get_history_if_changed(last_mtime: u64) -> Result<Option<HistoryResult>, String> {
    let path = get_history_path();
    if !path.exists() {
        return Ok(None);
    }
    let mtime = file_mtime(&path)?;
    if mtime == last_mtime {
        return Ok(None);
    }
    let content = fs::read_to_string(&path).map_err(|e| format!("读取历史文件失败: {}", e))?;
    let mtime = file_mtime(&path)?;
    Ok(Some(HistoryResult { content, mtime }))
}

/// 对话消息内容块
#[derive(Serialize)]
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
    ToolResult { content_preview: String },
}

/// 一条对话消息
#[derive(Serialize)]
pub struct SessionMessage {
    pub role: String,
    pub blocks: Vec<MessageBlock>,
    pub timestamp: Option<String>,
}

/// 会话详情返回结果
#[derive(Serialize)]
pub struct SessionDetail {
    pub session_id: String,
    pub project: String,
    pub messages: Vec<SessionMessage>,
}

/// 截取字符串前 max_len 个 Unicode 字符，超出时追加 "..."
fn truncate(s: &str, max_len: usize) -> String {
    let mut chars = s.char_indices();
    match chars.nth(max_len) {
        None => s.to_string(),
        Some((byte_idx, _)) => format!("{}...", &s[..byte_idx]),
    }
}

/// 将 serde_json::Value 的 content 字段解析为 MessageBlock 列表
fn parse_content_blocks(content: &serde_json::Value) -> Vec<MessageBlock> {
    let mut blocks = Vec::new();
    match content {
        serde_json::Value::String(s) => {
            if !s.is_empty() {
                blocks.push(MessageBlock::Text { text: s.clone() });
            }
        }
        serde_json::Value::Array(arr) => {
            for item in arr {
                let block_type = item.get("type").and_then(|t| t.as_str()).unwrap_or("");
                match block_type {
                    "text" => {
                        if let Some(text) = item.get("text").and_then(|t| t.as_str()) {
                            if !text.is_empty() {
                                blocks.push(MessageBlock::Text { text: text.to_string() });
                            }
                        }
                    }
                    "thinking" => {
                        if let Some(text) = item.get("thinking").and_then(|t| t.as_str()) {
                            if !text.is_empty() {
                                blocks.push(MessageBlock::Thinking { thinking: text.to_string() });
                            }
                        }
                    }
                    "tool_use" => {
                        let name = item.get("name").and_then(|n| n.as_str()).unwrap_or("unknown").to_string();
                        let input_preview = item.get("input")
                            .map(|v| truncate(&v.to_string(), 200))
                            .unwrap_or_default();
                        blocks.push(MessageBlock::ToolUse { name, input_preview });
                    }
                    "tool_result" => {
                        let content_preview = item.get("content")
                            .map(|v| {
                                if let Some(s) = v.as_str() {
                                    truncate(s, 200)
                                } else {
                                    truncate(&v.to_string(), 200)
                                }
                            })
                            .unwrap_or_default();
                        blocks.push(MessageBlock::ToolResult { content_preview });
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
pub fn get_session_detail(project: &str, session_id: &str) -> Result<SessionDetail, String> {
    // 编码项目路径：/ → -
    let encoded = project.replace('/', "-");
    let session_file = crate::utils::home_dir_or_fallback()
        .join(".claude")
        .join("projects")
        .join(&encoded)
        .join(format!("{}.jsonl", session_id));

    if !session_file.exists() {
        return Ok(SessionDetail {
            session_id: session_id.to_string(),
            project: project.to_string(),
            messages: Vec::new(),
        });
    }

    let content = fs::read_to_string(&session_file)
        .map_err(|e| format!("读取会话文件失败: {}", e))?;

    let mut messages = Vec::new();
    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() { continue; }
        let record: serde_json::Value = match serde_json::from_str(trimmed) {
            Ok(v) => v,
            Err(_) => continue,
        };

        // 只处理 user 和 assistant 类型
        let msg_type = record.get("type").and_then(|t| t.as_str()).unwrap_or("");
        if msg_type != "user" && msg_type != "assistant" { continue; }

        // 跳过 sidechain 消息
        if record.get("isSidechain").and_then(|v| v.as_bool()).unwrap_or(false) { continue; }

        let message = match record.get("message") {
            Some(m) => m,
            None => continue,
        };

        let role = message.get("role").and_then(|r| r.as_str()).unwrap_or(msg_type).to_string();
        let content_val = message.get("content").cloned().unwrap_or(serde_json::Value::Null);
        let blocks = parse_content_blocks(&content_val);

        // 跳过无内容的消息
        if blocks.is_empty() { continue; }

        let timestamp = record.get("timestamp").and_then(|t| t.as_str()).map(|s| s.to_string());

        messages.push(SessionMessage { role, blocks, timestamp });
    }

    Ok(SessionDetail {
        session_id: session_id.to_string(),
        project: project.to_string(),
        messages,
    })
}
