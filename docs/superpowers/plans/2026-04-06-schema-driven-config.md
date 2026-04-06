# Schema 驱动配置表单实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 ConfigEditor 的 22 个 useState 重构为 react-hook-form + Zod schema 驱动，前端校验规则由 JSON Schema 和 Zod 统一定义，后端通过 schemars 与之对齐。

**Architecture:** 新增 `src/schemas/` 目录存放 JSON Schema（规范源）、Zod schema（TS 类型 + 校验）、字段分组元数据。ConfigEditor 使用 `useForm<ClaudeConfigFormData>` 替换所有 `useState`，新增 `SchemaFormField` 通用渲染组件处理 text/password/checkbox/select 类型字段。Rust 侧通过 `schemars` 派生 JSON Schema 并用测试验证与前端一致。

**Tech Stack:** React 19, TypeScript, `react-hook-form`, `zod`, `@hookform/resolvers`, `schemars` (Rust)

---

## 文件结构

| 文件 | 操作 | 说明 |
|------|------|------|
| `package.json` | 修改 | 添加 zod / react-hook-form / @hookform/resolvers |
| `src/schemas/claude-config.schema.json` | 新建 | 字段约束规范源 |
| `src/schemas/config-schema.ts` | 新建 | Zod schema + `ClaudeConfigFormData` 类型 |
| `src/schemas/field-groups.ts` | 新建 | 分组 + 字段 UI 元数据（i18n key） |
| `src/components/SchemaFormField.tsx` | 新建 | 通用字段渲染器 |
| `src/components/ConfigEditor.tsx` | 修改 | 替换 22 个 useState，集成 react-hook-form |
| `src/types.ts` | 修改 | 移除 `thinkingModel`（前端孤立字段） |
| `src/i18n.ts` | 修改 | 新增分组标题和校验错误 key |
| `src-tauri/Cargo.toml` | 修改 | 添加 `schemars = "0.8"` |
| `src-tauri/src/config.rs` | 修改 | 为 `ClaudeConfig` / `ConfigData` 派生 `JsonSchema`，添加一致性测试 |

---

## Task 1: 安装前端依赖

**Files:**
- Modify: `package.json`

- [ ] **Step 1: 安装三个包**

```bash
cd /path/to/ai-manager
pnpm add zod react-hook-form @hookform/resolvers
```

- [ ] **Step 2: 验证编译通过**

```bash
pnpm build
```

Expected: `✓ built in X.XXs` （无报错）

- [ ] **Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: 添加 zod、react-hook-form、@hookform/resolvers 依赖"
```

---

## Task 2: 创建 JSON Schema（规范源）

**Files:**
- Create: `src/schemas/claude-config.schema.json`

- [ ] **Step 1: 创建 src/schemas/ 目录并写入 JSON Schema**

创建文件 `src/schemas/claude-config.schema.json`，内容如下：

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "claude-config",
  "title": "Claude Code Configuration",
  "type": "object",
  "required": ["name", "apiKey"],
  "additionalProperties": false,
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
    "hasCompletedOnboarding":     { "type": "boolean", "default": false },
    "enableExtraMarketplaces":    { "type": "boolean", "default": false },
    "preferredLanguage":          { "type": "string", "default": "english" },
    "useDefaults":                { "type": "boolean", "default": false },
    "providerId":                 { "type": "string" },
    "enabledPlugins":             {
      "type": "object",
      "additionalProperties": { "type": "boolean" }
    }
  }
}
```

- [ ] **Step 2: 验证 JSON 格式合法**

```bash
node -e "JSON.parse(require('fs').readFileSync('src/schemas/claude-config.schema.json','utf8')); console.log('valid')"
```

Expected: `valid`

- [ ] **Step 3: Commit**

```bash
git add src/schemas/claude-config.schema.json
git commit -m "feat(schema): 添加 ClaudeConfig JSON Schema 规范文件"
```

---

## Task 3: 创建 Zod Schema 和字段分组配置

**Files:**
- Create: `src/schemas/config-schema.ts`
- Create: `src/schemas/field-groups.ts`

- [ ] **Step 1: 创建 `src/schemas/config-schema.ts`**

```typescript
import { z } from "zod";

const urlField = z
  .string()
  .refine(
    (v) => !v || v.startsWith("http://") || v.startsWith("https://"),
    { message: "configEditor.validation.invalidUrl" }
  )
  .optional();

export const ClaudeConfigSchema = z.object({
  name: z.string().min(1, "configEditor.validation.nameRequired"),
  description: z.string().default(""),
  apiKey: z.string().min(1, "configEditor.validation.apiKeyRequired"),
  apiUrl: urlField,
  websiteUrl: urlField,
  model: z.string().optional(),
  haikuModel: z.string().optional(),
  sonnetModel: z.string().optional(),
  opusModel: z.string().optional(),
  alwaysThinkingEnabled: z.boolean().default(false),
  disableNonessentialTraffic: z.boolean().default(false),
  skipWebFetchPreflight: z.boolean().default(false),
  enableLspTool: z.boolean().default(false),
  agentTeamsEnabled: z.boolean().default(false),
  hasCompletedOnboarding: z.boolean().default(false),
  enableExtraMarketplaces: z.boolean().default(false),
  preferredLanguage: z.string().default("english"),
  useDefaults: z.boolean().default(false),
  providerId: z.string().optional(),
  enabledPlugins: z.record(z.string(), z.boolean()).optional(),
});

export type ClaudeConfigFormData = z.infer<typeof ClaudeConfigSchema>;
```

