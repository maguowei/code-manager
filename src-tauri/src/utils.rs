use once_cell::sync::Lazy;
use serde::{de::DeserializeOwned, Serialize};
use std::env;
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
    if let Some(path) = env::var_os("AI_MANAGER_HOME_OVERRIDE") {
        return Ok(PathBuf::from(path));
    }
    dirs::home_dir().ok_or_else(|| "无法获取用户主目录".to_string())
}

/// 获取用户主目录，失败时降级为当前目录
pub fn home_dir_or_fallback() -> PathBuf {
    get_home_dir().unwrap_or_else(|_| PathBuf::from("."))
}

/// 获取应用数据目录（~/.config/ai-manager），失败时降级为当前目录
pub fn get_app_data_dir() -> PathBuf {
    if let Some(path) = env::var_os("AI_MANAGER_APP_DATA_DIR_OVERRIDE") {
        return PathBuf::from(path);
    }
    home_dir_or_fallback().join(".config").join("ai-manager")
}

/// 严格获取应用数据目录，失败时返回错误，不做降级。
pub fn get_app_data_dir_strict() -> Result<PathBuf, String> {
    if let Some(path) = env::var_os("AI_MANAGER_APP_DATA_DIR_OVERRIDE") {
        return Ok(PathBuf::from(path));
    }
    Ok(get_home_dir()?.join(".config").join("ai-manager"))
}

/// 获取当前 Unix 时间戳（秒）
pub fn current_timestamp() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

/// 获取当前 RFC3339 UTC 时间戳，格式如 `2026-04-18T12:34:56Z`。
pub fn current_rfc3339_timestamp() -> String {
    unix_secs_to_rfc3339(current_timestamp())
}

/// 将 SystemTime 转换为 Unix 时间戳（秒），失败时返回 0
pub fn systime_to_secs(t: SystemTime) -> u64 {
    t.duration_since(UNIX_EPOCH)
        .ok()
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

/// 从文件元数据读取最近修改时间（Unix 秒），任一环节失败时返回 0
pub fn metadata_modified_secs(metadata: &fs::Metadata) -> u64 {
    metadata.modified().ok().map(systime_to_secs).unwrap_or(0)
}

/// 将 Unix 秒级时间戳转换为 RFC3339 UTC 字符串。
pub fn unix_secs_to_rfc3339(secs: u64) -> String {
    let days = (secs / 86_400) as i64;
    let seconds_of_day = secs % 86_400;
    let hour = seconds_of_day / 3_600;
    let minute = (seconds_of_day % 3_600) / 60;
    let second = seconds_of_day % 60;
    let (year, month, day) = civil_from_days(days);

    format!("{year:04}-{month:02}-{day:02}T{hour:02}:{minute:02}:{second:02}Z")
}

/// 将自 Unix epoch 起的天数转换为公历日期。
fn civil_from_days(days: i64) -> (i32, u32, u32) {
    let z = days + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let day_of_era = z - era * 146_097;
    let year_of_era =
        (day_of_era - day_of_era / 1_460 + day_of_era / 36_524 - day_of_era / 146_096) / 365;
    let year = year_of_era + era * 400;
    let day_of_year = day_of_era - (365 * year_of_era + year_of_era / 4 - year_of_era / 100);
    let month_prime = (5 * day_of_year + 2) / 153;
    let day = day_of_year - (153 * month_prime + 2) / 5 + 1;
    let month = month_prime + if month_prime < 10 { 3 } else { -9 };
    let year = year + if month <= 2 { 1 } else { 0 };

    (year as i32, month as u32, day as u32)
}

/// 创建目录（如不存在）、写入文件内容，新建文件时在 Unix 系统上设置 0o600 权限
pub fn ensure_dir_and_write(path: &Path, content: &str) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("创建目录失败 {:?}: {}", parent, e))?;
    }
    #[cfg(unix)]
    let is_new = !path.exists();
    fs::write(path, content).map_err(|e| format!("写入文件失败 {:?}: {}", path, e))?;

    // 仅新建文件时收紧权限；覆盖已有文件保留原有 mode（避免破坏 skill 脚本的可执行权限）
    #[cfg(unix)]
    if is_new {
        use std::os::unix::fs::PermissionsExt;
        let _ = fs::set_permissions(path, fs::Permissions::from_mode(0o600));
    }

    Ok(())
}

