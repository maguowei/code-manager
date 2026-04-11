# 前端检测：Lint + 格式化 + Git 钩子 + CI 集成

## 概述

为项目前端（React 19 + TypeScript + Vite）引入完整的代码质量工具链，包括代码检查、格式化、提交前自动检查和 CI 集成。

### 现状

- TypeScript 严格模式已开启（`strict: true`，含 `noUnusedLocals`、`noUnusedParameters`）
- `pnpm build` 执行 `tsc` 类型检查，CI 已覆盖
- **无** ESLint / Prettier / Biome 等 lint 或格式化工具
- **无** Git 钩子
- 前端约 40 个 TS/TSX 文件，~6700 行

### 目标

| 维度 | 目标 |
|------|------|
| 代码检查 | Biome lint：推荐规则 + 自定义规则覆盖 React/TypeScript |
| 格式化 | Biome formatter：统一代码风格 |
| 提交前检查 | lefthook：只检查暂存文件，自动修复 |
| CI | `biome ci`：阻断不合规代码合入 |
| 存量代码 | 一次性全量修复 |

## 技术选型

### Biome（全管 lint + format）

**选择理由**：
- Rust 编写，速度极快（毫秒级处理 ~6700 行）
- 一个工具解决 lint + format，配置最少
- 与项目 Rust 后端技术栈理念一致
- 原生支持 `--staged` 标志

**放弃的方案**：
- ESLint + Prettier：配置复杂，两个工具维护成本高
- Biome + Prettier：格式化用 Prettier 更成熟，但增加依赖
- Biome + dprint：dprint 社区较小

### lefthook（Git 钩子）

**选择理由**：
- 单工具搞定钩子 + staged 文件过滤（不需要 lint-staged）
- Go 编写，单二进制，轻量
- YAML 配置，简洁易读

**放弃的方案**：
- Husky + lint-staged：两个依赖，需要 `.husky/` 目录
- simple-git-hooks + lint-staged：社区较小，功能有限

## 详细设计

### 1. Biome 配置

**文件**：`biome.json`（项目根目录）

```json
{
  "$schema": "https://biomejs.dev/schemas/2.0.0/schema.json",
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

**配置决策**：

| 配置项 | 值 | 理由 |
|--------|-----|------|
| `quoteStyle` | `"double"` | 与项目现有代码一致 |
| `lineWidth` | `100` | 平衡可读性和屏幕利用率 |
| `noUnusedVariables.ignorePattern` | `^_` | 常见的故意忽略模式 |
| `noConsole` | `"warn"` | 提醒但不阻断，开发中可能需要临时使用 |
| `a11y.recommended` | `true` | 桌面应用也应注意可访问性 |

### 2. package.json scripts

新增以下 scripts：

```json
{
  "scripts": {
    "lint": "biome lint .",
    "format": "biome format --write .",
    "check": "biome check --write .",
    "ci": "biome ci .",
    "prepare": "lefthook install"
  }
}
```

| 命令 | 用途 |
|------|------|
| `pnpm lint` | 仅运行 lint 检查（不修复） |
| `pnpm format` | 仅运行格式化 |
| `pnpm check` | lint + format + 自动修复（开发常用） |
| `pnpm ci` | CI 模式：只检查不修改，失败则 exit 非零 |
| `pnpm prepare` | pnpm install 后自动安装 Git hooks |

### 3. lefthook 配置

**文件**：`lefthook.yml`（项目根目录）

```yaml
pre-commit:
  commands:
    biome:
      glob: "*.{js,ts,tsx,json,css}"
      run: pnpm biome check --write {staged_files}
      stage_fixed: true
```

**关键点**：
- `{staged_files}`：lefthook 原生变量，只传入暂存文件
- `stage_fixed: true`：自动修复后将修改重新加入暂存区
- `prepare` script：`pnpm install` 后自动安装 Git hooks

### 4. CI 工作流调整

在 `.github/workflows/ci.yml` 的 `check` job 中，在"前端类型检查与构建"**之前**插入：

```yaml
- name: 前端代码检查 (Biome)
  run: pnpm ci
```

**决策**：
- 使用 `biome ci` 而非 `biome check`：CI 模式只检查不修改
- 放在 `pnpm build` 之前：lint 错误比类型错误更早反馈
- 复用现有 `check` job 的 Node + pnpm 环境，不新增 job

### 5. TypeScript 配置调整

Biome 接管后，`tsconfig.json` 中的部分 lint 选项可以移除（避免重复检查）：

- ~~`noUnusedLocals`~~ → 由 Biome `noUnusedVariables` 覆盖
- ~~`noUnusedParameters`~~ → 由 Biome `noUnusedVariables` 覆盖
- 保留 `noFallthroughCasesInSwitch`（TypeScript 独有）

### 6. 存量代码修复流程

1. **创建修复分支**：确保工作树干净
2. **运行 `pnpm check`**：Biome 自动修复格式化 + 可安全修复的 lint 问题
3. **提交格式化变更**：`style: 应用 Biome 格式化`（单独 commit，便于 git blame）
4. **处理剩余 lint 问题**：`pnpm lint` 查看并逐一修复
5. **提交 lint 修复**：`fix: 修复 Biome lint 检查问题`
6. **验证**：运行 `pnpm build` 确认类型检查通过

**预期风险**：
- 格式化 diff 较大（~6700 行首次格式化）
- 可能的 `noConsole` 警告需要清理或用 `// biome-ignore` 标注
- 可能的 a11y 警告（缺少 `alt` 等属性）

## 新增依赖

| 包 | 类型 | 用途 |
|----|------|------|
| `@biomejs/biome` | devDependency | Lint + Format |
| `lefthook` | devDependency | Git hooks 管理 |

## 涉及文件变更

| 文件 | 操作 |
|------|------|
| `biome.json` | 新建 |
| `lefthook.yml` | 新建 |
| `package.json` | 修改（新增 scripts + devDependencies） |
| `tsconfig.json` | 修改（移除 `noUnusedLocals`/`noUnusedParameters`） |
| `.github/workflows/ci.yml` | 修改（新增 Biome CI 步骤） |
| `src/**/*.{ts,tsx}` | 修改（格式化 + lint 自动修复） |
