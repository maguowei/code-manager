# AI Manager - 产品需求文档 (PRD)

## 1. Feature Name

**AI Manager** — Claude Code 桌面配置管理工具

## 2. Epic

- 父项目：AI Manager Desktop App
- 仓库：`maguowei/ai-manager`
- 技术架构：Tauri 2.0 (Rust) + React 19 + TypeScript + Vite
- 应用标识符：`com.gotobeta.app.ai-manager`
- 当前版本：v0.13.0

## 3. Goal

### Problem

Claude Code 用户在日常使用中面临多维度的配置管理困境：

1. **配置切换繁琐**：不同项目、不同场景需要不同的 API Key、模型、插件组合，手动编辑 `~/.claude/settings.json` 效率低且易出错。
2. **记忆管理分散**：`~/.claude/CLAUDE.md` 是单文件结构，用户无法按主题模块化管理记忆片段，也无法按需组合启用。
3. **Skills 管理不直观**：Skills 以文件系统目录形式存在，创建、编辑、启用/禁用需要手动操作文件，缺乏可视化管理界面。
4. **Provider 生态复杂**：Claude Code 支持多种第三方 API Provider（智谱、Kimi、MiniMax、火山方舟、阿里云百炼等），用户需要逐一查找文档配置，缺乏统一管理入口。
5. **使用数据不可见**：Token 消耗、费用、会话历史等数据散落在不同文件中，缺乏统一的可视化展示。
6. **项目状态分散**：多项目并行开发时，缺乏统一视图了解各项目的 Git 状态、分支、worktree 等信息。

### Solution

AI Manager 提供一个原生桌面应用，作为 Claude Code 的统一配置管理中心：

- **一键切换**：预定义多套配置方案，通过系统托盘或主界面一键切换，自动写入 `settings.json`
- **模块化记忆**：将 CLAUDE.md 拆分为独立记忆片段，支持多选组合启用，自动合并写入
- **可视化 Skills**：图形界面管理 Skills 的全生命周期（创建、编辑、启用/禁用、支持文件管理）
- **Provider 市场**：内置 11 个主流 Provider 预配置，用户也可自定义添加
- **数据仪表盘**：统计页面展示 Token 消耗趋势、费用分析；历史页面提供热力图和会话回放
- **项目总览**：集中展示所有 Claude Code 项目的详情、Git 分支、worktree，支持一键打开

### Impact

- **效率提升**：配置切换从手动编辑 JSON（~2 分钟）降低到一键操作（<1 秒）
- **错误减少**：Schema 驱动的表单验证消除手动编辑导致的配置错误
- **可见性增强**：用户可实时掌握 Token 消耗、费用趋势、会话活跃度
- **生态拓展**：降低第三方 Provider 的接入门槛，促进 Claude Code 生态多样性

## 4. User Personas

### Persona 1：专业开发者（Primary）

- **角色**：日常使用 Claude Code 进行软件开发的工程师
- **特征**：同时维护多个项目，需要为不同项目配置不同的模型和插件组合
- **痛点**：频繁切换配置耗时，记忆管理混乱，难以追踪 Token 消耗
- **目标**：用最少的操作完成配置切换，清晰了解使用情况

### Persona 2：团队技术负责人

- **角色**：管理团队 Claude Code 使用规范的技术 Lead
- **特征**：需要为团队成员制定统一的配置模板和记忆规范
- **痛点**：无法快速复制配置给团队成员，难以监控整体使用量
- **目标**：标准化团队配置，追踪使用成本

### Persona 3：Claude Code 新用户

- **角色**：刚开始使用 Claude Code 的开发者
- **特征**：对配置文件结构不熟悉，不清楚可用的 Provider 和参数
- **痛点**：配置学习曲线陡峭，不知道最佳实践
- **目标**：通过图形界面快速上手，利用内置 Provider 简化初始配置

## 5. User Stories

### 配置管理

