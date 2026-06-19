# Preset → Provider 降级重构设计

- 日期：2026-06-19
- 状态：设计已确认，待写实现计划
- 范围：配置系统核心（前端 + Rust 后端 + IPC 契约 + 内置资源 + i18n + 规则文档）

## 背景与动机

当前配置系统采用 **Preset 链 → Profile** 两层模型：

- `SettingsPreset` 的 `settingsPatch` 是一份**完整的 Claude Code 配置层**，不仅含供应商信息（`env` 里的 base_url / 模型），还携带 `permissions`、`sandbox`、`hooks`、`enabledPlugins`、`extraKnownMarketplaces`、`statusLine`，以及 `language` / `outputStyle` 等所有行为/通用顶层字段。
- Preset 支持 `basePresetId` 继承链，可递归展开。
- `ConfigProfile` 引用一个 `presetId`，在 Preset 链之上叠加自身 `settings`，最终原子写入 `~/.claude/settings.json`。
- ProfileEditor 与 PresetEditor **共享同一套结构化表单**（`settings-form-registry.ts` + `profile-editor/` 子组件），即 Profile 本身已能编辑全部字段。Preset 的独特价值仅在于"可复用 + 可继承"。

确认的驱动力（三者并存）：

1. **概念复杂 / 用户困惑**：两层模型 + 继承链心智负担重，难以区分 Preset 与 Profile。
2. **功能冗余 / 维护负担**：两个编辑器共享同一套字段，维护两套入口成本高。
3. **实际未使用**：非供应商配置（permissions / hooks / sandbox 等）几乎不在 Preset 层使用，放在那里属过度设计。

## 目标

把 Preset 从"完整配置层"**降级为纯供应商配置（Provider）**：只承载供应商客观信息，不携带其他 Claude Code 配置项。非供应商配置全部归 Profile。

**非目标 / 明确约束：**

- **不做向后兼容**：项目尚未正式发布，采用 clean break，不编写任何迁移/兼容逻辑。
- 不引入新的第三套配置编辑入口。
- 不改变"最终原子写入 `~/.claude/settings.json`"的应用语义。

## 核心设计决策

### 决策 1：供应商配置的边界

供应商配置 = `env`（连接 + 模型为一等公民，其余作为可选附加环境变量）+ 元数据（`models` / `modelSuggestions` / `docUrl`）。

**保留**：`ANTHROPIC_BASE_URL`、模型映射（`ANTHROPIC_MODEL`、`ANTHROPIC_DEFAULT_OPUS_MODEL`、`ANTHROPIC_DEFAULT_SONNET_MODEL`、`ANTHROPIC_DEFAULT_HAIKU_MODEL`、`CLAUDE_CODE_SUBAGENT_MODEL`）、可选附加 env（含 `CLAUDE_CODE_EFFORT_LEVEL` 等调优变量，作为可选）。

**剔除**：`permissions`、`sandbox`、`hooks`、`enabledPlugins`、`extraKnownMarketplaces`、`statusLine`，以及 `language` / `outputStyle` 等所有非 env 配置项。

### 决策 2：认证信息归 Profile，不归 Provider

**区分原则——客观事实 vs 个人凭据：**

- `base_url` / `可用模型` / `docUrl` 是关于供应商的**客观事实**，对所有人一致，内置 provider 即把这些事实打包。这是"供应商信息"。
- `API Key / Auth Token` 是关于用户的**个人凭据**，是密钥、每人不同、内置 provider 永不可能携带。它本质不是"供应商信息"。

因此认证 key（`ANTHROPIC_API_KEY` / `ANTHROPIC_AUTH_TOKEN`）**留在 Profile 层**，写入 `profile.settings.env`。供应商 `env` 不含认证 key。

支持理由：

1. 供应商层是可复用/可共享层（内置 12 个即共享）。把密钥塞进可共享对象是范畴错误——导出/分享即泄露。Profile 天生个人，密钥归 Profile 才安全。
2. 同一供应商多 key（工作/个人分账）在该模型下是一个 provider + 多个 profile 各填各的 key，无需复制供应商。

**UX 处理**：ProfileEditor 中选中某供应商后，顶部展示该供应商的 `base_url`（只读，来自供应商）+ 一个醒目的"认证"字段（Profile 层），让"选供应商 → 填我的 key → 选模型"在一个视图内连贯完成。

### 决策 3：删除继承链

供应商之间平级独立（各自 base_url / 认证 / 模型均不同），"供应商继承供应商"无意义。删除 `basePresetId` 与 `resolve_preset_chain`，合并逻辑简化为两步。

### 决策 4：全面改名 Preset → Provider

代码标识符、类型名、文件名、IPC command、i18n key、UI 文案全套替换。一次到位，避免长期"preset 名不符实"。

## 数据模型

### Provider（原 `SettingsPreset`）

```
Provider {
  id            // provider:slug
  name
  localizedName?
  description?
  docUrl?
  baseUrl       // 一等字段（等价 env.ANTHROPIC_BASE_URL）
  models        // 该供应商可用模型 + 分类（opus/sonnet/haiku/other）
  modelSuggestions
  env           // 模型映射 + 可选附加 env（连接相关），不含认证 key
  source        // builtin | custom
}
```

