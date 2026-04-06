# ModelScope 内置 Provider 支持设计

## 概述

为 AI Manager 新增 `ModelScope` 内置 Provider，使用户在配置编辑器中选择 Provider 时可以直接选中 `ModelScope`，自动带出预设的 Base URL 和模型列表，减少手动填写出错。

## 目标

- 在内置 Provider 列表中新增一条 `ModelScope`
- 保持现有 Provider 数据结构、初始化逻辑和前端选择逻辑不变
- 为新增内置项补一条回归测试，避免后续维护时被遗漏

## 设计

### 数据来源

沿用现有内置 Provider 机制，只修改 `src-tauri/resources/builtin-providers.json`，不新增专门的后端逻辑分支。

新增条目字段如下：

- `name`: `ModelScope`
- `slug`: `modelscope`
- `baseUrl`: `https://api-inference.modelscope.cn`
- `docUrl`: `https://modelscope.cn`
- `models`: 先内置 `ZhipuAI/GLM-5`

### 行为影响

- `get_providers()` 初始化和补全内置 Provider 时会自动包含 `ModelScope`
- 配置编辑器中的 Provider 下拉会自动显示 `ModelScope`
- 选择 `ModelScope` 后，现有联动逻辑会自动带出 Base URL 与模型选项

## 测试

- 在 `src-tauri/src/provider.rs` 中新增测试，校验内置 Provider 列表包含 `modelscope`
- 同时校验其 `base_url`、`doc_url` 和默认模型值，确保数据完整

## 非目标

- 不新增 ModelScope 专属前端文案或特殊逻辑
- 不做 Provider 在线探测
- 不自动从远端同步 ModelScope 模型列表