| ID | User Story | 优先级 |
|----|-----------|--------|
| US-C01 | 作为开发者，我想创建多套 Claude Code 配置方案，以便在不同项目/场景间快速切换 | P0 |
| US-C02 | 作为开发者，我想通过系统托盘一键切换配置，以便无需打开主窗口即可操作 | P0 |
| US-C03 | 作为开发者，我想定义通用配置（Defaults），以便多个配置共享基础设置并按需覆盖 | P1 |
| US-C04 | 作为开发者，我想实时预览配置合并后的最终 JSON，以便确认写入 settings.json 的内容 | P1 |
| US-C05 | 作为开发者，我想拖拽排序配置列表，以便按使用频率排列 | P2 |
| US-C06 | 作为开发者，我想复制现有配置作为新配置的起点，以便减少重复输入 | P2 |

### 记忆管理

| ID | User Story | 优先级 |
|----|-----------|--------|
| US-M01 | 作为开发者，我想将 CLAUDE.md 拆分为独立的记忆片段，以便按主题模块化管理 | P0 |
| US-M02 | 作为开发者，我想同时启用多个记忆片段，以便系统自动合并写入 CLAUDE.md | P0 |
| US-M03 | 作为开发者，我想用 Markdown 编辑器编写记忆内容，以便获得良好的编辑体验 | P1 |

### Skills 管理

| ID | User Story | 优先级 |
|----|-----------|--------|
| US-S01 | 作为开发者，我想在图形界面中创建和编辑 Skills，以便无需手动管理文件系统 | P0 |
| US-S02 | 作为开发者，我想通过开关切换 Skill 的启用/禁用状态，以便快速调整可用的 Skills 集合 | P0 |
| US-S03 | 作为开发者，我想为 Skill 添加支持文件（示例、脚本等），以便丰富 Skill 的功能 | P1 |
| US-S04 | 作为开发者，我想将 Skill 同步到 Codex，以便在 Codex CLI 中也能使用 | P2 |

### Provider 管理

| ID | User Story | 优先级 |
|----|-----------|--------|
| US-P01 | 作为开发者，我想从内置 Provider 列表中选择，以便快速配置第三方 API 接入 | P0 |
| US-P02 | 作为开发者，我想自定义添加 Provider，以便接入内置列表之外的服务 | P1 |
| US-P03 | 作为开发者，我想为 Provider 配置多个模型及其分类，以便在配置中按类型选择模型 | P1 |

### 项目管理

| ID | User Story | 优先级 |
|----|-----------|--------|
| US-PJ01 | 作为开发者，我想查看所有 Claude Code 项目的总览，以便了解各项目的状态 | P0 |
| US-PJ02 | 作为开发者，我想查看项目的 Git 分支和 worktree 详情，以便掌握代码分支状况 | P1 |
| US-PJ03 | 作为开发者，我想一键用终端或编辑器打开项目目录，以便快速进入开发环境 | P1 |
| US-PJ04 | 作为开发者，我想管理项目的 AGENTS.md 符号链接，以便统一 Agent 配置 | P2 |

### 历史记录

| ID | User Story | 优先级 |
|----|-----------|--------|
| US-H01 | 作为开发者，我想通过热力图查看 Claude Code 的使用活跃度，以便了解使用模式 | P1 |
| US-H02 | 作为开发者，我想按项目浏览会话历史，以便回顾特定项目的对话记录 | P1 |
| US-H03 | 作为开发者，我想查看会话的完整消息详情（含工具调用），以便回溯问题解决过程 | P2 |

### 使用统计

| ID | User Story | 优先级 |
|----|-----------|--------|
| US-ST01 | 作为开发者，我想查看 Token 消耗和费用统计，以便监控使用成本 | P1 |
| US-ST02 | 作为开发者，我想查看统计数据的历史趋势图表，以便分析使用模式变化 | P2 |

### 应用设置

