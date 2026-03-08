# Skills 管理功能实现计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在 AI Manager 中实现 Claude Code Skills 管理功能，支持 CRUD、启用/禁用和支持文件管理。

**Architecture:** 纯文件系统驱动——后端直接操作 `~/.claude/skills/`，无单独数据库。启用/禁用通过目录移动实现（禁用时移至 `~/.config/ai-manager/skills-disabled/`）。前端按照 MemoryPage 模式实现。

**Tech Stack:** Rust (Tauri commands), React 19 + TypeScript, CodeMirror (@uiw/react-codemirror)

---

### Task 1: 在 utils.rs 中添加 SKILLS_LOCK

**Files:**
- Modify: `src-tauri/src/utils.rs`

**Step 1: 在 STATS_LOCK 后添加互斥锁和便捷函数**

```rust
/// Skills 文件操作互斥锁
pub static SKILLS_LOCK: Lazy<Mutex<()>> = Lazy::new(|| Mutex::new(()));

/// 获取 Skills 文件写锁，防止并发写入
pub fn lock_skills() -> Result<MutexGuard<'static, ()>, String> {
    SKILLS_LOCK.lock().map_err(|e| format!("获取锁失败: {}", e))
}
```

在 `src-tauri/src/utils.rs` 第 15 行（`STATS_LOCK` 之后）插入 SKILLS_LOCK 声明，在第 83 行（`lock_stats()` 之后）添加 `lock_skills()` 函数。

**Step 2: 验证编译**

```bash
cd /Users/maguowei/Work/AI/ai-manager/src-tauri && cargo check
```
Expected: `Finished` 无 error

**Step 3: 提交**

```bash
git add src-tauri/src/utils.rs
git commit -m "feat: 添加 SKILLS_LOCK 用于 Skills 文件并发保护"
```

---

### Task 2: 创建 skills.rs — 数据结构和辅助函数

**Files:**
- Create: `src-tauri/src/skills.rs`

**Step 1: 创建文件，写入结构体和路径辅助函数**

```rust
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::time::UNIX_EPOCH;

/// Skill 元数据，对应 ~/.claude/skills/<id>/ 目录
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Skill {
    pub id: String,          // 目录名（唯一标识，也是 /slash-command 名称）
    pub name: String,        // frontmatter name 字段（缺省用 id）
    pub description: String, // frontmatter description
    pub content: String,     // SKILL.md markdown 正文
    pub disable_model_invocation: bool,
    pub user_invocable: bool,
    pub is_active: bool,     // true = ~/.claude/skills/，false = skills-disabled/
    pub created_at: u64,
    pub updated_at: u64,
}

/// 支持文件（SKILL.md 以外的文件）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillFile {
    pub name: String,    // 相对于 Skill 目录的路径，如 "examples.md"
    pub content: String,
}

/// 获取启用 Skills 的根目录：~/.claude/skills/
fn get_skills_dir() -> PathBuf {
    crate::utils::home_dir_or_fallback()
        .join(".claude")
        .join("skills")
}

/// 获取禁用 Skills 的根目录：~/.config/ai-manager/skills-disabled/
fn get_disabled_dir() -> PathBuf {
    crate::utils::get_app_data_dir().join("skills-disabled")
}

/// 根据 is_active 获取 Skill 目录路径
fn get_skill_path(id: &str, is_active: bool) -> PathBuf {
    if is_active {
        get_skills_dir().join(id)
    } else {
        get_disabled_dir().join(id)
    }
}

/// 获取 SKILL.md 文件路径
fn get_skill_md_path(id: &str, is_active: bool) -> PathBuf {
    get_skill_path(id, is_active).join("SKILL.md")
}

/// 从文件系统元数据获取 (created_at, updated_at) 时间戳（秒）
fn get_file_times(path: &std::path::Path) -> (u64, u64) {
    let meta = match fs::metadata(path) {
        Ok(m) => m,
        Err(_) => return (0, 0),
    };
    let created = meta
        .created()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let modified = meta
        .modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_secs())
        .unwrap_or(0);
    (created, modified)
}

/// 解析 SKILL.md 内容，返回 (name, description, disable_model_invocation, user_invocable, content)
fn parse_skill_md(raw: &str) -> (String, String, bool, bool, String) {
    // 检查是否以 "---\n" 开头
    if !raw.starts_with("---\n") {
        return (String::new(), String::new(), false, true, raw.to_string());
    }
    let rest = &raw[4..]; // 跳过 "---\n"
    let end_pos = match rest.find("\n---\n") {
        Some(p) => p,
        None => return (String::new(), String::new(), false, true, raw.to_string()),
    };
    let fm_str = &rest[..end_pos];
    let body = rest[end_pos + 5..].trim_start().to_string();

    let mut name = String::new();
    let mut description = String::new();
    let mut disable_model_invocation = false;
    let mut user_invocable = true;

    for line in fm_str.lines() {
        if let Some((key, val)) = line.split_once(": ") {
            match key.trim() {
                "name" => name = val.trim().to_string(),
                "description" => description = val.trim().to_string(),
                "disable-model-invocation" => {
                    disable_model_invocation = val.trim() == "true"
                }
                "user-invocable" => user_invocable = val.trim() != "false",
                _ => {}
            }
        }
    }

    (name, description, disable_model_invocation, user_invocable, body)
}

/// 将字段序列化为 SKILL.md 文本
fn serialize_skill_md(
    name: &str,
    description: &str,
    disable_model_invocation: bool,
    user_invocable: bool,
    content: &str,
) -> String {
    format!(
        "---\nname: {}\ndescription: {}\ndisable-model-invocation: {}\nuser-invocable: {}\n---\n\n{}",
        name, description, disable_model_invocation, user_invocable, content
    )
}

/// 从指定目录扫描 Skills，返回 Skill 列表
fn scan_skills_dir(dir: &std::path::Path, is_active: bool) -> Vec<Skill> {
    let entries = match fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return vec![],
    };

    let mut skills = vec![];
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let id = match path.file_name().and_then(|n| n.to_str()) {
            Some(n) => n.to_string(),
            None => continue,
        };
        let skill_md = path.join("SKILL.md");
        if !skill_md.exists() {
            continue;
        }
        let raw = match fs::read_to_string(&skill_md) {
            Ok(c) => c,
            Err(_) => continue,
        };
        let (name, description, disable_model_invocation, user_invocable, content) =
            parse_skill_md(&raw);
        let (created_at, updated_at) = get_file_times(&skill_md);

        skills.push(Skill {
            name: if name.is_empty() { id.clone() } else { name },
            id,
            description,
            content,
            disable_model_invocation,
            user_invocable,
            is_active,
            created_at,
            updated_at,
        });
    }

    // 按 id 字典序排序
    skills.sort_by(|a, b| a.id.cmp(&b.id));
    skills
}
```

**Step 2: 验证编译**

```bash
cd /Users/maguowei/Work/AI/ai-manager/src-tauri && cargo check
```
Expected: `Finished` 无 error（此时 skills.rs 尚未在 lib.rs 中注册，可能有 unused warning，忽略）

