# AI Manager 使用说明书

适用版本：`0.20.1`

> 本文档面向终端用户。面向 Claude Code / Codex 等编程代理的执行手册见仓库根目录的 `CLAUDE.md`。

AI Manager 是面向 Claude Code 用户的本地桌面管理工具。它把 `~/.claude` 目录、配置、供应商、记忆、Skills、历史、统计、Token 用量、项目状态、系统托盘和诊断日志集中到一个 Tauri 应用中,帮助你用更可见、可预览、可验证的方式维护 Claude Code 本地配置。

## 目录

- [核心概念](#核心概念)
- [快速开始](#快速开始)
- [主界面导航](#主界面导航)
- [`~/.claude` 目录总览](#claude-目录总览)
- [配置](#配置)
- [供应商 Provider](#供应商-provider)
- [记忆管理](#记忆管理)
- [Skills 管理](#skills-管理)
- [项目管理](#项目管理)
- [使用历史](#使用历史)
- [使用统计](#使用统计)
- [Token 用量统计](#token-用量统计)
- [桌面用量浮窗](#桌面用量浮窗)
- [系统托盘与会话聚焦](#系统托盘与会话聚焦)
- [设置与诊断](#设置与诊断)
- [本地数据与隐私](#本地数据与隐私)
- [常见工作流](#常见工作流)
- [常见问题](#常见问题)

## 核心概念

### 配置

配置是最终可以应用到 `~/.claude/settings.json` 的用户配置,通常包含认证密钥、API 地址、默认模型、权限、Sandbox、Hooks、插件、状态行等字段。配置可以引用一个内置供应商;应用配置时,AI Manager 会把供应商的 `env`(地址与模型映射)和配置自身配置合并,生成最终 JSON 并写入 `~/.claude/settings.json`。

如果本机已有 `~/.claude/settings.json`,配置页可在未创建配置时识别并导入为托管配置。已应用配置后,如果真实 `settings.json` 被外部修改,页面会显示差异提示,可查看 diff 后选择接受实际配置或重新应用托管配置。

### Provider(供应商)

供应商只承载供应商客观信息(连接地址、模型映射与可选附加环境变量),不含认证密钥,且均为内置只读、不可自定义。内置供应商覆盖 Anthropic、DeepSeek、智谱 GLM Coding Plan、Kimi Code Plan、MiniMax Token Plan、小米 MiMo Token Plan、OpenRouter、火山方舟 Coding Plan、阿里云百炼 Coding Plan、万界方舟和 Ollama。配置引用供应商后,配置中的同名字段会覆盖供应商的 `env`(地址除外:地址以供应商为单一事实源)。

### 记忆

记忆对应 Claude Code 用户级 `CLAUDE.md` 和 `~/.claude/rules/*.md`,启用后写入真实 Claude Code 目录。

- `CLAUDE.md`:同一时间只能启用一条,适合长期主记忆。
- Rules:可同时启用多条,保存到 `~/.claude/rules/`,可配置 `paths` frontmatter 做路径匹配。

### Skills

Skills 对应 `~/.claude/skills/<id>/SKILL.md`。启用的 Skill 保存在 `~/.claude/skills/`;禁用的 Skill 移到 AI Manager 的 `skills-disabled/` 目录。软链接 Skill 可以导入和启停,但内容只读,需要在源目录维护。

### Stats 与 Usage 的区别

- 使用统计页读取 `~/.claude.json`,展示 Claude Code 本地统计快照(启动次数、工具调用、Skill 使用、各项目最近一次会话)。
- Token 用量页扫描 `~/.claude/projects/**/*.jsonl` 与 `subagents/*.jsonl`,按日期、项目、会话、模型聚合 Token 与费用,并用 SQLite 做增量缓存。

两者数据源与口径不同。排查费用或 Token 时,优先使用 Token 用量页。

## 快速开始

1. 从项目 Release 页面下载当前平台安装包,安装并启动。
2. 首次启动后,应用会读取本机 `~/.claude`、`~/.claude.json` 和 `~/.claude/projects/`。
3. macOS 首次打开如果被系统拦截,可执行 `xattr -rd com.apple.quarantine /Applications/ai-manager.app` 移除隔离属性。

建议首次配置顺序:

1. 打开左下角设置,选择界面语言、主题、默认终端和默认编辑器。
2. 进入配置页新建配置,在「供应商」选项处选择合适的内置供应商。
3. 填写认证密钥和模型配置。
4. 点击测试模型确认 API 地址、Token 和模型可用。
5. 点击启用将配置应用到 `~/.claude/settings.json`。
6. 进入目录总览确认 `settings.json` 写入符合预期。

## 主界面导航

| 入口 | 用途 |
| --- | --- |
| `AI` | 打开或收起 `~/.claude` 目录总览 |
| 配置 | 管理配置,生成并应用 Claude Code 用户设置 |
| 记忆 | 管理 `CLAUDE.md` 与 `rules/*.md` |
| Skills | 管理 Claude Code Skills |
| 项目 | 查看 Claude 项目路径、Git 状态、worktree、项目级 `.claude/` 与 AGENTS / Skills 配对状态 |
| 历史 | 查看 `~/.claude/history.jsonl` 中的历史输入与会话详情 |
| 统计 | 查看 `~/.claude.json` 中的本地统计快照 |
| 用量 | 查看 `~/.claude/projects/` 中的 Token 与费用聚合 |
| 设置 | 调整语言、主题、托盘、默认终端、默认编辑器和诊断入口 |

多数页面的新增或编辑操作会打开右侧抽屉,支持控件模式、JSON 模式或预览。配置、记忆和 Skill 编辑器存在未保存更改时,关闭或切换会提示保存、丢弃或继续编辑。

## `~/.claude` 目录总览

点击左上角 `AI` 入口进入。右侧目录树选择文件后,左侧预览区会打开标签页:Markdown 默认显示渲染预览(可切换源码),其他文本显示源码,二进制只显示元信息。预览底部展示文件大小、修改时间、编码与截断状态。

文件预览工具栏可复制绝对路径、在文件浏览器中定位、用默认编辑器打开;目录树右键可新建文件、新建文件夹、重命名、删除。删除不可撤销,处理 `settings.json`、`CLAUDE.md`、`rules/` 或 `skills/` 前请确认副本。

目录总览只允许操作 `~/.claude` 内部路径;扫描会跳过软链接和 `node_modules`,达到条目数或深度上限时显示提示。

## 配置

配置页是管理 Claude Code settings 的主入口。

### 配置列表

卡片展示名称、描述、是否已应用、主要模型、努力级别、权限模式、Sandbox 状态、插件摘要和最近一次模型测试结果。可执行新建、启用(写入 `~/.claude/settings.json`)、复制环境变量(生成 `export KEY="value"` 文本)、导出配置文件(可选含 / 排除认证密钥,落盘前预览最终 JSON)、复制副本、编辑、删除、一键测试所有配置、拖拽排序。已启用的配置还可一键"同步常用选项与插件到其他配置",把当前配置的常用选项、插件市场和已启用插件复制到其余配置,便于团队统一基线。

当配置页发现未托管的 `~/.claude/settings.json` 且尚无配置时,会显示导入卡片。导入会原地接管当前 settings 内容,不会立即改写文件。已绑定配置与真实 settings 不一致时,卡片会显示差异入口:选择"接受实际配置"会把当前文件内容写回配置;选择"重新应用"会用配置解析结果覆盖 `settings.json`。

### 新建或编辑配置

右侧配置编辑器分多块。

- **基础信息**:名称(必填)、描述、可选供应商(选择后自动带入连接地址与模型映射)。
- **认证**:认证密钥写入 `env.ANTHROPIC_AUTH_TOKEN`;API 地址写入 `env.ANTHROPIC_BASE_URL`,未设置时模型测试使用 Anthropic 官方地址。
- **模型与行为**:默认模型(可输入下拉框,候选取自当前供应商的模型,也可手工输入自定义模型)、努力级别(`auto`/`low`/`medium`/`high`/`xhigh`/`max`)、Opus / Sonnet / Haiku 默认模型(同为可输入下拉框)、Subagent 模型、回复语言、输出风格。
- **常用选项**:覆盖深度思考、Thinking 摘要、Fast Mode、禁用 Hooks、禁用 AI 署名、LSP 工具、Tool Search、新版 Init、无闪烁、Agent Teams 等 Claude Code 常用开关。具体可在编辑器内查看。
- **环境变量**:维护除认证和常用选项外的 `env` 键。重复键、非法 JSON 或未保存的行编辑会阻止保存。
- **权限**:默认模式、禁用 `bypassPermissions`、允许 / 拒绝 / 询问规则、附加目录、推荐规则预设。
- **Sandbox**:可启用或关闭,可添加推荐预设;复杂配置可切换 JSON 模式。
- **Hooks**:维护 Claude Code hooks,支持摘要展示,可添加内置乱码检查预设,复杂结构可切 JSON 模式。
- **插件市场**:维护 `extraKnownMarketplaces`,支持官方市场预设;每个 Marketplace 需完整填写 ID、来源、仓库或 URL、路径、包名、安装位置。
- **插件**:维护 `enabledPlugins`,分"已配置"和"浏览市场"两个 Tab。浏览市场目前仅支持 `github` 来源,可按 Marketplace / 启用状态 / 类别 / 来源筛选,点击启用会立即同步到已配置列表。
- **状态行**:配置自定义状态行命令,可启用默认状态行预设(非 Windows 写入 `~/.claude/statusline.sh`,Windows 写入 `~/.claude/statusline.ps1` 并自动设置 PowerShell 调用命令);目标已存在且内容不同时会提示是否覆盖。
- **最终配置**:预览供应商与配置合并后的最终 JSON;源 JSON 模式可直接维护整个 settings 对象,预览自动加入 schema 地址。

### 模型测试

点击测试模型后,会按当前编辑内容发起请求。结果对话框展示是否成功、使用模型与返回模型、请求地址、状态码、耗时、请求 ID、停止原因、输入提示词、返回内容、请求 / 响应 Headers、请求体、原始响应,以及复制 cURL 和修改提示词重测。

模型测试需要有效的 `ANTHROPIC_AUTH_TOKEN` 和可访问的模型 API。

## 供应商 Provider

供应商均为内置且只读,只承载供应商客观信息(连接地址 `ANTHROPIC_BASE_URL`、模型映射与可选附加环境变量),不含认证密钥。当前覆盖 Anthropic、DeepSeek、智谱 GLM Coding Plan、Kimi Code Plan、MiniMax Token Plan、小米 MiMo Token Plan、OpenRouter、火山方舟 Coding Plan、阿里云百炼 Coding Plan、万界方舟和 Ollama。

不支持自定义供应商。在配置编辑器的「供应商」选项处选择一个内置供应商后,其连接地址与模型映射会自动带入;你只需补充认证密钥与行为设置。点击该选项下方的「查看内置供应商」可打开只读一览,查看每个供应商的名称、ID、API 地址、官方文档链接和推荐模型。

## 记忆管理

记忆页用于管理用户级 Claude Code 指令。

页面顶部会在没有主记忆时显示 Karpathy 行为指南预设,可一键创建并启用为 `CLAUDE.md`。在编辑现有 `CLAUDE.md` 类型记忆时,也可把该预设追加到当前内容底部;AI Manager 会通过预设 marker 防止重复插入,并提供原仓库入口便于查看来源。

**新增记忆**:点击添加记忆,填写名称,选择类型(`CLAUDE.md` 写入 `~/.claude/CLAUDE.md`,同时只能启用一个;Rules 写入 `~/.claude/rules/<path>.md`,可同时启用多个,支持 `paths` glob 匹配),编写 Markdown 内容并保存。在列表中启用后,真实文件才会写入 `~/.claude`。

**编辑、复制和删除**:编辑会更新管理内容,启用状态下同步写真实文件;复制会创建未启用副本;删除会移除管理记录并清理不再需要的 rule 目录。

**导入本地记忆**:AI Manager 会识别 `~/.claude/CLAUDE.md` 和 `~/.claude/rules/*.md` 中尚未导入的文件,点击"导入管理"原地接管,不立即改写内容。软链接记忆不支持导入,路径已被占用需要先处理冲突。

**从目录导入**:点击导入记忆后选择包含 `CLAUDE.md` 或 `rules/` 的目录,导入后默认未启用。常见跳过原因:重复 `CLAUDE.md`、同路径 Rule 已存在、路径无效、读取失败、软链接不支持。

## Skills 管理

Skills 页管理 `~/.claude/skills/` 下的 Claude Code Skill。

**新增 Skill**:点击添加 Skill,填写 Skill 名称(目录名 / slash command,只允许小写字母、数字和连字符)、显示名称、描述,编写 `SKILL.md` 正文。可设置"仅手动触发"(写入 `disable-model-invocation`)和"允许手动调用"。

**列表操作**:每个 Skill 支持启用 / 禁用、编辑 `SKILL.md`、删除、用外部编辑器打开目录、同步到 `~/.codex/skills`。启用对应 `~/.claude/skills/<id>/`,禁用对应应用数据目录下的 `skills-disabled/<id>/`。

**导入 Skills**:可选择单个 Skill 目录、Skill 软链接或包含多个 Skill 的集合目录。跳过原因包括名称不符合规则、同名已存在、缺少有效 `SKILL.md` 或软链接目标无效。软链接 Skill 显示只读提示,可启停和打开源目录,但不能在应用内修改内容。

**支持文件**:编辑器会展示 `SKILL.md` 以外的支持文件树。目前只展示目录树,需要修改时请用外部编辑器打开 Skill 目录。

## 项目管理

项目页从 `~/.claude/history.jsonl` 中提取项目列表,按最近活跃排序。项目详情同时读取项目真实目录,展示 Git、worktree、项目级 Claude 配置和本地清理入口。

### 项目列表与详情

左侧列表展示项目短名称、路径、最近活跃时间、会话与输入数量、最近会话 ID。点击项目后,右侧展示详情。

### 快捷操作

- 用终端打开项目:使用设置中的默认终端,选项会按当前平台和本机已安装情况过滤。
- 用编辑器打开项目:需要先在设置中选择默认编辑器,选项会按平台和安装情况过滤。
- 打开源码仓库:使用项目 Git 远程地址。

### 编辑器与终端支持矩阵

| 应用 | macOS | Linux | Windows |
| --- | --- | --- | --- |
| VS Code | 支持 | 需 `code` CLI | 需 `code` CLI |
| Cursor | 支持 | 需 `cursor` CLI | 需 `cursor` CLI |
| Windsurf | 支持 | 需 `windsurf` CLI | 需 `windsurf` CLI |
| Zed | 支持 | 需 `zed` CLI | 需 `zed` CLI |
| Terminal | Terminal.app | 依次尝试 `$TERMINAL`、`xdg-terminal-exec`、`x-terminal-emulator` 等 | 依次尝试 Windows Terminal、PowerShell、cmd |
| iTerm | 支持 | 不支持 | 不支持 |
| Warp | 支持 | 需 `warp-terminal` CLI | 需 `warp.exe` 或官方安装路径 |
| Ghostty | 支持 | 需 `ghostty` CLI | 暂不支持 |

### 状态检查

详情页展示:目录是否存在、是否 Git 仓库、`CLAUDE.md` / `AGENTS.md` 配对状态、`.claude/skills` / `.agents/skills` 配对状态、项目级 `.claude/` 概览、本地分支与最近提交、Worktree 路径与状态、最近活跃时间、会话与输入数量、最近会话 ID、Git 根目录,以及最近 5 个会话(可点击查看详情)。快捷操作支持打开终端、打开编辑器、打开源码仓库、跳转该项目历史和跳转该项目 Token 用量。

### 项目级 Claude 配置

项目级 Claude 管理分三组:

- Memory 文件:`CLAUDE.md ↔ AGENTS.md` 双向配对。任一端是真文件时,可创建另一端的相对软链接;两端都不存在、普通文件冲突或孤儿软链时不会自动处理。
- 项目级 Skills:`.claude/skills ↔ .agents/skills` 双向配对。任一端是真目录时,可创建另一端相对软链接;两端都是真目录时需手动合并。
- 项目 `.claude/` 目录:可打开右侧 Sheet 浏览、预览和用外部编辑器打开项目级 Claude 文件。`settings.json` 与 `settings.local.json` 支持一键创建;其它项目级文件可预览或外部打开,不在项目抽屉中创建、删除或重命名。

### 分支与 Worktree 清理

项目详情可检测已合并或远端已删除且可安全清理的本地分支与 worktree。清理始终分两步:先生成 preview 列表并由用户选择,确认后才执行删除;后端只会清理 preview 中列出的条目。

### 清除项目本地数据

在项目列表项右键选择清除本地数据。应用会先生成 dry-run 删除计划,确认后才执行。该操作调用 Claude CLI 清除项目保存的本地状态,执行前请仔细检查计划。

## 使用历史

历史页读取 `~/.claude/history.jsonl`,用于回看历史输入和会话。

左侧按项目分组,顶部热力图展示最近历史密度,搜索框按展示文本过滤,点击会话打开详情抽屉。URL 同步 `project`、`q` 和 `session` 参数,便于保留筛选状态。

会话详情展示用户消息、助手消息、思考摘要、工具调用与返回、命令、图片、计划内容和系统事件。可复制项目路径、会话 ID、单条消息,或用编辑器打开原始会话记录文件。

## 使用统计

统计页读取 `~/.claude.json`,展示本地统计快照(不是实时计算结果)。

页面提供启动次数、首次使用日期、项目数、上次 Plan Mode 使用时间、`btw` 使用次数、工具调用次数图表、Skill 使用次数列表、项目最近会话列表。每个项目最近会话展示最近费用、会话时长、新增 / 删除行数、各类 Token、Web 搜索次数、模型明细、首条 Prompt、frame 和 Hook 性能指标。

顶部可刷新数据,或用默认编辑器打开 `~/.claude.json`。

## Token 用量统计

用量页扫描 `~/.claude/projects/**/*.jsonl` 和 `subagents/*.jsonl`,提取 assistant 消息的 usage 字段,按价格表估算费用。

### 数据口径

- 按 `message.id` 全局去重;同一消息出现多次时保留 Token 用量更大的快照。
- Token 包含输入、输出、缓存创建和缓存读取;成本按 USD / 1M tokens 单位估算。
- 价格表加载顺序:本地缓存 `model-pricing.json` → 内置 Anthropic 兜底表 → 启动或手动刷新时从 models.dev 更新。
- models.dev 只导入官方 provider 价格:Anthropic、Moonshot / MoonshotAI、Z.ai / Zhipu / BigModel、MiniMax、Xiaomi / MiMo、DeepSeek。其中 Kimi、MiMo、GLM、MiniMax、DeepSeek 受设置页"第三方模型计价"开关控制,关闭后费用按 0 计入。
- 其他无法匹配价格的模型 Token 仍会统计,但成本按 0 计,并进入未知模型列表。

### 顶部状态与操作

顶部显示价格来源(内置 / 本地缓存 / models.dev 实时)。操作按钮:刷新价格、查看模型价目表(可按模型搜索查看输入、输出、缓存写入 / 读取价格和当前用量)、重新扫描。

### 筛选

支持按日期范围、快捷范围(今日、最近 7 天、最近 30 天、本周、本月、今年、全部)、项目、模型(含 `claude-*` 聚合)筛选。重置回到今日。

### 图表与表格

页面包含总花费、总 Token、会话数、消息数、缓存节省、花费趋势、Token 趋势、模型成本占比、Token 构成,以及按日期、项目、会话、模型的明细表格。趋势图支持按模型或 Token 类型拆分、曲线或柱状、天 / 小时 / 5 分钟粒度,可点击图例切换显示,双击图例只显示当前项。在按会话表格中点击会话可打开消息级用量明细。

## 桌面用量浮窗

桌面用量浮窗是一个置顶、半透明、无边框的小窗,在不打开主界面时也能盯住今日用量。开启后它跨所有虚拟桌面(macOS Spaces)常驻、不进任务栏,首次出现在屏幕右下角,拖动后位置会被记住。三个平台均可使用。

- **展示指标**:实时显示今日用量 KPI,可选成本、Token 总量、缓存命中率、消息数、会话数、Top 模型,默认显示前三项(成本、Token 总量、缓存命中率),可在设置中自定义选择与顺序。
- **数据刷新**:数据与用量页同源,记录或价格变化时自动刷新。
- **快捷跳转**:点击浮窗主体可跳转到主界面的用量页。
- **外观与开关**:不透明度可调,启用开关与指标、不透明度设置都在设置抽屉(见下文「桌面用量浮窗」设置小节)。

## 系统托盘与会话聚焦

AI Manager 常驻系统托盘(菜单栏),菜单分两部分:

- 主托盘:切换当前配置、快速跳转到各页面、退出应用。切换配置等价于在配置页启用对应配置。
- 会话托盘:读取 `~/.claude/sessions/*.json`,按状态汇总当前 Claude 会话(等待输入 / 工作中 / 空闲)。是否显示、字符限制、会话计数样式和待处理呼吸灯都在设置中调整(见下文)。

**会话聚焦**:在支持的平台点击会话条目,或使用会话聚焦快捷键,可回到对应终端 tab。该能力**仅 macOS** 可用,通过 `pid → tty → AppleScript` 精确聚焦 Terminal.app 与 iTerm2,Ghostty 按工作目录近似匹配,Warp 因缺少官方 AppleScript 暂不支持。Linux 与 Windows 不支持自动聚焦,点击会话不会切换终端。详见 [平台支持差异](./platform-support.md)。

**LED 灯效联动(仅 macOS)**:启用后,会话托盘的红绿状态会镜像到外接 ANTICATER USB 设备灯效,适合不盯着菜单栏时用硬件灯提示会话状态。配置入口在设置的设备联动区。

## 设置与诊断

设置入口位于左下角。设置项按界面、菜单栏与会话状态、设备联动、系统通知与计价、系统集成分组,以下顺序与设置抽屉一致。

### 界面

- 界面语言:中文 / 英文。
- 主题外观:浅色 / 深色 / 跟随系统。
- 默认收起侧边栏:启动后侧边栏仅显示菜单图标,窄屏仍会自动收起。

### 菜单栏与会话状态

- 在菜单栏显示当前配置:在托盘图标旁显示当前激活的配置名称;字符数限制可设为关闭、最多 N 字或全展示。
- 在菜单栏显示当前会话:在独立菜单栏区域显示 Claude 当前会话及状态。
- 会话计数样式:数字(`🔴 1 🟢 1`)、上标(`🔴¹ 🟢¹`)或紧凑(`🔴¹🟢¹`)。
- 待处理会话呼吸灯:有等待输入的会话时,菜单栏状态做呼吸灯式脉动提示。

### 桌面用量浮窗

- 启用桌面用量浮窗:开启后创建置顶半透明小窗,实时显示今日用量指标(详见上文「桌面用量浮窗」)。
- 展示指标:多选要在浮窗显示的指标(成本、Token 总量、缓存命中率、消息数、会话数、Top 模型),至少保留一项。
- 不透明度:滑块调节浮窗整体不透明度,范围 30%–100%,默认 92%。

### 设备联动(仅 macOS)

- LED 灯效联动:把托盘会话状态镜像到 ANTICATER USB 设备灯效。打开设置时会自动探测设备,展示已连接 / 未检测到设备 / 检测中状态。等待你的输入、工作中 / 思考中、已完成 / 空闲三种状态可分别指定灯效模式(关闭 / 顺时针 / 逆时针 / 交替 / 跳跃 / 闪烁),每种模式旁的测试按钮可即时点亮验证。未连接设备时配置仍可保存,接入后生效。
- 会话聚焦快捷键:为"聚焦最需处理的会话"注册全局快捷键。点击录制后按下组合键(需包含至少一个修饰键 ⌘/⌃/⌥/⇧),可随时恢复默认。

> 设备联动整组仅在 macOS 显示;其它平台不提供 LED 与全局会话聚焦快捷键。

### 系统通知与计价

- 系统通知:用于 Claude 会话进入待处理状态,以及点击会话跳转但终端定位失败等场景。开启时会先请求系统通知权限;权限被拒绝时设置保持关闭。
- 第三方模型计价:控制 Kimi、MiMo、GLM、MiniMax、DeepSeek 是否按 models.dev 价格估算,关闭后这些模型费用按 0 计入。

### 系统集成

- 开机自启动:登录系统后自动启动 AI Manager。
- 默认终端、默认编辑器:供项目页和目录总览的"用终端 / 编辑器打开"使用。

可用项来自内置支持清单和系统检测,不会自动列出电脑里所有应用,以保证每个选项都有明确的打开命令和项目路径参数。Linux 和 Windows 的编辑器需要对应 CLI 在 `PATH` 中可访问;Windows 的默认终端会优先使用 Windows Terminal,失败后回退 PowerShell 和 cmd。

### 日志查看

点击查看日志可打开日志窗口,支持按级别(all / error / warn / info / debug / trace)筛选、搜索、刷新、打开日志目录、清空日志。日志最多展示最近 500 条匹配结果,被截断时会提示。

### 系统信息

系统信息窗口展示 AI Manager 版本、操作系统类型 / 平台 / 版本 / 家族、CPU 架构、Hostname、Locale。点击复制会把信息复制为 Markdown 表格,便于提交 issue 或排障。

## 本地数据与隐私

AI Manager 主要读写本机文件。配置合并、目录扫描、用量聚合和日志查看都在本地完成。

### 应用管理数据

| 平台 | 路径 |
| --- | --- |
| macOS | `~/.config/ai-manager/` |
| Linux | `$XDG_CONFIG_HOME/ai-manager/` 或 `~/.config/ai-manager/` |
| Windows | `%APPDATA%\ai-manager\` |

> 本应用刻意复用 `~/.config/ai-manager/` 而不是 macOS 标准的 `~/Library/Application Support/...`,便于跨平台同步备份与统一脚本访问。

```text
<应用数据目录>/
  config-registry.json
  memories.json
  model-pricing.json
  skills-disabled/
```

### Claude Code 用户目录与输入

```text
~/.claude/
  settings.json
  CLAUDE.md
  rules/
  skills/
  projects/        # 用量页输入
  history.jsonl    # 项目页与历史页输入
  statusline.sh
~/.claude.json     # 统计页输入
```

### 用量 SQLite 缓存

由后端用量 runtime 通过 `sqlx` 维护,数据库名为 `usage.db`,位于 Tauri 默认应用配置目录(与"应用数据目录"不是同一位置)。SQLite 使用 WAL 模式时,同目录可能同时出现 `usage.db-wal` 与 `usage.db-shm`。

| 平台 | 路径 |
| --- | --- |
| macOS | `~/Library/Application Support/com.gotobeta.app.ai-manager/usage.db` |
| Linux | `$XDG_CONFIG_HOME/com.gotobeta.app.ai-manager/usage.db` 或 `~/.config/com.gotobeta.app.ai-manager/usage.db` |
| Windows | `%APPDATA%\com.gotobeta.app.ai-manager\usage.db` |

### 日志目录

文件名通常是 `ai-manager.log`,轮转文件形如 `ai-manager_2026-04-29_09-13-00.log`。

| 平台 | 路径 |
| --- | --- |
| macOS | `~/Library/Logs/com.gotobeta.app.ai-manager/` |
| Linux | `$XDG_DATA_HOME/com.gotobeta.app.ai-manager/logs/` 或 `~/.local/share/com.gotobeta.app.ai-manager/logs/` |
| Windows | `%LOCALAPPDATA%\com.gotobeta.app.ai-manager\logs\` |

## 常见工作流

### 创建并启用一个供应商配置

1. 进入配置页新建配置,在「供应商」选项处选择一个内置供应商,填写认证密钥。
2. 按需调整默认模型、努力级别和常用选项,打开最终配置预览确认 `env` 与权限。
3. 点击测试模型,成功后保存。
4. 回到列表点击启用,进入目录总览检查 `settings.json`。

### 接管已有 `CLAUDE.md` 和 Rules

1. 进入记忆页,在未导入分组中对需要管理的文件点击"导入管理"。
2. 检查内容和路径匹配,按需启用或禁用。

### 创建 Skill 并同步给 Codex

1. 进入 Skills 页添加 Skill,填写合法 id、显示名称和描述。
2. 编写 `SKILL.md`,设置是否允许自动 / 手动调用并保存启用。
3. 点击同步到 `~/.codex/skills`。

### 排查模型无法调用

1. 编辑目标配置,确认认证密钥、API 地址和模型。
2. 点击测试模型,在结果中查看状态码、请求地址、请求体和原始响应。
3. 必要时复制 cURL 到终端复现;如是应用自身保存或调用失败,进入设置查看日志。

### 排查费用或 Token 异常

1. 进入用量页,选择日期范围、项目和模型,查看总花费与构成。
2. 打开模型价目表,确认目标模型是否有完整价格;切到按会话表格点击异常会话查看消息级明细。
3. 模型出现在未识别列表说明成本按 0 计,可尝试刷新价格;第三方模型确认设置页计价开关是否开启。

## 常见问题

### 启用配置后写到哪里?

写入 `~/.claude/settings.json`,内容是供应商 `env` 与配置自身 settings 合并后的最终 JSON,并带 Claude Code settings schema。

### 删除配置会删除 `settings.json` 吗?

不会。删除配置只移除管理记录和绑定状态,不会清理已经写出的 `~/.claude/settings.json`。

### 为什么模型测试提示缺少 `ANTHROPIC_AUTH_TOKEN`?

当前配置最终配置中没有可用的认证密钥。请在认证区填写,或确认 JSON 中的 `env.ANTHROPIC_AUTH_TOKEN` 是否被覆盖为空。

### 为什么项目页没有项目?

项目页来自 `~/.claude/history.jsonl`。使用 Claude Code 产生历史记录后,项目会显示在 AI Manager 中。

### 为什么统计页和用量页费用不一致?

统计页读取 `~/.claude.json` 的本地统计快照;用量页扫描 `~/.claude/projects/**/*.jsonl` 并按当前价格表重新估算。两者数据源和计算口径不同。

### 为什么某些模型费用为 0?

模型不在价格表中,Token 仍统计但费用按 0 计。Kimi、MiMo、GLM、MiniMax、DeepSeek 在第三方模型计价关闭时也会按 0 计入。可尝试刷新价格,或在设置页开启第三方模型计价。

### 为什么不能编辑软链接 Skill?

软链接 Skill 的源目录不属于 AI Manager 直接管理范围。应用只允许启停、导入和打开目录,内容需要在源目录维护。

### 清除项目本地数据安全吗?

该操作会先生成 dry-run 删除计划,确认后才执行,用于清除 Claude CLI 保存的项目本地状态。执行前必须检查删除计划,避免误删仍需要的数据。

### 为什么看不到 LED 灯效联动或会话聚焦快捷键?

这两项都**仅 macOS** 提供,Linux 和 Windows 的设置中不会显示。LED 灯效还需要接入 ANTICATER USB 设备:设置的设备联动区显示"未检测到设备"时灯效不会亮,请确认设备已连接并在该区开启开关、为对应状态选择非"关闭"的灯效模式。
