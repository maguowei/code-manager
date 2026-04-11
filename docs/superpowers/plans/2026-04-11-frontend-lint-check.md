# 前端 Lint + 格式化 + Git 钩子 + CI 集成 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为前端引入 Biome（lint + format）+ lefthook（Git 钩子）+ CI 集成，并一次性修复存量代码。

**Architecture:** Biome 统一管理代码检查和格式化，lefthook 在 pre-commit 阶段对暂存文件运行 `biome check --write`，CI 通过 `biome ci` 阻断不合规代码。存量代码分两批提交（格式化 + lint 修复）。

**Tech Stack:** Biome (lint + format), lefthook (Git hooks), GitHub Actions (CI)

**Spec:** `docs/superpowers/specs/2026-04-11-frontend-lint-check-design.md`

---

## 文件清单

| 文件 | 操作 | 职责 |
|------|------|------|
| `biome.json` | 新建 | Biome lint + format 配置 |
| `lefthook.yml` | 新建 | Git pre-commit 钩子配置 |
| `package.json` | 修改 | 新增 devDependencies + scripts |
| `tsconfig.json` | 修改 | 移除 Biome 已覆盖的 lint 选项 |
| `.github/workflows/ci.yml` | 修改 | 新增 Biome CI 步骤 |
| `src/**/*.{ts,tsx,css,json}` | 修改 | 存量代码格式化 + lint 自动修复 |

---

### Task 1: 安装依赖

**Files:**
- Modify: `package.json`

- [ ] **Step 1: 安装 Biome 和 lefthook**

```bash
cd /Users/maguowei/Work/AI/ai-manager
pnpm add -D @biomejs/biome lefthook
```

- [ ] **Step 2: 验证安装成功**

```bash
pnpm biome --version
pnpm lefthook version
```

预期：两个命令均输出版本号，无报错。

- [ ] **Step 3: 确认 package.json 更新**

确认 `devDependencies` 中已包含 `@biomejs/biome` 和 `lefthook`。

---

### Task 2: 创建 Biome 配置

**Files:**
- Create: `biome.json`

- [ ] **Step 1: 创建 biome.json**

在项目根目录创建 `biome.json`，内容如下（`$schema` 版本号需与安装的 Biome 版本一致，通过 `pnpm biome --version` 确认后填入）：

```json
{
  "$schema": "https://biomejs.dev/schemas/<安装的版本号>/schema.json",
  "vcs": {
    "enabled": true,
    "clientKind": "git",
    "useIgnoreFile": true,
    "defaultBranch": "main"
  },
  "files": {
    "includes": ["src/**"],
    "ignore": ["**/node_modules/**", "**/dist/**"]
  },
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 100,
    "lineEnding": "lf"
  },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true,
      "correctness": {
        "noUnusedVariables": { "level": "error", "options": { "ignorePattern": "^_" } },
        "noUnusedImports": "error"
      },
      "suspicious": {
        "noDebugger": "error",
        "noConsole": "warn"
      },
      "style": {
        "useConst": "error",
        "noVar": "error"
      },
      "a11y": { "recommended": true }
    }
  },
  "javascript": {
    "formatter": {
      "quoteStyle": "double",
      "semicolons": "always",
      "trailingCommas": "all",
      "arrowParentheses": "always"
    }
  },
  "json": {
    "formatter": { "indentWidth": 2 }
  },
  "css": {
    "formatter": { "enabled": true },
    "linter": { "enabled": true }
  }
}
```

- [ ] **Step 2: 验证配置文件有效**

```bash
pnpm biome check --dry-run .
```

预期：命令执行成功，输出检查结果（此时会有大量格式化和 lint 问题，属正常）。如果配置文件有语法错误会报错。

---

### Task 3: 添加 package.json scripts

**Files:**
- Modify: `package.json`

- [ ] **Step 1: 在 package.json 的 scripts 中新增以下条目**

在现有 `"tauri": "tauri"` 后面添加：

