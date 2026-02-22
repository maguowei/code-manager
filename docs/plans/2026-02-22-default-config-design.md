# 通用配置（Default Config）设计

**日期**: 2026-02-22
**状态**: 已批准

## 概述

在配置管理模块中增加"通用配置"功能，允许用户定义一份自由编辑的 JSON 作为默认配置。激活任何具体配置时，通用配置与具体配置深度合并后写入 `~/.claude/settings.json`。

## 需求

1. 通用配置是一个自由编辑的 JSON，可以包含任意 Claude Code 支持的配置项
2. 存储在 `configs.json` 的 `defaults` 字段中（JSON 字符串形式）
3. 在 ConfigModal 弹窗中以可折叠区域的形式提供编辑入口
4. 激活配置时，通用配置与具体配置做深度合并（对象递归合并，非对象类型具体配置优先）
5. JSON 预览展示合并后的最终结果

## 数据结构

### 后端 AppState 变更

```rust
pub struct AppState {
    pub configs: Vec<ClaudeConfig>,
    pub active_config_id: Option<String>,
    pub defaults: Option<String>,  // 新增：通用配置 JSON 字符串
}
```

### 存储格式

`~/.config/ai-manager/configs.json`：

```json
{
  "configs": [...],
  "activeConfigId": "xxx",
  "defaults": "{\n  \"language\": \"chinese\",\n  \"alwaysThinkingEnabled\": true\n}"
}
```

`defaults` 存储为 JSON 字符串（而非嵌套对象），后端不需要知道通用配置的 schema。

## 新增 Tauri 命令

- `get_defaults()` → `Option<String>` — 获取通用配置 JSON 字符串
- `update_defaults(content: String)` → `()` — 更新通用配置（前端负责校验 JSON 合法性）

## apply_config 变更

1. 先解析 `defaults` 为 `serde_json::Value`
2. 再生成当前配置的 JSON（现有逻辑）
3. 深度合并：`defaults` 为基础，当前配置覆盖
4. 写入 `~/.claude/settings.json`

## 深度合并逻辑

```
deepMerge(defaults, current):
  对于 defaults 中的每个 key:
    - 如果 current 中不存在此 key → 使用 defaults 的值
    - 如果 current 中存在此 key:
      - 两者都是对象 → 递归 deepMerge
      - 否则 → 使用 current 的值（current 优先）
```

### 合并示例

通用配置（defaults）：
```json
{
  "language": "chinese",
  "alwaysThinkingEnabled": true,
  "env": {
    "ANTHROPIC_BASE_URL": "https://api.default.com",
    "CUSTOM_VAR": "shared-value"
  }
}
```

当前配置生成的 JSON：
```json
{
  "env": {
    "ANTHROPIC_AUTH_TOKEN": "sk-xxx",
    "ANTHROPIC_BASE_URL": "https://api.specific.com"
  }
}
```

深度合并结果：
```json
{
  "language": "chinese",
  "alwaysThinkingEnabled": true,
  "env": {
    "ANTHROPIC_AUTH_TOKEN": "sk-xxx",
    "ANTHROPIC_BASE_URL": "https://api.specific.com",
    "CUSTOM_VAR": "shared-value"
  }
}
```

实现位置：
- **后端**：`apply_config` 中实现 `deep_merge` 函数
- **前端**：`types.ts` 中实现 `deepMerge` 工具函数，供 JSON 预览使用

## UI 设计

### ConfigModal 布局

在"高级选项"和"配置预览"之间新增折叠区域：

```
[模型配置]
[语言配置]
[插件市场]
[已启用插件]
[高级选项]
[通用配置]     ← 新增
[配置预览]     ← 改为展示合并后结果
```

### 通用配置折叠区域

- 可折叠，默认收起
- 内含等宽字体 textarea（min-height: 200px）
- textarea 下方提示文字：说明深度合并行为
- JSON 格式校验：非法 JSON 时显示红色错误提示并阻止保存

### JSON 预览变更

- 展示合并后的最终结果（通用配置 + 当前配置）
- 标题改为"配置预览（含通用配置）"

### 交互流程

1. 用户展开"通用配置"区域
2. 编辑 JSON 内容
3. 点击保存 → 同时保存具体配置和通用配置
4. JSON 格式非法时阻止保存并提示错误

## 国际化

中文：
```
"configModal.defaults": "通用配置"
"configModal.defaultsPlaceholder": "输入通用配置 JSON..."
"configModal.defaultsHint": "通用配置会与当前配置深度合并，当前配置的字段优先"
"configModal.defaultsError": "JSON 格式不正确"
"configModal.jsonPreviewMerged": "配置预览（含通用配置）"
```

英文：
```
"configModal.defaults": "Default Config"
"configModal.defaultsPlaceholder": "Enter default config JSON..."
"configModal.defaultsHint": "Default config will be deep-merged with current config. Current config fields take priority"
"configModal.defaultsError": "Invalid JSON format"
"configModal.jsonPreviewMerged": "Config Preview (with defaults)"
```

## 需要修改/新建的文件

### 后端
1. `src-tauri/src/config.rs` — AppState 新增 defaults 字段、新增 get_defaults/update_defaults 命令、apply_config 增加深度合并
2. `src-tauri/src/lib.rs` — 注册新命令

### 前端
3. `src/types.ts` — AppState 新增 defaults 字段、新增 deepMerge 工具函数
4. `src/components/ConfigModal.tsx` — 新增通用配置折叠区域、JSON 预览改为合并结果
5. `src/components/ConfigModal.css` — textarea 样式（复用 MemoryModal 的等宽字体样式）
6. `src/i18n.ts` — 新增翻译 key
7. `src/App.tsx` — 传递 defaults 给 ConfigModal、保存时调用 update_defaults

## 验证

1. `cargo check` — Rust 编译通过
2. `pnpm build` — 前端构建通过
3. 打开 ConfigModal，展开通用配置区域，输入合法 JSON 并保存
4. 输入非法 JSON，验证错误提示且无法保存
5. 编辑通用配置后，JSON 预览实时展示合并结果
6. 激活配置，验证 `~/.claude/settings.json` 包含合并后的内容
7. 深度合并行为正确：对象递归合并，非对象当前配置优先
8. 通用配置为空时，行为与之前完全一致（无回归）
