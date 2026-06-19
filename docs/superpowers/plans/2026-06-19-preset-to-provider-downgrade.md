# Preset → Provider 降级重构 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把"完整配置层 Preset"降级为"纯供应商配置 Provider"——只承载供应商客观信息（`env` 内的地址/模型映射/可选附加变量 + 元数据），删除其携带的 permissions/sandbox/hooks/plugins/marketplace/statusLine/行为/通用等非供应商字段、删除继承链、认证密钥归还 Profile，并把 `Preset` 标识符全面改名为 `Provider`。

**Architecture:** 后端 `config.rs` 是配置合并权威，前端经 `tauri-specta` 生成 `bindings.ts` 调用。重构分两段推进：先做**保持行为的纯改名**（Preset→Provider，全测试保持绿），再做**语义降级**（删继承链、收窄数据结构到 env、剥离 ProviderEditor 多余分区、ProfileEditor 认证/地址协同）。每个任务结束都编译通过、对应测试通过、提交一次。**clean break，不写任何迁移/兼容逻辑**（项目未发布）。

**Tech Stack:** Rust + Tauri 2 + tauri-specta；React 19 + TypeScript + Vite + Vitest；JSON Schema 校验；pnpm。

**权威设计文档：** `docs/superpowers/specs/2026-06-19-preset-to-provider-downgrade-design.md`

---

## 改名范围（关键护栏）

**只改名"配置/供应商 Preset"概念。以下同名但无关的概念严禁改动：**

| 概念 | 典型标识符 / 文件 | 处理 |
| --- | --- | --- |
| 记忆预设 | `apply_memory_preset`、`get_memory_preset_content`、`memory.rs`、`MemoryPresetPanel.tsx`、`memory-preset-utils.ts`、`MemoryPage.tsx`、i18n `memory.presets.*` | **不动** |
| Hook 预设模板 | `src/components/profile-editor/hook-presets.ts`、`HooksEditor.tsx` 内 `*Preset*` | **不动** |
| Sandbox 预设模板 | `src/components/profile-editor/sandbox-presets.ts`、`SandboxEditor.tsx` 内 `*Preset*` | **不动** |
| 状态行预设 | `install_status_line_preset`、i18n `*statusLine*` | **不动** |
| 用量时间范围预设 | `UsagePage.tsx` 内 `*preset*` | **不动** |

**需要改名的"配置 Preset"标识符映射（Rust）：**

| 旧 | 新 |
| --- | --- |
| `SettingsPreset` | `Provider` |
| `SettingsPresetModel` | `ProviderModel` |
| `PresetSource` | `ProviderSource` |
| `PresetModelCategory` | `ProviderModelCategory` |
| `PresetInput` | `ProviderInput` |
| `BuiltinPresetSeed` / `BuiltinPresetModel` | `BuiltinProviderSeed` / `BuiltinProviderModel` |
| `ConfigProfile.preset_id` | `ConfigProfile.provider_id` |
| `ConfigRegistry.custom_presets` | `ConfigRegistry.custom_providers` |
| `ConfigWorkspace.builtin_presets` / `custom_presets` | `builtin_providers` / `custom_providers` |
| `parse_builtin_presets` | `parse_builtin_providers` |
| `build_custom_preset_id` / `slugify_custom_preset_seed` | `build_custom_provider_id` / `slugify_custom_provider_seed` |
| `find_preset` / `preset_exists` | `find_provider` / `provider_exists` |
| `profile_uses_preset` / `bound_profile_ids_using_preset` | `profile_uses_provider` / `bound_profile_ids_using_provider` |
| `normalize_preset_input` / `normalize_preset_models` | `normalize_provider_input` / `normalize_provider_models` |
| `upsert_preset` / `delete_preset` (命令) | `upsert_provider` / `delete_provider` |

**需要改名的标识符映射（前端）：**

| 旧 | 新 |
| --- | --- |
| `SettingsPreset` / `SettingsPresetModel` / `PresetSource` / `PresetModelCategory` | `Provider` / `ProviderModel` / `ProviderSource` / `ProviderModelCategory` |
| `PresetInput` (ipc.ts) | `ProviderInput` |
| `ConfigProfile.presetId` | `ConfigProfile.providerId` |
| `ConfigWorkspace.builtinPresets` / `customPresets` | `builtinProviders` / `customProviders` |
| `PresetEditor.tsx` / `PresetEditorProps` / `PresetEditorSaveData` | `ProviderEditor.tsx` / `ProviderEditorProps` / `ProviderEditorSaveData` |
| `PresetsPage.tsx` | `ProvidersPage.tsx` |
| `config-workspace-utils.ts`: `presetDisplayName` / `presetSlugFromId` / `presetNameById` / `applyPresetAutofill` / `resolvePresetAutofillValues` | `providerDisplayName` / `providerSlugFromId` / `providerNameById` / `applyProviderAutofill` / `resolveProviderAutofillValues`（`resolvePresetChain` 删除，见 Task 9） |
| i18n `presets.*`、`configTabs.presets`、`profiles.editor.*preset*` | `providers.*`、`configTabs.providers`、`profiles.editor.*provider*` |
| `App.tsx` lazy `PresetsPage` | `ProvidersPage`（`activeTab === "providers"` 已存在，保持） |

---

## File Structure

**Rust（语义权威）**
- `src-tauri/src/config.rs` —— 结构体、内置解析、合并逻辑、命令、Rust 测试。最大改动面。
- `src-tauri/src/lib.rs` —— Specta 命令注册集合。
- `src-tauri/resources/builtin-providers.json` —— 内置 provider 种子（字段名基本不变，仅随结构需要微调）。
- `src-tauri/tests/fixtures/config-registry.example.json` —— 测试夹具，`customPresets`→`customProviders`、`presetId`→`providerId`。
- `src-tauri/tests/profile_apply_e2e.rs` —— E2E 测试夹具同步。

**前端契约**
- `src/bindings.ts` —— **生成文件**，由 `make bindings` 重新生成，不手改。
- `src/types.ts` —— 手写类型契约。
- `src/ipc.ts` —— IPC 包装层。

