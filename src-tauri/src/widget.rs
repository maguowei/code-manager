//! 桌面用量浮窗：置顶、跨桌面常驻、无边框、半透明的小窗，实时展示今日用量指标。
//!
//! 窗口在偏好启用时由 `WebviewWindowBuilder` 动态创建，加载主前端入口并携带
//! `?window=widget` 参数，前端据此只渲染浮窗组件而非完整应用壳。

use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};

/// 浮窗窗口 label，capability 作用域与窗口查找都依赖该常量。
pub const WIDGET_WINDOW_LABEL: &str = "widget";

// 浮窗默认尺寸：紧凑小窗，足够容纳数项 KPI；宽度随指标行排布固定。
const WIDGET_WIDTH: f64 = 248.0;
const WIDGET_HEIGHT: f64 = 148.0;

/// 创建浮窗窗口（无边框、透明、置顶、跨桌面常驻、不进任务栏、不可缩放）。
fn create_widget_window(app: &AppHandle) -> tauri::Result<()> {
    let mut builder = WebviewWindowBuilder::new(
        app,
        WIDGET_WINDOW_LABEL,
        WebviewUrl::App("index.html?window=widget".into()),
    )
    .title("AI Manager")
    .inner_size(WIDGET_WIDTH, WIDGET_HEIGHT)
    .min_inner_size(196.0, 96.0)
    .decorations(false)
    .transparent(true)
    .always_on_top(true)
    // 跨所有 macOS 桌面(Spaces)与应用切换始终可见，避免切换桌面后浮窗"消失"
    .visible_on_all_workspaces(true)
    .skip_taskbar(true)
    .resizable(false)
    .shadow(false);

    // 首次创建时定位到主屏右偏下；查询不到主屏则回落系统默认位置。
    // 仅在创建时设置，之后沿用用户拖动后的位置（隐藏/再显示不重置）。
    if let Some((x, y)) = default_widget_position(app) {
        builder = builder.position(x, y);
    }

    builder.build()?;
    Ok(())
}

/// 计算浮窗默认位置：主屏右偏下（横向贴右留边距，纵向略低于中线）。
fn default_widget_position(app: &AppHandle) -> Option<(f64, f64)> {
    // 借主窗口查询主显示器：主窗口在 setup 阶段已存在，即便隐藏也可查询
    let monitor = app
        .get_webview_window("main")?
        .primary_monitor()
        .ok()
        .flatten()?;
    let scale = monitor.scale_factor();
    let size = monitor.size().to_logical::<f64>(scale);
    let origin = monitor.position().to_logical::<f64>(scale);
    // 横向贴右留 24px 边距；纵向落在可用高度约 60% 处（略低于中线 → 右偏下）
    let margin = 24.0;
    let x = origin.x + size.width - WIDGET_WIDTH - margin;
    let y = origin.y + (size.height - WIDGET_HEIGHT) * 0.6;
    Some((x, y))
}

/// 切换浮窗显隐（幂等）：显示时不存在则创建，隐藏时隐藏而非关闭以保留位置与状态。
#[tauri::command]
#[specta::specta]
pub fn toggle_floating_widget(app: AppHandle, visible: bool) -> Result<(), String> {
    if visible {
        match app.get_webview_window(WIDGET_WINDOW_LABEL) {
            Some(window) => {
                let _ = window.show();
                let _ = window.set_focus();
            }
            None => {
                create_widget_window(&app).map_err(|error| error.to_string())?;
            }
        }
    } else if let Some(window) = app.get_webview_window(WIDGET_WINDOW_LABEL) {
        let _ = window.hide();
    }
    Ok(())
}

/// 按偏好同步浮窗显隐：启动时与偏好变更后调用，失败只记日志不影响主流程。
pub fn sync_widget_visibility(app: &AppHandle, enabled: bool) {
    if let Err(error) = toggle_floating_widget(app.clone(), enabled) {
        log::warn!("event=widget.sync status=error detail={error}");
    }
}

/// 浮窗点击主体：唤起主窗口并跳转到用量页。复用托盘的窗口显示逻辑，避免重复实现。
#[tauri::command]
#[specta::specta]
pub fn open_usage_page(app: AppHandle) -> Result<(), String> {
    crate::tray::show_main_window(&app);
    let _ = app.emit("navigate-to-tab", "usage".to_string());
    Ok(())
}
