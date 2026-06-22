# Claude 多配置启动命令 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在配置卡片新增"复制启动命令"按钮，点击弹出 Dialog，提供 `claude --settings "<文件路径>"`（完整配置）与 `claude --settings '{"env":{...}}'`（仅 env）两种命令，实现 Claude 多配置并行运行。

**Architecture:** 后端新增 `prepare_profile_launch` command：复用 `resolve_profile_settings` 把完整配置原子写入 `~/.config/code-manager/launch/<id>.settings.json`，并返回该路径 + 仅含 env 的紧凑 JSON；`delete_profile` 同步清理该文件。前端用纯函数 helper 把后端返回值拼成两条 POSIX shell 命令，在 shadcn Dialog 中展示、复制并附使用说明。

**Tech Stack:** Rust + Tauri command + tauri-specta；React 19 + TypeScript + shadcn Dialog + Tailwind v4；Vitest + Rust `#[cfg(test)]`。

参考设计文档：`docs/superpowers/specs/2026-06-22-claude-multi-config-launch-command-design.md`

---

## 文件结构

- 修改 `src-tauri/src/config.rs`：新增 `ProfileLaunchPayload` 结构体、`launch_settings_dir()` / `launch_settings_path()` / `build_env_only_json()` 辅助函数、`prepare_profile_launch` command；在 `delete_profile` 中追加 launch 文件清理；新增对应单元测试。
- 修改 `src-tauri/src/lib.rs`：在 `collect_commands![]` 注册 `prepare_profile_launch`。
- 重新生成 `src/bindings.ts`（`make bindings`，自动生成文件，不手改）。
- 创建 `src/components/profile-launch-utils.ts`：纯函数 `buildLaunchCommands` + 类型。
- 创建 `src/components/__tests__/profile-launch-utils.test.ts`：helper 单元测试。
- 修改 `src/i18n.ts`：新增中英文案 key。
- 修改 `src/components/ProfilesPage.tsx`：新增按钮、Dialog、状态与处理函数。

---

## Task 1: 后端 `prepare_profile_launch` command 与辅助函数

**Files:**
- Modify: `src-tauri/src/config.rs`（结构体/辅助函数加在 `preview_profile` 附近约 2548 行之前；command 加在 `preview_profile` 之后）
- Test: `src-tauri/src/config.rs`（`#[cfg(test)] mod tests` 内，约 3100 行附近）

- [ ] **Step 1: 写失败的单元测试**

加到 `src-tauri/src/config.rs` 测试模块内（紧跟 `profile_settings_path_is_always_user_level` 测试之后）：

```rust
    #[test]
    fn prepare_profile_launch_writes_file_and_env_only_json() {
        let _guard = crate::utils::lock_config().unwrap();
        let root = temp_root("prepare-launch");
        set_test_env(&root);

        // 写入一个带 env 的配置到 registry
        let mut registry = ConfigRegistry::default();
        registry.profiles.push(sample_profile(
            "p1",
            None,
            serde_json::json!({
                "model": "claude-opus-4-1",
                "env": {
                    "ANTHROPIC_AUTH_TOKEN": "tok-123",
                    "ANTHROPIC_BASE_URL": "https://api.example.com",
                    "EMPTY_VALUE": ""
                }
            }),
        ));
        save_registry(&registry).unwrap();

        let payload = prepare_profile_launch("p1".to_string()).unwrap();

        // 1) 文件已落盘，内容是完整 resolve 后 settings（含 model 与 env）
        let written = std::fs::read_to_string(&payload.settings_path).unwrap();
        let parsed: Value = serde_json::from_str(&written).unwrap();
        assert_eq!(parsed["model"], Value::String("claude-opus-4-1".to_string()));
        assert_eq!(
            parsed["env"]["ANTHROPIC_AUTH_TOKEN"],
            Value::String("tok-123".to_string())
        );

        // 2) 路径在应用数据目录的 launch 子目录下
        assert!(payload
            .settings_path
            .replace('\\', "/")
            .contains("/code-manager/launch/p1.settings.json"));

        // 3) env_only_json 只含 env 块，丢弃空字符串值，不含 model
        let inline: Value = serde_json::from_str(&payload.env_only_json).unwrap();
        assert_eq!(
            inline["env"]["ANTHROPIC_AUTH_TOKEN"],
            Value::String("tok-123".to_string())
        );
        assert_eq!(
            inline["env"]["ANTHROPIC_BASE_URL"],
            Value::String("https://api.example.com".to_string())
        );
        assert!(inline["env"].get("EMPTY_VALUE").is_none());
        assert!(inline.get("model").is_none());

        clear_test_env();
    }

    #[test]
    fn prepare_profile_launch_errors_for_missing_profile() {
        let _guard = crate::utils::lock_config().unwrap();
        let root = temp_root("prepare-launch-missing");
        set_test_env(&root);

        let result = prepare_profile_launch("does-not-exist".to_string());
        assert!(result.is_err());

        clear_test_env();
    }
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd src-tauri && cargo test prepare_profile_launch 2>&1 | tail -20`
Expected: 编译失败，提示 `cannot find function prepare_profile_launch` / `ProfileLaunchPayload`。