**Step 3: 提交**

```bash
git add src-tauri/src/skills.rs
git commit -m "feat: skills.rs 数据结构、路径辅助和 SKILL.md 解析器"
```

---

### Task 3: 添加 get_skills 和 toggle_skill 命令

**Files:**
- Modify: `src-tauri/src/skills.rs`（在文件末尾追加）

**Step 1: 追加两个 tauri::command 函数**

```rust
#[tauri::command]
pub fn get_skills() -> Result<Vec<Skill>, String> {
    let mut skills = scan_skills_dir(&get_skills_dir(), true);
    let mut disabled = scan_skills_dir(&get_disabled_dir(), false);
    skills.append(&mut disabled);
    Ok(skills)
}

#[tauri::command]
pub fn toggle_skill(id: String, is_active: bool) -> Result<Skill, String> {
    let _lock = crate::utils::lock_skills()?;

    let src = get_skill_path(&id, is_active);
    let dst_root = if is_active {
        get_disabled_dir()
    } else {
        get_skills_dir()
    };
    let dst = dst_root.join(&id);

    // 确保目标根目录存在
    fs::create_dir_all(&dst_root)
        .map_err(|e| format!("创建目录失败: {}", e))?;

    // 移动目录
    fs::rename(&src, &dst)
        .map_err(|e| format!("移动 Skill 目录失败: {}", e))?;

    // 读取新位置的 SKILL.md 并返回更新后的 Skill
    let new_is_active = !is_active;
    let skill_md = dst.join("SKILL.md");
    let raw = fs::read_to_string(&skill_md)
        .map_err(|e| format!("读取 SKILL.md 失败: {}", e))?;
    let (name, description, disable_model_invocation, user_invocable, content) =
        parse_skill_md(&raw);
    let (created_at, updated_at) = get_file_times(&skill_md);

    Ok(Skill {
        name: if name.is_empty() { id.clone() } else { name },
        id,
        description,
        content,
        disable_model_invocation,
        user_invocable,
        is_active: new_is_active,
        created_at,
        updated_at,
    })
}
```

**Step 2: 验证编译**

```bash
cd /Users/maguowei/Work/AI/ai-manager/src-tauri && cargo check
```
Expected: `Finished` 无 error

**Step 3: 提交**

```bash
git add src-tauri/src/skills.rs
git commit -m "feat: 添加 get_skills 和 toggle_skill 命令"
```

---

### Task 4: 添加 add_skill、update_skill、delete_skill 命令

**Files:**
- Modify: `src-tauri/src/skills.rs`（在文件末尾追加）

**Step 1: 追加三个 tauri::command 函数**

```rust
/// 验证 Skill id（目录名）：仅允许小写字母、数字、连字符
fn validate_skill_id(id: &str) -> Result<(), String> {
    if id.is_empty() {
        return Err("Skill 名称不能为空".to_string());
    }
    if !id.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-') {
        return Err("Skill 名称只能包含小写字母、数字和连字符".to_string());
    }
    Ok(())
}

#[tauri::command]
pub fn add_skill(
    id: String,
    name: String,
    description: String,
    content: String,
    disable_model_invocation: bool,
    user_invocable: bool,
) -> Result<Skill, String> {
    let _lock = crate::utils::lock_skills()?;

    validate_skill_id(&id)?;

    let skill_dir = get_skills_dir().join(&id);
    if skill_dir.exists() {
        return Err(format!("Skill '{}' 已存在", id));
    }

    // 检查禁用目录中是否已有同名
    if get_disabled_dir().join(&id).exists() {
        return Err(format!("Skill '{}' 已存在（已禁用）", id));
    }

    let display_name = if name.is_empty() { id.clone() } else { name.clone() };
    let raw = serialize_skill_md(&display_name, &description, disable_model_invocation, user_invocable, &content);
    let skill_md = skill_dir.join("SKILL.md");
    crate::utils::ensure_dir_and_write(&skill_md, &raw)?;

    let (created_at, updated_at) = get_file_times(&skill_md);

    Ok(Skill {
        id,
        name: display_name,
        description,
        content,
        disable_model_invocation,
        user_invocable,
        is_active: true,
        created_at,
        updated_at,
    })
}

#[tauri::command]
pub fn update_skill(
    id: String,
    is_active: bool,
    name: String,
    description: String,
    content: String,
    disable_model_invocation: bool,
    user_invocable: bool,
) -> Result<Skill, String> {
    let _lock = crate::utils::lock_skills()?;

    let skill_md = get_skill_md_path(&id, is_active);
    if !skill_md.exists() {
        return Err(format!("Skill '{}' 不存在", id));
    }

    let display_name = if name.is_empty() { id.clone() } else { name.clone() };
    let raw = serialize_skill_md(&display_name, &description, disable_model_invocation, user_invocable, &content);
    crate::utils::ensure_dir_and_write(&skill_md, &raw)?;

    let (created_at, updated_at) = get_file_times(&skill_md);

    Ok(Skill {
        id,
        name: display_name,
        description,
        content,
        disable_model_invocation,
        user_invocable,
        is_active,
        created_at,
        updated_at,
    })
}

#[tauri::command]
pub fn delete_skill(id: String, is_active: bool) -> Result<(), String> {
    let _lock = crate::utils::lock_skills()?;

    let skill_dir = get_skill_path(&id, is_active);
    if !skill_dir.exists() {
        return Err(format!("Skill '{}' 不存在", id));
    }

    fs::remove_dir_all(&skill_dir)
        .map_err(|e| format!("删除 Skill 目录失败: {}", e))?;

    Ok(())
}
```

**Step 2: 验证编译**

```bash
cd /Users/maguowei/Work/AI/ai-manager/src-tauri && cargo check
```
Expected: `Finished` 无 error

**Step 3: 提交**

```bash
git add src-tauri/src/skills.rs
git commit -m "feat: 添加 add_skill、update_skill、delete_skill 命令"
```

---

### Task 5: 添加支持文件管理命令

**Files:**
- Modify: `src-tauri/src/skills.rs`（在文件末尾追加）

**Step 1: 追加四个文件管理命令**

