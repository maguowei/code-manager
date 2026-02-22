# hasCompletedOnboarding 配置项实现计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在配置管理模块的高级选项中添加 `hasCompletedOnboarding` 配置项，允许用户控制生成的 Claude Code 配置文件中是否包含此选项。

**Architecture:** 扩展现有的 ClaudeConfig 数据结构，在 ConfigModal 高级选项区域添加复选框 UI，在配置生成函数中添加条件输出逻辑。

**Tech Stack:** React 19, TypeScript, Tauri 2.0

---

## Task 1: 更新类型定义

**Files:**
- Modify: `src/types.ts:18` (在高级选项注释后添加新字段)
- Modify: `src/types.ts:88-103` (在 generateClaudeJson 函数中添加条件输出)

**Step 1: 在 ClaudeConfig 接口添加字段**

在 `src/types.ts` 第 18 行（`enableExtraMarketplaces?: boolean;` 之后）添加：

```typescript
  hasCompletedOnboarding?: boolean;
```

完整的高级选项部分应为：
```typescript
  // 高级选项
  alwaysThinkingEnabled?: boolean;
  disableNonessentialTraffic?: boolean;
  skipWebFetchPreflight?: boolean;
  enableExtraMarketplaces?: boolean;
  hasCompletedOnboarding?: boolean;
```

**Step 2: 在 generateClaudeJson 添加条件输出逻辑**

在 `src/types.ts` 第 88 行（`if (config.enableExtraMarketplaces) {` 块之后，`if (config.enabledPlugins...` 之前）添加：

```typescript
  if (config.hasCompletedOnboarding) {
    result.hasCompletedOnboarding = true;
  }
```

**Step 3: 验证 TypeScript 编译**

```bash
cd /Users/maguowei/Work/AI/ai-manager
pnpm build
```

Expected: TypeScript 编译通过，无类型错误

**Step 4: 提交类型定义变更**

```bash
git add src/types.ts
git commit -m "feat(types): 添加 hasCompletedOnboarding 配置项"
```

---

## Task 2: 添加国际化翻译

**Files:**
- Modify: `src/i18n.ts:57` (中文翻译，在 skipWebFetchPreflight 之后)
- Modify: `src/i18n.ts:174` (英文翻译，在 skipWebFetchPreflight 之后)

**Step 1: 添加中文翻译**

在 `src/i18n.ts` 第 57 行（`"configModal.skipWebFetchPreflight"` 之后）添加：

```typescript
    "configModal.hasCompletedOnboarding": "已完成引导设置 (hasCompletedOnboarding)",
    "configModal.hasCompletedOnboardingDesc": "启用后将在生成的配置中设置此选项，跳过 Claude Code 首次启动时的引导流程",
```

**Step 2: 添加英文翻译**

在 `src/i18n.ts` 第 174 行（英文部分的 `"configModal.skipWebFetchPreflight"` 之后）添加：

```typescript
    "configModal.hasCompletedOnboarding": "Has completed onboarding",
    "configModal.hasCompletedOnboardingDesc": "When enabled, this option will be set in the generated config to skip Claude Code's onboarding process on first launch",
```

**Step 3: 验证构建**

```bash
pnpm build
```

Expected: 构建成功，无翻译 key 缺失警告

**Step 4: 提交国际化变更**

```bash
git add src/i18n.ts
git commit -m "feat(i18n): 添加 hasCompletedOnboarding 配置项翻译"
```

---

## Task 3: 更新 ConfigModal 组件

**Files:**
- Modify: `src/components/ConfigModal.tsx:34` (添加 state)
- Modify: `src/components/ConfigModal.tsx:67` (初始化 state)
- Modify: `src/components/ConfigModal.tsx:119` (保存时包含字段)
- Modify: `src/components/ConfigModal.tsx:440` (在高级选项区域第一个位置添加复选框)

**Step 1: 添加 state 变量**

在 `src/components/ConfigModal.tsx` 约第 34 行，在现有高级选项 state 之后添加：

```typescript
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState(false);
```

应该位于这些 state 附近：
```typescript
  const [alwaysThinkingEnabled, setAlwaysThinkingEnabled] = useState(false);
  const [disableNonessentialTraffic, setDisableNonessentialTraffic] = useState(false);
  const [skipWebFetchPreflight, setSkipWebFetchPreflight] = useState(false);
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState(false);
```

**Step 2: 初始化编辑模式的 state**

在 `src/components/ConfigModal.tsx` 约第 67 行，在 `useEffect` 中初始化现有配置数据时添加：

找到这段代码：
```typescript
    setAlwaysThinkingEnabled(config.alwaysThinkingEnabled || false);
    setDisableNonessentialTraffic(config.disableNonessentialTraffic || false);
    setSkipWebFetchPreflight(config.skipWebFetchPreflight || false);
```

