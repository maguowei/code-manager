# Skills 页：目录导入与软链接接管 设计文档

- 创建日期：2026-05-11
- 适用模块：`src/components/SkillsPage.tsx`、`src-tauri/src/skills.rs`
- 相关规则：`.claude/rules/memory-and-skills.md`、`.claude/rules/frontend-ui.md`、`.claude/rules/tauri-backend.md`

## 背景

当前 Skills 页只能通过编辑器手动创建 skill，扫描 `~/.claude/skills/` 时主动跳过软链接（`src-tauri/src/skills.rs:215`）。Memory 页已经具备「外部目录导入」与「未托管项展示+接管」能力，Skills 页需要对齐：

1. 支持从外部目录导入 skill（单 skill / 集合目录都支持）。
2. 扫描时识别软链接形式的 skill 并展示，作为「未托管 Skills」与托管 skill 共存。

## 目标与非目标

**目标**

- 用户可一键从外部目录导入 skill 到本地（复制为禁用态）。
- 软链接形式的 skill 在列表中可见，可启停、可同步到 Codex、可删除链接，但不可编辑内容。
- Memory 页已建立的交互范式（页头按钮、Toast 汇总、`claude-directory-changed` 自动刷新）在 Skills 页一致复用。

**非目标**

- 不支持「软链接形式导入」（外部目录导入只复制，不创链接）。
- 不为软链接 skill 提供只读编辑器视图，仅入口禁用 + 后端兜底拒写。
- 不修改 `SKILL.md` 文件 schema 与 Codex 同步落盘策略，仅扩展运行时视图字段。

## 数据模型

### `Skill` 类型扩展

`src/types.ts` 与 `src-tauri/src/skills.rs` 的 `Skill` 同步新增：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `isManaged` | `boolean` | `true` 普通目录，可编辑/启停/删除/同步；`false` 当前唯一形态为软链接接管 |
| `linkTarget` | `string \| null` | 仅未托管时有值，软链接最终目标路径（`canonicalize` 一次后的绝对路径） |

UI 仅看 `isManaged` 决定能力开关；`linkTarget` 用于卡片徽标 tooltip。`SKILL.md` 文件 schema（`src/schemas/skill.schema.json`、`src/schemas/skill-file.schema.json`）不变——这些是文件契约，不包含运行时视图字段。

## 后端契约（`src-tauri/src/skills.rs`）

### 扫描逻辑改造

`scan_skills_dir` 当前直接跳过 symlink。改为：

- 普通目录：`isManaged = true`，`linkTarget = None`，行为不变。
- 软链接 + 链接目标存在 + 目标是目录 + 目标含 `SKILL.md`：`isManaged = false`，`linkTarget = Some(canonicalize(path))`，仅读取目标里的 `SKILL.md`，**不递归扫描支持文件**。
- 软链接但目标缺失、不是目录、缺 `SKILL.md`：跳过，不展示僵尸条目。

放开 symlink 仅限「扫描读 `SKILL.md`」这一步；所有写入路径仍按 `isManaged` 分支。

### 新增 Tauri command

```
import_skills_from_directory(sourceDir: String)
  -> Result<{ skills: Vec<Skill>, imported: Vec<String>, skipped: Vec<{ id: String, reason: String }> }>
```

行为：
1. 校验 `sourceDir` 存在且是目录。
2. 自动判定形态：源根目录含 `SKILL.md` → 单 skill 模式；否则 → 集合目录模式，遍历一级子目录。
3. 单 skill 模式：源目录名作为 id；目标路径 `~/.config/ai-manager/skills-disabled/<id>/`。
4. 集合目录模式：每个一级子目录视为候选 skill；子目录名作为 id；同样目标到 `skills-disabled/<id>/`。
5. 跳过条件（计入 `skipped` 列表，附 `reason`）：
   - `invalid-id`：id 不符合 `^[a-z0-9-]+$`（与 `validate_skill_id` 一致）。
   - `exists`：`~/.claude/skills/<id>` 或 `skills-disabled/<id>` 已存在。
   - `missing-skill-md`：集合模式下子目录缺 `SKILL.md`。
   - `is-symlink`：源条目是软链接（不复制，避免间接绕过 isManaged 语义）。
