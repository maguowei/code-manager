# CLAUDE.md

本文件面向在本仓库中工作的编程智能体，例如 Claude Code、Codex 以及读取 `AGENTS.md` / `CLAUDE.md` 的同类代理。

它是仓库执行手册的入口，不是产品介绍页。产品定位、安装方式和面向人类的阅读入口在 `README.md`。

## Memory 布局原则

- 参考 Claude Code memory 最佳实践：主 `CLAUDE.md` 只保留每次会话都应加载的事实和硬约束，目标控制在 200 行以内。
- 细粒度规则放在 `.claude/rules/*.md`，并尽量使用 `paths` frontmatter 做路径触发，减少无关上下文。
- 不要用 `@.claude/rules/...` 把大规则重新 import 回本文件；import 会在启动时展开，无法节省上下文。
- Claude Code 会自动发现 `.claude/rules/`；若当前代理不会自动加载规则，修改相关文件前先手动阅读“规则索引”中的匹配文件。
- `AGENTS.md` 是指向本文件的软链接，不单独维护。

## 项目快速事实

- 项目：AI Manager，基于 Tauri 2 的 Claude Code 本地配置管理桌面应用。
- 当前版本：`0.13.0`，版本号同时出现在 `package.json` 与 `src-tauri/tauri.conf.json`。
- 前端：React 19 + TypeScript + Vite。
- 后端：Rust + Tauri commands。
- 包管理器：`pnpm`，项目声明 `pnpm@10.33.0`。
- 应用标识符：`com.gotobeta.app.ai-manager`。
- 当前仓库不使用 Go、Python 或 Tailwind CSS；如后续引入，遵守仓库通用约束：Go 1.26、Python >= 3.14、Tailwind CSS v4。

## 关键数据目录

- 应用数据：`~/.config/ai-manager/`
  - `configs.json`
  - `memories.json`
  - `model-pricing.json`
  - `skills-disabled/`
- 用量 SQLite 缓存：Tauri SQL 插件的应用配置目录。
  - macOS：`~/Library/Application Support/com.gotobeta.app.ai-manager/usage.db`
  - Linux：`$XDG_CONFIG_HOME/com.gotobeta.app.ai-manager/usage.db` 或 `~/.config/com.gotobeta.app.ai-manager/usage.db`
  - Windows：`%APPDATA%\com.gotobeta.app.ai-manager\usage.db`
  - WAL 模式可能同时生成 `usage.db-wal` 与 `usage.db-shm`。
- 应用直接操作的 Claude Code 用户目录：`~/.claude/`
  - `settings.json`
  - `CLAUDE.md`
  - `rules/`
  - `skills/`
  - `sessions/`
  - `statusline.sh`
- 可选 Codex 同步目录：`~/.codex/skills/`。
- 历史、统计与用量输入：
  - `~/.claude/history.jsonl`
  - `~/.claude/projects/`
  - `~/.claude.json`
- 测试可用环境变量覆盖本机目录：
  - `AI_MANAGER_HOME_OVERRIDE`
  - `AI_MANAGER_APP_DATA_DIR_OVERRIDE`
- 应用日志：系统推荐日志目录，不放在 `~/.config/ai-manager/`。
  - macOS：`~/Library/Logs/com.gotobeta.app.ai-manager/ai-manager.log`
  - Linux：`$XDG_DATA_HOME/com.gotobeta.app.ai-manager/logs/ai-manager.log` 或 `~/.local/share/com.gotobeta.app.ai-manager/logs/ai-manager.log`
  - Windows：`%LOCALAPPDATA%\com.gotobeta.app.ai-manager\logs\ai-manager.log`

## 工作约束

- 只做必要改动，优先最小影响面。
- 先找根因，再改代码；不要用临时绕过方案。
- 沿用现有模式，不为了“顺手优化”做无关重构。
- 工作区可能是脏的，不要回退你没创建的改动。
- 非简单任务先列计划并持续更新进度；方向偏离时停下来重新规划。
- 完成前必须有新鲜验证证据；没有运行过验证命令，不要声称完成或通过。
- 使用 `pnpm`，不要改用 `npm`。
- `pnpm check` 会执行 `biome check --write .` 并修改文件；只想做 CI 检查时用 `pnpm biome:ci`。
- 代码注释使用中文。
- 所有用户可见文本必须走 `useI18n()` 的 `t()` 函数，不要硬编码中英文字符串。
- 所有前端通知优先走 `useToast()`，不要把 `console.error` 当作用户反馈。
- 新增有层叠关系的样式时，复用 `src/styles/shared.css` 中的 z-index 变量，不要硬编码层级数值。
- Rust 新增文件读写、锁、时间、JSON 工具时，优先复用 `src-tauri/src/utils.rs`。