```rust
/// 验证支持文件路径：不允许 ".." 和绝对路径
fn validate_file_name(name: &str) -> Result<(), String> {
    if name.is_empty() {
        return Err("文件名不能为空".to_string());
    }
    let path = std::path::Path::new(name);
    if path.is_absolute() {
        return Err("文件名不能是绝对路径".to_string());
    }
    for component in path.components() {
        if matches!(component, std::path::Component::ParentDir) {
            return Err("文件名不能包含 '..'".to_string());
        }
    }
    Ok(())
}

#[tauri::command]
pub fn get_skill_files(id: String, is_active: bool) -> Result<Vec<SkillFile>, String> {
    let skill_dir = get_skill_path(&id, is_active);
    if !skill_dir.exists() {
        return Err(format!("Skill '{}' 不存在", id));
    }

    let mut files = vec![];
    collect_files(&skill_dir, &skill_dir, &mut files)?;

    Ok(files)
}

/// 递归收集目录下除 SKILL.md 外的所有文件
fn collect_files(
    base: &std::path::Path,
    current: &std::path::Path,
    files: &mut Vec<SkillFile>,
) -> Result<(), String> {
    let entries = fs::read_dir(current)
        .map_err(|e| format!("读取目录失败: {}", e))?;

    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            collect_files(base, &path, files)?;
        } else {
            // 跳过 SKILL.md
            let rel = path.strip_prefix(base).map_err(|e| e.to_string())?;
            if rel == std::path::Path::new("SKILL.md") {
                continue;
            }
            let name = rel.to_string_lossy().to_string();
            let content = fs::read_to_string(&path).unwrap_or_default();
            files.push(SkillFile { name, content });
        }
    }

    Ok(())
}

#[tauri::command]
pub fn add_skill_file(
    id: String,
    is_active: bool,
    file_name: String,
    content: String,
) -> Result<SkillFile, String> {
    let _lock = crate::utils::lock_skills()?;

    validate_file_name(&file_name)?;

    let file_path = get_skill_path(&id, is_active).join(&file_name);
    if file_path.exists() {
        return Err(format!("文件 '{}' 已存在", file_name));
    }

    crate::utils::ensure_dir_and_write(&file_path, &content)?;

    Ok(SkillFile { name: file_name, content })
}

#[tauri::command]
pub fn update_skill_file(
    id: String,
    is_active: bool,
    file_name: String,
    content: String,
) -> Result<SkillFile, String> {
    let _lock = crate::utils::lock_skills()?;

    validate_file_name(&file_name)?;

    let file_path = get_skill_path(&id, is_active).join(&file_name);
    crate::utils::ensure_dir_and_write(&file_path, &content)?;

    Ok(SkillFile { name: file_name, content })
}

#[tauri::command]
pub fn delete_skill_file(
    id: String,
    is_active: bool,
    file_name: String,
) -> Result<(), String> {
    let _lock = crate::utils::lock_skills()?;

    validate_file_name(&file_name)?;

    let file_path = get_skill_path(&id, is_active).join(&file_name);
    if !file_path.exists() {
        return Err(format!("文件 '{}' 不存在", file_name));
    }

    fs::remove_file(&file_path)
        .map_err(|e| format!("删除文件失败: {}", e))?;

    // 若父目录（非 skill 根目录）为空，则删除父目录
    if let Some(parent) = file_path.parent() {
        let skill_root = get_skill_path(&id, is_active);
        if parent != skill_root {
            if let Ok(mut entries) = fs::read_dir(parent) {
                if entries.next().is_none() {
                    let _ = fs::remove_dir(parent);
                }
            }
        }
    }

    Ok(())
}
```

**Step 2: 验证编译**

```bash
cd /Users/maguowei/Work/AI/ai-manager/src-tauri && cargo check
```
Expected: `Finished` 无 error

**Step 3: 提交**

```bash
git add src-tauri/src/skills.rs
git commit -m "feat: 添加 Skill 支持文件管理命令（CRUD）"
```

---

### Task 6: 在 lib.rs 中注册 skills 模块和所有命令

**Files:**
- Modify: `src-tauri/src/lib.rs`

**Step 1: 在文件顶部添加模块声明**

在 `mod stats;` 后添加：
```rust
mod skills;
```

**Step 2: 添加 use 导入**

在 `use stats::{...};` 后添加：
```rust
use skills::{
    get_skills, add_skill, update_skill, delete_skill, toggle_skill,
    get_skill_files, add_skill_file, update_skill_file, delete_skill_file,
};
```

**Step 3: 在 generate_handler! 中注册**

在 `take_stats_snapshot` 后添加：
```rust
get_skills,
add_skill,
update_skill,
delete_skill,
toggle_skill,
get_skill_files,
add_skill_file,
update_skill_file,
delete_skill_file,
```

**Step 4: 验证编译**

```bash
cd /Users/maguowei/Work/AI/ai-manager/src-tauri && cargo check
```
Expected: `Finished` 无 error 无 warning

**Step 5: 提交**

```bash
git add src-tauri/src/lib.rs
git commit -m "feat: 在 lib.rs 中注册 skills 模块和所有命令"
```

---

### Task 7: 前端类型定义和 i18n 翻译键

**Files:**
- Modify: `src/types.ts`
- Modify: `src/i18n.ts`

**Step 1: 在 types.ts 末尾追加 Skill 相关类型**

```typescript
// Skill 条目
export interface Skill {
  id: string;
  name: string;
  description: string;
  content: string;
  disableModelInvocation: boolean;
  userInvocable: boolean;
  isActive: boolean;
  createdAt: number;
  updatedAt: number;
}

// Skill 支持文件
export interface SkillFile {
  name: string;
  content: string;
}
```

**Step 2: 在 i18n.ts 的中文翻译 `"memory.toolbar.boldPlaceholder"` 键之后，`},` 之前添加**

```typescript
    // Skills 页面（补充）
    "skills.addSkill": "添加 Skill",
    "skills.editTitle": "编辑 Skill",
    "skills.addTitle": "添加 Skill",
    "skills.name": "Skill 名称（目录名）",
    "skills.namePlaceholder": "如：my-skill（小写字母、数字、连字符）",
    "skills.nameHint": "名称将作为 /slash-command 和目录名，创建后不可更改",
    "skills.descriptionLabel": "描述",
    "skills.descriptionPlaceholder": "描述 Skill 的用途和触发条件",
    "skills.content": "内容（Markdown）",
    "skills.contentPlaceholder": "输入 Skill 指令...",
    "skills.disableModelInvocation": "仅手动触发 (disable-model-invocation)",
    "skills.disableModelInvocationHint": "启用后 Claude 不会自动加载此 Skill，只能手动用 /skill-name 调用",
    "skills.userInvocable": "允许手动调用 (user-invocable)",
    "skills.userInvocableHint": "禁用后此 Skill 不出现在 / 菜单中，仅 Claude 可自动调用",
    "skills.enabled": "已启用",
    "skills.disabled": "已禁用",
    "skills.editing": "编辑中",
    "skills.delete": "删除",
    "skills.empty": "暂无 Skills",
    "skills.emptyHint": "点击右上角 + 按钮添加 Skill，保存到 ~/.claude/skills/",
    "skills.save": "保存",
    "skills.files": "支持文件",
    "skills.addFile": "添加文件",
    "skills.fileName": "文件名",
    "skills.fileNamePlaceholder": "如：examples.md 或 scripts/helper.sh",
    "skills.fileContent": "文件内容",
    "skills.editFile": "编辑文件",
    "skills.deleteFile": "删除文件",
    "skills.cancelEdit": "取消",
    "skills.saveFile": "保存文件",
    "confirm.deleteSkillTitle": "删除 Skill",
    "confirm.deleteSkillMessage": "确定要删除此 Skill 吗？此操作将删除整个目录，无法撤销。",
    "confirm.deleteSkillFileTitle": "删除文件",
    "confirm.deleteSkillFileMessage": "确定要删除此文件吗？此操作无法撤销。",
    "toast.skillLoadError": "加载 Skills 失败",
    "toast.skillAdded": "Skill 已添加",
    "toast.skillAddError": "添加 Skill 失败",
    "toast.skillSaved": "Skill 已保存",
    "toast.skillSaveError": "保存 Skill 失败",
    "toast.skillDeleted": "Skill 已删除",
    "toast.skillDeleteError": "删除 Skill 失败",
    "toast.skillToggleError": "切换 Skill 状态失败",
    "toast.skillFileAdded": "文件已添加",
    "toast.skillFileAddError": "添加文件失败",
    "toast.skillFileSaved": "文件已保存",
    "toast.skillFileSaveError": "保存文件失败",
    "toast.skillFileDeleted": "文件已删除",
    "toast.skillFileDeleteError": "删除文件失败",
```

