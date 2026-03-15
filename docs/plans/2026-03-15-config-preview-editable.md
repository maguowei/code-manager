# ConfigPreview 双向同步可编辑 实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将配置预览区域从只读改为可编辑，实现表单字段与 JSON 预览的双向同步，并支持保留用户手动添加的额外字段。

**Architecture:** ConfigPreview 组件改为可编辑 CodeMirror。用户编辑 JSON 时，前端解析 JSON 将已知字段反写回表单 state，未知字段存入 `extraFields`。表单变更时，后端 `preview_config` 生成 JSON 后前端合并 `extraFields`。保存时 `extraFields` 通过后端存储并写入 `settings.json`。

**Tech Stack:** React 19, TypeScript, CodeMirror (@uiw/react-codemirror), Rust/Tauri 2.0, serde_json

---

## 重要：字段映射关系（基于 build_config_value 实际代码）

preview JSON 中的字段与表单字段的映射关系：

| preview JSON 路径 | 表单 state | 类型转换 |
|---|---|---|
| `env.ANTHROPIC_AUTH_TOKEN` | `apiKey` | 直接 string |
| `env.ANTHROPIC_BASE_URL` | `apiUrl` | 直接 string |
| `env.ANTHROPIC_MODEL` | `model` | 直接 string |
| `env.ANTHROPIC_DEFAULT_HAIKU_MODEL` | `haikuModel` | 直接 string |
| `env.ANTHROPIC_DEFAULT_SONNET_MODEL` | `sonnetModel` | 直接 string |
| `env.ANTHROPIC_DEFAULT_OPUS_MODEL` | `opusModel` | 直接 string |
| `env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` | `disableNonessentialTraffic` | `"1"` → true |
| `env.ENABLE_LSP_TOOL` | `enableLspTool` | `"1"` → true |
| `env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` | `enableAgentTeams` | `"1"` → true |
| `language` | `preferredLanguage` | 缺失 → `"english"` |
| `alwaysThinkingEnabled` | `alwaysThinkingEnabled` | boolean |
| `skipWebFetchPreflight` | `skipWebFetchPreflight` | boolean |
| `hasCompletedOnboarding` | `hasCompletedOnboarding` | boolean |
| `extraKnownMarketplaces` | `enableExtraMarketplaces` | 有值 → true |
| `enabledPlugins` | `enabledPlugins` | `Record<string, boolean>` |

**不出现在 preview JSON 中的表单字段**（仅存储在 configs.json）：`name`, `description`, `websiteUrl`, `thinkingModel`, `useDefaults`

---

### Task 1: 后端 — ConfigData 和 ClaudeConfig 增加 extra_fields

**Files:**
- Modify: `src-tauri/src/config.rs:11-31` (ConfigData)
- Modify: `src-tauri/src/config.rs:101-151` (ClaudeConfig)
- Modify: `src-tauri/src/config.rs:34-98` (ConfigData impl)

**Step 1: 给 ConfigData 增加 extra_fields 字段**

在 `ConfigData` 结构体末尾添加：

```rust
pub extra_fields: Option<HashMap<String, serde_json::Value>>,
```

**Step 2: 给 ClaudeConfig 增加 extra_fields 字段**

在 `ClaudeConfig` 结构体的 `enabled_plugins` 字段后添加：

```rust
#[serde(skip_serializing_if = "Option::is_none")]
pub extra_fields: Option<HashMap<String, serde_json::Value>>,
```

**Step 3: 更新 ConfigData 的 impl 方法**

在 `into_preview_config` 中添加 `extra_fields: self.extra_fields,`

在 `apply_to` 中添加 `config.extra_fields = self.extra_fields;`

**Step 4: 编译验证**

Run: `cd src-tauri && cargo check`
Expected: 编译成功

**Step 5: 提交**

```bash
git add src-tauri/src/config.rs
git commit -m "feat: ConfigData 和 ClaudeConfig 增加 extra_fields 字段"
```

---

### Task 2: 后端 — build_config_value 合并 extra_fields

**Files:**
- Modify: `src-tauri/src/config.rs:208-340` (build_config_value)

**Step 1: 在 build_config_value 末尾（深度合并 defaults 之后）合并 extra_fields**