**前端组件**
- `src/components/PresetEditor.tsx` → `ProviderEditor.tsx` —— 改名 + 剥离多余分区。
- `src/components/PresetsPage.tsx` → `ProvidersPage.tsx` —— 改名。
- `src/components/ProfileEditor.tsx` —— provider 选择 + 认证/地址协同。
- `src/components/config-workspace-utils.ts` —— provider 工具函数改名 + 删继承链解析。
- `src/components/profile-editor/settings-form-registry.ts` —— 不改（共享给 Profile），ProviderEditor 改为只消费 env/model 子集。
- `src/App.tsx` —— lazy import 改名。

**i18n / 文档**
- `src/i18n.ts` —— `presets.*` / 相关 key 改名为 `providers.*`，文案改"供应商"。
- `.claude/rules/config-system.md` —— 规则描述改写（去掉"Preset 链"表述）。
- `CLAUDE.md` —— 如有 Preset 表述需同步（核对后处理）。

**测试**
- `src/components/__tests__/PresetEditor.test.tsx` → `ProviderEditor.test.tsx`
- `src/components/__tests__/PresetsPage.test.tsx` → `ProvidersPage.test.tsx`
- `src/components/__tests__/ProfileEditor.test.tsx`、`ProfilesPage.test.tsx`、`config-workspace-utils.test.ts`、`App.test.tsx` —— 同步改名/字段。

---

## 段 A：基线与改名（保持行为，全测试绿）

### Task 1: 建立基线

**Files:** 无改动

- [ ] **Step 1: 确认工作区干净并记录基线**

Run:
```bash
cd /Users/maguowei/Work/AI/ai-manager
git status --short
git branch --show-current
```
Expected: 无未提交改动；当前在工作分支（非 main）。若在 main，先 `git switch -c refactor/preset-to-provider`。

- [ ] **Step 2: 跑全量基线验证，确认起点全绿**

Run:
```bash
make bindings-check
make test-rust
make test-frontend
```
Expected: 全部通过。若有失败，先停下排查——基线必须绿，否则无法判断后续改动是否引入回归。

- [ ] **Step 3: 记录改名前的命中基数（用于收尾核对）**

Run:
```bash
grep -rni "preset" src src-tauri --include="*.rs" --include="*.ts" --include="*.tsx" --include="*.json" -l | sort
```
Expected: 输出文件清单。记下其中**属于配置 Preset 概念**的文件（见"改名范围"表），排除记忆/hook/sandbox/状态行/用量等无关文件。

---

### Task 2: 后端结构体改名（Preset→Provider，字段语义不变）

**Files:**
- Modify: `src-tauri/src/config.rs`（结构体定义区，行 136-248 附近）

> 本任务只改名，不改字段集合、不删继承字段（继承在 Task 9 删）。目的：让后端先编译过、行为不变。

- [ ] **Step 1: 改名枚举与模型结构体**

在 `src-tauri/src/config.rs` 把以下定义改名（保持 derive/serde 属性不变）：

```rust
// 原 PresetSource（行 136-139）
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, specta::Type)]
#[serde(rename_all = "lowercase")]
pub enum ProviderSource {
    Builtin,
    Custom,
}

// 原 SettingsPresetModel（行 159-162）
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ProviderModel {
    pub id: String,
    pub category: ProviderModelCategory,
}
```

同时把 `PresetModelCategory` 改名为 `ProviderModelCategory`（定义处 + 所有引用）。

- [ ] **Step 2: 改名 `SettingsPreset` → `Provider`（字段暂不动）**

```rust
// 原 SettingsPreset（行 164-183）
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct Provider {
    pub id: String,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub localized_name: Option<LocalizedText>,
    pub description: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub base_preset_id: Option<String>, // 暂留，Task 9 删除
    #[serde(skip_serializing_if = "Option::is_none")]
    pub doc_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub models: Option<Vec<ProviderModel>>,
    #[serde(default)]
    pub model_suggestions: Vec<String>,
    #[specta(type = specta_typescript::Unknown)]
    pub settings_patch: Value, // 暂留，Task 10 收窄为 env
    pub source: ProviderSource,
}
```

- [ ] **Step 3: 改名 Profile / Registry / Workspace 字段**

```rust
// ConfigProfile（行 185-197）：preset_id → provider_id
    #[serde(skip_serializing_if = "Option::is_none")]
    pub provider_id: Option<String>,

// ConfigRegistry（行 208-221）：custom_presets → custom_providers
    #[serde(default)]
    pub custom_providers: Vec<Provider>,

// ConfigWorkspace（行 236-248）：builtin_presets → builtin_providers，custom_presets → custom_providers
    pub builtin_providers: Vec<Provider>,
    pub custom_providers: Vec<Provider>,
```

- [ ] **Step 4: 全文替换 config.rs 内剩余配置 Preset 标识符**

按"改名范围（Rust）"表，把 `config.rs` 内所有函数名/局部变量/类型引用改名（`parse_builtin_presets`、`build_custom_preset_id`、`find_preset`、`preset_exists`、`profile_uses_preset`、`bound_profile_ids_using_preset`、`normalize_preset_*`、`PresetInput`、`BuiltinPresetSeed/Model` 等）。**保留** `base_preset_id`/`settings_patch` 字段名（后续任务处理）。

> 注意：`config.rs` 内不应出现记忆/状态行等无关 preset；若 grep 命中确认均为配置概念后再改。

- [ ] **Step 5: 编译验证**

Run:
```bash
make check
```
Expected: 编译通过（测试模块此时可能因引用旧名报错——下一步修）。若有非测试代码报错，回到上面补齐遗漏的引用。

- [ ] **Step 6: 同步 config.rs 内 `#[cfg(test)]` 测试模块的标识符**

把测试模块（行 2827+）内所有 `SettingsPreset`/`preset_id`/`custom_presets`/`sample_preset_input`/`sample_custom_preset` 等改名为 provider 版本（如 `sample_provider_input`、`sample_custom_provider`）。测试断言逻辑不变。

- [ ] **Step 7: Rust 测试验证**

Run:
```bash
make test-rust
```
Expected: 全部通过（与基线同样的用例数，仅名字变了）。

- [ ] **Step 8: 提交**

```bash
git add src-tauri/src/config.rs
git commit -m "refactor(config): 后端配置 Preset 结构体改名为 Provider"
```

---

### Task 3: 命令注册与内置资源/夹具改名

