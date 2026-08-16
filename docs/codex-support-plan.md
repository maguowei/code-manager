# Codex 支持方案：认证模型对齐官方（v2）

> 决策记录见 [ADR 0005](./adr/0005-codex-auth-model-ownership-and-derived-auth-mode.md)；术语见 `CONTEXT.md`「Codex 配置」章节。本文档是可执行的实施方案。

## Context

Codex 配置切换 v1（ADR 0004）把认证锁死为 ApiKey-only：apply 写 `~/.codex/auth.json` 的 `OPENAI_API_KEY`，自定义 Provider 走 `env_key`。调研官方 DeepSeek/GLM 接入文档与 cc-switch 后确认两条硬伤：官方第三方接入不碰 auth.json（key 内联 `experimental_bearer_token`）；`env_key` 依赖用户 shell 环境变量。且目标用户画像是「用 ChatGPT 账号在 Codex 上工作、偶尔切 DeepSeek 中转」——v1 每次写 auth.json 恰恰会污染 `codex login` 的登录态。

## 决策摘要

1. **Code Manager 永远不拥有 `~/.codex/auth.json`**（移除 `render_codex_auth` 写入）。
2. **认证模式从 Provider 推导**：内置 openai = chatgpt-login（免 key）；自定义第三方 = api-key（key 内联）。
3. **内置官方 Profile 即恢复点**：apply 它 = 一键复原官方，无独立「恢复」概念。
4. **不写全局认证字段**（否决 `preferred_auth_method`/`forced_login_method`）。
5. **不做 apply 前快照备份**（外科补丁 + 原子回滚 + 一键复原兜底）。
6. **模型目录 a+c**：内置静态清单 + 用户自定义覆盖，`~/.codex/models.json`。
7. **`env_key` 降级为可选**，默认内联 key。

## 落盘契约

### 自定义第三方（api-key 模式）

```toml
# 用户自管，Code Manager 不碰
model = "deepseek-chat"
model_context_window = 128000

# Code Manager apply 写入（外科补丁，其余键原样保留）
model_provider = "9b2f3a6e-…"        # slug = provider.id 去 custom: 前缀转小写

[model_providers.9b2f3a6e-…]
name = "DeepSeek"
base_url = "https://api.deepseek.com"
experimental_bearer_token = "sk-…"   # profile.api_key 内联；或写 env_key（用户选择时）
wire_api = "responses"
```

- key 来源二选一：`experimental_bearer_token`（默认，内联 profile 的 key）或 `env_key`（用户显式选择，写环境变量键名、不内联 key）。
- `wire_api` 恒 `responses`（`coerce_codex_wire_api` 已保证）。

### 内置 OpenAI 官方（chatgpt-login 模式）

```toml
# 只写这一行（外科补丁）
model_provider = "openai"
```

- **不创建** `[model_providers.openai]` 段（Codex 有内置默认，走 auth.json 的 ChatGPT 登录）。
- auth.json **零触碰**——登录态 preserve 在 `codex login` 手里。

### auth.json

任何场景都不写入。`render_codex_auth` 整体移除。

### 模型目录（可选）

- apply 时若 provider 带模型目录，生成 `~/.codex/models.json` 并在 config.toml 顶层写 `model_catalog_json = "~/.codex/models.json"`。
- 原子边界：config.toml + models.json 两文件，复用/扩展 `write_pair_atomic`。

## 数据模型变更（`src-tauri/src/config.rs`）

| 类型 | 变更 |
| --- | --- |
| `CodexProvider`（:230） | `env_key` 改为 `Option<String>`；新增 `model_catalog: Option<Value>`（用户自定义模型目录，可空） |
| `CodexProfile`（:247） | 不变（api_key 在 chatgpt-login 模式可为空） |
| `CodexProviderInput`（:501） | `env_key` 改 `Option<String>`；新增 `model_catalog` |
| `CodexApplyPreview`（:542） | `api_key_will_set` 语义改为 `will_inline_bearer_token`（或按展示需要改名） |
| 新增 | `codex_auth_mode(provider) -> CodexAuthMode`（`chatgpt-login` | `api-key`；内置 openai → chatgpt-login，其余 → api-key） |