| ID | User Story | 优先级 |
|----|-----------|--------|
| US-A01 | 作为开发者，我想切换应用语言（中文/英文），以便使用熟悉的语言 | P1 |
| US-A02 | 作为开发者，我想切换亮色/暗色主题，以便适应不同的使用环境 | P1 |
| US-A03 | 作为开发者，我想配置默认终端和编辑器，以便一键打开时使用偏好的工具 | P2 |

## 6. Requirements

### 6.1 Functional Requirements

#### 6.1.1 配置管理

- **FR-C01**: 支持创建、编辑、删除、复制配置方案
- **FR-C02**: 每个配置包含：名称、描述、API Key、Base URL、模型选择、插件开关、高级选项等字段
- **FR-C03**: 配置表单由 JSON Schema 驱动，支持字段级校验（Zod validation）
- **FR-C04**: 激活配置时，深度合并通用配置（Defaults）和当前配置，写入 `~/.claude/settings.json`
- **FR-C05**: 通用配置（Defaults）以 JSON 编辑器形式提供，支持语法高亮
- **FR-C06**: 实时预览合并后的配置 JSON（调用后端 `preview_config` 命令，与实际写入逻辑一致）
- **FR-C07**: 支持拖拽排序配置列表
- **FR-C08**: 配置关联 Provider，选择 Provider 后自动填充 Base URL 和可用模型列表
- **FR-C09**: 系统托盘菜单动态显示配置列表，支持一键切换

#### 6.1.2 记忆管理

- **FR-M01**: 支持创建、编辑、删除记忆片段
- **FR-M02**: 每个记忆包含：名称、Markdown 内容、启用状态
- **FR-M03**: 支持多个记忆同时启用（toggle 开关）
- **FR-M04**: 启用/禁用记忆时，自动合并所有活跃记忆内容写入 `~/.claude/CLAUDE.md`
- **FR-M05**: 提供 Markdown 编辑器（CodeMirror）编辑记忆内容

#### 6.1.3 Skills 管理

- **FR-S01**: 扫描 `~/.claude/skills/`（启用）和 `~/.config/ai-manager/skills-disabled/`（禁用）目录，展示 Skill 列表
- **FR-S02**: 支持创建新 Skill，生成 SKILL.md（含 YAML frontmatter：name、description、disable-model-invocation、user-invocable）
- **FR-S03**: 支持编辑 Skill 的 frontmatter 字段和 Markdown 内容
- **FR-S04**: 启用/禁用 Skill 通过在两个目录间移动实现
- **FR-S05**: 支持为 Skill 添加、编辑、删除支持文件（文本文件）
- **FR-S06**: Skill ID 仅允许小写字母、数字、连字符
- **FR-S07**: 遍历 Skill 目录时跳过符号链接，防止路径逃逸
- **FR-S08**: 支持将 Skill 同步到 `~/.codex/skills/`（Codex CLI 兼容）

#### 6.1.4 Provider 管理

- **FR-P01**: 内置 Provider 通过编译时嵌入的 JSON 文件提供（`builtin-providers.json`），不可删除
- **FR-P02**: 支持自定义 Provider 的 CRUD 操作
- **FR-P03**: 每个 Provider 包含：名称、slug、Base URL、文档链接、模型列表
- **FR-P04**: 模型分类支持：opus、sonnet、haiku、other
- **FR-P05**: Provider slug 仅允许小写字母、数字、连字符
- **FR-P06**: 支持拖拽排序 Provider 列表，支持重置为默认排序
- **FR-P07**: 内置 Provider 支持重置为默认值

#### 6.1.5 项目管理