**Files:**
- Modify: `src-tauri/src/lib.rs`（`collect_commands![]`，行 75-154）
- Modify: `src-tauri/resources/builtin-providers.json`
- Modify: `src-tauri/tests/fixtures/config-registry.example.json`
- Modify: `src-tauri/tests/profile_apply_e2e.rs`

- [ ] **Step 1: 改名命令注册**

`src-tauri/src/lib.rs` 的 `collect_commands![]` 中：
```rust
            upsert_provider,
            delete_provider,
```
替换原 `upsert_preset, delete_preset`。

- [ ] **Step 2: 核对内置资源字段**

打开 `src-tauri/resources/builtin-providers.json`，确认其顶层为 provider 种子数组、字段为 `id/name/localizedName/slug/baseUrl/docUrl/env/models`。**该文件本身基本无需改名**（字段名已是 provider 形态）。仅当 `BuiltinProviderSeed` 反序列化字段名变更时才同步——本段不变更字段，故此步通常只是确认。

- [ ] **Step 3: 改名 Rust 测试夹具**

`src-tauri/tests/fixtures/config-registry.example.json`：把 JSON 键 `customPresets`→`customProviders`、`presetId`→`providerId`、`basePresetId`（如出现）暂保留（Task 9 处理）。
`src-tauri/tests/profile_apply_e2e.rs`：把引用的字段名/类型名同步改名。

- [ ] **Step 4: 验证**

Run:
```bash
make test-rust
cargo test --manifest-path src-tauri/Cargo.toml --test profile_apply_e2e
```
Expected: 全部通过。

- [ ] **Step 5: 提交**

```bash
git add src-tauri/src/lib.rs src-tauri/resources/builtin-providers.json src-tauri/tests/
git commit -m "refactor(config): 命令注册与测试夹具改名为 Provider"
```

---

### Task 4: 重新生成 bindings 并修复前端类型/ipc

**Files:**
- Regenerate: `src/bindings.ts`（生成文件，不手改）
- Modify: `src/types.ts`（行 83-131 附近）
- Modify: `src/ipc.ts`（行 37-47、110、188）

- [ ] **Step 1: 重新生成 bindings**

Run:
```bash
make bindings
```
Expected: `src/bindings.ts` 更新，命令变为 `upsertProvider`/`deleteProvider`，类型变为 `Provider`/`ProviderModel`/`ProviderSource`/`ProviderInput` 等。

- [ ] **Step 2: 改名 `src/types.ts` 手写类型**

把 `src/types.ts` 中配置 Preset 类型改名（与 Rust 一致）：
```ts
export type ProviderSource = "builtin" | "custom";
export type ProviderModelCategory = "opus" | "sonnet" | "haiku" | "other";

export interface ProviderModel {
  id: string;
  category: ProviderModelCategory;
}

export interface Provider {
  id: string;
  name: string;
  localizedName?: LocalizedText;
  description: string;
  basePresetId?: string; // 暂留，Task 9 删除
  docUrl?: string;
  models?: ProviderModel[];
  modelSuggestions: string[];
  settingsPatch: Record<string, unknown>; // 暂留，Task 10 收窄
  source: ProviderSource;
}

export interface ConfigProfile {
  id: string;
  name: string;
  description: string;
  providerId?: string;
  settings: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface ConfigWorkspace {
  app: AppPreferences;
  builtinProviders: Provider[];
  customProviders: Provider[];
  profiles: ConfigProfile[];
  bindings: BindingState;
  unmanagedUserSettings?: UnmanagedUserSettings;
  activeUserSettingsMismatch?: ActiveUserSettingsMismatch;
}
```

- [ ] **Step 3: 改名 `src/ipc.ts`**

把 `PresetInput` 类型改名为 `ProviderInput`、`upsertPreset`→`upsertProvider`、`deletePreset`→`deleteProvider`（指向新生成的 `commands.upsertProvider`/`deleteProvider`）：
```ts
type ProviderInput = {
  id?: string | null;
  name: string;
  localizedName?: AppTypes.LocalizedText | null;
  description: string;
  basePresetId?: string | null; // 暂留，Task 9 删除
  docUrl?: string | null;
  models?: AppTypes.ProviderModel[] | null;
  modelSuggestions: string[];
  settingsPatch: Record<string, unknown>; // 暂留，Task 10 收窄
};
// ...
upsertProvider(data: ProviderInput): Promise<AppTypes.Provider>;
deleteProvider(id: string): Promise<null>;
```

- [ ] **Step 4: 类型检查**

Run:
```bash
make bindings-check
make lint-frontend
```
Expected: `bindings-check` 通过（生成结果与提交一致）；`lint-frontend` 此时会因组件仍引用旧类型而报错——属预期，下一任务修复。仅确认 `types.ts`/`ipc.ts` 自身无类型错误。

- [ ] **Step 5: 提交**

```bash
git add src/bindings.ts src/types.ts src/ipc.ts
git commit -m "refactor(config): 重新生成 bindings 并改名前端 Provider 类型与 ipc"
```

---

### Task 5: 改名 PresetsPage → ProvidersPage

**Files:**
- Rename: `src/components/PresetsPage.tsx` → `src/components/ProvidersPage.tsx`
- Rename: `src/components/__tests__/PresetsPage.test.tsx` → `src/components/__tests__/ProvidersPage.test.tsx`
- Modify: `src/App.tsx`（行 28、302-308）

- [ ] **Step 1: git mv 文件**

Run:
```bash
git mv src/components/PresetsPage.tsx src/components/ProvidersPage.tsx
git mv src/components/__tests__/PresetsPage.test.tsx src/components/__tests__/ProvidersPage.test.tsx
```

- [ ] **Step 2: 改名组件内标识符**

`src/components/ProvidersPage.tsx`：组件名 `PresetsPage`→`ProvidersPage`、props 类型、`workspace.builtinPresets`→`builtinProviders`、`workspace.customPresets`→`customProviders`、`ipc.upsertPreset`→`upsertProvider`、`ipc.deletePreset`→`deleteProvider`、`editingPreset`→`editingProvider`、`PresetEditor` 引用→`ProviderEditor`（文件 Task 6 改名，引用先按新名写）、i18n key `presets.*`→`providers.*`（文案 Task 11 落地，key 先按新名引用）。

- [ ] **Step 3: 改名 App.tsx 引用**

