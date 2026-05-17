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

/// Skills 文件操作互斥锁
pub static SKILLS_LOCK: Lazy<Mutex<()>> = Lazy::new(|| Mutex::new(()));

/// 测试中修改进程级环境变量时共用，避免不同模块并行测试互相污染。
#[cfg(test)]
pub static TEST_ENV_LOCK: Lazy<Mutex<()>> = Lazy::new(|| Mutex::new(()));

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

fn legacy_app_data_dir_from_home(home_dir: &Path) -> PathBuf {
    home_dir.join(".config").join("ai-manager")
}

fn platform_app_data_dir_from_home(home_dir: &Path) -> PathBuf {
    #[cfg(target_os = "macos")]
    {
        legacy_app_data_dir_from_home(home_dir)
    }

    #[cfg(not(target_os = "macos"))]
    {
        dirs::config_dir()
            .map(|dir| dir.join("ai-manager"))
            .unwrap_or_else(|| legacy_app_data_dir_from_home(home_dir))
    }
}

/// 获取应用数据目录：macOS 默认保留 `~/.config/ai-manager`，其它平台使用系统配置目录。
pub fn get_app_data_dir() -> PathBuf {
    if let Some(path) = env::var_os("AI_MANAGER_APP_DATA_DIR_OVERRIDE") {
        return PathBuf::from(path);
    }
    if let Some(path) = env::var_os("AI_MANAGER_HOME_OVERRIDE") {
        return legacy_app_data_dir_from_home(&PathBuf::from(path));
    }
    platform_app_data_dir_from_home(&home_dir_or_fallback())
}

/// 严格获取应用数据目录，失败时返回错误，不做降级。
pub fn get_app_data_dir_strict() -> Result<PathBuf, String> {
    if let Some(path) = env::var_os("AI_MANAGER_APP_DATA_DIR_OVERRIDE") {
        return Ok(PathBuf::from(path));
    }
    if let Some(path) = env::var_os("AI_MANAGER_HOME_OVERRIDE") {
        return Ok(legacy_app_data_dir_from_home(&PathBuf::from(path)));
    }
    Ok(platform_app_data_dir_from_home(&get_home_dir()?))
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

    replace_file_with_temp(path, &temp_path)?;
    Ok(())
}

fn replace_file_with_temp(path: &Path, temp_path: &Path) -> Result<(), String> {
    #[cfg(windows)]
    {
        replace_file_with_temp_windows(path, temp_path)
    }

    #[cfg(not(windows))]
    {
        fs::rename(temp_path, path)
            .map_err(|e| format!("原子替换文件失败 {:?}: {}", path, e))
    }
}

#[cfg(windows)]
fn replace_file_with_temp_windows(path: &Path, temp_path: &Path) -> Result<(), String> {
    if !path.exists() {
        return fs::rename(temp_path, path)
            .map_err(|e| format!("原子替换文件失败 {:?}: {}", path, e));
    }

    let backup_path = windows_backup_path(path);
    if backup_path.exists() {
        fs::remove_file(&backup_path)
            .map_err(|e| format!("清理旧备份文件失败 {:?}: {}", backup_path, e))?;
    }

    fs::rename(path, &backup_path).map_err(|e| format!("创建替换备份失败 {:?}: {}", path, e))?;

    match fs::rename(temp_path, path) {
        Ok(()) => {
            let _ = fs::remove_file(&backup_path);
            Ok(())
        }
        Err(error) => {
            let restore_result = fs::rename(&backup_path, path);
            if let Err(restore_error) = restore_result {
                return Err(format!(
                    "原子替换文件失败 {:?}: {}; 恢复原文件也失败: {}",
                    path, error, restore_error
                ));
            }
            Err(format!("原子替换文件失败 {:?}: {}", path, error))
        }
    }
}

