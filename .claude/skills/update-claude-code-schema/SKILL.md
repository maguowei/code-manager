---
name: update-claude-code-schema
description: AI Manager 仓库的 Claude Code settings schema 同步技能。涉及 src/schemas/claude-settings.schema.json 升级、SchemaStore 最新定义同步、Claude Code 新增 settings 字段（hooks/env/worktree/permissionRule 等）、或后端 Rust 配置校验兼容性检查时使用：以官方 SchemaStore 为唯一事实源，按"下载 → 整体替换 → 语义比对 → Rust 校验"四步走。
---

# Update Claude Code Schema

为 AI Manager 同步 Claude Code settings 的 SchemaStore 最新定义。**事实源永远是当前下载的 `https://www.schemastore.org/claude-code-settings.json`**——不要凭记忆、不要从网页片段拼补、不要只 diff 局部字段。

## 触发场景

- 同步 SchemaStore 最新 settings schema。
- Claude Code 发布新 settings 字段（hooks 子字段、permissionRule 模式、env 结构、worktree 选项等）。
- `validate_settings_document` 测试失败或 Rust 配置校验红。
- 复盘 schema 变化对前端编辑器、表单或类型契约的影响。

## 工作流速览

1. **前置检查**：工具 + 规则 + 工作区状态。
2. **下载官方 schema**：到临时文件，不读旧版。
3. **整体替换 + 单文件格式化**：覆盖本地 schema。
4. **语义比对**：本地与下载文件深度排序后字节相同。
5. **审查关键变化**：列出新增 / 移除 / 收紧 / 放宽。
6. **验证**：Rust schema 测试 + 格式检查 + diff check。
7. **收口**：汇报比对结果、风险点、未尽项。

## 前置检查

读 `CLAUDE.md` 和 `.claude/rules/config-system.md`。`git status --short` 看工作区——只叠加本任务的变更，不回退别人或上一条工作线的改动。

确认工具可用：`curl`、`jq`、`node`、`pnpm`、`cargo`。

## 下载官方 schema

```bash
curl -fsSL https://www.schemastore.org/claude-code-settings.json \
  -o /private/tmp/claude-code-settings.latest.json
```

- **为什么下载到临时文件**：留一份原始字节用于后续语义比对；本地文件可能已带格式化痕迹，直接覆盖会丢掉对照基线。
- sandbox 下网络/代理可能挡掉 curl，按权限流程提权重跑同一命令，不要绕过。
- **不**从网页片段、旧 PR diff 或记忆里手工拼补字段——SchemaStore 是 single source of truth，手工拼补必然遗漏上游的"删除字段"。

## 整体替换 + 单文件格式化

```bash
cp /private/tmp/claude-code-settings.latest.json src/schemas/claude-settings.schema.json
pnpm exec biome format --write src/schemas/claude-settings.schema.json
```

- **为什么整体替换而不是字段级合并**：字段级合并会漏掉上游的"删除字段"变更；本地 schema 会越积越脏，最后偏离官方定义。
- **为什么只格式化单文件而不是 `pnpm check`**：全仓格式化会顺手改写无关文件，污染本次 PR 的 blast radius，违反"最小影响面"原则。

## 语义比对

```bash
jq empty src/schemas/claude-settings.schema.json
```

再做深度排序后字节比对——格式差异（缩进、键顺序）允许，**内容漂移不允许**：

```bash
node -e '
const fs = require("fs");
const sort = v =>
  Array.isArray(v) ? v.map(sort)
  : v && typeof v === "object"
    ? Object.fromEntries(
        Object.entries(v)
          .sort(([a],[b]) => a.localeCompare(b))
          .map(([k,x]) => [k, sort(x)])
      )
    : v;
const local = sort(JSON.parse(fs.readFileSync("src/schemas/claude-settings.schema.json","utf8")));
const upstream = sort(JSON.parse(fs.readFileSync("/private/tmp/claude-code-settings.latest.json","utf8")));
if (JSON.stringify(local) !== JSON.stringify(upstream)) {
  console.error("schema differs semantically");
  process.exit(1);
}
console.log("schema matches SchemaStore semantically");
'
```

比对失败说明 biome format 改写了内容而不仅是格式——回查 biome 配置或 schema 中的特殊字符（如 unicode escape、JSON pointer）。

## 审查关键变化

下载完成后，按优先级扫一遍变化点。下列只是历史踩过的高频位置，不是 exhaustive list；以实际 diff 为准：

- **顶层字段**新增或移除（历史出现过：`skillOverrides`、`parentSettingsBehavior`、`subagentStatusLine` 等）。
- **`env` 结构**：从宽泛 pattern 收紧成显式 properties，或新增大量环境变量枚举。
- **`hooks`**：新事件类型、新字段（如 `continueOnBlock`、`args` exec form）、嵌套结构调整。
- **`worktree`**：新字段或 enum 值。
- **`permissionRule` 正则**：是否影响 `Read(*)`、`Skill(*)`、MCP tool 等通配规则的合法性。

**审查目的不是顺手改产品**——只是把高风险变化抓出来告诉用户，确认是否需要后续动作（编辑器 UI、Rust 校验、表单字段、类型同步）。除非用户明确要求，本任务范围只到 schema 文件。

## 验证

| 改动范围 | 命令 |
| --- | --- |
| JSON 完整性 | `jq empty src/schemas/claude-settings.schema.json` |
| Rust schema 校验 | `cd src-tauri && cargo test validate_settings_document`、`cargo test config::tests` |
| 格式 | `make fmt-check` |
| Diff whitespace | `git diff --check` |

**`validate_settings_document()` 的关键性质要记住**：未知顶层键允许通过，已知 schema 字段的嵌套结构会被严格校验。由此推论：

- 上游**删除**顶层字段 → 老配置仍能作为未知键通过，Rust 测试通常不会炸。
- 上游**修改已知字段的嵌套结构** → Rust 测试可能挂，需要更新断言或修复校验代码。

没有本次会话的新鲜命令输出，不声称通过。

## 输出格式

```
## Schema 同步结果

下载源：https://www.schemastore.org/claude-code-settings.json
下载时间：<UTC 时间>

语义比对：<pass/fail>
JSON 完整性：<pass/fail>
Rust 校验测试：<test 名 → pass/fail，附关键输出>
格式与 diff 检查：<pass/fail>

关键 schema 变化：
- 顶层字段：<新增 / 移除条目>
- hooks：<新字段 / 新事件 / 结构调整>
- env / worktree / permissionRule：<具体点>

需要人工后续（不在本任务范围）：
- <编辑器 UI / 表单字段 / 前端类型是否需要同步>
- <Rust 校验是否需要补断言>
```
