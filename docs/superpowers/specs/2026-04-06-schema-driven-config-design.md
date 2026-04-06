# Schema 驱动配置表单设计

## 背景与目标

### 现状问题

`ConfigEditor.tsx`（695 行）中有 22 个独立 `useState` 变量，表单校验仅有 4 条手写规则（名称非空、API Key 非空、JSON 格式），缺乏 URL 格式校验、枚举值校验等基础验证。前后端字段约束各自维护，容易漂移。

### 目标

1. **单一规范源**：JSON Schema 文件定义所有字段的类型、约束、默认值
2. **前端 schema 驱动**：Zod schema 从 JSON Schema 推导 TypeScript 类型，react-hook-form 统一管理表单状态
3. **自动渲染普通字段**：`SchemaFormField` 组件按分组配置渲染标准字段，减少重复 JSX
4. **后端对齐**：Rust 通过 `schemars` 生成并测试字段与 JSON Schema 一致
5. **保持 i18n**：所有用户可见文字使用 i18n key，不硬编码

---

## 架构

```
src/schemas/
  claude-config.schema.json   ← 规范源（字段约束，无 UI 文字）
  config-schema.ts            ← Zod schema + TS 类型推断
  field-groups.ts             ← 分组与 UI 元数据（i18n key）

src/components/
  SchemaFormField.tsx         ← 通用字段渲染器（text/password/checkbox/select/combobox）
  ConfigEditor.tsx            ← 重构（useForm 替换 22 个 useState）

src/i18n.ts                  ← 补充校验错误消息 key

src-tauri/Cargo.toml         ← 添加 schemars
src-tauri/src/config.rs      ← 添加 JsonSchema derive + 一致性测试
```

---

## 详细设计

### 1. JSON Schema（规范源）

文件：`src/schemas/claude-config.schema.json`

只包含字段的结构约束，不包含 UI 文字（label、placeholder 由 field-groups.ts 用 i18n key 提供）：

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "claude-config",
  "type": "object",
  "required": ["name", "apiKey"],
  "properties": {
    "name":                       { "type": "string", "minLength": 1 },
    "description":                { "type": "string", "default": "" },
    "apiKey":                     { "type": "string", "minLength": 1 },
    "apiUrl":                     { "type": "string", "format": "uri" },
    "websiteUrl":                 { "type": "string", "format": "uri" },
    "model":                      { "type": "string" },
    "haikuModel":                 { "type": "string" },
    "sonnetModel":                { "type": "string" },
    "opusModel":                  { "type": "string" },
    "alwaysThinkingEnabled":      { "type": "boolean", "default": false },
    "disableNonessentialTraffic": { "type": "boolean", "default": false },
    "skipWebFetchPreflight":      { "type": "boolean", "default": false },
    "enableLspTool":              { "type": "boolean", "default": false },
    "agentTeamsEnabled":          { "type": "boolean", "default": false },
    "hasCompletedOnboarding":     { "type": "boolean", "default": true },
    "enableExtraMarketplaces":    { "type": "boolean", "default": false },
    "preferredLanguage":          { "type": "string", "enum": ["english", "chinese"], "default": "english" },
    "useDefaults":                { "type": "boolean", "default": false },
    "providerId":                 { "type": "string" },
    "enabledPlugins":             { "type": "object", "additionalProperties": { "type": "boolean" } }
  },
  "additionalProperties": false
}
```

> `thinkingModel` 字段前端有定义但后端未实现，此次从 schema 中移除，彻底清理。
> `extraFields` 不纳入 schema 约束，保持 JSON 编辑器自由输入的方式。

---

### 2. Zod Schema

文件：`src/schemas/config-schema.ts`

手动维护，与 JSON Schema 保持字段对齐（可后续加 build step 自动同步）：

```typescript
import { z } from "zod";

