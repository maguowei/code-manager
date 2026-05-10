---
paths:
  - "src/components/ProfilesPage.tsx"
  - "src/components/ProfileEditor.tsx"
  - "src/components/profile-editor/**/*"
  - "src/components/PresetsPage.tsx"
  - "src/components/PresetEditor.tsx"
  - "src/components/config-workspace-utils.ts"
  - "src/components/ProfileNameBadge.tsx"
  - "src/schemas/claude-settings.schema.json"
  - "src/schemas/form-fields.ts"
  - "src-tauri/src/config.rs"
  - "src-tauri/resources/builtin-providers.json"
  - "src-tauri/resources/statusline/default.sh"
  - "src/types.ts"
---

# Config System Rules

## 模型

项目采用 **Preset 链 -> Profile** 分层模型：Preset 是可复用配置层，Custom Preset 可通过 `basePresetId` 继承另一个 Preset；Profile 当前只引用一个 `presetId`，最终在 Preset 链之上叠加自身 `settings`。

## 先读文件

- `src/components/ProfilesPage.tsx`
- `src/components/ProfileEditor.tsx`
- `src/components/profile-editor/`
- `src/components/PresetsPage.tsx`
- `src/components/PresetEditor.tsx`
- `src/components/config-workspace-utils.ts`
- `src/schemas/claude-settings.schema.json`
- `src/components/profile-editor/settings-form-registry.ts`
- `src/components/profile-editor/status-line-utils.ts`
- `src-tauri/src/config.rs`
- `src-tauri/resources/builtin-providers.json`
- `src-tauri/resources/statusline/default.sh`
- `src/types.ts`

## 关键约束

- 配置表单不再有单独的 `ConfigEditor.tsx`；`ProfileEditor.tsx` 与 `PresetEditor.tsx` 共享 `settings-form-registry.ts` 与 profile-editor 子组件。
- `src/schemas/claude-settings.schema.json` 是 Claude settings 的共享 schema 锚点；Rust 通过 `include_str!` 加载并校验已知字段。
- `validate_settings_document()` 允许未知顶层键，但会校验 schema 已知字段的嵌套结构。
- `preview_profile`、`apply_profile` 和 `test_profile_model` 都依赖后端解析后的最终配置，前端不要复制合并逻辑。
- 合并权威逻辑是 `src-tauri/src/config.rs::resolve_profile_settings()`：先展开 Preset 链，再叠加 Profile `settings`，最后写入 `$schema`。
- 激活 Profile 最终会原子写入 `~/.claude/settings.json`，并更新 `configs.json` 的绑定状态。
- 已绑定的 Profile 被修改时，后端会重新应用到用户设置；不要绕开 `upsert_profile`。
- 内置 Preset 现已包含 Anthropic、DeepSeek 等；新增 provider 同步 `builtin-providers.json` 的 `localizedName` / `slug` / `baseUrl` / `docUrl`，并在 Profile 编辑器的环境变量自动填充逻辑中覆盖默认 model 字段（`ANTHROPIC_MODEL`、`ANTHROPIC_DEFAULT_OPUS_MODEL`、`ANTHROPIC_DEFAULT_SONNET_MODEL`、`ANTHROPIC_DEFAULT_HAIKU_MODEL`、`CLAUDE_CODE_SUBAGENT_MODEL`）。

## 结构化编辑器

- `settings-form-registry.ts` 定义行为与常用选项中的结构化字段。
- 专项复杂字段由 profile-editor 子组件维护，例如 Permissions、Sandbox、Hooks、Marketplace、Enabled Plugins、Status Line。
- 结构化设置分区的官方文档入口在 `StructuredSettingsSections.tsx`，新增分区时同步文档路径、i18n 和错误聚合。
- 官方插件市场常量在 `marketplace-presets.ts`；官方插件清单加载、localStorage 缓存和元数据过滤在 `official-plugin-catalog.ts` / `EnabledPluginsEditor.tsx`。
- 加载官方插件只追加新发现插件，必须保留已有 enabled/disabled 状态和非布尔 legacy entries。
- 复制环境变量按钮使用 `lucide-react` 的 `Variable` 图标，复制完整配置使用 `Copy` 图标；新增分区如需复制类操作沿用同一图标语义，避免在前端再生成图标自实现。

## 新增配置字段同步点

通常至少同步：

- `src/schemas/claude-settings.schema.json`
- `src/components/profile-editor/settings-form-registry.ts` 或对应分区组件
- `src/components/config-workspace-utils.ts`
- `src/types.ts`
- `src-tauri/src/config.rs`
- 相关 i18n 文案与测试
