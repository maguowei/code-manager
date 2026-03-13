use once_cell::sync::Lazy;
use regex::Regex;
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
    let modified = metadata
        .modified()
        .map_err(|e| format!("获取修改时间失败: {}", e))?;
    Ok(crate::utils::systime_to_secs(modified))
}

/// 读取历史记录文件，返回内容和 mtime；文件不存在时返回空内容
#[tauri::command]
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
    /// 斜杠命令
    #[serde(rename = "command")]
    Command { name: String, args: Option<String> },
    /// 系统信息
    #[serde(rename = "system")]
    System { summary: String },
    /// 图片内容（不传输 base64 数据）
    #[serde(rename = "image")]
    Image {
        source_type: String,
        media_type: String,
    },
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
            let summary = truncate(content, 80);
            blocks.push(MessageBlock::System { summary });
        }
    }

    // 3. 如果提取了 command 或 system，检查是否还有有意义的剩余文本
    if !blocks.is_empty() {
        let mut remaining = text.to_string();
        remaining = RE_COMMAND_NAME.replace_all(&remaining, "").to_string();
        remaining = RE_COMMAND_ARGS.replace_all(&remaining, "").to_string();
        remaining = RE_COMMAND_MSG.replace_all(&remaining, "").to_string();
        remaining = RE_SYSTEM_REMINDER.replace_all(&remaining, "").to_string();
        remaining = RE_LOCAL_CAVEAT.replace_all(&remaining, "").to_string();
        // 清除所有残留的未知标签
        remaining = RE_ANY_TAG.replace_all(&remaining, "").to_string();
        let remaining = remaining.trim();
        if !remaining.is_empty() {
            blocks.push(MessageBlock::Text {
                text: remaining.to_string(),
            });
        }
        return blocks;
    }

    // 4. 没有匹配到结构化标签 -- 检查是否只有噪音标签
    let mut cleaned = text.to_string();
    cleaned = RE_LOCAL_CAVEAT.replace_all(&cleaned, "").to_string();
    cleaned = RE_COMMAND_MSG.replace_all(&cleaned, "").to_string();
    // 与步骤 3 保持一致，清除所有残留的未知 XML 标签
    cleaned = RE_ANY_TAG.replace_all(&cleaned, "").to_string();
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
        serde_json::Value::String(s) => {
            if !s.is_empty() {
                blocks.extend(parse_text_with_tags(s));
            }
        }
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
                            .map(|v| truncate(&v.to_string(), 200))
                            .unwrap_or_default();
                        blocks.push(MessageBlock::ToolUse {
                            name,
                            input_preview,
                        });
                    }
                    "tool_result" => {
                        let content_preview = item
                            .get("content")
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
                        blocks.push(MessageBlock::Image {
                            source_type,
                            media_type,
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

    let content =
        fs::read_to_string(&session_file).map_err(|e| format!("读取会话文件失败: {}", e))?;

    let mut messages = Vec::new();
    for line in content.lines() {
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
        let blocks = parse_content_blocks(&content_val);

        // 跳过无内容的消息
        if blocks.is_empty() {
            continue;
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
