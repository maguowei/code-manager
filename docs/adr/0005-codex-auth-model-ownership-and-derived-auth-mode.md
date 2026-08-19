# Codex 认证模型：退出 auth.json 所有权 + 认证模式推导

Status: accepted

## Context

Codex CLI 的 ChatGPT 登录态由 `codex login` 持久化到 `~/.codex/auth.json`。第三方 Provider 则可以在 `config.toml` 的 `[model_providers.*]` 中使用 `experimental_bearer_token` 或 `env_key`。若 Code Manager 写 `auth.json`，会污染并可能覆盖 Codex 自己维护的登录态；若结构化 Profile 在切换 Provider 时错误沿用旧 key，又会把凭据发给错误的服务端。

## Decision

1. **`auth.json` 永远只读**：Apply、预览和原生启动都不得修改它。
2. **认证模式从内置 Provider 推导**：OpenAI 官方使用 ChatGPT 登录，不存 API key、不生成 `[model_providers.openai]`；内置第三方使用 API key 或 Provider 预设的 `env_key`。
3. **密钥切换规则**：仅当编辑同一个 inline-key Provider 时，空 key 才表示保留。切换到另一个 inline-key Provider 必须提供新 key；切换到 OpenAI、`env_key` Provider 或高级片段模式时清除旧 key。
4. **预览单独脱敏**：Apply 和 launch 使用真实渲染结果；预览对 TOML 与 models JSON 递归脱敏，复用统一敏感键规则，不能返回 token、secret、password、api_key 或 authorization 明文。
5. **双凭据提示**：预览 OpenAI Profile 时只读 `auth.json`。同时存在非空 `OPENAI_API_KEY` 和 `tokens` 时返回计费风险 warning；不自动删除或改写任何字段。
6. **不写全局认证选择键**：不写 `preferred_auth_method` / `forced_login_method`，避免从第三方切回 OpenAI 后残留强制 API-key 路径。

## Consequences

- 内置 OpenAI Profile 是回到官方 ChatGPT 登录路径的结构化配置，但历史第三方 Provider 段继续保留。
- Profile 复制必须在后端 registry 内复制真实密钥，前端只能接收脱敏对象。
- 预览与 Apply 的输出不再能共用同一可展示字符串；脱敏是只发生在 preview 边界的转换。
- Code Manager 只能提示 `auth.json` 中的潜在 API 计费风险，不能替用户修复登录态。