`src/App.tsx`：
```ts
const ProvidersPage = lazy(() => import("./components/ProvidersPage"));
```
渲染处（行 302-308）`<PresetsPage .../>`→`<ProvidersPage .../>`，`activeTab === "providers"` 保持不变。

- [ ] **Step 4: 改名测试文件标识符**

`ProvidersPage.test.tsx`：测试内 `PresetsPage`→`ProvidersPage`、mock 的 `builtinPresets`/`customPresets`→provider 版本、`upsertPreset`/`deletePreset` mock→provider 版本、i18n key 引用→`providers.*`。

- [ ] **Step 5: 验证**

Run:
```bash
pnpm exec vitest run src/components/__tests__/ProvidersPage.test.tsx src/App.test.tsx
```
Expected: 通过（`App.test.tsx` 若引用旧 i18n key 需同步；若 i18n key 尚未改名导致失败，记录后在 Task 11 统一收口，本步以组件渲染不崩为准）。

- [ ] **Step 6: 提交**

```bash
git add -A
git commit -m "refactor(config): PresetsPage 改名为 ProvidersPage"
```

---

### Task 6: 改名 PresetEditor → ProviderEditor（仅改名，分区不动）

**Files:**
- Rename: `src/components/PresetEditor.tsx` → `src/components/ProviderEditor.tsx`
- Rename: `src/components/__tests__/PresetEditor.test.tsx` → `src/components/__tests__/ProviderEditor.test.tsx`

> 本任务只改名，保留全部分区。剥离分区在 Task 12。

- [ ] **Step 1: git mv 文件**

Run:
```bash
git mv src/components/PresetEditor.tsx src/components/ProviderEditor.tsx
git mv src/components/__tests__/PresetEditor.test.tsx src/components/__tests__/ProviderEditor.test.tsx
```

- [ ] **Step 2: 改名组件内标识符**

`ProviderEditor.tsx`：`PresetEditor`→`ProviderEditor`、`PresetEditorProps`→`ProviderEditorProps`、`PresetEditorSaveData`→`ProviderEditorSaveData`、props `preset`/`presets`→`provider`/`providers`、类型 `SettingsPreset`→`Provider`、state `basePresetId` 暂留、i18n key `presets.editor.*`→`providers.editor.*`（key 先改引用）。

- [ ] **Step 3: 改名测试文件标识符**

`ProviderEditor.test.tsx`：同步改名所有 `PresetEditor`/`preset` 引用为 provider 版本。

- [ ] **Step 4: 验证**

Run:
```bash
pnpm exec vitest run src/components/__tests__/ProviderEditor.test.tsx
```
Expected: 通过（i18n key 未改名导致的文案断言失败先记录，Task 11 收口）。

- [ ] **Step 5: 提交**

```bash
git add -A
git commit -m "refactor(config): PresetEditor 改名为 ProviderEditor"
```

---

### Task 7: 改名 config-workspace-utils 与 ProfileEditor 的 Provider 引用

**Files:**
- Modify: `src/components/config-workspace-utils.ts`（行 268-472）
- Modify: `src/components/__tests__/config-workspace-utils.test.ts`
- Modify: `src/components/ProfileEditor.tsx`（行 161、167、471-475、768-816）
- Modify: `src/components/__tests__/ProfileEditor.test.tsx`、`ProfilesPage.test.tsx`

> `resolvePresetChain`/`resolvePresetAutofillValues` 暂保留实现（Task 9 删继承），本任务只改名。

- [ ] **Step 1: 改名工具函数**

`config-workspace-utils.ts`：`presetDisplayName`→`providerDisplayName`、`presetSlugFromId`→`providerSlugFromId`、`presetNameById`→`providerNameById`、`applyPresetAutofill`→`applyProviderAutofill`、`resolvePresetAutofillValues`→`resolveProviderAutofillValues`、`resolvePresetChain`→`resolveProviderChain`（暂留实现）。参数类型 `SettingsPreset[]`→`Provider[]`、`presetId`→`providerId`。

- [ ] **Step 2: 改名 ProfileEditor**

`ProfileEditor.tsx`：`presetId`/`setPresetId`→`providerId`/`setProviderId`、`handlePresetChange`→`handleProviderChange`、`selectedPreset`→`selectedProvider`、`presets` props→`providers`、`applyPresetAutofill`→`applyProviderAutofill`、`presetDisplayName`→`providerDisplayName`、i18n key `profiles.editor.*preset*`→`*provider*`、`NO_PRESET_VALUE`→`NO_PROVIDER_VALUE`。**保留** 行 818-851 的 baseUrl/authToken 编辑（Task 13 调整其语义）。

- [ ] **Step 3: 改名相关测试**

`config-workspace-utils.test.ts`、`ProfileEditor.test.tsx`、`ProfilesPage.test.tsx`：同步改名标识符与 mock 字段。

- [ ] **Step 4: 验证**

Run:
```bash
pnpm exec vitest run src/components/__tests__/config-workspace-utils.test.ts src/components/__tests__/ProfileEditor.test.tsx src/components/__tests__/ProfilesPage.test.tsx
```
Expected: 通过（i18n 文案断言失败先记录，Task 11 收口）。

- [ ] **Step 5: 提交**

```bash
git add -A
git commit -m "refactor(config): config-workspace-utils 与 ProfileEditor 的 Provider 引用改名"
```

---

### Task 8: i18n key 改名 + 文案改"供应商"，并清场验证

**Files:**
- Modify: `src/i18n.ts`（中英两份 `presets.*`、`configTabs.presets`、`profiles.editor.*preset*` 等）
- Modify: 收尾所有"待 Task 11 收口"的文案断言（前置任务 5/6/7）

- [ ] **Step 1: 改名并改写 i18n 条目**

`src/i18n.ts` 中、英两份：
- `configTabs.presets` → `configTabs.providers`，值改"供应商"/"Providers"。
- 所有 `presets.*` → `providers.*`，文案中"预设"改"供应商"（保留语义）。例：`providers.title` = "供应商" / "Providers"；`providers.description` = "管理可复用的 Claude 供应商配置"。
- `profiles.editor.fields.preset` → `profiles.editor.fields.provider`（"供应商"）；`profiles.editor.hints.preset` → `*.provider`，文案改写为"供应商只提供连接与模型信息（env），最终值由供应商与 profile.settings 合成"；`profiles.editor.options.noPreset` → `options.noProvider`（"无供应商"）。
- **不动** `memory.presets.*`、`*statusLine*` 等无关 key。