**相对 `SettingsPreset` 删除**：`basePresetId`、`settingsPatch`（替换为聚焦的 `baseUrl` + `env`）。`settingsPatch` 中原有的 `permissions` / `sandbox` / `hooks` / `enabledPlugins` / `extraKnownMarketplaces` / `statusLine` / 行为 / 通用顶层字段全部不再属于 Provider。

> 实现细节（`baseUrl` 是独立一等字段还是仅作为 `env.ANTHROPIC_BASE_URL` 的便捷视图）留待实现计划阶段定，以保持 `env` 单一事实源、避免双写不一致。

### ConfigProfile

- `presetId` → `providerId`（字段重命名）。
- 其余结构不变。
- 非供应商配置（`permissions` / `hooks` / `sandbox` / 行为 / 认证 key 等）全部承载于 `profile.settings`。

## 合并逻辑

`resolve_profile_settings` 由"递归展开 Preset 链 + 多层合并"简化为干净两步：

```
provider.env (+ baseUrl)
  → profile.settings        // 可覆盖 env、补充认证 key、叠加 permissions/hooks/…
  → 写入 $schema
  → validate_settings_document
  → 原子写入 ~/.claude/settings.json
```

`resolve_preset_chain` 整段删除。其余应用/预览/模型测试入口（`preview_profile`、`apply_profile`、`test_profile_model`）继续依赖后端解析后的最终配置，前端不复制合并逻辑。

## 编辑器拆分

### ProviderEditor（原 PresetEditor）

仅保留"连接 + 模型 + 元数据"：

- name / localizedName、description、docUrl
- baseUrl
- models 列表（+ 分类）
- modelSuggestions
- 可选附加 env 的键值编辑

**移除分区**：permissions、sandbox、hooks、enabledPlugins、marketplace、statusLine、行为（behavior）、通用（common）。

### ProfileEditor

- 保留全套结构化分区（本就共享 `settings-form-registry.ts` 与 `profile-editor/` 子组件）。
- 新增连贯区：选中供应商后展示 base_url（只读）+ 认证字段（写入 `profile.settings.env`）。

## 改名清单（非穷举，实现计划细化）

- 类型：`SettingsPreset` → `Provider`；`SettingsPresetModel` → 对应命名；`presetId` → `providerId`。
- 组件/页面：`PresetEditor` → `ProviderEditor`；`PresetsPage` → `ProvidersPage`。
- IPC command：`upsert_preset` → `upsert_provider`、`delete_preset` → `delete_provider`、list 等同步；`make bindings` 重新生成 `src/bindings.ts`。
- 注册表存储：`config-registry.json` 的 `customPresets` → `customProviders`（clean break，无需读旧字段）。
- 内置资源：`builtin-providers.json` 字段按新结构调整（拆出 `baseUrl` 一等字段、剔除任何非供应商字段）。
- i18n：key 与文案中英全套替换为"供应商 / Provider"。
- UI 文案、页面标题、导航项。

## 内置资源

`builtin-providers.json` 当前基本为 env-only，按新结构调整：拆出 `baseUrl` 一等字段，剔除非供应商字段（如 effort 视情况保留为可选 env）。覆盖的 12 个 provider（Anthropic、DeepSeek、智谱 GLM、Kimi、MiniMax、小米 MiMo、OpenRouter、火山方舟、阿里云百炼、ModelScope、万界方舟、Ollama）保持不变。

## 同步点（硬约束清单）

至少需同步：

- `src-tauri/src/config.rs`：结构体、IPC command、`resolve_profile_settings`、删除 `resolve_preset_chain`、校验逻辑。
- `src-tauri/src/lib.rs`：Specta command 注册集合。
- `src-tauri/resources/builtin-providers.json`：新结构。
- `src/bindings.ts`：`make bindings` 生成（不手改）。
- `src/ipc.ts`：包装层（如需兼容命名）。
- `src/types.ts`：类型契约。
- `src/schemas/claude-settings.schema.json`：如涉及 schema 锚点。
- `src/components/profile-editor/settings-form-registry.ts`、`src/components/config-workspace-utils.ts`。
- `src/components/PresetEditor.tsx`→ ProviderEditor、`PresetsPage.tsx`→ ProvidersPage、`ProfileEditor.tsx`。
- i18n（`src/i18n.ts`）。
- 相关测试。
- `.claude/rules/config-system.md`：更新规则描述（两层模型、Preset 链表述需改写）。

## 验证策略

按改动范围跑最小充分集：

- 前后端契约 / IPC：`make bindings-check`、`make build-frontend`、`make test-rust`。
- Rust：`make fmt-rust-check`、`make check`、`make lint-rust`、`make test-rust`。
- 前端：`make lint-frontend`、`make build-frontend`、`make test-frontend`（或局部 `pnpm exec vitest run <file>`）。
- UI 视觉：本地应用核验"选供应商 → 填认证 → 选模型"连贯流程，以及 ProviderEditor 精简后的面板。
- 文档：`git diff --check`。

## 风险与开放问题

- **`baseUrl` 与 `env.ANTHROPIC_BASE_URL` 的单一事实源**：避免双写不一致，实现阶段定其一为权威。
- **改名波及面广**：全套重命名涉及前后端 + 生成 bindings + 测试，需逐文件核对无遗漏旧标识符。
- **认证字段在 ProfileEditor 的展示位置**：需与现有结构化分区布局协调，遵循"均衡管理台"视觉风格，认证字段用合适的密钥输入态。