**Step 3: 在英文翻译对应位置（`"memory.toolbar.boldPlaceholder"` 之后）添加英文翻译**

```typescript
    // Skills page (additions)
    "skills.addSkill": "Add Skill",
    "skills.editTitle": "Edit Skill",
    "skills.addTitle": "Add Skill",
    "skills.name": "Skill Name (directory name)",
    "skills.namePlaceholder": "e.g. my-skill (lowercase, numbers, hyphens)",
    "skills.nameHint": "Used as /slash-command and directory name. Cannot be changed after creation.",
    "skills.descriptionLabel": "Description",
    "skills.descriptionPlaceholder": "Describe what this skill does and when to use it",
    "skills.content": "Content (Markdown)",
    "skills.contentPlaceholder": "Enter skill instructions...",
    "skills.disableModelInvocation": "Manual invocation only (disable-model-invocation)",
    "skills.disableModelInvocationHint": "Prevents Claude from automatically loading this skill",
    "skills.userInvocable": "Allow manual invocation (user-invocable)",
    "skills.userInvocableHint": "If disabled, skill is hidden from / menu and only Claude can invoke it",
    "skills.enabled": "Enabled",
    "skills.disabled": "Disabled",
    "skills.editing": "Editing",
    "skills.delete": "Delete",
    "skills.empty": "No Skills",
    "skills.emptyHint": "Click + to add a Skill saved to ~/.claude/skills/",
    "skills.save": "Save",
    "skills.files": "Supporting Files",
    "skills.addFile": "Add File",
    "skills.fileName": "File Name",
    "skills.fileNamePlaceholder": "e.g. examples.md or scripts/helper.sh",
    "skills.fileContent": "File Content",
    "skills.editFile": "Edit File",
    "skills.deleteFile": "Delete File",
    "skills.cancelEdit": "Cancel",
    "skills.saveFile": "Save File",
    "confirm.deleteSkillTitle": "Delete Skill",
    "confirm.deleteSkillMessage": "Are you sure you want to delete this Skill? This will remove the entire directory and cannot be undone.",
    "confirm.deleteSkillFileTitle": "Delete File",
    "confirm.deleteSkillFileMessage": "Are you sure you want to delete this file? This cannot be undone.",
    "toast.skillLoadError": "Failed to load Skills",
    "toast.skillAdded": "Skill added",
    "toast.skillAddError": "Failed to add Skill",
    "toast.skillSaved": "Skill saved",
    "toast.skillSaveError": "Failed to save Skill",
    "toast.skillDeleted": "Skill deleted",
    "toast.skillDeleteError": "Failed to delete Skill",
    "toast.skillToggleError": "Failed to toggle Skill status",
    "toast.skillFileAdded": "File added",
    "toast.skillFileAddError": "Failed to add file",
    "toast.skillFileSaved": "File saved",
    "toast.skillFileSaveError": "Failed to save file",
    "toast.skillFileDeleted": "File deleted",
    "toast.skillFileDeleteError": "Failed to delete file",
```

**Step 4: 提交**

```bash
git add src/types.ts src/i18n.ts
git commit -m "feat: 添加 Skill/SkillFile 类型定义和 i18n 翻译键"
```

---

### Task 8: 创建 SkillItem 组件

**Files:**
- Create: `src/components/SkillItem.tsx`
- Create: `src/components/SkillItem.css`

**Step 1: 创建 SkillItem.tsx**

```tsx
import { MouseEvent } from "react";
import { Skill } from "../types";
import { useI18n } from "../i18n";
import "./SkillItem.css";

interface SkillItemProps {
  skill: Skill;
  isEditing: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

function SkillItem({ skill, isEditing, onToggle, onEdit, onDelete }: SkillItemProps) {
  const { t } = useI18n();

  function handleActionClick(e: MouseEvent<HTMLElement>, action: () => void) {
    e.stopPropagation();
    action();
  }

  return (
    <div
      className={`skill-item${skill.isActive ? " active" : ""}${isEditing ? " editing" : ""}`}
      onClick={onEdit}
    >
      <div className="skill-header">
        <div className="skill-badge">
          <span className="badge-text">
            {skill.name ? skill.name.charAt(0).toUpperCase() : "S"}
          </span>
        </div>

        <div className="skill-info">
          <h3 className="skill-name">{skill.name}</h3>
          <span className="skill-id">/{skill.id}</span>
        </div>

        <div className="skill-header-actions">
          {isEditing && (
            <span className="skill-status editing">{t("skills.editing")}</span>
          )}
          <button
            className={`skill-toggle${skill.isActive ? " enabled" : ""}`}
            onClick={(e) => handleActionClick(e, onToggle)}
            title={skill.isActive ? t("skills.enabled") : t("skills.disabled")}
          >
            <span className="toggle-track">
              <span className="toggle-thumb" />
            </span>
            <span className="toggle-label">
              {skill.isActive ? t("skills.enabled") : t("skills.disabled")}
            </span>
          </button>
        </div>
      </div>

      {skill.description && (
        <p className="skill-description">{skill.description}</p>
      )}

      <div className="skill-actions">
        <button
          className="skill-action-btn delete"
          onClick={(e) => handleActionClick(e, onDelete)}
          title={t("skills.delete")}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          </svg>
        </button>
      </div>
    </div>
  );
}

export default SkillItem;
```

**Step 2: 创建 SkillItem.css**

