use once_cell::sync::Lazy;
use regex::Regex;
use serde::Serialize;
use std::fs;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::process::Command;

/// 用于匹配 "Implement the following plan:" 前缀的常量
const PLAN_PREFIX: &str = "Implement the following plan:";

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

fn encoded_project_path(project: &str) -> String {
    project.replace(['/', '.'], "-")
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
    // 返回上面已取得的 mtime（而非重新读取），确保 mtime 不晚于内容读取时刻：
    // 若读取期间有新写入，mtime 偏旧，下次轮询会再次检测到变化并重读（安全侧）
    let content = fs::read_to_string(&path).map_err(|e| format!("读取历史文件失败: {}", e))?;
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
pub fn get_session_detail(project: &str, session_id: &str) -> Result<SessionDetail, String> {
    let session_file = session_file_path_unchecked(project, session_id);

    if !session_file.exists() {
        return Ok(SessionDetail {
            session_id: session_id.to_string(),
            project: project.to_string(),
            messages: Vec::new(),
        });
    }

    // 使用 BufReader 流式逐行读取，避免将大文件（含 base64 图片）全量加载到内存
    let file = fs::File::open(&session_file).map_err(|e| format!("打开会话文件失败: {}", e))?;
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
        let app_name = editor_app_name(editor)?;
        open_path_with_app(&session_file, app_name)
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

fn editor_app_name(app: &str) -> Result<&'static str, String> {
    crate::config::EDITOR_APPS
        .iter()
        .find(|(slug, _)| *slug == app)
        .map(|(_, display)| *display)
        .ok_or_else(|| "默认编辑器配置无效，请重新选择".to_string())
}

fn open_path_with_app(path: &Path, app_name: &str) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let status = Command::new("open")
            .arg("-a")
            .arg(app_name)
            .arg(path)
            .status()
            .map_err(|e| format!("启动 {app_name} 失败: {e}"))?;
        if status.success() {
            Ok(())
        } else {
            Err(format!("启动 {app_name} 失败，退出码: {:?}", status.code()))
        }
    }

    #[cfg(not(target_os = "macos"))]
    {
        let _ = (path, app_name);
        Err("当前平台暂不支持打开本地应用".to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    #[test]
    fn session_file_path_uses_claude_project_encoding() {
        let path = session_file_path("/Users/demo/project.name", "session-123").unwrap();

        assert!(path.ends_with(Path::new(
            ".claude/projects/-Users-demo-project-name/session-123.jsonl"
        )));
    }

    #[test]
    fn session_file_path_rejects_unsafe_session_ids() {
        let err = session_file_path("/Users/demo/project", "../session").unwrap_err();

        assert!(err.contains("会话 ID"));
    }
}
