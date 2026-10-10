# Code Manager User Manual

[English](./user-manual.md) | [中文](./user-manual.zh-CN.md)

> [!NOTE]
> This document is intended for end users. The execution handbook for coding agents such as Claude Code / Codex is in [CLAUDE.md](../CLAUDE.md) at the repository root.

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
- [Cheat Sheet](#cheat-sheet)
- [System Tray and Session Focus](#system-tray-and-session-focus)
- [Settings and Diagnostics](#settings-and-diagnostics)
- [Local Data and Privacy](#local-data-and-privacy)
- [Common Workflows](#common-workflows)
- [Frequently Asked Questions](#frequently-asked-questions)

## Core Concepts

### Configuration

A configuration is the set of user preferences that can be applied to `~/.claude/settings.json`. It includes authentication keys, API endpoints, default models, permissions, Sandbox settings, Hooks, plugins, and the status line.

- **Provider Integration**: A configuration can reference a built-in provider. When applied, Code Manager merges the provider's preset environment variables (endpoints and model mappings) with the configuration's own settings, generates standard JSON, and writes it safely to `~/.claude/settings.json`.
- **Automatic Takeover**: If `~/.claude/settings.json` already exists on your machine and no configurations have been created yet, Code Manager detects it and offers to import it as a managed profile in place.
- **External Change Detection**: When the active configuration differs from the actual file on disk (e.g. modified by an external editor), a difference notice appears. You can review the diff and choose to either **Accept actual settings** or **Re-apply** your managed configuration.

### Provider

A provider carries objective endpoint information (API URL, official model mappings, and optional environment variables). It contains no private authentication keys and is built-in and read-only.

- **Override Rules**: When a configuration references a provider, matching keys in the configuration override the provider's `env` (except for the API endpoint: the provider's endpoint remains the single source of truth).
- See the [Providers](#providers) section for the complete list of built-in providers.

### Memory

Memories correspond to Claude Code's user-level system instruction files: `~/.claude/CLAUDE.md` and `~/.claude/rules/*.md`. Files are only written to disk once enabled in the UI.

- **`CLAUDE.md`**: The primary memory file. Only one can be active at a time, making it ideal as a long-term baseline instruction set.
- **Rules**: Modular rule files located in `~/.claude/rules/`. Multiple rules can be active simultaneously and support `paths` glob frontmatter for targeted file matching.

### Skills

Skills correspond to Claude Code custom capabilities located under `~/.claude/skills/<id>/SKILL.md`.

- **Enable / Disable**: Active skills reside in `~/.claude/skills/`. Disabled skills are safely moved to `skills-disabled/` in the application data directory to keep your Claude workspace clean.
- **Symlinked Skills**: Symlinked skills can be imported and toggled on or off. However, because their source files reside outside the managed directory, their content is read-only and must be edited in their original location.

### The Difference Between Stats and Usage

These two pages serve different purposes and draw from different data sources:

- **Usage Statistics (Stats)**: Reads the local snapshot from `~/.claude.json`, showing aggregate launch counts, tool calls, skill invocation numbers, and the most recent session summary per project.
- **Token Usage Statistics (Usage)**: Performs an incremental scan of `~/.claude/projects/**/*.jsonl` and `subagents/*.jsonl` log files, computing token counts and costs across dates, projects, sessions, and models via an embedded SQLite cache.

> [!TIP]
> Always use the **Token Usage Statistics** page when auditing actual token expenditure and accurate cost breakdowns.

## Quick Start

1. **Download and Install**: Download the installer for your operating system from the GitHub Releases page, install, and open the app.
2. **Initial Detection**: On launch, Code Manager automatically inspects existing local `~/.claude`, `~/.claude.json`, and `~/.claude/projects/` paths.
3. **macOS Quarantine Bypass (if needed)**: If Gatekeeper blocks the app on first launch, run:
   ```bash
   xattr -rd com.apple.quarantine /Applications/code-manager.app
   ```

Recommended initial setup order:

1. **General Preferences**: Open Settings (lower-left corner) to configure your preferred interface language, theme, default terminal, and editor.
2. **Create a Profile**: Go to Configurations and click **New Configuration**. Select a matching provider from the **Provider** dropdown.
3. **Fill Credentials**: Enter your API key and verify default model options.
4. **Test Connectivity**: Click **Test Model** to verify that endpoints, keys, and model mappings communicate properly.
5. **Apply Configuration**: Click **Enable** to apply the configuration directly to `~/.claude/settings.json`.
6. **Verify Overview**: Open the **`~/.claude` Directory Overview** to confirm the generated files and settings.

## Main Navigation

| Entry | Purpose |
| --- | --- |
| `AI` | Toggle the `~/.claude` directory tree overview and file preview workspace |
| **Configurations** | Manage configuration profiles; generate and apply Claude Code user settings |
| **Memory** | Manage user-level `CLAUDE.md` and modular `rules/*.md` files |
| **Skills** | Create, edit, toggle, and organize Claude Code Skills |
| **Projects** | View Claude projects, Git branch/worktree status, project-level `.claude/`, and rule pairings |
| **History** | Explore historical prompts, commands, and session replays from `~/.claude/history.jsonl` |
| **Stats** | Inspect local aggregate activity snapshots from `~/.claude.json` |
| **Usage** | Scan session logs in `~/.claude/projects/` to analyze token usage and cost metrics |
| **Cheat Sheet** | Located at the bottom of the sidebar; quick reference for shortcuts, slash commands, and flags |
| **Settings** | Configure app preferences, tray behavior, default tools, and diagnostics |

On most pages, adding or editing opens a dedicated right-side drawer supporting form controls, JSON mode, and live preview. When an editor has unsaved changes, closing the drawer or switching pages triggers an exit guard dialog to prevent accidental data loss.

## `~/.claude` Directory Overview

Click the `AI` badge in the upper-left corner to access the directory overview:

- **File Browsing & Preview**: Selecting any file in the tree opens a preview tab. Markdown files display rich formatting (with a raw source toggle), source code files render with syntax highlighting, and binary files display metadata. File size, modification time, encoding, and truncation status remain visible at the bottom.
- **Toolbar & Actions**: Copy absolute paths, reveal files in your system file manager, or open them in your default code editor. Right-click any tree item to create files, create folders, rename, or delete.
  > [!WARNING]
  > File deletions cannot be undone. Always verify backups before modifying or deleting `settings.json`, `CLAUDE.md`, `rules/`, or `skills/`.
- **Symlink Protection**: Symlinks are visually tagged and open in read-only mode. To prevent accidental modification of external workspaces, create, rename, and delete actions are strictly disabled on any path traversing a symlink. Scans ignore `node_modules` and warn if file count or depth limits are reached.

## Configurations

The Configurations page is your central control plane for managing Claude Code profiles.

### Configuration List

Each profile card highlights essential information: name, description, active status, primary model, effort level, permission mode, Sandbox state, plugin summary, and recent connectivity test results.

- **Comprehensive Actions**: Create, enable (writes to `~/.claude/settings.json`), copy environment variables (`export KEY="value"` syntax), export profiles (with optional secret inclusion and pre-save JSON preview), duplicate, edit, delete, and drag-and-drop to reorder.
- **Batch Model Testing**: Test connectivity for all managed profiles with a single click.
- **Baseline Sync**: In an active profile, click **Sync common options and plugins to other configurations** to propagate common switches, plugin marketplaces, and enabled plugins across all other profiles.
- **External Diff Tracking**: Detects unmanaged `~/.claude/settings.json` files on first launch. If an active file is modified externally, diff indicators let you choose between **Accept actual settings** or **Re-apply** to overwrite.

### Create or Edit a Configuration

The configuration drawer is organized into clean, functional sections:

- **Basic Information**: Profile name (required), description, and optional provider selection (which auto-populates endpoints and model mappings).
- **Authentication**: Authentication key (written to `env.ANTHROPIC_AUTH_TOKEN`) and API base URL (written to `env.ANTHROPIC_BASE_URL`; defaults to official Anthropic endpoints when omitted).
- **Models & Behavior**: Default model (editable dropdown with provider recommendations or custom text input), effort level (`auto`/`low`/`medium`/`high`/`xhigh`/`max`), Opus / Sonnet / Haiku model mappings, subagent models, preferred reply language, and output style.
- **Common Options**: Visual toggles for deep thinking, thinking summaries, Fast Mode, disable Hooks, disable AI attribution, LSP tools, Tool Search, new Init, no-flicker mode, subprocess credential scrubbing, and Agent Teams.
- **Environment Variables**: Manage custom `env` key-value pairs with duplicate key detection and JSON syntax validation.
- **Permissions**: Default permission mode, disable `bypassPermissions` toggle, allow / deny / ask rules, trusted directories, and recommended security presets.
- **Sandbox**: Toggle sandbox isolation with recommended presets; switch to JSON mode for advanced configurations.
- **Hooks**: Maintain lifecycle hooks with an interactive summary view; includes built-in presets and JSON mode support.
- **Plugin Marketplaces**: Manage `extraKnownMarketplaces` with built-in templates for official (`claude-plugins-official`) and community (`claude-community`) marketplaces.
- **Plugins**: Manage `enabledPlugins` across **Configured** and **Browse marketplace** tabs. Filter by marketplace, status, and category with real-time toggle syncing.
- **Status Line**: Configure custom status line commands. Includes presets for macOS/Linux (`~/.claude/statusline.sh`) and Windows (`~/.claude/statusline.ps1` with PowerShell invocation), complete with a 60-second idle refresh interval to keep prompt cache countdowns accurate.
- **Final Configuration**: Live preview of the merged JSON output; includes a raw JSON mode to directly edit the underlying settings document.

### Model Test

Clicking **Test Model** sends an immediate verification request using the currently edited configuration:

- **Detailed Diagnostics**: View connection status, request and response model names, endpoint URL, HTTP status code, response latency, Request ID, stop reason, prompts, output tokens, headers, request payload, and raw responses.
- **Practical Utilities**: Copy full cURL commands to test directly in your terminal, or modify the test prompt on the fly.
- **Gateway Compatibility**: For API gateways requiring per-session identification headers (e.g. OpenCode Go), the test runner generates and injects them automatically.

### Deep Link Import

Import Claude configurations directly into Code Manager via custom system URLs using the `code-manager://profiles/import` scheme.

- **Two Mutual Exclusive Sources**:
  - **Embedded Payload**: `payload=` (base64url-encoded raw settings JSON; ~16KB decoded limit).
  - **Remote URL**: `url=` (HTTPS only; fetched securely by the app with SSRF protections and size limits).
- **Prefilled Metadata**: Optional `name` and `description` parameters prefill the import dialog.
- **Safe by Default**: Resolving a link opens the configuration preview dialog. Confirming **creates a new profile** with an empty `providerId` and **never** automatically applies or overwrites `~/.claude/settings.json`.
- **Secret Protection**: Payloads containing sensitive credentials require explicit user confirmation before importing. Copying deep links from existing profiles excludes secrets by default.
- **Queueing**: Opening multiple deep links queues them sequentially, ensuring unconfirmed imports remain available across navigation.

## Providers

Providers are strictly **built-in and read-only**. They carry objective service endpoint configurations (`ANTHROPIC_BASE_URL`, model mappings, and default environment variables) without storing private credentials.

- **Supported Ecosystems**: Covers Anthropic, DeepSeek, Zhipu GLM Coding Plan, Kimi Code Plan, MiniMax Token Plan, Xiaomi MiMo Token Plan, OpenRouter, Volcengine Ark Coding Plan, Wanjie Ark, OpenCode Go, and local Ollama deployments.
- **Usage**: Select any provider from the dropdown to automatically populate connection URLs and recommended model mappings. Click **View built-in providers** below the dropdown to inspect official docs, endpoint specs, and gateway headers.

## Memory Management

The Memory page manages user-level Claude Code instruction files.

- **Karpathy Behavior Guide Preset**: When no primary memory exists, a banner offers to create and enable Karpathy's guidelines as `CLAUDE.md` with one click. When editing existing memories, the preset can be appended to the bottom (protected against duplicate insertions).
- **Creating Memories**: Enter a name, select a type (`CLAUDE.md` written to `~/.claude/CLAUDE.md`, strictly single-active; Rules written to `~/.claude/rules/<path>.md`, multiple active with `paths` glob matching), and edit the Markdown content. Files are only written to disk when enabled.
- **Maintenance**: Edit content, clone disabled duplicates, or delete obsolete rule files and folders.
- **Importing**:
  - **Local Detection**: Automatically discovers unmanaged `CLAUDE.md` and `rules/*.md` files in `~/.claude` for in-place takeover.
  - **Directory Import**: Select an external folder to batch-import instruction files in disabled state; duplicates and invalid symlinks are skipped automatically.

## Skills Management

The Skills page organizes custom capabilities stored under `~/.claude/skills/`.

- **Create a Skill**: Provide an ID (directory and slash command name; lowercase letters, numbers, and hyphens only), display name, description, and `SKILL.md` body. Optionally configure manual invocation restrictions (`disable-model-invocation`).
- **State Management & Archival**:
  - **Enabled**: Stored in `~/.claude/skills/<id>/`.
  - **Disabled**: Moved to `skills-disabled/<id>/` in the application data directory to keep your Claude workspace uncluttered.
  - One-click symlink syncing to `~/.codex/skills`.
- **Importing Skills**: Import individual skill directories, symlinks, or multi-skill parent folders. Symlinked skills display a read-only tag; they can be toggled and opened, but editing must take place in the source directory.
- **Supporting Assets**: Browse auxiliary scripts, prompts, and templates within the skill directory; launch external editors for complex multi-file edits.

## Project Management

The Projects page extracts project history from `~/.claude/history.jsonl`, ordered by recent activity. Selecting a project inspects its working directory for Git state, worktrees, and project-level Claude configurations.

### Project List and Details

The left-side list shows project basenames, paths, last active timestamps, session and prompt counts, and the latest Session ID. Clicking any project loads its details on the right.

### Quick Actions

- **Open in Terminal**: Launches your default terminal configured in Settings, tailored to your operating system.
- **Open in Editor**: Launches your selected code editor.
- **Open Remote Repository**: Resolves the Git remote URL and opens it in your default web browser.

### Editor and Terminal Support Matrix

| Tool | macOS | Linux | Windows |
| --- | --- | --- | --- |
| VS Code | Native application | Requires `code` CLI | Requires `code` CLI |
| Zed | Native application | Requires `zed` CLI | Requires `zed` CLI |
| Terminal | Terminal.app | Falls back: `$TERMINAL`, `xdg-terminal-exec`, `x-terminal-emulator` | Falls back: Windows Terminal, PowerShell, cmd |
| iTerm2 | Fully supported | Not supported | Not supported |
| Ghostty | Fully supported | Requires `ghostty` CLI | Not yet supported |

### Status Checks

Project details provide health checks and diagnostics:
- Directory existence, Git repository detection, current branch, recent commits, and active worktrees.
- `CLAUDE.md ↔ AGENTS.md` pairing status and `.claude/skills ↔ .agents/skills` directory pairing status.
- Recent session timelines (clickable to inspect full message replays).
- Quick navigation to project-specific history or token usage.

### Project-Level Claude Configuration

Provides three core integration tools for project-level workflows:
- **Instruction Pairing**: Bidirectional relative symlink creation between `CLAUDE.md ↔ AGENTS.md` ensures cross-agent compatibility.
- **Skill Pairing**: Bidirectional symlinking between `.claude/skills ↔ .agents/skills`.
- **Project `.claude/` Drawer**: Browse project-level Claude files in a slide-out drawer, with one-click creation of `settings.json` and `settings.local.json`.

### Branch and Worktree Cleanup

Scans for local branches and worktrees that have already been merged or deleted on remote repositories.
- **Safe Two-Step Operation**: Generates an interactive preview list; deletion only executes after user confirmation, ensuring unlisted items are never touched.

### Clear Project Local Data

Right-click any project item to initiate local data cleanup. The app runs a dry-run plan via the Claude CLI, prompting for user confirmation before clearing local project state.

## Usage History

The History page parses `~/.claude/history.jsonl` to review past prompts and complete interaction sessions.

- **Filtering & Search**: Grouped by project on the left; displays interaction density heatmaps; text search filters history entries; URLs sync `project`, `q`, and `session` query parameters.
- **Session Replay**: The detail drawer reconstructs the interaction timeline, displaying user prompts, assistant replies, thinking summaries, tool invocations, shell commands, images, plans, and system events.
- **Utilities**: Copy paths, session IDs, or individual messages, or launch the raw `.jsonl` log file in your external editor.

## Usage Statistics

The Stats page displays the static telemetry snapshot stored in `~/.claude.json` (not real-time computed runtime figures).

- **High-Level Metrics**: Cumulative launches, first-use date, total projects, last Plan Mode timestamp, and `btw` invocation count.
- **Charts & Rankings**: Tool invocation frequency charts and skill usage rankings.
- **Recent Project Sessions**: Lists the most recent session per project, including estimated cost, duration, lines added/removed, token breakdowns, web search counts, and initial prompts.

## Token Usage Statistics

The Usage page analyzes `~/.claude/projects/**/*.jsonl` and `subagents/*.jsonl` log files, extracting `usage` payloads from assistant messages and pricing them against standard pricing tables.

### Data Metrics

- **Deduplication**: Deduplicated globally by `message.id`; when duplicates occur, the snapshot with higher token counts is preserved.
- **Token Composition**: Covers Input, Output, Cache Creation, and Cache Read tokens; costs are normalized in USD / 1M tokens.
- **Pricing Resolution**: Local cache `model-pricing.json` → Built-in Anthropic fallback table → Live models.dev updates on startup or manual refresh.
- **Official Providers**: models.dev imports pricing for official providers (Anthropic, Moonshot/Kimi, Zhipu GLM, MiniMax, Xiaomi MiMo, DeepSeek). Third-party Chinese models can be toggled via the **Third-party model pricing** switch in Settings (costs count as 0 when disabled).
- **Unrecognized Models**: Models not found in pricing tables still track token counts, but costs are registered as 0 and categorized under unknown models.

### Top Status and Actions

Displays the current price table source (built-in, local cache, or models.dev live), with buttons to refresh prices, view the model pricing table, or trigger a full rescan.

### Filtering

Filter by custom date ranges, quick presets (Today, Last 7 Days, Last 30 Days, This Week, This Month, This Year, All Time), target projects, and models (including `claude-*` wildcards).

### Charts and Tables

- **Summary Cards**: Total spend, total tokens, session counts, message counts, and prompt cache savings.
- **Trend Charts**: Spend and token trends split by model or token type, rendered as curves or bars across daily, hourly, or 5-minute granularities.
- **Breakdown Tables**: Comprehensive tables grouped by date, project, session, and model; click any session to inspect message-level token waterfall charts.

## Desktop Usage Widget

An always-on-top, translucent, borderless desktop mini-window that tracks today's usage without keeping the main application open.

- **Desktop Integration**: Persists across all macOS Spaces, bypasses the taskbar, initializes in the lower-right corner, remembers drag coordinates, and runs across all three platforms.
- **Customizable KPIs**: Displays today's essential metrics (cost, total tokens, cache hit rate, message count, session count, top model) with custom selection and ordering in Settings.
- **Real-Time Sync**: Shares the analytics engine cache and refreshes automatically when logs or pricing tables update.
- **Instant Access**: Click the widget body to launch Code Manager directly to the Usage page.
- **Appearance**: Adjust overall opacity from 30% to 100% in Settings.

## Cheat Sheet

Accessible at the bottom of the sidebar, the Cheat Sheet provides a quick-reference guide that adapts to your active interface language:
- Covers keyboard shortcuts, MCP server setups, slash commands, memory rules, best practices, configuration and environment variables, subagents, CLI flags, and permission modes.
- Includes an anchor table of contents on the right for navigation.

## System Tray and Session Focus

Code Manager stays accessible in the system tray / menu bar with two primary sections:

- **Main Menu**: Switch active configuration profiles, jump to application pages, or exit the app. Switching profiles here is identical to enabling them in the Configurations page.
- **Session Menu**: Monitors `~/.claude/sessions/*.json`, summarizing active sessions by operational state (waiting for input, busy/thinking, idle).

### Session Focus (macOS only)

On supported setups, clicking any session entry or pressing the **Session Focus Shortcut** brings the target terminal window and tab directly into focus:
- **Terminal.app & iTerm2**: Leverages `pid → tty → AppleScript` for terminal tab matching.
- **Ghostty**: Matches the `tty` property, falling back to unique working directories.
- **Platform Limits**: Linux and Windows do not support automatic terminal focusing. See [Platform Support Differences](./platform-support.md).

### LED Hardware Integration (macOS only)

Mirrors session tray status (red/green) directly to external ANTICATER USB device LEDs, providing hardware ambient cues when working away from your screen.

## Settings and Diagnostics

Located in the lower-left corner, Settings presents a card-based drawer organized into clean sections:

### Interface

- **Interface Language**: English / Simplified Chinese.
- **Theme Appearance**: Light / Dark / Follow System.
- **Collapse Sidebar by Default**: Starts with a collapsed, icon-only sidebar to maximize screen space.

### Menu Bar and Session Status

- **Show Active Configuration in Menu Bar**: Displays the active profile name alongside the tray icon (off, truncated to N characters, or full width).
- **Show Current Session in Menu Bar**: Shows Claude session indicators in a separate menu bar item.
- **Session Count Style**: Standard numbers (`🔴 1 🟢 1`), superscripts (`🔴¹ 🟢¹`), or compact badges (`🔴¹🟢¹`).
- **Pending Session Breathing Indicator (macOS only)**: Displays a pulsating animation when sessions require user attention.
- **Session Focus Shortcut (macOS only)**: Register a custom global hotkey to jump immediately to the session requiring attention.

### Desktop Usage Widget

- **Enable Desktop Widget**: Toggle the floating usage window.
- **Displayed Metrics**: Choose and order the metrics displayed on the widget.
- **Opacity Slider**: Smoothly adjust widget transparency from 30% to 100% (default 92%).

### LED Light Effects (macOS only)

Automatically discovers connected ANTICATER USB hardware:
- Assign lighting patterns (off, clockwise, counterclockwise, alternating, jumping, blinking) to three session states: waiting for input, working/thinking, and done/idle.
- Test buttons provide instant hardware verification.

### Prevent Sleep (macOS only)

Prevents system sleep during long-running tasks:
- **Sleep Prevention Mode**:
  - **Off**: Standard system sleep behavior.
  - **While active**: Prevents sleep only while Claude Code sessions are actively running.
  - **Always**: Keeps system awake unconditionally.
- **Keep Display Awake**: Independently controls whether displays stay awake or dim according to system policies.
- **Live Indicators**: Displays power assertion indicators in Settings and tray menus.

### System Notifications, Sounds, and Pricing

- **System Notifications**: Alerts when sessions need attention, when terminal jumps fail, or when cache hit rates drop below thresholds (default 90%, adjustable from 10% to 99%).
- **Notification Sounds**: Plays audio cues when input is needed (Glass, Submarine, Hero, Ping, Sosumi, Tink).
- **Third-Party Model Pricing**: Controls whether Chinese model costs are calculated using models.dev pricing tables.

### System Integration

- **Launch at Startup**: Automatically launches Code Manager upon system login.
- **Default Terminal & Editor**: Configures preferred applications for external launching actions across projects and file trees.

### Log Viewer

Click **View Logs** to open the dedicated log viewer:
- Filter by log level (All / Error / Warn / Info / Debug / Trace), perform text search, refresh, or clear logs.
- Secrets and tokens are redacted before logs are written to disk.
- Direct button to open the log directory in your system file explorer.

### System Information

Collects application versions, OS distribution/kernel/family, CPU architecture, hostname, and locale settings. Includes a **Copy Markdown** button for issue reporting and troubleshooting.

### Application Update

The update card displays the current version and release channel:
- Manual **Check for Updates** button to download, verify, and restart with one click.
- Silent startup checks notify you via non-intrusive toast messages.
- Packages are verified against official minisign cryptographic signatures.
- Homebrew users can continue using `brew upgrade`; in-app and Homebrew versions automatically align on subsequent checks.

## Local Data and Privacy

Code Manager follows a strict **Local-First** privacy architecture. Configuration merging, directory scanning, token calculation, and log inspection execute entirely offline on your machine. No user code, prompts, or configurations are transmitted to remote servers.

### Application-Managed Data

| Platform | Path |
| --- | --- |
| macOS | `~/.config/code-manager/` |
| Linux | `$XDG_CONFIG_HOME/code-manager/` or `~/.config/code-manager/` |
| Windows | `%APPDATA%\code-manager\` |

> [!NOTE]
> On macOS, the app uses `~/.config/code-manager/` instead of `~/Library/Application Support/...` to facilitate unified script access and cross-platform backup workflows.

```text
<application data directory>/
  config-registry.json    # Managed configuration registry
  memories.json           # Managed memories and rules
  model-pricing.json      # Local model pricing cache
  skills-disabled/        # Disabled skills archive
```

### Claude Code User Directory and Inputs

```text
~/.claude/
  settings.json           # Active Claude Code settings
  CLAUDE.md               # Active primary memory
  rules/                  # Active modular rules
  skills/                 # Active custom skills
  projects/               # Log inputs for Token Usage page
  history.jsonl           # Input for Projects and History pages
  statusline.sh           # Custom status line script
~/.claude.json            # Telemetry input for Stats page
```

### Usage SQLite Cache

Maintained by the backend runtime via `sqlx` in the default application data directory (isolated from the application data directory above):

| Platform | Path |
| --- | --- |
| macOS | `~/Library/Application Support/com.gotobeta.app.code-manager/usage.db` |
| Linux | `$XDG_CONFIG_HOME/com.gotobeta.app.code-manager/usage.db` or `~/.config/com.gotobeta.app.code-manager/usage.db` |
| Windows | `%APPDATA%\com.gotobeta.app.code-manager\usage.db` |

### Log Directory

Primary logs are named `code-manager.log`, with rotated archives formatted as `code-manager_2026-04-29_09-13-00.log`:

| Platform | Path |
| --- | --- |
| macOS | `~/Library/Logs/com.gotobeta.app.code-manager/` |
| Linux | `$XDG_DATA_HOME/com.gotobeta.app.code-manager/logs/` or `~/.local/share/com.gotobeta.app.code-manager/logs/` |
| Windows | `%LOCALAPPDATA%\com.gotobeta.app.code-manager\logs\` |

## Common Workflows

### Create and Enable a Provider Configuration

1. **Create Profile**: Go to Configurations, click **New Configuration**, pick a built-in provider, and enter your API credentials.
2. **Fine-Tune Options**: Adjust default models and common toggles, then inspect the **Final Configuration Preview** to confirm your `env` and permissions.
3. **Test Connectivity**: Click **Test Model**; once verified, save the profile.
4. **Activate & Verify**: Click **Enable** in the profile list, then switch to the **`~/.claude` Directory Overview** to confirm `settings.json` has been updated.

### Take Over an Existing `CLAUDE.md` and Rules

1. **Discover Files**: Navigate to the Memory page and locate discovered unmanaged files in the **Not Imported** section.
2. **Import & Enable**: Click **Import to management** to take over files in place, reviewing paths and toggling active status as needed.

### Create a Skill and Sync It to Codex

1. **Define Skill**: Go to Skills, click **Add Skill**, and enter a valid ID, display name, and description.
2. **Draft Content**: Write your `SKILL.md` body, configure invocation triggers, and save in the enabled state.
3. **Establish Symlink**: In the skill card menu, click **Sync to `~/.codex/skills`** to link the skill across tools.

### Troubleshoot a Model That Cannot Be Called

1. **Verify Credentials**: Edit the active profile to confirm your API key, endpoint Base URL, and model identifier.
2. **Run Diagnostics**: Click **Test Model** and inspect the returned HTTP status code, error messages, and raw responses.
3. **Reproduce**: Copy the generated cURL command to verify directly in your terminal. For app-level errors, inspect **Settings → Diagnostics → View Logs**.

### Troubleshoot Abnormal Cost or Tokens

1. **Isolate Scope**: On the Token Usage page, filter by date range, project, and model to pinpoint spending anomalies.
2. **Audit Unit Rates**: Open the model pricing table to verify that pricing data exists for the model. Drill down into individual sessions in the session table to review message-level token waterfalls.
3. **Zero-Cost Models**: If a model appears under unknown models, click **Refresh Prices**. For third-party Chinese models, check that third-party pricing is enabled in Settings.

## Frequently Asked Questions

### Where is a configuration written after I enable it?

**Written directly to `~/.claude/settings.json`.**
The file contains the merged result of provider presets and custom profile settings, formatted as standard JSON with schema references for IDE autocompletion.

### Does deleting a configuration delete `settings.json`?

**No.**
Deleting a configuration only removes the managed profile from Code Manager's internal registry. It will never delete or wipe existing files on disk.

### Why does the model test report a missing `ANTHROPIC_AUTH_TOKEN`?

**No valid credentials were found in the active configuration.**
Ensure you entered an API key under Authentication, or verify that `env.ANTHROPIC_AUTH_TOKEN` has not been overridden with an empty value in JSON mode.

### Why are there no projects on the Projects page?

**No Claude Code history exists yet on your machine.**
The Projects page indexes `~/.claude/history.jsonl`. Once you conduct your first Claude Code session in any terminal, projects will populate automatically.

### Why are the costs on the Stats page and the Usage page inconsistent?

**They use different data sources and accounting methods.**
The Stats page reads the static telemetry snapshot from `~/.claude.json`, whereas the Usage page scans raw `.jsonl` session files across all projects and prices them against active pricing tables.

### Why is the cost of some models 0?

**The model lacks pricing data or third-party pricing is disabled.**
When a model is not indexed by models.dev, token counts are tracked but unit prices default to 0. Similarly, Chinese models register as 0 if the third-party pricing toggle is turned off in Settings.

### How do I update Claude Code plugins?

**Run update commands in your terminal.**
Code Manager manages `enabledPlugins` and `extraKnownMarketplaces` in your configuration, but does not download or build plugin files. In your terminal, run `claude plugin update <plugin>@<marketplace>` or `/plugin marketplace update <marketplace>`. You can also set `autoUpdate: true` in your profile settings. See official documentation: [Discover and install plugins](https://code.claude.com/docs/en/discover-plugins).

### Why can't I edit a symlinked Skill?

**Symlink source targets reside outside the managed directory.**
To prevent unintended modifications to external repositories, Code Manager only supports toggling, importing, and opening symlinked skills. Edit the files directly in their original source directories.

### Is clearing project local data safe?

**It includes dry-run planning, but should be used with care.**
This action clears local context caches saved by the Claude CLI for the project. Code Manager displays a dry-run preview of files scheduled for deletion before requiring your explicit confirmation.

### Why don't I see the LED light effect integration or the session focus shortcut?

**Both capabilities are exclusive to macOS.**
These settings cards are automatically hidden on Linux and Windows. Additionally, LED effects require a physically connected ANTICATER USB device with enabled status modes.
