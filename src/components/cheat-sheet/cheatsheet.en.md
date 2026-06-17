# Claude Code Cheat Sheet

## ⌨️ Keyboard Shortcuts

### General Controls

| Key / Command | Description |
| --- | --- |
| `Ctrl + C` | Cancel input/generation |
| `Ctrl + D` | Exit session |
| `Ctrl + L` | Clear prompt input + force full screen redraw |
| `Ctrl + O` | Toggle transcript viewer (verbose tool usage); cycles focus view in fullscreen (NEW) |
| `Ctrl + U` | Clear entire input buffer |
| `Ctrl + Y` | Restore cleared input buffer |
| `Ctrl + G` | Open in editor (same as Ctrl+X Ctrl+E) |
| `Ctrl + R` | Reverse search history |
| `Ctrl + X + Ctrl + K` | Kill all background agents (press twice to confirm) |
| `Ctrl + B` | Background running tasks |
| `Ctrl + T` | Toggle task list |
| `Esc + Esc` | Rewind or summarize |

### Mode Switching

| Key / Command | Description |
| --- | --- |
| `Shift + Tab` | Cycle permission modes (default → acceptEdits → plan → …) |

### Mac Option Keys (configure Option as Meta)

| Key / Command | Description |
| --- | --- |
| `⌥ + P` | Switch model |
| `⌥ + T` | Toggle extended thinking |
| `⌥ + O` | Toggle fast mode |

### Input

| Key / Command | Description |
| --- | --- |
| `\ + Enter` | Newline |
| `v` | Vim visual mode (char selection + operators) (NEW) |
| `V` | Vim visual-line mode (NEW) |

### Prefixes

| Key / Command | Description |
| --- | --- |
| `/` | Slash command |
| `!` | Direct bash |
| `@` | File mention + autocomplete |

## 🔌 MCP Servers

### Add Servers

| Key / Command | Description |
| --- | --- |
| `--transport http` | Remote HTTP (recommended) |
| `--transport stdio` | Local process |
| `--transport sse` | Remote SSE |

### Scopes

| Key / Command | Description |
| --- | --- |
| `Local` | ~/.claude.json (you only) |
| `Project` | .mcp.json (shared/VCS) |
| `User` | ~/.claude.json (global) |

### Manage

| Key / Command | Description |
| --- | --- |
| `/mcp` | Interactive UI |
| `claude mcp list` | List all servers |
| `alwaysLoad: true` | Keep server connected across all sessions (server config) (NEW) |
| `maxResultSizeChars` | _meta["anthropic/maxResultSizeChars"] raises per-tool text threshold (up to 500K chars) (NEW) |

## ⚡ Slash Commands

### Session