> 注意：`providers.editor.fields.basePreset`（基础预设）、`providers.editor.fields.authToken`/`baseUrl`、`providers.editor.sections.permissions/sandbox/hooks/...` 等条目在 Task 9/12 会删除对应功能；本步先完成 key 改名与文案，删除留到对应任务。

- [ ] **Step 2: 收口所有文案断言**

把前面任务里记录的、因 i18n key 改名而失败的测试断言更新到位。

- [ ] **Step 3: 段 A 全量验证（关键里程碑）**

Run:
```bash
make bindings-check
make lint-frontend
make build-frontend
make test-frontend
make test-rust
```
Expected: **全绿**。此时功能与基线等价，仅完成 Preset→Provider 改名。

- [ ] **Step 4: 清场核对——确认无残留配置 Preset 标识符**

Run:
```bash
grep -rni "preset" src src-tauri --include="*.rs" --include="*.ts" --include="*.tsx" --include="*.json" \
  | grep -viE "memory|statusLine|status_line|hook-presets|sandbox-presets|UsagePage|usage" \
  | grep -iE "preset"
```
Expected: 仅剩 `basePreset`/`base_preset_id`（Task 9 删）与 `settingsPatch`（Task 10 收窄）相关命中，无其它配置 Preset 残留。逐条确认。

- [ ] **Step 5: 提交**

```bash
git add -A
git commit -m "refactor(config): i18n key 与文案由 preset 改为 provider"
```

---

## 段 B：语义降级

### Task 9: 删除继承链（basePresetId）

**Files:**
- Modify: `src-tauri/src/config.rs`（`Provider` 字段、`resolve_preset_chain`、`upsert_provider`、`build_custom_provider_id`、`resolve_profile_settings`、测试）
- Modify: `src/types.ts`、`src/ipc.ts`
- Modify: `src/components/ProviderEditor.tsx`（basePreset 选择 UI，行 724-821 内）
- Modify: `src/components/config-workspace-utils.ts`（`resolveProviderChain`/`resolveProviderAutofillValues`）
- Modify: `src/i18n.ts`（删 `providers.editor.fields.basePreset`、`hints.baseSuggestions`）

- [ ] **Step 1: 写失败测试——合并逻辑不再依赖链**

在 `config.rs` 测试模块新增/改写一个测试，断言两步合并（provider.env → profile.settings）：

```rust
#[test]
fn resolve_profile_settings_merges_provider_then_profile() {
    let mut registry = empty_registry();
    registry.custom_providers.push(Provider {
        id: "custom:p".into(),
        name: "P".into(),
        localized_name: None,
        description: "".into(),
        doc_url: None,
        models: None,
        model_suggestions: vec![],
        env: json!({ "ANTHROPIC_BASE_URL": "https://x", "ANTHROPIC_MODEL": "m" })
            .as_object().unwrap().clone(),
        source: ProviderSource::Custom,
    });
    let profile = ConfigProfile {
        id: "prof".into(), name: "prof".into(), description: "".into(),
        provider_id: Some("custom:p".into()),
        settings: json!({ "env": { "ANTHROPIC_AUTH_TOKEN": "tok", "ANTHROPIC_MODEL": "override" } }),
        created_at: "t".into(), updated_at: "t".into(),
    };
    registry.profiles.push(profile.clone());
    let resolved = resolve_profile_settings(&registry, &profile).unwrap();
    let env = resolved.get("env").unwrap();
    assert_eq!(env.get("ANTHROPIC_BASE_URL").unwrap(), "https://x");   // 来自 provider
    assert_eq!(env.get("ANTHROPIC_AUTH_TOKEN").unwrap(), "tok");       // 来自 profile
    assert_eq!(env.get("ANTHROPIC_MODEL").unwrap(), "override");       // profile 覆盖 provider
}
```

> 该测试依赖 Task 10 的 `env` 字段；若按本计划顺序先做 Task 9，此处暂以 `settings_patch: json!({ "env": {...} })` 写，待 Task 10 再切到 `env` 字段。执行者按当前结构选其一，保证测试可编译。

- [ ] **Step 2: 运行测试确认失败**

Run: `make test-rust`
Expected: 新测试因结构/逻辑未就绪而 FAIL 或编译错。

- [ ] **Step 3: 删除继承字段与链解析**

`config.rs`：
- `Provider` 删除 `base_preset_id` 字段。
- 删除整个 `resolve_preset_chain` 函数（行 1162-1180）。
- `resolve_profile_settings` 改为不展开链，直接用单个 provider：

```rust
fn resolve_profile_settings(
    registry: &ConfigRegistry,
    profile: &ConfigProfile,
) -> Result<Value, String> {
    let mut resolved = Value::Object(Map::new());

    if let Some(provider_id) = profile.provider_id.as_deref() {
        let provider = find_provider(registry, provider_id)
            .ok_or_else(|| format!("未找到 provider '{}'", provider_id))?;
        // 仅 provider.env 进入合并（Task 10 起 provider 只有 env）
        let mut base = Map::new();
        base.insert("env".to_string(), Value::Object(provider.env.clone()));
        resolved = merge_json_values(resolved, Value::Object(base));
    }

    resolved = merge_json_values(resolved, profile.settings.clone());

    let mut object = resolved
        .as_object()
        .cloned()
        .ok_or("resolved settings 必须是 object".to_string())?;
    object.insert(
        "$schema".to_string(),
        Value::String(CLAUDE_SETTINGS_SCHEMA_URL.to_string()),
    );
    let resolved = stable_sort_json(Value::Object(object));
    validate_settings_document(&resolved)?;
    Ok(resolved)
}
```

> 若 Task 10 尚未把字段切到 `env`，本步先用 `provider.settings_patch.clone()` 作为合并源（保留旧行为），Task 10 再切。两任务可合并执行以减少返工——见 Task 10 开头说明。

- [ ] **Step 4: 清理继承相关代码**

`config.rs`：`upsert_provider` 删除"校验 base preset 存在"分支；`build_custom_provider_id` 不变（不涉及继承）；删除 `Provider` 改名时暂留的 `base_preset_id` 所有引用。删除测试模块中针对继承链的用例（如 `resolve_profile_settings_merges_builtin_custom_and_profile_layers` 改写为两步版本）。

