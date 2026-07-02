# Code Manager User Manual

[English](./user-manual.md) | [中文](./user-manual.zh-CN.md)

Applies to version: `1.0.0`

> This document is intended for end users. The execution handbook for coding agents such as Claude Code / Codex is in `CLAUDE.md` at the repository root.

Code Manager is a local desktop management tool for Claude Code users. It brings the `~/.claude` directory, configurations, providers, memories, Skills, history, statistics, token usage, project status, the system tray, and diagnostic logs together into a single Tauri application, helping you maintain your local Claude Code configuration in a more visible, previewable, and verifiable way.

## Table of Contents

- [Core Concepts](#core-concepts)
- [Quick Start](#quick-start)
- [Main Navigation](#main-navigation)
- [`~/.claude` Directory Overview](#claude-directory-overview)
- [Configurations](#configurations)
- [Providers](#providers)
- [Memory Management](#memory-management)
- [Skills Management](#skills-management)
- [Project Management](#project-management)
- [Usage History](#usage-history)
- [Usage Statistics](#usage-statistics)
- [Token Usage Statistics](#token-usage-statistics)
- [Desktop Usage Widget](#desktop-usage-widget)
- [System Tray and Session Focus](#system-tray-and-session-focus)
- [Settings and Diagnostics](#settings-and-diagnostics)
- [Local Data and Privacy](#local-data-and-privacy)
- [Common Workflows](#common-workflows)
- [Frequently Asked Questions](#frequently-asked-questions)

## Core Concepts

### Configuration

A configuration is the user settings that can ultimately be applied to `~/.claude/settings.json`. It typically includes fields such as authentication keys, the API endpoint, the default model, permissions, Sandbox, Hooks, plugins, and the status line. A configuration can reference a built-in provider; when the configuration is applied, Code Manager merges the provider's `env` (endpoint and model mapping) with the configuration's own settings, generates the final JSON, and writes it to `~/.claude/settings.json`.

If `~/.claude/settings.json` already exists on this machine, the Configurations page can detect it when no configuration has been created yet and import it as a managed configuration. After a configuration has been applied, if the real `settings.json` is modified externally, the page shows a difference notice; you can review the diff and then choose to accept the actual settings or re-apply the managed configuration.

### Provider

A provider carries only objective provider information (connection endpoint, model mapping, and optional additional environment variables). It contains no authentication keys and is built-in and read-only, with no custom providers. Built-in providers cover Anthropic, DeepSeek, Zhipu GLM Coding Plan, Kimi Code Plan, MiniMax Token Plan, Xiaomi MiMo Token Plan, OpenRouter, Volcengine Ark Coding Plan, Alibaba Cloud Bailian Coding Plan, Wanjie Ark, and Ollama. After a configuration references a provider, fields with the same name in the configuration override the provider's `env` (except the endpoint: the endpoint uses the provider as the single source of truth).

### Memory

Memories correspond to the Claude Code user-level `CLAUDE.md` and `~/.claude/rules/*.md`. When enabled, they are written to the real Claude Code directory.

- `CLAUDE.md`: only one can be enabled at a time, suitable as a long-term primary memory.
- Rules: multiple can be enabled at the same time, saved to `~/.claude/rules/`, and can use the `paths` frontmatter for path matching.

### Skills

Skills correspond to `~/.claude/skills/<id>/SKILL.md`. Enabled Skills are stored in `~/.claude/skills/`; disabled Skills are moved to Code Manager's `skills-disabled/` directory. Symlinked Skills can be imported and toggled on or off, but their content is read-only and must be maintained in the source directory.

### The Difference Between Stats and Usage

- The Usage Statistics page reads `~/.claude.json` and shows the local Claude Code statistics snapshot (startup count, tool calls, Skill usage, the most recent session per project).
- The Token Usage page scans `~/.claude/projects/**/*.jsonl` and `subagents/*.jsonl`, aggregates tokens and cost by date, project, session, and model, and uses SQLite for incremental caching.

The two have different data sources and metrics. When investigating cost or tokens, prefer the Token Usage page.

## Quick Start

1. Download the installer for your platform from the project Release page, then install and launch it.
2. After the first launch, the application reads the local `~/.claude`, `~/.claude.json`, and `~/.claude/projects/`.
3. On macOS, if the first launch is blocked by the system, run `xattr -rd com.apple.quarantine /Applications/code-manager.app` to remove the quarantine attribute.

Recommended order for the first setup:

1. Open Settings in the lower-left corner and choose the interface language, theme, default terminal, and default editor.
2. Go to the Configurations page, create a configuration, and select a suitable built-in provider under the "Provider" option.
3. Fill in the authentication key and model configuration.
4. Click Test Model to confirm that the API endpoint, token, and model are available.
5. Click Enable to apply the configuration to `~/.claude/settings.json`.
6. Open the Directory Overview to confirm that the write to `settings.json` matches your expectations.

## Main Navigation

| Entry | Purpose |
| --- | --- |
| `AI` | Open or collapse the `~/.claude` Directory Overview |
| Configurations | Manage configurations, generate and apply Claude Code user settings |
| Memory | Manage `CLAUDE.md` and `rules/*.md` |
| Skills | Manage Claude Code Skills |
| Projects | View Claude project paths, Git status, worktrees, project-level `.claude/`, and AGENTS / Skills pairing status |
| History | View historical inputs and session details in `~/.claude/history.jsonl` |
| Stats | View the local statistics snapshot in `~/.claude.json` |
| Usage | View the token and cost aggregation in `~/.claude/projects/` |
| Settings | Adjust language, theme, tray, default terminal, default editor, and diagnostic entries |

On most pages, the add or edit action opens a drawer on the right that supports control mode, JSON mode, or preview. When the configuration, memory, or Skill editor has unsaved changes, closing or switching prompts you to save, discard, or continue editing.

## `~/.claude` Directory Overview

Click the `AI` entry in the upper-left corner to open it. After you select a file in the directory tree on the right, the preview area on the left opens a tab: Markdown shows the rendered preview by default (you can switch to source), other text files show their source, and binary files show only metadata. The bottom of the preview shows file size, modification time, encoding, and truncation status.

The file preview toolbar lets you copy the absolute path, reveal it in the file browser, and open it with the default editor; right-clicking in the directory tree lets you create a new file, create a new folder, rename, or delete. Deletion cannot be undone, so make sure you have a copy before handling `settings.json`, `CLAUDE.md`, `rules/`, or `skills/`.

The Directory Overview only allows operations on paths inside `~/.claude`; the scan skips symlinks and `node_modules`, and shows a notice when the entry count or depth limit is reached.

## Configurations

The Configurations page is the main entry point for managing Claude Code settings.

### Configuration List

Each card shows the name, description, whether it is applied, the primary model, the effort level, the permission mode, the Sandbox status, a plugin summary, and the result of the most recent model test. Available actions include create, enable (writing to `~/.claude/settings.json`), copy environment variables (generating `export KEY="value"` text), export the configuration file (optionally including or excluding the authentication key, with a preview of the final JSON before it is written to disk), duplicate, edit, delete, test all configurations at once, and drag to reorder. An enabled configuration also offers a one-click "sync common options and plugins to other configurations" action, which copies the current configuration's common options, plugin marketplaces, and enabled plugins to the remaining configurations, making it easy to unify a team baseline.

When the Configurations page finds an unmanaged `~/.claude/settings.json` and no configuration exists yet, it shows an import card. Importing takes over the current settings content in place and does not immediately rewrite the file. When a bound configuration is inconsistent with the real settings, the card shows a difference entry: choosing "Accept actual settings" writes the current file content back into the configuration; choosing "Re-apply" overwrites `settings.json` with the configuration's parsed result.

### Create or Edit a Configuration

The configuration editor on the right is divided into several sections.

- **Basic information**: name (required), description, optional provider (selecting one automatically fills in the connection endpoint and model mapping).
- **Authentication**: the authentication key is written to `env.ANTHROPIC_AUTH_TOKEN`; the API endpoint is written to `env.ANTHROPIC_BASE_URL`, and when it is not set, the model test uses the official Anthropic endpoint.
- **Models and behavior**: the default model (an editable dropdown whose candidates come from the current provider's models, or you can type a custom model), the effort level (`auto`/`low`/`medium`/`high`/`xhigh`/`max`), the Opus / Sonnet / Haiku default models (also editable dropdowns), the Subagent model, the reply language, and the output style.
- **Common options**: override common Claude Code switches such as deep thinking, thinking summaries, Fast Mode, disable Hooks, disable AI attribution, LSP tools, Tool Search, the new Init, no flicker, and Agent Teams. See the editor for the full list.
- **Environment variables**: maintain `env` keys other than authentication and common options. Duplicate keys, invalid JSON, or an unsaved row edit will block saving.
- **Permissions**: default mode, disable `bypassPermissions`, allow / deny / ask rules, additional directories, and recommended rule presets.
- **Sandbox**: can be enabled or disabled, with recommended presets to add; complex configurations can switch to JSON mode.
- **Hooks**: maintain Claude Code hooks with a summary view, add the built-in garbled-text check preset, and switch complex structures to JSON mode.
- **Plugin marketplaces**: maintain `extraKnownMarketplaces` with support for the official marketplace preset; each marketplace must fully specify the ID, source, repository or URL, path, package name, and install location.
- **Plugins**: maintain `enabledPlugins`, split into two tabs, "Configured" and "Browse marketplace". Browsing the marketplace currently supports only the `github` source; you can filter by marketplace / enabled status / category / source, and clicking enable immediately syncs it to the configured list.
- **Status line**: configure a custom status line command, and optionally enable the default status line preset (non-Windows writes `~/.claude/statusline.sh`; Windows writes `~/.claude/statusline.ps1` and automatically sets the PowerShell invocation command); if the target already exists with different content, you are prompted whether to overwrite.
- **Final configuration**: preview the final JSON after merging the provider with the configuration; the source JSON mode lets you maintain the entire settings object directly, and the preview automatically adds the schema URL.

### Model Test

After you click Test Model, a request is sent based on the current edits. The result dialog shows whether it succeeded, the model used and the returned model, the request endpoint, the status code, the elapsed time, the request ID, the stop reason, the input prompt, the returned content, the request / response headers, the request body, and the raw response, along with the ability to copy cURL and to modify the prompt and retest.

Model testing requires a valid `ANTHROPIC_AUTH_TOKEN` and an accessible model API.

## Providers

Providers are all built-in and read-only. They carry only objective provider information (the connection endpoint `ANTHROPIC_BASE_URL`, the model mapping, and optional additional environment variables) and contain no authentication keys. They currently cover Anthropic, DeepSeek, Zhipu GLM Coding Plan, Kimi Code Plan, MiniMax Token Plan, Xiaomi MiMo Token Plan, OpenRouter, Volcengine Ark Coding Plan, Alibaba Cloud Bailian Coding Plan, Wanjie Ark, and Ollama.

Custom providers are not supported. After you select a built-in provider under the "Provider" option in the configuration editor, its connection endpoint and model mapping are filled in automatically; you only need to add the authentication key and behavior settings. Clicking "View built-in providers" below that option opens a read-only overview where you can see each provider's name, ID, API endpoint, official documentation link, and recommended models.

## Memory Management

The Memory page is used to manage user-level Claude Code instructions.

When there is no primary memory, the top of the page shows the Karpathy behavior guide preset, which you can create and enable as `CLAUDE.md` with one click. When editing an existing `CLAUDE.md`-type memory, you can also append this preset to the bottom of the current content; Code Manager uses a preset marker to prevent duplicate insertion and provides a link to the original repository so you can check the source.

**Add a memory**: click Add Memory, fill in the name, choose the type (`CLAUDE.md` is written to `~/.claude/CLAUDE.md`, and only one can be enabled at a time; Rules are written to `~/.claude/rules/<path>.md`, multiple can be enabled at once, and `paths` glob matching is supported), write the Markdown content, and save. The real file is written to `~/.claude` only after you enable it in the list.

**Edit, duplicate, and delete**: editing updates the managed content and, when enabled, syncs the change to the real file; duplicating creates a disabled copy; deleting removes the managed record and cleans up rule directories that are no longer needed.

**Import local memories**: Code Manager detects files in `~/.claude/CLAUDE.md` and `~/.claude/rules/*.md` that have not yet been imported; clicking "Import to management" takes them over in place without immediately rewriting the content. Symlinked memories cannot be imported, and a path that is already occupied requires resolving the conflict first.

**Import from a directory**: click Import Memory and choose a directory containing `CLAUDE.md` or `rules/`; imported items are disabled by default. Common reasons for skipping: a duplicate `CLAUDE.md`, a Rule already exists at the same path, an invalid path, a read failure, or symlinks not being supported.

## Skills Management

The Skills page manages Claude Code Skills under `~/.claude/skills/`.

**Add a Skill**: click Add Skill, fill in the Skill name (the directory name / slash command, which allows only lowercase letters, digits, and hyphens), the display name, and the description, then write the `SKILL.md` body. You can set "manual trigger only" (writing `disable-model-invocation`) and "allow manual invocation".

**List operations**: each Skill supports enable / disable, edit `SKILL.md`, delete, open the directory in an external editor, and sync to `~/.codex/skills`. Enabled corresponds to `~/.claude/skills/<id>/`, and disabled corresponds to `skills-disabled/<id>/` under the application data directory.

**Import Skills**: you can select a single Skill directory, a Skill symlink, or a collection directory containing multiple Skills. Reasons for skipping include a name that does not match the rules, an item with the same name already exists, a missing valid `SKILL.md`, or an invalid symlink target. Symlinked Skills show a read-only notice and can be toggled and have their source directory opened, but their content cannot be modified inside the app.

**Supporting files**: the editor shows a tree of supporting files other than `SKILL.md`. It currently only shows the directory tree; to make changes, open the Skill directory in an external editor.

## Project Management

The Projects page extracts the project list from `~/.claude/history.jsonl`, sorted by most recent activity. Project details also read the project's real directory and show Git, worktrees, project-level Claude configuration, and local cleanup entries.

### Project List and Details

The list on the left shows the project short name, path, last active time, session and input counts, and the most recent session ID. After you click a project, details are shown on the right.

### Quick Actions

- Open the project in a terminal: uses the default terminal from Settings, with options filtered by the current platform and what is installed locally.
- Open the project in an editor: requires selecting a default editor in Settings first, with options filtered by platform and installation status.
- Open the source repository: uses the project's Git remote URL.

### Editor and Terminal Support Matrix

| Application | macOS | Linux | Windows |
| --- | --- | --- | --- |
| VS Code | Supported | Requires `code` CLI | Requires `code` CLI |
| Cursor | Supported | Requires `cursor` CLI | Requires `cursor` CLI |
| Windsurf | Supported | Requires `windsurf` CLI | Requires `windsurf` CLI |
| Zed | Supported | Requires `zed` CLI | Requires `zed` CLI |
| Terminal | Terminal.app | Tries `$TERMINAL`, `xdg-terminal-exec`, `x-terminal-emulator`, etc. in order | Tries Windows Terminal, PowerShell, cmd in order |
| iTerm | Supported | Not supported | Not supported |
| Warp | Supported | Requires `warp-terminal` CLI | Requires `warp.exe` or the official install path |
| Ghostty | Supported | Requires `ghostty` CLI | Not yet supported |

### Status Checks

The details page shows: whether the directory exists, whether it is a Git repository, the `CLAUDE.md` / `AGENTS.md` pairing status, the `.claude/skills` / `.agents/skills` pairing status, the project-level `.claude/` overview, local branches and recent commits, worktree paths and status, the last active time, session and input counts, the most recent session ID, the Git root directory, and the 5 most recent sessions (clickable to view details). Quick actions support opening a terminal, opening an editor, opening the source repository, jumping to this project's history, and jumping to this project's token usage.

### Project-Level Claude Configuration

Project-level Claude management is divided into three groups:

- Memory files: `CLAUDE.md ↔ AGENTS.md` two-way pairing. When either side is a real file, you can create a relative symlink for the other side; when neither side exists, when a regular file conflicts, or when there is an orphan symlink, no automatic handling is performed.
- Project-level Skills: `.claude/skills ↔ .agents/skills` two-way pairing. When either side is a real directory, you can create a relative symlink for the other side; when both sides are real directories, you must merge them manually.
- The project `.claude/` directory: open the Sheet on the right to browse, preview, and open project-level Claude files in an external editor. `settings.json` and `settings.local.json` support one-click creation; other project-level files can be previewed or opened externally, but cannot be created, deleted, or renamed in the project drawer.

### Branch and Worktree Cleanup

Project details can detect local branches and worktrees that have been merged or deleted on the remote and can be safely cleaned up. Cleanup always takes two steps: first a preview list is generated for you to select from, and deletion is performed only after confirmation; the backend only cleans up the entries listed in the preview.

### Clear Project Local Data

Right-click a project list item and choose Clear local data. The application first generates a dry-run deletion plan and only executes it after confirmation. This operation calls the Claude CLI to clear the project's saved local state, so review the plan carefully before executing it.

## Usage History

The History page reads `~/.claude/history.jsonl` and is used to review historical inputs and sessions.

The left side groups by project, the heatmap at the top shows recent history density, the search box filters by displayed text, and clicking a session opens the details drawer. The URL syncs the `project`, `q`, and `session` parameters so you can preserve filter state.

Session details show user messages, assistant messages, thinking summaries, tool calls and returns, commands, images, plan content, and system events. You can copy the project path, the session ID, or a single message, or open the raw session record file in an editor.

## Usage Statistics

The Stats page reads `~/.claude.json` and shows the local statistics snapshot (not a real-time computed result).

The page provides the startup count, the first-use date, the number of projects, the last Plan Mode usage time, the `btw` usage count, a tool call count chart, a Skill usage count list, and a list of each project's most recent session. Each project's most recent session shows the latest cost, session duration, lines added / removed, the various token types, the number of web searches, model details, the first prompt, frame, and Hook performance metrics.

The top of the page lets you refresh the data or open `~/.claude.json` in the default editor.

## Token Usage Statistics

The Usage page scans `~/.claude/projects/**/*.jsonl` and `subagents/*.jsonl`, extracts the usage field from assistant messages, and estimates cost based on the price table.

### Data Metrics

- Deduplicated globally by `message.id`; when the same message appears multiple times, the snapshot with the larger token usage is kept.
- Tokens include input, output, cache creation, and cache read; cost is estimated in units of USD / 1M tokens.
- Price table loading order: the local cache `model-pricing.json` → the built-in Anthropic fallback table → an update from models.dev on startup or manual refresh.
- models.dev only imports official provider prices: Anthropic, Moonshot / MoonshotAI, Z.ai / Zhipu / BigModel, MiniMax, Xiaomi / MiMo, DeepSeek. Among these, Kimi, MiMo, GLM, MiniMax, and DeepSeek are controlled by the "third-party model pricing" switch on the Settings page; when it is off, their cost is counted as 0.
- Tokens for other models whose price cannot be matched are still counted, but their cost is counted as 0 and they enter the unknown models list.

### Top Status and Actions

The top shows the price source (built-in / local cache / models.dev live). Action buttons: refresh prices, view the model price list (you can search by model to see input, output, cache write / read prices, and current usage), and rescan.

### Filtering

Supports filtering by date range, quick range (today, last 7 days, last 30 days, this week, this month, this year, all), project, and model (including `claude-*` aggregation). Reset returns to today.

### Charts and Tables

The page includes total spend, total tokens, session count, message count, cache savings, spend trend, token trend, model cost share, token composition, and detail tables by date, project, session, and model. The trend charts support splitting by model or token type, curve or bar style, and day / hour / 5-minute granularity; you can click a legend item to toggle its display, or double-click a legend item to show only that item. Clicking a session in the by-session table opens the message-level usage details.

## Desktop Usage Widget

The desktop usage widget is a small, always-on-top, semi-transparent, borderless window that lets you keep an eye on today's usage without opening the main interface. Once enabled, it stays present across all virtual desktops (macOS Spaces), does not appear in the taskbar, first appears in the lower-right corner of the screen, and remembers its position after you drag it. It is available on all three platforms.

- **Displayed metrics**: shows today's usage KPIs in real time, optionally cost, total tokens, cache hit rate, message count, session count, and top model. By default it shows the first three (cost, total tokens, cache hit rate), and you can customize the selection and order in Settings.
- **Data refresh**: the data shares the same source as the Usage page and refreshes automatically when records or prices change.
- **Quick jump**: clicking the body of the widget jumps to the Usage page in the main interface.
- **Appearance and toggle**: the opacity is adjustable, and the enable toggle along with the metrics and opacity settings are all in the settings drawer (see the "Desktop Usage Widget" settings subsection below).

## System Tray and Session Focus

Code Manager stays in the system tray (menu bar), with a menu divided into two parts:

- Main tray: switch the current configuration, quickly jump to each page, and quit the application. Switching the configuration is equivalent to enabling the corresponding configuration on the Configurations page.
- Session tray: reads `~/.claude/sessions/*.json` and summarizes the current Claude sessions by status (awaiting input / working / idle). Whether it is shown, the character limit, the session count style, and the pending breathing indicator are all adjusted in Settings (see below).

**Session focus**: on supported platforms, clicking a session entry or using the session focus shortcut returns you to the corresponding terminal tab. This capability is **macOS only**; it precisely focuses Terminal.app and iTerm2 via `pid → tty → AppleScript`, approximately matches Ghostty by working directory, and does not yet support Warp due to the lack of an official AppleScript. Linux and Windows do not support automatic focus, and clicking a session will not switch the terminal. See [Platform Support Differences](./platform-support.md) for details.

**LED light effect integration (macOS only)**: once enabled, the red/green status of the session tray is mirrored to the light effects of an external ANTICATER USB device, which is handy for getting a hardware light cue about session status when you are not watching the menu bar. The configuration entry is in the device integration area of Settings.

## Settings and Diagnostics

The Settings entry is in the lower-left corner. Settings are grouped into Interface, Menu Bar and Session Status, Device Integration, System Notifications and Pricing, and System Integration; the following order matches the settings drawer.

### Interface

- Interface language: Chinese / English.
- Theme appearance: light / dark / follow system.
- Collapse sidebar by default: after startup the sidebar shows only the menu icons; it still collapses automatically on narrow screens.

### Menu Bar and Session Status

- Show current configuration in the menu bar: shows the name of the currently active configuration next to the tray icon; the character limit can be set to off, up to N characters, or fully expanded.
- Show current session in the menu bar: shows the current Claude session and its status in a separate menu bar area.
- Session count style: number (`🔴 1 🟢 1`), superscript (`🔴¹ 🟢¹`), or compact (`🔴¹🟢¹`).
- Pending session breathing indicator: when there is a session awaiting input, the menu bar status shows a breathing-style pulse cue.

### Desktop Usage Widget

- Enable the desktop usage widget: when enabled, creates an always-on-top semi-transparent small window that shows today's usage metrics in real time (see "Desktop Usage Widget" above).
- Displayed metrics: multi-select the metrics to show in the widget (cost, total tokens, cache hit rate, message count, session count, top model), keeping at least one.
- Opacity: a slider adjusts the overall opacity of the widget, ranging from 30% to 100%, defaulting to 92%.

### Device Integration (macOS only)

- LED light effect integration: mirrors the tray session status to the light effects of an ANTICATER USB device. When you open Settings, the device is detected automatically, showing connected / no device detected / detecting status. The three states—awaiting your input, working / thinking, and done / idle—can each be assigned a light effect mode (off / clockwise / counterclockwise / alternating / jumping / blinking), and the test button next to each mode lights it up immediately for verification. The configuration can still be saved when no device is connected, and it takes effect once a device is attached.
- Session focus shortcut: registers a global shortcut for "focus the session that most needs attention". Click to record and press the key combination (which must include at least one modifier key ⌘/⌃/⌥/⇧); you can restore the default at any time.

> The entire Device Integration group is shown only on macOS; other platforms do not provide the LED or the global session focus shortcut.

### System Notifications and Pricing

- System notifications: used when a Claude session enters the pending state, and in scenarios such as when clicking a session to jump but terminal location fails. When enabled, system notification permission is requested first; if permission is denied, the setting stays off.
- Third-party model pricing: controls whether Kimi, MiMo, GLM, MiniMax, and DeepSeek are estimated using models.dev prices; when off, the cost of these models is counted as 0.

### System Integration

- Launch at startup: automatically launches Code Manager after you log in to the system.
- Default terminal, default editor: used by the "open in terminal / editor" actions on the Projects page and in the Directory Overview.

The available items come from a built-in support list and system detection; they do not automatically list every application on your computer, ensuring that each option has a clear open command and project path parameter. Editors on Linux and Windows require the corresponding CLI to be accessible in `PATH`; the default terminal on Windows prefers Windows Terminal and falls back to PowerShell and cmd on failure.

### Log Viewer

Click View Logs to open the log window, which supports filtering by level (all / error / warn / info / debug / trace), searching, refreshing, opening the log directory, and clearing logs. The log shows at most the 500 most recent matching results and indicates when results are truncated.

### System Information

The System Information window shows the Code Manager version, the operating system type / platform / version / family, the CPU architecture, the hostname, and the locale. Clicking Copy copies the information as a Markdown table, which is convenient for filing an issue or troubleshooting.

### Application Update

The application update card shows the current version and provides a "Check for updates" button: when a new version is found, clicking "Download and install" automatically downloads, installs, and restarts into the new version. The application also checks silently once on startup, and when a new version is found it only shows a Toast notice, leaving the decision to update up to you. Update packages are verified with an official minisign signature and pulled from GitHub Releases. Users who installed via Homebrew can also continue to upgrade with `brew upgrade`; both methods work.

## Local Data and Privacy

Code Manager mainly reads and writes local files. Configuration merging, directory scanning, usage aggregation, and log viewing are all done locally.

### Application-Managed Data

| Platform | Path |
| --- | --- |
| macOS | `~/.config/code-manager/` |
| Linux | `$XDG_CONFIG_HOME/code-manager/` or `~/.config/code-manager/` |
| Windows | `%APPDATA%\code-manager\` |

> This application deliberately reuses `~/.config/code-manager/` instead of the macOS-standard `~/Library/Application Support/...`, to make cross-platform sync backups and unified script access easier.

```text
<application data directory>/
  config-registry.json
  memories.json
  model-pricing.json
  skills-disabled/
```

### Claude Code User Directory and Inputs

```text
~/.claude/
  settings.json
  CLAUDE.md
  rules/
  skills/
  projects/        # input for the Usage page
  history.jsonl    # input for the Projects and History pages
  statusline.sh
~/.claude.json     # input for the Stats page
```

### Usage SQLite Cache

Maintained by the backend usage runtime via `sqlx`. The database is named `usage.db` and is located in the Tauri default application configuration directory (which is not the same location as the "application data directory"). When SQLite uses WAL mode, `usage.db-wal` and `usage.db-shm` may also appear in the same directory.

| Platform | Path |
| --- | --- |
| macOS | `~/Library/Application Support/com.gotobeta.app.code-manager/usage.db` |
| Linux | `$XDG_CONFIG_HOME/com.gotobeta.app.code-manager/usage.db` or `~/.config/com.gotobeta.app.code-manager/usage.db` |
| Windows | `%APPDATA%\com.gotobeta.app.code-manager\usage.db` |

### Log Directory

The file name is usually `code-manager.log`, and rotated files look like `code-manager_2026-04-29_09-13-00.log`.

| Platform | Path |
| --- | --- |
| macOS | `~/Library/Logs/com.gotobeta.app.code-manager/` |
| Linux | `$XDG_DATA_HOME/com.gotobeta.app.code-manager/logs/` or `~/.local/share/com.gotobeta.app.code-manager/logs/` |
| Windows | `%LOCALAPPDATA%\com.gotobeta.app.code-manager\logs\` |

## Common Workflows

### Create and Enable a Provider Configuration

1. Go to the Configurations page, create a configuration, select a built-in provider under the "Provider" option, and fill in the authentication key.
2. Adjust the default model, effort level, and common options as needed, then open the final configuration preview to confirm the `env` and permissions.
3. Click Test Model, and save once it succeeds.
4. Go back to the list and click Enable, then open the Directory Overview to check `settings.json`.

### Take Over an Existing `CLAUDE.md` and Rules

1. Go to the Memory page and click "Import to management" for the files you want to manage in the not-yet-imported group.
2. Check that the content and path match, and enable or disable them as needed.

### Create a Skill and Sync It to Codex

1. Go to the Skills page, add a Skill, and fill in a valid id, display name, and description.
2. Write `SKILL.md`, set whether automatic / manual invocation is allowed, and save it as enabled.
3. Click sync to `~/.codex/skills`.

### Troubleshoot a Model That Cannot Be Called

1. Edit the target configuration and confirm the authentication key, API endpoint, and model.
2. Click Test Model and check the status code, request endpoint, request body, and raw response in the result.
3. If necessary, copy the cURL to a terminal to reproduce it; if the failure is in the app's own save or invocation, go to Settings to view the logs.

### Troubleshoot Abnormal Cost or Tokens

1. Go to the Usage page, select the date range, project, and model, and check the total spend and composition.
2. Open the model price list and confirm whether the target model has a complete price; switch to the by-session table and click the abnormal session to view the message-level details.
3. A model appearing in the unrecognized list means its cost is counted as 0; you can try refreshing prices, and for third-party models confirm whether the pricing switch on the Settings page is on.

## Frequently Asked Questions

### Where is a configuration written after I enable it?

It is written to `~/.claude/settings.json`. The content is the final JSON after merging the provider `env` with the configuration's own settings, and it includes the Claude Code settings schema.

### Does deleting a configuration delete `settings.json`?

No. Deleting a configuration only removes the managed record and binding status; it does not clean up the `~/.claude/settings.json` that has already been written out.

### Why does the model test report a missing `ANTHROPIC_AUTH_TOKEN`?

The current configuration's final configuration has no usable authentication key. Fill it in the Authentication section, or confirm whether `env.ANTHROPIC_AUTH_TOKEN` in the JSON has been overridden to empty.

### Why are there no projects on the Projects page?

The Projects page comes from `~/.claude/history.jsonl`. After you use Claude Code and produce history records, the projects will appear in Code Manager.

### Why are the costs on the Stats page and the Usage page inconsistent?

The Stats page reads the local statistics snapshot from `~/.claude.json`; the Usage page scans `~/.claude/projects/**/*.jsonl` and re-estimates based on the current price table. The two have different data sources and calculation metrics.

### Why is the cost of some models 0?

The model is not in the price table, so the tokens are still counted but the cost is counted as 0. Kimi, MiMo, GLM, MiniMax, and DeepSeek are also counted as 0 when third-party model pricing is off. You can try refreshing prices, or enable third-party model pricing on the Settings page.

### Why can't I edit a symlinked Skill?

The source directory of a symlinked Skill is not within Code Manager's direct management scope. The application only allows toggling, importing, and opening the directory; the content must be maintained in the source directory.

### Is clearing project local data safe?

This operation first generates a dry-run deletion plan and only executes it after confirmation; it is used to clear the project local state saved by the Claude CLI. You must review the deletion plan before executing it to avoid accidentally deleting data you still need.

### Why don't I see the LED light effect integration or the session focus shortcut?

Both are provided on **macOS only** and are not shown in the Settings on Linux and Windows. The LED light effect also requires connecting an ANTICATER USB device: when the device integration area of Settings shows "No device detected", the light effect will not light up, so confirm that the device is connected, turn on the switch in that area, and choose a non-"off" light effect mode for the corresponding status.
