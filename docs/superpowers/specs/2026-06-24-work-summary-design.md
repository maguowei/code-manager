# 工作总结（Work Summary）功能设计

- 日期：2026-06-24
- 状态：设计已确认，待写实现计划
- 分支：`feature-work-summary`

## 1. 背景与目标

Code Manager 目前只管理 Claude Code 的本地配置、历史、技能与用量，**不调用任何 LLM，也没有 Agent SDK 依赖**。

本功能新增一个顶级菜单入口「工作总结」，提供：

- **一键总结昨日工作**：覆盖昨日所有有变更的项目，包含「已提交」与「本地未提交」两类变动，分项目说明。
- **总结保存**：落盘为 Markdown，方便回归查看与外部工具/git 纳管。
- **生成周总结**：基于已有日总结聚合，缺失的天补扫 git。

### 成功标准

1. 点击「总结昨日」后，应用扫描出昨日有变更的 git 项目，逐项目生成自然语言总结，落盘并在页面渲染；有未提交变更的项目被明确标注。
2. 点击「生成本周」后，应用聚合本周日总结（缺失天补扫 git）生成周总结并落盘。
3. 总结文件可在 `~/.config/code-manager/summaries/` 找到，可被外部编辑器/git 打开。
4. 本机未安装 `claude` CLI 时，操作按钮禁用并给出可理解的说明，不崩溃。
5. 新增 Rust 单测与前端 vitest 覆盖纯函数逻辑（conventional 检测、diff 截断、ISO 周、markdown 拼装、页面渲染、i18n）。

## 2. 关键决策（已与用户确认）

| 维度 | 选择 | 理由 |
|---|---|---|
| 总结引擎 | 复用本机 `claude` CLI（headless，`claude -p`） | 零密钥管理、复用 Claude Code 现有鉴权/订阅，与现有 `run_git` 子进程模式一致 |
| 是否需要 Agent SDK | **不需要** | Rust 后端 + 单次提示式总结，shell out 到本机 `claude` CLI 即可获得 LLM 能力，无需引入 TS/Python Agent SDK 重依赖 |
| 项目发现 | history.jsonl 聚合的 git 项目 → 筛「昨日有 commit OR 当前有未提交变更」 | 复用现有发现机制，与 Projects 页数据源一致，零额外配置 |
| 周总结 | 混合：有日总结的天复用，缺失的天补扫该天 git | 兼顾速度与完整性 |
| 存储 | Markdown 落盘 `~/.config/code-manager/summaries/`（日、周各自子目录） | 「方便回归」，可外部编辑/git 纳管 |
| 触发 | 仅手动一键（`总结昨日` / `生成本周`），无后台调度 | 符合「一键」原意，实现最小 |

## 3. 架构与数据流

```
[总结昨日] 点击
  → scan_yesterday_changes()            纯 git，无 claude
      · 从 history 聚合项目 → 筛 isGitRepo
      · 每个项目：git log(昨日) + git status/diff(未提交)
      · 检测是否 conventional commits
  → 逐项目 claude -p 生成该项目总结段落    (可并发，分项目，单次上下文有界)
  → 拼装 daily markdown → 落盘 summaries/daily/2026-06-23.md
  → 前端 react-markdown 渲染
```

新增后端模块 `src-tauri/src/work_summary.rs`：

- git 操作复用 `project.rs::run_git` 同款子进程模式（`Command::new("git").arg("-C")...` + `utils::hide_command_window`）。
- 文件读写复用 `utils.rs` 的 `ensure_dir` / 原子写入；不新增重复工具。
- claude 调用抽象为单一函数 `summarize(prompt) -> Result<String, String>`，便于测试 stub，**测试中不真跑 claude**。

## 4. 数据采集（速度优化核心）

### 4.1 已提交工作

`git log --since=<昨日 00:00 本地> --until=<今日 00:00 本地> --author=<本机 user.email> --numstat --pretty=...`

- **conventional commits 项目**：subject 已含 `type(scope):`，只把结构化 commit 列表（type / scope / subject / body / numstat）喂给 claude，**不传 diff**，最快。
- **非 conventional 项目**：附带 numstat / diffstat，仍不传完整 diff（commit message + 文件变更统计足以描述「做了什么」）。
- **conventional 检测**：subject 正则 `^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\([^)]*\))?!?:`；命中比例达阈值（默认 ≥ 0.6）即判为 conventional 仓库。

### 4.2 未提交工作（必须扫描代码）

`git status --porcelain` + `git diff HEAD`（含暂存 + 工作区相对 HEAD）：

- 带上限：单文件 diff 超阈值（默认 400 行）截断并标注；二进制文件跳过；untracked 文件列文件名（不含正文）。
- 项目级总 diff 字符预算上限，超出按文件优先级截断并在素材中标注「已截断」。
- 该项目标记 `hasUncommitted = true`，最终总结中明确写出「⚠️ 有未提交变更」。

### 4.3 「我的工作」过滤（待复核默认）

commit 默认按本机 git `user.email` 过滤（`git config user.email`），等价于「我的工作」；solo 仓库与「全部 commit」等价。无 email 时回退为全部 commit。

> 复核点：若用户在共享仓库希望只看自己的提交，此默认合适；若希望看仓库全部活动，可后续加开关。首版采用 user.email 过滤 + 无 email 回退。

## 5. claude 调用