## 认证模式推导规则

```rust
// 内置 openai（codex-builtin:openai）→ ChatGptLogin
// 其余（内置只读第三方 / 自定义）→ ApiKey
fn codex_auth_mode(provider: &CodexProvider) -> CodexAuthMode
```

- chatgpt-login：apply 只写 `model_provider = "openai"`，**不写 provider 段**；profile 免 key（`upsert_codex_profile` 对内置 openai 放开 key 必填校验）。
- api-key：apply 写 `model_provider = slug` + `[model_providers.slug]`（内联 key 或 env_key）+ `wire_api`。

## 前端 / i18n 变更

- `CodexProfilesPage.tsx`：
  - env_key 表单（:775-783）改为可选，默认内联 key，文案提示「留空则内联 key 到 config.toml」。
  - 内置 openai profile 编辑器（:883-897）隐藏/弱化 apiKey 输入，提示「使用 ChatGPT 登录，无需 API key」。
  - 预览确认 Dialog（:946-1004）：`api_key_will_set` 文案改为「将内联 API key 到 config.toml」；chatgpt-login 显示「将使用 ChatGPT 登录，auth.json 不受影响」。
- `i18n.ts`：`codex.field.envKeyHint` / `apiKeyHint` / `applyPreviewAuthSet` / `applyPreviewDescription`（zh :1741-1795，en :3608-3662）全部改写，去掉「写入 auth.json」表述。
- 契约：`make bindings` 重新生成 `bindings.ts`；`types.ts`（:178-244）、`ipc.ts`（:97-100）同步。capability 无需动。

## 测试计划

- `config.rs` 单测（14 个，:4847-5543）改写：
  - `env_key` 落盘断言（:4991-4993）→ `experimental_bearer_token`。
  - `auth.json["OPENAI_API_KEY"]` 断言（:5024, :5110, :5159）→ 移除；新增「auth.json 不被触碰」断言。
  - `render_codex_auth_preserves_oauth_keys`（:5224）→ 整段作废，替换为「chatgpt-login apply 不写 auth.json」。
  - 新增：内置 openai apply 只写 `model_provider=openai`、不建 provider 段；`codex_auth_mode` 推导；models.json 生成。
- `CodexProfilesPage.test.tsx`：mock 数据（envKey 可选、内置 openai 免 key、preview 新文案）同步。
- 可选补一个集成测试（`src-tauri/tests/`）验证 codex apply e2e（config.toml + 不碰 auth.json）。

## 迁移与兼容

- registry：`env_key` 必填→可选是向后兼容的（serde `Option`），存量 provider 保留原值，**不升 registry 版本**。
- 存量已 apply 的 v1 用户：config.toml 里旧 `env_key` 段保留（外科补丁不删）；auth.json 里 v1 残留的 `OPENAI_API_KEY` 不再被写，但**可能令 Codex 优先 API 计费而非 ChatGPT 登录**——apply 内置 openai 时检测 auth.json 同时存在 `OPENAI_API_KEY` 与登录 `tokens`，**只提示、不写入**（遵守「不拥有 auth.json」）。

## 明确不做

- 不写 `preferred_auth_method` / `forced_login_method`（全局副作用）。
- 不托管 ChatGPT OAuth（refresh_token 持久化/自动刷新）。
- 不做 apply 前快照备份。
- 不处理用户 shell 中 `OPENAI_API_KEY` 环境变量对 OAuth 的劫持（Code Manager 无法控制，仅文档提示）。
- 不托管 `config.toml` 的 `model` / `approval_policy` / `[mcp_servers.*]` 等行为键。

## 验证

- 后端：`make fmt-rust-check`、`make check`、`make lint-rust`、`make test-rust`。
- 契约：`make bindings`、`make bindings-check`、`make build-frontend`。
- 前端：`make lint-frontend`、`make test-frontend`（单文件可用 `pnpm exec vitest run src/components/__tests__/CodexProfilesPage.test.tsx`）。
- 手工：apply DeepSeek 自定义 profile 后核对 config.toml（内联 token、无 auth.json 写入）；apply 内置 openai 后核对只写 `model_provider="openai"` 且 auth.json 不变。
