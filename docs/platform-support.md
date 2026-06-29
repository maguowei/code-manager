# Platform Support Differences

[English](./platform-support.md) | [中文](./platform-support.zh-CN.md)

Applies to version: `1.0.0`

> This document is intended for both users and maintainers. The user perspective answers "which features work on my machine, and which are degraded or unavailable"; the maintainer perspective answers "which platform gap to close, and where the risks and code locations are."
>
> The authoritative sources for hard constraints, module topology, and verification checklists are the repository-root `CLAUDE.md` and `.claude/rules/*.md`; this document only records platform-related slices of fact. When code or configuration changes, sync this document according to the "Maintenance Guide" at the end.

Code Manager's core configuration management and UI are available on par across macOS / Linux / Windows; the differences concentrate in the **system integration layer** (terminal focus, clickable notifications, status line preset scripts) and the **release layer** (signing, notarization, auto-update). Beyond that, the differences are either dictated by platform-native APIs (paths, file permissions, atomic writes) or wrapped internally by Tauri plugins.

## Table of Contents

- [Platform Support Matrix](#platform-support-matrix)
- [Quick Read by Platform](#quick-read-by-platform)
- [Key Differences Explained](#key-differences-explained)
- [Build and Release Differences](#build-and-release-differences)
- [Differences Kept by Design](#differences-kept-by-design)
- [Maintenance Guide](#maintenance-guide)

## Platform Support Matrix

Legend: ✅ full support; ⚠️ degraded / limited; ❌ unavailable; N/A the platform has no such concept.

### Application Core

| Capability | macOS | Linux | Windows | Source |
| --- | --- | --- | --- | --- |
| Config / provider / memory / Skills management | ✅ | ✅ | ✅ | `src-tauri/src/config.rs`, `memory.rs`, `skills.rs` |
| History / stats / token usage pages | ✅ | ✅ | ✅ | `src-tauri/src/history.rs`, `stats.rs`, `usage.rs` |
| Project list, project-level `.claude/`, AGENTS/Skills pairing and branch / worktree cleanup | ✅ | ✅ | ✅ | `src-tauri/src/project.rs` |
| System tray (profile switching, session view, page navigation) | ✅ | ✅ | ✅ | `src-tauri/src/tray.rs` |
| Desktop usage widget (always-on-top, transparent, cross-desktop persistent today-usage window) | ✅ | ✅ | ✅ | `src-tauri/src/widget.rs` |
| Dock / taskbar activation policy switching | ✅ (Dock `Accessory`↔`Regular`) | N/A | N/A | `src-tauri/src/tray.rs` |
| Autostart | ✅ (AppleScript launcher) | ✅ | ✅ | `tauri-plugin-autostart`, `src-tauri/src/lib.rs` |
| Log writing and viewing | ✅ | ✅ | ✅ | `src-tauri/src/logging.rs` |

### System Integration

| Capability | macOS | Linux | Windows | Source |
| --- | --- | --- | --- | --- |
| Status line preset installation | ✅ Writes `~/.claude/statusline.sh` and grants executable permission (Bash) | ✅ Same as macOS | ✅ Writes `~/.claude/statusline.ps1` and sets the PowerShell invocation command (no executable bit needed) | `src-tauri/src/config.rs::ensure_status_line_preset_supported` (`#[cfg(any(unix, windows))]`) |
| Terminal session focus (clicking a tray session or using a global shortcut returns to the original tab) | ✅ (Terminal.app / iTerm / Ghostty; includes global session focus shortcut) | ❌ stub `Unsupported` (no shortcut) | ❌ stub `Unsupported` (no shortcut) | `src-tauri/src/terminal_focus.rs` |
| LED lighting integration (mirrors tray session state to ANTICATER USB device) | ✅ (`led_probe_status` / `led_test_mode`) | ❌ No-op, harmless (probe returns None) | ❌ No-op, harmless (probe returns None) | `src-tauri/src/led.rs` (HID write report) |
| Clickable system notifications (click to jump back to session) | ✅ (`mac-notification-sys`) | ⚠️ Falls back to plain-text `tauri-plugin-notification` | ⚠️ Falls back to plain-text `tauri-plugin-notification` | `src-tauri/src/tray.rs` |
| Open in default editor (VS Code / Cursor / Windsurf / Zed) | ✅ `open -a` | ✅ Relies on CLI in `PATH` | ✅ `tauri-plugin-opener` | `src-tauri/src/native_open.rs` |
| Open in default terminal | ✅ (Terminal / iTerm / Warp / Ghostty) | ✅ (`$TERMINAL` / `xdg-terminal-exec` / `x-terminal-emulator` / Warp / Ghostty CLI) | ✅ (Windows Terminal / PowerShell / cmd) | `src-tauri/src/native_open.rs` |
| Hide console window for child processes | N/A | N/A | ✅ `CREATE_NO_WINDOW` | `src-tauri/src/native_open.rs` |

### UI-Layer Platform Filtering

| Capability | macOS | Linux | Windows | Source |
| --- | --- | --- | --- | --- |
| Selectable terminals in the settings drawer | Terminal, iTerm, Warp, Ghostty | Terminal, Warp, Ghostty (**excludes iTerm**) | Terminal, Warp (**further excludes Ghostty**) | `src/components/SettingsDrawer.tsx::getTerminalOptionsForPlatform` |
| Selectable editors in the settings drawer | VS Code, Cursor, Windsurf, Zed | Same as left (relies on CLI in `PATH`) | Same as left (relies on CLI in `PATH`) | `src/components/SettingsDrawer.tsx` |
| Status line preset installation error message | — | — | — | `profileEditor.statusLine.installPresetUnsupportedPlatform` triggers only on platforms other than macOS/Linux/Windows |

### File System Behavior

| Capability | macOS | Linux | Windows | Source |
| --- | --- | --- | --- | --- |
| Application data directory | `~/.config/code-manager/` (**intentional** reuse, see below) | `$XDG_CONFIG_HOME/code-manager/` or `~/.config/code-manager/` | `%APPDATA%\code-manager\` | `src-tauri/src/utils.rs::platform_app_data_dir_from_home` |
| SQLite (`usage.db`) | `~/Library/Application Support/com.gotobeta.app.code-manager/` | `$XDG_CONFIG_HOME/com.gotobeta.app.code-manager/` | `%APPDATA%\com.gotobeta.app.code-manager\` | Backend `sqlx` uses Tauri `app_config_dir()` |
| Log directory | `~/Library/Logs/com.gotobeta.app.code-manager/` | `$XDG_DATA_HOME/.../logs/` or `~/.local/share/.../logs/` | `%LOCALAPPDATA%\com.gotobeta.app.code-manager\logs\` | `tauri-plugin-log` default `app_log_dir()` |
| Sensitive file permission bits (0o600) | ✅ Unix mode | ✅ Unix mode | N/A (NTFS ACL, not set) | `src-tauri/src/utils.rs` |
| Atomic write strategy | `fs::rename()` (POSIX atomic) | `fs::rename()` (POSIX atomic) | Backup-rename-restore three-step approach | `src-tauri/src/utils.rs` |
| Symlink API | `std::os::unix::fs::symlink` | `std::os::unix::fs::symlink` | `symlink_file` + `symlink_dir`, falls back to hard link on failure (`project.rs`) | `src-tauri/src/skills.rs`, `memory.rs`, `project.rs` |

## Quick Read by Platform

### macOS

- **Highest level of support.** All features are available, including terminal session focus, clickable notifications, and Dock activation policy switching.
- The application data directory is intentionally placed at `~/.config/code-manager/` rather than the system-standard `~/Library/Application Support/`, to ease cross-platform backup and script access (see the section below).
- Terminal session focus follows `pid → tty → AppleScript`, supporting Terminal.app / iTerm2; because Ghostty does not yet expose pid/tty via AppleScript (Ghostty Issue #11592), it can only be approximately matched by `cwd`; Warp has no official AppleScript, so its tray menu item is set to disabled.
- If Gatekeeper blocks the first open, you can remove the quarantine attribute:
  ```bash
  xattr -rd com.apple.quarantine /Applications/code-manager.app
  ```

### Linux

- **Status line preset is available** (Bash script, relies on `chmod 0o755`, the `#[cfg(unix)]` branch is hit).
- **Terminal session focus is unavailable** (`terminal_focus.rs` returns `Unsupported`). Clicking a tray session item will not automatically return to the original tab; switch manually if needed.
- **Notifications degrade to plain text**: you can see the notification content, but it is not clickable to jump back to the session.
- The set of default terminals has one fewer entry than macOS (no iTerm); the rest carry over: Terminal (system default), Warp, Ghostty; the backend also probes `$TERMINAL` / `xdg-terminal-exec` / `x-terminal-emulator` as needed.
- Default editors (VS Code / Cursor / Windsurf / Zed) rely on the corresponding CLI being in `PATH`.
- Building requires system dependencies: `libwebkit2gtk-4.1-dev`, `libappindicator3-dev`, `librsvg2-dev` (see `.github/workflows/ci.yml`).

### Windows

- **Status line preset is available.** Installs the PowerShell version of the script `~/.claude/statusline.ps1`, and sets `statusLine.command` to `powershell -NoProfile -ExecutionPolicy Bypass -File ...` with an absolute forward-slash path; PowerShell and `ConvertFrom-Json` ship with the system, so no jq / Git Bash is required. NTFS has no executable bit, so no `chmod` is needed.
- **Terminal session focus is unavailable** (same as Linux, `terminal_focus.rs` returns `Unsupported`).
- **Notifications degrade to plain text** (same as Linux).
- The selectable terminals in the settings drawer are further narrowed to Windows Terminal and Warp; selectable editors are the same as macOS / Linux (the CLI must be in `PATH`).
- When launching external processes, `CREATE_NO_WINDOW` is added to avoid a black console flashing by.
- When symlinking fails, `project.rs` falls back to hard links, avoiding interruptions for low-privilege accounts that cannot create symbolic links.

## Key Differences Explained

### Cross-Platform Implementation of Status Line Presets

`src-tauri/src/config.rs::ensure_status_line_preset_supported` returns `Ok` on the `#[cfg(any(unix, windows))]` branch, and only returns `STATUS_LINE_PRESET_UNSUPPORTED_PLATFORM_ERROR` on platforms outside the three major ones. The script is dispatched per platform:

1. Non-Windows: writes the Bash script `~/.claude/statusline.sh` (`src-tauri/resources/statusline/default.sh`, relies on jq) and `chmod 0o755`; `command` is `~/.claude/statusline.sh`.
2. Windows: writes the PowerShell script `~/.claude/statusline.ps1` (`src-tauri/resources/statusline/default.ps1`, uses the built-in `ConvertFrom-Json`, no jq) without setting the executable bit; `command` is `powershell -NoProfile -ExecutionPolicy Bypass -File ...` with an absolute forward-slash path, sidestepping the problems of `~` not expanding in the `-File` argument and backslashes being treated as escape characters.

The two scripts keep their functionality aligned (two-line layout, git, context/token/cost, rate limits, ANSI colors, and OSC 8 hyperlinks). When modifying one, sync the other.

### Why Terminal Session Focus Is macOS-Only

The header comment in `src-tauri/src/terminal_focus.rs` already states the design boundary: it relies on AppleScript and `ps` to reverse-look-up the tty. The equivalent capability on Linux requires `wmctrl` / `xdotool` (X11) or Wayland protocols; on Windows it requires PowerShell together with Win32 APIs to find windows. Both fall into the category of "scenario-dependent approximate implementations" that do not affect the core configuration management flow, and have not yet been filled in. On a failed match, it only logs a warning, and never automatically opens a new window or tab.

### Why Clickable Notifications Are macOS-Only

`tauri-plugin-notification` can post notifications on all three platforms, but **does not support a click callback that jumps to a custom route**. Code Manager additionally introduces `mac-notification-sys` on macOS only (declared in `src-tauri/Cargo.toml` under `[target.'cfg(target_os = "macos")'.dependencies]`), using it to post clickable notifications and bind session information to the click callback. The `notify-rust` action buttons on Linux and the WinRT Toast on Windows can both serve as future alternatives, but are not yet implemented.

### Why LED Lighting Is macOS-Only

`src-tauri/src/led.rs` maps tray session state (waiting > running > idle) into the lighting modes of an ANTICATER USB device, and lights up the device by writing HID reports. The protocol was reverse-engineered from codepass (Swift + IOKit), and currently only the macOS path is implemented:

- `led_probe_status` returns device-not-connected (None) on non-macOS platforms, so the settings page does not show the device integration area;
- `led_test_mode` and the background LED runtime are no-ops on non-macOS, raising no error and causing no side effects.

The equivalent capability on Linux could go through `hidapi` / `libusb`, and on Windows through the HID API or vendor SDK, but both are optional enhancements for external hardware that do not affect core configuration management, and have not yet been filled in.

### Why the Application Data Directory Uses `~/.config` on macOS

`src-tauri/src/utils.rs::platform_app_data_dir_from_home` **intentionally reuses** `~/.config/code-manager/` on macOS, rather than the macOS-standard `~/Library/Application Support/...`. The motivations:

1. Consistency with the Linux path, so cross-platform backup scripts and dotfiles toolchains can use the same relative path;
2. Terminal users can directly `ls ~/.config/code-manager/` without entering the hidden `Library` directory.

**Note: only application data uses this non-standard path. SQLite goes through Tauri `app_config_dir()`, and logs go through the Tauri plugin default path** (`tauri-plugin-log` uses `app_log_dir()`), which remain `~/Library/...` on macOS. Do not mistakenly extend this rule to SQLite or logs.

### Symlink Strategy and Windows Fallback

Every place that needs symlinks in `src-tauri/src/skills.rs`, `memory.rs`, and `project.rs` splits between Unix / Windows:

- Unix uses the unified `std::os::unix::fs::symlink`;
- Windows must distinguish `symlink_file` (files) from `symlink_dir` (directories); when deleting, it must also use `FileTypeExt::is_symlink_dir()` to determine directory vs. file.

By default, creating symbolic links on Windows requires administrator privileges or enabling "Developer Mode." `project.rs` implements a hard-link fallback for project directory pairing (`CLAUDE.md` ↔ `AGENTS.md`, etc.), avoiding failures for low-privilege accounts during normal operations; the directory-level links for Skills and Memory have no fallback path, so ordinary Windows users need to confirm Developer Mode is enabled before first use.

## Build and Release Differences

### CI / Release Runner

| Workflow | macOS | Linux | Windows |
| --- | --- | --- | --- |
| `.github/workflows/ci.yml` | `macos-26` | `ubuntu-24.04` (includes system dependency installation) | `windows-latest` |
| `.github/workflows/release.yml` | `macos-26` + `--target universal-apple-darwin` (arm64 + x86_64) | `ubuntu-24.04` | `windows-latest` |

The build chain uniformly goes through `tauri-apps/tauri-action`; all three platform runners are present, and CI checks and release artifact paths are on par.

### Missing Packaging Configuration

`src-tauri/tauri.conf.json` currently only declares `bundle.targets: "all"` and the icon set, with **no platform-specific bundle sections at all**:

- **No macOS code signing / notarization**: no `bundle.macOS.signingIdentity` / `entitlements` / `provisioningProfile`. Downloaders will trigger a Gatekeeper block on first open and must manually `xattr -rd com.apple.quarantine`.
- **No Windows code signing**: no `bundle.windows.certificateThumbprint` / `digestAlgorithm`. Downloaders will see a SmartScreen warning.
- **No NSIS / MSI customization**: the Windows installer uses the Tauri default template.
- **No deb / rpm / AppImage customization**: Linux package metadata uses the Tauri default.
- **No `updater` section**: the auto-update chain is not enabled, and users on all three platforms must manually download new versions.

### Icon Resources

`src-tauri/icons/` provides:

- `icon.icns` (macOS)
- `icon.ico` (Windows)
- `32x32.png` / `128x128.png` / `128x128@2x.png` (universal)
- Plus 20 iOS icons and 7 Windows Store Square Logos (not consumed by the current `bundle.targets`, redundant resources)

### `Makefile`

- `make build` is equivalent to `pnpm tauri build`, building the package for the current platform.
- `make build-universal` **serves macOS only**, outputting `universal-apple-darwin`.
- There are no dedicated `build:linux` / `build:win` targets yet; Linux / Windows packages are produced uniformly by CI on the corresponding runners.

## Differences Kept by Design

The following differences are "by design"; do not treat them as bugs to fix:

- **macOS application data reuses `~/.config/code-manager/`**: a unified entry point for cross-platform backup and script access, see the section above.
- **macOS / Linux use Unix permission bits 0o600 / 0o755, while Windows sets no ACL equivalent**: the Windows file system has no POSIX permission bits, and forcing an ACL would make the permission model deviate from both sides' user expectations; the current reliance on Windows' user-level directory isolation is sufficient.
- **Windows atomic writes use a backup-rename-restore three-step approach**: on NTFS, `fs::rename` cannot atomically overwrite an existing target file across directories, and the three-step approach is the common Tauri / community practice.
- **Linux / Windows notifications are not clickable**: cross-platform equivalent APIs are not yet mature, and forcing an implementation would introduce a large number of platform conditional branches for little gain.

## Maintenance Guide

When modifying the following code or configuration, **you must sync this document**:

| File / Area | Where to sync in this document |
| --- | --- |
| `src-tauri/src/terminal_focus.rs` (adding platform support or changing focus semantics) | The "Terminal session focus" row in the "System Integration" table, "Quick Read by Platform", and the corresponding "Key Differences Explained" subsection |
| `src-tauri/src/tray.rs` (notification strategy changes) | The "Clickable system notifications" row in the "System Integration" table, and "Key Differences Explained" |
| `src-tauri/src/led.rs` (adding platform support or changing lighting mapping) | The "LED lighting integration" row in the "System Integration" table, and "Why LED Lighting Is macOS-Only" in "Key Differences Explained" |
| `src-tauri/src/widget.rs` (adding platform conditional compilation or changing widget behavior) | The "Desktop usage widget" row in the "Application Core" table |
| `src-tauri/src/config.rs::ensure_status_line_preset_supported` | The "Status line preset installation" row in the "System Integration" table, the Windows quick read, and "Key Differences Explained" |
| `src-tauri/src/utils.rs::platform_app_data_dir_from_home` | The "Application data directory" row in the "File System Behavior" table, and "Differences Kept by Design" |
| `src-tauri/src/native_open.rs` (adding terminals / editors or changing Windows child-process arguments) | The "Open in default editor", "Open in default terminal", and "Hide console window for child processes" rows in the "System Integration" table |
| The `[target.'cfg(...)']` dependency blocks in `src-tauri/Cargo.toml` | Sync the corresponding subsection depending on the dependency's purpose |
| `src/components/SettingsDrawer.tsx::getTerminalOptionsForPlatform` | The "UI-Layer Platform Filtering" table |
| Adding `bundle.macOS` / `bundle.windows` / `bundle.linux` / `updater` sections to `src-tauri/tauri.conf.json` | The entire "Build and Release Differences" section |
| `.github/workflows/ci.yml`, `.github/workflows/release.yml` (runner or matrix changes) | The "CI / Release Runner" table |

When adding any platform conditional compilation block (`#[cfg(target_os = ...)]`, `#[cfg(unix)]`, `#[cfg(windows)]`), also add it to the "Source" column of the corresponding table row, to ease later auditing.

### Verification

After changing this document:

```bash
git diff --check
```

Manually review two points:

- Each row's support level in the matrix matches the current code state (spot-check `src-tauri/src/terminal_focus.rs`, `src-tauri/src/config.rs:1561-1571`, `src-tauri/Cargo.toml:46-47`, `src/components/SettingsDrawer.tsx:124-137`).
- The style is consistent with `docs/user-manual.md` and `docs/claude-code-best-practices.md` (English, table-driven, file paths in backticks).