```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "tauri": "tauri",
    "lint": "biome lint .",
    "format": "biome format --write .",
    "check": "biome check --write .",
    "ci": "biome ci .",
    "prepare": "lefthook install"
  }
}
```

- [ ] **Step 2: 验证 scripts 可执行**

```bash
pnpm lint
```

预期：输出 lint 检查结果（此时可能有错误/警告，属正常）。命令本身不报 "script not found"。

- [ ] **Step 3: 安装 lefthook Git hooks**

```bash
pnpm prepare
```

预期：输出类似 `lefthook installed` 的成功信息。

- [ ] **Step 4: 提交基础配置**

```bash
git add biome.json lefthook.yml package.json pnpm-lock.yaml
git commit -m "build: 添加 Biome 和 lefthook 基础配置"
```

注意：`lefthook.yml` 在 Task 4 创建，此处先不提交它。实际执行时在 Task 4 完成后一起提交。

---

### Task 4: 创建 lefthook 配置

**Files:**
- Create: `lefthook.yml`

- [ ] **Step 1: 创建 lefthook.yml**

在项目根目录创建 `lefthook.yml`：

```yaml
pre-commit:
  commands:
    biome:
      glob: "*.{js,ts,tsx,json,css}"
      run: pnpm biome check --write {staged_files}
      stage_fixed: true
```

- [ ] **Step 2: 重新安装 hooks 使配置生效**

```bash
pnpm lefthook install
```

预期：输出安装成功信息。

- [ ] **Step 3: 测试 pre-commit 钩子**

创建一个临时测试文件，验证钩子工作：

```bash
echo 'const   x   =   1;' > /tmp/test-hook.ts
cp /tmp/test-hook.ts src/test-hook.ts
git add src/test-hook.ts
git commit -m "test: 测试 lefthook"
```

预期：lefthook 触发 Biome check，自动格式化 `test-hook.ts`，提交成功。

- [ ] **Step 4: 清理测试文件**

```bash
git rm src/test-hook.ts
git commit -m "chore: 清理 lefthook 测试文件"
```

- [ ] **Step 5: 提交基础配置（Task 3 + Task 4 合并提交）**

如果 Task 3 Step 4 未提交，在此一并提交：

```bash
git add biome.json lefthook.yml package.json pnpm-lock.yaml
git commit -m "build: 添加 Biome lint/format 和 lefthook pre-commit 配置"
```

---

### Task 5: 调整 tsconfig.json

**Files:**
- Modify: `tsconfig.json`

- [ ] **Step 1: 移除 Biome 已覆盖的 lint 选项**

在 `tsconfig.json` 的 `compilerOptions` 中，移除以下两行：

```diff
     /* Linting */
     "strict": true,
-    "noUnusedLocals": true,
-    "noUnusedParameters": true,
     "noFallthroughCasesInSwitch": true
```

保留 `noFallthroughCasesInSwitch`（TypeScript 独有，Biome 不覆盖）。

- [ ] **Step 2: 验证 TypeScript 编译仍然通过**

```bash
pnpm build
```

预期：编译成功，无错误。

- [ ] **Step 3: 提交**

```bash
git add tsconfig.json
git commit -m "build: 移除 tsconfig 中 Biome 已覆盖的 lint 选项"
```

---

### Task 6: 存量代码格式化

**Files:**
- Modify: `src/**/*.{ts,tsx,css,json}`

- [ ] **Step 1: 运行 Biome 格式化**

```bash
pnpm format
```

预期：大量文件被格式化。输出修改的文件列表。

- [ ] **Step 2: 检查格式化结果**

```bash
git diff --stat
```

预期：看到 `src/` 下多个文件的变更统计。浏览几个 diff 确认格式化合理（缩进、引号、分号等）。

- [ ] **Step 3: 验证格式化后类型检查通过**

```bash
pnpm build
```

预期：编译成功。格式化不应破坏类型。

- [ ] **Step 4: 提交格式化变更**

```bash
git add src/
git commit -m "style: 应用 Biome 格式化"
```

