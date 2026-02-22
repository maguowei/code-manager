# 添加 hasCompletedOnboarding 配置项设计

**日期**: 2026-02-22
**状态**: 已批准

## 概述

在配置管理模块的高级选项中添加 `hasCompletedOnboarding` 配置项，允许用户控制生成的 Claude Code 配置文件中是否包含此选项，从而跳过 Claude Code CLI 首次启动时的引导流程。

## 背景

`hasCompletedOnboarding` 是 Claude Code 全局配置项（位于 `~/.claude.json`），用于跳过 Claude Code CLI 的首次启动引导流程。根据 GitHub Issue #4714，Claude Code 会忽略环境设置如果 `.claude.json` 文件不存在或 `hasCompletedOnboarding` 未设置为 `true`。

- 设置为 `true`：跳过 onboarding 过程
- 未设置或 `false`：显示新手引导

## 目标

1. 在配置弹窗的高级选项区域添加 `hasCompletedOnboarding` 复选框
2. 用户勾选后，生成的 `.claude.json` 中包含 `"hasCompletedOnboarding": true`
3. 用户未勾选时，生成的 `.claude.json` 中完全省略该字段

## 设计

### 数据结构

**ClaudeConfig 接口变更** (`src/types.ts`)：

```typescript
export interface ClaudeConfig {
  // ... 现有字段
  // 高级选项
  alwaysThinkingEnabled?: boolean;
  disableNonessentialTraffic?: boolean;
  skipWebFetchPreflight?: boolean;
  hasCompletedOnboarding?: boolean; // 新增
  // ...
}
```

### 配置生成逻辑

**generateClaudeJson 函数变更** (`src/types.ts`)：

仅当 `hasCompletedOnboarding === true` 时输出该字段：

```typescript
if (config.hasCompletedOnboarding) {
  result.hasCompletedOnboarding = true;
}
```

### UI 组件

**ConfigModal 组件变更** (`src/components/ConfigModal.tsx`)：

1. **State 添加**：
   ```typescript
   const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState(false);
   ```

2. **高级选项区域新增复选框**（位于第 1 个位置）：
   ```tsx
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

3. **高级选项区域复选框顺序**：
   - **Has Completed Onboarding** ← 新增
   - Always Thinking
   - Disable Non-essential Traffic
   - Skip WebFetch Preflight

### 国际化

**中文翻译** (`src/i18n.ts`)：

```typescript
"configModal.hasCompletedOnboarding": "已完成引导设置 (hasCompletedOnboarding)",
"configModal.hasCompletedOnboardingDesc": "启用后将在生成的配置中设置此选项，跳过 Claude Code 首次启动时的引导流程"
```

**英文翻译** (`src/i18n.ts`)：

```typescript
"configModal.hasCompletedOnboarding": "Has completed onboarding",
"configModal.hasCompletedOnboardingDesc": "When enabled, this option will be set in the generated config to skip Claude Code's onboarding process on first launch"
```

## 数据流

```
用户打开配置弹窗
  ↓
展开"高级选项"区域
  ↓
勾选/取消勾选 "hasCompletedOnboarding" 复选框
  ↓
保存配置 → 持久化到 ~/.config/ai-manager/config.json
  ↓
激活配置 → 生成 ~/.claude.json（仅在勾选时包含此字段）
```

## 实现范围

### 需要修改的文件

1. **src/types.ts**
   - `ClaudeConfig` 接口添加 `hasCompletedOnboarding?: boolean`
   - `generateClaudeJson()` 函数添加条件输出逻辑

2. **src/components/ConfigModal.tsx**
   - 添加 `hasCompletedOnboarding` state
   - 在高级选项区域第一个位置添加复选框及说明
   - 保存/加载逻辑中处理该字段

3. **src/i18n.ts**
   - 添加中英文翻译 key

### 不需要修改的文件

- 后端 Rust 代码（Tauri 命令层面无需变更，配置持久化逻辑已支持）
- 样式文件（复用现有 checkbox 样式）

## 测试验证

1. 添加新配置，勾选 "已完成引导设置"，保存并激活
2. 检查生成的 `~/.claude.json` 包含 `"hasCompletedOnboarding": true`
3. 编辑配置，取消勾选，重新激活
4. 检查生成的 `~/.claude.json` 不包含 `hasCompletedOnboarding` 字段
5. 验证中英文翻译正确显示

## 参考资料

- [GitHub Issue #4714: Onboarding Process Ignores Environment Settings](https://github.com/anthropics/claude-code/issues/4714)
- [fix-onboarding skill](https://playbooks.com/skills/phrazzld/claude-config/fix-onboarding)
- [Claude Code Configuration Guide](https://claudelog.com/configuration/)
