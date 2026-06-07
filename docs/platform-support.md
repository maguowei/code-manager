# 平台支持差异

适用版本：`0.19.0`

> 本文档面向用户与维护者。用户视角用来确认"我这台机器上能用哪些功能、哪些是降级或不可用"；维护者视角用来判断"补哪个平台缺口、风险与代码位置在哪"。
>
> 硬约束、模块拓扑和验证清单的权威来源是仓库根目录的 `CLAUDE.md` 与 `.claude/rules/*.md`；本文档只记录与平台相关的事实切片。当代码或配置发生变更时，按本文末尾的「维护指引」同步本文档。

AI Manager 的核心配置管理与界面在 macOS / Linux / Windows 上对等可用；差异集中在**系统集成层**（终端聚焦、可点击通知、状态行预设脚本）和**发布层**（签名、公证、自动更新）。除此之外的差异要么是平台原生 API 决定的（路径、文件权限、原子写入），要么是 Tauri 插件内部的封装。

## 目录

- [平台支持矩阵](#平台支持矩阵)
- [按平台速读](#按平台速读)
- [关键差异详解](#关键差异详解)
- [构建与发布层面的差异](#构建与发布层面的差异)
- [按设计保留的差异](#按设计保留的差异)
- [维护指引](#维护指引)

## 平台支持矩阵

图例：✅ 完整支持；⚠️ 降级 / 受限；❌ 不可用；N/A 平台无此概念。

### 应用核心

| 能力 | macOS | Linux | Windows | 来源 |
| --- | --- | --- | --- | --- |
| Profile / Preset / Memory / Skills 管理 | ✅ | ✅ | ✅ | `src-tauri/src/config.rs`、`memory.rs`、`skills.rs` |
| 历史 / 统计 / Token 用量页 | ✅ | ✅ | ✅ | `src-tauri/src/history.rs`、`stats.rs`、`usage.rs` |
| 项目列表、项目级 `.claude/`、AGENTS/Skills 配对与分支 / Worktree 清理 | ✅ | ✅ | ✅ | `src-tauri/src/project.rs` |
| 系统托盘（Profile 切换、会话视图、页面导航） | ✅ | ✅ | ✅ | `src-tauri/src/tray.rs` |
| Dock / 任务栏激活策略切换 | ✅（Dock `Accessory`↔`Regular`） | N/A | N/A | `src-tauri/src/tray.rs` |
| 自启动 | ✅（AppleScript 启动器） | ✅ | ✅ | `tauri-plugin-autostart`，`src-tauri/src/lib.rs` |
| 日志写入与查看 | ✅ | ✅ | ✅ | `src-tauri/src/logging.rs` |

### 系统集成

| 能力 | macOS | Linux | Windows | 来源 |
| --- | --- | --- | --- | --- |
| 状态行预设安装（写入 `~/.claude/statusline.sh` 并赋可执行权限） | ✅ | ✅ | ❌ 报错 `status_line_preset_unsupported_platform` | `src-tauri/src/config.rs::ensure_status_line_preset_supported`（`#[cfg(unix)]`） |
| 终端会话聚焦（点击托盘会话回到原 tab） | ✅（Terminal.app / iTerm / Ghostty） | ❌ stub `Unsupported` | ❌ stub `Unsupported` | `src-tauri/src/terminal_focus.rs` |
| 可点击系统通知（点击跳回会话） | ✅（`mac-notification-sys`） | ⚠️ 退回纯文本 `tauri-plugin-notification` | ⚠️ 退回纯文本 `tauri-plugin-notification` | `src-tauri/src/tray.rs` |
| 默认编辑器打开（VS Code / Cursor / Windsurf / Zed） | ✅ `open -a` | ✅ 依赖 CLI 在 `PATH` | ✅ `tauri-plugin-opener` | `src-tauri/src/native_open.rs` |
| 默认终端打开 | ✅（Terminal / iTerm / Warp / Ghostty） | ✅（`$TERMINAL` / `xdg-terminal-exec` / `x-terminal-emulator` / Warp / Ghostty CLI） | ✅（Windows Terminal / PowerShell / cmd） | `src-tauri/src/native_open.rs` |
| 子进程隐藏控制台窗口 | N/A | N/A | ✅ `CREATE_NO_WINDOW` | `src-tauri/src/native_open.rs` |

### UI 层的平台过滤

| 能力 | macOS | Linux | Windows | 来源 |
| --- | --- | --- | --- | --- |
| 设置抽屉中可选终端 | Terminal、iTerm、Warp、Ghostty | Terminal、Warp、Ghostty（**排除 iTerm**） | Terminal、Warp（**进一步排除 Ghostty**） | `src/components/SettingsDrawer.tsx::getTerminalOptionsForPlatform` |
| 设置抽屉中可选编辑器 | VS Code、Cursor、Windsurf、Zed | 同左（依赖 CLI 在 `PATH`） | 同左（依赖 CLI 在 `PATH`） | `src/components/SettingsDrawer.tsx` |
| 状态行预设安装错误提示 | — | — | ⚠️ 显示「当前仅支持 macOS / Linux」 | `src/components/profile-editor/StatusLineEditor.tsx`、`src/i18n.ts` `profileEditor.statusLine.installPresetUnsupportedPlatform` |

### 文件系统行为

| 能力 | macOS | Linux | Windows | 来源 |
| --- | --- | --- | --- | --- |
| 应用数据目录 | `~/.config/ai-manager/`（**故意**复用，详见后文） | `$XDG_CONFIG_HOME/ai-manager/` 或 `~/.config/ai-manager/` | `%APPDATA%\ai-manager\` | `src-tauri/src/utils.rs::platform_app_data_dir_from_home` |
| SQLite (`usage.db`) | `~/Library/Application Support/com.gotobeta.app.ai-manager/` | `$XDG_CONFIG_HOME/com.gotobeta.app.ai-manager/` | `%APPDATA%\com.gotobeta.app.ai-manager\` | 后端 `sqlx` 使用 Tauri `app_config_dir()` |
| 日志目录 | `~/Library/Logs/com.gotobeta.app.ai-manager/` | `$XDG_DATA_HOME/.../logs/` 或 `~/.local/share/.../logs/` | `%LOCALAPPDATA%\com.gotobeta.app.ai-manager\logs\` | `tauri-plugin-log` 默认 `app_log_dir()` |
| 敏感文件权限位（0o600） | ✅ Unix mode | ✅ Unix mode | N/A（NTFS ACL，未设置） | `src-tauri/src/utils.rs` |
| 原子写入策略 | `fs::rename()`（POSIX 原子） | `fs::rename()`（POSIX 原子） | 备份-重命名-恢复三步法 | `src-tauri/src/utils.rs` |
| 软链接 API | `std::os::unix::fs::symlink` | `std::os::unix::fs::symlink` | `symlink_file` + `symlink_dir`，失败时降级硬链接（`project.rs`） | `src-tauri/src/skills.rs`、`memory.rs`、`project.rs` |

## 按平台速读

### macOS

- **支持度最高**。所有功能均可用，包括终端会话聚焦、可点击通知和 Dock 激活策略切换。
- 应用数据目录刻意放在 `~/.config/ai-manager/` 而非系统标准的 `~/Library/Application Support/`，便于跨平台备份与脚本访问（详见下节）。
- 终端会话聚焦走 `pid → tty → AppleScript`，支持 Terminal.app / iTerm2；Ghostty 因为 AppleScript 还没暴露 pid/tty（Ghostty Issue #11592），只能按 `cwd` 近似匹配；Warp 没有官方 AppleScript，托盘菜单项会被置为 disabled。
- 首次打开如果被 Gatekeeper 拦截，可移除隔离属性：
  ```bash
  xattr -rd com.apple.quarantine /Applications/ai-manager.app
  ```

### Linux

- **状态行预设可用**（依赖 `chmod 0o755`，`#[cfg(unix)]` 分支命中）。
- **终端会话聚焦不可用**（`terminal_focus.rs` 返回 `Unsupported`）。点击托盘会话项时不会自动回到原 tab；如需要，请手动切换。
- **通知降级为纯文本**：能看到通知内容，但不可点击跳回会话。
- 默认终端范围比 macOS 少一个 iTerm，其余沿用：Terminal（系统默认）、Warp、Ghostty；后端还会按需探测 `$TERMINAL` / `xdg-terminal-exec` / `x-terminal-emulator`。
- 默认编辑器（VS Code / Cursor / Windsurf / Zed）依赖对应 CLI 在 `PATH` 中。
- 构建需要系统依赖：`libwebkit2gtk-4.1-dev`、`libappindicator3-dev`、`librsvg2-dev`（详见 `.github/workflows/ci.yml`）。

### Windows

- **状态行预设不可用**。`config.rs::ensure_status_line_preset_supported` 在 `#[cfg(not(unix))]` 分支返回 `status_line_preset_unsupported_platform`，前端 `StatusLineEditor` 捕获后展示「当前仅支持 macOS / Linux」提示。需要状态行的用户暂时只能手动维护 `~/.claude/statusline.*`。
- **终端会话聚焦不可用**（同 Linux，`terminal_focus.rs` 返回 `Unsupported`）。
- **通知降级为纯文本**（同 Linux）。
- 设置抽屉中可选终端进一步收窄到 Windows Terminal、Warp，可选编辑器同 macOS / Linux（需要 CLI 在 `PATH` 中）。
- 启动外部进程时会带 `CREATE_NO_WINDOW`，避免闪过黑色控制台。
- 软链失败时 `project.rs` 会降级为硬链接，避免低权限账户因为无法创建符号链接而流程中断。

## 关键差异详解

### 状态行预设为何 Windows 不支持

`src-tauri/src/config.rs::ensure_status_line_preset_supported` 在 `#[cfg(unix)]` 分支返回 `Ok`，否则返回错误常量 `STATUS_LINE_PRESET_UNSUPPORTED_PLATFORM_ERROR`。原因有两点：

1. 状态行脚本是 Bash 脚本，写入路径是 `~/.claude/statusline.sh`，Windows 默认 shell 无法直接执行；
2. 安装步骤包含 `fs::set_permissions(path, Permissions::from_mode(0o755))`，Windows 文件系统没有 POSIX 权限位。

若后续要为 Windows 提供等价能力，应单独提供 PowerShell 脚本路径或换成 Claude Code 的 `command` 字段配置，而非把现有 Bash 脚本强行写到 Windows。

### 终端会话聚焦为何仅 macOS

`src-tauri/src/terminal_focus.rs` 头部注释已经写明设计边界：依赖 AppleScript 与 `ps` 反查 tty。Linux 上等价能力需要 `wmctrl` / `xdotool`（X11）或 Wayland 协议；Windows 上需要 PowerShell 配合 Win32 API 查找窗口。这两者都属于"看场景的近似实现"，不影响核心配置管理流程，暂未补齐。命中失败只记 warn 日志，不会自动新开窗口或 tab。

### 可点击通知为何仅 macOS

`tauri-plugin-notification` 在三平台都能发通知，但**不支持点击回调跳到自定义路由**。AI Manager 仅在 macOS 上额外引入 `mac-notification-sys`（声明于 `src-tauri/Cargo.toml` 的 `[target.'cfg(target_os = "macos")'.dependencies]`），用它发可点击通知并把会话信息绑定到点击回调。Linux 上的 `notify-rust` action 按钮和 Windows 上的 WinRT Toast 都可作为后续替代方案，目前未实现。

### 应用数据目录为何 macOS 走 `~/.config`

`src-tauri/src/utils.rs::platform_app_data_dir_from_home` 在 macOS 上**刻意复用** `~/.config/ai-manager/`，而不是 macOS 标准的 `~/Library/Application Support/...`。动机：

1. 与 Linux 路径一致，跨平台备份脚本、dotfiles 工具链可以用同一相对路径；
2. 终端用户可以直接 `ls ~/.config/ai-manager/`，无需进入 `Library` 隐藏目录。

**注意：只有应用数据走这个非标准路径。SQLite 走 Tauri `app_config_dir()`，日志走 Tauri 插件默认路径**（`tauri-plugin-log` 用 `app_log_dir()`），在 macOS 上仍然是 `~/Library/...`。不要把这条规则误推到 SQLite 或日志上。

### 软链接策略与 Windows 降级

`src-tauri/src/skills.rs`、`memory.rs`、`project.rs` 中所有需要软链接的位置都做了 Unix / Windows 分裂：

- Unix 使用统一的 `std::os::unix::fs::symlink`；
- Windows 必须区分 `symlink_file`（文件）与 `symlink_dir`（目录）；删除时也要用 `FileTypeExt::is_symlink_dir()` 判断目录还是文件。

Windows 默认情况下创建符号链接需要管理员权限或开启"开发者模式"。`project.rs` 针对项目目录配对（`CLAUDE.md` ↔ `AGENTS.md` 等）实现了硬链接降级，避免低权限账户在普通操作中失败；Skills 与 Memory 的目录级链接没有降级路径，普通用户在 Windows 上首次使用前需要确认已开启开发者模式。

## 构建与发布层面的差异

### CI / Release runner

| Workflow | macOS | Linux | Windows |
| --- | --- | --- | --- |
| `.github/workflows/ci.yml` | `macos-26` | `ubuntu-24.04`（含系统依赖安装） | `windows-latest` |
| `.github/workflows/release.yml` | `macos-26` + `--target universal-apple-darwin`（arm64 + x86_64） | `ubuntu-24.04` | `windows-latest` |

构建链统一走 `tauri-apps/tauri-action`，三平台 runner 齐全，CI 检查与 Release 产物路径对等。

### 打包配置缺失项

`src-tauri/tauri.conf.json` 当前只声明 `bundle.targets: "all"` 与 icon 集合，**没有任何平台专属 bundle 段**：

- **无 macOS 代码签名 / 公证**：没有 `bundle.macOS.signingIdentity` / `entitlements` / `provisioningProfile`。下载者首次打开会触发 Gatekeeper 拦截，需手动 `xattr -rd com.apple.quarantine`。
- **无 Windows 代码签名**：没有 `bundle.windows.certificateThumbprint` / `digestAlgorithm`。下载者会看到 SmartScreen 警告。
- **无 NSIS / MSI 自定义**：Windows 安装器走 Tauri 默认模板。
- **无 deb / rpm / AppImage 自定义**：Linux 包元数据走 Tauri 默认。
- **无 `updater` 段**：自动更新链未启用，三平台用户都需要手动下载新版本。

### 图标资源

`src-tauri/icons/` 提供：

- `icon.icns`（macOS）
- `icon.ico`（Windows）
- `32x32.png` / `128x128.png` / `128x128@2x.png`（通用）
- 另含 20 个 iOS 图标与 7 个 Windows Store Square Logo（当前 `bundle.targets` 不消费，属于冗余资源）

### `Makefile`

- `make build` 等价 `pnpm tauri build`，构建当前平台包。
- `make build-universal` **仅服务 macOS**，输出 `universal-apple-darwin`。
- 暂无 `build:linux` / `build:win` 专属 target；Linux / Windows 包统一由 CI 在对应 runner 上产出。

## 按设计保留的差异

下列差异属于"按设计"，不要当作 bug 修：

- **macOS 应用数据复用 `~/.config/ai-manager/`**：跨平台备份与脚本访问的统一入口，详见上节。
- **macOS / Linux 用 Unix 权限位 0o600 / 0o755，Windows 未设置 ACL 等价物**：Windows 文件系统没有 POSIX 权限位，硬套 ACL 会让权限模型偏离两侧用户预期；当前依赖 Windows 的用户级目录隔离已足够。
- **Windows 原子写入采用备份-重命名-恢复三步法**：NTFS 上 `fs::rename` 不能跨目标已存在文件原子覆盖，三步法是 Tauri / 社区通用做法。
- **Linux / Windows 通知不可点击**：跨平台等价 API 还不成熟，强行实现会引入大量平台条件分支，得不偿失。

## 维护指引

修改下列代码或配置时，**必须同步本文档**：

| 文件 / 区域 | 同步本文档的位置 |
| --- | --- |
| `src-tauri/src/terminal_focus.rs`（新增平台支持或修改聚焦语义） | 「系统集成」表格的「终端会话聚焦」、「按平台速读」、「关键差异详解」对应小节 |
| `src-tauri/src/tray.rs`（通知策略改动） | 「系统集成」表格的「可点击系统通知」、「关键差异详解」 |
| `src-tauri/src/config.rs::ensure_status_line_preset_supported` | 「系统集成」表格的「状态行预设安装」、Windows 速读、「关键差异详解」 |
| `src-tauri/src/utils.rs::platform_app_data_dir_from_home` | 「文件系统行为」表格的「应用数据目录」、「按设计保留的差异」 |
| `src-tauri/src/native_open.rs`（新增终端 / 编辑器或修改 Windows 子进程参数） | 「系统集成」表格的「默认编辑器」「默认终端」「子进程隐藏控制台窗口」 |
| `src-tauri/Cargo.toml` 的 `[target.'cfg(...)']` 依赖块 | 视依赖用途同步对应小节 |
| `src/components/SettingsDrawer.tsx::getTerminalOptionsForPlatform` | 「UI 层的平台过滤」表格 |
| `src-tauri/tauri.conf.json` 新增 `bundle.macOS` / `bundle.windows` / `bundle.linux` / `updater` 段 | 「构建与发布层面的差异」整节 |
| `.github/workflows/ci.yml`、`.github/workflows/release.yml`（runner 或矩阵变更） | 「CI / Release runner」表格 |

新增任何平台条件编译块（`#[cfg(target_os = ...)]`、`#[cfg(unix)]`、`#[cfg(windows)]`）时，应一并补到对应表格行的「来源」列，便于后续审计。

### 验证

本文档变更后：

```bash
git diff --check
```

人工审阅两点：

- 矩阵每一行支持度与代码现状一致（spot-check `src-tauri/src/terminal_focus.rs`、`src-tauri/src/config.rs:1561-1571`、`src-tauri/Cargo.toml:46-47`、`src/components/SettingsDrawer.tsx:124-137`）。
- 风格与 `docs/user-manual.md`、`docs/claude-code-best-practices.md` 一致（中文、表格驱动、文件路径用反引号）。
