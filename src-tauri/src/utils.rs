use once_cell::sync::Lazy;
use serde::{de::DeserializeOwned, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, MutexGuard};
use std::time::{SystemTime, UNIX_EPOCH};

/// 配置文件操作互斥锁
pub static CONFIG_LOCK: Lazy<Mutex<()>> = Lazy::new(|| Mutex::new(()));

/// 记忆文件操作互斥锁
pub static MEMORY_LOCK: Lazy<Mutex<()>> = Lazy::new(|| Mutex::new(()));

/// 统计快照文件操作互斥锁
pub static STATS_LOCK: Lazy<Mutex<()>> = Lazy::new(|| Mutex::new(()));

/// Skills 文件操作互斥锁
pub static SKILLS_LOCK: Lazy<Mutex<()>> = Lazy::new(|| Mutex::new(()));

/// 安全获取用户主目录
pub fn get_home_dir() -> Result<PathBuf, String> {
    dirs::home_dir().ok_or_else(|| "无法获取用户主目录".to_string())
}

/// 获取用户主目录，失败时降级为当前目录
pub fn home_dir_or_fallback() -> PathBuf {
    get_home_dir().unwrap_or_else(|_| PathBuf::from("."))
}

/// 获取应用数据目录（~/.config/ai-manager），失败时降级为当前目录
pub fn get_app_data_dir() -> PathBuf {
    home_dir_or_fallback().join(".config").join("ai-manager")
}

/// 获取当前 Unix 时间戳（秒）
pub fn current_timestamp() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

/// 将 SystemTime 转换为 Unix 时间戳（秒），失败时返回 0
pub fn systime_to_secs(t: SystemTime) -> u64 {
    t.duration_since(UNIX_EPOCH)
        .ok()
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

/// 创建目录（如不存在）、写入文件内容，新建文件时在 Unix 系统上设置 0o600 权限
pub fn ensure_dir_and_write(path: &Path, content: &str) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("创建目录失败 {:?}: {}", parent, e))?;
    }
    let is_new = !path.exists();
    fs::write(path, content).map_err(|e| format!("写入文件失败 {:?}: {}", path, e))?;

    #[cfg(unix)]
    if is_new {
        use std::os::unix::fs::PermissionsExt;
        let _ = fs::set_permissions(path, fs::Permissions::from_mode(0o600));
    }

    Ok(())
}

/// 读取 JSON 文件并反序列化，失败时返回默认值
pub fn read_json_file<T: DeserializeOwned + Default>(path: &Path) -> T {
    fs::read_to_string(path)
        .ok()
        .and_then(|content| serde_json::from_str(&content).ok())
        .unwrap_or_default()
}

/// 将数据序列化为格式化 JSON 并写入文件
pub fn save_json_file<T: Serialize>(path: &Path, data: &T) -> Result<(), String> {
    let content = serde_json::to_string_pretty(data).map_err(|e| e.to_string())?;
    ensure_dir_and_write(path, &content)
}

/// 获取配置文件写锁，防止并发写入
pub fn lock_config() -> Result<MutexGuard<'static, ()>, String> {
    CONFIG_LOCK.lock().map_err(|e| format!("获取锁失败: {}", e))
}

/// 获取记忆文件写锁，防止并发写入
pub fn lock_memory() -> Result<MutexGuard<'static, ()>, String> {
    MEMORY_LOCK.lock().map_err(|e| format!("获取锁失败: {}", e))
}

/// 获取统计文件写锁，防止并发写入
pub fn lock_stats() -> Result<MutexGuard<'static, ()>, String> {
    STATS_LOCK.lock().map_err(|e| format!("获取锁失败: {}", e))
}

/// 获取 Skills 文件写锁，防止并发写入
pub fn lock_skills() -> Result<MutexGuard<'static, ()>, String> {
    SKILLS_LOCK.lock().map_err(|e| format!("获取锁失败: {}", e))
}
