# 托盘图标显示配置名 — 设置项

## 概述

将"在托盘图标旁显示当前激活配置名"作为可配置选项，放在设置抽屉中，默认开启。

## 数据层

`AppState` 新增 `show_tray_title: Option<bool>`（None 视为 true）。
新增 Rust 命令 `set_show_tray_title(show: bool)`，保存设置并刷新托盘。

## 托盘逻辑

`setup_tray` 和 `rebuild_tray_menu` 中根据 `show_tray_title` 决定是否调用 `set_title`。

## 前端

SettingsDrawer 新增开关项，调用 `invoke("set_show_tray_title")`。

## 变更文件

1. `src-tauri/src/config.rs` — AppState 加字段 + 新命令
2. `src-tauri/src/tray.rs` — set_title 逻辑
3. `src-tauri/src/lib.rs` — 注册命令
4. `src/components/SettingsDrawer.tsx` — 开关 UI
5. `src/i18n.ts` — 翻译
