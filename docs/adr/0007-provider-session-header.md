# 网关会话标识头建模进 provider 数据层，模型测试按会话生成值

## Context

OpenCode Go 网关（`https://opencode.ai/zen/go`）要求客户端对每个会话声明稳定的会话 ID 头 `x-opencode-session`，用于网关路由与 prompt caching；缺失时按 HTTP 400 拒绝。官方文档同时说明：Claude Code / Codex / ZCode 的原生会话头会被识别，因此**真实 Claude Code 会话不受影响**，受影响的只有 Code Manager 自己发出的请求——也就是模型测试（`config.rs::execute_model_test_request`，全仓唯一向供应商端点发请求的路径）。

同时 ADR 0005 刚刚决定不把供应商相关差异建模进 provider 数据层（把 opencode-go 的认证字段切换硬编码在前端 slug 判断里），理由是"当前仅一个特例，数据层建模收益未覆盖同步成本"。本次需要判断：会话标识头是继续按 slug 硬编码，还是进 provider 数据层。

关键区别在于，ADR 0005 处理的是**认证**：认证密钥按设计就不属于 provider 层，且"Bearer 优先"是 Claude Code 的通用语义，后端必须保持供应商无关。会话标识头不同：它是**网关对请求路由的公开要求**，不带认证语义、不影响 Claude Code 行为，且天然属于"连接相关客观信息"。

## Decision

1. **在 `builtin-providers.json` 声明 `sessionHeader`**（头名，如 `x-opencode-session`），与 `baseUrl`/`docUrl` 同级；解析时 trim + 转小写，空值视为未声明。当前只有 `builtin:opencode-go` 声明。
2. **值由请求方按会话生成**：模型测试一次请求即一次单轮会话，因此逐请求生成 UUID v4，而不是写死静态值。
3. **不写进 provider `env`**：不用 `ANTHROPIC_CUSTOM_HEADERS` 交给 Claude Code——Claude Code 有自己的原生会话头，静态值跨会话复用反而损害 prompt cache 亲和，且会污染用户真实配置。
4. **下发与展示共用一份 headers**：模型测试的请求头面板、复制出的 cURL 与实际发出的 `HeaderMap` 同源，避免"显示的请求"和"发出去的请求"再次分叉。
5. **顺带修掉隐患**：改用 `HeaderMap` 组装（`build_reqwest_headers`），遇到非法头名/头值返回可读失败结果，而不是让 `RequestBuilder::header` 直接 panic（认证 token 来自用户输入）。
6. **补客户端自标识 UA**：`user-agent: code-manager/<版本>`（reqwest 默认不发 UA），对应该网关文档"客户端应用自有 UA 标识自己，而不是通用 SDK / HTTP 库名"的要求。

## Consequences

- **provider 字段增加一个同步点**：`builtin-providers.json` → `BuiltinProviderSeed` / `Provider` → specta bindings → `src/types.ts`，另有 ProvidersPage 只读展示。新增同类供应商时只需在 JSON 里加一行。
- **只覆盖通过 `providerId` 选中的配置**：手工把 `ANTHROPIC_BASE_URL` 填成网关地址、`providerId` 为空的配置仍会被拒绝（网关错误信息本身可读）。有意不加 host 兜底——按 URL 猜供应商会在 Rust 里扩散供应商特例。
- **模型测试的成功不再等价于 Claude Code 会成功**：两边请求头本就不同（模型测试只是复刻认证 + 一个单轮消息），本 ADR 不改变这个边界；新增供应商要求时，仍要回到网关文档核对。