export const ClaudeConfigSchema = z.object({
  name: z.string().min(1, "configEditor.validation.nameRequired"),
  description: z.string().default(""),
  apiKey: z.string().min(1, "configEditor.validation.apiKeyRequired"),
  apiUrl: z.string().url("configEditor.validation.invalidUrl").optional().or(z.literal("")).transform(v => v || undefined),
  websiteUrl: z.string().url("configEditor.validation.invalidUrl").optional().or(z.literal("")).transform(v => v || undefined),
  model: z.string().optional(),
  haikuModel: z.string().optional(),
  sonnetModel: z.string().optional(),
  opusModel: z.string().optional(),
  alwaysThinkingEnabled: z.boolean().default(false),
  disableNonessentialTraffic: z.boolean().default(false),
  skipWebFetchPreflight: z.boolean().default(false),
  enableLspTool: z.boolean().default(false),
  agentTeamsEnabled: z.boolean().default(false),
  hasCompletedOnboarding: z.boolean().default(true),
  enableExtraMarketplaces: z.boolean().default(false),
  preferredLanguage: z.enum(["english", "chinese"]).default("english"),
  useDefaults: z.boolean().default(false),
  providerId: z.string().optional(),
  enabledPlugins: z.record(z.boolean()).optional(),
});

export type ClaudeConfigFormData = z.infer<typeof ClaudeConfigSchema>;
```

---

### 3. 分组与 UI 元数据

文件：`src/schemas/field-groups.ts`

定义字段分组顺序和每个字段的 UI 渲染方式，全部使用 i18n key：

```typescript
export type FieldInputType = "text" | "password" | "checkbox" | "select" | "combobox" | "url";

export interface FieldConfig {
  name: keyof ClaudeConfigFormData;
  labelKey: string;
  placeholderKey?: string;
  inputType: FieldInputType;
  options?: { value: string; labelKey: string }[];  // 用于 select
}

export interface FieldGroup {
  id: string;
  labelKey: string;
  collapsible: boolean;
  fields: FieldConfig[];
}

export const FIELD_GROUPS: FieldGroup[] = [
  {
    id: "basic",
    labelKey: "configEditor.section.basic",
    collapsible: false,
    fields: [
      { name: "name",        labelKey: "configEditor.name",        placeholderKey: "configEditor.namePlaceholder",        inputType: "text" },
      { name: "description", labelKey: "configEditor.description", placeholderKey: "configEditor.descriptionPlaceholder", inputType: "text" },
      { name: "apiKey",      labelKey: "configEditor.apiKey",      placeholderKey: "configEditor.apiKeyPlaceholder",      inputType: "password" },
    ],
  },
  {
    id: "models",
    labelKey: "configEditor.section.models",
    collapsible: true,
    fields: [
      { name: "model",       labelKey: "configEditor.model",       inputType: "combobox" },
      { name: "haikuModel",  labelKey: "configEditor.haikuModel",  inputType: "combobox" },
      { name: "sonnetModel", labelKey: "configEditor.sonnetModel", inputType: "combobox" },
      { name: "opusModel",   labelKey: "configEditor.opusModel",   inputType: "combobox" },
    ],
  },
  {
    id: "advanced",
    labelKey: "configEditor.section.advanced",
    collapsible: true,
    fields: [
      { name: "alwaysThinkingEnabled",      labelKey: "configEditor.alwaysThinking",      inputType: "checkbox" },
      { name: "disableNonessentialTraffic", labelKey: "configEditor.disableTraffic",       inputType: "checkbox" },
      { name: "skipWebFetchPreflight",      labelKey: "configEditor.skipWebFetch",         inputType: "checkbox" },
      { name: "enableLspTool",              labelKey: "configEditor.enableLsp",            inputType: "checkbox" },
      { name: "agentTeamsEnabled",          labelKey: "configEditor.agentTeams",           inputType: "checkbox" },
      { name: "hasCompletedOnboarding",     labelKey: "configEditor.onboarding",           inputType: "checkbox" },
      { name: "enableExtraMarketplaces",    labelKey: "configEditor.extraMarketplaces",    inputType: "checkbox" },
      { name: "preferredLanguage",          labelKey: "configEditor.language",             inputType: "select",
        options: [
          { value: "english", labelKey: "configEditor.languageEnglish" },
          { value: "chinese", labelKey: "configEditor.languageChinese" },
        ],
      },
      { name: "useDefaults",                labelKey: "configEditor.useDefaults",          inputType: "checkbox" },
    ],
  },
];
```

> `providerId`（Provider 下拉）、`enabledPlugins`（插件列表）不在 FIELD_GROUPS 中，保留自定义渲染。
> `combobox` 字段的 datalist 选项由 ConfigEditor 通过 Provider 动态注入，不在分组配置中定义。

---

### 4. SchemaFormField 组件

文件：`src/components/SchemaFormField.tsx`

接受 `FieldConfig`、react-hook-form 的 `register`/`control`、错误信息，渲染对应输入控件：

```typescript
interface SchemaFormFieldProps {
  field: FieldConfig;
  register: UseFormRegister<ClaudeConfigFormData>;
  control: Control<ClaudeConfigFormData>;
  error?: FieldError;
  // combobox 专用：datalist id
  datalistId?: string;
}
```

支持的 `inputType`：
- `text`、`url` → `<input type="text">`，URL 类型带格式校验错误提示
- `password` → `<input type="password">` + 显示/隐藏按钮
- `checkbox` → `<Controller>` + toggle
- `select` → `<select>` + options
- `combobox` → `<input list={datalistId}>`，datalist 由父组件提供

---

### 5. ConfigEditor 重构

**核心变化：**
- 移除 22 个 `useState`，改为 `useForm<ClaudeConfigFormData>({ resolver: zodResolver(ClaudeConfigSchema) })`
- 通过 `buildDefaultValues(config: ClaudeConfig)` 函数将现有配置转换为表单初始值
- FIELD_GROUPS 分组自动渲染，CollapsibleSection 保持不变
- `handleSubmit` 中不再手写校验，由 zodResolver 在提交前自动拦截

**保留自定义渲染的部分：**
- Provider 下拉区域（`providerId` + `apiUrl` 自动填充 + 文档链接）
- 模型 `<datalist>` 注入（从选中 Provider 的 models 过滤后动态生成）
- `PluginManager` 组件（`enabledPlugins`）
- Defaults JSON 编辑器（`useDefaults` + `defaultsContent`）
- Preview JSON 面板

**预计行数**：695 行 → ~380 行（减少 ~45%）

---

### 6. i18n 补充

在 `src/i18n.ts` 的中英文翻译中补充以下 key：

```typescript
// 分组标题
"configEditor.section.basic":   { zh: "基础配置",   en: "Basic" },
"configEditor.section.models":  { zh: "模型配置",   en: "Models" },
"configEditor.section.advanced":{ zh: "高级设置",   en: "Advanced" },

