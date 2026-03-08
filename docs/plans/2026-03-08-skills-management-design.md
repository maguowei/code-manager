# Skills 管理功能设计

## Context

AI Manager 是一个 Claude Code 配置管理桌面应用，已支持配置管理和记忆管理。
Claude Code Skills 是扩展 Claude 能力的提示词文件，每个 Skill 存储在独立目录下，包含 `SKILL.md`（YAML frontmatter + markdown 内容）和可选的支持文件。
本设计实现 Skills 管理功能，让用户通过 GUI 管理 `~/.claude/skills/` 下的个人 Skills。

## 范围

- **管理目标**：仅个人 Skills（`~/.claude/skills/`）
- **支持文件**：支持管理 Skill 目录下的支持文件（examples.md、reference.md、scripts/ 等）
- **启用/禁用**：通过目录移动实现（禁用时移至 `~/.config/ai-manager/skills-disabled/`）
- **编辑方式**：Frontmatter 字段用表单，markdown 内容用代码编辑器

## 数据存储

```
~/.claude/skills/                           # 启用的 Skills（Claude Code 扫描路径）
└── my-skill/
    ├── SKILL.md                            # 必须，frontmatter + 正文
    ├── examples.md                         # 可选支持文件
    └── scripts/helper.sh                  # 可选脚本

~/.config/ai-manager/skills-disabled/       # 禁用的 Skills（移出扫描范围）
└── disabled-skill/
    └── SKILL.md
```

### SKILL.md 格式

```yaml
---
name: my-skill
description: What it does and when to use it
disable-model-invocation: false
user-invocable: true
---

Markdown content here...
```

## 类型定义（src/types.ts 新增）

```typescript
interface Skill {
  id: string           // 目录名（全局唯一标识）
  name: string         // frontmatter name（缺省用目录名）
  description: string  // frontmatter description
  content: string      // SKILL.md markdown 正文
  disable_model_invocation: boolean
  user_invocable: boolean
  is_active: boolean   // true = ~/.claude/skills/，false = skills-disabled/
  created_at: number
  updated_at: number
}

interface SkillFile {
  name: string         // 相对于 Skill 目录的路径
  content: string
}
```

## 后端模块（src-tauri/src/skills.rs）

### Rust 结构体

```rust
pub struct Skill {
    pub id: String,
    pub name: String,
    pub description: String,
    pub content: String,
    pub disable_model_invocation: bool,
    pub user_invocable: bool,
    pub is_active: bool,
    pub created_at: u64,
    pub updated_at: u64,
}
```

### 命令列表

| 命令 | 参数 | 说明 |
|------|------|------|
| `get_skills` | - | 扫描两个目录，返回所有 Skill 元数据（不含文件列表） |
| `add_skill` | name, description, content, disable_model_invocation, user_invocable | 创建目录 + SKILL.md |
| `update_skill` | id, is_active, name, description, content, ... | 更新 SKILL.md；name 变化时重命名目录 |
| `delete_skill` | id, is_active | 递归删除对应目录 |
| `toggle_skill` | id, is_active | 移动目录实现启用/禁用 |
| `get_skill_files` | id, is_active | 递归列出目录下除 SKILL.md 外的所有文件+内容 |
| `add_skill_file` | id, is_active, file_name, content | 新增支持文件（创建父目录） |
| `update_skill_file` | id, is_active, file_name, content | 覆写文件内容 |
| `delete_skill_file` | id, is_active, file_name | 删除文件（若所在目录为空则删目录） |

### 关键实现细节

- `get_skills` 读取 SKILL.md 时解析 frontmatter：找到第一个 `---` 和第二个 `---`，中间为 frontmatter，之后为正文
- `created_at` / `updated_at` 使用文件系统的 metadata 时间戳
- 并发保护：新增全局 `SKILLS_LOCK`（类似 `MEMORY_LOCK`），注册到 `utils.rs`
- 文件路径安全：验证 file_name 不含 `..`，防止路径穿越

## 前端组件

### 组件结构

```
src/components/
├── SkillsPage.tsx          # 主页面（替换现有占位符）
├── SkillItem.tsx           # 列表项
└── SkillEditor.tsx         # 编辑抽屉（新建/编辑）
```

### SkillsPage.tsx

- 挂载时调用 `get_skills()` 获取列表
- 顶部"新建 Skill"按钮 → 打开 SkillEditor（新建模式）
- 点击列表项 → 打开 SkillEditor（编辑模式）
- 启用/禁用开关 → 直接调用 `toggle_skill()`

### SkillItem.tsx

- 显示徽章（name 首字母）
- 显示 name + description 预览
- 启用/禁用开关（参考 MemoryItem）
- 编辑/删除按钮

### SkillEditor.tsx（右侧抽屉）

分三个区块（均用 CollapsibleSection）：

1. **基本信息区**（默认展开）
   - name 输入框（目录名，创建后不可编辑）
   - description 文本框
   - disable-model-invocation 复选框
   - user-invocable 复选框

2. **内容编辑区**（默认展开）
   - CodeMirror markdown 编辑器（复用 DefaultsSection 的透明 textarea 方案）

3. **支持文件区**（默认折叠）
   - 文件列表（打开 SkillEditor 时懒加载 `get_skill_files()`）
   - 每项显示文件名 + 编辑/删除按钮
   - "新增文件"按钮 → 内联弹窗（文件名输入 + 内容编辑器）

## 数据流

```
挂载 → get_skills() → 渲染列表
点击新建 → SkillEditor（新建模式）
  → 填写信息 → add_skill() → 更新本地 state → toast
点击列表项 → SkillEditor（编辑模式）
  → get_skill_files()（懒加载）→ 渲染支持文件
  → 编辑保存 → update_skill() → 更新本地 state → toast
切换开关 → toggle_skill() → 更新本地 state
点击删除 → ConfirmDialog → delete_skill() → 更新本地 state
```

## 验证方式

1. 运行 `pnpm tauri dev`
2. 切换到 Skills 页面，验证列表正常显示
3. 新建 Skill，验证 `~/.claude/skills/<name>/SKILL.md` 文件被创建
4. 在 Claude Code 中运行 `/skill-name`，验证 Skill 可被调用
5. 禁用 Skill，验证目录移至 `~/.config/ai-manager/skills-disabled/`
6. 添加支持文件，验证文件在 Skill 目录下被正确创建
7. 删除 Skill，验证目录被清理
