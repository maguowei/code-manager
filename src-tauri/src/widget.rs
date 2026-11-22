//! 桌面用量浮窗：置顶、跨桌面常驻、无边框、半透明的小窗，实时展示今日用量指标。
//!
//! 窗口在偏好启用时由 `WebviewWindowBuilder` 动态创建，加载主前端入口并携带
//! `?window=widget` 参数，前端据此只渲染浮窗组件而非完整应用壳。

use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Duration;

use tauri::{
    AppHandle, Emitter, LogicalSize, Manager, Monitor, WebviewUrl, WebviewWindow,
    WebviewWindowBuilder, WindowEvent,
};

use crate::config::{AppPreferences, WidgetGeometry};

/// 浮窗窗口 label，capability 作用域与窗口查找都依赖该常量。
pub const WIDGET_WINDOW_LABEL: &str = "widget";

// 浮窗固定为单行状态条：每个指标一格，只显示数值。尺寸由指标数量决定，不可缩放。
// 以下常量需与前端 FloatingWidget.tsx 的样式保持一致：
// 外层 p-1.5（每侧 6）+ 状态条边框（每侧 1）+ 状态条 px-3（每侧 12）+ 格间 gap-3（12）。
const WIDGET_CELL_WIDTH: f64 = 68.0;
// topModel 是模型名文本，给双倍宽度，超长截断
const WIDGET_TEXT_CELL_WIDTH: f64 = 136.0;
const WIDGET_CELL_GAP: f64 = 12.0;
const WIDGET_BAR_PADDING_X: f64 = 12.0;
const WIDGET_FRAME: f64 = 14.0;
// 状态条高 h-9（36，含边框）+ 外层上下 p-1.5（12）
const WIDGET_HEIGHT: f64 = 48.0;
// 默认位置横向贴右的边距。
const WIDGET_DEFAULT_MARGIN: f64 = 24.0;
// 记录位置视为"可见"所需的最小可见区域：露出太少的窗口无法被抓取，按不可见处理。
const VISIBLE_MIN_WIDTH: f64 = 48.0;
const VISIBLE_MIN_HEIGHT: f64 = 32.0;
// move 事件防抖时长：拖动停止后才落盘，避免拖动过程中频繁写盘。
const GEOMETRY_SAVE_DEBOUNCE: Duration = Duration::from_millis(500);

/// 防抖代际计数：每次 move 递增，延时到期时代际未变才真正落盘。
static GEOMETRY_SAVE_GENERATION: AtomicU64 = AtomicU64::new(0);

/// 显示器矩形（逻辑像素，全局坐标）。
#[derive(Debug, Clone, Copy, PartialEq)]
struct MonitorRect {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
}

impl MonitorRect {
    fn from_monitor(monitor: &Monitor) -> Self {
        let scale = monitor.scale_factor();
        let size = monitor.size().to_logical::<f64>(scale);
        let origin = monitor.position().to_logical::<f64>(scale);
        Self {
            x: origin.x,
            y: origin.y,
            width: size.width,
            height: size.height,
        }
    }

    /// 与给定窗口矩形的交集尺寸（无交集时宽或高为 0）。
    fn intersection(&self, x: f64, y: f64, width: f64, height: f64) -> (f64, f64) {
        let overlap_w = (self.x + self.width).min(x + width) - self.x.max(x);
        let overlap_h = (self.y + self.height).min(y + height) - self.y.max(y);
        (overlap_w.max(0.0), overlap_h.max(0.0))
    }
}

/// 按所选指标计算状态条的固定窗口尺寸（逻辑像素）。指标列表为空时按 1 格计算。
fn widget_size(metrics: &[String]) -> (f64, f64) {
    let cells: f64 = metrics
        .iter()
        .map(|metric| {
            if metric == "topModel" {
                WIDGET_TEXT_CELL_WIDTH
            } else {
                WIDGET_CELL_WIDTH
            }
        })
        .sum::<f64>()
        .max(WIDGET_CELL_WIDTH);
    let gaps = metrics.len().saturating_sub(1) as f64 * WIDGET_CELL_GAP;
    (
        cells + gaps + WIDGET_BAR_PADDING_X * 2.0 + WIDGET_FRAME,
        WIDGET_HEIGHT,
    )
}