- [ ] **Step 2: 创建 `src/schemas/field-groups.ts`**

```typescript
import type { ClaudeConfigFormData } from "./config-schema";

export type FieldInputType = "text" | "password" | "checkbox" | "select" | "combobox" | "url";

export interface FieldConfig {
  name: keyof ClaudeConfigFormData;
  labelKey: string;
  descriptionKey?: string;
  placeholderKey?: string;
  inputType: FieldInputType;
  options?: { value: string; labelKey: string }[];
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
      {
        name: "name",
        labelKey: "configModal.name",
        placeholderKey: "configModal.namePlaceholder",
        inputType: "text",
      },
      {
        name: "description",
        labelKey: "configModal.description",
        placeholderKey: "configModal.descriptionPlaceholder",
        inputType: "text",
      },
      {
        name: "apiKey",
        labelKey: "configModal.apiKey",
        placeholderKey: "configModal.apiKeyPlaceholder",
        inputType: "password",
      },
    ],
  },
  {
    id: "advanced",
    labelKey: "configEditor.section.advanced",
    collapsible: true,
    fields: [
      {
        name: "hasCompletedOnboarding",
        labelKey: "configModal.hasCompletedOnboarding",
        descriptionKey: "configModal.hasCompletedOnboardingDesc",
        inputType: "checkbox",
      },
      {
        name: "alwaysThinkingEnabled",
        labelKey: "configModal.alwaysThinking",
        inputType: "checkbox",
      },
      {
        name: "disableNonessentialTraffic",
        labelKey: "configModal.disableTraffic",
        inputType: "checkbox",
      },
      {
        name: "skipWebFetchPreflight",
        labelKey: "configModal.skipWebFetchPreflight",
        inputType: "checkbox",
      },
      {
        name: "enableLspTool",
        labelKey: "configModal.enableLspTool",
        inputType: "checkbox",
      },
      {
        name: "agentTeamsEnabled",
        labelKey: "configModal.enableAgentTeams",
        descriptionKey: "configModal.enableAgentTeamsDesc",
        inputType: "checkbox",
      },
    ],
  },
];
```

- [ ] **Step 3: 验证 TypeScript 编译**

```bash
pnpm build
```

Expected: `✓ built in X.XXs`

- [ ] **Step 4: Commit**

```bash
git add src/schemas/config-schema.ts src/schemas/field-groups.ts
git commit -m "feat(schema): 添加 Zod schema 和字段分组配置"
```

---

## Task 4: 补充 i18n 翻译 Key

**Files:**
- Modify: `src/i18n.ts`

- [ ] **Step 1: 在 zh 翻译对象中追加新 key**

在 `src/i18n.ts` 的 `zh` 对象最后一个 key 之前（`"nav.ariaLabel"` 附近），添加以下 key：

```typescript
// 配置编辑器 - 分组标题
"configEditor.section.basic": "基础信息",
"configEditor.section.advanced": "高级选项",

// 配置编辑器 - 表单校验错误
"configEditor.validation.nameRequired": "配置名称不能为空",
"configEditor.validation.apiKeyRequired": "API Key 不能为空",
"configEditor.validation.invalidUrl": "请输入有效的 URL（需以 http:// 或 https:// 开头）",
```

- [ ] **Step 2: 在 en 翻译对象中追加相同 key 的英文翻译**

在 `src/i18n.ts` 的 `en` 对象对应位置追加：

```typescript
// ConfigEditor - section labels
"configEditor.section.basic": "Basic Info",
"configEditor.section.advanced": "Advanced",

// ConfigEditor - validation errors
"configEditor.validation.nameRequired": "Name is required",
"configEditor.validation.apiKeyRequired": "API Key is required",
"configEditor.validation.invalidUrl": "Must be a valid URL starting with http:// or https://",
```

- [ ] **Step 3: 验证编译**

```bash
pnpm build
```

Expected: `✓ built in X.XXs`

- [ ] **Step 4: Commit**

```bash
git add src/i18n.ts
git commit -m "feat(i18n): 添加配置表单分组标题和校验错误消息翻译"
```

---

## Task 5: 创建 SchemaFormField 通用字段组件

**Files:**
- Create: `src/components/SchemaFormField.tsx`

- [ ] **Step 1: 创建 `src/components/SchemaFormField.tsx`**