- [ ] **Step 5: 前端删继承**

- `src/types.ts`：`Provider` 删 `basePresetId`。
- `src/ipc.ts`：`ProviderInput` 删 `basePresetId`。
- `src/components/ProviderEditor.tsx`：删除"基础预设"选择 UI（auth 分区行 724-821 内的 basePreset 部分）与相关 state `basePresetId`。
- `src/components/config-workspace-utils.ts`：删除 `resolveProviderChain`；`resolveProviderAutofillValues` 改为直接读单个 provider 的 env，不再递归。
- `src/i18n.ts`：删除 `providers.editor.fields.basePreset`、`providers.editor.hints.baseSuggestions`、`providers.editor.hints.baseStructuredKeys`（若有）。

- [ ] **Step 6: 重新生成 bindings 并验证**

Run:
```bash
make bindings
make bindings-check
make test-rust
pnpm exec vitest run src/components/__tests__/ProviderEditor.test.tsx src/components/__tests__/config-workspace-utils.test.ts
```
Expected: 全绿（更新相关前端测试以去除 basePreset 断言）。

- [ ] **Step 7: 提交**

```bash
git add -A
git commit -m "refactor(config): 删除供应商继承链 basePresetId，合并简化为两步"
```

---

### Task 10: 后端 Provider 数据结构收窄为 env + 元数据

**Files:**
- Modify: `src-tauri/src/config.rs`（`Provider`、`ProviderInput`、`parse_builtin_providers`、`upsert_provider`、`ConfigWorkspace` 序列化、测试）
- Modify: `src/types.ts`、`src/ipc.ts`

> 建议与 Task 9 连续执行（甚至合并提交），因二者都改 `resolve_profile_settings` 与结构体。

- [ ] **Step 1: 写失败测试——Provider 拒绝非 env 字段**

`config.rs` 测试模块新增：
```rust
#[test]
fn upsert_provider_rejects_non_env_settings() {
    // ProviderInput 不再接受 permissions/hooks 等；env 是唯一配置载体
    let input = ProviderInput {
        id: None,
        name: "X".into(),
        localized_name: None,
        description: "".into(),
        doc_url: None,
        models: None,
        model_suggestions: vec![],
        env: json!({ "ANTHROPIC_BASE_URL": "https://x" }).as_object().unwrap().clone(),
    };
    // 仅断言类型层面 env-only：ProviderInput 无 settings_patch 字段
    let normalized = normalize_provider_input(input).unwrap();
    assert!(normalized.env.contains_key("ANTHROPIC_BASE_URL"));
}
```

- [ ] **Step 2: 运行确认失败**

Run: `make test-rust`
Expected: 编译错误（`ProviderInput.env` / `normalize_provider_input` 返回 env 字段尚不存在）。

- [ ] **Step 3: 收窄 `Provider` 与 `ProviderInput`**

`config.rs`：把 `Provider.settings_patch: Value` 替换为：
```rust
    #[serde(default)]
    #[specta(type = std::collections::HashMap<String, String>)]
    pub env: Map<String, Value>,
```
> 用 `serde_json::Map<String, Value>` 存储，Specta 暴露为 `Record<string,string>`；值约束为字符串（env 变量本就是字符串）。`ProviderInput` 同样以 `env` 取代 `settings_patch`，删除任何 permissions/hooks 等入参。

`normalize_provider_input`：改为规范化 `env`（trim key/value、去空），不再处理 `settings_patch`。

- [ ] **Step 4: 调整内置解析**

`parse_builtin_providers`：现已构造 `settings_patch.env`；改为直接构造 `Provider.env`（把 `seed.env` + `seed.base_url` 折叠进 `env`，地址写入 `ANTHROPIC_BASE_URL`）。逻辑与原 `parse_builtin_presets` 内 env 构造一致，只是落到 `Provider.env` 而非 `settings_patch`。

- [ ] **Step 5: 调整 `upsert_provider` 与合并源**

`upsert_provider`：构造 `Provider { env: input.env, .. }`，删除 `settings_patch` / `validate_settings_document(&settings_patch)`（env-only 无需整文档校验；如需可校验 env 为字符串映射）。
`resolve_profile_settings`：合并源用 `provider.env`（Task 9 Step 3 已写成该形态）。

- [ ] **Step 6: 同步前端类型**

- `src/types.ts`：`Provider` 把 `settingsPatch: Record<string, unknown>` 替换为 `env: Record<string, string>`。
- `src/ipc.ts`：`ProviderInput` 同样以 `env: Record<string, string>` 取代 `settingsPatch`。

- [ ] **Step 7: 重新生成 bindings 并验证**

Run:
```bash
make bindings
make bindings-check
make test-rust
```
Expected: 全绿（更新内置 provider 相关 Rust 测试断言到 `env` 字段）。

- [ ] **Step 8: 提交**

```bash
git add -A
git commit -m "refactor(config): Provider 数据结构收窄为 env + 元数据"
```

---

### Task 11: 内置资源与夹具按 env-only 结构对齐

**Files:**
- Modify: `src-tauri/resources/builtin-providers.json`（如需）
- Modify: `src-tauri/tests/fixtures/config-registry.example.json`
- Modify: `src-tauri/tests/profile_apply_e2e.rs`

- [ ] **Step 1: 核对内置资源**

确认 `builtin-providers.json` 各条目仅含 `id/name/localizedName/slug/baseUrl/docUrl/env/models`，无 permissions/hooks 等。若个别条目带了非供应商字段，删除之。`baseUrl` 字段保留在种子里（由 `parse_builtin_providers` 折叠进 `env.ANTHROPIC_BASE_URL`）。

- [ ] **Step 2: 对齐夹具**

`config-registry.example.json`：`customProviders` 各条目把 `settingsPatch` 替换为 `env`（仅保留 env 内容，丢弃任何非 env 字段，体现 clean break）；删除任何 `basePresetId`。
`profile_apply_e2e.rs`：同步断言到 env-only 合并结果。

- [ ] **Step 3: 验证**

Run:
```bash
make test-rust
cargo test --manifest-path src-tauri/Cargo.toml --test profile_apply_e2e
```
Expected: 通过。

- [ ] **Step 4: 提交**

```bash
git add -A
git commit -m "refactor(config): 内置资源与夹具对齐 env-only Provider 结构"
```

---

### Task 12: ProviderEditor 剥离多余分区

