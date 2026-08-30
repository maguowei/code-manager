# opencode-go 认证字段切换：前端按供应商 slug 硬编码，不建模进 provider 数据层

## Context

opencode-go 是 Anthropic 兼容网关（端点 `https://opencode.ai/zen/go`），用 `x-api-key` 认证，对应 Claude Code 的 `ANTHROPIC_API_KEY`；而默认认证区展示的是 `ANTHROPIC_AUTH_TOKEN`（Bearer）。

两条前置约束：
- Provider 数据层（`builtin-providers.json`）只承载供应商**客观信息**——连接地址 `env.ANTHROPIC_BASE_URL`、模型映射与元数据，**不含认证密钥、不含认证方式**；认证密钥属于 Profile 的 `settings.env`。
- Claude Code 的认证语义是 `ANTHROPIC_AUTH_TOKEN`（Bearer）**优先**、`ANTHROPIC_API_KEY`（x-api-key）回退；后端 `resolve_model_test_request` 已按此实现，前端认证字段默认也只对应 `ANTHROPIC_AUTH_TOKEN`。

因此 opencode-go 这类"需要 x-api-key 认证"的供应商，其认证字段与默认 UI 冲突：若仍显示 `ANTHROPIC_AUTH_TOKEN`，用户填进去的 key 会被按 Bearer 发送，认证失败。

## Decision

1. **前端按 slug 硬编码切换**：`ProfileEditor.tsx` 用 `providerSlugFromId(providerId) === "opencode-go"` 判定，命中时认证区字段由 `ANTHROPIC_AUTH_TOKEN` 切换为 `ANTHROPIC_API_KEY`（label / placeholder / value / onChange 全部联动），并把 `ANTHROPIC_API_KEY` 追加进 `hiddenEnvKeys` 从通用环境变量分区隐藏。
2. **切换时清理互斥残留**：`applyProviderAutofill` 切到可解析的 opencode-go 时，在清空地址之外再置空 `ANTHROPIC_AUTH_TOKEN`——否则残留的 Bearer token 会被"Bearer 优先"语义遮蔽用户新填的 API Key，且两者都被隐藏、用户无从察觉。
3. **坚持"Bearer 优先、API_KEY 回退"不变式**：后端 `resolve_model_test_request` 保持通用回退，不感知具体供应商；前端只做展示层切换，不复制该认证选择逻辑。
4. **不把认证方式建模进 provider 数据层**：暂不引入 `authScheme` / `credentialEnvKey` 之类的 provider 字段。理由：当前仅 opencode-go 一个特例，数据层建模的收益尚未覆盖其同步成本（前端 schema、后端解析、契约、测试）。

## Consequences

- **硬编码特例会随供应商增加而扩散**：`=== "opencode-go"` 散落在 `ProfileEditor.tsx`、`config-workspace-utils.ts` 与测试。出现第二个 x-api-key（或其它非 Bearer）供应商时，应重新评估把认证方式建模进 provider 数据层，并回看本 ADR。
- **清理是单向的**：只清"切向 opencode-go"方向的 `ANTHROPIC_AUTH_TOKEN`；切走时保留 `ANTHROPIC_API_KEY`——x-api-key 是 Anthropic 兼容通用认证，切走后 Bearer 优先时它不遮蔽任何东西，属无害保留。
- **后端不感知供应商**：认证回退语义与真实 Claude Code 保持一致，新增供应商无需改后端认证逻辑；后端"Bearer 优先"不变式成为前端切换与残留清理的共同依据。
