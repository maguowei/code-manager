# 深度链接首期只做配置导入（双来源、预览入库、不自动应用）

## Context

需要用系统自定义 URL 把「分享来的 Claude settings」快速送进 Code Manager。可选来源包括把 JSON 塞进 URL、让应用去拉远端文件、或只打开本地路径。导入后是否自动写入 `~/.claude/settings.json`、密钥是否允许出现在链接里、远端是否限制主机白名单，会直接决定安全面、分享体验和以后能否扩展其它 deep link 动作。

## Decision

1. **Scheme 与动作命名空间**：注册 `code-manager://`；首期只实现 `profiles/import`。后续动作挂在同 scheme 下不同 path，不另起 scheme。
2. **双来源、互斥 query**：
   - **内嵌载荷**：`payload` = base64url(UTF-8 裸 settings JSON)，解码后硬上限 **16KB**。
   - **远端 URL**：`url` = HTTPS 地址；应用拉取后再导入。仅 HTTPS；**不设主机白名单**；必须做 SSRF 防护（禁 loopback/私网/链路本地/云元数据等）；响应体 **≤256KB**；最多 **3** 次 HTTPS 跳转且每跳再检 SSRF；超时约 **10s**。
   - `payload` 与 `url` 都缺或都有 → 拒绝。可选 query `name` / `description` 仅预填导入对话框，不参与签名或信任。
3. **载荷契约对齐文件导入**：内容是**裸 Claude settings JSON**（不是带 `providerId` 的私有 envelope）。校验与入库语义对齐现有 `preview_profile_import` / `import_profile_from_file`：预览确认后**新建配置**，`providerId` 为空，**不自动应用/绑定**。
4. **密钥策略**：不强制剥离密钥。预览若检测到认证密钥，必须**风险横幅 + 勾选确认**后才能导入。导出侧新增「复制 Deep Link」，默认**不含密钥**；用户显式包含密钥时，复制前使用**同一档确认**。
5. **生命周期与 UI**：单实例；冷启动与热启动都处理链接；多条链接**排队**（取消或失败后自动处理下一条，取消不清空整队）。成功解析后聚焦 **main** 窗口、切到配置页、打开与文件导入同一套预览 UI。三端（macOS / Windows / Linux）均注册 scheme。
6. **首期明确不做**：自动 apply、应用代托管 JSON、主机白名单、payload 压缩、分享 envelope、多实例、仅热启动处理。

## Consequences

- 分享链路由应用生成时优先走内嵌 `payload`；超 16KB 必须改由用户自行托管后用 `url=`，应用不提供托管。
- 任意公网 HTTPS 可成为导入源，攻击面靠 SSRF 限制、体大小/跳转/超时、以及「必须预览确认才入库」收敛；不做白名单是为了 gist/raw/对象存储等常见分享不失效。
- 密钥可以出现在 URL 与聊天记录中——这是显式产品选择；靠默认导出脱敏 + 含密钥时强制勾选降低误操作，**不能**当作密钥保险库。
- URL 与导入语义一旦对外分享即难改；扩展新动作应新增 path，避免重载 `profiles/import` 的 query 含义。
