# 一键复制 Claude 多配置启动命令 —— 设计文档

- 日期：2026-06-22
- 范围：配置管理（ProfilesPage 配置卡片 + 配置系统后端）
- 状态：已确认，待进入实现计划

## 1. 背景与目标

当前 Code Manager 是"单配置"模式：`apply_profile` 把某个配置 resolve 后写入全局
`~/.claude/settings.json`，Claude Code 直接读取它。一次只能激活一个配置，无法在不同
终端并行运行不同 provider/model。

目标：在**不改动全局 `~/.claude/settings.json`** 的前提下，为某个配置一键生成
`claude --settings ...` 启动命令。用户在不同终端粘贴不同配置的命令，即可并行运行多套
provider/model，互不干扰。

`claude --settings <file-or-json>` 已支持文件路径与内联 JSON 两种入参，语义是"在现有
settings 之上叠加加载"。

## 2. 现状关键事实

- 配置卡片：`src/components/ProfilesPage.tsx`，操作按钮组在卡片 hover 时展开（同步常用选项 /
  复制环境变量 / 导出 / 复制 / 删除）。
- 复制环境变量：`handleCopyEnv`（约 887-906 行）调用 `ipc.previewProfile`（后端
  `resolve_profile_settings`）拿到合并后完整 settings，再用 `buildEnvExportText`（约
  633-663 行）只抽出 `env` 字段拼成 `export KEY="value"`，POSIX 约定。
- `resolve_profile_settings`（`src-tauri/src/config.rs` 约 1341-1375 行）产出完整 settings：
  `$schema` + `env` + `model` + `permissions` + `enabledPlugins` + `hooks` 等。
- 应用配置链路：`apply_profile` → `apply_profile_inner` → `apply_profile_to_registry`，
  写入 `~/.claude/settings.json` 并更新 `registry.bindings`。
- 删除配置：`delete_profile`（后端），需在此处追加 launch 文件清理。
- 配置类型：`src/types.ts` `ConfigProfile`；后端 `src-tauri/src/config.rs` `ConfigProfile`。

## 3. 交互设计

在配置卡片操作按钮组中**新增一个按钮**：

- 图标：`SquareTerminal`（lucide）。
- 位置：紧挨现有"复制环境变量"按钮。
- `aria-label`：`profiles.actions.copyLaunchCommand`。

点击弹出 shadcn **Dialog**，结构：

1. 顶部一句话说明多配置并行场景。
2. 两个命令区块，各带独立"复制"按钮和一句适用提示：
   - **文件路径式**（推荐，第一项）：`claude --settings "<绝对路径>"`，承载完整 resolve 后
     settings。提示：命令干净、不暴露密钥到 shell history、保留完整保真度。
   - **内联 JSON 式**：`claude --settings '{"env":{...}}'`，**仅 env 块**。提示：自包含、不落
     额外文件；密钥会进入 shell history。
3. 底部"如何使用"步骤：开新终端 → 粘贴 → 回车；每个终端独立、互不干扰。

复制走现有 `navigator.clipboard.writeText` + `useToast()`。Dialog / 浮层一律用 shadcn 组件，
不自实现。

## 4. 命令字符串生成（前端）

- 文件路径式：`claude --settings "<path>"`（双引号包裹路径）。
- 内联式：`claude --settings '<compact-env-json>'`（POSIX 单引号包裹）。
- 平台假设：仅面向 POSIX shell（bash/zsh），与现有 `buildEnvExportText` 的 `export` 约定一致；
  Windows 用户走 WSL / git-bash。不扩大到 PowerShell/cmd 变体。
- 拼接逻辑抽成可单测的纯函数 helper。

## 5. 数据与后端

新增 Rust command：

```
prepare_profile_launch(profile) -> ProfileLaunchPayload { settings_path, env_only_json }
```

- 复用 `resolve_profile_settings` 得到完整 settings（与 `previewProfile` 同源）。
- 把完整 settings **原子写入** `~/.config/code-manager/launch/<id>.settings.json`
  （复用 `utils.rs` 的目录创建 + 原子写、`get_app_data_dir`），返回绝对路径
  `settings_path`。
- 从完整 settings 抽出 `env` 块，生成紧凑单行 JSON 字符串 `env_only_json`（形如
  `{"env":{...}}`，不含 `$schema` / `model` / `permissions` / `hooks` / `enabledPlugins` /
  `sandbox`），供内联式使用。
- 走 Specta 注册（`lib.rs::build_specta_builder()` 的 `collect_commands![]`）+
  `make bindings` + `src/ipc.ts` 兼容包装。

文件生命周期：

- 惰性写入：Dialog 打开时调用一次，总是覆盖为最新 resolve 结果 → 对配置编辑健壮。
- 清理：在现有 `delete_profile` 删除配置时，一并删除对应 launch 文件，避免孤儿。

## 6. 需实测验证的关键点

`claude --settings <file>` 是"在全局 settings 之上叠加加载"。实现时需确认：

> 当 launch 文件 / 内联 JSON 里的 `env.ANTHROPIC_BASE_URL` / `ANTHROPIC_AUTH_TOKEN` 与全局
> `~/.claude/settings.json` 冲突时，`--settings` 的值能覆盖全局。

这是多配置并行成立的前提。若实测覆盖语义不成立，则在 Dialog 提示里说明该限制（**不**自动改
动全局绑定）。

## 7. i18n

新增 key（中英双份，走 `useI18n()` 的 `t()`，不硬编码）：

- `profiles.actions.copyLaunchCommand`
- `profiles.launchDialog.*`：标题、说明、两种形式标签与适用提示、"如何使用"步骤、复制成功
  / 失败 toast。

## 8. 测试

- 前端 vitest：覆盖命令字符串拼接 helper（文件路径式 + 内联式）与 env-only JSON 提取逻辑。
- Rust 单测：覆盖 `prepare_profile_launch` 写文件（路径与内容正确、env_only_json 正确），以及
  `delete_profile` 删除时清理 launch 文件。

## 9. 验收标准

1. 配置卡片出现"复制启动命令"按钮，点击弹出 Dialog，展示两种命令形式 + 区别说明 + 使用步骤。
2. 文件路径式命令复制后，对应 launch 文件已写入且内容为该配置完整 resolve settings。
3. 内联式命令复制后，JSON 仅含 env 块。
4. 在两个终端分别粘贴两个不同配置的命令运行，互不干扰，全局 `~/.claude/settings.json` 不被
   改动（实测覆盖语义见第 6 节）。
5. 删除配置后，对应 launch 文件被清理。
6. 范围内验证命令通过：`make bindings-check`、前端 vitest、`make test-rust`、`make lint-frontend`。

## 10. 非目标（YAGNI）

- 不做 Windows PowerShell/cmd 命令变体。
- 不做内置终端 / 直接拉起进程，只做"复制命令"。
- 不改动现有"复制环境变量"按钮与全局 apply 流程。
- 不为内联式提供字段可选项 UI，固定为 env-only。