// 校验错误
"configEditor.validation.nameRequired":   { zh: "配置名称不能为空",      en: "Name is required" },
"configEditor.validation.apiKeyRequired": { zh: "API Key 不能为空",      en: "API Key is required" },
"configEditor.validation.invalidUrl":     { zh: "请输入有效的 URL",       en: "Please enter a valid URL" },
```

---

### 7. Rust 后端

**依赖**：在 `src-tauri/Cargo.toml` 中添加 `schemars = "0.8"`

**改动**：在 `ClaudeConfig` 和 `ConfigData` 上派生 `JsonSchema`：

```rust
use schemars::JsonSchema;

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct ClaudeConfig { ... }
```

**一致性测试**：

```rust
#[test]
fn config_schema_matches_json_schema() {
    let schema = schemars::schema_for!(ClaudeConfig);
    let props = schema.schema.object.unwrap().properties;
    // 验证 JSON Schema 中声明的 required 字段在 Rust schema 中也存在
    let json_schema: serde_json::Value = serde_json::from_str(
        include_str!("../../src/schemas/claude-config.schema.json")
    ).unwrap();
    let required = json_schema["required"].as_array().unwrap();
    for field in required {
        assert!(props.contains_key(field.as_str().unwrap()),
            "字段 {} 在 Rust schema 中不存在", field);
    }
}
```

---

## 依赖变化

| 包 | 操作 |
|----|------|
| `zod` | 新增（前端） |
| `react-hook-form` | 新增（前端） |
| `@hookform/resolvers` | 新增（前端，zod resolver） |
| `schemars` | 新增（Rust） |

---

## 验证

1. `pnpm build` 编译通过，无 TypeScript 错误
2. `cargo test` 中 `config_schema_matches_json_schema` 通过
3. `pnpm tauri dev` 启动后：
   - ConfigEditor 各字段正常显示
   - 名称/API Key 为空时提交被拦截并显示错误提示
   - URL 字段输入非法格式时显示校验错误
   - 现有 Provider 下拉、插件管理、JSON 预览功能不受影响
4. 切换中英文，校验错误提示语言同步切换