```typescript
import { useState } from "react";
import {
  UseFormRegister,
  Control,
  Controller,
  FieldError,
} from "react-hook-form";
import { useI18n } from "../i18n";
import type { ClaudeConfigFormData } from "../schemas/config-schema";
import type { FieldConfig } from "../schemas/field-groups";

interface SchemaFormFieldProps {
  field: FieldConfig;
  register: UseFormRegister<ClaudeConfigFormData>;
  control: Control<ClaudeConfigFormData>;
  error?: FieldError;
  /** combobox 专用：对应的 datalist 元素 id */
  datalistId?: string;
}

export default function SchemaFormField({
  field,
  register,
  control,
  error,
  datalistId,
}: SchemaFormFieldProps) {
  const { t } = useI18n();
  const [showPassword, setShowPassword] = useState(false);

  const errorEl = error ? (
    <span className="field-error">{t(error.message ?? "")}</span>
  ) : null;

  if (field.inputType === "checkbox") {
    return (
      <div className="checkbox-group">
        <Controller
          name={field.name}
          control={control}
          render={({ field: f }) => (
            <label className="checkbox-label">
              <input
                type="checkbox"
                id={field.name}
                checked={!!f.value}
                onChange={(e) => f.onChange(e.target.checked)}
              />
              <span className="checkbox-custom" />
              <span>{t(field.labelKey)}</span>
            </label>
          )}
        />
        {field.descriptionKey && (
          <p className="form-hint">{t(field.descriptionKey)}</p>
        )}
        {errorEl}
      </div>
    );
  }

  if (field.inputType === "select") {
    return (
      <div className="form-group">
        <label htmlFor={field.name}>{t(field.labelKey)}</label>
        <select id={field.name} {...register(field.name)}>
          {(field.options ?? []).map((opt) => (
            <option key={opt.value} value={opt.value}>
              {t(opt.labelKey)}
            </option>
          ))}
        </select>
        {errorEl}
      </div>
    );
  }

  if (field.inputType === "password") {
    return (
      <div className="form-group">
        <label htmlFor={field.name} className="label-required">
          <span>{t(field.labelKey)}</span>
          <span className="required-badge">{t("form.required")}</span>
        </label>
        <div className="input-with-toggle">
          <input
            id={field.name}
            type={showPassword ? "text" : "password"}
            placeholder={field.placeholderKey ? t(field.placeholderKey) : undefined}
            {...register(field.name)}
          />
          <button
            type="button"
            className="toggle-visibility"
            onClick={() => setShowPassword((v) => !v)}
          >
            {showPassword ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                <line x1="1" y1="1" x2="23" y2="23" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            )}
          </button>
        </div>
        {errorEl}
      </div>
    );
  }

  // text, url, combobox
  const isRequired = field.name === "name" || field.name === "apiKey";
  return (
    <div className="form-group">
      <label
        htmlFor={field.name}
        className={isRequired ? "label-required" : undefined}
      >
        <span>{t(field.labelKey)}</span>
        {isRequired && (
          <span className="required-badge">{t("form.required")}</span>
        )}
      </label>
      <input
        id={field.name}
        type={field.inputType === "url" ? "url" : "text"}
        list={datalistId}
        placeholder={field.placeholderKey ? t(field.placeholderKey) : undefined}
        {...register(field.name)}
      />
      {errorEl}
    </div>
  );
}
```

- [ ] **Step 2: 验证编译**

```bash
pnpm build
```

Expected: `✓ built in X.XXs`

- [ ] **Step 3: Commit**

```bash
git add src/components/SchemaFormField.tsx
git commit -m "feat(ui): 新增 SchemaFormField 通用字段渲染组件"
```

---

## Task 6: 重构 ConfigEditor 并移除 thinkingModel

**Files:**
- Modify: `src/types.ts` （移除 `thinkingModel`）
- Modify: `src/components/ConfigEditor.tsx` （全量重构）

> 注意：Rust 侧 `config.rs` 中的 `thinking_model` 字段保留（向后兼容已存储的配置数据），仅清理前端代码。

- [ ] **Step 1: 从 `src/types.ts` 移除 `thinkingModel` 字段**

将 `src/types.ts` 中 `ClaudeConfig` 接口的 `thinkingModel?: string;` 这一行删除：

```typescript
// 删除此行（大约第 34 行）：
  thinkingModel?: string;
```

- [ ] **Step 2: 用重构版本替换 `src/components/ConfigEditor.tsx` 全文**

新内容如下（完整替换，695 行 → 约 380 行）：