```css
.skill-item {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: 14px 16px;
  background-color: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  cursor: pointer;
  transition: all 220ms ease;
}

.skill-item:hover {
  background-color: var(--bg-tertiary);
  border-color: var(--border-default);
  box-shadow: var(--shadow-sm);
}

.skill-item.active {
  background-color: var(--accent-green-bg);
  border-color: var(--accent-green);
}

.skill-item.editing {
  border-color: var(--accent-orange);
  box-shadow: 0 0 12px rgba(247, 129, 102, 0.2);
}

.skill-header {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.skill-badge {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: linear-gradient(135deg, var(--bg-tertiary), var(--bg-elevated));
  flex-shrink: 0;
}

.skill-badge .badge-text {
  font-size: var(--font-md);
  font-weight: 600;
  color: var(--text-primary);
}

.skill-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.skill-name {
  font-size: var(--font-md);
  font-weight: 600;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.skill-id {
  font-size: var(--font-xs);
  color: var(--text-muted);
  font-family: "SF Mono", Monaco, monospace;
}

.skill-header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.skill-status.editing {
  display: inline-flex;
  align-items: center;
  padding: 6px 10px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 600;
  background-color: var(--accent-orange-bg);
  color: var(--accent-orange);
}

.skill-toggle {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border: none;
  border-radius: 8px;
  background-color: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 160ms ease;
  font-size: var(--font-sm);
  font-weight: 500;
}

.skill-toggle:hover {
  background-color: var(--bg-hover);
  color: var(--text-primary);
}

.toggle-track {
  position: relative;
  width: 34px;
  height: 18px;
  border-radius: 999px;
  background-color: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  transition: all 0.2s ease;
  flex-shrink: 0;
  display: block;
}

.skill-toggle.enabled .toggle-track {
  background-color: var(--accent-green);
  border-color: var(--accent-green);
}

.toggle-thumb {
  position: absolute;
  top: 1px;
  left: 1px;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background-color: #fff;
  transition: transform 0.2s ease;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
  display: block;
}

.skill-toggle.enabled .toggle-thumb {
  transform: translateX(16px);
}

.toggle-label {
  white-space: nowrap;
}

.skill-description {
  margin: 0;
  font-size: var(--font-sm);
  line-height: 1.45;
  color: var(--text-secondary);
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
}

.skill-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  opacity: 0;
  transform: translateX(6px);
  transition: opacity 180ms ease, transform 180ms ease;
}

.skill-item:hover .skill-actions {
  opacity: 1;
  transform: translateX(0);
}

.skill-action-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 8px;
  background-color: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 160ms ease;
}

.skill-action-btn.delete:hover {
  background-color: rgba(248, 81, 73, 0.14);
  color: var(--accent-red);
}
```

**Step 3: 提交**

```bash
git add src/components/SkillItem.tsx src/components/SkillItem.css
git commit -m "feat: 添加 SkillItem 组件"
```

---

### Task 9: 创建 SkillEditor 组件

**Files:**
- Create: `src/components/SkillEditor.tsx`
- Create: `src/components/SkillEditor.css`

**Step 1: 创建 SkillEditor.tsx**

