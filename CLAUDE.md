# CLAUDE.md

本文件面向在本仓库中工作的编程智能体，例如 Claude Code、Codex 以及读取 `AGENTS.md` / `CLAUDE.md` 的同类代理。

它是仓库执行手册，不是产品介绍页。产品定位、安装方式和面向人类的阅读入口在 `README.md`。

## 项目定位与快速事实

- 项目：AI Manager，基于 Tauri 2 的 Claude Code 配置管理桌面应用
- 前端：React 19 + TypeScript + Vite
- 后端：Rust + Tauri commands
- 包管理器：`pnpm`
- 应用标识符：`com.gotobeta.app.ai-manager`
- `AGENTS.md` 是指向本文件的软链接，不单独维护

### 关键数据目录

- 应用数据：`~/.config/ai-manager/`
  - `configs.json`
  - `memories.json`
  - `providers.json`
  - `skills-disabled/`
- 应用直接操作的用户目录：`~/.claude/`
  - `settings.json`
  - `CLAUDE.md`
  - `skills/`
- 历史与统计输入：
  - `~/.claude/history.jsonl`
  - `~/.claude.json`

## Agent 工作约束

### 通用原则

- 只做必要改动，优先最小影响面。
- 先找根因，再改代码；不要用临时绕过方案。
- 沿用现有模式，不为了“顺手优化”做无关重构。
- 工作区可能是脏的，不要回退你没创建的改动。

### 工具与代码风格

- 使用 `pnpm`，不要改用 `npm`。
- 代码注释使用中文。
- Rust 新增文件读写、锁和时间工具时，优先复用 `src-tauri/src/utils.rs`，不要重复实现。
- 所有前端通知优先走 `useToast()`，不要把 `console.error` 当作用户反馈。
- 新增有层叠关系的样式时，复用 `src/styles/shared.css` 中的 z-index 变量，不要硬编码。

### 修改前先看哪里

- 应用壳与页面编排：`src/App.tsx`
- React 入口与全局 Provider：`src/main.tsx`
- 共享 schema：`src/schemas/`
- 公共 hooks：`src/hooks/`
- 公共样式与 z-index 令牌：`src/styles/shared.css`
- Tauri 命令注册：`src-tauri/src/lib.rs`
- Rust 公共工具：`src-tauri/src/utils.rs`

### 完成前验证

- 文档改动至少执行：`git diff --check`
- 前端逻辑改动优先执行：
  - `pnpm biome:ci`
  - `pnpm build`
- Rust 逻辑改动优先执行：
  - `cd src-tauri && cargo test`
  - `cd src-tauri && cargo clippy -- -D warnings`
- 涉及前后端契约时，至少覆盖 `pnpm build` 与 `cargo test`
- 没有新鲜验证证据，不要声称“已完成”或“已通过”

## 高频任务入口

### 1. 改配置编辑器或配置持久化

先读：

- `src/components/ConfigEditor.tsx`
- `src/components/config-editor-defaults.ts`
- `src/schemas/claude-config.schema.json`
- `src/schemas/config-schema.ts`
- `src/schemas/field-groups.ts`
- `src-tauri/src/config.rs`
- `src/types.ts`

注意：

- 配置表单是 schema 驱动，不要只改前端字段渲染而漏掉 schema 或 Rust DTO。
- `preview_config` 与实际写入共用后端逻辑，配置预览的权威实现不在前端。
- 新增配置字段时，通常至少要同步：
  - Rust `ClaudeConfig` / DTO
  - `src/schemas/claude-config.schema.json`
  - `src/schemas/config-schema.ts`
  - `src/schemas/field-groups.ts` 或表单渲染入口
  - `src/types.ts`

### 2. 改记忆、Skills、Provider、历史记录

先读：

- 记忆：`src/components/MemoryPage.tsx`、`src-tauri/src/memory.rs`
- Skills：`src/components/SkillsPage.tsx`、`src/components/SkillEditor.tsx`、`src-tauri/src/skills.rs`
- Provider：`src/components/ProviderPage.tsx`、`src-tauri/src/provider.rs`
- 历史：`src/components/HistoryPage.tsx`、`src/components/SessionDetailDrawer.tsx`、`src-tauri/src/history.rs`

注意：

- Skills 的启用与禁用跨两个目录移动，不要绕开现有目录约定。
- 内置 Provider 来自 `src-tauri/resources/builtin-providers.json`，不是运行时写回的数据文件。
- 历史页的数据来源是 `~/.claude/history.jsonl`，轮询逻辑已封装在 `useHistoryEntries.ts`。

### 3. 改项目管理页

先读：