```typescript
import { useState, useEffect, useRef } from "react";
import { useForm, Controller, FieldError } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { invoke } from "@tauri-apps/api/core";
import { ClaudeConfig, Provider } from "../types";
import { useI18n } from "../i18n";
import { ClaudeConfigSchema, ClaudeConfigFormData } from "../schemas/config-schema";
import { FIELD_GROUPS } from "../schemas/field-groups";
import SchemaFormField from "./SchemaFormField";
import "./ConfigEditor.css";
import PluginManager from "./PluginManager";
import DefaultsSection from "./DefaultsSection";
import ConfigPreview from "./ConfigPreview";
import CollapsibleSection from "./CollapsibleSection";
import { ChevronLeftIcon } from "./Icons";

/** 将已有配置（或 null）映射为 react-hook-form 的初始值 */
function buildDefaultValues(config: ClaudeConfig | null): Partial<ClaudeConfigFormData> {
  return {
    name: config?.name ?? "",
    description: config?.description ?? "",
    apiKey: config?.apiKey ?? "",
    apiUrl: config?.apiUrl ?? "",
    websiteUrl: config?.websiteUrl ?? "",
    model: config?.model ?? "",
    haikuModel: config?.haikuModel ?? "",
    sonnetModel: config?.sonnetModel ?? "",
    opusModel: config?.opusModel ?? "",
    alwaysThinkingEnabled: config?.alwaysThinkingEnabled ?? false,
    disableNonessentialTraffic: config?.disableNonessentialTraffic ?? false,
    skipWebFetchPreflight: config?.skipWebFetchPreflight ?? false,
    enableLspTool: config?.enableLspTool ?? false,
    agentTeamsEnabled: config?.agentTeamsEnabled ?? false,
    hasCompletedOnboarding: config?.hasCompletedOnboarding ?? false,
    enableExtraMarketplaces: config?.enableExtraMarketplaces ?? false,
    preferredLanguage: config?.preferredLanguage ?? "english",
    useDefaults: config?.useDefaults ?? false,
    providerId: config?.providerId ?? "",
    enabledPlugins: config?.enabledPlugins,
  };
}

interface ConfigEditorProps {
  config: ClaudeConfig | null;
  defaults: string;
  providers?: Provider[];
  onSave: (
    config: Omit<ClaudeConfig, "id" | "createdAt" | "updatedAt" | "isActive">,
    defaults?: string
  ) => void;
  onClose: () => void;
}

function ConfigEditor({
  config,
  defaults,
  providers,
  onSave,
  onClose,
}: ConfigEditorProps) {
  const { t } = useI18n();

  const {
    register,
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<ClaudeConfigFormData>({
    resolver: zodResolver(ClaudeConfigSchema),
    defaultValues: buildDefaultValues(config),
    mode: "onBlur",
  });

  // 非 schema 管理的状态
  const [defaultsContent, setDefaultsContent] = useState(defaults ?? "");
  const [extraFields, setExtraFields] = useState<Record<string, unknown>>(
    config?.extraFields ?? {}
  );
  const [previewJson, setPreviewJson] = useState("{}");
  const [jsonError, setJsonError] = useState("");
  const isEditingPreview = useRef(false);
  const editingTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // 派生：当前选中的 Provider
  const providerId = watch("providerId");
  const selectedProvider =
    (providers ?? []).find((p) => p.id === providerId) ?? null;

  useEffect(() => {
    return () => {
      if (editingTimer.current) clearTimeout(editingTimer.current);
    };
  }, []);

  // 切换"使用通用配置"时，合并 enabledPlugins
  const useDefaultsVal = watch("useDefaults");
  useEffect(() => {
    if (!useDefaultsVal || !defaultsContent.trim()) {
      setValue("enabledPlugins", config?.enabledPlugins);
      return;
    }
    try {
      const obj = JSON.parse(defaultsContent.trim()) as Record<string, unknown>;
      if (obj.enabledPlugins && typeof obj.enabledPlugins === "object") {
        const merged = {
          ...(obj.enabledPlugins as Record<string, boolean>),
          ...(config?.enabledPlugins ?? {}),
        };
        setValue("enabledPlugins", merged);
      }
    } catch {
      // JSON 解析失败，忽略
    }
  }, [useDefaultsVal, defaultsContent, config?.enabledPlugins, setValue]);

  // 监听所有表单值生成预览（防抖 300ms）
  const formValues = watch();
  useEffect(() => {
    if (!formValues.apiKey) {
      setPreviewJson("{}");
      return;
    }
    if (isEditingPreview.current) return;

    let cancelled = false;
    const timer = setTimeout(() => {
      const data = {
        name: formValues.name,
        description: formValues.description,
        apiKey: formValues.apiKey,
        apiUrl: formValues.apiUrl || null,
        websiteUrl: formValues.websiteUrl || null,
        model: formValues.model || null,
        haikuModel: formValues.haikuModel || null,
        sonnetModel: formValues.sonnetModel || null,
        opusModel: formValues.opusModel || null,
        alwaysThinkingEnabled: formValues.alwaysThinkingEnabled ?? null,
        disableNonessentialTraffic: formValues.disableNonessentialTraffic ?? null,
        skipWebFetchPreflight: formValues.skipWebFetchPreflight ?? null,
        enableLspTool: formValues.enableLspTool ?? null,
        agentTeamsEnabled: formValues.agentTeamsEnabled ?? null,
        hasCompletedOnboarding: formValues.hasCompletedOnboarding ?? null,
        enableExtraMarketplaces: formValues.enableExtraMarketplaces ?? null,
        preferredLanguage: formValues.preferredLanguage || null,
        useDefaults: formValues.useDefaults ?? null,
        enabledPlugins:
          formValues.enabledPlugins &&
          Object.keys(formValues.enabledPlugins).length > 0
            ? formValues.enabledPlugins
            : null,
        extraFields: Object.keys(extraFields).length > 0 ? extraFields : null,
        providerId: formValues.providerId || null,
      };
      const previewDefaults =
        formValues.useDefaults && defaultsContent.trim()
          ? defaultsContent.trim()
          : null;
      invoke<string>("preview_config", { data, defaults: previewDefaults })
        .then((result) => {
          if (!cancelled) {
            setPreviewJson(result);
            setJsonError("");
          }
        })
        .catch(() => {
          if (!cancelled) setPreviewJson("{}");
        });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [formValues, defaultsContent, extraFields]);

  /** 从预览 JSON 反写表单字段（用于用户手动编辑 JSON 预览区） */
  function parseJsonToForm(jsonStr: string) {
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(jsonStr);
      setJsonError("");
    } catch (e) {
      setJsonError(e instanceof Error ? e.message : "JSON 格式错误");
      return;
    }

    const remaining = JSON.parse(JSON.stringify(parsed)) as Record<string, unknown>;
    const env = (parsed.env ?? {}) as Record<string, string>;

    if (env.ANTHROPIC_AUTH_TOKEN !== undefined) setValue("apiKey", env.ANTHROPIC_AUTH_TOKEN);
    if (env.ANTHROPIC_BASE_URL !== undefined) setValue("apiUrl", env.ANTHROPIC_BASE_URL);
    if (env.ANTHROPIC_MODEL !== undefined) setValue("model", env.ANTHROPIC_MODEL);
    if (env.ANTHROPIC_DEFAULT_HAIKU_MODEL !== undefined) setValue("haikuModel", env.ANTHROPIC_DEFAULT_HAIKU_MODEL);
    if (env.ANTHROPIC_DEFAULT_SONNET_MODEL !== undefined) setValue("sonnetModel", env.ANTHROPIC_DEFAULT_SONNET_MODEL);
    if (env.ANTHROPIC_DEFAULT_OPUS_MODEL !== undefined) setValue("opusModel", env.ANTHROPIC_DEFAULT_OPUS_MODEL);
    setValue("disableNonessentialTraffic", env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC === "1");
    setValue("enableLspTool", env.ENABLE_LSP_TOOL === "1");
    setValue("agentTeamsEnabled", env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS === "1");

    const knownEnvKeys = [
      "ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_BASE_URL", "ANTHROPIC_MODEL",
      "ANTHROPIC_DEFAULT_HAIKU_MODEL", "ANTHROPIC_DEFAULT_SONNET_MODEL",
      "ANTHROPIC_DEFAULT_OPUS_MODEL", "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC",
      "ENABLE_LSP_TOOL", "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS",
    ];
    if (remaining.env && typeof remaining.env === "object") {
      const remEnv = remaining.env as Record<string, unknown>;
      knownEnvKeys.forEach((k) => delete remEnv[k]);
      if (Object.keys(remEnv).length === 0) delete remaining.env;
    }

    if (typeof parsed.language === "string") setValue("preferredLanguage", parsed.language);
    else if (!("language" in parsed)) setValue("preferredLanguage", "english");
    delete remaining.language;

    setValue("alwaysThinkingEnabled", parsed.alwaysThinkingEnabled === true);
    delete remaining.alwaysThinkingEnabled;
    setValue("skipWebFetchPreflight", parsed.skipWebFetchPreflight === true);
    delete remaining.skipWebFetchPreflight;
    setValue("hasCompletedOnboarding", parsed.hasCompletedOnboarding === true);
    delete remaining.hasCompletedOnboarding;
    setValue("enableExtraMarketplaces", "extraKnownMarketplaces" in parsed);
    delete remaining.extraKnownMarketplaces;

    if (parsed.enabledPlugins && typeof parsed.enabledPlugins === "object") {
      setValue("enabledPlugins", parsed.enabledPlugins as Record<string, boolean>);
    }
    delete remaining.enabledPlugins;

    setExtraFields(remaining);
  }

  function handlePreviewChange(value: string) {
    isEditingPreview.current = true;
    if (editingTimer.current) clearTimeout(editingTimer.current);
    editingTimer.current = setTimeout(() => {
      isEditingPreview.current = false;
    }, 1000);
    setPreviewJson(value);
    parseJsonToForm(value);
  }

  /** 切换 Provider 时自动填充 apiUrl 并重置模型字段 */
  function handleProviderChange(newProviderId: string) {
    setValue("providerId", newProviderId);
    const p = (providers ?? []).find((pv) => pv.id === newProviderId);
    if (p) {
      setValue("apiUrl", p.apiUrl);
      setValue("model", "");
      setValue("haikuModel", "");
      setValue("sonnetModel", "");
      setValue("opusModel", "");
    } else {
      setValue("apiUrl", "");
    }
  }

  const onSubmit = (data: ClaudeConfigFormData) => {
    if (defaultsContent.trim()) {
      try {
        JSON.parse(defaultsContent.trim());
      } catch {
        return;
      }
    }
    // 若 apiUrl 与选中 Provider 预设相同，则不保存（让后端从 Provider 读取）
    const providerDefaultUrl = selectedProvider?.apiUrl ?? "";
    const effectiveApiUrl =
      data.apiUrl === providerDefaultUrl ? undefined : data.apiUrl || undefined;

    onSave(
      {
        name: data.name,
        description: data.description,
        apiKey: data.apiKey,
        apiUrl: effectiveApiUrl,
        websiteUrl: data.websiteUrl || undefined,
        model: data.model || undefined,
        haikuModel: data.haikuModel || undefined,
        sonnetModel: data.sonnetModel || undefined,
        opusModel: data.opusModel || undefined,
        alwaysThinkingEnabled: data.alwaysThinkingEnabled,
        disableNonessentialTraffic: data.disableNonessentialTraffic,
        skipWebFetchPreflight: data.skipWebFetchPreflight,
        enableLspTool: data.enableLspTool,
        agentTeamsEnabled: data.agentTeamsEnabled,
        enableExtraMarketplaces: data.enableExtraMarketplaces,
        hasCompletedOnboarding: data.hasCompletedOnboarding,
        useDefaults: data.useDefaults,
        enabledPlugins:
          data.enabledPlugins && Object.keys(data.enabledPlugins).length > 0
            ? data.enabledPlugins
            : undefined,
        extraFields:
          Object.keys(extraFields).length > 0 ? extraFields : undefined,
        providerId: data.providerId || undefined,
        preferredLanguage: data.preferredLanguage,
      },
      defaultsContent
    );
  };

  const watchName = watch("name");
  const watchApiKey = watch("apiKey");
  const advancedGroup = FIELD_GROUPS.find((g) => g.id === "advanced");

  return (
    <div className="editor-drawer-container">
      <div
        className="editor-panel modal-large"
        role="dialog"
        aria-labelledby="config-modal-title"
        aria-modal="true"
      >
        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="editor-header">
            <button
              type="button"
              className="editor-back-btn"
              onClick={onClose}
              aria-label={t("common.close")}
            >
              <ChevronLeftIcon />
            </button>
            <h2 id="config-modal-title">
              {config ? t("configModal.editTitle") : t("configModal.addTitle")}
            </h2>
            <button
              type="submit"
              className="editor-save-btn"
              disabled={
                !watchName?.trim() || !watchApiKey?.trim() || !!jsonError
              }
            >
              {t("configModal.save")}
            </button>
          </div>

          <div className="editor-body">
            <div className="editor-badge-large">
              <span>
                {watchName ? watchName.charAt(0).toUpperCase() : "A"}
              </span>
            </div>

            {/* 基本信息：name + description */}
            <div className="form-row">
              <SchemaFormField
                field={FIELD_GROUPS[0].fields[0]}
                register={register}
                control={control}
                error={errors.name as FieldError | undefined}
              />
              <SchemaFormField
                field={FIELD_GROUPS[0].fields[1]}
                register={register}
                control={control}
                error={errors.description as FieldError | undefined}
              />
            </div>

            {/* websiteUrl */}
            <div className="form-group">
              <label htmlFor="websiteUrl">{t("configModal.websiteUrl")}</label>
              <input
                id="websiteUrl"
                type="url"
                placeholder={t("configModal.websiteUrlPlaceholder")}
                {...register("websiteUrl")}
              />
              {errors.websiteUrl && (
                <span className="field-error">
                  {t(errors.websiteUrl.message ?? "")}
                </span>
              )}
            </div>

            {/* Provider 选择（自定义：含文档链接） */}
            <div className="form-row">
              <div className="form-group full-width">
                <label className="form-label">{t("configModal.provider")}</label>
                <div className="provider-select-row">
                  <select
                    className="form-select"
                    value={watch("providerId")}
                    onChange={(e) => handleProviderChange(e.target.value)}
                  >
                    <option value="">{t("configModal.providerNone")}</option>
                    {(providers ?? []).map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                  {selectedProvider?.docUrl && (
                    <a
                      href={selectedProvider.docUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="provider-doc-link"
                      title={t("providers.viewDocs")}
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                        <polyline points="15 3 21 3 21 9" />
                        <line x1="10" y1="14" x2="21" y2="3" />
                      </svg>
                    </a>
                  )}
                </div>
                <span className="form-hint">{t("configModal.providerHint")}</span>
              </div>
            </div>

            {/* API Key（SchemaFormField password 类型，含 show/hide 切换） */}
            <SchemaFormField
              field={FIELD_GROUPS[0].fields[2]}
              register={register}
              control={control}
              error={errors.apiKey as FieldError | undefined}
            />

            {/* apiUrl（自定义：含警告提示） */}
            <div className="form-group form-group-compact">
              <div className="field-label-wrap">
                <label htmlFor="apiUrl">{t("configModal.apiUrl")}</label>
                <p className="form-hint warning form-hint-inline">
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                  {t("configModal.apiUrlHint")}
                </p>
              </div>
              <input
                id="apiUrl"
                type="url"
                placeholder={t("configModal.apiUrlPlaceholder")}
                {...register("apiUrl")}
              />
              {errors.apiUrl && (
                <span className="field-error">
                  {t(errors.apiUrl.message ?? "")}
                </span>
              )}
            </div>

            {/* 模型配置（自定义：datalist 从 Provider 动态注入） */}
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="model">{t("configModal.model")}</label>
                <input
                  id="model"
                  type="text"
                  list={selectedProvider ? "model-list-main" : undefined}
                  placeholder={t("configModal.modelPlaceholder")}
                  {...register("model")}
                />
                {selectedProvider && (
                  <datalist id="model-list-main">
                    {selectedProvider.models.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </datalist>
                )}
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="haikuModel">{t("configModal.haikuModel")}</label>
                <input
                  id="haikuModel"
                  type="text"
                  list={selectedProvider ? "model-list-haiku" : undefined}
                  placeholder={t("configModal.haikuModelPlaceholder")}
                  {...register("haikuModel")}
                />
                {selectedProvider && (
                  <datalist id="model-list-haiku">
                    {selectedProvider.models
                      .filter(
                        (m) =>
                          m.category === "haiku" || m.category === "other"
                      )
                      .map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                  </datalist>
                )}
              </div>
              <div className="form-group">
                <label htmlFor="sonnetModel">{t("configModal.sonnetModel")}</label>
                <input
                  id="sonnetModel"
                  type="text"
                  list={selectedProvider ? "model-list-sonnet" : undefined}
                  placeholder={t("configModal.sonnetModelPlaceholder")}
                  {...register("sonnetModel")}
                />
                {selectedProvider && (
                  <datalist id="model-list-sonnet">
                    {selectedProvider.models
                      .filter(
                        (m) =>
                          m.category === "sonnet" || m.category === "other"
                      )
                      .map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                  </datalist>
                )}
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="opusModel">{t("configModal.opusModel")}</label>
                <input
                  id="opusModel"
                  type="text"
                  list={selectedProvider ? "model-list-opus" : undefined}
                  placeholder={t("configModal.opusModelPlaceholder")}
                  {...register("opusModel")}
                />
                {selectedProvider && (
                  <datalist id="model-list-opus">
                    {selectedProvider.models
                      .filter(
                        (m) =>
                          m.category === "opus" || m.category === "other"
                      )
                      .map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                  </datalist>
                )}
              </div>
            </div>
            <p className="form-hint">{t("configModal.modelHint")}</p>

            {/* preferredLanguage */}
            <div className="form-group">
              <label htmlFor="preferredLanguage">
                {t("configModal.preferredLanguage")}
              </label>
              <select id="preferredLanguage" {...register("preferredLanguage")}>
                <option value="english">{t("configModal.langEnglish")}</option>
                <option value="chinese">{t("configModal.langChinese")}</option>
                <option value="japanese">{t("configModal.langJapanese")}</option>
                <option value="korean">{t("configModal.langKorean")}</option>
                <option value="spanish">{t("configModal.langSpanish")}</option>
                <option value="french">{t("configModal.langFrench")}</option>
                <option value="german">{t("configModal.langGerman")}</option>
                <option value="portuguese">{t("configModal.langPortuguese")}</option>
                <option value="russian">{t("configModal.langRussian")}</option>
                <option value="arabic">{t("configModal.langArabic")}</option>
                <option value="italian">{t("configModal.langItalian")}</option>
              </select>
            </div>

            {/* enableExtraMarketplaces */}
            <div className="checkbox-group">
              <Controller
                name="enableExtraMarketplaces"
                control={control}
                render={({ field }) => (
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={!!field.value}
                      onChange={(e) => field.onChange(e.target.checked)}
                    />
                    <span className="checkbox-custom" />
                    <span>{t("configModal.enableExtraMarketplaces")}</span>
                  </label>
                )}
              />
              <p className="form-hint">
                {t("configModal.enableExtraMarketplacesDesc")}
              </p>
            </div>

            {/* 已启用插件（Controller + PluginManager） */}
            <CollapsibleSection
              title={t("configModal.enabledPlugins")}
              badge={
                Object.values(watch("enabledPlugins") ?? {}).filter(Boolean)
                  .length
              }
            >
              <Controller
                name="enabledPlugins"
                control={control}
                render={({ field }) => (
                  <PluginManager
                    plugins={field.value ?? {}}
                    onChange={field.onChange}
                  />
                )}
              />
            </CollapsibleSection>

            {/* 高级选项（schema 驱动的 6 个 checkbox 字段） */}
            <CollapsibleSection title={t("configModal.advancedOptions")}>
              {advancedGroup?.fields.map((field) => (
                <SchemaFormField
                  key={field.name}
                  field={field}
                  register={register}
                  control={control}
                  error={
                    errors[
                      field.name as keyof ClaudeConfigFormData
                    ] as FieldError | undefined
                  }
                />
              ))}
            </CollapsibleSection>

            {/* 通用配置 */}
            <DefaultsSection
              useDefaults={watch("useDefaults") ?? false}
              onUseDefaultsChange={(v) => setValue("useDefaults", v)}
              defaults={defaultsContent}
              onDefaultsChange={setDefaultsContent}
            />

            {/* 配置预览 */}
            <CollapsibleSection title={t("configModal.jsonPreview")}>
              <ConfigPreview
                content={previewJson}
                onChange={handlePreviewChange}
                jsonError={jsonError}
              />
            </CollapsibleSection>
          </div>
        </form>
      </div>
    </div>
  );
}

export default ConfigEditor;
```