/// 默认位置：主屏右偏下（横向贴右留边距，纵向落在可用高度约 60% 处）。基于实际尺寸计算。
fn default_position(primary: MonitorRect, width: f64, height: f64) -> (f64, f64) {
    let x = primary.x + primary.width - width - WIDGET_DEFAULT_MARGIN;
    let y = primary.y + (primary.height - height) * 0.6;
    (x, y)
}

/// 按记录与当前显示器布局解析浮窗位置；返回 None 时交给系统默认位置：
/// - 无记录：主屏默认位置；
/// - 记录位置在某显示器可见区域内：恢复记录，并把窗口平移回该显示器边界内；
/// - 记录位置不在任何显示器可见区域内（如外接屏已断开）：回落主屏默认位置。
fn resolve_widget_position(
    saved: Option<WidgetGeometry>,
    (width, height): (f64, f64),
    monitors: &[MonitorRect],
    primary: Option<MonitorRect>,
) -> Option<(f64, f64)> {
    let fallback = || primary.map(|p| default_position(p, width, height));
    let Some(saved) = saved else {
        return fallback();
    };
    let (x, y) = (f64::from(saved.x), f64::from(saved.y));

    // 取可见交集最大的显示器作为归属显示器
    let host = monitors
        .iter()
        .filter_map(|monitor| {
            let (overlap_w, overlap_h) = monitor.intersection(x, y, width, height);
            let visible = overlap_w >= VISIBLE_MIN_WIDTH.min(width)
                && overlap_h >= VISIBLE_MIN_HEIGHT.min(height);
            visible.then_some((*monitor, overlap_w * overlap_h))
        })
        .max_by(|a, b| a.1.total_cmp(&b.1))
        .map(|(monitor, _)| monitor);

    match host {
        // 平移回显示器边界内；max/min 顺序保证左上角优先可见
        Some(monitor) => Some((
            x.min(monitor.x + monitor.width - width).max(monitor.x),
            y.min(monitor.y + monitor.height - height).max(monitor.y),
        )),
        None => fallback(),
    }
}

/// 查询当前显示器布局（借主窗口查询：主窗口在 setup 阶段已存在，即便隐藏也可查询）。
fn query_monitors(app: &AppHandle) -> (Vec<MonitorRect>, Option<MonitorRect>) {
    let Some(main) = app.get_webview_window("main") else {
        return (Vec::new(), None);
    };
    let monitors = main
        .available_monitors()
        .map(|list| list.iter().map(MonitorRect::from_monitor).collect())
        .unwrap_or_default();
    let primary = main
        .primary_monitor()
        .ok()
        .flatten()
        .map(|monitor| MonitorRect::from_monitor(&monitor));
    (monitors, primary)
}

/// 创建浮窗窗口（无边框、透明、置顶、跨桌面常驻、不进任务栏、固定尺寸）。
fn create_widget_window(app: &AppHandle) -> tauri::Result<()> {
    let preferences = crate::config::load_app_preferences();
    let size = widget_size(&preferences.floating_widget_metrics);
    let (monitors, primary) = query_monitors(app);
    let position = resolve_widget_position(
        preferences.floating_widget_geometry,
        size,
        &monitors,
        primary,
    );

    let mut builder = WebviewWindowBuilder::new(
        app,
        WIDGET_WINDOW_LABEL,
        WebviewUrl::App("index.html?window=widget".into()),
    )
    .title("Code Manager")
    .inner_size(size.0, size.1)
    .decorations(false)
    .transparent(true)
    .always_on_top(true)
    // 跨所有 macOS 桌面(Spaces)与应用切换始终可见，避免切换桌面后浮窗"消失"
    .visible_on_all_workspaces(true)
    .skip_taskbar(true)
    // 固定尺寸状态条：尺寸只随所选指标数量变化，由 sync_widget 调整
    .resizable(false)
    .shadow(false);

    // 有记录按记录恢复，否则主屏右偏下；查询不到显示器则回落系统默认位置。
    // 隐藏/再显示不重建窗口，沿用当前位置。
    if let Some((x, y)) = position {
        builder = builder.position(x, y);
    }

    let window = builder.build()?;
    let handle = window.clone();
    window.on_window_event(move |event| {
        if matches!(event, WindowEvent::Moved(_)) {
            schedule_geometry_save(handle.clone());
        }
    });
    Ok(())
}

