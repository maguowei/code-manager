# Codex 配置切换采用平行独立模型 + 外科补丁所有权

## Context

要在 Code Manager 里增加「切换 Codex(OpenAI Codex CLI)配置」的能力。现有配置系统整套只服务单一目标 `~/.claude/settings.json`,领域模型是 Provider(内置只读客观信息)→ Profile(叠加认证与行为)→ Apply(原子全量写盘)→ Binding(记录当前挂载),并配 Managed/Unmanaged/Import/Mismatch 语义。

Codex 的现实与 Claude 有三处硬差异,直接决定能否复用现有模型:

1. **落盘目标不同**:Codex 配置在 `~/.codex/config.toml`(TOML,带 `[model_providers.*]`)**加**独立的 `~/.codex/auth.json`,不是单个 JSON 文件。TOML 带注释、有顺序,round-trip 易失真。
2. **文件所有权不同**:`config.toml` 里除 provider 相关键外,还塞满用户天天手改、与 provider 切换无关的内容(`model`、`approval_policy`、`sandbox_mode`、`[mcp_servers.*]`、`notify`…)。它是用户主场,不是一个可被单份 Profile 全量拥有的文件。
3. **认证形态不同**:Codex 支持 ApiKey 与 ChatGPT OAuth 两种模式;后者是 `codex login` 管的、会自刷新的 OAuth token,非用户可编辑,会被 Codex 后台改写。

参考项目 cc-switch 对 Codex 的做法是:允许自定义 provider、切换时写活文件、SQLite 单一真源。

## Decision

1. **平行独立模型(A2)**:Codex 获得自己的 Provider/Profile/Apply/Binding 链,与 Claude 侧**共享心智骨架但不共享类型、不共享 glossary 定义**。术语固化在 `CONTEXT.md` 的「Codex 配置(Codex Config System)」小节,并显式标注与 Claude 侧的分家点。
2. **外科补丁所有权(B)**:Codex Apply 只改写 `config.toml` 的 `model_provider` 与对应 `[model_providers.NAME]`,并写 `auth.json` 的 `OPENAI_API_KEY`(spec 所述 `openai_api_key` 的 SCREAMING_SNAKE_CASE 序列化形式);`config.toml` 其余键、注释、顺序**一律原样保留**(需 TOML 保真 round-trip,如 `toml_edit`),**不做任何删除**——切换前活跃的旧 provider 段同样原样保留。`env_key` 与 `wire_api` 按用户定义写入 provider 段(`wire_api` 固定为 `responses`,Codex CLI 已移除 `chat`,存量 `chat` 自动规整)。**不改 `auth_mode`、不触碰 ChatGPT OAuth 状态**:OAuth 的登录/退出归 `codex login` 管理,切换认证形态属第一版范围外。Codex Profile 因此是「一层 provider+key 覆盖」,**不是**「一份完整设置单元」。
3. **认证仅 ApiKey**:第一版 Codex Profile 只承载一个静态 API key。**不纳入 ChatGPT OAuth**——其自刷新 token 会与 Apply/Binding/Mismatch 语义正面冲突(刚绑定的 `auth.json` 被 Codex 后台改掉 → 永久 Mismatch)。
4. **Provider 允许自定义(B)**:Codex Provider 可由用户新建(填 `base_url`/`env_key` 名/`wire_api`),内置只读项仅作快速起步预设。这打破了「Provider 全部内置只读」这条**只对 Claude 成立**的不变量,因为切私有中转正是 Codex 切换的主力场景。
5. **同 registry、新增 `codex` 段(A)**:复用 `config-registry.json`,新增互不引用的 `codex` 顶层段(`providers`/`profiles`/`bindings`),`REGISTRY_VERSION` 从 1 升 2,加一次向前兼容迁移(老文件 `codex` 缺省为空)。概念平行不等于存储平行,单文件保原子性。
6. **独立顶层页(A)**:Codex 在 UI 上是独立 tab(`CodexProfilesPage`),不与 Claude 配置页同屏,避免两套不同语义被用户混成一套。
7. **第一版明确不做**:ChatGPT OAuth 切换、Codex 的目录总览/Overview、`config.toml` 行为项(MCP/notify/sandbox…)编辑、Codex 的 Skills/Memory/Usage/Stats/History、模型价格与模型测试、`config.toml` 深链导入。

## Consequences

- `CONTEXT.md` 出现三对「同名不同义」概念(Codex Provider ≠ Claude Provider、Codex Profile ≠ Claude Profile、Codex Apply ≠ Claude Apply);glossary 已用 `_Avoid_` 挡裸用混淆,代码与 UI 也须始终带 `Codex` 前缀区分。
- Managed/Unmanaged/Import/Mismatch 语义在 Codex 侧**变窄**:Mismatch 只比对被托管的 provider 相关键,用户在应用外改 `mcp_servers` 等不算漂移。这是外科补丁的直接结果,与 Claude 的全量托管语义不对称。
- 引入 TOML 保真依赖(如 `toml_edit`),Codex Apply 的原子边界横跨 `config.toml` + `auth.json` 两个文件,写盘需保证两者要么都成功要么都不落地。
- 「Provider 全部内置只读」不再是全局真理,仅对 Claude 成立;任何跨两侧的抽象都不能假设 Provider 只读。
- 第一版范围锁死为「provider 层 + ApiKey 的外科式切换」;OAuth、行为项编辑、Usage 等每一项都是另一套数据源/语义/UI,后续要加须各自单开,不得回头重载已发布的 Codex Profile 语义。
- registry v2 迁移一旦发布即难回退;若将来要合并 Claude/Codex 类型或改所有权模型,需再写一次迁移。