**Files:**
- Modify: `src/components/ProviderEditor.tsx`
- Modify: `src/components/__tests__/ProviderEditor.test.tsx`
- Modify: `src/i18n.ts`（删除 `providers.editor.sections.{permissions,sandbox,hooks,marketplaces,plugins,statusLine,common,integrations,auth}` 等不再使用的 key）

> 保留：metadata（name/localizedName/description/docUrl/modelSuggestions）、base url（`env.ANTHROPIC_BASE_URL`）、models 列表、模型映射 env（`ANTHROPIC_MODEL` 等 5 个）、可选附加 env 键值编辑。
> 删除：permissions、sandbox、hooks、enabledPlugins、extraKnownMarketplaces、statusLine、`language`/`outputStyle`（behavior 顶层）、common 区、authToken（认证归 Profile）。

- [ ] **Step 1: 写失败测试——ProviderEditor 不渲染被删分区**

`ProviderEditor.test.tsx` 新增：
```tsx
it("不再渲染权限/hooks/沙箱/插件/状态行/认证分区", () => {
  render(<ProviderEditor provider={null} providers={[]} onSave={vi.fn()} onClose={vi.fn()} />);
  expect(screen.queryByText(t("providers.editor.sections.permissions"))).toBeNull();
  expect(screen.queryByText(t("providers.editor.sections.hooks"))).toBeNull();
  expect(screen.queryByText(t("providers.editor.sections.sandbox"))).toBeNull();
  expect(screen.queryByText(t("providers.editor.sections.statusLine"))).toBeNull();
  expect(screen.queryByText(t("providers.editor.fields.authToken"))).toBeNull();
});

it("仍渲染地址与模型映射", () => {
  render(<ProviderEditor provider={null} providers={[]} onSave={vi.fn()} onClose={vi.fn()} />);
  expect(screen.getByText(t("providers.editor.fields.baseUrl"))).toBeInTheDocument();
});
```
> 这些 i18n key 在删除分区后部分会移除；测试只对"保留项存在 + 删除项不存在"断言，删除项的 key 若被移除，改用稳定的 testid 或保留项断言。执行者据最终 key 决定断言方式。

- [ ] **Step 2: 运行确认失败**

Run: `pnpm exec vitest run src/components/__tests__/ProviderEditor.test.tsx`
Expected: FAIL（当前仍渲染这些分区）。

- [ ] **Step 3: 删除分区渲染**

`ProviderEditor.tsx`：
- 删除 `StructuredSettingsSections` 中 permissions/sandbox/hooks/enabledPlugins/marketplaces/statusLine/common/behavior 顶层（`language`/`outputStyle`）相关的渲染与传入的 JSON editor props。
- 删除 auth 分区里的 `authToken` 字段（保留 base url）。
- 保留模型映射 env 的编辑（`ANTHROPIC_MODEL`/`ANTHROPIC_DEFAULT_*`/`CLAUDE_CODE_SUBAGENT_MODEL`）与"可选附加 env"键值编辑。
- 组件内部数据从 `provider.env` 读写（不再有 `settingsPatch`）。`onSave` 产出的 `ProviderEditorSaveData` 携带 `env` 而非 `settingsPatch`。

> 若 ProviderEditor 现重度依赖 `settings-form-registry.ts` 的结构化分区机制，改为只消费 env/model 子集；不要改 `settings-form-registry.ts` 本身（仍服务 ProfileEditor）。

- [ ] **Step 4: 同步 ProvidersPage 保存数据形态**

`ProvidersPage.tsx`：`handleSave` 把 `ProviderEditorSaveData` 映射到 `ProviderInput`（`env` 取代 `settingsPatch`，无 `basePresetId`）。

- [ ] **Step 5: 删除无用 i18n key**

`src/i18n.ts`：删除 ProviderEditor 不再使用的 `providers.editor.sections.{permissions,sandbox,hooks,marketplaces,plugins,statusLine,common,integrations,auth}`、`providers.editor.fields.authToken`、行为/通用相关 hints（`behaviorJson`/`commonJson`/`expert*`）。**保留** ProfileEditor 仍用到的同名通用 key（确认无交叉引用后再删）。

- [ ] **Step 6: 验证**

Run:
```bash
pnpm exec vitest run src/components/__tests__/ProviderEditor.test.tsx src/components/__tests__/ProvidersPage.test.tsx
make lint-frontend
```
Expected: 通过。

- [ ] **Step 7: 提交**

```bash
git add -A
git commit -m "feat(config): ProviderEditor 剥离非供应商分区，仅保留连接/模型/元数据"
```

---

### Task 13: ProfileEditor 认证与地址协同

**Files:**
- Modify: `src/components/ProfileEditor.tsx`（行 818-851 baseUrl/authToken 区、行 471-475 autofill）
- Modify: `src/components/config-workspace-utils.ts`（`applyProviderAutofill`）
- Modify: `src/components/__tests__/ProfileEditor.test.tsx`
- Modify: `src/i18n.ts`（hints 文案）

> 决策（依据 spec 决策 2 + 单一事实源方案 X）：选中供应商后，base url 来自供应商、**只读展示**，不写入 `profile.settings.env`；认证字段（`ANTHROPIC_AUTH_TOKEN`）留在 Profile、可编辑、写入 `profile.settings.env`；模型映射仍可由 autofill 写入 Profile 作为可编辑默认值。

- [ ] **Step 1: 写失败测试——选中供应商后 base url 只读、认证可填且写入 profile**

`ProfileEditor.test.tsx` 新增：
```tsx
it("选中供应商后展示其 base url（只读）并允许填认证", async () => {
  const providers = [{
    id: "custom:p", name: "P", description: "",
    modelSuggestions: [], source: "custom",
    env: { ANTHROPIC_BASE_URL: "https://x", ANTHROPIC_MODEL: "m" },
  }];
  render(<ProfileEditor /* ...props... */ providers={providers} />);
  // 选中 provider
  // 断言 base url 只读展示为 https://x
  expect(screen.getByText("https://x")).toBeInTheDocument();
  // 认证输入可编辑，保存后进入 profile.settings.env.ANTHROPIC_AUTH_TOKEN
});
```
> 按 ProfileEditor 现有测试风格补齐 props 与交互；断言核心是"base url 只读来自 provider""认证写入 profile.settings.env"。

