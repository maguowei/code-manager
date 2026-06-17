# Claude Code 速查表

## ⌨️ 键盘快捷键

### 常用控制

| 按键 / 命令 | 说明 |
| --- | --- |
| `Ctrl + C` | 取消输入/生成 |
| `Ctrl + D` | 退出会话 |
| `Ctrl + L` | 清屏 |
| `Ctrl + O` | 切换详细输出/转录/专注视图 (NEW) |
| `Ctrl + R` | 反向搜索历史 |
| `Ctrl + G` | 在编辑器中打开提示 |
| `Ctrl + X + Ctrl + E` | 在编辑器中打开（别名） |
| `Ctrl + B` | 后台运行任务 |
| `Ctrl + T` | 切换任务列表 |
| `Ctrl + V` | 粘贴图片（[Image #N] 标签） |
| `Ctrl + X + Ctrl + K` | 终止后台代理 |
| `Esc + Esc` | 回退或摘要 |

### 模式切换

| 按键 / 命令 | 说明 |
| --- | --- |
| `Shift + Tab` | 循环切换权限模式 |
| `Alt + P` | 切换模型 |
| `Alt + T` | 切换思考模式 |
| `Alt + O` | 切换快速模式 (NEW) |

### 输入

| 按键 / 命令 | 说明 |
| --- | --- |
| `\ + Enter` | 换行（快捷方式） |
| `Ctrl + J` | 换行（控制序列） |

### 前缀

| 按键 / 命令 | 说明 |
| --- | --- |
| `/` | 斜杠命令 |
| `!` | 直接执行 bash |
| `@` | 引用文件 + 自动补全 |

### 转录 / 专注视图（Ctrl+O）

| 按键 / 命令 | 说明 |
| --- | --- |
| `Ctrl + E` | 切换显示全部 |
| `Q + Ctrl + C + Esc` | 退出转录 |

## 🔌 MCP 服务器

### 添加服务器

| 按键 / 命令 | 说明 |
| --- | --- |
| `--transport http` | 远程 HTTP（推荐） |
| `--transport stdio` | 本地进程 |
| `--transport sse` | 远程 SSE |

### 作用域

| 按键 / 命令 | 说明 |
| --- | --- |
| `Local` | ~/.claude.json（仅限本人） |
| `Project` | .mcp.json（共享/版本控制） |
| `User` | ~/.claude.json（全局） |

### 管理

| 按键 / 命令 | 说明 |
| --- | --- |
| `/mcp` | 交互式界面 |
| `claude mcp list` | 列出所有服务器 |
| `maxResultSizeChars` | _meta["anthropic/maxResultSizeChars"] 可提高每个工具的文本阈值（最高 500K 字符） (NEW) |

## ⚡ 斜杠命令

### 会话

| 按键 / 命令 | 说明 |
| --- | --- |
| `/clear` | 清除对话 |
| `/compact [focus]` | 压缩上下文 |
| `/resume` | 恢复/切换会话 |
| `/rename [name]` | 命名当前会话 |
| `/branch [name]` | 分支对话（/fork 别名） |
| `/cost` | Token 用量（按模型 + 缓存分类） (NEW) |
| `/context` | 可视化上下文（网格） |
| `/diff` | 交互式差异查看器 |
| `/copy [N]` | 复制最近（或第 N 条）回复 |
| `/rewind` | 回退对话 / 代码检查点 |
| `/recap` | 返回会话时获取上下文摘要 (NEW) |
| `/export` | 导出对话 |

### 配置

| 按键 / 命令 | 说明 |
| --- | --- |
| `/config` | 打开设置 |
| `/model [model]` | 切换模型（←→ 调整力度） |
| `/fast [on\|off]` | 切换快速模式 |
| `/theme` | 更换颜色主题 |
| `/permissions` | 查看/更新权限 |
| `/effort [level]` | 设置力度（low/medium/high/max/auto） |
| `/color [color]` | 设置提示栏颜色 |
| `/keybindings` | 自定义键盘快捷键 |
| `/terminal-setup` | 配置终端快捷键 |

### 工具

| 按键 / 命令 | 说明 |
| --- | --- |
| `/init` | 创建 CLAUDE.md |
| `/memory` | 编辑 CLAUDE.md 文件、切换自动记忆、查看条目 |
| `/mcp` | 管理 MCP 服务器 |
| `/hooks` | 管理钉子 |
| `/skills` | 列出可用技能 |
| `/agents` | 管理代理配置 (NEW) |
| `/workflows` | View and manage background multi-agent workflow runs (NEW) |
| `/add-dir <path>` | 添加工作目录 |

### 特殊

| 按键 / 命令 | 说明 |
| --- | --- |
| `/powerup` | 交互式功能课程 (NEW) |
| `/btw <question>` | 旁问（不消耗上下文） |
| `/plan [desc]` | 规划模式（+ 自动启动） |
| `/loop [interval]` | 定时循环任务 |
| `/voice` | 按住说话语音（20 种语言） |
| `/doctor` | 诊断安装问题 |
| `/stats` | 使用统计与偏好 |
| `/insights` | 会话分析报告 |
| `/desktop` | 在桌面应用中继续 |
| `/remote-control` | 桥接到 claude.ai/code（/rc） |
| `/usage` | 套餐限额与速率状态 |
| `/schedule` | 云端定时任务 |
| `/ultraplan <prompt>` | 先在浏览器会话中起草计划；如有需要会自动创建默认云环境，然后远程执行或发回终端 (NEW) |
| `/security-review` | 变更安全审查 |
| `/help` | 显示帮助 + 命令 |
| `/feedback` | 提交反馈（别名：/bug） |
| `/release-notes` | 交互式版本变更日志 (NEW) |
| `/stickers` | 订购贴纸！🎉 |

## 📁 记忆与文件

### CLAUDE.md 位置

| 按键 / 命令 | 说明 |
| --- | --- |
| `./CLAUDE.md or ./.claude/CLAUDE.md` | 项目级（团队共享） |
| `./CLAUDE.local.md` | 本地个人项目笔记（gitignored） |
| `~/.claude/CLAUDE.md` | 个人级（所有项目） |
| `/etc/claude-code/CLAUDE.md` | 托管策略（Linux/WSL，组织范围） |

### 规则与导入

| 按键 / 命令 | 说明 |
| --- | --- |
| `.claude/rules/*.md` | 项目规则 |
| `~/.claude/rules/*.md` | 用户规则 |
| `paths: frontmatter` | 按路径生效的规则 |
| `@path/to/file` | 在 CLAUDE.md 中导入 |

### 自动记忆

| 按键 / 命令 | 说明 |
| --- | --- |
| `~/.claude/projects/<proj>/memory/` | MEMORY.md + 主题文件，自动加载（25KB/200 行上限） |

## 🧠 工作流与技巧

### 规划模式

| 按键 / 命令 | 说明 |
| --- | --- |
| `Shift + Tab` | 普通 → 自动接受 → 规划 |
| `--permission-mode plan` | 以规划模式启动 |

### 思考与力度

| 按键 / 命令 | 说明 |
| --- | --- |
| `Alt + T` | 开启/关闭思考 |
| `"ultrathink"` | 本轮最大力度 |
| `Ctrl + O` | 查看思考过程（详细模式） |
| `/effort` | ○ low · ◐ med · ● high · ★ max |

### 自动模式拒绝

| 按键 / 命令 | 说明 |
| --- | --- |
| `/permissions → Recent` | 按 R 重试被拒绝的操作 (NEW) |

### Git Worktrees

| 按键 / 命令 | 说明 |
| --- | --- |
| `--worktree name` | 每个功能独立分支 |
| `isolation: worktree` | 代理在独立 worktree 中运行 |
| `sparsePaths` | 仅检出所需目录 |
| `workspace.git_worktree` | 状态栏 JSON：已链接的 worktree 路径 (NEW) |
| `/batch` | 自动创建 worktrees |

### 语音模式

| 按键 / 命令 | 说明 |
| --- | --- |
| `/voice` | 启用按住说话 |
| `Space` | 录音，松开发送 |
| `20 种语言` | EN、ES、FR、DE、CZ、PL… |

### 上下文管理

| 按键 / 命令 | 说明 |
| --- | --- |
| `/context` | 用量 + 优化建议 |
| `/compact [focus]` | 带焦点压缩 |
| `1M context` | Opus 4.6（Max/Team/Ent） |

### 会话进阶技巧

| 按键 / 命令 | 说明 |
| --- | --- |
| `claude -c` | 继续上次对话 |
| `claude -r "name"` | 按名称恢复 |
| `/btw question` | 旁问，不消耗上下文 |

### SDK / 无头模式

| 按键 / 命令 | 说明 |
| --- | --- |
| `claude -p "query"` | 非交互式 |
| `--output-format json` | 结构化输出 |
| `--max-budget-usd 5` | 费用上限 |
| `cat file \| claude -p` | 管道输入 |

### 定时与远程

| 按键 / 命令 | 说明 |
| --- | --- |
| `/loop 5m msg` | 循环任务 |
| `/rc` | 远程控制（默认使用主机名前缀） (NEW) |
| `/ultraplan` | 先在浏览器中起草计划；如有需要会自动创建默认云环境，然后远程执行或发回终端 (NEW) |
| `--remote` | 在 claude.ai 上的 Web 会话 |
| `! <cmd>` | Run shell cmd as background session (NEW) |

## ⚙️ 配置与环境

### 配置文件

| 按键 / 命令 | 说明 |
| --- | --- |
| `~/.claude/settings.json` | 用户设置 |
| `.claude/settings.json` | 项目级（共享） |
| `.claude/settings.local.json` | 仅限本地 |
| `~/.claude.json` | OAuth、MCP、状态 |
| `.mcp.json` | 项目 MCP 服务器 |
| `managed-settings.d/` | 策略片段即插即用 |

### 关键设置

| 按键 / 命令 | 说明 |
| --- | --- |
| `modelOverrides` | 模型选择器映射 → 自定义 ID |
| `hooks: if` | 条件 Hooks（权限规则语法） |
| `Monitor tool` | 流式显示后台脚本事件 (NEW) |
| `PermissionDenied` | 钉子：自动模式拒绝 (NEW) |
| `showThinkingSummaries` | 需手动开启（默认关闭） (NEW) |
| `hooks: "defer"` | 暂停无头模式 → 稍后恢复 |
| `fallbackModel` | 配置最多 3 个备用模型 (NEW) |
| `forceRemoteSettingsRefresh` | 启动时强制刷新失败则阻止 (NEW) |
| `refreshInterval` | 每 N 秒重新运行自定义状态栏 (NEW) |

### 关键环境变量

| 按键 / 命令 | 说明 |
| --- | --- |
| `ANTHROPIC_API_KEY` |  |
| `ANTHROPIC_MODEL` |  |
| `CLAUDE_CODE_EFFORT_LEVEL` | low/medium/high/max/auto |
| `MAX_THINKING_TOKENS` | 0=关闭 |
| `ANTHROPIC_CUSTOM_MODEL_OPTION` | 自定义 /model 条目 |
| `CLAUDECODE` | 检测 CC shell（=1） |
| `CLAUDE_CODE_PACKAGE_MANAGER_AUTO_UPDATE` | Auto-upgrade via Homebrew/WinGet (NEW) |
| `CLAUDE_CODE_DISABLE_ALTERNATE_SCREEN` | Opt out of fullscreen rendering (=1) (NEW) |
| `CLAUDE_CODE_ENABLE_AUTO_MODE` | Enable auto mode on Bedrock/Vertex/Foundry (=1) (NEW) |

## 🔧 技能与代理

### 内置技能

| 按键 / 命令 | 说明 |
| --- | --- |
| `/code-review` | Code review with low/medium/high effort levels (NEW) |
| `/batch` | 大规模并行变更（5-30 个 worktrees） |
| `/debug [desc]` | 从调试日志排查问题 |
| `/loop [interval]` | 定时循环任务 |
| `/claude-api` | 加载 API + SDK 参考 |

### 自定义技能位置

| 按键 / 命令 | 说明 |
| --- | --- |
| `.claude/skills/<name>/` | 项目技能 |
| `~/.claude/skills/<name>/` | 个人技能 |

### 技能 Frontmatter

| 按键 / 命令 | 说明 |
| --- | --- |
| `description` | 自动调用触发条件 |
| `allowed-tools` | 跳过权限提示 |
| `model` | 覆盖技能模型 |
| `effort` | 覆盖力度级别 |
| `paths: [globs]` | 按路径生效（YAML 列表） (NEW) |
| `context: fork` | 在子代理中运行 |
| `$ARGUMENTS` | 用户输入占位符 |
| `${CLAUDE_SKILL_DIR}` | 技能自身目录 |
| `` !`cmd` `` | 动态上下文注入 |
| `plugin bin/` | 为 Bash 工具提供可执行文件 (NEW) |

### 内置代理

| 按键 / 命令 | 说明 |
| --- | --- |
| `Explore` | 快速只读（Haiku） |
| `Plan` | 规划模式调研 |
| `General` | 全工具，复杂任务 |
| `Bash` | 终端独立上下文 |

### 代理 Frontmatter

| 按键 / 命令 | 说明 |
| --- | --- |
| `permissionMode` | default/acceptEdits/plan/dontAsk/bypassPermissions |
| `isolation: worktree` | 在 git worktree 中运行 |
| `memory: user\|project\|local` | 持久化记忆 |
| `background: true` | 后台任务 |
| `maxTurns` | 限制代理轮次 |
| `initialPrompt` | 自动提交首轮 |
| `SendMessage` | 恢复代理（替代 resume） |
| `@agent-name` | 提及命名子代理 (NEW) |

## 🖥️ CLI 与参数

### 核心命令

| 按键 / 命令 | 说明 |
| --- | --- |
| `claude` | 交互式 |
| `claude "q"` | 带提示启动 |
| `claude -p "q"` | 无头模式 |
| `claude -c` | 继续上次 |
| `claude -r "n"` | 恢复会话 |
| `claude update` | 更新 |

### 关键参数

| 按键 / 命令 | 说明 |
| --- | --- |
| `--model` | 设置模型 |
| `-w` | Git worktree |
| `-n / --name` | 会话名称 |
| `--add-dir` | 添加目录 |
| `--agent` | 使用代理 |
| `--allowedTools` | 预授权 |
| `--allow-dangerously-skip-permissions` | 将 bypassPermissions 加入 Shift+Tab 循环 |
| `--output-format` | text/json/stream-json |
| `--max-budget-usd` | 费用上限 |
| `--exclude-dynamic-system-prompt-sections` | print 模式：改善跨用户提示缓存 (NEW) |
| `--verbose` | 详细输出 |
| `--remote` | 在 claude.ai 上创建 Web 会话 |
| `--rc` | Remote Control 模式 |
| `--effort` | low/medium/high/max |
| `--permission-mode` | plan/default/… |
| `--dangerously-skip-permissions` | 跳过所有提示 ⚠️ |
| `--chrome` | Chrome |
| `--fallback-model` | 设置交互式会话的备用模型 (NEW) |

## 权限模式

- `default` — 提示确认
- `acceptEdits` — 自动接受编辑
- `plan` — 只读
- `dontAsk` — 未允许则拒绝
- `bypassPermissions` — 跳过全部
- `--dangerously-skip-permissions` — CLI 参数

## 更多环境变量

- `CLAUDE_CODE_CERT_STORE` — （TLS CA: bundled,system）

> 来源：[Claude Code Cheat Sheet](https://cc.storyfox.cz/zh/) · Made by [@phasE89](https://x.com/phasE89) · 本页为内容快照，最新版请访问原站。
