# Codex 认证模型：退出 auth.json 所有权 + 认证模式推导

Status: accepted

## Context

Codex 配置切换 v1（ADR 0004）把认证锁死为 ApiKey-only：每次 apply 往 `~/.codex/auth.json` 写 `OPENAI_API_KEY`，自定义 Provider 走 `env_key` 环境变量。对照官方 DeepSeek/GLM 接入文档与 cc-switch 的 preserve-on 路径，发现两条硬伤：① 官方第三方接入根本不碰 auth.json，key 内联进 config.toml 的 `experimental_bearer_token`；② `env_key` 要求用户 shell 里 export 环境变量，GUI 切换后往往 401。而目标用户画像（用 ChatGPT 账号在 Codex 上工作、偶尔切 DeepSeek 中转）要求**切第三方时不破坏 `codex login` 的 ChatGPT 登录态**——v1「写 auth.json」的行为恰恰会污染它。

## Decision

1. **Code Manager 永远不拥有 `~/.codex/auth.json`**：移除 `render_codex_auth` 写入；auth.json 是 `codex login` 的领域。ADR 0004 决策 #3 当初排除 OAuth 的核心理由（自刷新 token 与 Apply/Binding/Mismatch 语义冲突）因此从根上消失，无需 cc-switch 式 account+generation 防漂移。
2. **认证模式从 Provider 推导**：内置 OpenAI 官方 = ChatGPT 登录（免 key，apply 只写 `model_provider="openai"`）；自定义第三方 = API key（key 内联 `experimental_bearer_token`）。Profile 不新增用户可选的认证字段，避免选错。
3. **内置官方 Profile 即恢复点（候选 A）**：apply 内置 openai profile = 一键复原官方配置，不引入独立「恢复」概念/按钮；不清理残留 provider 段（外科补丁不删除）。
4. **不写全局认证字段**：否决 `preferred_auth_method` / `forced_login_method`——它们是全局顶层键，apply 第三方写入后会在切回官方时残留、强制 apikey 路径，破坏 ChatGPT 登录。纯靠 provider 段内联 token 区分认证。
5. **不做 apply 前快照备份**：外科补丁只动 provider 相关键 + `write_pair_atomic` 已有失败回滚，「一键复原官方」即兜底；官方 DeepSeek 脚本的备份针对首次整体初始化，不适用本场景。
6. **模型目录（a+c）**：可选生成 `~/.codex/models.json`，来源 = 内置静态清单 + 用户自定义覆盖；原子边界扩到第三文件。
7. **`env_key` 降级为可选**：自定义 Provider 可选用环境变量键名，默认内联 key。

## Consequences

- `render_codex_auth` 移除；`CodexApplyPreview.api_key_will_set` 语义改为「是否内联 bearer token」。
- CodexProvider / CodexProfile 结构体、前端表单、i18n、config.rs 的 codex 单测、CodexProfilesPage 测试需同步改写。
- CONTEXT.md 新增「Codex 认证模式」「Codex 模型目录」术语，修订「Codex 应用」定义。
- 已知不处理：用户 shell 中 `OPENAI_API_KEY` 环境变量会令 Codex 优先 API 计费而非 OAuth（Code Manager 无法控制）。
