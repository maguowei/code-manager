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

/// 读取历史记录文件，返回内容和 mtime
#[tauri::command]
pub fn get_history() -> Result<HistoryResult, String> {
    let path = get_history_path();
    let content = fs::read_to_string(&path).map_err(|e| format!("读取历史文件失败: {}", e))?;
    let mtime = file_mtime(&path)?;
    Ok(HistoryResult { content, mtime })
}

/// 仅当文件有变化时返回新内容，否则返回 None
#[tauri::command]
pub fn get_history_if_changed(last_mtime: u64) -> Result<Option<HistoryResult>, String> {
    let path = get_history_path();
    let mtime = file_mtime(&path)?;
    if mtime == last_mtime {
        return Ok(None);
    }
    let content = fs::read_to_string(&path).map_err(|e| format!("读取历史文件失败: {}", e))?;
    Ok(Some(HistoryResult { content, mtime }))
}
