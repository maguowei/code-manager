# ConfigPreview 双向同步可编辑设计

## 概述

将配置编辑页面的 JSON 预览区域从只读改为可编辑，实现表单字段与 JSON 预览的双向同步。

## 需求

1. 用户可以在预览区直接编辑 JSON
2. 编辑预览 JSON 时，已知字段自动反写回表单
3. 表单字段变更时，预览区同步更新（现有行为）
4. 用户在 JSON 中手动添加的额外字段（表单不支持的）会被保留
5. 表单优先：当两边同时修改同一字段时，以表单为准

## 架构

```
表单字段变更 ──→ invoke("preview_config") ──→ 合并 extraFields ──→ JSON 预览
     ↑                                                               ↓ (用户编辑)
     │                                                          parseJsonToForm()
     │                                                               ↓
     └───────── 更新表单 state ←──────────────── 提取已知字段 + extraFields
```

## 字段映射表

| JSON 路径 | 表单字段 |
|-----------|---------|
| `env.ANTHROPIC_AUTH_TOKEN` | `apiKey` |
| `env.ANTHROPIC_BASE_URL` | `apiUrl` |
| `env.CLAUDE_CODE_API_WEBSITE_URL` | `websiteUrl` |
| `model` | `model` |
| `thinkingModel` | `thinkingModel` |
| `haikuModel` | `haikuModel` |
| `sonnetModel` | `sonnetModel` |
| `opusModel` | `opusModel` |
| `alwaysThinkingEnabled` | `alwaysThinkingEnabled` |
| `disableNonessentialTraffic` | `disableNonessentialTraffic` |
| `skipWebFetchPreflight` | `skipWebFetchPreflight` |
| `enableLspTool` | `enableLspTool` |
| `agentTeamsEnabled` | `enableAgentTeams` |
| `hasCompletedOnboarding` | `hasCompletedOnboarding` |
| `enableExtraMarketplaces` | `enableExtraMarketplaces` |
| `preferredLanguage` | `preferredLanguage` |
| `enabledPlugins` | `enabledPlugins` |

## 组件变更

### ConfigPreview.tsx

- `editable` 属性改为 `true`
- 新增 `onChange(value: string)` 回调 prop
- 用户编辑时触发 `onChange`
- 增加 JSON 语法错误提示（编辑器下方红色提示条）

### ConfigEditor.tsx

- 新增 `extraFields` state（`Record<string, unknown>`）：存储表单不支持的额外字段
- 新增 `isEditingPreview` ref：标记用户是否正在编辑预览区
- 新增 `parseJsonToForm(json: string)` 函数：
  - 解析 JSON
  - 按字段映射表提取已知字段，更新对应表单 state
  - 剩余字段存入 `extraFields`
- 修改预览生成逻辑：`preview_config` 结果与 `extraFields` 深度合并后设置 `previewJson`
- `isEditingPreview` 为 true 时，表单变更不覆盖预览区文本（避免光标跳动）

### 后端变更

- `ConfigData` 增加 `extra_fields: Option<HashMap<String, serde_json::Value>>` 字段
- `build_config_value` 生成 JSON 后，将 `extra_fields` 合并进去
- 保证保存和预览都能正确包含额外字段

## 防抖与编辑冲突

- 用户编辑预览时设置 `isEditingPreview = true`
- `isEditingPreview` 为 true 时，表单变更触发的 `preview_config` 结果不覆盖预览区
- 用户停止编辑 1 秒后或 `onBlur` 时，设 `isEditingPreview = false`

## 错误处理

- 非法 JSON：预览区下方显示红色错误提示
- 非法 JSON 状态下不触发 `parseJsonToForm`，表单保持上一次有效状态
- JSON 格式错误时保存按钮禁用

## 保存逻辑

- `onSave` 参数增加 `extraFields`
- 调用后端 `add_config` / `update_config` 时传递 `extra_fields`
- 后端 `build_config_value` + `apply_config` 正确合并额外字段写入 `settings.json`