6. 复制时跳过软链接条目，避免路径逃逸。
7. 返回完整 `skills` 列表（等同 `get_skills` 的结果）。

### 现有 command 行为变更（按 `isManaged` 分支）

| command | 托管 | 未托管（软链接） |
| --- | --- | --- |
| `toggle_skill` | 现有 `fs::rename` 移动目录 | 同样 `fs::rename` 移动链接节点本身，目标内容不动 |
| `delete_skill` | 现有删除目录 | 仅 `fs::remove_file` 删链接节点，源目标不动 |
| `sync_skill_to_codex` | 现有创建链接到 `~/.claude/skills/<id>` | 先 `canonicalize` 链接，在 `~/.codex/skills/<id>` 创建直指最终目标的新链接 |
| `update_skill` / `add_support_file` / `delete_support_file` | 现有逻辑 | 直接返回错误（前端入口已禁用，后端兜底） |

`get_skills`、`toggle_skill` 等命令的对外入参不变，仅返回值新增字段。

## 前端契约（`src/components/SkillsPage.tsx`）

### 页头按钮（与 MemoryPage 完全对齐）

顺序：`[打开文档] [从目录导入] [刷新]`

- `[从目录导入]`：图标 `FolderInput`，loading 时禁用 + 文案切换。点击 `@tauri-apps/plugin-dialog` 的 `open({ directory: true })` 取目录后 `invoke("import_skills_from_directory")`，Toast 汇总文案 `{imported} 已导入，{skipped} 跳过`。
- `[刷新]`：图标 `RefreshCw`，`aria-busy` 行为同 MemoryPage。
- 订阅 `claude-directory-changed`：`paths` 含 `"skills"` 或 `startsWith("skills/")` 时自动重拉。

### 列表分组（两段式）

```
托管 Skills          ← 启用排前，按 id 排序，混排启用/禁用
  - skill-a (启用)
  - skill-b (禁用)

未托管 Skills        ← 当前唯一形态：软链接接管
  - skill-c [🔗 链接]
```

- 两段都用 `MemoryPage.renderMemoryGroup` 同款的 `<section>` 标题 + 描述。
- 未托管段为空时整段不渲染。
- 两段都为空时显示既有 `EmptyState`。

### `SkillItem` 调整

新增 props：`isManaged`、`linkTarget`。

- 未托管：卡片右上角加徽标，图标 `Link2`，文案 `t("skills.symlinkBadge")`，hover tooltip 显示 `linkTarget`。
- 未托管：编辑按钮 `disabled` + `aria-disabled`，tooltip `t("skills.symlinkNotEditableHint")`。
- 未托管：toggle / sync / delete 正常可用。
- 删除确认框未托管走 `confirm.deleteSymlinkSkillTitle` / `confirm.deleteSymlinkSkillMessage`，强调"仅删链接，不影响源目录"。
- 托管 skill 视觉零变化。

### `SkillEditor` 兜底

防御性 return：在加载时检查 `skill.isManaged === false` 直接关闭抽屉并 Toast 提示。完整只读视图本期不做（入口已堵死，后端也兜底）。

### i18n 新增 key

```
skills.importDirectory, skills.importDirectoryHint,
skills.importingDirectory, skills.importDirectoryDialogTitle,
skills.refresh, skills.refreshing,
skills.group.managed, skills.group.managedDescription,
skills.group.unmanaged, skills.group.unmanagedDescription,
skills.symlinkBadge, skills.symlinkNotEditableHint,
toast.skillRefreshed, toast.skillRefreshError,
toast.skillDirectoryImportSummary, toast.skillDirectoryImportEmpty,
toast.skillDirectoryImportError,
confirm.deleteSymlinkSkillTitle, confirm.deleteSymlinkSkillMessage
```

中英双语都补；i18n 契约测试若未覆盖 skills 段，本次补齐断言。

## 测试

### Rust 单元测试（`src-tauri/src/skills.rs` `#[cfg(test)]`）

利用 `AI_MANAGER_HOME_OVERRIDE` / `AI_MANAGER_APP_DATA_DIR_OVERRIDE` 隔离。

