# Skills 页：目录与软链接 Skill 设计文档

- 创建日期：2026-05-11
- 更新日期：2026-05-11
- 适用模块：`src/components/SkillsPage.tsx`、`src/components/SkillEditor.tsx`、`src/components/SkillItem.tsx`、`src-tauri/src/skills.rs`
- 相关规则：`.claude/rules/memory-and-skills.md`、`.claude/rules/frontend-ui.md`、`.claude/rules/tauri-backend.md`

## 背景

Skills 页需要同时展示 `~/.claude/skills/` 与应用禁用目录里的 Skill。项目尚未正式发布，本设计不保留旧的“托管 / 未托管”兼容概念，统一用文件系统来源表达能力边界：普通本地目录与目录级软链接。

## 目标

- 列表使用单一分组展示全部 Skill，卡片标记“本地目录”或“软链接”。
- 普通目录 Skill 可在应用内编辑 `SKILL.md`。
- 软链接 Skill 可打开同一个编辑抽屉，但字段与 Markdown 编辑器只读，并明确提示软链接不支持应用内修改。
- 支持文件仅展示只读目录文件树，不提供新增、编辑、删除或内容读取。
- 提供外部编辑器打开按钮：普通目录打开 Skill 目录，软链接打开真实目标目录。

## 数据模型

`Skill` 运行时类型使用下列来源字段：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `isSymlink` | `boolean` | `true` 表示该 Skill 是目录级软链接 |
| `linkTarget` | `string \| null` | 软链接最终目标路径；普通目录为 `null` |

旧字段 `isManaged` 已移除。UI 不再根据“托管 / 未托管”分组或判断能力。

## 后端契约

### 扫描逻辑

- 普通目录：读取目录内 `SKILL.md`，返回 `isSymlink = false` 与 `linkTarget = null`。
- 目录级软链接：仅读取目标目录的 `SKILL.md`，返回 `isSymlink = true` 与 canonical 目标路径。
- 悬空软链接、非目录目标、缺少 `SKILL.md` 的目标跳过。
- 不递归读取软链接 Skill 的支持文件。

### 文件树

`get_skill_file_tree(id, isActive) -> SkillFileTreeEntry[]`

仅返回普通目录 Skill 的只读展示信息：

| 字段 | 说明 |
| --- | --- |
| `path` | 相对 Skill 根目录路径 |
| `kind` | `file` 或 `directory` |
| `size` | 文件大小；目录为 `0` |
| `isBinary` | 文件是否看起来是二进制内容 |

文件树跳过 `SKILL.md` 与目录内软链接，不返回文件内容。

### 外部编辑器

`open_skill_in_editor(id, isActive)` 根据默认编辑器配置打开目录：

- 普通目录：打开当前 Skill 根目录。
- 软链接：打开 canonical 目标目录。
- 未配置默认编辑器或启动失败时返回错误，由前端 Toast 提示。

### 已移除命令

应用不再提供支持文件写入能力，以下命令与前端调用均已移除：

- `add_skill_file`
- `update_skill_file`
- `delete_skill_file`
- 旧的支持文件内容读取接口

## 前端契约

### 列表

- 单一列表展示全部 Skill，启用项优先，再按 id 排序。
- 卡片展示名称、描述、`/id`、启用状态、来源标记、同步、删除、打开编辑器。
- 点击卡片打开编辑抽屉；普通目录可编辑，软链接只读。
- 卡片内按钮必须阻止事件冒泡，避免触发编辑抽屉。

### 编辑抽屉

- 新建 Skill 只创建 `SKILL.md`。
- 普通目录 Skill：字段与 Markdown 编辑器可编辑，保存只写 `SKILL.md`。
- 软链接 Skill：字段、启用项与 Markdown 编辑器全部禁用，不展示可用保存动作，并显示软链接目标。
- 支持文件区域只展示只读文件树与“打开编辑器”入口。

## 测试重点

- 普通目录与软链接扫描字段。
- 文件树跳过 `SKILL.md`、目录内软链接，且不读取支持文件内容。
- 外部编辑器打开普通目录与软链接真实目标路径。
- 前端统一列表、来源标记、按钮不冒泡。
- 软链接抽屉只读提示与控件禁用。
- 普通目录抽屉可编辑，支持文件树只读展示。

## 验证清单

```
pnpm biome:ci
pnpm test
pnpm build
cd src-tauri && cargo test
cd src-tauri && cargo clippy -- -D warnings
```
