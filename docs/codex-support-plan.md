# Codex 支持方案：Profile、认证与原生启动

> 决策记录见 [ADR 0004](./adr/0004-codex-config-surgical-patch-parallel-model.md) 与 [ADR 0005](./adr/0005-codex-auth-model-ownership-and-derived-auth-mode.md)；术语见 `CONTEXT.md`「Codex 配置」章节。

## 决策摘要

1. Codex 使用独立的 Provider / Profile / Apply / Binding 类型，registry 复用顶层 `codex` 段。
2. Provider 全部内置只读；不提供自定义 Provider registry 或 CRUD。
3. 结构化 Profile 拥有 Provider、认证、`model` 与 `model_reasoning_effort`。空值使用 Provider 默认值；双方都无值时清理磁盘旧值。
4. 高级 Profile 直接保存 TOML / models JSON 片段；片段中显式声明的任意键都可覆盖，未出现的键保持原样。
5. `~/.codex/auth.json` 永远只读。OpenAI 官方走 ChatGPT 登录；内置第三方走 inline API key 或预设 `env_key`。
6. 编辑当前 binding 指向的 Profile 时，保存前自动重新 Apply。
7. 任意 Profile 使用 Codex 原生 `--profile` 启动，不再由前端拼接 `codex -m`。

## 持久化与密钥规则

- 同一个 inline-key Provider 的编辑输入可用空 key 表示保留。
- 切换到另一个 inline-key Provider 时必须输入新 key。
- 切换到 OpenAI、`env_key` Provider 或高级片段模式时清除 registry 中的旧 key。
- Profile 复制在后端 registry 内完成，复制真实 key、模型与高级片段；返回前统一脱敏。
- Profile 重排持久化完整 ID 顺序，遗漏项追加到末尾，未知 ID 忽略。
- 删除和编辑成功后清理该 Profile 的原生启动文件。

## Apply 契约

结构化模式写入：

```toml
model_provider = "deepseek"
model = "deepseek-v4-flash"
model_reasoning_effort = "high"

[model_providers.deepseek]
name = "DeepSeek"
base_url = "https://api.deepseek.com/"
experimental_bearer_token = "sk-…"
wire_api = "responses"
```

- OpenAI 官方不生成 `[model_providers.openai]`，认证由 `codex login` 维护。
- Apply 保留未拥有的顶层键、注释、顺序和历史 Provider 段。
- 高级模式把用户片段作为显式覆盖层；不额外限制它能声明的键。
- 有模型目录时，`config.toml` 与 `~/.codex/models.json` 成对原子写入。

## 预览与认证安全

- Apply 与原生启动使用含真实凭据的内部渲染结果。
- preview 对 TOML 和 models JSON 递归脱敏，敏感键规则覆盖 `authorization`、token、secret、password、api_key 等形式。
- 未保存输入通过 ID 读取 registry 中的真实 key；仅同 Provider 的空 key 能沿用旧值。
- OpenAI Profile 预览只读 `~/.codex/auth.json`。若非空 `OPENAI_API_KEY` 与 `tokens` 同时存在，返回 `legacyApiKeyMayOverrideChatGptLogin` warning；绝不改写文件。

## 原生启动契约

Codex CLI 会先加载基础 `~/.codex/config.toml`，再叠加所选 Profile 文件（见 [OpenAI Codex Advanced Configuration](https://learn.chatgpt.com/docs/config-file/config-advanced)）。Code Manager 为每个 Profile 生成稳定名称：

```text
~/.codex/code-manager-<profile-uuid>.config.toml
~/.codex/code-manager-<profile-uuid>.models.json  # 可选
codex --profile code-manager-<profile-uuid>
```

- Profile TOML 只包含覆盖层，不复制基础配置。
- 模型目录使用绝对路径。
- 两个文件权限固定为 `0600`，命令载荷不包含密钥。
- 编辑或删除后旧产物失效；再次打开启动弹窗时重新生成。

## IPC 契约

- `duplicateCodexProfile(id, nameSuffix) -> CodexProfile`
- `reorderCodexProfiles(ids) -> null`
- `prepareCodexProfileLaunch(id) -> CodexProfileLaunchPayload { command }`
- `CodexProvider.localizedName` 为可选本地化名称。
- `CodexApplyPreview.providerId` 由前端本地化展示，并携带 `warnings`。

## 验证

- 后端：`make fmt-rust-check`、`make check`、`make lint-rust`、`make test-rust`。
- 契约：`make bindings`、`make bindings-check`。
- 前端：Codex 定向 Vitest、`make lint-frontend`、`make build-frontend`、`make test-frontend`。
- 全量：`make verify`、`git diff --check`。

## 明确不做

- 不修改外部 GitHub Issue。
- 不提供自定义 Provider CRUD。
- 不写 `preferred_auth_method` / `forced_login_method`。
- 不托管或修复 ChatGPT OAuth token。
- 不为当前未发布契约增加 registry 版本或数据迁移。