- `src/components/ProjectsPage.tsx`
- `src/components/ProjectDetailPanel.tsx`
- `src/components/project-detail-utils.ts`
- `src-tauri/src/project.rs`

注意：

- 该区域现在强调“操作与仓库状态”，不要退回松散的同权重卡片布局。
- 如果只是调整信息展示，优先保持现有后端数据契约不变。

### 4. 新增或修改 Tauri command

步骤：

1. 在对应 Rust 模块中定义 `#[tauri::command]`
2. 在 `src-tauri/src/lib.rs` 的 `generate_handler![]` 中注册
3. 前端通过 `@tauri-apps/api/core` 的 `invoke()` 调用

前端调用示例：

```ts
import { invoke } from "@tauri-apps/api/core";

const result = await invoke("get_configs");
```

## 关键架构约束与同步点

### 前后端通信模型

- 前端统一通过 `invoke()` 调 Rust command。
- command 注册权威位置是 `src-tauri/src/lib.rs`。
- 如果前端能调到函数但 Rust 未注册，运行时会直接失败。

### Schema 驱动的配置系统

配置链路是：

`claude-config.schema.json` -> `config-schema.ts` -> `field-groups.ts` -> `SchemaFormField.tsx` / `ConfigEditor.tsx`

约束：

- JSON Schema 是前后端共享契约的锚点。
- Zod schema 负责前端校验与推导。
- Rust 侧会验证 schema 一致性，不能只改一边。

### 通用配置与实际应用

- 通用配置是 base，当前配置是 overlay。
- 合并权威逻辑在 `src-tauri/src/config.rs::build_config_value()`。
- 激活配置最终会写入 `~/.claude/settings.json`。
- 预览配置调用的是后端 `preview_config`，不要在前端另写一套合并逻辑。

### 记忆与 Skills 的落盘模型

- 激活记忆后，会把所有 `is_active=true` 的内容合并写入 `~/.claude/CLAUDE.md`
- 启用 Skills 放在 `~/.claude/skills/<id>/`
- 禁用 Skills 放在 `~/.config/ai-manager/skills-disabled/<id>/`
- Skills 目录遍历要继续防止符号链接逃逸

### Rust 公共工具的使用边界

`src-tauri/src/utils.rs` 已提供：

- 主目录与应用数据目录获取
- JSON 文件读取与写入
- 统一锁获取
- 时间戳转换

新增 Rust 存储逻辑时优先复用：

- `lock_config()`
- `lock_memory()`
- `lock_stats()`
- `lock_skills()`
- `lock_provider()`
- `read_json_file()`
- `save_json_file()`
- `ensure_dir_and_write()`

如果你想改这些 helper 的语义，先审视所有调用方；它们属于全局基础设施，不是局部工具。

### UI 共享约束

- 全局 Toast Provider 在 `src/main.tsx`
- 公共 z-index 变量在 `src/styles/shared.css`
- 编辑器抽屉有共享样式，不要在单个页面里重新发明一套
- 复杂表单优先沿用现有 `react-hook-form + zodResolver` 模式

## 提交前验证清单

按改动范围选最小充分集，但不要跳过相关验证。

### 文档

```bash
git diff --check
```

### 前端

```bash
pnpm biome:ci
pnpm build
```

### Rust

```bash
cd src-tauri && cargo test
cd src-tauri && cargo clippy -- -D warnings
```

### 常用开发命令

```bash
pnpm dev
pnpm tauri dev
pnpm tauri build
make check
make test
make lint
make fmt
```

## 已知陷阱

### CodeMirror 多版本冲突会导致空白页

如果 `@codemirror/state` 被安装出多个版本，运行时 `instanceof` 可能跨实例失败，最终导致 React 空白页。

排查命令：

```bash
grep "'@codemirror/state@" pnpm-lock.yaml
```

预期只有一个版本。

如果出现多个版本：

- 在 `package.json` 里使用 `pnpm.overrides` 统一版本
- 不要用 `vite.config.ts` 的 `resolve.dedupe` 处理这个问题

### 不要忽略共享样式层级

项目已经把抽屉、设置面板、模态框、下拉菜单和 Toast 的层级集中到 CSS 变量里。新增浮层时如果直接写死数值，后面很容易出现遮挡回归。

### 不要在前端复制后端业务逻辑

配置预览、配置应用、Provider/Skills/Memory 的真实持久化规则都在 Rust。前端负责调用与展示，不要复制一份“看起来一样”的规则。

## 参考阅读顺序

如果你是第一次接手这个仓库，推荐顺序：

1. `README.md`
2. `src/App.tsx`
3. `src-tauri/src/lib.rs`
4. `src-tauri/src/utils.rs`
5. 你要改的功能模块对应的前后端文件
