---
name: update-claude-code-schema
description: 同步 Code Manager 的 Claude Code settings schema。当需要拉取 SchemaStore 最新定义、跟进 hooks/env/worktree/permissionRule 等新字段、排查 Rust 配置校验（`validate_settings_document` / `config::tests`）变红，或复盘 schema 变化对前端编辑器/表单/类型契约的影响时使用；凡改动 `src/schemas/claude-settings.schema.json` 都走本技能。
---

# Update Claude Code Schema

为 Code Manager 同步 Claude Code settings 的 SchemaStore 定义。**事实源永远是当前下载的完整 `https://www.schemastore.org/claude-code-settings.json`**：整体替换本地文件，再证明语义等同。字段级拼补会漏掉上游的“删除字段”变更、让本地 schema 越积越脏——只做整体替换。

## 1. 前置检查

读 `CLAUDE.md` 与 `.claude/rules/config-system.md`。`git status --short` 看工作区，只叠加本任务改动，不回退别人或上一条工作线的改动。确认 `curl`、`jq`、`node`、`pnpm`、`cargo` 可用。

## 2. 下载官方 schema 到临时文件

```bash
curl -fsSL https://www.schemastore.org/claude-code-settings.json \
  -o /private/tmp/claude-code-settings.latest.json
```

- 下载到临时文件，是为后续语义比对留一份未经格式化的原始字节基线——直接覆盖本地文件会丢掉对照基线。
- sandbox 会挡掉这条 curl（读 `/etc` 证书或写 `/private/tmp` 被拒，报 `curl: (77)` 或 operation not permitted）。提权重跑同一条命令，不要改命令绕过。

## 3. 整体替换 + 单文件格式化

```bash
cp /private/tmp/claude-code-settings.latest.json src/schemas/claude-settings.schema.json
pnpm exec biome format --write src/schemas/claude-settings.schema.json
```

只格式化这一个文件：`pnpm check` / `make fmt` 会顺手改写无关文件，污染本次改动的 blast radius。

## 4. 语义比对

先验 JSON 完整，再证明本地与下载文件深度排序后字节相同——格式差异（缩进、键顺序）允许，内容漂移不允许：

```bash
jq empty src/schemas/claude-settings.schema.json
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

**完成标准：打印 `schema matches SchemaStore semantically`。** 失败说明 biome format 改写了内容而非仅格式——回查 biome 配置或 schema 中的特殊字符（unicode escape、JSON pointer）。

## 5. 审查关键变化

深度排序比对只证明“和上游一致”，不告诉你“上游改了什么”。用 `git show HEAD` 取旧版、和下载文件对比顶层 `properties` 键，抓出增删：

```bash
diff <(git show HEAD:src/schemas/claude-settings.schema.json | jq -r '.properties|keys[]' | sort) \
     <(jq -r '.properties|keys[]' /private/tmp/claude-code-settings.latest.json | sort)
```

再按下列高频位置扫嵌套结构——这是历史踩过的点，不是穷举，以实际 diff 为准：

- **`env`**：从宽泛 pattern 收紧成显式 properties，或新增大量环境变量枚举。
- **`hooks`**：新事件类型、新字段（如 `continueOnBlock`、`args` exec form）、嵌套结构调整。
- **`worktree`**：新字段或 enum 值。
- **`permissionRule` 正则**：是否影响 `Read(*)`、`Skill(*)`、`mcp__*` 等通配规则的合法性。
- **标量字段的 enum 收紧/放宽**：如顶层 `effortLevel` 去掉 `max`。step 5 的 `.properties|keys[]` 顶层键 diff 只能发现键增删，抓不到枚举收紧；这类变化会让前端表单选项与 Rust `validate_settings_document` 校验失配，必须单独核对。
- **区分同名概念的两套枚举**：`env.CLAUDE_CODE_EFFORT_LEVEL`（env 键）与顶层 `effortLevel` 是不同字段、不同枚举、不同约束，收紧一个不影响另一个；排查前后端影响时不要混用。

审查只为把高风险变化告诉用户，确认是否需要后续动作（编辑器 UI、Rust 校验、表单字段、类型同步）。除非用户明确要求，本任务范围只到 schema 文件。

## 6. 验证

| 改动范围 | 命令 |
| --- | --- |
| JSON 完整性 | `jq empty src/schemas/claude-settings.schema.json` |
| Rust 配置校验 | `cd src-tauri && cargo test config::tests` |
| 格式 | `make fmt-check` |
| Diff whitespace | `git diff --check` |

- **测试过滤是子串匹配**：`cargo test validate_settings_document` 会命中 4 个 `validate_settings_document_*` 单测（均在 `config::tests` 内），并非"0 个用例"。验证以更全的 `cargo test config::tests`（68 passed 量级）为准即可，二者不矛盾。
- **`validate_settings_document()` 的性质**：未知顶层键放行，已知字段的嵌套结构严格校验。推论：上游**删除**顶层字段 → 老配置作为未知键仍通过，Rust 一般不炸；上游**改已知字段的嵌套结构** → Rust 可能挂，需更新断言或修校验代码。
- **前端门禁**：Stop 钩子会通用地提示 `make lint/build/test-frontend`；schema-only 改动由上表覆盖，无需前端构建。

没有本次会话的新鲜命令输出，不声称通过。

## 7. 收口输出

```
## Schema 同步结果

下载源：https://www.schemastore.org/claude-code-settings.json
下载时间：<UTC 时间>

语义比对：<pass/fail>
JSON 完整性：<pass/fail>
Rust 配置校验（config::tests）：<pass/fail，附关键输出>
格式与 diff 检查：<pass/fail>

关键 schema 变化：
- 顶层字段：<新增 / 移除条目>
- hooks：<新字段 / 新事件 / 结构调整>
- env / worktree / permissionRule：<具体点>

需要人工后续（不在本任务范围）：
- <编辑器 UI / 表单字段 / 前端类型是否需要同步>
- <Rust 校验是否需要补断言>
```
