# Claude Code 使用最佳实践

> 本文档是 `CLAUDE.md` 与 `.claude/rules/*.md` 的扩展手册。硬约束、快速入口、验证清单和已知陷阱以 `CLAUDE.md` 为权威来源；本文档只补充工作流、提示模板、上下文管理和失败模式，避免重复。

本文档面向在 AI Manager 仓库中使用 Claude Code、Codex 或兼容代理的开发者。目标不是复述 Claude Code 官方教程，而是把官方建议映射到本项目的真实协作规则上。

参考来源：

- [Claude Code 概述](https://code.claude.com/docs/zh-CN/overview)
- [Claude Code 最佳实践](https://code.claude.com/docs/zh-CN/best-practices)
- [Claude 如何记住你的项目](https://code.claude.com/docs/zh-CN/memory)
- [选择权限模式](https://code.claude.com/docs/zh-CN/permission-modes)
- [常见工作流程](https://code.claude.com/docs/zh-CN/common-workflows)

## 项目画像

AI Manager 是面向 Claude Code 用户的本地 Tauri 2 桌面管理台，让 Claude Code 的配置、记忆、Skills、历史、统计、用量、项目状态和诊断信息可见、可编辑、可验证。版本、技术栈、应用标识符等基础事实在 `CLAUDE.md` 的「项目速览」和 `README.md` 中维护；功能域到关键文件的映射在 `CLAUDE.md` 的「快速入口」和对应 `.claude/rules/*.md` 中维护，本文档不再重复一份。

## 总体原则

官方最佳实践里最重要的几个点，在本项目中应落成以下规则：

1. **先探索，再计划，最后编码**：涉及 3 个以上步骤、跨前后端、改配置契约或改 UI 体系时，先只读分析并列计划。拼写、文档小修、单行配置这类明确小改可以直接做。
2. **给代理可验证的成功标准**：每个任务都要说明或自行选择验证命令。没有新鲜验证证据，不要声称完成。
3. **主动管理上下文**：长任务先定位入口文件和规则文件，不要一次性读取全仓。大型调查优先拆成独立问题，必要时使用 subagent 或新会话。
4. **把持久规则写进合适位置**：长期项目规则放 `CLAUDE.md` 或 `.claude/rules/`；偶发、可复用流程放 `.claude/skills/`；必须每次执行的动作放 hooks。
5. **最小影响面**：只改目标功能需要的文件，不做顺手重构，不回退用户已有变更。

## 推荐工作流

### 1. 进入任务

每次开始前先做两件事：

```bash
git status --short
rg --files
```

然后按修改范围读取命中的 `.claude/rules/*.md`（完整索引见 `CLAUDE.md` 的「规则索引」表）。如果只改文档，仍要先确认现有 `docs/` 结构和相邻文档风格。

### 2. 计划

适合使用 Plan Mode 的任务：

- 跨 `src/` 与 `src-tauri/` 的契约改动。
- 新增或调整 Claude settings 字段。
- 涉及数据落盘、路径安全、符号链接、日志脱敏或权限能力。
- UI 改动会影响多个页面、共享组件或设计令牌。
- 用户只说“全面分析”“深度 review”“重新设计”“结合最佳实践给方案”。

不需要 Plan Mode 的任务：

- 单个文档 typo。
- 单个测试断言修正。
- 明确、低风险的样式微调。
- 用户已经给出可执行计划并明确要求实现。

计划必须包含：

- 目标和非目标。
- 要读或要改的文件。
- 关键风险。
- 验证命令。
- 如果有用户决策点，先停下确认。

### 3. 实施

实施时的硬约束（i18n、Toast、shadcn 语义变量、Tauri command 同步、`utils.rs` 复用、无外键等）在 `CLAUDE.md` 的「硬约束」与「架构同步点」中维护，本节只列具体执行习惯：

- 搜索用 `rg` / `rg --files`。
- 文件编辑保持小补丁，避免把无关格式化混入业务 diff。
- 改动跨前后端时按"先 Rust command + Specta 注册 + bindings，再 `src/ipc.ts` 包装 + i18n + 测试"的顺序写，避免反复来回切换。

### 4. 验证

按改动范围选最小充分集（完整清单见 `CLAUDE.md` 的「测试与验证」），并注意：

- 标准验证优先走 `Makefile` target，例如 `make lint-frontend`、`make bindings-check`、`make build-frontend`、`make test-rust`、`make verify`。
- `pnpm check` 会写文件，只做只读前端检查时使用 `make lint-frontend`；只读格式检查用 `make fmt-check`。
- `pnpm dev` 只启动 Vite；需要原生壳时使用 `pnpm tauri dev`。
- Tauri capability 或插件改动除了契约命令，还要本地实际触发相关路径说明。
- UI 视觉改动在前端命令之外补本地应用或浏览器截图核验。
- 文档变更不触发当前 CI 的代码检查，但本地仍要跑 `git diff --check`，避免尾随空格和 Markdown 断裂。

### 5. 收尾

最终回复或 PR 描述应包含：

- 改了什么。
- 为什么这么改。
- 运行了哪些验证命令。
- 如果没跑某个合理验证，说明原因。
- 是否存在剩余风险或需要用户确认的后续项。

提交信息使用 Conventional Commits，并由本地 `commit-msg` hook 与 GitHub Actions commitlint workflow 共同检查，例如：

```text
docs: 添加 Claude Code 使用最佳实践
fix(config): 修复 Profile 预览权限合并
refactor(settings): 收敛设置抽屉表单结构
```

## Claude Code 配置建议

> CLAUDE.md / `.claude/rules/` 的取舍规则、维护检查与 200 行硬约束已在 `.claude/rules/agent-memory-layout.md` 中维护，本文档不再重复。本节只补充 Skills、Hooks 与权限模式三类没有 path-scoped rule 的话题。

### Skills

官方建议把可复用工作流做成 skills。本项目当前已落地 `.claude/skills/release-new-version/SKILL.md`（手动触发，`disable-model-invocation: true`）。

未来候选（尚未落地，不要假设已存在）：

- 批量同步 Claude Code 配置。
- 复杂 review 模板。
- 用量价格表对账。
- 回归测试矩阵生成。

创建 skill 时要明确：

- `name` 和 `description` 是否能让模型自动选择。
- 是否有副作用；有副作用且需要人工触发的流程应考虑 `disable-model-invocation: true`。
- 输入、输出、验证命令和失败处理。

### Hooks

官方文档把 hooks 定位为"必须每次发生且没有例外"的确定性动作。本项目采用三层门禁：

- `.claude/settings.json` 的 hooks 做会话级 guardrail：阻止绕过 lefthook 的 Bash 命令、Bash 侧敏感文件读取，并在 Stop 时按变更范围提示验证命令。
- `lefthook.yml` 做本地 Git 门禁：pre-commit 负责 staged Biome 自动修复、Gitleaks 密钥扫描、Rust 格式检查和轻量配置检查，commit-msg 负责 commitlint，分支 pre-push 负责 `make verify`。
- GitHub Actions 做远端权威门禁：commitlint workflow 检查提交信息，CI 和 release quality job 执行不可绕过的构建、lint、test。

不建议把耗时全量命令无条件放进每次编辑后执行，例如 `make build-frontend`、`make test-rust`。这些更适合任务收尾、pre-push 或 CI。

### 权限模式

权限模式要按任务风险选择：

| 场景 | 建议模式 |
| --- | --- |
| 初次理解仓库、审查设计、排查风险 | `plan` 或默认只读 |
| 小范围实现且用户持续看 diff | `acceptEdits` |
| 长时间、低风险、可验证的批量任务 | `auto` |
| CI / 脚本中只允许预批准工具 | `dontAsk` |
| 本机真实工作区 | 不使用 `bypassPermissions` |

本项目涉及本地 `~/.claude/`、AI Manager 应用数据目录、日志目录、SQLite 缓存和 Tauri capability。凡是会写用户目录、清理项目数据、删除 Skill/Memory、修改权限配置的任务，都应保留人工确认或先做 preview。

## 上下文管理

Claude Code 官方文档反复强调 context 是稀缺资源。这个仓库应采用以下策略：

- 先问“我要改哪个功能域”，再读对应规则和入口文件。
- 用 `rg` 定位调用链，不要一次性打开大量组件。
- 大范围审查时按功能域分批输出，不把所有细节塞进同一个会话。
- 跨任务时使用 `/clear`；长任务阶段性使用 `/compact`，并要求保留已改文件、测试命令和剩余风险。
- 跨天继续任务时使用 `claude --continue` 或 `claude --resume`，并先让 Claude 复述当前 diff 和验证状态。
- 大型调查可以委派 subagent，只把结论、证据路径和风险返回主会话。

## Worktree 与并行会话

官方推荐用 worktree 运行并行会话，避免多个代理编辑同一个检出目录。本项目建议：

- 一个功能分支只承载一个明确目标。
- 需要同时做 UI、Rust、文档三条线时，优先拆 worktree 或明确文件所有权。
- 并行会话结束后由主会话统一检查 diff、运行验证和合并结论。
- 不要在多个会话中同时改 `src/types.ts`、`src/i18n.ts`、`src-tauri/src/lib.rs` 这类高冲突文件，除非已明确分工。

## 项目专用提示模板

### 代码审查

```text
请按代码审查方式检查当前分支相对 main 的变更。
先运行 git status 和 git diff 定位范围。
重点看行为回归、缺失测试、路径安全、日志脱敏、i18n、Tauri command 同步。
结论按严重程度排序，给出文件和行号；没有问题也说明剩余测试风险。
```

### 前端功能

```text
实现 [功能]。
先读 CLAUDE.md 和 .claude/rules/frontend-ui.md，再定位相关组件。
所有用户可见文本走 useI18n()，通知走 useToast()。
沿用 shadcn/ui、TYPOGRAPHY、surface-classes 和现有测试选择器模式。
完成后运行 make lint-frontend、make build-frontend、make test-frontend。
```

### Tauri command

```text
新增/修改 [command]。
先读 .claude/rules/tauri-backend.md。
同步 Rust command 的 #[tauri::command] / #[specta::specta]、lib.rs collect_commands、make bindings、src/ipc.ts、src/types.ts、capability、i18n 和测试。
路径输入必须防止绝对路径、..、符号链接逃逸；日志不得包含密钥或完整配置内容。
完成后运行 make bindings-check、make build-frontend 和 make test-rust。
```

### 配置字段

```text
调整 Claude settings 字段 [字段名]。
先读 .claude/rules/config-system.md。
不要在前端复制 Preset/Profile 合并逻辑；最终配置以 src-tauri/src/config.rs 为准。
同步 JSON Schema、表单注册、类型、Rust 校验、预览/应用路径、i18n 和测试。
```

### 文档任务

```text
更新 docs 下的 [主题] 文档。
先检查现有 docs 结构和相邻文档风格。
用真实仓库路径、命令和数据源写，不写泛泛建议。
如涉及版本或功能清单，先对照 package.json、src-tauri/tauri.conf.json 和近期 git log。
完成后运行 git diff --check，并检查是否有乱码、过期版本号、旧文件名或断链。
```

## 常见失败模式

| 失败模式 | 本项目中的后果 | 预防方式 |
| --- | --- | --- |
| 未读规则直接改代码 | i18n、Toast、shadcn、capability 或数据源边界被破坏 | 每次按路径读取 `.claude/rules/`。 |
| 前端复制后端逻辑 | Profile 预览、应用和模型测试结果不一致 | 合并和落盘逻辑只在 Rust 维护。 |
| 混淆 Stats 与 Usage | 总费用、Token、最近会话口径错误 | 牢记 Stats 用 `~/.claude.json`，Usage 用 `~/.claude/projects/**/*.jsonl`。 |
| 把日志当配置 | 日志目录、轮转和脱敏策略失效 | 日志只走系统日志目录和 `logging.rs`。 |
| 用 `pnpm check` 做只读检查 | 工作区被自动格式化，混入无关 diff | 只读前端检查用 `make lint-frontend`。 |
| 路径校验只做前端 | 用户目录写入存在逃逸风险 | 路径安全必须在 Rust command 边界校验。 |
| 视觉改动不截图 | UI 重叠、密度失衡、抽屉断裂 | 前端验证后补本地视觉核验。 |
| 文档写成教程但不落项目 | 读者无法直接执行 | 每条建议都绑定本仓库路径或命令。 |

## 推荐的日常使用节奏

1. 用 AI Manager 管理 Profile / Preset，把模型、API 地址、环境变量、权限、Hooks、插件和状态行显式化。
2. 用 Memory 页面管理 `CLAUDE.md` 与 `rules/*.md`，保持规则短小，避免把临时知识塞进长期指令。
3. 用 Skills 页面沉淀高频流程，并同步到 Codex 时确认目标不是普通目录。
4. 开发前让 Claude Code 先读项目规则和目标模块；开发中让它跑局部验证；开发后让它检查 diff。
5. 长任务用 Plan Mode、worktree、subagent 和 `/compact` 管理上下文。
6. 对用户目录、权限、日志和数据清理类操作保持 preview 和人工确认。
7. 提交前按变更范围运行验证命令，再写 Conventional Commit。

## 最小完成标准

一次 Claude Code 任务在本仓库中只有满足以下条件，才算完成：

- 目标需求已经落到代码或文档。
- 没有无关文件被修改。
- 已检查 `git diff`。
- 已运行匹配范围的验证命令。
- 对未验证项、环境限制或残余风险有明确说明。
- 用户可见文本、日志、路径安全、数据源口径和配置契约没有破坏既有规则。
