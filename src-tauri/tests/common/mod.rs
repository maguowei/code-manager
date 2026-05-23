//! 集成测试共享 helper：管理临时的 AI_MANAGER_HOME_OVERRIDE / AI_MANAGER_APP_DATA_DIR_OVERRIDE。
//!
//! 设计取舍：
//! - 不复用 lib 内部的 `TEST_ENV_LOCK`（它被 `#[cfg(test)]` gate，对集成测试不可见）。
//!   集成测试用 `#[serial_test::serial]` 互斥同文件内的 #[test]；不同 tests/*.rs 由
//!   cargo 默认 serial 执行，跨文件天然互斥。
//! - 不在 helper 里取 `lock_config()` — 业务 command（如 apply_profile_inner）内部
//!   会自己申请该锁，helper 提前抢占会与业务 command 同线程双锁死锁。
//! - Drop 时自动还原 env 并清理临时目录，避免污染下个用例。

use std::env;
use std::fs;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

#[allow(dead_code)] // 不是所有集成测试文件都用到全部字段
pub struct IntegrationEnv {
    pub root: PathBuf,
    previous_home: Option<String>,
    previous_app_data: Option<String>,
}

impl IntegrationEnv {
    /// 准备一个隔离的 ~/.claude 与 ~/.config/ai-manager 临时根目录。
    pub fn new(name: &str) -> Self {
        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos();
        let root = env::temp_dir().join(format!(
            "ai-manager-it-{name}-{}-{suffix}",
            std::process::id()
        ));
        fs::create_dir_all(root.join(".claude")).expect("应可创建 .claude 目录");
        fs::create_dir_all(root.join(".config").join("ai-manager"))
            .expect("应可创建 app-data 目录");

        let previous_home = env::var("AI_MANAGER_HOME_OVERRIDE").ok();
        let previous_app_data = env::var("AI_MANAGER_APP_DATA_DIR_OVERRIDE").ok();
        env::set_var("AI_MANAGER_HOME_OVERRIDE", &root);
        env::set_var(
            "AI_MANAGER_APP_DATA_DIR_OVERRIDE",
            root.join(".config").join("ai-manager"),
        );

        Self {
            root,
            previous_home,
            previous_app_data,
        }
    }

    /// 返回隔离根下的 ~/.claude 目录。
    #[allow(dead_code)]
    pub fn claude_dir(&self) -> PathBuf {
        self.root.join(".claude")
    }

    /// 返回隔离根下的 ~/.config/ai-manager 目录。
    #[allow(dead_code)]
    pub fn app_data_dir(&self) -> PathBuf {
        self.root.join(".config").join("ai-manager")
    }

    /// 写入 ~/.claude/<relative> 文件，自动创建父目录。
    #[allow(dead_code)]
    pub fn write_claude_file(&self, relative: &str, content: &str) -> PathBuf {
        let path = self.claude_dir().join(relative);
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).expect("应可创建父目录");
        }
        fs::write(&path, content).expect("写入 .claude 文件失败");
        path
    }

    /// 写入 ~/.config/ai-manager/<relative> 文件，自动创建父目录。
    #[allow(dead_code)]
    pub fn write_app_data_file(&self, relative: &str, content: &str) -> PathBuf {
        let path = self.app_data_dir().join(relative);
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).expect("应可创建父目录");
        }
        fs::write(&path, content).expect("写入 app-data 文件失败");
        path
    }
}

impl Drop for IntegrationEnv {
    fn drop(&mut self) {
        match &self.previous_home {
            Some(value) => env::set_var("AI_MANAGER_HOME_OVERRIDE", value),
            None => env::remove_var("AI_MANAGER_HOME_OVERRIDE"),
        }
        match &self.previous_app_data {
            Some(value) => env::set_var("AI_MANAGER_APP_DATA_DIR_OVERRIDE", value),
            None => env::remove_var("AI_MANAGER_APP_DATA_DIR_OVERRIDE"),
        }
        let _ = fs::remove_dir_all(&self.root);
    }
}