单独提交格式化变更，便于 `git blame` 跳过此 commit。

---

### Task 7: 存量代码 lint 修复

**Files:**
- Modify: `src/**/*.{ts,tsx}`

- [ ] **Step 1: 运行 Biome lint 自动修复**

```bash
pnpm biome lint --write .
```

预期：自动修复部分 lint 问题（如 `useConst`、`noUnusedImports` 等）。

- [ ] **Step 2: 查看剩余 lint 问题**

```bash
pnpm lint
```

预期：输出无法自动修复的 lint 错误/警告列表。常见问题：
- `noConsole` 警告：评估是否需要保留，需要保留的加 `// biome-ignore lint/suspicious/noConsole: <原因>`
- `noUnusedVariables` 错误：删除未使用变量或加 `_` 前缀
- a11y 警告：补充缺失的 `alt`、`role` 等属性

- [ ] **Step 3: 手动修复剩余 lint 问题**

逐一修复 Step 2 输出的问题。对于需要保留的 `console` 调用，使用 Biome 忽略注释：

```typescript
// biome-ignore lint/suspicious/noConsole: 必要的调试日志
console.error("...");
```

- [ ] **Step 4: 验证所有检查通过**

```bash
pnpm lint && pnpm build
```

预期：lint 零错误（警告可接受），TypeScript 编译成功。

- [ ] **Step 5: 运行完整 CI 模式检查**

```bash
pnpm ci
```

预期：exit 0，无错误。这与 CI 中执行的命令一致。

- [ ] **Step 6: 提交 lint 修复**

```bash
git add src/
git commit -m "fix: 修复 Biome lint 检查问题"
```

---

### Task 8: CI 工作流集成

**Files:**
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: 在 ci.yml 中添加 Biome 检查步骤**

在 `安装前端依赖` 步骤之后、`前端类型检查与构建` 步骤之前，插入：

```yaml
      - name: 前端代码检查 (Biome)
        run: pnpm ci
```

完整步骤顺序应为：

```yaml
      - name: 安装前端依赖
        run: pnpm install

      - name: 前端代码检查 (Biome)
        run: pnpm ci

      - name: 前端类型检查与构建
        run: pnpm build
```

- [ ] **Step 2: 验证 ci.yml 语法正确**

```bash
cat .github/workflows/ci.yml | python3 -c "import sys,yaml; yaml.safe_load(sys.stdin)" 2>&1 || echo "YAML 语法错误"
```

预期：无输出（语法正确）或提示安装 pyyaml。也可以直接阅读文件确认缩进和结构正确。

- [ ] **Step 3: 提交**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: 添加 Biome 前端代码检查步骤"
```

---

### Task 9: 端到端验证

- [ ] **Step 1: 全量检查**

```bash
pnpm ci && pnpm build
```

预期：两个命令都 exit 0。

- [ ] **Step 2: 验证 lefthook 钩子工作**

修改一个文件引入格式问题，验证提交时被拦截或自动修复：

```bash
# 在某个 .ts 文件末尾加一行格式不佳的代码
echo 'const    unused_test_var    =    1;' >> src/types.ts
git add src/types.ts
git commit -m "test: 验证 lefthook"
```

预期：lefthook 触发 Biome，自动格式化并修复（或因 `noUnusedVariables` 报错阻止提交）。

- [ ] **Step 3: 清理验证痕迹**

```bash
git checkout -- src/types.ts
```

- [ ] **Step 4: 确认工作树干净**

```bash
git status
```

预期：`nothing to commit, working tree clean`。

---

## 提交历史总览

执行完毕后，预期产生以下提交（从旧到新）：

1. `build: 添加 Biome lint/format 和 lefthook pre-commit 配置`
2. `build: 移除 tsconfig 中 Biome 已覆盖的 lint 选项`
3. `style: 应用 Biome 格式化`
4. `fix: 修复 Biome lint 检查问题`
5. `ci: 添加 Biome 前端代码检查步骤`
