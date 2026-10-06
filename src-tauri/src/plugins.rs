use serde_json::Value;
use std::path::Path;
use std::time::Duration;

/// 触发 claude 读取插件目录缓存，按其默认 24h TTL 策略刷新安装数。
///
/// 不主动删缓存、不强制刷新：执行 `claude plugin list --available --json`，claude 内部若发现
/// 本地 `~/.claude/plugins/plugin-catalog-cache.json` 超过 24h TTL 会自动从远端重拉并重写，未过期
/// 则沿用缓存。安装数（`unique_installs`）即来自该缓存的 catalog。注意 `claude plugin marketplace
/// update` 只更新 marketplace 克隆、不碰该缓存，刷不了安装数。返回 `Result<(), String>`：前端只需
/// 成功/失败，CLI 原始输出仅进后端日志。
#[tauri::command]
#[specta::specta]
pub async fn refresh_plugin_install_counts() -> Result<(), String> {
    let result = trigger_claude_catalog_refresh().await;
    crate::logging::log_command_result("plugins.refresh_install_counts", &result, |_| {
        String::new()
    });
    result
}

// 执行 `claude plugin list --available --json`：claude 读取 catalog 时按 TTL 决定是否重拉缓存。
// 输出仅用于失败诊断，不回传 UI。
async fn trigger_claude_catalog_refresh() -> Result<(), String> {
    let args = ["plugin", "list", "--available", "--json"].map(str::to_string);
    let output = crate::claude_cli::run_with_timeout(&args, Duration::from_secs(30))
        .await
        .map_err(|error| error.to_string())?;

    if output.status.success() {
        Ok(())
    } else {
        let detail = crate::utils::merge_process_output(&output.stdout, &output.stderr);
        Err(if detail.is_empty() {
            format!(
                "claude plugin list 执行失败，退出码: {:?}",
                output.status.code()
            )
        } else {
            format!(
                "claude plugin list 执行失败，退出码: {:?}\n{detail}",
                output.status.code()
            )
        })
    }
}

/// 专用读取完整 catalog，避免文件预览接口的截断规则影响安装数。
#[tauri::command]
#[specta::specta]
pub async fn read_plugin_catalog() -> Result<Option<String>, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let root = crate::utils::get_claude_dir()?;
        let catalog = read_plugin_catalog_from_root(&root)?;
        Ok(if catalog.is_null() {
            None
        } else {
            Some(catalog.to_string())
        })
    })
    .await
    .map_err(|_| "读取插件安装数缓存任务失败".to_string())?
}

fn read_plugin_catalog_from_root(root: &Path) -> Result<Value, String> {
    let path = root.join("plugins/plugin-catalog-cache.json");
    if !path.exists() {
        return Ok(Value::Null);
    }
    crate::utils::read_json_file_strict(&path)
}

#[cfg(test)]
mod tests {
    use super::read_plugin_catalog_from_root;
    use serde_json::json;

    #[test]
    fn reads_complete_catalog_larger_than_preview_limit() {
        let root = tempfile::tempdir().unwrap();
        let path = root.path().join("plugins/plugin-catalog-cache.json");
        let catalog = json!({
            "padding": "x".repeat(600 * 1024),
            "catalog": {"plugins": {"alpha@claude-plugins-official": {"unique_installs": 1234}}}
        });
        crate::utils::save_json_file(&path, &catalog).unwrap();
        assert_eq!(read_plugin_catalog_from_root(root.path()).unwrap(), catalog);
    }

    #[test]
    fn missing_catalog_is_empty_but_invalid_json_is_an_error() {
        let root = tempfile::tempdir().unwrap();
        assert_eq!(
            read_plugin_catalog_from_root(root.path()).unwrap(),
            json!(null)
        );
        let path = root.path().join("plugins/plugin-catalog-cache.json");
        crate::utils::ensure_dir_and_write_atomic(&path, "invalid json").unwrap();
        assert!(read_plugin_catalog_from_root(root.path()).is_err());
    }
}