## 规则索引

按修改范围阅读对应规则。多个路径命中时，全部适用。

| 规则文件 | 适用范围 |
| --- | --- |
| `.claude/rules/agent-memory-layout.md` | `CLAUDE.md` 与 `.claude/rules/` 的维护规则 |
| `.claude/rules/frontend-ui.md` | React、CSS、i18n、Toast、共享 UI 约束 |
| `.claude/rules/tauri-backend.md` | Rust、Tauri command、capability、公共工具 |
| `.claude/rules/config-system.md` | Profile / Preset / settings schema / 状态行 / 官方插件 |
| `.claude/rules/memory-and-skills.md` | 记忆管理、Rules、Skills、Codex 同步 |
| `.claude/rules/history-stats-usage.md` | 历史、统计、Token 用量与费用 |
| `.claude/rules/projects-tray-diagnostics.md` | 项目管理、系统托盘、会话聚焦、日志与诊断 |

## 修改前快速入口

- 应用壳与页面编排：`src/App.tsx`
- React 入口、全局 Provider 与错误日志：`src/main.tsx`
- 国际化：`src/i18n.ts`
- 类型契约：`src/types.ts`
- 共享 schema 与表单定义：`src/schemas/`
- 公共 hooks：`src/hooks/`
- 公共样式与 z-index 令牌：`src/styles/shared.css`
- Tauri 命令注册：`src-tauri/src/lib.rs`
- Rust 公共工具：`src-tauri/src/utils.rs`
- Tauri capability：`src-tauri/capabilities/default.json`

## 架构同步点

- 前端统一通过 `@tauri-apps/api/core` 的 `invoke()` 调 Rust command。
- command 注册权威位置是 `src-tauri/src/lib.rs`。
- 新增或修改 Tauri command 时，同步 Rust command、`generate_handler![]`、前端调用、`src/types.ts`、i18n、测试；涉及插件 API 时检查 `src-tauri/capabilities/default.json`。
- JSON Schema 是配置系统的前后端共享契约锚点。
- 配置预览、配置应用、模型测试、Provider/Preset、Skills、Memory 的真实持久化规则都在 Rust；前端负责调用与展示，不要复制后端业务逻辑。
- `StatsPage` 读取 `~/.claude.json`；`UsagePage` 扫描 `~/.claude/projects/**/*.jsonl`。两者字段相似但数据来源不同。

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
pnpm test
```

### Rust

```bash
cd src-tauri && cargo test
cd src-tauri && cargo clippy -- -D warnings
```

### 前后端契约

```bash
pnpm build
cd src-tauri && cargo test
```

## 已知陷阱

- CodeMirror 多版本冲突会导致空白页。排查：`grep "'@codemirror/state@" pnpm-lock.yaml`，预期只有一个版本；如出现多个版本，在 `package.json` 里用 `pnpm.overrides` 统一。
- 不要忽略共享样式层级：抽屉、设置面板、模态框、下拉菜单和 Toast 的层级集中在 CSS 变量里。
- 不要混淆 Stats 与 Usage：`StatsPage` 用 `~/.claude.json`，`UsagePage` 用 `~/.claude/projects/**/*.jsonl`。
- 不要把日志当成配置数据：日志目录由 Tauri 的 `app_log_dir()` 解析，不要迁移到 `~/.config/ai-manager/`。
- 不要相信旧文件名：当前配置 schema 是 `src/schemas/claude-settings.schema.json`。

## 参考阅读顺序

1. `README.md`
2. 本文件
3. 命中路径对应的 `.claude/rules/*.md`
4. `src/App.tsx`
5. `src/main.tsx`
6. `src-tauri/src/lib.rs`
7. `src-tauri/src/utils.rs`
8. 你要改的功能模块对应前后端文件