- [ ] **Step 3: 验证 TypeScript 编译**

```bash
pnpm build
```

Expected: `✓ built in X.XXs`（无 TypeScript 报错）

- [ ] **Step 4: Commit**

```bash
git add src/types.ts src/components/ConfigEditor.tsx
git commit -m "refactor(config): 用 react-hook-form + Zod schema 重构 ConfigEditor，移除 thinkingModel"
```

---

## Task 7: Rust schemars 集成与一致性测试

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/src/config.rs`

- [ ] **Step 1: 在 `src-tauri/Cargo.toml` 的 `[dependencies]` 中添加 schemars**

在现有 dependencies 末尾添加一行：

```toml
schemars = { version = "0.8", features = ["preserve_order"] }
```

- [ ] **Step 2: 验证 Cargo 能下载并编译**

```bash
cd src-tauri
cargo check
```

Expected: `Finished dev profile`（无错误）

- [ ] **Step 3: 在 `src-tauri/src/config.rs` 中为 `ClaudeConfig` 和 `ConfigData` 派生 `JsonSchema`**

在文件顶部的 use 导入中添加：

```rust
use schemars::JsonSchema;
```

将 `ConfigData` 的 derive 改为：

```rust
#[derive(Debug, Deserialize, JsonSchema)]
```

将 `ClaudeConfig` 的 derive 改为：

```rust
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
```

- [ ] **Step 4: 在 `config.rs` 末尾添加一致性测试**

在文件末尾添加（确保位于所有函数定义之后）：

```rust
#[cfg(test)]
mod schema_tests {
    use super::*;
    use schemars::schema_for;