- [ ] **Step 3: 实现结构体与辅助函数**

在 `src-tauri/src/config.rs` 中 `preview_profile` command（约 2546 行 `#[tauri::command]` 之前）插入：

```rust
/// 多配置启动命令的返回载荷：配置文件绝对路径 + 仅含 env 的紧凑 JSON。
#[derive(Debug, Clone, Serialize, PartialEq, Eq, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ProfileLaunchPayload {
    /// 写入磁盘的完整 settings 文件绝对路径，供 `claude --settings "<path>"` 使用。
    pub settings_path: String,
    /// 仅含 env 块的紧凑单行 JSON，供 `claude --settings '<json>'` 内联使用。
    pub env_only_json: String,
}

/// 多配置启动用的 settings 文件目录：应用数据目录下的 launch 子目录。
fn launch_settings_dir() -> Result<PathBuf, String> {
    Ok(crate::utils::get_app_data_dir_strict()?.join("launch"))
}

/// 单个配置的 launch settings 文件路径。id 来自 registry 中已存在的配置（后端生成的 UUID），无路径逃逸风险。
fn launch_settings_path(id: &str) -> Result<PathBuf, String> {
    Ok(launch_settings_dir()?.join(format!("{id}.settings.json")))
}

/// 从完整 resolve 后 settings 中抽取仅含 env 块的紧凑 JSON，
/// 只保留非空字符串值，丢弃 $schema/model/permissions 等其它字段。
fn build_env_only_json(resolved: &Value) -> Result<String, String> {
    let mut env_map = Map::new();
    if let Some(env) = resolved.get("env").and_then(Value::as_object) {
        for (key, value) in env {
            if let Some(text) = value.as_str() {
                if !text.trim().is_empty() {
                    env_map.insert(key.clone(), Value::String(text.to_string()));
                }
            }
        }
    }
    let mut root = Map::new();
    root.insert("env".to_string(), Value::Object(env_map));
    serde_json::to_string(&Value::Object(root)).map_err(|e| e.to_string())
}
```

- [ ] **Step 4: 实现 `prepare_profile_launch` command**

紧接 Step 3 的代码之后、`preview_profile` command 之前插入：

```rust
#[tauri::command]
#[specta::specta]
pub fn prepare_profile_launch(id: String) -> Result<ProfileLaunchPayload, String> {
    let result = (|| {
        let _lock = crate::utils::lock_config()?;
        let registry = load_registry()?;
        let profile = registry
            .profiles
            .iter()
            .find(|profile| profile.id == id)
            .ok_or_else(|| format!("未找到 profile '{}'", id))?;

        let resolved = resolve_profile_settings(profile)?;
        let env_only_json = build_env_only_json(&resolved)?;
        let target_path = launch_settings_path(&profile.id)?;
        let content = serde_json::to_string_pretty(&resolved).map_err(|e| e.to_string())?;
        crate::utils::ensure_dir_and_write_atomic(&target_path, &content)?;

        Ok(ProfileLaunchPayload {
            settings_path: target_path.to_string_lossy().to_string(),
            env_only_json,
        })
    })();
    // 注意：payload 含密钥，只记录 profile_id，不记录内容
    crate::logging::log_command_result("profile.prepare_launch", &result, |_| {
        format!("profile_id={id}")
    });
    result
}
```

- [ ] **Step 5: 运行测试确认通过**

Run: `cd src-tauri && cargo test prepare_profile_launch 2>&1 | tail -20`
Expected: `prepare_profile_launch_writes_file_and_env_only_json` 与 `prepare_profile_launch_errors_for_missing_profile` 均 PASS。

- [ ] **Step 6: 提交**