/// 读取浮窗当前位置（逻辑像素取整）。
fn current_geometry(window: &WebviewWindow) -> Option<WidgetGeometry> {
    let scale = window.scale_factor().ok()?;
    let position = window.outer_position().ok()?.to_logical::<f64>(scale);
    Some(WidgetGeometry {
        x: position.x.round() as i32,
        y: position.y.round() as i32,
    })
}

/// 防抖保存浮窗位置：最后一次 move 后静默 GEOMETRY_SAVE_DEBOUNCE 才落盘。
fn schedule_geometry_save(window: WebviewWindow) {
    let generation = GEOMETRY_SAVE_GENERATION.fetch_add(1, Ordering::SeqCst) + 1;
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(GEOMETRY_SAVE_DEBOUNCE).await;
        if GEOMETRY_SAVE_GENERATION.load(Ordering::SeqCst) != generation {
            return;
        }
        let Some(geometry) = current_geometry(&window) else {
            return;
        };
        if let Err(error) = crate::config::set_floating_widget_geometry(geometry) {
            log::warn!("event=widget.geometry_save status=error detail={error}");
        }
    });
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

/// 按偏好同步浮窗：显隐跟随启用开关，已存在的窗口按所选指标数量调整固定尺寸。
/// 启动时与偏好变更后调用，失败只记日志不影响主流程。
pub fn sync_widget(app: &AppHandle, preferences: &AppPreferences) {
    if let Some(window) = app.get_webview_window(WIDGET_WINDOW_LABEL) {
        let (width, height) = widget_size(&preferences.floating_widget_metrics);
        if let Err(error) = window.set_size(LogicalSize::new(width, height)) {
            log::warn!("event=widget.resize status=error detail={error}");
        }
    }
    if let Err(error) = toggle_floating_widget(app.clone(), preferences.floating_widget_enabled) {
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

#[cfg(test)]
mod tests {
    use super::*;

    fn monitor(x: f64, y: f64, width: f64, height: f64) -> MonitorRect {
        MonitorRect {
            x,
            y,
            width,
            height,
        }
    }

    fn metrics(keys: &[&str]) -> Vec<String> {
        keys.iter().map(|key| key.to_string()).collect()
    }

    const PRIMARY: MonitorRect = MonitorRect {
        x: 0.0,
        y: 0.0,
        width: 1440.0,
        height: 900.0,
    };
    const SIZE: (f64, f64) = (266.0, 48.0);

    #[test]
    fn legacy_preferences_without_geometry_deserialize_to_none() {
        // 旧偏好文件没有 floatingWidgetGeometry 字段时应正常加载并默认为 None
        let prefs: AppPreferences =
            serde_json::from_str(r#"{"floatingWidgetEnabled":true}"#).expect("旧偏好应能反序列化");
        assert!(prefs.floating_widget_enabled);
        assert_eq!(prefs.floating_widget_geometry, None);
    }

    #[test]
    fn legacy_geometry_with_size_fields_keeps_only_position() {
        // 旧版本记录带 width/height，固定尺寸后只取位置，多余字段忽略
        let prefs: AppPreferences = serde_json::from_str(
            r#"{"floatingWidgetGeometry":{"x":-100,"y":40,"width":320,"height":200}}"#,
        )
        .expect("带尺寸的旧记录应能反序列化");
        assert_eq!(
            prefs.floating_widget_geometry,
            Some(WidgetGeometry { x: -100, y: 40 })
        );
        let json = serde_json::to_value(&prefs).unwrap();
        assert_eq!(
            json["floatingWidgetGeometry"],
            serde_json::json!({"x": -100, "y": 40})
        );
    }

    #[test]
    fn default_three_metrics_form_a_single_row_bar() {
        let (width, height) = widget_size(&metrics(&["cost", "totalTokens", "cacheHitRate"]));
        assert_eq!(width, 3.0 * 68.0 + 2.0 * 12.0 + 24.0 + 14.0);
        assert_eq!(height, WIDGET_HEIGHT);
    }

    #[test]
    fn width_grows_per_metric_and_top_model_takes_a_wide_cell() {
        let narrow = widget_size(&metrics(&["cost"])).0;
        let wide = widget_size(&metrics(&["cost", "topModel"])).0;
        assert_eq!(wide - narrow, WIDGET_TEXT_CELL_WIDTH + WIDGET_CELL_GAP);
    }

    #[test]
    fn empty_metrics_still_reserve_one_cell() {
        assert_eq!(widget_size(&[]), widget_size(&metrics(&["cost"])));
    }

    #[test]
    fn no_record_uses_default_position() {
        let position = resolve_widget_position(None, SIZE, &[PRIMARY], Some(PRIMARY));
        assert_eq!(position, Some(default_position(PRIMARY, SIZE.0, SIZE.1)));
    }

    #[test]
    fn default_position_is_based_on_actual_size() {
        let (x, y) = default_position(PRIMARY, 400.0, 300.0);
        assert_eq!(x, 1440.0 - 400.0 - 24.0);
        assert_eq!(y, (900.0 - 300.0) * 0.6);
    }

    #[test]
    fn record_inside_visible_area_is_restored_as_is() {
        let saved = WidgetGeometry { x: 200, y: 150 };
        let position = resolve_widget_position(Some(saved), SIZE, &[PRIMARY], Some(PRIMARY));
        assert_eq!(position, Some((200.0, 150.0)));
    }

    #[test]
    fn record_on_secondary_monitor_is_restored() {
        let secondary = monitor(1440.0, -200.0, 1920.0, 1080.0);
        let saved = WidgetGeometry { x: 2000, y: 0 };
        let position =
            resolve_widget_position(Some(saved), SIZE, &[PRIMARY, secondary], Some(PRIMARY));
        assert_eq!(position, Some((2000.0, 0.0)));
    }

    #[test]
    fn partially_offscreen_record_is_pulled_back_inside_monitor() {
        // 右下角超出屏幕但仍有足够可见区域：保留所在显示器，平移回边界内
        let saved = WidgetGeometry { x: 1300, y: 860 };
        let position = resolve_widget_position(Some(saved), SIZE, &[PRIMARY], Some(PRIMARY));
        assert_eq!(position, Some((1440.0 - SIZE.0, 900.0 - SIZE.1)));
    }

    #[test]
    fn record_outside_all_monitors_falls_back_to_default_position() {
        // 外接屏已断开：记录位置不在任何显示器可见区域内
        let saved = WidgetGeometry { x: 3000, y: 200 };
        let position = resolve_widget_position(Some(saved), SIZE, &[PRIMARY], Some(PRIMARY));
        assert_eq!(position, Some(default_position(PRIMARY, SIZE.0, SIZE.1)));
    }

    #[test]
    fn barely_visible_sliver_counts_as_not_visible() {
        // 仅露出几像素的窗口无法被抓取，视为不可见并回落默认位置
        let saved = WidgetGeometry { x: 1436, y: 100 };
        let position = resolve_widget_position(Some(saved), SIZE, &[PRIMARY], Some(PRIMARY));
        assert_eq!(position, Some(default_position(PRIMARY, SIZE.0, SIZE.1)));
    }

    #[test]
    fn without_monitor_info_leaves_position_to_system() {
        let saved = WidgetGeometry { x: 10, y: 10 };
        assert_eq!(resolve_widget_position(Some(saved), SIZE, &[], None), None);
    }
}
