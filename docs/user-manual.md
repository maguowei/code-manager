# AI Manager 使用说明书

适用版本：`0.18.0`

> 本文档面向终端用户。面向 Claude Code / Codex 等编程代理的执行手册见仓库根目录的 `CLAUDE.md`。

AI Manager 是面向 Claude Code 用户的本地桌面管理工具。它把 `~/.claude` 目录、Profile、Preset、记忆、Skills、历史、统计、Token 用量、项目状态、系统托盘和诊断日志集中到一个 Tauri 应用中，帮助你用更可见、可预览、可验证的方式维护 Claude Code 本地配置。

## 目录

- [核心概念](#核心概念)
- [快速开始](#快速开始)
- [主界面导航](#主界面导航)
- [`~/.claude` 目录总览](#claude-目录总览)
- [配置 Profile](#配置-profile)
- [预设 Preset](#预设-preset)
- [记忆管理](#记忆管理)
- [Skills 管理](#skills-管理)
- [项目管理](#项目管理)
- [使用历史](#使用历史)
- [使用统计](#使用统计)
- [Token 用量统计](#token-用量统计)
- [设置与诊断](#设置与诊断)
- [本地数据与隐私](#本地数据与隐私)
- [常见工作流](#常见工作流)
- [常见问题](#常见问题)
- [本地开发与验证](#本地开发与验证)

## 核心概念

### Profile

Profile 是最终可以应用到 `~/.claude/settings.json` 的用户配置。它通常包含认证密钥、API 地址、默认模型、权限、Sandbox、Hooks、插件、状态行和其他 Claude Code settings 字段。

Profile 可以引用一个 Preset。应用 Profile 时，AI Manager 会把 Preset 链上的配置补丁和 Profile 自身配置合并，生成最终 settings JSON，然后写入 `~/.claude/settings.json`。

### Preset

Preset 是可复用的配置补丁。它适合沉淀 Provider、模型建议、默认环境变量、插件、权限规则等公共配置。内置 Preset 覆盖 Anthropic、DeepSeek、智谱 GLM Coding Plan、Kimi Code Plan、MiniMax Token Plan、小米 MiMo Token Plan、OpenRouter、火山方舟 Coding Plan、阿里云百炼 Coding Plan、ModelScope、万界方舟和 Ollama。

自定义 Preset 可以继承另一个 Preset。Profile 引用 Preset 后，Profile 中的字段会覆盖 Preset 中的同名字段。

### 记忆

记忆对应 Claude Code 用户级 `CLAUDE.md` 和 `~/.claude/rules/*.md`。AI Manager 会把启用的记忆写入真实 Claude Code 目录。

- `CLAUDE.md`：同一时间只能启用一条，适合长期主记忆。
- Rules：可以同时启用多条，保存到 `~/.claude/rules/`，可配置 `paths` frontmatter 做路径匹配。

### Skills

Skills 对应 `~/.claude/skills/<id>/SKILL.md`。启用的 Skill 保存在 `~/.claude/skills/`；禁用的 Skill 移到 AI Manager 的 `skills-disabled/` 目录。软链接 Skill 可以导入和启停，但内容只读，需要在源目录维护。

### Stats 与 Usage 的区别

- 使用统计页面读取 `~/.claude.json`，展示 Claude Code 本地统计快照，如启动次数、工具调用、Skill 使用和各项目最近一次会话。
- Token 用量页面扫描 `~/.claude/projects/**/*.jsonl` 和 `subagents/*.jsonl`，按日期、项目、会话、模型聚合 Token 与费用，并使用 SQLite 做增量缓存。

这两个页面数据源不同，口径也不同。排查费用或 Token 时优先使用 Token 用量页面。

## 快速开始

### 安装并打开

1. 从项目 Release 页面下载当前平台安装包。
2. 安装并启动 AI Manager。
3. 首次启动后，应用会读取本机 `~/.claude`、`~/.claude.json` 和 `~/.claude/projects/` 中已有数据。

macOS 首次打开如果被系统拦截，可以移除隔离属性：

```bash
xattr -rd com.apple.quarantine /Applications/ai-manager.app
```

### 建议的首次配置顺序

1. 打开左下角设置，选择界面语言、主题、默认终端和默认编辑器。
2. 进入预设页，查看是否已有合适 Provider 预设。
3. 进入配置页，新建 Profile，填写认证密钥和模型配置。
4. 点击测试模型，确认 API 地址、Token 和模型可用。
5. 点击启用，将 Profile 应用到 `~/.claude/settings.json`。
6. 进入 `~/.claude` 目录总览，确认 `settings.json` 已按预期写入。

## 主界面导航

左侧导航是主要入口。

| 入口 | 用途 |
| --- | --- |
| `AI` | 打开或收起 `~/.claude` 目录总览。 |
| 配置 | 管理 Profile，生成并应用 Claude Code 用户设置。 |
| 记忆 | 管理 `CLAUDE.md` 与 `rules/*.md`。 |
| Skills | 管理 Claude Code Skills。 |
| 预设 | 查看内置 Preset，维护自定义 Preset。 |
| 项目 | 查看 Claude 项目路径、Git 状态、worktree 与 `AGENTS.md` 软链状态。 |
| 历史 | 查看 `~/.claude/history.jsonl` 中的历史输入与会话详情。 |
| 统计 | 查看 `~/.claude.json` 中的本地统计快照。 |
| 用量 | 查看 `~/.claude/projects/` 中的 Token 与费用聚合。 |
| 设置 | 调整语言、主题、托盘、默认终端、默认编辑器和诊断入口。 |

多数页面的新增或编辑操作都会打开右侧抽屉。保存前，抽屉内通常会提供控件模式、JSON 模式或预览，方便先检查最终配置。Profile、Preset、记忆和 Skill 编辑器存在未保存更改时，关闭、切换条目或离开页面会先提示保存、丢弃或继续编辑。

## `~/.claude` 目录总览

目录总览用于浏览和维护 Claude Code 用户目录。

### 查看文件

1. 点击左上角 `AI` 入口。
2. 在右侧目录树中选择文件。
3. 左侧预览区会打开文件标签页。
4. Markdown 文件默认显示渲染预览，可切换到源码视图；其他文本文件显示源码；二进制文件只显示元信息。

预览底部会显示文件大小、修改时间、编码和截断状态。内容过大时只展示截断预览。

### 文件操作

在文件预览工具栏中可以：

- 复制文件绝对路径。
- 在文件浏览器中定位文件。
- 使用默认编辑器打开文件。

在目录树中右键可以：

- 新建文件。
- 新建文件夹。
- 重命名。
- 删除。

删除操作不可撤销。处理 `settings.json`、`CLAUDE.md`、`rules/` 或 `skills/` 前，建议先确认这些内容不是唯一副本。

### 扫描限制

目录总览只允许操作 `~/.claude` 内部路径。为降低风险，扫描会跳过软链接和 `node_modules`，并在达到条目数或深度上限时显示提示。

## 配置 Profile

配置页是管理 Claude Code settings 的主入口。

### Profile 列表

每张 Profile 卡片会展示：

- 名称、描述和当前是否已应用到用户设置。
- 主要模型、努力级别、权限模式、Sandbox 状态和插件摘要。
- 最近一轮模型测试结果。

可执行操作：

- 新建配置。
- 启用：写入 `~/.claude/settings.json`。
- 复制环境变量：根据最终预览生成 `export KEY="value"` 文本并复制到剪贴板。
- 复制：创建副本。
- 编辑。
- 删除。
- 一键测试：依次测试所有 Profile 的模型连接。
- 拖拽排序：调整 Profile 显示顺序。

### 新建或编辑 Profile

点击新建配置或编辑后，右侧会打开 Profile 编辑器。

基础信息：

- 名称为必填。
- 描述用于说明配置用途。
- 预设可选，选择后会自动带入模型建议和配置补丁。

认证：

- 认证密钥写入最终 settings 的 `env.ANTHROPIC_AUTH_TOKEN`。
- API 地址写入 `env.ANTHROPIC_BASE_URL`。未设置时，模型测试默认使用 Anthropic 官方地址。

模型与行为：

- 默认模型：`ANTHROPIC_MODEL`。
- 努力级别：`CLAUDE_CODE_EFFORT_LEVEL`，可选 `auto`、`low`、`medium`、`high`、`xhigh`、`max`。
- Opus / Sonnet / Haiku 默认模型。
- Subagent 模型。
- 回复语言。
- 输出风格：结构化控件支持内置风格，其他自定义值可用 JSON 模式填写。

常用选项：

- 默认启用深度思考。
- 显示 Thinking 摘要。
- 接受计划时显示清理上下文。
- 禁用所有 Hooks。
- 禁用 AI 署名。
- 标记已完成 Claude Code 引导。
- Fast Mode。
- 跳过 WebFetch 预检。
- 尊重 `.gitignore`。
- 禁用非必要网络请求。
- 禁用自动更新。
- 启用 LSP 工具。
- 显式启用 Tool Search。
- 启用新版 Init。
- 启用无闪烁模式。
- 启用 Agent Teams。

环境变量：

- 用于维护除认证和常用选项外的其他 `env` 键。
- 重复键、非法 JSON 或未保存的行编辑会阻止保存。

权限：

- 默认模式：设置 Claude Code permissions 的 `defaultMode`。
- 禁用 `bypassPermissions`：降低误用高权限模式的风险。
- 允许规则：匹配后直接放行。
- 拒绝规则：匹配后直接阻止。
- 询问规则：匹配后每次确认。
- 附加目录：把额外目录纳入权限作用域，可直接打开系统目录选择器选择。
- 推荐规则预设：快速填入推荐权限规则。

Sandbox：

- 可启用或关闭 Sandbox。
- 可以添加推荐 Sandbox 预设配置。
- 除 `enabled` 外的额外配置键会以摘要显示，复杂配置可切到 JSON 模式维护。

Hooks：

- 用于维护 Claude Code hooks。
- 支持摘要展示已配置 Hook。
- 可添加内置乱码检查预设。
- 复杂结构无法摘要时，可以切换 JSON 模式直接编辑。

插件市场：

- 维护 `extraKnownMarketplaces`。
- 支持官方市场预设。
- 每个 Marketplace 需要完整填写 ID、来源、仓库或 URL、路径、包名、安装位置等字段。

插件：

- 维护 `enabledPlugins`，表单模式分为“已配置”和“浏览市场”两个 Tab。
- 已配置列表只展示会写入 settings 的真实插件条目，可搜索、按启用状态、类别和来源筛选，并支持手动输入插件 ID。
- 浏览市场会按已配置 Marketplace 拉取插件清单；当前支持 `github` 来源，其他来源会显示暂不支持提示。
- 浏览市场支持搜索、按 Marketplace / 启用状态 / 类别 / 来源筛选，可按插件 ID 或安装数排序，显示主页外链、安装数和官方已验证标识。
- 在浏览市场点击启用或取消启用会立即同步到已配置列表；最终仍以保存后的 `enabledPlugins` 为准。

状态行：

- 配置 Claude Code 自定义状态行命令。
- 可启用默认状态行预设，写入 `~/.claude/statusline.sh`。
- 如果目标脚本已存在且内容不同，会提示是否覆盖。

最终配置：

- 预览模式显示 Preset 与 Profile 合并后的最终 JSON。
- 编辑源 JSON 可直接维护整个 Profile settings 对象。
- 预览中会自动加入 Claude settings schema 地址。

### 模型测试

点击测试模型后，AI Manager 会按当前编辑内容生成请求并发起模型测试。结果对话框会展示：

- 请求是否成功。
- 使用的模型和 Provider 返回模型。
- 请求地址、状态码、耗时、请求 ID、停止原因。
- 输入提示词和模型返回。
- 请求 / 响应 Headers、请求体、原始响应体。
- 复制 cURL。
- 修改提示词后重新测试。

模型测试需要有效的 `ANTHROPIC_AUTH_TOKEN` 和可访问的模型 API。

## 预设 Preset

预设页分为内置预设和自定义预设。

### 内置预设

内置预设只读，会展示 Provider 名称、Preset ID、官方文档链接和推荐模型。它们用于快速给 Profile 提供基础配置。

### 自定义预设

自定义预设可新增、编辑和删除。适合团队沉淀公共 Provider 配置、模型默认值、权限策略、Hooks 和插件组合。

编辑自定义预设时可配置：

- 中文名称和英文名称。
- 描述。
- 文档链接。
- 基础预设。
- 推荐模型列表，使用英文逗号分隔。
- 认证、模型与行为、常用选项、环境变量、权限、Sandbox、Hooks、插件市场、插件、状态行。
- 配置补丁预览或源 JSON。

删除自定义 Preset 不会自动删除已经引用它的 Profile，但后续保存或预览相关 Profile 时可能因为找不到 Preset 而失败。删除前建议先检查引用关系。

## 记忆管理

记忆页用于管理用户级 Claude Code 指令。

### 新增记忆

1. 进入记忆页。
2. 点击添加记忆。
3. 填写名称。
4. 选择记忆类型：
   - `CLAUDE.md`：写入 `~/.claude/CLAUDE.md`，同一时间只能启用一个。
   - Rules：写入 `~/.claude/rules/<path>.md`，可同时启用多个。
5. 如果选择 Rules，填写规则文件路径，例如 `workflow.md` 或 `frontend/style.md`。
6. 可选填写路径匹配，每行一个 glob，用于生成 rule frontmatter 的 `paths`。
7. 编写 Markdown 内容并保存。
8. 在列表中启用该记忆，真实文件才会写入 `~/.claude`。

### 编辑、复制和删除

- 编辑会更新 AI Manager 管理的记忆内容，启用状态下会同步写入真实文件。
- 复制会创建一条未启用副本。
- 删除会移除 AI Manager 管理记录，并根据预览清理不再需要的 rule 目录。

### 导入本地记忆

AI Manager 会识别 `~/.claude/CLAUDE.md` 和 `~/.claude/rules/*.md` 中尚未导入管理的文件。

- 点击导入管理：原地接管当前文件，不立即改写内容。
- 软链接记忆文件不支持导入。
- 如果路径已经被可管理记忆占用，需要先处理冲突。

### 从目录导入

点击导入记忆后选择一个包含 `CLAUDE.md` 或 `rules/` 的目录。导入后默认未启用。导入结果会列出成功项和跳过原因，例如重复 `CLAUDE.md`、同路径 Rule 已存在、路径无效、读取失败或软链接不支持。

## Skills 管理

Skills 页用于管理 `~/.claude/skills/` 下的 Claude Code Skill。

### 新增 Skill

1. 点击添加 Skill。
2. 填写 Skill 名称。名称会作为目录名和 slash command，只允许小写字母、数字和连字符。
3. 填写显示名称和描述。
4. 编写 `SKILL.md` 正文。
5. 按需设置：
   - 仅手动触发：写入 `disable-model-invocation`。
   - 允许手动调用：控制是否可通过 slash command 调用。
6. 保存后，Skill 会出现在列表中。

### 列表操作

每个 Skill 支持：

- 启用或禁用。
- 编辑 `SKILL.md`。
- 删除。
- 用外部编辑器打开 Skill 目录。
- 同步到 `~/.codex/skills`。

启用状态对应 `~/.claude/skills/<id>/`；禁用状态对应 AI Manager 应用数据目录下的 `skills-disabled/<id>/`。

### 导入 Skills

点击导入 Skills 后，可以选择：

- 单个 Skill 目录。
- Skill 软链接。
- 包含多个 Skill 的集合目录。

导入结果会列出成功导入的 Skill 和跳过项。跳过原因包括名称不符合规则、同名 Skill 已存在、缺少有效 `SKILL.md` 或软链接目标无效。

软链接 Skill 会显示只读提示。可以启停、打开源目录，但不能在应用内修改源内容。

### 支持文件

编辑器会展示 `SKILL.md` 以外的支持文件树。支持文件目前只展示目录树；需要修改时请用外部编辑器打开 Skill 目录。

## 项目管理

项目页从 `~/.claude/history.jsonl` 中提取项目列表，按最近活跃排序。

### 项目列表

左侧列表展示：

- 项目短名称。
- 项目路径。
- 最近活跃时间。
- 会话数量与输入数量。
- 最近会话 ID。

点击项目后，右侧展示项目详情。

### 快捷操作

项目详情顶部提供：

- 用终端打开项目：使用设置中的默认终端。可选项会按当前平台和本机已安装情况过滤。
- 用编辑器打开项目：需要先在设置中选择默认编辑器。可选项会按当前平台和本机已安装情况过滤。
- 打开源码仓库：使用项目 Git 远程地址。

当前支持的编辑器：

| 编辑器 | macOS | Linux | Windows |
| --- | --- | --- | --- |
| VS Code | 支持 | 需要 `code` CLI | 需要 `code` CLI |
| Cursor | 支持 | 需要 `cursor` CLI | 需要 `cursor` CLI |
| Windsurf | 支持 | 需要 `windsurf` CLI | 需要 `windsurf` CLI |
| Zed | 支持 | 需要 `zed` CLI | 需要 `zed` CLI |

当前支持的终端：

| 终端 | macOS | Linux | Windows |
| --- | --- | --- | --- |
| Terminal | 支持 Terminal.app | 依次尝试 `$TERMINAL`、`xdg-terminal-exec`、`x-terminal-emulator` 和常见终端命令 | 依次尝试 Windows Terminal、PowerShell、cmd |
| iTerm | 支持 | 不支持 | 不支持 |
| Warp | 支持 | 需要 `warp-terminal` CLI | 需要 `warp.exe` 或官方安装路径 |
| Ghostty | 支持 | 需要 `ghostty` CLI | 暂不支持 |

### 状态检查

项目页会展示：

- 目录是否存在。
- 是否 Git 仓库。
- `CLAUDE.md` 是否存在。
- `AGENTS.md` 状态。
- 本地分支、最近提交和更新时间。
- Worktree 路径、分支、HEAD 和状态。
- 最近活跃时间、会话数量、输入数量、最近会话 ID 和 Git 根目录。
- 最近 5 个会话，可点击查看会话详情。

### 生成或修复 `AGENTS.md`

如果项目根目录存在 `CLAUDE.md`，且 `AGENTS.md` 不存在或软链目标错误，可以点击生成 / 修复 `AGENTS.md`。应用会创建相对软链：

```text
AGENTS.md -> CLAUDE.md
```

如果 `AGENTS.md` 已经是普通文件，AI Manager 不会覆盖它，需要手动处理冲突。

### 清除项目本地数据

在项目列表项上右键，可以选择清除本地数据。应用会先生成 dry-run 删除计划，确认后才执行清理。

该操作会调用 Claude CLI 清除该项目保存的本地状态。执行前请仔细检查删除计划。

## 使用历史

历史页读取 `~/.claude/history.jsonl`，用于回看 Claude Code 历史输入和会话。

### 浏览方式

- 左侧按项目分组。
- 顶部热力图展示最近历史密度。
- 搜索框可按展示文本过滤历史记录。
- 点击会话可打开详情抽屉。

URL 会同步 `project`、`q` 和 `session` 参数，便于保留当前筛选状态。

### 会话详情

会话详情会展示：

- 用户消息和助手消息。
- 思考过程摘要。
- 工具调用和工具返回。
- 命令。
- 图片。
- 计划内容。
- 系统事件。

可执行操作：

- 复制项目路径。
- 复制会话 ID。
- 复制单条消息。
- 用编辑器打开原始会话记录文件。

## 使用统计

统计页读取 `~/.claude.json`。这些数据来自 Claude Code 本地统计快照，不是实时计算结果。

页面提供：

- 启动次数。
- 首次使用日期。
- 项目数。
- 上次 Plan Mode 使用时间。
- `btw` 使用次数。
- 工具调用次数图表。
- Skill 使用次数列表。
- 项目最近会话列表。

每个项目最近会话会展示：

- 最近费用。
- 最近会话时长。
- 新增行和删除行。
- 输入、输出、缓存创建、缓存读取 Token。
- Web 搜索次数。
- 模型明细。
- 首条 Prompt。
- 性能指标，如 frame 均值、frame P95、Hook 均值、Hook P95。

顶部可以刷新数据，也可以用默认编辑器打开 `~/.claude.json`。

## Token 用量统计

用量页扫描 `~/.claude/projects/**/*.jsonl` 和 `subagents/*.jsonl`，提取 assistant 消息中的 usage 字段，按价格表估算费用。

### 数据口径

- 按 `message.id` 全局去重。
- 同一消息出现多次时，保留 Token 用量更大的快照。
- Token 包含输入、输出、缓存创建和缓存读取。
- 成本按当前价格表估算，价格单位统一为 USD / 1M tokens。
- 价格表加载顺序是本地缓存 `model-pricing.json`、内置 Anthropic 兜底表、启动后或手动刷新时从 models.dev 更新。
- models.dev 只导入官方 provider 价格：Anthropic、Moonshot / MoonshotAI、Z.ai / Zhipu / BigModel、MiniMax、Xiaomi / MiMo、DeepSeek。
- Kimi、MiMo、GLM、MiniMax、DeepSeek 受设置页“第三方模型计价”开关控制；关闭后这些模型费用按 0 计入，且不作为未知模型提示。
- 其他无法匹配价格的模型 Token 会统计，但成本按 0 计，并进入未知模型列表。

### 顶部状态与操作

顶部会显示价格来源：

- 内置价格。
- 本地缓存。
- models.dev 实时。

操作按钮：

- 刷新价格：重新拉取价格表并更新成本。
- 查看模型价目表：打开当前价格表，可按模型搜索并查看输入、输出、缓存写入、缓存读取价格和当前用量。
- 重新扫描：重新扫描 `~/.claude/projects/`。

### 筛选

可按以下条件筛选：

- 日期范围。
- 快捷范围：今日、最近 7 天、最近 30 天、本周、本月、今年、全部。
- 项目。
- 模型，包括 `claude-*` 聚合筛选。

重置会回到今日筛选。

### 图表与表格

页面包含：

- 总花费、总 Token、会话数、消息数、缓存节省。
- 花费趋势。
- Token 趋势。
- 模型成本占比。
- Token 构成。
- 按日期、项目、会话和模型的明细表格。

趋势图支持：

- 按模型或 Token 类型拆分。
- 曲线或柱状图。
- 天、小时和 5 分钟粒度。
- 点击图例切换显示，双击图例只显示当前项。

在按会话表格中点击某一会话，可以打开消息级用量明细。

## 设置与诊断

设置入口位于左下角。

### 通用设置

可配置：

- 界面语言：中文或英文。
- 主题外观：浅色、深色或跟随系统。
- 在菜单栏显示当前配置。
- 在菜单栏显示当前会话。
- 开机自启动。
- 第三方模型计价：控制 Kimi、MiMo、GLM、MiniMax、DeepSeek 系列是否按 models.dev 价格估算费用；关闭后这些模型费用按 0 计入。
- 默认终端：按当前平台和本机安装情况展示可用的 Terminal、iTerm、Warp、Ghostty。
- 默认编辑器：按当前平台和本机安装情况展示可用的 VS Code、Cursor、Windsurf、Zed，或选择未设置。

默认终端影响项目页的用终端打开。默认编辑器影响项目页、统计页、目录总览和 Skill 相关的外部编辑操作。

可用项来自内置支持清单和系统检测，不会自动列出电脑里的所有应用。这样可以保证每个选项都有明确的打开命令和项目路径参数。Linux 和 Windows 的编辑器需要对应 CLI 在 `PATH` 中可访问；Windows 的默认终端会优先使用 Windows Terminal，失败后回退 PowerShell 和 cmd。

### 日志查看

点击查看日志可打开日志窗口。

日志窗口支持：

- 按级别筛选：all、error、warn、info、debug、trace。
- 搜索。
- 刷新。
- 打开日志目录。
- 清空日志。

日志最多展示最近 500 条匹配结果。如果日志被截断，页面会提示。

### 系统信息

系统信息窗口展示：

- AI Manager 版本。
- 操作系统类型、平台、版本、家族。
- CPU 架构。
- Hostname。
- Locale。

点击复制会把信息复制为 Markdown 表格，便于提交 issue 或排障。

## 本地数据与隐私

AI Manager 主要读写本机文件。配置合并、目录扫描、用量聚合和日志查看都在本地完成。

### 应用管理数据

| 平台 | 应用数据目录 |
| --- | --- |
| macOS | `~/.config/ai-manager/` |
| Linux | `$XDG_CONFIG_HOME/ai-manager/` 或 `~/.config/ai-manager/` |
| Windows | `%APPDATA%\ai-manager\` |

> 本应用刻意复用 `~/.config/ai-manager/` 而不是 macOS 标准的 `~/Library/Application Support/...`，便于跨平台同步备份与统一脚本访问。

```text
<应用数据目录>/
  config-registry.json
  memories.json
  model-pricing.json
  skills-disabled/
```

### Claude Code 用户目录

```text
~/.claude/
  settings.json
  CLAUDE.md
  rules/
  skills/
  projects/
  statusline.sh
```

### 历史、统计与用量输入

```text
~/.claude/history.jsonl
~/.claude/projects/
~/.claude.json
```

### 用量 SQLite 缓存

用量缓存由 Tauri SQL 插件维护，数据库名为 `usage.db`，位于 Tauri 默认的应用配置目录（与“应用数据目录”不是同一个位置）：

| 平台 | 路径 |
| --- | --- |
| macOS | `~/Library/Application Support/com.gotobeta.app.ai-manager/usage.db` |
| Linux | `$XDG_CONFIG_HOME/com.gotobeta.app.ai-manager/usage.db` 或 `~/.config/com.gotobeta.app.ai-manager/usage.db` |
| Windows | `%APPDATA%\com.gotobeta.app.ai-manager\usage.db` |

SQLite 使用 WAL 模式时，同目录可能同时出现 `usage.db-wal` 与 `usage.db-shm`。

### 日志目录

应用日志写入系统推荐日志目录，文件名通常是 `ai-manager.log`，轮转文件形如 `ai-manager_2026-04-29_09-13-00.log`。

| 平台 | 日志目录 |
| --- | --- |
| macOS | `~/Library/Logs/com.gotobeta.app.ai-manager/` |
| Linux | `$XDG_DATA_HOME/com.gotobeta.app.ai-manager/logs/` 或 `~/.local/share/com.gotobeta.app.ai-manager/logs/` |
| Windows | `%LOCALAPPDATA%\com.gotobeta.app.ai-manager\logs\` |

## 常见工作流

### 创建并启用一个 Provider Profile

1. 进入预设页，确认是否已有合适 Provider。
2. 进入配置页，点击新建配置。
3. 填写名称和描述。
4. 选择对应 Preset。
5. 填写认证密钥。
6. 按需调整默认模型、努力级别和常用选项。
7. 打开最终配置预览，确认 `env` 和权限符合预期。
8. 点击测试模型。
9. 测试成功后保存。
10. 回到配置列表，点击启用。
11. 进入目录总览检查 `settings.json`。

### 给团队沉淀公共配置

1. 进入预设页，点击新增预设。
2. 填写中英文名称、描述和文档链接。
3. 选择基础预设。
4. 填写推荐模型。
5. 设置权限、Sandbox、Hooks、插件市场和插件。
6. 保存后，让团队 Profile 引用该 Preset。

### 接管已有 `CLAUDE.md` 和 Rules

1. 进入记忆页。
2. 查看发现未导入的本地记忆分组。
3. 对需要管理的文件点击导入管理。
4. 检查内容和路径匹配。
5. 按需启用或禁用。

### 创建 Skill 并同步给 Codex

1. 进入 Skills 页。
2. 点击添加 Skill。
3. 填写合法 id、显示名称和描述。
4. 编写 `SKILL.md`。
5. 设置是否允许自动调用或手动调用。
6. 保存并启用。
7. 点击同步到 `~/.codex/skills`。

### 排查模型无法调用

1. 打开配置页，编辑目标 Profile。
2. 确认认证密钥、API 地址和模型。
3. 点击测试模型。
4. 在测试结果中查看状态码、请求地址、请求体和原始响应。
5. 必要时复制 cURL 到终端复现。
6. 如果是应用保存或调用失败，进入设置 -> 诊断 -> 查看日志。

### 排查费用或 Token 异常

1. 进入 Token 用量页。
2. 选择日期范围、项目和模型。
3. 查看总花费、Token 构成和模型成本占比。
4. 打开模型价目表，确认目标模型是否有输入、输出和缓存价格。
5. 切到按会话表格，点击异常会话查看消息级明细。
6. 如果模型显示在未识别模型列表中，说明成本按 0 计，需要更新价格表或等待价格表支持；如果是第三方模型，先确认设置页的第三方模型计价开关是否开启。

## 常见问题

### 启用 Profile 后写到哪里？

写入 `~/.claude/settings.json`。写入内容是 Preset 链和 Profile 自身 settings 合并后的最终 JSON，并带有 Claude Code settings schema。

### 删除 Profile 会删除 `settings.json` 吗？

不会。删除 Profile 会移除 AI Manager 的管理记录和绑定状态，但不会自动清理已经写出的 `~/.claude/settings.json`。

### 为什么模型测试提示缺少 `ANTHROPIC_AUTH_TOKEN`？

当前 Profile 最终配置中没有可用的认证密钥。请在认证区填写认证密钥，或确认 Preset / JSON 中的 `env.ANTHROPIC_AUTH_TOKEN` 是否被覆盖为空。

### 为什么项目页没有项目？

项目页来自 `~/.claude/history.jsonl`。使用 Claude Code 产生历史记录后，相关项目会显示在 AI Manager 中。

### 为什么统计页和用量页费用不一致？

统计页读取 `~/.claude.json` 的本地统计快照；用量页扫描 `~/.claude/projects/**/*.jsonl` 并按当前价格表重新估算。两者数据源和计算口径不同。

### 为什么某些模型费用为 0？

如果模型不在价格表中，Token 会统计，但费用按 0 计。Kimi、MiMo、GLM、MiniMax、DeepSeek 在第三方模型计价关闭时也会按 0 计入。可以点击刷新价格尝试更新价格表，或在设置页重新开启第三方模型计价。

### 为什么不能编辑软链接 Skill？

软链接 Skill 的源目录不属于 AI Manager 直接管理范围。应用只允许启停、导入和打开目录，内容需要在源目录维护。

### 清除项目本地数据安全吗？

该操作会先生成 dry-run 删除计划，确认后才执行。它用于清除 Claude CLI 保存的项目本地状态。执行前必须检查删除计划，避免误删仍需要的数据。

## 本地开发与验证

本项目使用 `pnpm`、Tauri 2、React 19、TypeScript、Tailwind CSS v4 和 Rust。

### 前置要求

- Node.js LTS。
- `pnpm`，当前声明版本为 `pnpm@10.33.0`。
- Rust stable。
- 当前平台的 Tauri 2 系统依赖。

### 常用命令

```bash
pnpm install
pnpm tauri dev
pnpm build
pnpm test
pnpm biome:ci
pnpm tauri build
```

注意：单独运行 `pnpm dev` 只会启动 Vite，不会启动原生 Tauri 壳。本地桌面开发请运行 `pnpm tauri dev`。

### 文档修改验证

只修改文档时，至少运行：

```bash
git diff --check
```

前端、Rust 或前后端契约改动请按仓库 `CLAUDE.md` 的验证清单运行对应命令。