/// 原子写入文本文件：先写临时文件，再替换目标文件。
pub fn ensure_dir_and_write_atomic(path: &Path, content: &str) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("创建目录失败 {:?}: {}", parent, e))?;
    }

    let temp_name = format!(
        ".{}.tmp-{}-{}",
        path.file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("config"),
        std::process::id(),
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos()
    );
    let temp_path = path
        .parent()
        .unwrap_or_else(|| Path::new("."))
        .join(temp_name);

    fs::write(&temp_path, content)
        .map_err(|e| format!("写入临时文件失败 {:?}: {}", temp_path, e))?;

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = fs::set_permissions(&temp_path, fs::Permissions::from_mode(0o600));
    }

    #[cfg(windows)]
    if path.exists() {
        fs::remove_file(path).map_err(|e| format!("替换文件失败 {:?}: {}", path, e))?;
    }

    fs::rename(&temp_path, path).map_err(|e| format!("原子替换文件失败 {:?}: {}", path, e))?;
    Ok(())
}

/// 读取 JSON 文件并反序列化，失败时返回默认值
pub fn read_json_file<T: DeserializeOwned + Default>(path: &Path) -> T {
    fs::read_to_string(path)
        .ok()
        .and_then(|content| serde_json::from_str(&content).ok())
        .unwrap_or_default()
}

/// 严格读取 JSON 文件，缺失、读取或解析失败都返回错误。
pub fn read_json_file_strict<T: DeserializeOwned>(path: &Path) -> Result<T, String> {
    let content =
        fs::read_to_string(path).map_err(|e| format!("读取文件失败 {:?}: {}", path, e))?;
    serde_json::from_str(&content).map_err(|e| format!("解析 JSON 失败 {:?}: {}", path, e))
}

/// 将数据序列化为格式化 JSON 并写入文件
pub fn save_json_file<T: Serialize>(path: &Path, data: &T) -> Result<(), String> {
    let content = serde_json::to_string_pretty(data).map_err(|e| e.to_string())?;
    ensure_dir_and_write(path, &content)
}

/// 通用互斥锁获取函数
fn acquire_lock(lock: &'static Lazy<Mutex<()>>) -> Result<MutexGuard<'static, ()>, String> {
    lock.lock().map_err(|e| format!("获取锁失败: {}", e))
}

/// 获取配置文件写锁，防止并发写入
pub fn lock_config() -> Result<MutexGuard<'static, ()>, String> {
    acquire_lock(&CONFIG_LOCK)
}

/// 获取记忆文件写锁，防止并发写入
pub fn lock_memory() -> Result<MutexGuard<'static, ()>, String> {
    acquire_lock(&MEMORY_LOCK)
}

/// 获取统计文件写锁，防止并发写入
pub fn lock_stats() -> Result<MutexGuard<'static, ()>, String> {
    acquire_lock(&STATS_LOCK)
}

/// 获取 Skills 文件写锁，防止并发写入
pub fn lock_skills() -> Result<MutexGuard<'static, ()>, String> {
    acquire_lock(&SKILLS_LOCK)
}

/// 截取字符串前 max_len 个 Unicode 字符，超出时追加 "..."
pub fn truncate(s: &str, max_len: usize) -> String {
    let mut chars = s.char_indices();
    match chars.nth(max_len) {
        None => s.to_string(),
        Some((byte_idx, _)) => format!("{}...", &s[..byte_idx]),
    }
}
