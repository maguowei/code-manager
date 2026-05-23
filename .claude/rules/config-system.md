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

- 页面与编辑器：`ProfilesPage.tsx`、`ProfileEditor.tsx`、`PresetsPage.tsx`、`PresetEditor.tsx`
- 结构化分区：`src/components/profile-editor/`
- 表单注册与工具：`settings-form-registry.ts`、`config-workspace-utils.ts`、`status-line-utils.ts`
- 共享 schema：`src/schemas/claude-settings.schema.json`
- 后端权威逻辑：`src-tauri/src/config.rs`
- 内置资源：`src-tauri/resources/builtin-providers.json`、`src-tauri/resources/statusline/default.sh`
- 类型契约：`src/types.ts`

## 关键约束

- 配置表单由 `ProfileEditor.tsx` 与 `PresetEditor.tsx` 共享 `settings-form-registry.ts` 和 profile-editor 子组件；不要重新拆出第三套配置编辑入口。
- `src/schemas/claude-settings.schema.json` 是 Claude settings 的共享 schema 锚点；Rust 通过 `include_str!` 加载并校验已知字段。
- `validate_settings_document()` 允许未知顶层键，但会校验 schema 已知字段的嵌套结构。
- `preview_profile`、`apply_profile` 和 `test_profile_model` 都依赖后端解析后的最终配置，前端不要复制合并逻辑。
- 合并权威逻辑是 `src-tauri/src/config.rs::resolve_profile_settings()`：先展开 Preset 链，再叠加 Profile `settings`，最后写入 `$schema`。
- 激活 Profile 最终会原子写入 `~/.claude/settings.json`，并更新应用数据目录中的 `config-registry.json` 绑定状态。
- 已绑定的 Profile 被修改时，后端会重新应用到用户设置；不要绕开 `upsert_profile`。

## 内置 Provider

- 内置 Preset 维护在 `src-tauri/resources/builtin-providers.json`，当前覆盖 Anthropic、DeepSeek、智谱 GLM、Kimi、MiniMax、小米 MiMo、OpenRouter、火山方舟、阿里云百炼、ModelScope、万界方舟和 Ollama。
- 新增 provider 时同步 `localizedName`、`slug`、`baseUrl`、`docUrl` 和模型 `category`。
- Profile 编辑器的环境变量自动填充逻辑要覆盖默认 model 字段：`ANTHROPIC_MODEL`、`ANTHROPIC_DEFAULT_OPUS_MODEL`、`ANTHROPIC_DEFAULT_SONNET_MODEL`、`ANTHROPIC_DEFAULT_HAIKU_MODEL`、`CLAUDE_CODE_SUBAGENT_MODEL`。

## 结构化编辑器

- `settings-form-registry.ts` 定义行为与常用选项中的结构化字段。
- 专项复杂字段由 profile-editor 子组件维护，例如 Permissions、Sandbox、Hooks、Marketplace、Enabled Plugins、Status Line。
- 结构化设置分区的官方文档入口在 `StructuredSettingsSections.tsx`，新增分区时同步文档路径、i18n 和错误聚合。
- 复杂编辑器必须避免首次挂载 no-op writeback。尤其是 accordion 内懒挂载组件，语义等价时不要调用 `onChange`。
- `ProfileEditor` / `PresetEditor` 的 dirty 判断仍依赖 JSON 结构比较；局部编辑器写回时要保留未管理字段和 key 语义，避免只重建自己认识的字段。

## 插件与 Marketplace

- 官方插件市场常量在 `marketplace-presets.ts`；通用 marketplace 拉取和 localStorage 缓存在 `marketplace-catalog.ts` / `useMarketplaceCatalog.ts`；官方插件兼容层在 `official-plugin-catalog.ts`。
- `extraKnownMarketplaces` 存储层支持多种 `source` 形态；浏览市场当前只支持 `source: github`，其他来源显示 unsupported 状态，不伪造插件数据。
- `EnabledPluginsEditor.tsx` 是插件分区容器，表单模式分为“已配置”和“浏览市场”两个 Tab。
- 已配置列表只反映 `settings.enabledPlugins` 的真实条目，不要把浏览项混进配置列表。
- 浏览 Tab 只在切到浏览时按已配置 marketplace 拉取清单，支持搜索、marketplace / 状态 / 类别 / 来源筛选、插件 ID 或安装数排序、主页外链。
- 插件编辑必须保留已有 enabled/disabled 状态和非布尔 legacy entries；跨 Tab 启用、禁用和删除要通过 `useEnabledPluginsState` 写回 `enabledPlugins`。

## 权限与状态行

- 权限编辑器只管理 `defaultMode`、`disableBypassPermissionsMode`、`allow`、`deny`、`ask`、`additionalDirectories`；写回时保留其它顶层字段，例如 `disableAutoMode`。
- 修复权限 dirty 问题时优先做局部语义比较，不要扩大到全局 dirty 系统。
- 状态行默认脚本来自 `src-tauri/resources/statusline/default.sh`；安装走后端 `install_status_line_preset`，Windows 会返回 `status_line_preset_unsupported_platform`。

## 新增配置字段同步点

通常至少同步：

- `src/schemas/claude-settings.schema.json`
- `src/components/profile-editor/settings-form-registry.ts` 或对应分区组件
- `src/components/config-workspace-utils.ts`
- `src/types.ts`
- `src-tauri/src/config.rs`
- 相关 i18n 文案与测试