```tsx
import { useState, useRef, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import CodeMirror, { ReactCodeMirrorRef } from "@uiw/react-codemirror";
import { markdown } from "@codemirror/lang-markdown";
import { EditorView } from "@codemirror/view";
import { Skill, SkillFile } from "../types";
import { useI18n } from "../i18n";
import { useToast } from "../hooks/useToast";
import useEditorTheme from "../hooks/useEditorTheme";
import CollapsibleSection from "./CollapsibleSection";
import ConfirmDialog from "./ConfirmDialog";
import "./SkillEditor.css";

interface SkillEditorProps {
  skill: Skill | null; // null = 新建模式
  onSave: (skill: Skill) => void;
  onClose: () => void;
}

function SkillEditor({ skill, onSave, onClose }: SkillEditorProps) {
  const { t } = useI18n();
  const { showToast } = useToast();
  const editorRef = useRef<ReactCodeMirrorRef>(null);
  const editorTheme = useEditorTheme();

  // 基本信息字段
  const [id, setId] = useState(skill?.id ?? "");
  const [name, setName] = useState(skill?.name ?? "");
  const [description, setDescription] = useState(skill?.description ?? "");
  const [content, setContent] = useState(skill?.content ?? "");
  const [disableModelInvocation, setDisableModelInvocation] = useState(
    skill?.disableModelInvocation ?? false
  );
  const [userInvocable, setUserInvocable] = useState(
    skill?.userInvocable ?? true
  );

  // 支持文件
  const [files, setFiles] = useState<SkillFile[]>([]);
  const [filesLoaded, setFilesLoaded] = useState(false);
  const [editingFile, setEditingFile] = useState<string | null>(null); // 正在编辑的文件名
  const [editingFileContent, setEditingFileContent] = useState("");
  const [showAddFile, setShowAddFile] = useState(false);
  const [newFileName, setNewFileName] = useState("");
  const [newFileContent, setNewFileContent] = useState("");
  const [pendingDeleteFile, setPendingDeleteFile] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const isEditing = skill !== null;

  // 懒加载支持文件（仅编辑模式）
  async function loadFiles() {
    if (!skill || filesLoaded) return;
    try {
      const result = await invoke<SkillFile[]>("get_skill_files", {
        id: skill.id,
        isActive: skill.isActive,
      });
      setFiles(result);
      setFilesLoaded(true);
    } catch (err) {
      showToast(t("toast.skillLoadError"), "error");
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isEditing && !id.trim()) return;
    setIsSaving(true);
    try {
      let saved: Skill;
      if (isEditing) {
        saved = await invoke<Skill>("update_skill", {
          id: skill.id,
          isActive: skill.isActive,
          name: name.trim(),
          description: description.trim(),
          content,
          disableModelInvocation,
          userInvocable,
        });
        showToast(t("toast.skillSaved"));
      } else {
        saved = await invoke<Skill>("add_skill", {
          id: id.trim(),
          name: name.trim(),
          description: description.trim(),
          content,
          disableModelInvocation,
          userInvocable,
        });
        showToast(t("toast.skillAdded"));
      }
      onSave(saved);
    } catch (err) {
      showToast(
        isEditing ? t("toast.skillSaveError") : t("toast.skillAddError"),
        "error"
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function handleAddFile() {
    if (!skill || !newFileName.trim()) return;
    try {
      const file = await invoke<SkillFile>("add_skill_file", {
        id: skill.id,
        isActive: skill.isActive,
        fileName: newFileName.trim(),
        content: newFileContent,
      });
      setFiles((prev) => [...prev, file]);
      setNewFileName("");
      setNewFileContent("");
      setShowAddFile(false);
      showToast(t("toast.skillFileAdded"));
    } catch (err) {
      showToast(t("toast.skillFileAddError"), "error");
    }
  }

  async function handleSaveFile(fileName: string) {
    if (!skill) return;
    try {
      const file = await invoke<SkillFile>("update_skill_file", {
        id: skill.id,
        isActive: skill.isActive,
        fileName,
        content: editingFileContent,
      });
      setFiles((prev) => prev.map((f) => (f.name === fileName ? file : f)));
      setEditingFile(null);
      showToast(t("toast.skillFileSaved"));
    } catch (err) {
      showToast(t("toast.skillFileSaveError"), "error");
    }
  }

  async function handleDeleteFile(fileName: string) {
    if (!skill) return;
    try {
      await invoke("delete_skill_file", {
        id: skill.id,
        isActive: skill.isActive,
        fileName,
      });
      setFiles((prev) => prev.filter((f) => f.name !== fileName));
      showToast(t("toast.skillFileDeleted"));
    } catch (err) {
      showToast(t("toast.skillFileDeleteError"), "error");
    }
  }

  function startEditFile(file: SkillFile) {
    setEditingFile(file.name);
    setEditingFileContent(file.content);
  }

  const canSave = isEditing
    ? !isSaving
    : id.trim().length > 0 && !isSaving;

  return (
    <div className="skill-drawer-container">
      <div className="skill-modal" role="dialog" aria-modal="true">
        <form onSubmit={handleSubmit}>
          {/* 头部 */}
          <div className="skill-modal-header">
            <button
              type="button"
              className="skill-back-btn"
              onClick={onClose}
              aria-label={t("common.close")}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
            <h2>{isEditing ? t("skills.editTitle") : t("skills.addTitle")}</h2>
            <button type="submit" className="skill-save-btn" disabled={!canSave}>
              {t("skills.save")}
            </button>
          </div>

          {/* 正文 */}
          <div className="skill-modal-body">
            {/* 大徽章 */}
            <div className="skill-badge-large">
              <span>{(isEditing ? skill.name : id) ? (isEditing ? skill.name : id).charAt(0).toUpperCase() : "S"}</span>
            </div>

            {/* Skill 名称（id）：新建时可编辑，编辑时只读 */}
            <div className="form-group">
              <label htmlFor="skill-id" className="label-required">
                <span>{t("skills.name")}</span>
                <span className="required-badge">{t("form.required")}</span>
              </label>
              {isEditing ? (
                <input
                  id="skill-id"
                  type="text"
                  value={skill.id}
                  readOnly
                  className="input-readonly"
                />
              ) : (
                <input
                  id="skill-id"
                  type="text"
                  value={id}
                  onChange={(e) => setId(e.target.value)}
                  placeholder={t("skills.namePlaceholder")}
                  required
                />
              )}
              <span className="field-hint">{t("skills.nameHint")}</span>
            </div>

            {/* 显示名称（可选） */}
            <div className="form-group">
              <label htmlFor="skill-name">{t("skills.name").split("（")[0]}</label>
              <input
                id="skill-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={isEditing ? skill.id : id || t("skills.namePlaceholder")}
              />
            </div>

            {/* 描述 */}
            <div className="form-group">
              <label htmlFor="skill-description">{t("skills.descriptionLabel")}</label>
              <textarea
                id="skill-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t("skills.descriptionPlaceholder")}
                rows={3}
              />
            </div>

            {/* 高级开关 */}
            <div className="form-group skill-checkboxes">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={disableModelInvocation}
                  onChange={(e) => setDisableModelInvocation(e.target.checked)}
                />
                <span>{t("skills.disableModelInvocation")}</span>
              </label>
              <p className="field-hint">{t("skills.disableModelInvocationHint")}</p>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={userInvocable}
                  onChange={(e) => setUserInvocable(e.target.checked)}
                />
                <span>{t("skills.userInvocable")}</span>
              </label>
              <p className="field-hint">{t("skills.userInvocableHint")}</p>
            </div>

            {/* 内容编辑器 */}
            <div className="form-group">
              <label>{t("skills.content")}</label>
              <div className="skill-editor-wrap">
                <CodeMirror
                  ref={editorRef}
                  value={content}
                  onChange={setContent}
                  extensions={[markdown(), EditorView.lineWrapping]}
                  theme={editorTheme}
                  placeholder={t("skills.contentPlaceholder")}
                  basicSetup={{
                    lineNumbers: true,
                    bracketMatching: false,
                    indentOnInput: false,
                    foldGutter: false,
                  }}
                />
              </div>
            </div>

            {/* 支持文件区（仅编辑模式） */}
            {isEditing && (
              <CollapsibleSection
                title={t("skills.files")}
                badge={files.length}
              >
                <div className="skill-files-section" onClick={loadFiles}>
                  {/* 文件列表 */}
                  {files.map((file) => (
                    <div key={file.name} className="skill-file-item">
                      {editingFile === file.name ? (
                        <div className="skill-file-editor">
                          <div className="skill-file-editor-header">
                            <span className="skill-file-name">{file.name}</span>
                            <div className="skill-file-editor-actions">
                              <button
                                type="button"
                                className="file-btn cancel"
                                onClick={() => setEditingFile(null)}
                              >
                                {t("skills.cancelEdit")}
                              </button>
                              <button
                                type="button"
                                className="file-btn save"
                                onClick={() => handleSaveFile(file.name)}
                              >
                                {t("skills.saveFile")}
                              </button>
                            </div>
                          </div>
                          <textarea
                            className="skill-file-textarea"
                            value={editingFileContent}
                            onChange={(e) => setEditingFileContent(e.target.value)}
                            rows={8}
                          />
                        </div>
                      ) : (
                        <div className="skill-file-row">
                          <span className="skill-file-name">{file.name}</span>
                          <div className="skill-file-row-actions">
                            <button
                              type="button"
                              className="file-btn edit"
                              onClick={() => startEditFile(file)}
                            >
                              {t("skills.editFile")}
                            </button>
                            <button
                              type="button"
                              className="file-btn delete"
                              onClick={() => setPendingDeleteFile(file.name)}
                            >
                              {t("skills.deleteFile")}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}

                  {/* 添加文件表单 */}
                  {showAddFile ? (
                    <div className="skill-add-file-form">
                      <input
                        type="text"
                        className="skill-file-name-input"
                        placeholder={t("skills.fileNamePlaceholder")}
                        value={newFileName}
                        onChange={(e) => setNewFileName(e.target.value)}
                      />
                      <textarea
                        className="skill-file-textarea"
                        placeholder={t("skills.fileContent")}
                        value={newFileContent}
                        onChange={(e) => setNewFileContent(e.target.value)}
                        rows={6}
                      />
                      <div className="skill-add-file-actions">
                        <button
                          type="button"
                          className="file-btn cancel"
                          onClick={() => { setShowAddFile(false); setNewFileName(""); setNewFileContent(""); }}
                        >
                          {t("skills.cancelEdit")}
                        </button>
                        <button
                          type="button"
                          className="file-btn save"
                          onClick={handleAddFile}
                          disabled={!newFileName.trim()}
                        >
                          {t("skills.saveFile")}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="skill-add-file-btn"
                      onClick={() => setShowAddFile(true)}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                      </svg>
                      {t("skills.addFile")}
                    </button>
                  )}
                </div>
              </CollapsibleSection>
            )}
          </div>
        </form>

        {/* 删除文件确认 */}
        {pendingDeleteFile && (
          <ConfirmDialog
            title={t("confirm.deleteSkillFileTitle")}
            message={t("confirm.deleteSkillFileMessage")}
            confirmText={t("confirm.delete")}
            cancelText={t("confirm.cancel")}
            danger
            onConfirm={() => {
              handleDeleteFile(pendingDeleteFile);
              setPendingDeleteFile(null);
            }}
            onCancel={() => setPendingDeleteFile(null)}
          />
        )}
      </div>
    </div>
  );
}

export default SkillEditor;
```

**Step 2: 创建 SkillEditor.css**

