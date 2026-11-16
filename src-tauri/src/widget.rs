//! 桌面用量浮窗：置顶、跨桌面常驻、无边框、半透明的小窗，实时展示今日用量指标。
//!
//! 窗口在偏好启用时由 `WebviewWindowBuilder` 动态创建，加载主前端入口并携带
//! `?window=widget` 参数，前端据此只渲染浮窗组件而非完整应用壳。

use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Duration;

use tauri::{
    AppHandle, Emitter, Manager, Monitor, WebviewUrl, WebviewWindow, WebviewWindowBuilder,
    WindowEvent,
};

use crate::config::WidgetGeometry;

/// 浮窗窗口 label，capability 作用域与窗口查找都依赖该常量。
pub const WIDGET_WINDOW_LABEL: &str = "widget";

// 浮窗默认尺寸：紧凑小窗，足够容纳数项 KPI。
const WIDGET_WIDTH: f64 = 248.0;
const WIDGET_HEIGHT: f64 = 148.0;
// 浮窗最小尺寸：保证标题条与至少一行指标可见。
const WIDGET_MIN_WIDTH: f64 = 196.0;
const WIDGET_MIN_HEIGHT: f64 = 96.0;
// 默认位置横向贴右的边距。
const WIDGET_DEFAULT_MARGIN: f64 = 24.0;
// 记录位置视为"可见"所需的最小可见区域：露出太少的窗口无法被抓取，按不可见处理。
const VISIBLE_MIN_WIDTH: f64 = 48.0;
const VISIBLE_MIN_HEIGHT: f64 = 32.0;
// resize/move 事件防抖时长：拖动停止后才落盘，避免拖动过程中频繁写盘。
const GEOMETRY_SAVE_DEBOUNCE: Duration = Duration::from_millis(500);

/// 防抖代际计数：每次 resize/move 递增，延时到期时代际未变才真正落盘。
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

/// 恢复浮窗时实际采用的尺寸与位置；position 为 None 时交给系统默认位置。
#[derive(Debug, Clone, Copy, PartialEq)]
struct ResolvedGeometry {
    width: f64,
    height: f64,
    position: Option<(f64, f64)>,
}

/// 尺寸边界处理：不小于最小尺寸，不大于所在显示器（显示器比最小尺寸还小时以最小尺寸为准）。
fn clamp_size(width: f64, height: f64, monitor: Option<MonitorRect>) -> (f64, f64) {
    let (max_w, max_h) = monitor.map_or((f64::INFINITY, f64::INFINITY), |m| (m.width, m.height));
    (
        width.min(max_w).max(WIDGET_MIN_WIDTH),
        height.min(max_h).max(WIDGET_MIN_HEIGHT),
    )
}

/// 默认位置：主屏右偏下（横向贴右留边距，纵向落在可用高度约 60% 处）。基于实际尺寸计算。
fn default_position(primary: MonitorRect, width: f64, height: f64) -> (f64, f64) {
    let x = primary.x + primary.width - width - WIDGET_DEFAULT_MARGIN;
    let y = primary.y + (primary.height - height) * 0.6;
    (x, y)
}

/// 回落到主屏默认位置：尺寸按主屏限制，位置基于限制后的实际尺寸计算。
fn fallback_to_default(width: f64, height: f64, primary: Option<MonitorRect>) -> ResolvedGeometry {
    let (width, height) = clamp_size(width, height, primary);
    ResolvedGeometry {
        width,
        height,
        position: primary.map(|p| default_position(p, width, height)),
    }
}

