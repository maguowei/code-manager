---
paths:
  - "CLAUDE.md"
  - "AGENTS.md"
  - ".claude/rules/**/*.md"
---

# Agent Memory Layout Rules

## 目标

- `CLAUDE.md` 是启动入口，不是完整知识库。
- 主文件目标控制在 200 行以内，只保留每次会话都需要的事实、硬约束、索引和验证命令。
- 细规则放入 `.claude/rules/*.md`，优先使用 `paths` frontmatter 做路径触发。

## 拆分规则

- 某条规则只在某个模块或文件类型下有用时，放到 path-scoped rule。
- 某条规则每次会话都必须知道时，才放回 `CLAUDE.md`。
- 不要用 `@.claude/rules/...` 把大规则 import 回主文件；import 会启动即加载，不能降低上下文占用。
- 每个 rule 文件聚焦一个主题，文件名描述主题，不做跨模块大杂烩。
- 如果规则之间产生重复，以更具体的 path-scoped rule 为准，并删除主文件里的重复细节。

## 维护检查

- 修改 `CLAUDE.md` 后运行 `wc -l CLAUDE.md`，确认仍低于 200 行。
- 新增规则时确认 frontmatter 的 `paths` 覆盖目标文件，并用 `git grep -n "paths:" .claude/rules` 抽查 glob 是否仍指向真实文件。
- 修改规则后运行 `git diff --check` 和乱码扫描。