```bash
git add src-tauri/src/config.rs
git commit -m "feat(config): 新增 prepare_profile_launch 生成多配置启动载荷"
```

---

## Task 2: `delete_profile` 清理 launch 文件

**Files:**
- Modify: `src-tauri/src/config.rs:2473`（`delete_profile` command）
- Test: `src-tauri/src/config.rs`（测试模块内）

- [ ] **Step 1: 写失败的单元测试**

加到测试模块内：

```rust
    #[test]
    fn delete_profile_removes_launch_settings_file() {
        let _guard = crate::utils::lock_config().unwrap();
        let root = temp_root("delete-launch");
        set_test_env(&root);

        let mut registry = ConfigRegistry::default();
        registry
            .profiles
            .push(sample_profile("p1", None, serde_json::json!({ "env": { "K": "v" } })));
        save_registry(&registry).unwrap();

        // 先生成 launch 文件
        let payload = prepare_profile_launch("p1".to_string()).unwrap();
        assert!(std::path::Path::new(&payload.settings_path).exists());

        // 直接调用清理辅助函数（command 需要 AppHandle，单测里只验证文件清理逻辑）
        remove_launch_settings_file("p1");
        assert!(!std::path::Path::new(&payload.settings_path).exists());

        clear_test_env();
    }
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd src-tauri && cargo test delete_profile_removes_launch_settings_file 2>&1 | tail -20`
Expected: 编译失败，提示 `cannot find function remove_launch_settings_file`。

- [ ] **Step 3: 实现清理辅助函数**

在 Task 1 的 `launch_settings_path` 函数之后插入：

```rust
/// 删除单个配置的 launch settings 文件，best-effort（文件不存在不报错）。
fn remove_launch_settings_file(id: &str) {
    if let Ok(path) = launch_settings_path(id) {
        let _ = std::fs::remove_file(path);
    }
}
```

- [ ] **Step 4: 在 `delete_profile` 中调用清理**

修改 `src-tauri/src/config.rs` 的 `delete_profile`（约 2473 行），在 `remove_profile_bindings(...)` 之后、`save_registry(&registry)?;` 之前插入一行：

```rust
        remove_profile_bindings(&mut registry.bindings, &id);
        remove_launch_settings_file(&id);
        save_registry(&registry)?;
```

- [ ] **Step 5: 运行测试确认通过**

Run: `cd src-tauri && cargo test launch 2>&1 | tail -20`
Expected: 本任务测试与 Task 1 测试均 PASS。

- [ ] **Step 6: 提交**

```bash
git add src-tauri/src/config.rs
git commit -m "feat(config): 删除配置时清理多配置启动文件"
```

---

## Task 3: 注册 command 并生成 bindings

**Files:**
- Modify: `src-tauri/src/lib.rs:34`（import 列表）与 `collect_commands![]`（约 93 行 `preview_profile` 附近）
- Generated: `src/bindings.ts`（由 `make bindings` 生成，不手改）

- [ ] **Step 1: 在 import 列表加入函数名**

修改 `src-tauri/src/lib.rs` 顶部 config 模块 `use` 列表（约 32-35 行），把 `prepare_profile_launch` 加入（按字母序紧邻 `preview_profile` 之前）：

```rust
    preview_profile, preview_profile_export, preview_profile_import, prepare_profile_launch,
    reorder_profiles,
```

（仅需把 `prepare_profile_launch` 名字补进现有 `use crate::config::{...}` 块，保持其它项不变。）

- [ ] **Step 2: 在 `collect_commands![]` 注册**

在 `src-tauri/src/lib.rs` 的 `tauri_specta::collect_commands![]` 中，`preview_profile,`（约 93 行）之后插入：

```rust
            preview_profile,
            prepare_profile_launch,
```

- [ ] **Step 3: 生成 bindings 并校验**

Run: `make bindings && make bindings-check`
Expected: `src/bindings.ts` 更新，包含 `prepareProfileLaunch` 与 `ProfileLaunchPayload` 类型；`bindings-check` 通过（无漂移）。

- [ ] **Step 4: 确认 Rust 编译通过**

Run: `make check 2>&1 | tail -15`
Expected: 编译通过，无错误。

- [ ] **Step 5: 提交**

```bash
git add src-tauri/src/lib.rs src/bindings.ts
git commit -m "feat(ipc): 注册 prepare_profile_launch 并生成 bindings"
```

---