```css
/* 复用 MemoryEditor.css 中 .memory-drawer-container / .memory-modal 等模式 */
.skill-drawer-container {
  width: 100%;
  height: 100%;
  min-height: 0;
}

.skill-modal {
  width: 100%;
  height: 100%;
  background-color: var(--bg-elevated);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.skill-modal form {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.skill-modal-header {
  height: 56px;
  padding: 0 var(--space-6);
  border-bottom: 1px solid var(--border-default);
  background-color: var(--bg-primary);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  flex-shrink: 0;
}

.skill-modal-header h2 {
  flex: 1;
  font-size: var(--font-lg);
  font-weight: 600;
  color: var(--text-primary);
}

.skill-back-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: var(--radius-md);
  background-color: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 150ms ease;
}

.skill-back-btn:hover {
  background-color: var(--bg-hover);
  color: var(--text-primary);
}

.skill-save-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 8px 16px;
  border: none;
  border-radius: var(--radius-md);
  background-color: var(--accent-blue);
  color: #fff;
  font-size: var(--font-base);
  font-weight: 600;
  cursor: pointer;
  transition: all 150ms ease;
}

.skill-save-btn:hover:not(:disabled) {
  background-color: var(--accent-blue-hover);
  transform: translateY(-1px);
}

.skill-save-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.skill-modal-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  padding: var(--space-6);
}

.skill-badge-large {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 64px;
  height: 64px;
  border-radius: 16px;
  background-color: var(--bg-tertiary);
  color: var(--text-secondary);
  font-size: 20px;
  font-weight: 600;
  margin: 0 auto;
}

.skill-modal .form-group {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.skill-modal .form-group label {
  font-size: var(--font-base);
  font-weight: 500;
  color: var(--text-primary);
}

.skill-modal .label-required {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.skill-modal .required-badge {
  display: inline-flex;
  align-items: center;
  padding: 1px 6px;
  border-radius: 999px;
  background-color: var(--accent-red-bg);
  color: var(--accent-red);
  font-size: var(--font-xs);
  font-weight: 600;
}

.skill-modal .form-group input,
.skill-modal .form-group textarea {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  background-color: var(--bg-primary);
  color: var(--text-primary);
  font-size: var(--font-base);
  transition: all 150ms ease;
  box-sizing: border-box;
}

.skill-modal .form-group input::placeholder,
.skill-modal .form-group textarea::placeholder {
  color: var(--text-muted);
}

.skill-modal .form-group input:focus,
.skill-modal .form-group textarea:focus {
  outline: none;
  border-color: var(--accent-blue);
  box-shadow: 0 0 0 3px var(--accent-blue-bg);
}

.input-readonly {
  opacity: 0.6;
  cursor: default;
  font-family: "SF Mono", Monaco, monospace;
  font-size: var(--font-sm) !important;
}

.field-hint {
  font-size: var(--font-xs);
  color: var(--text-muted);
  margin: 0;
  line-height: 1.4;
}

.skill-checkboxes {
  gap: var(--space-1) !important;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--font-base);
  color: var(--text-primary);
  cursor: pointer;
}

.checkbox-label input[type="checkbox"] {
  width: auto !important;
  padding: 0 !important;
  margin: 0;
  flex-shrink: 0;
}

.skill-editor-wrap {
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  overflow: hidden;
}

.skill-editor-wrap:focus-within {
  border-color: var(--accent-blue);
  box-shadow: 0 0 0 3px var(--accent-blue-bg);
}

.skill-editor-wrap .cm-editor {
  font-size: 13px;
  line-height: 1.6;
  min-height: 300px;
}

.skill-editor-wrap .cm-editor.cm-focused {
  outline: none;
}

.skill-editor-wrap .cm-scroller {
  font-family: "SF Mono", Monaco, "Cascadia Code", monospace;
  overflow: auto !important;
}

/* 支持文件区域 */
.skill-files-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.skill-file-item {
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  overflow: hidden;
}

.skill-file-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  gap: 8px;
}

.skill-file-name {
  font-size: var(--font-sm);
  color: var(--text-primary);
  font-family: "SF Mono", Monaco, monospace;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.skill-file-row-actions {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}

.skill-file-editor {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.skill-file-editor-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  background-color: var(--bg-secondary);
  border-bottom: 1px solid var(--border-color);
}

.skill-file-editor-actions {
  display: flex;
  gap: 6px;
}

.skill-file-textarea {
  width: 100%;
  padding: 10px 12px;
  border: none;
  background-color: var(--bg-primary);
  color: var(--text-primary);
  font-size: 13px;
  font-family: "SF Mono", Monaco, monospace;
  line-height: 1.5;
  resize: vertical;
  box-sizing: border-box;
}

.skill-file-textarea:focus {
  outline: none;
}

.file-btn {
  padding: 4px 10px;
  border-radius: 6px;
  font-size: var(--font-xs);
  font-weight: 500;
  cursor: pointer;
  transition: all 120ms ease;
  border: 1px solid transparent;
}

.file-btn.edit {
  background-color: var(--bg-secondary);
  color: var(--text-secondary);
  border-color: var(--border-color);
}

.file-btn.edit:hover {
  color: var(--text-primary);
  border-color: var(--border-default);
}

.file-btn.save {
  background-color: var(--accent-blue);
  color: #fff;
}

.file-btn.save:hover:not(:disabled) {
  background-color: var(--accent-blue-hover);
}

.file-btn.save:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.file-btn.cancel {
  background-color: var(--bg-secondary);
  color: var(--text-secondary);
  border-color: var(--border-color);
}

.file-btn.delete {
  background-color: transparent;
  color: var(--accent-red);
  border-color: transparent;
}

.file-btn.delete:hover {
  background-color: rgba(248, 81, 73, 0.1);
}

.skill-add-file-form {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  border: 1px dashed var(--border-default);
  border-radius: var(--radius-md);
}

.skill-file-name-input {
  padding: 8px 12px;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  background-color: var(--bg-primary);
  color: var(--text-primary);
  font-size: var(--font-sm);
  font-family: "SF Mono", Monaco, monospace;
}

.skill-file-name-input:focus {
  outline: none;
  border-color: var(--accent-blue);
}

.skill-add-file-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.skill-add-file-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  border: 1px dashed var(--border-default);
  border-radius: var(--radius-md);
  background-color: transparent;
  color: var(--text-secondary);
  font-size: var(--font-sm);
  cursor: pointer;
  transition: all 150ms ease;
  width: 100%;
  justify-content: center;
}

.skill-add-file-btn:hover {
  background-color: var(--bg-secondary);
  color: var(--text-primary);
  border-color: var(--border-default);
}
```

**Step 3: 提交**

```bash
git add src/components/SkillEditor.tsx src/components/SkillEditor.css
git commit -m "feat: 添加 SkillEditor 组件（含支持文件管理）"
```

---

### Task 10: 替换 SkillsPage.tsx 为完整实现

**Files:**
- Modify: `src/components/SkillsPage.tsx`（完整替换）
- Create: `src/components/SkillsPage.css`（如需额外样式）

**Step 1: 完整替换 SkillsPage.tsx**