- **FR-PJ01**: 从 `~/.claude.json` 统计数据中读取项目列表，展示费用和时长
- **FR-PJ02**: 查看项目详情：目录存在性、Git 仓库状态、仓库 URL、CLAUDE.md 存在性
- **FR-PJ03**: 展示项目的 Git 分支列表（含最后提交时间和摘要）
- **FR-PJ04**: 展示项目的 Git worktree 列表（含路径、分支、HEAD、当前/detached 状态）
- **FR-PJ05**: 一键用终端打开项目（支持 Terminal.app、iTerm2、Warp、Ghostty）
- **FR-PJ06**: 一键用编辑器打开项目（支持 VSCode、Cursor、Windsurf、Zed）
- **FR-PJ07**: 管理 AGENTS.md 符号链接（创建、修复、检测状态：Missing/CorrectSymlink/WrongSymlink/PlainFileConflict）
- **FR-PJ08**: 支持一键打开仓库 URL

#### 6.1.6 历史记录

- **FR-H01**: 读取 `~/.claude/history.jsonl`，解析会话历史条目
- **FR-H02**: 热力图日历展示每日活跃度
- **FR-H03**: 按项目分组展示会话列表
- **FR-H04**: 支持全文搜索过滤历史条目
- **FR-H05**: 会话详情展示完整消息（含 text、thinking、tool_use、tool_result、command、system、image、plan 类型）
- **FR-H06**: 轮询机制（`get_history_if_changed`）：仅当文件 mtime 变化时重新加载

#### 6.1.7 使用统计

- **FR-ST01**: 从 `~/.claude.json` 读取统计数据：Token 消耗（input/output/cache）、费用、Web 搜索次数
- **FR-ST02**: 每小时自动采样统计快照，保存到 `stats_history.json`（去重、90 天保留、最多 500 条）
- **FR-ST03**: 支持手动触发快照采集
- **FR-ST04**: 图表展示统计趋势（基于 recharts）

#### 6.1.8 应用设置与系统集成

- **FR-A01**: 语言切换：中文（zh）/ 英文（en），持久化到 localStorage
- **FR-A02**: 主题切换：亮色 / 暗色 / 跟随系统，通过 CSS data-theme 属性实现
- **FR-A03**: 系统托盘：显示配置列表、页面导航入口；macOS 隐藏窗口时切换 Accessory 模式
- **FR-A04**: 默认终端和编辑器应用配置，持久化到 app-state.json
- **FR-A05**: 托盘标题显示开关（是否在托盘图标旁显示当前配置名）

### 6.2 Non-Functional Requirements

#### 性能

- **NFR-01**: 应用启动到可交互时间 < 2 秒
- **NFR-02**: 配置切换（写入 settings.json）响应时间 < 200ms
- **NFR-03**: 历史记录轮询采用 mtime 变更检测，避免无效文件读取
- **NFR-04**: 统计快照去重机制，避免存储冗余数据

#### 安全

- **NFR-05**: API Key 等敏感字段使用 password 类型输入框
- **NFR-06**: 新建文件在 Unix 系统上自动设置 0o600 权限（仅所有者可读写）
- **NFR-07**: Skill 目录遍历时跳过符号链接，防止路径逃逸攻击
- **NFR-08**: Skill ID、Provider slug 严格校验，仅允许安全字符

#### 可靠性

- **NFR-09**: 所有写操作通过 Rust Mutex 保护，防止并发写入冲突
- **NFR-10**: 文件操作失败时返回明确错误信息，前端通过 Toast 展示
- **NFR-11**: 配置预览与实际写入使用同一个 `build_config_value()` 函数，保证一致性

#### 可维护性

- **NFR-12**: 前后端 Schema 一致性通过 `cargo test` 自动验证（Rust schemars 生成的 JSON Schema 与前端 `claude-config.schema.json` 对比）
- **NFR-13**: 配置表单由 Schema 驱动，新增字段只需同步修改 Rust 结构体 + JSON Schema + Zod Schema
- **NFR-14**: z-index 通过 CSS 变量统一管理，不硬编码数值

#### 跨平台