在其后添加：
```typescript
    setHasCompletedOnboarding(config.hasCompletedOnboarding || false);
```

**Step 3: 保存配置时包含新字段**

在 `src/components/ConfigModal.tsx` 约第 119 行，`handleSubmit` 函数中构造 `configData` 对象时添加：

找到这段代码：
```typescript
      alwaysThinkingEnabled,
      disableNonessentialTraffic,
      skipWebFetchPreflight,
      enableExtraMarketplaces,
```

在 `enableExtraMarketplaces` 之后添加：
```typescript
      hasCompletedOnboarding,
```

**Step 4: 在高级选项区域添加复选框 UI**

在 `src/components/ConfigModal.tsx` 约第 440 行，`{showAdvanced && (` 块内的第一个位置添加：

```typescript
                <div className="checkbox-group">
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={hasCompletedOnboarding}
                      onChange={(e) => setHasCompletedOnboarding(e.target.checked)}
                    />
                    <span className="checkbox-custom"></span>
                    <span>{t("configModal.hasCompletedOnboarding")}</span>
                  </label>
                  <p className="form-hint">{t("configModal.hasCompletedOnboardingDesc")}</p>
                </div>
```

这应该是高级选项区域的第一个复选框，位于原有的 `alwaysThinkingEnabled` 复选框之前。

**Step 5: 验证前端构建**

```bash
pnpm build
```

Expected: 构建成功，无 TypeScript 错误

**Step 6: 提交 ConfigModal 变更**

```bash
git add src/components/ConfigModal.tsx
git commit -m "feat(config): 在高级选项中添加 hasCompletedOnboarding 配置 UI"
```

---

## Task 4: 手动验证功能

**Step 1: 启动开发服务器**

```bash
pnpm tauri dev
```

Expected: 应用启动成功

**Step 2: 测试添加配置**

1. 点击"添加配置"按钮
2. 填写基本信息（名称、API Key）
3. 展开"高级选项"
4. 验证"已完成引导设置"复选框显示在第一个位置
5. 勾选该复选框
6. 验证下方显示说明文字
7. 保存配置

**Step 3: 验证配置生成**

1. 激活刚创建的配置
2. 检查生成的 `~/.claude.json` 文件：

```bash
cat ~/.claude.json
```

Expected: JSON 中包含 `"hasCompletedOnboarding": true`

**Step 4: 测试取消勾选**

1. 编辑同一配置
2. 取消勾选"已完成引导设置"
3. 保存并重新激活
4. 再次检查 `~/.claude.json`

Expected: JSON 中不包含 `hasCompletedOnboarding` 字段

**Step 5: 测试中英文切换**

1. 切换到英文界面
2. 打开配置编辑弹窗
3. 验证翻译显示为 "Has completed onboarding"
4. 验证说明文字显示为英文

**Step 6: 记录验证结果**

创建验证日志：

```bash
echo "功能验证完成 - $(date)" >> docs/plans/verification-log.txt
echo "- 复选框位置正确（高级选项第一项）" >> docs/plans/verification-log.txt
echo "- 勾选时生成 hasCompletedOnboarding: true" >> docs/plans/verification-log.txt
echo "- 未勾选时省略该字段" >> docs/plans/verification-log.txt
echo "- 中英文翻译正常" >> docs/plans/verification-log.txt
```

---

## Task 5: 最终提交

**Step 1: 检查所有变更**

```bash
git status
git log --oneline -5
```

Expected: 看到 3 个相关提交

**Step 2: 创建功能完成标记提交**

如果需要，可以创建一个聚合提交：

```bash
git add docs/plans/verification-log.txt
git commit -m "test: 验证 hasCompletedOnboarding 配置功能"
```

**Step 3: 推送到远程（可选）**

```bash
git push origin dev
```

---

## 验收标准

- [ ] `ClaudeConfig` 接口包含 `hasCompletedOnboarding?: boolean`
- [ ] `generateClaudeJson` 仅在值为 `true` 时输出该字段
- [ ] ConfigModal 高级选项区域第一个位置显示该复选框
- [ ] 复选框带有说明文字
- [ ] 中英文翻译完整
- [ ] 勾选时生成的 `.claude.json` 包含 `"hasCompletedOnboarding": true`
- [ ] 未勾选时生成的 `.claude.json` 不包含该字段
- [ ] TypeScript 编译通过
- [ ] 前端构建成功

## 注意事项

1. **复选框位置**: 确保放在高级选项区域的第一个位置，在 `alwaysThinkingEnabled` 之前
2. **条件输出**: 只在值为 `true` 时输出，不输出 `false` 值
3. **说明文字**: 必须包含 `form-hint` 样式的说明段落
4. **配置持久化**: 现有的配置保存/加载逻辑已支持新增字段，无需特殊处理
