# Code Manager

Code Manager 的领域术语表(glossary),只记录本项目语境下需要统一口径的词汇,不记录实现细节。

## Language

### 配置系统(Config System)

**配置(Profile)**:
一份完整的 Claude Code 设置单元,引用一个 [Provider](#provider供应商) 并在其 `env` 之上叠加自身 `settings`(认证密钥、permissions/hooks、行为等)。可被[应用](#应用apply)写入 `~/.claude/settings.json`。已移除旧的继承链,配置之间不再互相继承。
_Avoid_: Profile(裸用英文)、预设/preset(已移除的旧继承模型残留,仅存于 `presetId` 兼容别名)、方案

**Provider(供应商)**:
只承载供应商客观信息的单元:连接地址 `env.ANTHROPIC_BASE_URL`、模型映射与元数据(`models`/`docUrl`)。**全部内置只读、不支持自定义、无继承**,且**不含认证密钥、不含 permissions/hooks**——那些都属于[配置](#配置profile)。
_Avoid_: 预设/preset、渠道、服务商、模型源

**应用(Apply)**:
把[配置](#配置profile)解析为最终设置、原子写入 `~/.claude/settings.json`,并在注册表记录[绑定](#绑定binding)的动作。仅预览合并结果、不落盘的是另一回事。
_Avoid_: 激活、保存、部署、切换(切换只是在 UI 选中另一份配置,不等于应用)

**绑定(Binding)**:
注册表中记录「当前哪份[配置](#配置profile)挂在 `~/.claude/settings.json` 上」的持久关联(`bindings.user_profile_id`)。被绑定配置被修改时会重新[应用](#应用apply)。
_Avoid_: 应用状态、关联、挂载

**托管(Managed)**:
`~/.claude/settings.json` 的内容由某份[配置](#配置profile)所管理的状态。反之,未被任何配置管理的现存 `settings.json` 是**未托管设置(Unmanaged User Settings)**,可被原地接管(import)为一份新配置,而不立即重写文件。
_Avoid_: 管理、纳管、接入

**设置漂移(Settings Mismatch)**:
已[绑定](#绑定binding)配置的预期内容与磁盘上真实 `~/.claude/settings.json` 不一致的状态(`activeUserSettingsMismatch`)。经 diff 展示后,可选择接管实际内容或重新[应用](#应用apply)。
_Avoid_: 冲突、不同步、脏配置

### 防止休眠(Sleep Prevention)

**防止休眠(Sleep Prevention)**:
应用阻止操作系统进入空闲休眠的能力,用于保证 Claude Code 会话在无人值守时不被系统休眠打断。
_Avoid_: 保持唤醒(keep awake)、caffeine、防睡眠

**防止休眠模式(Sleep Prevention Mode)**:
一个三态互斥的用户偏好,决定防止休眠**何时**生效。取值:关闭(Off)、始终(Always)、仅活动时(While Active)。与[屏幕常亮](#屏幕常亮keep-display-awake)正交:模式管"何时",屏幕常亮管"保持什么"。
_Avoid_: 防止休眠开关(它不是布尔开关,是三态)

**屏幕常亮(Keep Display Awake)**:
一个与[防止休眠模式](#防止休眠模式sleep-prevention-mode)正交的布尔偏好,决定保持唤醒时**连显示器一起不熄**(阻止显示器空闲休眠,连带系统)还是**只挡系统空闲休眠、放任屏幕熄灭**。仅在模式非关闭时有意义;关闭时无效。默认关(只挡系统)。
_Avoid_: 防止黑屏、屏幕常显、display sleep

**始终(Always)**:
防止休眠模式的一种取值。无条件保持电脑唤醒,与会话状态无关,直到用户切换到其它模式。
_Avoid_: 手动模式、常开

**仅活动时(While Active)**:
防止休眠模式的一种取值。仅当存在[活动会话](#活动会话active-session)时保持唤醒,会话结束后自动释放。
_Avoid_: 自动模式

### 活动会话(Active Session)

**活动会话(Active Session)**:
一个处于 running 类状态(`running / busy / active / starting`)的 Claude Code 会话。**waiting(等待用户操作)不计入**——那时 Claude 卡在等人,机器休眠也不会杀死会话。"仅活动时"模式据此判断是否保持唤醒。
_Avoid_: 运行中会话(running session,只是其中一个具体状态)

### 会话聚焦(Session Focus)

**会话聚焦(Session Focus)**:
把承载 Claude Code 会话的终端视图带到前台的动作:宿主终端窗口/tab 激活,以及多路复用器(如 herdr)内部的 pane 选中。聚焦的载体随会话所在环境不同而不同(终端 tab、herdr pane、Ghostty term),但语义不变:用户眼睛看到承载该会话的视图并可直接交互。
_Avoid_: 聚焦终端 tab(herdr 场景没有 tab 概念)、激活窗口(只覆盖一半语义)

### 发布通道(Release Channel)

#### 每夜构建(Nightly)

持续提供主线最新可测试版本的**滚动发布通道**,用于正式发布前体验新功能和反馈问题。新构建替代旧构建,不承诺稳定性或历史版本保留。
_Avoid_: 预发布、nightly build(裸指构建时)、canary(语义不同,当前无此通道)

#### 预发布(Prerelease)

表示“比 stable 早”的发布标记,不定义具体通道的更新、保留或质量策略。它可用于标记每夜构建,但两者不是同义词。
_Avoid_: 把它们当同义词(预发布是标记,每夜构建是通道)

#### 候选版本(Release Candidate)

正式发版前的验收版本,与[每夜构建](#每夜构建nightly)同为"发布前通道",但由发布流程人工/半自动产生、目标指向即将发布的版本。当前**无此通道**;术语先行定义以便后续引入时口径一致。
_Avoid_: 预发布、beta、RC(裸缩写,除非重申语义)

### 目录总览(Directory Overview)

**目录总览(Directory Overview)**:
对 Claude Code 本地目录树(`~/.claude` 或项目级 `.claude/`)的只读浏览视图,用于查看布局、预览文件内容与诊断异常条目。
_Avoid_: 文件管理器、资源管理器、通用编辑器

**软链条目(Symlink Entry)**:
目录总览中**自身**为符号链接的树节点。可只读查看(目录可展开、文件可预览),不可经总览写入。
_Avoid_: 快捷方式、别名、映射(单独指代软链时)

**经软链路径(Path Via Symlink)**:
解析时经过至少一个[软链条目](#软链条目symlink-entry)的逻辑路径。只读可预览;新建、重命名、删除一律拒绝。
_Avoid_: 外部路径、越界路径(经软链可读但写仍拒绝,与恶意路径逃逸不同)

**可预览文本(Previewable Text)**:
目录总览中非已知二进制类型的文件内容,以 UTF-8 或有损 UTF-8 形式展示供阅读。
_Avoid_: 源码、纯文本白名单(判定是「非已知二进制」,不是穷举文本扩展名)

### 深度链接(Deep Link)

**深度链接(Deep Link)**:
由操作系统协议处理器打开 Code Manager 并触发既定业务动作的自定义 URL。当前注册 scheme 为 `code-manager://`。
_Avoid_: 万能链接(Universal Link / App Link,指 https 关联应用)、自定义协议(泛称实现手段时)

**配置导入链接(Profile Import Link)**:
一种[深度链接](#深度链接deep-link),动作为将外部 Claude settings 导入为一份新[配置](#配置profile)。打开后须经预览确认才入库,且**不自动应用/绑定**到 `~/.claude/settings.json`。
_Avoid_: 一键应用链接、配置同步链接、远程配置下发

**内嵌载荷导入(Embedded Payload Import)**:
[配置导入链接](#配置导入链接profile-import-link)的一种来源:settings JSON 经 base64url 编码后放在 query `payload` 中随链接携带。
_Avoid_: 附件导入、剪贴板导入(那是别的入口)

**远端 URL 导入(Remote URL Import)**:
[配置导入链接](#配置导入链接profile-import-link)的一种来源:query `url` 指向一份 HTTPS 上的 settings JSON,由应用拉取后再走同一套预览导入。
_Avoid_: 在线配置中心、配置订阅、远程同步

### 历史、统计与用量(History, Stats & Usage)

三者数据源不同,互不混用。

**项目(Project)**:
Claude Code 的会话工作目录视图,数据源是 `~/.claude/history.jsonl`。
_Avoid_: 工作区、仓库、会话(会话是项目内的单次对话)

**统计(Stats)**:
基于 `~/.claude.json` 的账户级统计视图。
_Avoid_: 用量(数据源不同,见下)、报表

**用量(Usage)**:
扫描 `~/.claude/projects/**/*.jsonl` 得到的 Token 消耗与费用视图;[缓存命中率](#缓存命中率cache-hit-rate)等指标都归此。
_Avoid_: 统计(数据源不同,见上)、账单

**缓存命中率(Cache Hit Rate)**:
在筛选范围内,缓存读取占全部输入侧 Token 的比例。口径固定为 `cacheRead / (input + cacheCreate + cacheRead)`;输出 Token 不计入分母。无输入时记为 0%。
_Avoid_: 缓存率、命中比、把 output 算进分母、对各时间点命中率做算术平均

**总体缓存命中率(Overall Cache Hit Rate)**:
按全部模型 token **加权**汇总后的[缓存命中率](#缓存命中率cache-hit-rate),不是各模型命中率的简单平均。KPI 卡片与命中率趋势图中的「总体」系列共用此口径。
_Avoid_: 平均命中率、模型命中率均值

**模型缓存命中率(Model Cache Hit Rate)**:
单个模型在同一筛选与时间桶内、仅用该模型 token 算出的[缓存命中率](#缓存命中率cache-hit-rate)。与[总体缓存命中率](#总体缓存命中率overall-cache-hit-rate)并列展示,便于对比模型缓存表现。
_Avoid_: 模型缓存率(省略「命中」)、用总体分母去除模型分子

### 记忆(Memory)

**记忆(Memory)**:
Code Manager 管理的 Claude Code 用户级指令文件,即 `~/.claude/CLAUDE.md` 与 `~/.claude/rules/*.md`。**不含** Claude Code 的 auto memory——那是独立机制,当前不扫描、不导入、不写入。
_Avoid_: 指令、提示词、Claude Code auto memory(独立机制,不归本页管)

**claude 记忆(Claude Memory)**:
`claude` 类型的[记忆](#记忆memory),同一时间只能启用一个,启用即写入 `~/.claude/CLAUDE.md`。
_Avoid_: 主记忆、全局记忆

**rule 记忆(Rule Memory)**:
`rule` 类型的[记忆](#记忆memory),可同时启用多个,分别写入 `~/.claude/rules/<rulePath>`,携带结构化 `pathPatterns` 决定按路径触发。
_Avoid_: 规则文件(泛指)、path rule

### Skills

**Skill**:
一个带 `SKILL.md` 的目录单元。启用时位于 `~/.claude/skills/<id>/`,禁用时移到应用数据目录的 `skills-disabled/<id>/`;id 只含小写字母、数字与连字符。
_Avoid_: 技能(项目 UI 与代码统一用 Skill)、插件、能力

**软链接 Skill(Symlinked Skill)**:
本体为目录级符号链接的 [Skill](#skill)。只读查看其目标目录的 `SKILL.md`,不递归读取支持文件,不可经应用编辑。与[软链条目](#软链条目symlink-entry)同源但专指 Skill。
_Avoid_: 外部 Skill、引用 Skill