- **NFR-15**: 支持 macOS（Universal Binary：aarch64 + x86_64）、Windows（MSI/EXE）、Linux（DEB/RPM/AppImage）
- **NFR-16**: CI 矩阵覆盖三大平台（macOS、Ubuntu、Windows）

#### 国际化

- **NFR-17**: UI 文案完整支持中文和英文两种语言
- **NFR-18**: 系统托盘菜单支持中英文国际化

## 7. Acceptance Criteria

### AC-C: 配置管理

- [ ] **AC-C01**: 用户可在表单中填写名称和 API Key 创建新配置，保存后出现在配置列表中
- [ ] **AC-C02**: 点击配置列表项的「激活」按钮后，`~/.claude/settings.json` 内容更新为该配置的合并结果
- [ ] **AC-C03**: 配置编辑时，右侧预览面板实时展示合并后的 JSON，与实际写入内容一致
- [ ] **AC-C04**: 选择 Provider 后，Base URL 自动填充，模型下拉框显示该 Provider 的可用模型
- [ ] **AC-C05**: 启用「使用通用配置」后，通用配置中的字段作为 base 被当前配置覆盖
- [ ] **AC-C06**: 系统托盘菜单显示所有配置，点击即可切换，前端收到 `config-changed` 事件后刷新状态
- [ ] **AC-C07**: 删除配置前弹出确认对话框，确认后配置从列表和磁盘移除

### AC-M: 记忆管理

- [ ] **AC-M01**: 创建记忆并启用后，`~/.claude/CLAUDE.md` 包含该记忆的内容
- [ ] **AC-M02**: 同时启用多个记忆后，`~/.claude/CLAUDE.md` 包含所有活跃记忆的合并内容
- [ ] **AC-M03**: 禁用某个记忆后，`~/.claude/CLAUDE.md` 不再包含其内容

### AC-S: Skills 管理

- [ ] **AC-S01**: 创建 Skill 后，`~/.claude/skills/<id>/SKILL.md` 文件存在，frontmatter 字段正确
- [ ] **AC-S02**: 禁用 Skill 后，文件从 `~/.claude/skills/` 移至 `~/.config/ai-manager/skills-disabled/`
- [ ] **AC-S03**: 重新启用 Skill 后，文件移回 `~/.claude/skills/`
- [ ] **AC-S04**: 添加支持文件后，文件出现在 Skill 目录的对应路径下

### AC-P: Provider 管理

- [ ] **AC-P01**: 应用启动后，内置 Provider 列表完整显示（11 个），标记为内置
- [ ] **AC-P02**: 自定义 Provider 可创建、编辑、删除；内置 Provider 不可删除
- [ ] **AC-P03**: 在配置编辑中选择 Provider 后，模型列表正确按分类（opus/sonnet/haiku/other）展示

### AC-PJ: 项目管理

- [ ] **AC-PJ01**: 项目列表展示所有 Claude Code 项目，包含费用和使用时长
- [ ] **AC-PJ02**: 点击项目后，详情面板展示 Git 分支列表和 worktree 列表
- [ ] **AC-PJ03**: 点击「在终端打开」后，配置的默认终端应用打开并 cd 到项目目录
- [ ] **AC-PJ04**: AGENTS.md 状态正确检测（Missing/CorrectSymlink/WrongSymlink/PlainFileConflict）

### AC-H: 历史记录

- [ ] **AC-H01**: 热力图正确渲染过去一年的日活跃度
- [ ] **AC-H02**: 点击项目后显示该项目的会话列表
- [ ] **AC-H03**: 点击会话后，详情抽屉展示完整消息（含文本、思考、工具调用等类型）

### AC-ST: 使用统计

- [ ] **AC-ST01**: 统计页面展示当前 Token 消耗汇总（input/output/cache tokens、费用）
- [ ] **AC-ST02**: 图表展示历史趋势数据

### AC-A: 应用设置