- [ ] **Step 2: 运行确认失败**

Run: `pnpm exec vitest run src/components/__tests__/ProfileEditor.test.tsx`
Expected: FAIL。

- [ ] **Step 3: 调整 ProfileEditor**

- 行 818-833：base url 改为**只读展示**选中 provider 的 `env.ANTHROPIC_BASE_URL`（无 provider 时隐藏或提示"先选供应商"），不再写入 `profile.settings`。
- 行 835-851：保留 `authToken` 的 `SensitiveTextInput`，写入 `profile.settings.env.ANTHROPIC_AUTH_TOKEN`。
- `handleProviderChange`：调用 `applyProviderAutofill` 时**不再写入 `ANTHROPIC_BASE_URL`**（地址由 provider 合并提供，避免双写）；模型映射可继续 autofill 为可编辑默认值。

- [ ] **Step 4: 调整 applyProviderAutofill**

`config-workspace-utils.ts`：`applyProviderAutofill` 的 `updates` 数组**移除 `ANTHROPIC_BASE_URL` 一项**（地址不再下沉到 profile）；保留模型映射与 effort 等。

- [ ] **Step 5: 更新 i18n 提示**

`profiles.editor.hints.provider`：文案改为"供应商提供连接地址与模型映射；在此填写你的认证密钥，最终值由供应商与 profile.settings 合成"。base url 字段标签改为只读语义文案。

- [ ] **Step 6: 验证**

Run:
```bash
pnpm exec vitest run src/components/__tests__/ProfileEditor.test.tsx src/components/__tests__/config-workspace-utils.test.ts
make lint-frontend
```
Expected: 通过。

- [ ] **Step 7: 提交**

```bash
git add -A
git commit -m "feat(config): ProfileEditor 地址只读取自供应商、认证密钥归 Profile"
```

---

### Task 14: 文档与规则同步

**Files:**
- Modify: `.claude/rules/config-system.md`
- Modify: `CLAUDE.md`（如命中）

- [ ] **Step 1: 改写规则文档**

`.claude/rules/config-system.md`：
- "模型"节：去掉"Preset 链 -> Profile""basePresetId 继承"表述，改为"Provider（供应商，仅 env + 元数据）→ Profile（引用一个 providerId，叠加 settings）"。
- 文件路径列表 `PresetsPage.tsx`/`PresetEditor.tsx` → `ProvidersPage.tsx`/`ProviderEditor.tsx`。
- `paths` frontmatter 同步改名。
- 合并逻辑节：`resolve_profile_settings` 改为两步描述，删除 `resolve_preset_chain` 提法。
- 内置 Provider 节：表述保持，确认 12 个 provider 不变。

- [ ] **Step 2: 核对 CLAUDE.md**

Run:
```bash
grep -ni "preset\|预设" CLAUDE.md
```
Expected: 若命中配置 Preset 表述（如"Profile / Preset 编辑器"路径），改为 Provider；记忆/无关表述不动。改完跑 `wc -l CLAUDE.md` 确认仍 < 200 行约束。

- [ ] **Step 3: 验证**

Run:
```bash
git diff --check
wc -l CLAUDE.md
```
Expected: 无空白错误；CLAUDE.md 行数符合约束。

- [ ] **Step 4: 提交**

```bash
git add .claude/rules/config-system.md CLAUDE.md
git commit -m "docs(config): 规则与 CLAUDE.md 同步 Provider 降级"
```

---

### Task 15: 全量门禁与人工核验

**Files:** 无改动

- [ ] **Step 1: 全量本地门禁**

Run:
```bash
make verify
```
Expected: 全绿（fmt/lint/test/bindings/build 全过）。

- [ ] **Step 2: 残留标识符终检**

Run:
```bash
grep -rni "preset" src src-tauri --include="*.rs" --include="*.ts" --include="*.tsx" --include="*.json" \
  | grep -viE "memory|statusLine|status_line|hook-presets|sandbox-presets|UsagePage|usage"
```
Expected: 无任何配置 Preset 残留（继承/settingsPatch 已删，应为空或仅剩确认无关项）。

- [ ] **Step 3: 本地应用人工核验**

Run: `make dev`
核验清单：
- 供应商页（原预设页）列出内置 12 个 provider + 自定义；ProviderEditor 仅含连接/模型/元数据，无权限/hooks/沙箱/插件/状态行/认证分区。
- 新建/编辑/删除自定义 provider 正常。
- Profile 编辑器：选中供应商后显示其 base url（只读），可填认证密钥；保存并应用后 `~/.claude/settings.json` 的 `env` 含供应商地址/模型 + profile 的认证。
- 切换不同 profile（绑定不同 provider）应用正确。

- [ ] **Step 4: 截图归档（若环境支持）**

无法截图时在 PR/总结里说明限制。

---

## Self-Review（已执行）

**Spec 覆盖核对：**
- 决策 1（边界 env+元数据）→ Task 10/12 ✓
- 决策 2（认证归 Profile）→ Task 12（删 ProviderEditor authToken）+ Task 13（Profile 认证）✓
- 决策 3（删继承链）→ Task 9 ✓
- 决策 4（全面改名）→ Task 2-8 ✓
- clean break 无迁移 → Task 11（夹具直接重写，不读旧字段）✓
- 单一事实源方案 X（地址只在 env.ANTHROPIC_BASE_URL）→ Task 10（折叠进 env）+ Task 13（Profile 不再双写地址）✓
- 内置 12 provider 不变 → Task 11 ✓
- 同步点（config.rs/lib.rs/bindings/types/ipc/i18n/测试/规则）→ Task 2-14 ✓

**占位符扫描：** 无 TBD/TODO；语义任务均含具体代码与命令。少数测试断言因"最终 i18n key/testid 由删除结果决定"标注了执行者据实落地的说明，非占位符而是明确的条件分支指引。

**类型一致性：** Rust `Provider.env: Map<String,Value>` ↔ 前端 `Provider.env: Record<string,string>` ↔ `ProviderInput.env`；命令 `upsertProvider/deleteProvider` 前后端一致；`builtinProviders/customProviders` 三处（Rust/types/workspace）一致。

**已知执行注意：** Task 9 与 Task 10 都触及 `resolve_profile_settings` 与结构体，建议连续执行或合并提交以减少返工；计划已在 Task 9/10 开头标注。