## Task 4: 前端命令拼接纯函数 helper

**Files:**
- Create: `src/components/profile-launch-utils.ts`
- Test: `src/components/__tests__/profile-launch-utils.test.ts`

- [ ] **Step 1: 写失败的测试**

创建 `src/components/__tests__/profile-launch-utils.test.ts`：

```ts
import { describe, expect, it } from "vitest";
import { buildLaunchCommands } from "../profile-launch-utils";

describe("buildLaunchCommands", () => {
  it("文件路径式：用双引号包裹路径", () => {
    const { filePathCommand } = buildLaunchCommands({
      settingsPath: "/Users/dev/.config/code-manager/launch/p1.settings.json",
      envOnlyJson: '{"env":{}}',
    });
    expect(filePathCommand).toBe(
      'claude --settings "/Users/dev/.config/code-manager/launch/p1.settings.json"',
    );
  });

  it("文件路径含空格与特殊字符时转义", () => {
    const { filePathCommand } = buildLaunchCommands({
      settingsPath: "/Users/My Name/launch/$p1.json",
      envOnlyJson: "{}",
    });
    expect(filePathCommand).toBe('claude --settings "/Users/My Name/launch/\\$p1.json"');
  });

  it("内联式：用单引号包裹紧凑 JSON", () => {
    const { inlineJsonCommand } = buildLaunchCommands({
      settingsPath: "/tmp/p1.json",
      envOnlyJson: '{"env":{"ANTHROPIC_AUTH_TOKEN":"tok"}}',
    });
    expect(inlineJsonCommand).toBe(
      `claude --settings '{"env":{"ANTHROPIC_AUTH_TOKEN":"tok"}}'`,
    );
  });

  it("内联 JSON 含单引号时按 POSIX 规则转义", () => {
    const { inlineJsonCommand } = buildLaunchCommands({
      settingsPath: "/tmp/p1.json",
      envOnlyJson: `{"env":{"X":"a'b"}}`,
    });
    expect(inlineJsonCommand).toBe(`claude --settings '{"env":{"X":"a'\\''b"}}'`);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm exec vitest run src/components/__tests__/profile-launch-utils.test.ts`
Expected: FAIL —— 找不到模块 `../profile-launch-utils`。

- [ ] **Step 3: 实现 helper**

创建 `src/components/profile-launch-utils.ts`：

```ts
/// 多配置启动命令拼接工具。仅面向 POSIX shell（bash/zsh），与现有 copy-env 的 export 约定一致。

/// 后端 prepare_profile_launch 返回的载荷（settingsPath + envOnlyJson）。
export interface LaunchCommandInput {
  settingsPath: string;
  envOnlyJson: string;
}

/// 拼接好的两条启动命令。
export interface LaunchCommands {
  filePathCommand: string;
  inlineJsonCommand: string;
}

// 双引号字符串内的 POSIX 转义：反斜杠、双引号、美元符、反引号。
function quoteDouble(value: string): string {
  return `"${value.replace(/(["\\$`])/g, "\\$1")}"`;
}