    #[test]
    fn claude_config_required_fields_match_json_schema() {
        // 生成 Rust ClaudeConfig 的 JSON Schema
        let rust_schema = schema_for!(ClaudeConfig);
        let rust_props = rust_schema
            .schema
            .object
            .as_ref()
            .expect("ClaudeConfig 应为 object 类型")
            .properties
            .clone();

        // 加载前端 JSON Schema 文件（相对路径 src-tauri -> src/schemas）
        let json_schema_str = include_str!("../../src/schemas/claude-config.schema.json");
        let json_schema: serde_json::Value =
            serde_json::from_str(json_schema_str).expect("JSON Schema 格式不合法");

        // 验证 JSON Schema 中 required 的字段在 Rust schema 的 properties 中存在
        if let Some(required) = json_schema["required"].as_array() {
            for field_val in required {
                let field_name = field_val.as_str().expect("required 数组元素应为字符串");
                // Rust camelCase 转 snake_case（schemars 默认输出 snake_case）
                // 检查 camelCase 形式（schemars 遵循 serde rename_all = "camelCase"）
                assert!(
                    rust_props.contains_key(field_name),
                    "JSON Schema required 字段 '{}' 在 Rust ClaudeConfig 中未找到。\
                    请确保前后端 schema 保持同步。",
                    field_name
                );
            }
        }
    }