/// 按记录与当前显示器布局解析浮窗几何：
/// - 无记录：默认尺寸 + 默认位置；
/// - 记录位置在某显示器可见区域内：恢复记录，尺寸限制在该显示器内，并把窗口平移回该显示器边界内；
/// - 记录位置不在任何显示器可见区域内（如外接屏已断开）：保留尺寸（按主屏限制），回落默认位置。
fn resolve_widget_geometry(
    saved: Option<WidgetGeometry>,
    monitors: &[MonitorRect],
    primary: Option<MonitorRect>,
) -> ResolvedGeometry {
    let Some(saved) = saved else {
        return fallback_to_default(WIDGET_WIDTH, WIDGET_HEIGHT, primary);
    };

    let (x, y) = (f64::from(saved.x), f64::from(saved.y));
    let (raw_w, raw_h) = clamp_size(f64::from(saved.width), f64::from(saved.height), None);

    // 取可见交集最大的显示器作为归属显示器
    let host = monitors
        .iter()
        .filter_map(|monitor| {
            let (overlap_w, overlap_h) = monitor.intersection(x, y, raw_w, raw_h);
            let visible = overlap_w >= VISIBLE_MIN_WIDTH.min(raw_w)
                && overlap_h >= VISIBLE_MIN_HEIGHT.min(raw_h);
            visible.then_some((*monitor, overlap_w * overlap_h))
        })
        .max_by(|a, b| a.1.total_cmp(&b.1))
        .map(|(monitor, _)| monitor);

    match host {
        Some(monitor) => {
            let (width, height) = clamp_size(raw_w, raw_h, Some(monitor));
            // 平移回显示器边界内；尺寸已不超过显示器，max/min 顺序保证左上角优先可见
            let x = x.min(monitor.x + monitor.width - width).max(monitor.x);
            let y = y.min(monitor.y + monitor.height - height).max(monitor.y);
            ResolvedGeometry {
                width,
                height,
                position: Some((x, y)),
            }
        }
        None => fallback_to_default(raw_w, raw_h, primary),
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

/// 创建浮窗窗口（无边框、透明、置顶、跨桌面常驻、不进任务栏、可缩放）。
fn create_widget_window(app: &AppHandle) -> tauri::Result<()> {
    let saved = crate::config::load_app_preferences().floating_widget_geometry;
    let (monitors, primary) = query_monitors(app);
    let geometry = resolve_widget_geometry(saved, &monitors, primary);

    let mut builder = WebviewWindowBuilder::new(
        app,
        WIDGET_WINDOW_LABEL,
        WebviewUrl::App("index.html?window=widget".into()),
    )
    .title("Code Manager")
    .inner_size(geometry.width, geometry.height)
    .min_inner_size(WIDGET_MIN_WIDTH, WIDGET_MIN_HEIGHT)
    .decorations(false)
    .transparent(true)
    .always_on_top(true)
    // 跨所有 macOS 桌面(Spaces)与应用切换始终可见，避免切换桌面后浮窗"消失"
    .visible_on_all_workspaces(true)
    .skip_taskbar(true)
    // 允许缩放：无边框窗口的边缘缩放依平台而定，前端另提供右下角缩放把手兜底
    .resizable(true)
    .shadow(false);

    // 有记录按记录恢复，否则主屏右偏下；查询不到显示器则回落系统默认位置。
    // 隐藏/再显示不重建窗口，沿用当前尺寸与位置。
    if let Some((x, y)) = geometry.position {
        builder = builder.position(x, y);
    }

    let window = builder.build()?;
    let handle = window.clone();
    window.on_window_event(move |event| {
        if matches!(event, WindowEvent::Moved(_) | WindowEvent::Resized(_)) {
            schedule_geometry_save(handle.clone());
        }
    });
    Ok(())
}

/// 读取浮窗当前几何（逻辑像素取整）；窗口尺寸为 0（最小化等）时返回 None。
fn current_geometry(window: &WebviewWindow) -> Option<WidgetGeometry> {
    let scale = window.scale_factor().ok()?;
    let position = window.outer_position().ok()?.to_logical::<f64>(scale);
    let size = window.inner_size().ok()?.to_logical::<f64>(scale);
    if size.width < 1.0 || size.height < 1.0 {
        return None;
    }
    Some(WidgetGeometry {
        x: position.x.round() as i32,
        y: position.y.round() as i32,
        width: size.width.round() as u32,
        height: size.height.round() as u32,
    })
}

/// 防抖保存浮窗几何：最后一次 resize/move 后静默 GEOMETRY_SAVE_DEBOUNCE 才落盘。
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::{AppPreferences, WidgetGeometry};

    fn monitor(x: f64, y: f64, width: f64, height: f64) -> MonitorRect {
        MonitorRect {
            x,
            y,
            width,
            height,
        }
    }

    const PRIMARY: MonitorRect = MonitorRect {
        x: 0.0,
        y: 0.0,
        width: 1440.0,
        height: 900.0,
    };

    #[test]
    fn legacy_preferences_without_geometry_deserialize_to_none() {
        // 旧偏好文件没有 floatingWidgetGeometry 字段时应正常加载并默认为 None
        let prefs: AppPreferences =
            serde_json::from_str(r#"{"floatingWidgetEnabled":true}"#).expect("旧偏好应能反序列化");
        assert!(prefs.floating_widget_enabled);
        assert_eq!(prefs.floating_widget_geometry, None);
    }

    #[test]
    fn geometry_round_trips_through_serde() {
        let prefs = AppPreferences {
            floating_widget_geometry: Some(WidgetGeometry {
                x: -100,
                y: 40,
                width: 320,
                height: 200,
            }),
            ..AppPreferences::default()
        };
        let json = serde_json::to_value(&prefs).unwrap();
        assert_eq!(
            json["floatingWidgetGeometry"],
            serde_json::json!({"x": -100, "y": 40, "width": 320, "height": 200})
        );
        let back: AppPreferences = serde_json::from_value(json).unwrap();
        assert_eq!(back, prefs);
    }

    #[test]
    fn no_record_uses_default_size_and_default_position() {
        let resolved = resolve_widget_geometry(None, &[PRIMARY], Some(PRIMARY));
        assert_eq!(resolved.width, WIDGET_WIDTH);
        assert_eq!(resolved.height, WIDGET_HEIGHT);
        assert_eq!(
            resolved.position,
            Some(default_position(PRIMARY, WIDGET_WIDTH, WIDGET_HEIGHT))
        );
    }

    #[test]
    fn default_position_is_based_on_actual_size() {
        let (x, y) = default_position(PRIMARY, 400.0, 300.0);
        assert_eq!(x, 1440.0 - 400.0 - 24.0);
        assert_eq!(y, (900.0 - 300.0) * 0.6);
    }

    #[test]
    fn record_inside_visible_area_is_restored_as_is() {
        let saved = WidgetGeometry {
            x: 200,
            y: 150,
            width: 360,
            height: 220,
        };
        let resolved = resolve_widget_geometry(Some(saved), &[PRIMARY], Some(PRIMARY));
        assert_eq!(resolved.width, 360.0);
        assert_eq!(resolved.height, 220.0);
        assert_eq!(resolved.position, Some((200.0, 150.0)));
    }

    #[test]
    fn record_on_secondary_monitor_is_restored() {
        let secondary = monitor(1440.0, -200.0, 1920.0, 1080.0);
        let saved = WidgetGeometry {
            x: 2000,
            y: 0,
            width: 300,
            height: 180,
        };
        let resolved = resolve_widget_geometry(Some(saved), &[PRIMARY, secondary], Some(PRIMARY));
        assert_eq!(resolved.position, Some((2000.0, 0.0)));
    }

    #[test]
    fn size_below_minimum_is_raised_to_minimum() {
        let saved = WidgetGeometry {
            x: 100,
            y: 100,
            width: 50,
            height: 20,
        };
        let resolved = resolve_widget_geometry(Some(saved), &[PRIMARY], Some(PRIMARY));
        assert_eq!(resolved.width, WIDGET_MIN_WIDTH);
        assert_eq!(resolved.height, WIDGET_MIN_HEIGHT);
    }

    #[test]
    fn size_larger_than_monitor_is_clamped_to_monitor() {
        let saved = WidgetGeometry {
            x: 0,
            y: 0,
            width: 5000,
            height: 4000,
        };
        let resolved = resolve_widget_geometry(Some(saved), &[PRIMARY], Some(PRIMARY));
        assert_eq!(resolved.width, 1440.0);
        assert_eq!(resolved.height, 900.0);
        assert_eq!(resolved.position, Some((0.0, 0.0)));
    }

    #[test]
    fn partially_offscreen_record_is_pulled_back_inside_monitor() {
        // 右下角超出屏幕但仍有足够可见区域：保留所在显示器，平移回边界内
        let saved = WidgetGeometry {
            x: 1300,
            y: 800,
            width: 300,
            height: 200,
        };
        let resolved = resolve_widget_geometry(Some(saved), &[PRIMARY], Some(PRIMARY));
        assert_eq!(resolved.position, Some((1140.0, 700.0)));
    }

    #[test]
    fn record_outside_all_monitors_falls_back_to_default_position() {
        // 外接屏已断开：记录位置不在任何显示器可见区域内
        let saved = WidgetGeometry {
            x: 3000,
            y: 200,
            width: 300,
            height: 180,
        };
        let resolved = resolve_widget_geometry(Some(saved), &[PRIMARY], Some(PRIMARY));
        assert_eq!(resolved.width, 300.0);
        assert_eq!(resolved.height, 180.0);
        assert_eq!(
            resolved.position,
            Some(default_position(PRIMARY, 300.0, 180.0))
        );
    }

    #[test]
    fn barely_visible_sliver_counts_as_not_visible() {
        // 仅露出几像素的窗口无法被抓取，视为不可见并回落默认位置
        let saved = WidgetGeometry {
            x: 1436,
            y: 100,
            width: 300,
            height: 180,
        };
        let resolved = resolve_widget_geometry(Some(saved), &[PRIMARY], Some(PRIMARY));
        assert_eq!(
            resolved.position,
            Some(default_position(PRIMARY, 300.0, 180.0))
        );
    }

    #[test]
    fn fallback_size_is_clamped_to_primary_monitor() {
        let small = monitor(0.0, 0.0, 800.0, 600.0);
        let saved = WidgetGeometry {
            x: 5000,
            y: 5000,
            width: 1200,
            height: 900,
        };
        let resolved = resolve_widget_geometry(Some(saved), &[small], Some(small));
        assert_eq!(resolved.width, 800.0);
        assert_eq!(resolved.height, 600.0);
    }

    #[test]
    fn without_monitor_info_keeps_size_and_leaves_position_to_system() {
        let saved = WidgetGeometry {
            x: 10,
            y: 10,
            width: 300,
            height: 180,
        };
        let resolved = resolve_widget_geometry(Some(saved), &[], None);
        assert_eq!(resolved.width, 300.0);
        assert_eq!(resolved.height, 180.0);
        assert_eq!(resolved.position, None);
    }
}