```tsx
import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Skill } from "../types";
import { useI18n } from "../i18n";
import { useToast } from "../hooks/useToast";
import SkillItem from "./SkillItem";
import SkillEditor from "./SkillEditor";
import ConfirmDialog from "./ConfirmDialog";
import useEscapeKey from "../hooks/useEscapeKey";
import "./MemoryPage.css"; // 复用相同布局样式

function SkillsPage({ onDrawerChange }: { onDrawerChange?: (isOpen: boolean) => void }) {
  const { t } = useI18n();
  const { showToast } = useToast();
  const [skills, setSkills] = useState<Skill[]>([]);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [editingSkill, setEditingSkill] = useState<Skill | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const loadSkills = useCallback(async () => {
    try {
      const list = await invoke<Skill[]>("get_skills");
      setSkills(list);
    } catch {
      showToast(t("toast.skillLoadError"), "error");
    }
  }, [showToast, t]);

  useEffect(() => {
    loadSkills();
  }, [loadSkills]);

  // ESC 关闭抽屉
  useEscapeKey(
    useCallback(() => {
      setEditingSkill(null);
      setIsDrawerOpen(false);
      onDrawerChange?.(false);
    }, [onDrawerChange]),
    isDrawerOpen
  );

  async function handleToggle(skill: Skill) {
    try {
      const toggled = await invoke<Skill>("toggle_skill", {
        id: skill.id,
        isActive: skill.isActive,
      });
      setSkills((prev) => prev.map((s) => (s.id === toggled.id ? toggled : s)));
    } catch {
      showToast(t("toast.skillToggleError"), "error");
    }
  }

  async function handleDelete(id: string) {
    const skill = skills.find((s) => s.id === id);
    if (!skill) return;
    try {
      await invoke("delete_skill", { id, isActive: skill.isActive });
      setSkills((prev) => prev.filter((s) => s.id !== id));
      showToast(t("toast.skillDeleted"));
    } catch {
      showToast(t("toast.skillDeleteError"), "error");
    }
  }

  function handleSave(saved: Skill) {
    setSkills((prev) => {
      const exists = prev.some((s) => s.id === saved.id);
      return exists
        ? prev.map((s) => (s.id === saved.id ? saved : s))
        : [...prev, saved];
    });
    closeDrawer();
  }

  function openAdd() {
    setEditingSkill(null);
    setIsDrawerOpen(true);
    onDrawerChange?.(true);
  }

  function openEdit(skill: Skill) {
    setEditingSkill(skill);
    setIsDrawerOpen(true);
    onDrawerChange?.(true);
  }

  function closeDrawer() {
    setEditingSkill(null);
    setIsDrawerOpen(false);
    onDrawerChange?.(false);
  }

  // 将启用的 Skill 排在前面，同状态内按 id 字典序
  const sortedSkills = [...skills].sort((a, b) => {
    if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
    return a.id.localeCompare(b.id);
  });

  return (
    <div className="memory-page">
      {/* 页面标题 */}
      <div className="page-header">
        <h1 className="page-title">{t("skills.title")}</h1>
      </div>

      {/* 添加按钮 */}
      <button className="add-config-btn" onClick={openAdd}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
        <span>{t("skills.addSkill")}</span>
      </button>

      {/* Skills 列表 */}
      {sortedSkills.length === 0 ? (
        <div className="memory-empty">
          <div className="empty-icon">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
            </svg>
          </div>
          <p className="empty-text">{t("skills.empty")}</p>
          <p className="empty-hint">{t("skills.emptyHint")}</p>
        </div>
      ) : (
        <div className="memory-list">
          {sortedSkills.map((skill) => (
            <SkillItem
              key={skill.id}
              skill={skill}
              isEditing={isDrawerOpen && editingSkill?.id === skill.id}
              onToggle={() => handleToggle(skill)}
              onEdit={() => openEdit(skill)}
              onDelete={() => setPendingDeleteId(skill.id)}
            />
          ))}
        </div>
      )}

      {/* 删除确认 */}
      {pendingDeleteId && (
        <ConfirmDialog
          title={t("confirm.deleteSkillTitle")}
          message={t("confirm.deleteSkillMessage")}
          confirmText={t("confirm.delete")}
          cancelText={t("confirm.cancel")}
          danger
          onConfirm={() => {
            handleDelete(pendingDeleteId);
            setPendingDeleteId(null);
          }}
          onCancel={() => setPendingDeleteId(null)}
        />
      )}

      {/* 编辑抽屉 */}
      {isDrawerOpen && (
        <>
          <div className="drawer-overlay visible" onClick={closeDrawer} />
          <div className="drawer open">
            <SkillEditor
              skill={editingSkill}
              onSave={handleSave}
              onClose={closeDrawer}
            />
          </div>
        </>
      )}
    </div>
  );
}

export default SkillsPage;
```

**Step 2: 验证 TypeScript 编译**

```bash
cd /Users/maguowei/Work/AI/ai-manager && pnpm build 2>&1 | head -30
```
Expected: 构建成功，无 TypeScript error

**Step 3: 提交**

```bash
git add src/components/SkillsPage.tsx
git commit -m "feat: 实现 SkillsPage 完整功能（列表、新建、编辑、删除、开关）"
```

---

### Task 11: 端到端验证

**Step 1: 启动开发模式**

```bash
cd /Users/maguowei/Work/AI/ai-manager && pnpm tauri dev
```

**Step 2: 验证列表页**
- 点击侧边栏 Skills 图标 → 显示 Skills 页面（空状态时显示闪电图标和提示文字）

**Step 3: 验证新建 Skill**
- 点击 + 按钮 → 打开抽屉
- 填写 id=`test-skill`，description=`A test skill`，content=`Test content`
- 点击保存 → toast 显示"Skill 已添加"
- 验证文件系统：`ls ~/.claude/skills/test-skill/`（应有 SKILL.md）
- 验证 SKILL.md 内容：`cat ~/.claude/skills/test-skill/SKILL.md`

**Step 4: 验证编辑 Skill**
- 点击列表中的 Skill → 打开编辑抽屉，字段预填充
- 修改 description → 保存 → toast 显示"Skill 已保存"

**Step 5: 验证禁用/启用**
- 点击启用/禁用开关 → 状态切换
- 验证文件系统：禁用后 `ls ~/.config/ai-manager/skills-disabled/test-skill/` 存在，`~/.claude/skills/test-skill/` 不存在
- 再次点击开关启用 → 目录移回 `~/.claude/skills/`

**Step 6: 验证支持文件**
- 编辑 Skill → 展开"支持文件"区域 → 点击"添加文件"
- 填写 filename=`examples.md`，content=`Example content`，保存
- 验证：`cat ~/.claude/skills/test-skill/examples.md`
- 编辑文件内容 → 保存 → 验证内容更新
- 删除文件 → 确认删除 → 文件从列表消失

**Step 7: 验证删除 Skill**
- 悬停 SkillItem → 出现删除按钮 → 点击 → ConfirmDialog → 确认
- toast 显示"Skill 已删除"，列表中移除
- 验证文件系统：`ls ~/.claude/skills/` 中已无该目录

**Step 8: 在 Claude Code 中验证 Skill 可调用**
- 打开 Claude Code 终端
- 输入 `/test-skill` → Claude 应执行 Skill 内容

**Step 9: 提交验证结果**

如所有验证通过：
```bash
git add -A
git commit -m "feat: Skills 管理功能完整实现"
```