在 `build_config_value` 函数中，在深度合并 defaults 的逻辑之后，返回之前，添加 extra_fields 合并逻辑：

```rust
// 合并额外字段（用户在 JSON 编辑器中手动添加的字段）
let mut result = if config.use_defaults == Some(true) {
    // ... 现有的 defaults 合并逻辑 ...
} else {
    serde_json::Value::Object(claude_config)
};

if let Some(ref extra) = config.extra_fields {
    if let serde_json::Value::Object(ref mut map) = result {
        for (k, v) in extra {
            // 不覆盖已知字段
            if !map.contains_key(k) {
                map.insert(k.clone(), v.clone());
            }
        }
    }
}

result
```

注意：需要重构现有的返回逻辑，将 `return deep_merge(...)` 改为赋值给变量。

**Step 2: 编译验证**

Run: `cd src-tauri && cargo check`
Expected: 编译成功

**Step 3: 提交**

```bash
git add src-tauri/src/config.rs
git commit -m "feat: build_config_value 支持合并 extra_fields"
```

---

### Task 3: 前端类型 — ClaudeConfig 增加 extraFields

**Files:**
- Modify: `src/types.ts:7-38` (ClaudeConfig)

**Step 1: 在 ClaudeConfig 接口中添加 extraFields**

在 `enabledPlugins` 字段后添加：

```typescript
// 额外字段（用户在 JSON 编辑器中手动添加的）
extraFields?: Record<string, unknown>;
```

**Step 2: 提交**

```bash
git add src/types.ts
git commit -m "feat: ClaudeConfig 类型增加 extraFields"
```

---

### Task 4: 前端 — buildConfigData 传递 extraFields

**Files:**
- Modify: `src/App.tsx:23-47` (buildConfigData)

**Step 1: 在 buildConfigData 返回对象末尾添加 extraFields**

在 `enabledPlugins` 字段后添加：

```typescript
extraFields: config.extraFields && Object.keys(config.extraFields).length > 0 ? config.extraFields : null,
```

**Step 2: 提交**

```bash
git add src/App.tsx
git commit -m "feat: buildConfigData 传递 extraFields 到后端"
```

---

### Task 5: 前端 — ConfigPreview 改为可编辑

**Files:**
- Modify: `src/components/ConfigPreview.tsx`

**Step 1: 更新 ConfigPreviewProps 接口**

```typescript
interface ConfigPreviewProps {
  /** 要展示的 JSON 字符串 */
  content: string;
  /** 用户编辑 JSON 时的回调 */
  onChange?: (value: string) => void;
  /** JSON 语法错误信息 */
  jsonError?: string;
}
```

**Step 2: 将 CodeMirror 改为可编辑**

- `editable` 改为 `!!(onChange)`（有 onChange 时可编辑，无则只读，保持向后兼容）
- 添加 `onChange` 回调给 CodeMirror
- 在编辑器下方添加错误提示条

```tsx
function ConfigPreview({ content, onChange, jsonError }: ConfigPreviewProps) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const editorTheme = useEditorTheme();

  function handleCopy() {
    navigator.clipboard.writeText(content)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {});
  }

  return (
    <div className={`json-preview ${jsonError ? "error" : ""}`}>
      <div className="json-preview-header">
        <button
          type="button"
          className={`json-copy-btn ${copied ? "copied" : ""}`}
          onClick={handleCopy}
        >
          {/* ... 保持不变 ... */}
        </button>
      </div>
      <CodeMirror
        value={content}
        extensions={[json()]}
        theme={editorTheme}
        editable={!!onChange}
        onChange={onChange}
        basicSetup={{
          lineNumbers: true,
          foldGutter: false,
        }}
      />
      {jsonError && (
        <p className="json-preview-error">{jsonError}</p>
      )}
    </div>
  );
}
```

**Step 3: 添加错误提示 CSS**

在 `src/components/ConfigEditor.css` 末尾添加：

```css
/* JSON 预览编辑器错误状态 */
.json-preview.error {
  border-color: var(--accent-red);
  box-shadow: 0 0 0 2px rgba(239, 68, 68, 0.2);
}

.json-preview-error {
  font-size: 12px;
  color: var(--accent-red);
  padding: 6px 12px;
  margin: 0;
  border-top: 1px solid var(--border-color);
  background-color: rgba(239, 68, 68, 0.05);
}
```