    #[test]
    fn config_data_has_all_json_schema_fields() {
        let rust_schema = schema_for!(ConfigData);
        let rust_props = rust_schema
            .schema
            .object
            .as_ref()
            .expect("ConfigData 应为 object 类型")
            .properties
            .clone();

        let json_schema_str = include_str!("../../src/schemas/claude-config.schema.json");
        let json_schema: serde_json::Value = serde_json::from_str(json_schema_str).unwrap();

        // 验证 JSON Schema properties 中的每个字段（id/isActive/timestamps 除外）在 ConfigData 中存在
        let skip_fields = ["id", "isActive", "createdAt", "updatedAt"];
        if let Some(props) = json_schema["properties"].as_object() {
            for field_name in props.keys() {
                if skip_fields.contains(&field_name.as_str()) {
                    continue;
                }
                assert!(
                    rust_props.contains_key(field_name.as_str()),
                    "JSON Schema 字段 '{}' 在 Rust ConfigData 中未找到。\
                    请检查两端是否同步。",
                    field_name
                );
            }
        }
    }
}
```

- [ ] **Step 5: 运行测试**

```bash
cd src-tauri
cargo test schema_tests
```

Expected:
```
test config::schema_tests::claude_config_required_fields_match_json_schema ... ok
test config::schema_tests::config_data_has_all_json_schema_fields ... ok

