use once_cell::sync::Lazy;
use serde::de::DeserializeOwned;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

/// 配置文件操作互斥锁
pub static CONFIG_LOCK: Lazy<Mutex<()>> = Lazy::new(|| Mutex::new(()));

/// 记忆文件操作互斥锁
pub static MEMORY_LOCK: Lazy<Mutex<()>> = Lazy::new(|| Mutex::new(()));

/// 安全获取用户主目录
pub fn get_home_dir() -> Result<PathBuf, String> {
    dirs::home_dir().ok_or_else(|| "无法获取用户主目录".to_string())
}

/// 获取当前 Unix 时间戳（秒）
pub fn current_timestamp() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

/// 创建目录（如不存在）、写入文件内容，并在 Unix 系统上设置 0o600 权限
pub fn ensure_dir_and_write(path: &Path, content: &str) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("创建目录失败 {:?}: {}", parent, e))?;
    }
    fs::write(path, content).map_err(|e| format!("写入文件失败 {:?}: {}", path, e))?;

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let permissions = fs::Permissions::from_mode(0o600);
        fs::set_permissions(path, permissions)
            .map_err(|e| format!("设置文件权限失败 {:?}: {}", path, e))?;
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