**Step 4: 验证前端编译**

Run: `pnpm build`
Expected: 编译成功（此时 ConfigEditor 还未传 onChange，ConfigPreview 仍为只读状态）

**Step 5: 提交**

```bash
git add src/components/ConfigPreview.tsx src/components/ConfigEditor.css
git commit -m "feat: ConfigPreview 支持可编辑模式和错误提示"
```

---

### Task 6: 前端 — ConfigEditor 增加双向同步逻辑

**Files:**
- Modify: `src/components/ConfigEditor.tsx`

这是核心任务，代码量最大。分步实现。

**Step 1: 添加新的 state 和 ref**

在现有 state 声明区域添加：

```typescript
// 额外字段：用户在 JSON 中手动添加的表单不支持的字段
const [extraFields, setExtraFields] = useState<Record<string, unknown>>(config?.extraFields || {});
// JSON 语法错误信息
const [jsonError, setJsonError] = useState("");
// 用户是否正在编辑预览区
const isEditingPreview = useRef(false);
// 防抖定时器，用于检测用户停止编辑预览
const editingTimer = useRef<ReturnType<typeof setTimeout>>();
```

需要在文件顶部从 react 导入 `useRef`。

**Step 2: 添加 parseJsonToForm 函数**

在 `handleSubmit` 之前添加解析函数。该函数将 preview JSON 解析后，提取已知字段更新表单 state，剩余字段存入 extraFields：

```typescript
/** 从预览 JSON 中提取已知字段同步回表单，剩余字段存入 extraFields */
function parseJsonToForm(jsonStr: string) {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(jsonStr);
    setJsonError("");
  } catch (e) {
    setJsonError(e instanceof Error ? e.message : "JSON 格式错误");
    return;
  }

  // 深拷贝，用于逐步移除已识别的字段，剩余的就是 extraFields
  const remaining = JSON.parse(JSON.stringify(parsed)) as Record<string, unknown>;

  // 提取 env 子对象
  const env = (parsed.env ?? {}) as Record<string, string>;

  // 字符串字段：env 内
  if (env.ANTHROPIC_AUTH_TOKEN !== undefined) setApiKey(env.ANTHROPIC_AUTH_TOKEN);
  if (env.ANTHROPIC_BASE_URL !== undefined) setApiUrl(env.ANTHROPIC_BASE_URL);
  if (env.ANTHROPIC_MODEL !== undefined) setModel(env.ANTHROPIC_MODEL);
  if (env.ANTHROPIC_DEFAULT_HAIKU_MODEL !== undefined) setHaikuModel(env.ANTHROPIC_DEFAULT_HAIKU_MODEL);
  if (env.ANTHROPIC_DEFAULT_SONNET_MODEL !== undefined) setSonnetModel(env.ANTHROPIC_DEFAULT_SONNET_MODEL);
  if (env.ANTHROPIC_DEFAULT_OPUS_MODEL !== undefined) setOpusModel(env.ANTHROPIC_DEFAULT_OPUS_MODEL);

  // 布尔字段（env 内以 "1" 表示 true）
  setDisableNonessentialTraffic(!!env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC);
  setEnableLspTool(!!env.ENABLE_LSP_TOOL);
  setEnableAgentTeams(!!env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS);

  // 清理 env 中的已知 key，保留未知 key
  const knownEnvKeys = [
    "ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_BASE_URL", "ANTHROPIC_MODEL",
    "ANTHROPIC_DEFAULT_HAIKU_MODEL", "ANTHROPIC_DEFAULT_SONNET_MODEL", "ANTHROPIC_DEFAULT_OPUS_MODEL",
    "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC", "ENABLE_LSP_TOOL", "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS",
  ];
  if (remaining.env && typeof remaining.env === "object") {
    const remainingEnv = remaining.env as Record<string, unknown>;
    for (const k of knownEnvKeys) delete remainingEnv[k];
    if (Object.keys(remainingEnv).length === 0) delete remaining.env;
  }

  // 顶层字段
  if (typeof parsed.language === "string") {
    setPreferredLanguage(parsed.language);
  } else if (!("language" in parsed)) {
    setPreferredLanguage("english");
  }
  delete remaining.language;

  if (typeof parsed.alwaysThinkingEnabled === "boolean") setAlwaysThinkingEnabled(parsed.alwaysThinkingEnabled);
  delete remaining.alwaysThinkingEnabled;

  if (typeof parsed.skipWebFetchPreflight === "boolean") setSkipWebFetchPreflight(parsed.skipWebFetchPreflight);
  delete remaining.skipWebFetchPreflight;

  if (typeof parsed.hasCompletedOnboarding === "boolean") setHasCompletedOnboarding(parsed.hasCompletedOnboarding);
  delete remaining.hasCompletedOnboarding;

  setEnableExtraMarketplaces("extraKnownMarketplaces" in parsed);
  delete remaining.extraKnownMarketplaces;

  if (parsed.enabledPlugins && typeof parsed.enabledPlugins === "object") {
    setEnabledPlugins(parsed.enabledPlugins as Record<string, boolean>);
  }
  delete remaining.enabledPlugins;

  // 剩余字段存入 extraFields
  setExtraFields(remaining);
}
```

