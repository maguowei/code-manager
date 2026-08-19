# Codex 配置切换采用平行独立模型 + 外科补丁所有权

Status: accepted

## Context

Code Manager 的 Claude 配置系统全量拥有 `~/.claude/settings.json`，而 Codex CLI 使用 `~/.codex/config.toml`、独立的 `auth.json` 与可选模型目录。`config.toml` 同时包含用户手工维护的 sandbox、MCP、notify 等设置，不能由单份 Profile 全量替换；`auth.json` 又由 `codex login` 维护，不能纳入 Code Manager 的写入所有权。

## Decision

1. **平行独立模型**：Codex 使用独立的 `CodexProvider` / `CodexProfile` / `CodexApply` / `CodexBinding` 类型，但复用 `config-registry.json` 的独立 `codex` 段。两套配置系统共享心智骨架，不共享类型和定义。
2. **Provider 全部内置只读**：Codex Provider 只承载客观连接信息、默认模型/推理档位和可选模型目录；不建立自定义 Provider registry，也不提供 CRUD。私有中转、自建网关和未知配置项由 Profile 的高级 TOML / models JSON 片段表达。
3. **两种 Profile 表达**：
   - 结构化 Profile 拥有 Provider、认证、`model` 与 `model_reasoning_effort`。字段留空时使用 Provider 默认值；Provider 也无默认值时删除旧的受管键，不能沿用磁盘上的上一个 Profile。
   - 高级 Profile 是显式配置覆盖层。片段中出现的任意键均允许覆盖，未出现的键保持原样。
4. **外科补丁 Apply**：结构化模式只改写其拥有的顶层键和目标 `[model_providers.*]`；高级模式只改写片段显式声明的键。未拥有的键、注释、顺序和历史 Provider 段原样保留。
5. **绑定自动重应用**：编辑当前 binding 指向的 Profile 时，保存前重新 Apply；Apply 失败则不提交 registry 变更。
6. **原生启动 Profile**：任意 Profile 可按需生成 `~/.codex/code-manager-<uuid>.config.toml` 与可选的同 ID `.models.json`，启动命令固定为 `codex --profile code-manager-<uuid>`。生成文件只包含覆盖层，不复制基础 `config.toml`；编辑或删除 Profile 会清理旧启动产物。
7. **独立顶层页**：Codex UI 与 Claude 配置页分开，避免两套不同所有权语义混淆。

## Consequences

- Codex Apply 管理的键比 Claude 全量 Apply 少，但结构化 Profile 对 `model` 和 `model_reasoning_effort` 具有明确所有权。
- 高级片段是有意开放的逃生舱；其任意键覆盖能力不是自定义 Provider CRUD 的替代 registry，而是直接的配置覆盖层。
- `config.toml` 与可选 models JSON 必须成对原子写入；原生启动文件权限固定为 `0600`。
- registry 版本保持不变；本功能在发布前直接收敛契约，不增加迁移。
- Codex Provider 与 Claude Provider 现在都遵守“内置只读、不含密钥”的全局不变量。
