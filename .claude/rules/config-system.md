---
paths:
  - "src/components/ProfilesPage.tsx"
  - "src/components/ProfileEditor.tsx"
  - "src/components/profile-editor/**/*"
  - "src/components/ProvidersPage.tsx"
  - "src/components/config-workspace-utils.ts"
  - "src/components/ProfileNameBadge.tsx"
  - "src/schemas/claude-settings.schema.json"
  - "src/schemas/form-fields.ts"
  - "src-tauri/src/config.rs"
  - "src-tauri/resources/builtin-providers.json"
  - "src-tauri/resources/statusline/default.sh"
  - "src-tauri/resources/statusline/default.ps1"
  - "src/types.ts"
---

# Config System Rules

## 模型

项目采用 **Provider -> 配置** 两层模型：Provider（供应商）只承载供应商客观信息——`env`（连接地址 `ANTHROPIC_BASE_URL` + 模型映射 + 可选附加环境变量）与元数据（`models`/`modelSuggestions`/`docUrl`），**不含认证密钥、不含 permissions/hooks 等其它 Claude Code 配置、无继承**。Provider **全部内置只读、不支持自定义**：定义在 `src-tauri/resources/builtin-providers.json`，无 `customProviders`、无 `ProviderInput` / `upsert_provider` / `delete_provider`，也无 `ProviderSource`。配置引用一个 `providerId`，在 Provider 的 `env` 之上叠加自身 `settings`（认证密钥、permissions/hooks、行为等都在配置）。地址单一事实源是 `env.ANTHROPIC_BASE_URL`（不单列 baseUrl 字段）。

> 限期兼容（COMPAT，0.23.0 移除）：`ConfigProfile.provider_id` 带 serde `alias = "presetId"` 读旧字段；`resolve_profile_settings` 对悬空 `providerId` 容错跳过。详见 `config.rs` 中 `COMPAT(presetId→providerId)` 标记。

## 先读文件

- 页面与编辑器：`ProfilesPage.tsx`、`ProfileEditor.tsx`、`ProvidersPage.tsx`（内置供应商只读一览）
- 结构化分区：`src/components/profile-editor/`
- 表单注册与工具：`settings-form-registry.ts`、`config-workspace-utils.ts`、`status-line-utils.ts`
- 共享 schema：`src/schemas/claude-settings.schema.json`
- 后端权威逻辑：`src-tauri/src/config.rs`
- 内置资源：`src-tauri/resources/builtin-providers.json`、`src-tauri/resources/statusline/default.sh`、`src-tauri/resources/statusline/default.ps1`
- 类型契约：`src/types.ts`

## 关键约束

- `ProfileEditor.tsx` 承载完整 Claude settings 编辑（共享 `settings-form-registry.ts` 和 profile-editor 子组件）；`ProvidersPage.tsx` 只读展示内置供应商，从 `ProfileEditor` 供应商选项处以 `Sheet` 打开（`onViewBuiltinProviders` 回调），不提供新增/编辑/删除。不要重新引入供应商编辑器或第三套配置编辑入口。
- `src/schemas/claude-settings.schema.json` 是 Claude settings 的共享 schema 锚点；Rust 通过 `include_str!` 加载并校验已知字段。
- `validate_settings_document()` 允许未知顶层键，但会校验 schema 已知字段的嵌套结构。
- `preview_profile`、`apply_profile` 和 `test_profile_model` 都依赖后端解析后的最终配置，前端不要复制合并逻辑。
- 合并权威逻辑是 `src-tauri/src/config.rs::resolve_profile_settings()`：两步合并——先取所选 Provider 的 `env`（解析不到则容错跳过），再叠加配置 `settings`，最后写入 `$schema`。已无 Preset 继承链。
- 地址例外（单一事实源）：当 `providerId` 可解析时，叠加前会清理配置 `settings.env` 内的 `ANTHROPIC_BASE_URL`，使供应商地址不被旧配置隐式覆盖；provider 解析不到时保留配置内的旧地址作兼容。前端 `applyProviderAutofill` 同步此行为（选中可解析 provider 时清空配置内地址）。
- 激活配置最终会原子写入 `~/.claude/settings.json`，并更新应用数据目录中的 `config-registry.json` 绑定状态。
- 已绑定的配置被修改时，后端会重新应用到用户设置；不要绕开 `upsert_profile`。
- `get_config_workspace` 会在没有配置时扫描未托管的 `~/.claude/settings.json`；`import_user_settings_profile` 原地接管当前文件内容并绑定配置，不立即重写文件。
- 已绑定配置与真实 `settings.json` 不一致时，后端返回 `activeUserSettingsMismatch`；前端用 `SettingsMismatchDiffViewer` 展示 diff，接受实际配置走 `import_user_settings_profile`，重新应用走 `apply_profile`。

## 内置 Provider