**Step 3: 添加 handlePreviewChange 函数**

```typescript
/** 用户编辑预览 JSON 时的回调 */
function handlePreviewChange(value: string) {
  // 标记用户正在编辑预览
  isEditingPreview.current = true;
  if (editingTimer.current) clearTimeout(editingTimer.current);
  editingTimer.current = setTimeout(() => {
    isEditingPreview.current = false;
  }, 1000);

  // 直接更新预览文本（受控）
  setPreviewJson(value);

  // 尝试解析并反写表单
  parseJsonToForm(value);
}
```

**Step 4: 修改预览生成 useEffect**

修改现有的 `previewJson` useEffect，在两处进行调整：

1. 将 `extraFields` 加入依赖数组
2. 当 `isEditingPreview.current` 为 true 时，不更新 `previewJson`
3. 将 `preview_config` 的结果与 `extraFields` 合并后再设置

```typescript
useEffect(() => {
  if (!apiKey) {
    setPreviewJson("{}");
    return;
  }
  // 用户正在编辑预览时，不覆盖预览区内容
  if (isEditingPreview.current) return;

  let cancelled = false;
  const timer = setTimeout(() => {
    const data = {
      name,
      description,
      apiKey,
      apiUrl: apiUrl || null,
      websiteUrl: websiteUrl || null,
      model: model || null,
      thinkingModel: thinkingModel || null,
      haikuModel: haikuModel || null,
      sonnetModel: sonnetModel || null,
      opusModel: opusModel || null,
      alwaysThinkingEnabled: alwaysThinkingEnabled ?? null,
      disableNonessentialTraffic: disableNonessentialTraffic ?? null,
      skipWebFetchPreflight: skipWebFetchPreflight ?? null,
      enableLspTool: enableLspTool ?? null,
      agentTeamsEnabled: enableAgentTeams ?? null,
      hasCompletedOnboarding: hasCompletedOnboarding ?? null,
      enableExtraMarketplaces: enableExtraMarketplaces ?? null,
      preferredLanguage: preferredLanguage || null,
      useDefaults: useDefaults ?? null,
      enabledPlugins: Object.keys(enabledPlugins).length > 0 ? enabledPlugins : null,
      extraFields: Object.keys(extraFields).length > 0 ? extraFields : null,
    };
    const previewDefaults = useDefaults && defaultsContent.trim() ? defaultsContent.trim() : null;
    invoke<string>("preview_config", { data, defaults: previewDefaults })
      .then((result) => {
        if (!cancelled) {
          setPreviewJson(result);
          setJsonError("");
        }
      })
      .catch(() => { if (!cancelled) setPreviewJson("{}"); });
  }, 300);
  return () => { cancelled = true; clearTimeout(timer); };
}, [apiKey, name, description, apiUrl, websiteUrl, model, thinkingModel, haikuModel, sonnetModel, opusModel, alwaysThinkingEnabled, disableNonessentialTraffic, skipWebFetchPreflight, enableLspTool, enableAgentTeams, hasCompletedOnboarding, enableExtraMarketplaces, preferredLanguage, useDefaults, enabledPlugins, defaultsContent, extraFields]);
```