// 单引号字符串内嵌单引号的 POSIX 写法：' -> '\''。
function quoteSingle(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

/// 由后端载荷拼出文件路径式与内联 JSON 式两条 claude 启动命令。
export function buildLaunchCommands(input: LaunchCommandInput): LaunchCommands {
  return {
    filePathCommand: `claude --settings ${quoteDouble(input.settingsPath)}`,
    inlineJsonCommand: `claude --settings ${quoteSingle(input.envOnlyJson)}`,
  };
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm exec vitest run src/components/__tests__/profile-launch-utils.test.ts`
Expected: 4 个用例全部 PASS。

- [ ] **Step 5: 提交**

```bash
git add src/components/profile-launch-utils.ts src/components/__tests__/profile-launch-utils.test.ts
git commit -m "feat(profiles): 新增多配置启动命令拼接 helper"
```

---

## Task 5: i18n 文案

**Files:**
- Modify: `src/i18n.ts`（中文块约 265 行 / 327 行附近，英文块约 1830 行 / 1895 行附近）

- [ ] **Step 1: 新增中文 key**

在 `src/i18n.ts` 中文块 `"profiles.actions.copyEnv": "复制环境变量",`（约 265 行）之后插入：

```ts
    "profiles.actions.copyLaunchCommand": "复制启动命令",
    "profiles.launchDialog.title": "复制 Claude 启动命令",
    "profiles.launchDialog.description":
      "用 claude --settings 启动一个独立配置，不改动全局 ~/.claude/settings.json，可在不同终端并行运行多套配置。",
    "profiles.launchDialog.filePathLabel": "配置文件路径式（推荐）",
    "profiles.launchDialog.filePathHint": "命令简洁、不会把密钥写入 shell 历史，且保留完整配置（model、权限、插件等）。",
    "profiles.launchDialog.inlineJsonLabel": "内联 JSON 式",
    "profiles.launchDialog.inlineJsonHint": "自包含、不落额外文件，仅含 env；注意密钥会进入 shell 历史。",
    "profiles.launchDialog.copy": "复制",
    "profiles.launchDialog.usageTitle": "如何使用",
    "profiles.launchDialog.usageStep1": "打开一个新终端窗口或标签页。",
    "profiles.launchDialog.usageStep2": "粘贴上面任意一条命令并回车。",
    "profiles.launchDialog.usageStep3": "该终端即以此配置运行 Claude，与其它终端互不干扰。",
    "profiles.launchDialog.loadError": "生成启动命令失败，请重试。",
```

并在中文块 `"profiles.toast.envCopyError": "复制环境变量失败",`（约 328 行）之后插入：

```ts
    "profiles.toast.launchCommandCopied": "启动命令已复制",
    "profiles.toast.launchCommandError": "复制启动命令失败",
```

- [ ] **Step 2: 新增英文 key**

在 `src/i18n.ts` 英文块 `"profiles.actions.copyEnv": "Copy env vars",`（约 1830 行）之后插入：

```ts
    "profiles.actions.copyLaunchCommand": "Copy launch command",
    "profiles.launchDialog.title": "Copy Claude launch command",
    "profiles.launchDialog.description":
      "Launch a standalone config with claude --settings without touching the global ~/.claude/settings.json, so you can run multiple configs in parallel across terminals.",
    "profiles.launchDialog.filePathLabel": "Settings file path (recommended)",
    "profiles.launchDialog.filePathHint": "Clean command, keeps secrets out of shell history, and preserves the full config (model, permissions, plugins).",
    "profiles.launchDialog.inlineJsonLabel": "Inline JSON",
    "profiles.launchDialog.inlineJsonHint": "Self-contained with no extra file, env only; note the secrets land in shell history.",
    "profiles.launchDialog.copy": "Copy",
    "profiles.launchDialog.usageTitle": "How to use",
    "profiles.launchDialog.usageStep1": "Open a new terminal window or tab.",
    "profiles.launchDialog.usageStep2": "Paste either command above and press Enter.",
    "profiles.launchDialog.usageStep3": "That terminal runs Claude with this config, isolated from others.",
    "profiles.launchDialog.loadError": "Failed to generate the launch command. Please retry.",
```

并在英文块 `"profiles.toast.envCopyError": "Failed to copy env vars",`（约 1896 行）之后插入：

```ts
    "profiles.toast.launchCommandCopied": "Launch command copied",
    "profiles.toast.launchCommandError": "Failed to copy launch command",
```

- [ ] **Step 3: 运行 i18n 一致性测试**

Run: `pnpm exec vitest run src/i18n.test.tsx`
Expected: PASS（中英 key 集合一致）。

- [ ] **Step 4: 提交**

```bash
git add src/i18n.ts
git commit -m "feat(i18n): 新增多配置启动命令文案"
```

---

## Task 6: 配置卡片按钮与 Dialog

**Files:**
- Modify: `src/components/ProfilesPage.tsx`（import、state、effect、处理函数、按钮、Dialog）

- [ ] **Step 1: 补充 import**

在 `src/components/ProfilesPage.tsx` 的 lucide 图标 import 块（约 8-13 行，`Variable` 附近）加入 `SquareTerminal`，保持字母序：

```ts
  SquareTerminal,
  Variable,
```

在文件顶部的本地模块 import 区（`import { TYPOGRAPHY } from "./typography-classes";` 之前或之后均可）新增：

```ts
import { buildLaunchCommands, type LaunchCommands } from "./profile-launch-utils";
```

- [ ] **Step 2: 新增 state**

在组件内其它 `useState` 附近（约 270 行 export 相关 state 之后）插入：

```ts
  const [launchProfile, setLaunchProfile] = useState<ConfigProfile | null>(null);
  const [launchCommands, setLaunchCommands] = useState<LaunchCommands | null>(null);
  const [isLaunchLoading, setIsLaunchLoading] = useState(false);
  const [launchLoadError, setLaunchLoadError] = useState(false);
```

- [ ] **Step 3: 新增准备 effect 与处理函数**

在 `handleCopyEnv`（约 887 行）之后插入：

```ts
  async function handleCopyLaunchCommand(command: string) {
    try {
      await navigator.clipboard.writeText(command);
      showToast(t("profiles.toast.launchCommandCopied"));
    } catch (err) {
      showOperationError(showToast, t("profiles.toast.launchCommandError"), err);
    }
  }
```

在已有的 import preview effect（约 870-885 行）之后插入：

```ts
  useEffect(() => {
    if (!launchProfile) return;
    let cancelled = false;
    setIsLaunchLoading(true);
    setLaunchLoadError(false);
    setLaunchCommands(null);
    ipc
      .prepareProfileLaunch(launchProfile.id)
      .then((payload) => {
        if (cancelled) return;
        setLaunchCommands(
          buildLaunchCommands({
            settingsPath: payload.settingsPath,
            envOnlyJson: payload.envOnlyJson,
          }),
        );
      })
      .catch((err) => {
        if (cancelled) return;
        setLaunchLoadError(true);
        showOperationError(showToast, t("profiles.toast.launchCommandError"), err);
      })
      .finally(() => {
        if (!cancelled) setIsLaunchLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [launchProfile]);
```

- [ ] **Step 4: 新增卡片按钮**

在卡片操作组中"复制环境变量"按钮（约 1707-1720 行，图标 `<Variable />` 的 `</Button>`）之后插入新按钮：

```tsx
                  <Button
                    type="button"
                    variant="outline"
                    size="icon-sm"
                    className="border-border bg-muted text-foreground hover:border-primary hover:text-primary"
                    aria-label={t("profiles.actions.copyLaunchCommand")}
                    title={t("profiles.actions.copyLaunchCommand")}
                    onClick={(event) => {
                      event.stopPropagation();
                      setLaunchProfile(profile);
                    }}
                  >
                    <SquareTerminal aria-hidden="true" />
                  </Button>
```

- [ ] **Step 5: 新增 Dialog**

在文件中现有 Dialog 渲染区附近（例如导出 Dialog 之后）插入。Dialog 内两条命令用数组渲染，避免重复：

```tsx
      <Dialog
        open={launchProfile !== null}
        onOpenChange={(open) => {
          if (!open) {
            setLaunchProfile(null);
            setLaunchCommands(null);
            setLaunchLoadError(false);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("profiles.launchDialog.title")}</DialogTitle>
            <DialogDescription>{t("profiles.launchDialog.description")}</DialogDescription>
          </DialogHeader>
          {isLaunchLoading ? (
            <div className="flex justify-center py-6">
              <Spinner aria-hidden="true" />
            </div>
          ) : launchLoadError ? (
            <p className={cn(TYPOGRAPHY.body, "text-destructive")}>
              {t("profiles.launchDialog.loadError")}
            </p>
          ) : launchCommands ? (
            <div className="flex flex-col gap-4">
              {[
                {
                  key: "filePath",
                  label: t("profiles.launchDialog.filePathLabel"),
                  hint: t("profiles.launchDialog.filePathHint"),
                  command: launchCommands.filePathCommand,
                },
                {
                  key: "inlineJson",
                  label: t("profiles.launchDialog.inlineJsonLabel"),
                  hint: t("profiles.launchDialog.inlineJsonHint"),
                  command: launchCommands.inlineJsonCommand,
                },
              ].map((item) => (
                <div key={item.key} className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className={cn(TYPOGRAPHY.body, "font-medium")}>{item.label}</span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => void handleCopyLaunchCommand(item.command)}
                    >
                      <Copy aria-hidden="true" />
                      {t("profiles.launchDialog.copy")}
                    </Button>
                  </div>
                  <pre className="overflow-x-auto rounded-md border border-border bg-muted px-3 py-2 font-mono text-sm whitespace-pre-wrap break-all">
                    {item.command}
                  </pre>
                  <span className={cn(TYPOGRAPHY.auxiliary, "text-muted-foreground")}>
                    {item.hint}
                  </span>
                </div>
              ))}
              <div className="flex flex-col gap-1">
                <span className={cn(TYPOGRAPHY.badge, "text-muted-foreground")}>
                  {t("profiles.launchDialog.usageTitle")}
                </span>
                <ol
                  className={cn(
                    TYPOGRAPHY.auxiliary,
                    "list-decimal pl-5 text-muted-foreground",
                  )}
                >
                  <li>{t("profiles.launchDialog.usageStep1")}</li>
                  <li>{t("profiles.launchDialog.usageStep2")}</li>
                  <li>{t("profiles.launchDialog.usageStep3")}</li>
                </ol>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
```

注意：`TYPOGRAPHY.auxiliary` / `TYPOGRAPHY.badge` 若不存在，改用文件中已使用的同级常量（运行 Step 6 lint 时若报错按报错项替换为已存在的 `TYPOGRAPHY` 字段）。

- [ ] **Step 6: 运行前端只读检查与构建**

Run: `make lint-frontend && make build-frontend`
Expected: lint 与类型检查通过，构建成功。若 `TYPOGRAPHY.*` 字段名报错，替换为 `typography-classes.ts` 中实际存在的字段后重跑。

- [ ] **Step 7: 提交**

```bash
git add src/components/ProfilesPage.tsx
git commit -m "feat(profiles): 配置卡片新增复制 Claude 启动命令 Dialog"
```

---

## Task 7: 覆盖语义验证与全量门禁

**Files:** 无（验证任务）

- [ ] **Step 1: 范围内自动化验证**

Run: `make bindings-check && make test-rust && pnpm exec vitest run src/components/__tests__/profile-launch-utils.test.ts src/i18n.test.tsx`
Expected: 全部 PASS。

- [ ] **Step 2: 手动验证多配置并行（覆盖语义，对应设计第 6 节）**

前置：本机已安装 `claude` CLI，且存在两个指向不同 provider 的配置（如 Anthropic 与 DeepSeek）。

操作：
1. `make dev` 启动应用，在配置卡片点击新按钮，分别复制两个配置的"文件路径式"命令。
2. 开两个终端，各粘贴一条并运行。
3. 在各自会话内确认使用的是对应 provider/model（可在 Claude 内查看当前模型，或在命令前临时加 `claude --settings "<path>" --print "report your model id"` 比对）。
4. 确认全局 `~/.claude/settings.json` 未被改动（运行前后 `git`/时间戳/内容不变）。

Expected：两个终端各自使用对应配置，互不干扰，全局 settings 不变。

若发现 `--settings` 的 env 无法覆盖全局 settings（即两个终端表现一致 / 走了全局 provider）：在 `profiles.launchDialog.description` 文案中补充该限制说明（中英各一句，提示"该命令在全局已绑定配置之上叠加，冲突字段以全局为准"），重跑 `pnpm exec vitest run src/i18n.test.tsx` 后提交。

- [ ] **Step 3: 全量本地门禁**

Run: `make verify`
Expected: 通过。

- [ ] **Step 4: 最终提交（如 Step 2 触发文案修订）**

```bash
git add -A
git commit -m "docs(i18n): 补充多配置启动命令覆盖语义说明"
```

---

## Self-Review 记录

- **Spec 覆盖**：设计第 3 节（按钮+Dialog+两形式+使用说明）→ Task 5/6；第 4 节（POSIX 命令拼接）→ Task 4；第 5 节（后端 command + 文件生命周期 + 删除清理）→ Task 1/2/3；第 6 节（覆盖语义实测）→ Task 7 Step 2；第 7 节 i18n → Task 5；第 8 节测试 → Task 1/2/4 + Task 7。验收标准 1-6 均有对应任务。
- **占位符**：无 TBD / TODO；每个代码步骤含完整代码。
- **类型一致**：Rust `ProfileLaunchPayload { settings_path, env_only_json }` ↔ 生成 bindings camelCase `{ settingsPath, envOnlyJson }` ↔ 前端 `buildLaunchCommands` 入参 `LaunchCommandInput`；命令字段 `filePathCommand` / `inlineJsonCommand` 在 helper、测试、Dialog 三处一致。`prepare_profile_launch` 函数名在 Rust 定义、lib.rs 注册、前端 `ipc.prepareProfileLaunch` 三处一致。
- **ipc.ts/types.ts**：`prepare_profile_launch(id: String) -> ProfileLaunchPayload` 的生成签名与业务调用直接兼容，无需在 `src/ipc.ts` 的 `CompatibleIpcOverrides` 增加窄包装，也无需改 `src/types.ts`（类型随 bindings 生成）。
