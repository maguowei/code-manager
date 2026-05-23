---
paths:
  - "CLAUDE.md"
  - "AGENTS.md"
  - "README.md"
  - ".claude/rules/**/*.md"
---

# Agent Memory Layout Rules

## 文档分工

- `CLAUDE.md` 面向 AI Agent，是每次会话要加载的执行手册。
- `AGENTS.md` 是 `CLAUDE.md` 的软链接，不单独维护。
- `README.md` 面向人类用户和项目访问者，说明产品定位、安装、快速使用、数据路径、开发入口和延伸阅读。
- `docs/user-manual.md` 承载完整用户手册；`docs/platform-support.md` 承载平台矩阵；不要把这些长内容搬回根文档。
- `.claude/rules/*.md` 承载 path-scoped 细规则，只在修改命中路径时读取。

## 拆分规则

- `CLAUDE.md` 只保留会话级事实、硬约束、规则索引、关键目录和验证入口，目标控制在 200 行以内。
- `README.md` 只保留人类读者首次进入项目需要的内容；深层实现细节用链接指向 `docs/` 或 rules。
- 某条规则只在某个模块或文件类型下有用时，放到 path-scoped rule。
- 某条规则每次会话都必须知道时，才放回 `CLAUDE.md`。
- 不要用 `@.claude/rules/...` 把大规则 import 回主文件；import 会启动即加载，不能降低上下文占用。
- 每个 rule 文件聚焦一个主题，文件名描述主题，不做跨模块大杂烩。
- 如果主文件、README 和具体 rule 重复，以更具体的 path-scoped rule 为准，并删除根文档里的重复细节。

## 维护检查

- 修改 `CLAUDE.md` 后运行 `wc -l CLAUDE.md`，确认仍低于 200 行。
- 修改 rules 后运行 `git grep -n "paths:" .claude/rules`，抽查 glob 是否仍指向真实文件。
- 修改根文档或 rules 后运行 `git diff --check`，并检查是否出现旧版本号、旧文件名、乱码或断链。
