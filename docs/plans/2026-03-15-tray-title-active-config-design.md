# 托盘图标显示当前激活配置名

## 概述

在 macOS 菜单栏的托盘图标旁边显示当前激活的配置名称，让用户无需点击菜单即可看到正在使用的配置。

## 设计

### 变更文件

仅 `src-tauri/src/tray.rs`

### 实现逻辑

在两处添加 `set_title` 调用：

1. **`setup_tray`**：初始化托盘时，根据当前激活配置设置 title
2. **`rebuild_tray_menu`**：配置变更刷新菜单时，同步更新 title

规则：
- 有激活配置 → `set_title(Some(配置名))`
- 无激活配置 → `set_title(None)`（不显示文字）

### 影响

- 不新增前端代码、不新增 Rust 命令、不改变数据结构
- 所有配置变更路径已走 `rebuild_tray_menu`，title 自动同步