test result: ok. 2 passed; 0 failed
```

如果测试失败（字段名不匹配），根据错误信息检查 Rust 结构体的 `#[serde(rename_all = "camelCase")]` 是否影响了 schemars 的输出，必要时在 `schemars` derive 上加 `#[schemars(rename_all = "camelCase")]`。

- [ ] **Step 6: 全量构建验证**

```bash
cd ..  # 回到项目根目录
pnpm build
cargo check --manifest-path src-tauri/Cargo.toml
```

Both expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/src/config.rs
git commit -m "feat(schema): Rust schemars 集成，添加 ClaudeConfig 与 JSON Schema 一致性测试"
```

---

## 验收标准

1. `pnpm build` 无 TypeScript 错误
2. `cargo test schema_tests` 全部通过
3. `pnpm tauri dev` 启动后：
   - ConfigEditor 各字段正常显示，布局与重构前一致
   - 名称为空时保存按钮保持禁用
   - API Key 为空时保存按钮保持禁用
   - apiUrl 输入非 `http://`/`https://` 开头的字符串，失去焦点后显示校验错误
   - Provider 选择、模型 datalist、插件管理、JSON 预览功能不受影响
   - 切换中英文后，校验错误文案随之切换语言
4. `thinkingModel` 字段从 ConfigEditor 表单中消失（如有旧配置包含该字段，加载时会被忽略但不报错）