- **分项目**各一次 `claude -p <prompt> --output-format json`，与「总结应分项目说明」一致，单次上下文有界、可并发执行。
- prompt 语言跟随应用当前 UI 语言（zh / en）。
- prompt 大意：「你是工作总结助手。根据某项目昨日的 git 提交与未提交变更，用 <语言> 写一段简洁工作总结，说明做了什么、为什么。若有未提交变更，明确标注。输出 markdown 段落正文。」附结构化 commit 列表 + 未提交 diff 素材。
- **preflight**：`check_claude_cli()` 探测 CLI 是否存在（如 `claude --version`）；不存在 → 按钮禁用 + 说明性 toast。
- **容错**：单项目 claude 调用失败 → 该段落记录错误说明，其余项目照常完成；整体不中断。

## 6. 存储与文件结构

```
~/.config/code-manager/summaries/
  daily/
    2026-06-23.md       # 日总结
    2026-06-24.md
  weekly/
    2026-W26.md         # 周总结（ISO 周）
```

日总结正文示例：

```markdown
# 昨日工作总结 · 2026-06-23
生成于 2026-06-24 10:00 · 3 个项目有变更

## code-manager  `~/Work/AI/code-manager`
分支 feature-kanban · 5 commits · ⚠️ 有未提交变更

<claude 生成的中文总结正文>

## another-project  `~/Work/another`
分支 main · 2 commits

<claude 生成的中文总结正文>
```

- 重复生成同一天 → 覆盖（前端在文件已存在时弹确认对话框）。
- 昨日无变更项目 → 空状态 + toast，不落空文件。

## 7. 周总结（混合）

`generate_weekly_summary(iso_week)`：

1. 计算本周 7 天日期（ISO 周，周一为起点）。
2. 每天：有 `summaries/daily/YYYY-MM-DD.md` → 读其正文作为素材；无 → 补扫该天 git 取结构化 commit 作为素材。
3. 将「已有日总结正文 + 补扫素材」一起喂给一次 `claude -p` 二次汇总，生成周维度总结。
4. 写 `summaries/weekly/YYYY-Www.md`，已存在时覆盖（前端弹确认）。

## 8. 前端

- 新增顶级 tab：key `worklog`，icon `NotebookPen`（lucide）。
  - 改动：`src/types.ts`（`TabType`）、`src/components/Sidebar.tsx`（`NAV_ITEMS`）、`src/i18n.ts`（zh/en `nav.worklog` 等）、`src/App.tsx`（`lazy` import + 渲染分支）。
- 页面 `src/components/WorkSummaryPage.tsx`：
  - 顶部 `PageHeader` + 操作按钮 `[总结昨日] [生成本周]`（claude CLI 不可用时禁用）。
  - 左侧：已保存总结列表，按日期排序，日总结 / 周总结分组。
  - 主区：react-markdown 渲染选中总结正文。
  - 生成中：loading 状态；可选用 `useTauriEvent` 监听分项目进度事件提升体验。
- 新 hook `src/hooks/useWorkSummaries.ts`（仿 `useUsage.ts`）：列表加载 + 触发生成动作 + loading 状态；事件监听器在卸载时清理（用 `useTauriEvent`）。
- 所有可见文本走 `useI18n().t()`；反馈走 `useToast()`。

## 9. IPC 契约（新增命令）

| 命令 | 作用 |
|---|---|
| `check_claude_cli` | 探测本机 `claude` CLI 是否可用，返回 `{ available, version }` |
| `scan_yesterday_changes` | 纯 git：返回昨日有变更项目的结构化 changeset（供进度/预览） |
| `summarize_day(date)` | 扫描 → 逐项目 claude → 写 daily markdown，返回路径 + 正文 |
| `generate_weekly_summary(iso_week)` | 混合聚合 → claude → 写 weekly markdown，返回路径 + 正文 |
| `list_summaries` | 列出已保存日 / 周总结（日期 + 路径） |
| `read_summary(path)` | 读取指定总结 markdown |

同步链（严格遵守）：Rust `#[tauri::command] + #[specta::specta]` → `lib.rs::build_specta_builder()` 的 `collect_commands![]` 注册 → `make bindings` 生成 `src/bindings.ts` → `src/ipc.ts` 兼容包装（如需） → `src/types.ts` → i18n → 测试。涉及子进程调用，检查 `src-tauri/capabilities/default.json` 是否需要 shell 权限（git 已有调用，claude 同理）。

## 10. 错误处理

- `claude` CLI 不存在：preflight 检测，按钮禁用 + 说明性 toast，不发起生成。
- 单项目 git 失败：该项目在 changeset 中标记「扫描失败」，其余项目继续。
- 单项目 claude 失败：该段落写入错误说明，其余项目正常完成。
- 无符合条件项目：空状态 + toast，不落空文件。
- 重复生成：文件已存在时前端弹确认对话框，确认后覆盖。

## 11. 测试

- **Rust 单测**：conventional commits 检测、git 日期区间参数构造、diff 截断与字符预算、markdown 拼装、ISO 周计算；claude 调用通过函数边界 stub 化，不真实调用。
- **前端 vitest**：`WorkSummaryPage` 列表 + markdown 渲染、`useWorkSummaries` 行为、i18n key 完整性、按钮禁用态。
- **契约**：`make bindings-check`、`make build-frontend`、`make test-rust`。

## 12. 非目标（YAGNI）

- 不做后台/定时自动生成。
- 不做任意历史日期补扫（首版仅「昨日」与「本周」）。
- 不引入 Agent SDK 或 Anthropic API 直连。
- 不做 JSON 索引/检索层（首版按文件名日期排序足够）。
- 不做用户自定义跟踪项目列表（首版完全依赖 history 发现）。