#[cfg(windows)]
fn windows_backup_path(path: &Path) -> PathBuf {
    let backup_name = format!(
        ".{}.backup-{}-{}",
        path.file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("config"),
        std::process::id(),
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos()
    );
    path.parent()
        .unwrap_or_else(|| Path::new("."))
        .join(backup_name)
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

/// 去掉 Windows 上 `std::fs::canonicalize` 返回的 `\\?\` 和 `\\?\UNC\` verbatim 前缀；
/// 其它平台原样返回。用于把 verbatim 路径还原为人类与外部工具（git 等）期望的常规路径。
#[allow(dead_code)]
pub fn strip_windows_verbatim_prefix(path: &str) -> &str {
    #[cfg(windows)]
    {
        if let Some(rest) = path.strip_prefix(r"\\?\UNC\") {
            return rest;
        }
        if let Some(rest) = path.strip_prefix(r"\\?\") {
            return rest;
        }
        path
    }
    #[cfg(not(windows))]
    {
        path
    }
}

/// 将路径转换为跨平台一致的字符串表示：在 Windows 上去掉 verbatim 前缀并将 `\` 替换为 `/`；
/// 其它平台直接返回 `to_string_lossy`。便于做字符串比较、向前端透传或测试断言。
#[allow(dead_code)]
pub fn normalize_path_for_display(path: &Path) -> String {
    let raw = path.to_string_lossy();
    let stripped = strip_windows_verbatim_prefix(&raw);
    #[cfg(windows)]
    {
        stripped.replace('\\', "/")
    }
    #[cfg(not(windows))]
    {
        stripped.to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn strip_windows_verbatim_prefix_handles_common_shapes() {
        // 普通路径在所有平台上保持原样
        assert_eq!(
            strip_windows_verbatim_prefix("C:/Users/test"),
            "C:/Users/test"
        );
        assert_eq!(strip_windows_verbatim_prefix("/tmp/file"), "/tmp/file");

        // verbatim 前缀仅在 Windows 上生效
        #[cfg(windows)]
        {
            assert_eq!(
                strip_windows_verbatim_prefix(r"\\?\C:\Users\test"),
                r"C:\Users\test"
            );
            assert_eq!(
                strip_windows_verbatim_prefix(r"\\?\UNC\server\share"),
                r"server\share"
            );
        }

        // 非 Windows 平台上含 `\\?\` 字面量的字符串保持原样
        #[cfg(not(windows))]
        {
            assert_eq!(
                strip_windows_verbatim_prefix(r"\\?\C:\Users\test"),
                r"\\?\C:\Users\test"
            );
        }
    }

    #[test]
    fn normalize_path_for_display_converts_separators_on_windows() {
        let p = PathBuf::from("/tmp/example/dir");
        assert_eq!(normalize_path_for_display(&p), "/tmp/example/dir");

        #[cfg(windows)]
        {
            let p = PathBuf::from(r"C:\Users\test");
            assert_eq!(normalize_path_for_display(&p), "C:/Users/test");
        }
    }

    #[test]
    fn replace_file_with_temp_keeps_original_when_replacement_fails() {
        let root = std::env::temp_dir().join(format!(
            "ai-manager-utils-replace-{}-{}",
            std::process::id(),
            current_timestamp()
        ));
        fs::create_dir_all(&root).expect("应可创建测试目录");
        let target = root.join("settings.json");
        let bad_temp = root.join("bad-temp-dir");
        fs::write(&target, "original").expect("应可写入原文件");
        fs::create_dir_all(&bad_temp).expect("应可创建无效替换目录");

        let result = replace_file_with_temp(&target, &bad_temp);

        assert!(result.is_err());
        assert_eq!(
            fs::read_to_string(&target).expect("失败后原文件仍应存在"),
            "original"
        );

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn app_data_dir_uses_expected_platform_default() {
        let root = std::env::temp_dir().join(format!(
            "ai-manager-utils-app-data-{}-{}",
            std::process::id(),
            current_timestamp()
        ));

        #[cfg(target_os = "macos")]
        assert_eq!(
            platform_app_data_dir_from_home(&root),
            root.join(".config").join("ai-manager")
        );

        #[cfg(not(target_os = "macos"))]
        assert!(platform_app_data_dir_from_home(&root).ends_with("ai-manager"));

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn app_data_dir_uses_home_override_when_app_data_override_is_absent() {
        let _guard = TEST_ENV_LOCK.lock().unwrap_or_else(|error| error.into_inner());
        let root = std::env::temp_dir().join(format!(
            "ai-manager-utils-home-override-{}-{}",
            std::process::id(),
            current_timestamp()
        ));
        let previous_home = env::var_os("AI_MANAGER_HOME_OVERRIDE");
        let previous_app_data = env::var_os("AI_MANAGER_APP_DATA_DIR_OVERRIDE");
        env::set_var("AI_MANAGER_HOME_OVERRIDE", &root);
        env::remove_var("AI_MANAGER_APP_DATA_DIR_OVERRIDE");

        assert_eq!(
            get_app_data_dir(),
            root.join(".config").join("ai-manager")
        );
        assert_eq!(
            get_app_data_dir_strict().expect("严格路径应可读取 home override"),
            root.join(".config").join("ai-manager")
        );

        match previous_home {
            Some(value) => env::set_var("AI_MANAGER_HOME_OVERRIDE", value),
            None => env::remove_var("AI_MANAGER_HOME_OVERRIDE"),
        }
        match previous_app_data {
            Some(value) => env::set_var("AI_MANAGER_APP_DATA_DIR_OVERRIDE", value),
            None => env::remove_var("AI_MANAGER_APP_DATA_DIR_OVERRIDE"),
        }
        let _ = fs::remove_dir_all(root);
    }
}