| 测试 | 覆盖点 |
| --- | --- |
| `scan_skills_dir_marks_plain_dir_managed` | 普通目录 `isManaged = true` |
| `scan_skills_dir_marks_symlink_unmanaged` | 软链接到合法 skill → `isManaged = false`，`linkTarget` = canonical 目标 |
| `scan_skills_dir_skips_dangling_symlink` | 目标不存在 → 跳过 |
| `scan_skills_dir_skips_symlink_without_skill_md` | 目标缺 `SKILL.md` → 跳过 |
| `toggle_skill_moves_symlink_node_only` | 软链接 toggle 后链接位置变了，目标不变 |
| `delete_skill_unlinks_symlink_only` | 删除软链接后源目标完整 |
| `update_skill_rejects_symlink` | 后端兜底：未托管不可写 |
| `sync_skill_to_codex_links_to_canonical_target` | codex 同步指向最终目标，不是链套链 |
| `import_skills_from_directory_single_skill` | 源根有 `SKILL.md` → 复制为单 skill |
| `import_skills_from_directory_collection` | 源根无 `SKILL.md` → 批量复制子目录 |
| `import_skills_from_directory_skips_id_conflict` | 同 id 已存在 → `reason: "exists"` |
| `import_skills_from_directory_skips_invalid_id` | 子目录名违规 → `reason: "invalid-id"` |
| `import_skills_from_directory_skips_subdir_without_skill_md` | 集合模式下无 `SKILL.md` 跳过 |
| `import_skills_from_directory_skips_symlink_entry` | 源条目是软链接 → 跳过 |

Symlink 创建：Unix 用 `std::os::unix::fs::symlink`，Windows 用 `std::os::windows::fs::symlink_dir`，复用现有 `sync_skill_to_codex` 的 cfg 分支。

### 前端测试（vitest）

`SkillsPage`：
- 渲染时按 `isManaged` 拆为两个 section，标题文案来自 i18n。
- 未托管 skill 卡片显示 `Link2` 徽标，编辑按钮 `aria-disabled`。
- 「从目录导入」点击后 `invoke` 被以 `import_skills_from_directory` 调用，summary toast 文案占位符正确替换。
- 监听 `claude-directory-changed` 事件含 `skills` 路径时触发 `get_skills`。
- 「刷新」按钮 `aria-busy` 行为与 MemoryPage 同形。

`SkillItem`：未托管 props 下徽标 + 编辑禁用 + 删除走对应 confirm 文案。

### 验证清单（按 `CLAUDE.md`）

前后端契约改动：
```
pnpm biome:ci
pnpm test
pnpm build
cd src-tauri && cargo test
cd src-tauri && cargo clippy -- -D warnings
```

## 实施顺序建议

1. 后端 `Skill` struct 加字段 + `scan_skills_dir` 改造 + 单元测试（不影响前端，可独立验证）。
2. 后端 `import_skills_from_directory` + 单元测试。
3. 后端 `toggle_skill` / `delete_skill` / `sync_skill_to_codex` / `update_skill` 等按 `isManaged` 分支 + 兜底测试。
4. 前端 `Skill` 类型同步 + `SkillsPage` 两段分组 + 页头按钮 + i18n + 前端测试。
5. `SkillItem` 徽标与禁用 + 测试。
6. `SkillEditor` 防御性 return。
7. 全量验证清单跑一遍。

## 风险与权衡

- **放开 symlink 扫描**：与 `.claude/rules/memory-and-skills.md`「扫描 Skills 时不要跟随符号链接」原条款相冲。本次有意放宽：仅"读取链接目标的 `SKILL.md`"+ "记录 canonical 目标路径"，不递归遍历，不允许写入。规则文件需同步更新为"扫描软链接 skill 仅读 `SKILL.md`，写入路径仍按 `isManaged` 拒绝"。
- **canonicalize 的副作用**：`fs::canonicalize` 会解析所有中间链接。若源目标本身又是链接，记录的是最终物理路径，UI 显示与用户预期可能不一致；接受此权衡，因 Codex 同步同样需要最终目标避免链套链。
- **跨文件系统 rename**：`toggle_skill` 在 `~/.claude` 与 `~/.config/ai-manager` 跨设备时会失败。这是现有问题、不在本次范围。