- 内置 Provider 维护在 `src-tauri/resources/builtin-providers.json`，是唯一供应商来源（不支持自定义），当前覆盖 Anthropic、DeepSeek、智谱 GLM、Kimi、MiniMax、小米 MiMo、OpenRouter、火山方舟、阿里云百炼、万界方舟和 Ollama。
- 新增 provider 时同步 `localizedName`、`slug`、`baseUrl`、`docUrl` 和模型 `category`。
- 配置编辑器的环境变量自动填充逻辑要覆盖默认 model 字段：`ANTHROPIC_MODEL`、`ANTHROPIC_DEFAULT_OPUS_MODEL`、`ANTHROPIC_DEFAULT_SONNET_MODEL`、`ANTHROPIC_DEFAULT_HAIKU_MODEL`、`CLAUDE_CODE_SUBAGENT_MODEL`。

## 结构化编辑器

- `settings-form-registry.ts` 定义行为与常用选项中的结构化字段。
- 专项复杂字段由 profile-editor 子组件维护，例如 Permissions、Sandbox、Hooks、Marketplace、Enabled Plugins、Status Line。
- 结构化设置分区的官方文档入口在 `StructuredSettingsSections.tsx`，新增分区时同步文档路径、i18n 和错误聚合。
- 复杂编辑器必须避免首次挂载 no-op writeback。尤其是 accordion 内懒挂载组件，语义等价时不要调用 `onChange`。
- `ProfileEditor` 的 dirty 判断仍依赖 JSON 结构比较；局部编辑器写回时要保留未管理字段和 key 语义，避免只重建自己认识的字段。

## 插件与 Marketplace

- 官方插件市场常量在 `marketplace-presets.ts`；通用 marketplace 拉取和 localStorage 缓存在 `marketplace-catalog.ts` / `useMarketplaceCatalog.ts`；官方插件兼容层在 `official-plugin-catalog.ts`。
- `extraKnownMarketplaces` 存储层支持多种 `source` 形态；浏览市场当前只支持 `source: github`，其他来源显示 unsupported 状态，不伪造插件数据。
- `EnabledPluginsEditor.tsx` 是插件分区容器，表单模式分为“已配置”和“浏览市场”两个 Tab。
- 已配置列表只反映 `settings.enabledPlugins` 的真实条目，不要把浏览项混进配置列表。
- 浏览 Tab 只在切到浏览时按已配置 marketplace 拉取清单，支持搜索、marketplace / 状态 / 类别 / 来源筛选、插件 ID 或安装数排序、主页外链。
- 插件编辑必须保留已有 enabled/disabled 状态和非布尔 legacy entries；跨 Tab 启用、禁用和删除要通过 `useEnabledPluginsState` 写回 `enabledPlugins`。
- 安装数（`unique_installs`）来源是本地 `~/.claude/plugins/plugin-catalog-cache.json`（由 Claude Code 维护、24h TTL、Code Manager 只读）；前端读取走 `plugin-install-counts.ts`。浏览 Tab 的“刷新”除拉 GitHub 清单外，还调后端 `plugins::refresh_plugin_install_counts` 执行 `claude plugin list --available --json` 按默认 TTL 策略触发刷新：缓存超 24h 时 claude 自动重拉重写、未过期则沿用旧值（不主动删缓存、不强制刷新）。注意 `claude plugin marketplace update` 只更新 marketplace 克隆，刷不了安装数。
- 该缓存的安装数**只覆盖官方市场 `claude-plugins-official` 的插件**（数据源是 Anthropic 为官方市场预生成的 `plugin-stats/plugin-details.json`）；第三方 marketplace（如 `openai-codex`、`baoyu-skills`）的插件没有安装数，浏览 Tab 对应列留空属预期，不是刷新 bug。

## 权限与状态行

- 权限编辑器只管理 `defaultMode`、`disableBypassPermissionsMode`、`allow`、`deny`、`ask`、`additionalDirectories`；写回时保留其它顶层字段，例如 `disableAutoMode`。
- 修复权限 dirty 问题时优先做局部语义比较，不要扩大到全局 dirty 系统。
- 状态行默认脚本按平台分发：非 Windows 用 `src-tauri/resources/statusline/default.sh`（Bash，依赖 jq），Windows 用 `src-tauri/resources/statusline/default.ps1`（PowerShell，免 jq）。安装走后端 `install_status_line_preset`：Windows 写入 `~/.claude/statusline.ps1` 并把 `command` 设为绝对正斜杠路径的 `powershell -NoProfile -ExecutionPolicy Bypass -File ...`；两份脚本功能需保持对齐。

## 新增配置字段同步点

通常至少同步：

- `src/schemas/claude-settings.schema.json`
- `src/components/profile-editor/settings-form-registry.ts` 或对应分区组件
- `src/components/config-workspace-utils.ts`
- `src/types.ts`
- `src-tauri/src/config.rs`
- 相关 i18n 文案与测试