- [ ] **AC-A01**: 切换语言后，所有 UI 文案（含系统托盘菜单）立即更新为目标语言
- [ ] **AC-A02**: 切换主题后，界面配色立即变化
- [ ] **AC-A03**: 应用退出后重新打开，语言和主题设置保持不变

## 8. Out of Scope

以下功能不在当前版本范围内：

- **云端同步**：配置和记忆的跨设备同步（当前仅本地存储）
- **团队协作**：多用户共享配置、记忆模板的导入导出
- **自动更新**：应用内自动检查和安装更新
- **移动端**：iOS / Android 客户端
- **Provider API 代理**：应用不代理 API 请求，仅管理配置
- **会话重放**：历史记录仅展示消息，不支持重新发送或续接会话
- **费用预警**：不提供 Token 消耗阈值告警功能
- **插件市场**：不提供 Skills 或插件的在线分享/下载市场
- **配置加密**：API Key 以明文存储在 JSON 文件中，不提供额外加密层

---

## 附录

### A. 技术栈

| 层级 | 技术 | 版本 |
|------|------|------|
| 桌面框架 | Tauri | 2.x |
| 后端语言 | Rust | 2021 edition |
| 前端框架 | React | 19.1.0 |
| 类型系统 | TypeScript | ~5.8.3 |
| 构建工具 | Vite | 7.3.2 |
| 表单管理 | react-hook-form + Zod | 7.72.1 / 4.3.6 |
| 代码编辑器 | CodeMirror | 4.25.5 |
| 数据可视化 | recharts | 3.7.0 |
| Markdown 渲染 | react-markdown + remark-gfm | 10.1.0 |
| 代码质量 | Biome | 2.4.11 |
| 包管理器 | pnpm | 10.33.0 |

### B. 内置 Provider 列表（v0.13.0）

| 序号 | Provider | Base URL | 模型数量 |
|------|----------|----------|---------|
| 1 | Anthropic（官方） | 默认 | 3 |
| 2 | 智谱 GLM Coding Plan | open.bigmodel.cn | 1 |
| 3 | Kimi Code Plan | api.kimi.com | 1 |
| 4 | MiniMax Token Plan | api.minimaxi.com | 1 |
| 5 | Xiaomi MiMo Token Plan | token-plan-cn.xiaomimimo.com | 1 |
| 6 | OpenRouter | openrouter.ai | 1 |
| 7 | 火山方舟 Coding Plan | ark.cn-beijing.volces.com | 3 |
| 8 | 阿里云百炼 Coding Plan | coding.dashscope.aliyuncs.com | 4 |
| 9 | ModelScope | api-inference.modelscope.cn | 1 |
| 10 | 万界方舟 | maas-openapi.wanjiedata.com | 3 |
| 11 | Ollama（本地） | localhost:11434 | 3 |

### C. 数据文件清单

| 文件路径 | 用途 | 格式 |
|----------|------|------|
| `~/.config/ai-manager/app-state.json` | 应用状态（配置列表、偏好设置） | JSON |
| `~/.config/ai-manager/memories.json` | 记忆列表 | JSON |
| `~/.config/ai-manager/providers.json` | 自定义 Provider 列表 | JSON |
| `~/.config/ai-manager/stats_history.json` | 统计快照历史 | JSON |
| `~/.config/ai-manager/skills-disabled/` | 已禁用的 Skills | 目录 |
| `~/.claude/settings.json` | 当前激活的 Claude Code 配置 | JSON |
| `~/.claude/CLAUDE.md` | 当前启用的记忆内容 | Markdown |
| `~/.claude/skills/` | 已启用的 Skills | 目录 |
| `~/.claude/history.jsonl` | 会话历史 | JSONL |
| `~/.claude.json` | Claude Code 使用统计 | JSON |

### D. 分发格式

| 平台 | 格式 |
|------|------|
| macOS | .dmg（Universal Binary：aarch64 + x86_64） |
| Windows | .msi, .exe |
| Linux | .deb, .rpm, .AppImage |