**Step 5: 修改 handleSubmit 和 onSave 调用**

在 `handleSubmit` 中，`onSave` 调用时传递 `extraFields`：

```typescript
onSave({
  // ... 所有现有字段 ...
  extraFields: Object.keys(extraFields).length > 0 ? extraFields : undefined,
}, defaultsContent);
```

同时增加 JSON 格式错误检查——当 `jsonError` 非空时禁止保存。

**Step 6: 修改 ConfigPreview 调用**

将 `<ConfigPreview content={previewJson} />` 改为：

```tsx
<ConfigPreview
  content={previewJson}
  onChange={handlePreviewChange}
  jsonError={jsonError}
/>
```

**Step 7: 修改保存按钮 disabled 条件**

```tsx
disabled={!name.trim() || !apiKey.trim() || !!jsonError}
```

**Step 8: 验证前端编译**

Run: `pnpm build`
Expected: 编译成功

**Step 9: 提交**

```bash
git add src/components/ConfigEditor.tsx
git commit -m "feat: ConfigEditor 实现表单与 JSON 预览的双向同步"
```

---

### Task 7: 前端 — ConfigEditorProps 更新以传递 extraFields

**Files:**
- Modify: `src/components/ConfigEditor.tsx:12-17` (ConfigEditorProps)
- Modify: `src/App.tsx:128-154` (handleSave)

**Step 1: 更新 onSave 签名**

ConfigEditorProps 中 `onSave` 的类型参数需要包含 `extraFields`。由于 `extraFields` 已经在 `ClaudeConfig` 的 `Omit` 类型中，应该自动包含。验证 `Omit<ClaudeConfig, "id" | "createdAt" | "updatedAt" | "isActive">` 是否包含 `extraFields`。

如果 Task 3 已正确添加 `extraFields` 到 `ClaudeConfig` 类型，这里无需修改接口。

**Step 2: 验证 App.tsx handleSave 是否自动传递 extraFields**

`buildConfigData` 在 Task 4 已经添加了 `extraFields` 传递。验证整个保存链路畅通。

**Step 3: 前端完整编译验证**

Run: `pnpm build`
Expected: 编译成功

**Step 4: 提交（如有变更）**

```bash
git add src/components/ConfigEditor.tsx src/App.tsx
git commit -m "feat: 完善 extraFields 保存链路"
```

---

### Task 8: 集成验证

**Step 1: 启动应用**

Run: `pnpm tauri dev`

**Step 2: 手动测试 — 表单→预览同步**

1. 打开一个配置的编辑面板
2. 修改 model 输入框的值
3. 展开"配置预览"区域
4. 验证预览 JSON 中的 `env.ANTHROPIC_MODEL` 已更新

**Step 3: 手动测试 — 预览→表单同步**

1. 在预览 JSON 编辑器中修改 `env.ANTHROPIC_MODEL` 的值
2. 验证表单中 model 输入框已同步更新

**Step 4: 手动测试 — 额外字段保留**

1. 在预览 JSON 中手动添加一个自定义字段，如 `"customSetting": true`
2. 修改表单中的某个字段（如 model）
3. 验证预览 JSON 中 `customSetting` 仍然存在
4. 保存配置
5. 重新打开编辑面板，展开预览，验证 `customSetting` 仍在

**Step 5: 手动测试 — JSON 错误处理**

1. 在预览编辑器中输入非法 JSON（如删掉一个引号）
2. 验证编辑器下方出现红色错误提示
3. 验证保存按钮变为禁用状态
4. 修复 JSON 格式后，验证错误提示消失、保存按钮恢复

**Step 6: 手动测试 — 编辑冲突**

1. 在预览编辑器中编辑某个值
2. 快速切换到表单修改同一字段
3. 验证表单变更后预览区正确更新（表单优先）

**Step 7: 提交最终状态**

如果发现 bug，修复后提交：

```bash
git add -A
git commit -m "fix: 修复双向同步集成测试中的问题"
```
