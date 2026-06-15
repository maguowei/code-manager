use std::process::Command;

/// 触发 claude 读取插件目录缓存，按其默认 24h TTL 策略刷新安装数。
///
/// 不主动删缓存、不强制刷新：执行 `claude plugin list --available --json`，claude 内部若发现
/// 本地 `~/.claude/plugins/plugin-catalog-cache.json` 超过 24h TTL 会自动从远端重拉并重写，未过期
/// 则沿用缓存。安装数（`unique_installs`）即来自该缓存的 catalog。注意 `claude plugin marketplace
/// update` 只更新 marketplace 克隆、不碰该缓存，刷不了安装数。返回 `Result<(), String>`：前端只需
/// 成功/失败，CLI 原始输出仅进后端日志。
#[tauri::command]
#[specta::specta]
pub fn refresh_plugin_install_counts() -> Result<(), String> {
    let result = trigger_claude_catalog_refresh();
    crate::logging::log_command_result("plugins.refresh_install_counts", &result, |_| {
        String::new()
    });
    result
}

// 执行 `claude plugin list --available --json`：claude 读取 catalog 时按 TTL 决定是否重拉缓存。
// 输出仅用于失败诊断，不回传 UI。
fn trigger_claude_catalog_refresh() -> Result<(), String> {
    let mut command = Command::new("claude");
    command.args(["plugin", "list", "--available", "--json"]);
    crate::utils::hide_command_window(&mut command);
    let output = command.output().map_err(|e| {
        if e.kind() == std::io::ErrorKind::NotFound {
            "未找到 claude CLI，请确认 Claude Code 已安装并可在 PATH 中访问".to_string()
        } else {
            format!("执行 claude plugin list 失败: {e}")
        }
    })?;

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