| Key / Command | Description |
| --- | --- |
| `/clear` | Clear conversation |
| `/compact [focus]` | Compact context |
| `/branch [name]` | Branch conversation (/fork alias) |
| `/usage` | Token usage, cost and cache breakdown (replaces /cost//stats) (NEW) |
| `/context` | Visualize context (grid) |
| `/diff` | Interactive diff viewer |
| `/copy [N]` | Copy last (or Nth) response |
| `/recap` | Summarize session context when returning (NEW) |
| `/undo` | Alias for /rewind (NEW) |
| `/rewind` | Rewind conv / code checkpoint |
| `/export` | Export conversation |
| `/plan [desc]` | Enter plan mode directly |
| `/resume [session]` | Resume by ID/name |
| `/focus` | Toggle focus view (fullscreen only) (NEW) |
| `/goal [desc]` | Set completion goal; Claude works until met with live progress overlay (NEW) |

### Config

| Key / Command | Description |
| --- | --- |
| `/config [key [value]]` | View/set settings (persists to ~/.claude/settings.json) (NEW) |
| `/model [model]` | Switch model (←→ effort) (NEW) |
| `/fast [on\|off]` | Toggle fast mode |
| `/theme [name]` | Create and switch named custom themes; includes "Auto (match terminal)" dark/light (NEW) |
| `/permissions` | View/update permissions |
| `/effort [level]` | Set effort (low/medium/high/xhigh/max); opens interactive slider with arrow keys when called without args |
| `/color [color]` | Set prompt-bar color |
| `/keybindings` | Customize keyboard shortcuts |
| `/scroll-speed [speed]` | Adjust output scroll speed (NEW) |
| `/terminal-setup` | Configure terminal keybindings |

### Tools

| Key / Command | Description |
| --- | --- |
| `/init` | Create CLAUDE.md |
| `/memory` | Edit CLAUDE.md files, toggle auto memory, view entries |
| `/mcp` | Manage MCP servers |
| `/hooks` | Manage hooks |
| `/skills` | List available skills |
| `/reload-skills` | Reload skills without restarting (NEW) |
| `/agents` | Manage agent configurations (NEW) |
| `/workflows` | View and manage background multi-agent workflow runs (NEW) |
| `/review [PR]` | Review PR locally |
| `/ultrareview [PR#]` | Cloud code review — parallel multi-agent analysis |
| `/security-review` | Scan diff for vulnerabilities |
| `/loop [interval] [prompt]` | Recurring task (/proactive alias) (NEW) |
| `/ide` | IDE integrations status |
| `/add-dir <path>` | Add working directory |

### Special

| Key / Command | Description |
| --- | --- |
| `/btw <question>` | Ask a side question without adding to the conversation |
| `/extra-usage` | Extra usage when rate limited |
| `/voice` | Toggle push-to-talk voice dictation |
| `/doctor` | Diagnose installation |
| `/insights` | Analyze sessions report |
| `/desktop` | Continue in Desktop app |
| `/rename [name]` | Rename current session |
| `/help` | Show help + commands |
| `/feedback` | Submit feedback (alias: /bug) |

## 📁 Memory & Files

### CLAUDE.md Locations

| Key / Command | Description |
| --- | --- |
| `./CLAUDE.md or ./.claude/CLAUDE.md` | Project (team-shared) |
| `./CLAUDE.local.md` | Local personal project notes (gitignored) |
| `~/.claude/CLAUDE.md` | Personal (all projects) |
| `/etc/claude-code/CLAUDE.md` | Managed policy (Linux/WSL, org-wide) |

### Rules & Import

| Key / Command | Description |
| --- | --- |
| `.claude/rules/*.md` | Project rules |
| `~/.claude/rules/*.md` | User rules |
| `paths: frontmatter` | Path-specific rules |
| `@path/to/file` | Import in CLAUDE.md |

### Auto Memory

| Key / Command | Description |
| --- | --- |
| `~/.claude/projects/<proj>/memory/` | MEMORY.md auto-loads at startup (first 25KB or 200 lines); topic files load on demand |

## 🧠 Workflows & Tips

### Plan Mode

| Key / Command | Description |
| --- | --- |
| `Shift + Tab` | Normal → Auto-Accept → Plan |
| `--permission-mode plan` | Start in plan mode |
| `Plan file naming` | Files named after your prompt (e.g. fix-auth-race-snug-otter.md) |

### Thinking & Effort

| Key / Command | Description |
| --- | --- |
| `Alt + T` | Toggle thinking on/off |
| `"ultrathink"` | Max effort for turn |
| `Ctrl + O` | See thinking (verbose) |
| `/effort` | ○ low · ◐ medium · ● high · ★ xhigh · ★★ max |

### Auto Mode Denied

| Key / Command | Description |
| --- | --- |
| `/permissions → Recent` | Retry denied with R (NEW) |

### Git Worktrees

| Key / Command | Description |
| --- | --- |
| `--worktree name` | Isolated branch per feature |
| `isolation: worktree` | Agent in own worktree |
| `sparsePaths` | Checkout only needed dirs |
| `workspace.git_worktree` | Status line JSON: linked worktree path (NEW) |
| `/batch` | Auto-creates worktrees |

### Voice Mode

| Key / Command | Description |
| --- | --- |
| `/voice` | Enable push-to-talk |
| `Space` | Record, release to send |
| `20 languages` | EN, ES, FR, DE, CZ, PL… |

### Context Management

| Key / Command | Description |
| --- | --- |
| `/context` | Usage + optimization tips |
| `/compact [focus]` | Compress with focus |
| `1M context` | Opus 4.6 (Max/Team/Ent) |

### Session Power Moves

| Key / Command | Description |
| --- | --- |
| `claude -c` | Continue last conv |
| `claude -r "name"` | Resume by name |
| `/btw question` | Side Q, no context cost |

### SDK / Headless

| Key / Command | Description |
| --- | --- |
| `claude -p "query"` | Non-interactive |
| `--output-format json` | Structured output |
| `--max-budget-usd 5` | Cost cap |
| `cat file \| claude -p` | Pipe input |

### Scheduling & Remote

| Key / Command | Description |
| --- | --- |
| `/loop 5m msg` | Recurring task |
| `--remote` | Web session on claude.ai |
| `! <cmd>` | Run shell cmd as background session (NEW) |

## ⚙️ Config & Env

### Config Files

| Key / Command | Description |
| --- | --- |
| `~/.claude/settings.json` | User settings |
| `.claude/settings.json` | Project (shared) |
| `.claude/settings.local.json` | Local only |
| `~/.claude.json` | OAuth, MCP, state |
| `.mcp.json` | Project MCP servers |
| `managed-settings.d/` | Drop-in policy fragments |

### Key Settings

| Key / Command | Description |
| --- | --- |
| `modelOverrides` | Map model picker → custom IDs |
| `autoMode.hard_deny` | Unconditional auto-mode classifier deny rules (NEW) |
| `hooks: if` | Conditional hooks (permission rule syntax) |
| `DISABLE_PROMPT_CACHING*` | Startup warning when prompt caching is disabled (NEW) |
| `Monitor tool` | Stream events from background scripts (NEW) |
| `PermissionDenied` | Hook: auto-mode denial (NEW) |
| `showThinkingSummaries` | Opt-in (off by default now) (NEW) |
| `hooks: "defer"` | Pause headless → resume later |
| `type: "mcp_tool"` | Hook step invokes an MCP tool directly (NEW) |
| `continueOnBlock` | Hook config: keep running after a blocked tool call (NEW) |
| `fallbackModel` | Up to 3 fallback models on failure (NEW) |
| `refreshInterval` | Re-run custom status line every N sec (NEW) |

### Key Env Vars

| Key / Command | Description |
| --- | --- |
| `ANTHROPIC_API_KEY` |  |
| `ANTHROPIC_MODEL` |  |
| `ANTHROPIC_BASE_URL` | Proxy/gateway override |
| `ANTHROPIC_BETAS` | Additional beta headers |
| `ANTHROPIC_CUSTOM_MODEL_OPTION` | Custom /model entry |
| `MAX_THINKING_TOKENS` | 0=off |
| `ENABLE_PROMPT_CACHING_1H` | Opt into 1h prompt cache TTL (NEW) |
| `CLAUDE_CODE_ENABLE_AWAY_SUMMARY` | Force recap when telemetry disabled (NEW) |
| `CLAUDECODE` | Detect CC shell (=1) |
| `CLAUDE_CODE_DISABLE_CRON` | Disable scheduled tasks |
| `DISABLE_UPDATES` | Block all update paths (NEW) |
| `API_TIMEOUT_MS` | API timeout (default: 600000ms) |
| `MCP_TIMEOUT` | MCP server startup timeout (ms) |
| `CLAUDE_CODE_SESSION_ID` | Unique session ID for hooks and CI tracing (NEW) |
| `CLAUDE_CODE_DISABLE_ALTERNATE_SCREEN` | Opt out of fullscreen rendering (=1) (NEW) |
| `CLAUDE_CODE_DISABLE_AUTO_MEMORY` |  |
| `CLAUDE_CODE_DISABLE_1M_CONTEXT` |  |
| `CLAUDE_CODE_PACKAGE_MANAGER_AUTO_UPDATE` | Auto-upgrade via Homebrew/WinGet (NEW) |
| `CLAUDE_CODE_ENABLE_AUTO_MODE` | Enable auto mode on Bedrock/Vertex/Foundry (=1) (NEW) |

## 🔧 Skills & Agents

### Built-in Skills

| Key / Command | Description |
| --- | --- |
| `Skill tool` | Discovers built-in slash commands (/init, /review, /security-review…) (NEW) |
| `/code-review [effort]` | Code review; --fix flag applies findings to working tree (NEW) |
| `/batch` | Large parallel changes (5-30 worktrees) |
| `/debug [desc]` | Troubleshoot from debug log |
| `/loop [interval]` | Recurring scheduled task |
| `/claude-api` | Load API + SDK reference |

### Custom Skill Locations

| Key / Command | Description |
| --- | --- |
| `.claude/skills/<name>/` | Project skills |
| `~/.claude/skills/<name>/` | Personal skills |

### Skill Frontmatter

| Key / Command | Description |
| --- | --- |
| `description` | Auto-invocation trigger |
| `allowed-tools` | Skip permission prompts |
| `disallowed-tools` | Block specific tools from skill (NEW) |
| `model` | Override model for skill |
| `effort` | Override effort level |
| `paths: [globs]` | Path-specific (YAML list) (NEW) |
| `context: fork` | Run in subagent |
| `$ARGUMENTS` | User input placeholder |
| `${CLAUDE_SKILL_DIR}` | Skill's own directory |
| `${CLAUDE_EFFORT}` | Current effort level (skill variable) (NEW) |
| `` !`cmd` `` | Dynamic context injection |
| `plugin bin/` | Ship executables for Bash tool (NEW) |

### Built-in Agents

| Key / Command | Description |
| --- | --- |
| `Explore` | Fast read-only (Haiku) |
| `Plan` | Research for plan mode |
| `General` | Full tools, complex tasks |
| `Bash` | Terminal separate context |

### Agent Frontmatter

| Key / Command | Description |
| --- | --- |
| `permissionMode` | default/acceptEdits/plan/dontAsk/bypassPermissions |
| `isolation: worktree` | Run in git worktree |
| `memory: user\|project\|local` | Persistent memory |
| `background: true` | Background task |
| `maxTurns` | Limit agentic turns |
| `initialPrompt` | Auto-submit first turn |
| `SendMessage` | Resume agents (replaces resume) |
| `@agent-name` | Mention named subagents (NEW) |

## 🖥️ CLI & Flags

### Core Commands

| Key / Command | Description |
| --- | --- |
| `claude` | Interactive |
| `claude "q"` | With prompt |
| `claude -p "q"` | Headless (SDK) |
| `claude -c` | Continue last |
| `claude -r "n"` | Resume by ID/name |
| `claude update` | Update |
| `claude auth login` | Sign in (--sso, --console) |
| `claude agents` | List agents |
| `claude mcp` | MCP config |
| `claude plugin` | Plugin management |
| `claude plugin init <name>` | Scaffold new plugin (NEW) |
| `claude project purge [path]` | Delete all Claude Code project state (NEW) |
| `claude ultrareview [target]` | Non-interactive code review (PR / branch / path) (NEW) |

### Key Flags

| Key / Command | Description |
| --- | --- |
| `--model` | Set model |
| `-n / --name` | Session name |
| `--resume, -r` | Resume session |
| `--continue, -c` | Continue most recent |
| `--add-dir` | Add working dir |
| `--agent` | Use agent |
| `--allowedTools` | Pre-approve tools |
| `--disallowedTools` | Remove tools |
| `--output-format` | text/json/stream-json |
| `--max-budget-usd` | Cost cap |
| `--remote` | Web session on claude.ai |
| `--effort` | low/medium/high/xhigh/max |
| `--permission-mode` | default/acceptEdits/plan/auto/dontAsk/bypassPermissions |
| `--dangerously-skip-permissions` | Skip all prompts ⚠️ |
| `--debug [filter]` | Debug logging |
| `--safe-mode` | Disable all customizations for troubleshooting (CLAUDE.md, plugins, hooks, MCP) (NEW) |
| `--settings <file>` | Load settings JSON |
| `--from-pr` | Load PR context (GitHub / GitLab / Bitbucket / GHE) (NEW) |
| `--fallback-model` | Set fallback model for interactive sessions (NEW) |

## Permission Modes

- `default` — prompts
- `acceptEdits` — auto-accept edits
- `plan` — read-only
- `dontAsk` — deny unless allowed
- `bypassPermissions` — skip all
- `--dangerously-skip-permissions` — CLI flag

## More Env Vars

- `CLAUDE_CODE_CERT_STORE` — (TLS CA: bundled,system)

> Source: [Claude Code Cheat Sheet](https://cc.storyfox.cz/) · Made by [@phasE89](https://x.com/phasE89) · This page is a content snapshot; visit the source for the latest version.
