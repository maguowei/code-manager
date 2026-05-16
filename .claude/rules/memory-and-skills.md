---
paths:
  - "src/components/MemoryPage.tsx"
  - "src/components/MemoryEditor.tsx"
  - "src/components/MemoryItem.tsx"
  - "src/components/UnmanagedMemoryItem.tsx"
  - "src/components/SkillsPage.tsx"
  - "src/components/SkillEditor.tsx"
  - "src/components/SkillItem.tsx"
  - "src/schemas/memory*"
  - "src/schemas/skill*"
  - "src-tauri/src/memory.rs"
  - "src-tauri/src/skills.rs"
  - "src/types.ts"
---

# Memory And Skills Rules

## 记忆管理先读

- `src/components/MemoryPage.tsx`
- `src/components/MemoryEditor.tsx`
- `src/components/MemoryItem.tsx`
- `src/components/UnmanagedMemoryItem.tsx`
- `src/schemas/memory-schema.ts`
- `src/schemas/memory.schema.json`
- `src-tauri/src/memory.rs`
- `src/types.ts`

## 记忆落盘模型

- 记忆分为 `claude` 与 `rule` 两类。
- `claude` 类型同一时间只能启用一个，启用后写入 `~/.claude/CLAUDE.md`。
- `rule` 类型可同时启用多个，分别写入 `~/.claude/rules/<rulePath>`。
- `get_memories` 返回托管记忆和扫描出的 `unmanagedMemories`；未托管列表只用于视图，不写回 `memories.json`。
- `import_unmanaged_memory` 用于接管当前 `~/.claude/CLAUDE.md` 或 `rules/*.md`，遇到软链接或已被托管路径占用时必须继续拒绝。
- `import_memories_from_directory` 接受包含 `CLAUDE.md` 和 `rules/` 的普通目录，递归导入 `.md` rules，跳过软链接、重复路径和非法 rule path；批量导入后默认未启用。
- 复制 rule 记忆时要生成不冲突的 rule path，不能复用原路径。
- 删除活跃 rule 前通过 `preview_delete_memory` 展示将清理的空目录。
- Rule 路径必须是 `.md` 相对路径，不能包含绝对路径、反斜杠、盘符、`.` 或 `..`。
- Rule 的 `pathPatterns` 是结构化字段，编辑器和导入解析都要保留。
- 启用、禁用、删除或修改活跃 Rule 时，后端会清理旧文件；不要只改前端状态。
- 如果目标 rules 文件已存在且不是当前记忆生成的文件，后端会拒绝覆盖。
- `MemoryEditor` 通过 `EditorExitGuard` 向 `MemoryPage` 暴露 dirty、save 和 save-disabled 状态；关闭抽屉、切换记忆或跳转页面前必须用 `UnsavedChangesAlertDialog` 处理保存、丢弃或继续编辑。

## Skills 管理先读

- `src/components/SkillsPage.tsx`
- `src/components/SkillEditor.tsx`
- `src/components/SkillItem.tsx`
- `src/schemas/skill-schema.ts`
- `src/schemas/skill.schema.json`
- `src-tauri/src/skills.rs`

## Skills 落盘模型

- 启用 Skills 放在 `~/.claude/skills/<id>/`。
- 禁用 Skills 放在 `~/.config/ai-manager/skills-disabled/<id>/`。
- Skill id 只能包含小写字母、数字和连字符。
- Skills 页标题栏有本地化官方文档入口；类似外链继续用 `openUrl`，失败时走 Toast。
- 扫描 Skills 时允许识别目录级软链接，但只能读取目标目录的 `SKILL.md` 作为软链接 Skill 视图；不要递归读取支持文件，所有应用内写入仍必须拒绝软链接 Skill。
- 从目录导入 Skills 时支持导入合法目录级软链接；导入后保留软链接形态并作为软链接 Skill 展示，不复制目标目录内容。
- 应用内只支持编辑 `SKILL.md`；支持文件仅展示只读文件树，不提供新增、编辑、删除。
- 支持文件树只列普通目录 Skill 内部条目，必须跳过目录内软链接，禁止绝对路径与 `..` 路径逃逸。
- `sync_skill_to_codex` 会在 `~/.codex/skills/<id>` 创建软链接；目标已存在且不是软链接时必须拒绝覆盖。
- `SkillEditor` 同样接入 `EditorExitGuard`；关闭、切换、复制或跳转前遇到 dirty draft 时走 `UnsavedChangesAlertDialog`，保存失败要保持编辑器打开并保留用户输入。
