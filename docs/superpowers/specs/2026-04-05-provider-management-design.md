# Provider 管理功能设计

## 概述

为 AI Manager 增加 Provider（API 供应商）管理功能，支持国内外多家 Claude API 分销商的 Coding Plan / Token Plan。用户可在配置编辑器中选择 Provider，自动填充 API URL 和可用模型列表，简化多供应商切换流程。

## 背景

当前配置是扁平结构，所有供应商通过手动填写 `apiUrl` + `apiKey` 区分，没有 Provider 概念。随着国内多家平台推出 Claude Coding Plan（智谱、火山方舟、阿里云百炼、MiniMax、Kimi、Xiaomi MiMo），用户需要频繁切换不同供应商，手动填写 URL 容易出错且体验差。

## 需求

- Provider 作为独立实体管理，有完整的 CRUD
- 内置 7 个预设 Provider（含 Anthropic 直连），不可删除但可编辑
- 支持用户自定义添加新 Provider
- 每个 Provider 包含可用模型列表，按等级分类（opus/sonnet/haiku/other）
- 配置编辑器中选择 Provider 后自动填充 apiUrl，模型字段变为下拉选项
- 配置列表项展示关联的 Provider 名称

## 数据模型

### Provider

```typescript
interface ProviderModel {
  id: string;           // 模型 ID，写入 ANTHROPIC_MODEL 等环境变量
  name: string;         // 显示名称，如 "Claude Sonnet 4"
  category: "opus" | "sonnet" | "haiku" | "other";  // 模型等级
}

interface Provider {
  id: string;           // UUID，内置 Provider 使用固定 ID
  name: string;         // 显示名称，如 "智谱 GLM Coding Plan"
  slug: string;         // 短标识，如 "zhipu"、"volcengine"
  apiUrl: string;       // ANTHROPIC_BASE_URL 值，空字符串表示直连 Anthropic
  docUrl?: string;      // 官方文档链接
  isBuiltin: boolean;   // 是否为内置 Provider（不可删除）
  models: ProviderModel[];  // 该 Provider 可用的模型列表
  createdAt: number;    // 创建时间戳
  updatedAt: number;    // 更新时间戳
}
```

### ClaudeConfig 变更

新增字段：

```typescript
interface ClaudeConfig {
  // ... 现有字段保持不变
  providerId?: string;  // 关联的 Provider ID
}
```

### 内置 Provider 列表

| slug | name | apiUrl | docUrl |
|------|------|--------|--------|
| `anthropic` | Anthropic (Direct) | *(空)* | https://docs.anthropic.com |
| `zhipu` | 智谱 GLM Coding Plan | `https://open.bigmodel.cn/api/anthropic` | https://docs.bigmodel.cn/cn/coding-plan/overview |
| `volcengine` | 火山方舟 Coding Plan | `https://ark.cn-beijing.volces.com/api/coding` | https://www.volcengine.com/docs/82379/1928262 |
| `dashscope` | 阿里云百炼 Coding Plan | `https://coding.dashscope.aliyuncs.com/apps/anthropic` | https://help.aliyun.com/zh/model-studio/claude-code-coding-plan |
| `minimax` | MiniMax Token Plan | `https://api.minimaxi.com/anthropic` | https://platform.minimaxi.com/docs/token-plan/claude-code |
| `kimi` | Kimi Code Plan | `https://api.kimi.com/coding/` | https://www.kimi.com/code/docs/more/third-party-agents.html |
| `xiaomi-mimo` | Xiaomi MiMo Token Plan | `https://api.xiaomimimo.com/anthropic` | https://platform.xiaomimimo.com/#/docs/integration/claudecode |

每个内置 Provider 的 models 列表需根据各平台实际支持的模型填充（实施时确认）。

### 存储

- 文件路径：`~/.config/ai-manager/providers.json`
- 格式：紧凑 JSON（与 configs.json 一致）
- 首次调用 `get_providers()` 时自动初始化
- 版本升级时自动补充新增的内置 Provider

## 后端架构

### 新增模块 `provider.rs`

**Rust 数据结构**：

```rust
#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ProviderModel {
    pub id: String,
    pub name: String,
    pub category: String,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Provider {
    pub id: String,
    pub name: String,
    pub slug: String,
    pub api_url: String,
    pub doc_url: Option<String>,
    pub is_builtin: bool,
    pub models: Vec<ProviderModel>,
    pub created_at: u64,
    pub updated_at: u64,
}
```

**Tauri 命令**：

| 命令 | 参数 | 返回 | 说明 |
|------|------|------|------|
| `get_providers` | 无 | `Vec<Provider>` | 获取所有 Provider（含初始化逻辑） |
| `add_provider` | `ProviderData` | `Provider` | 添加自定义 Provider |
| `update_provider` | `id, ProviderData` | `Provider` | 更新 Provider（含内置的修改） |
| `delete_provider` | `id` | `()` | 删除自定义 Provider（内置不可删） |
| `reset_provider` | `id` | `Provider` | 重置内置 Provider 到默认值 |

**并发保护**：新增 `PROVIDER_LOCK` 全局互斥锁，所有写操作通过 `lock_provider()` 保护。

**初始化逻辑**（`get_providers()` 内部）：

1. 读取 `providers.json`
2. 若不存在 → 生成全部内置 Provider 列表，写入文件
3. 若存在 → 检查内置 Provider 是否齐全（按 slug 匹配），缺失的自动补充

### config.rs 变更

**`build_config_value()` 逻辑**：

- 新增 `provider_id` 处理：
  - 若 `config.provider_id` 非空 → 从 providers.json 查找对应 Provider
  - 用 Provider 的 `api_url` 写入 `ANTHROPIC_BASE_URL`（env 中）
  - 若 `api_url` 为空（Anthropic 直连）→ 不写入 `ANTHROPIC_BASE_URL`
- **优先级**：`config.api_url`（手动覆盖）> `provider.api_url`（Provider 预设）
- `apply_config()` 需要接收 providers 参数或内部读取 Provider 数据

**`ConfigData` DTO 变更**：新增 `provider_id: Option<String>` 字段。

**`preview_config()` 变更**：同步支持 `provider_id` 预览。

### lib.rs 变更

- 注册新命令：`get_providers, add_provider, update_provider, delete_provider, reset_provider`
- 引入 `provider` 模块

### utils.rs 变更

- 新增 `PROVIDER_LOCK: Lazy<Mutex<()>>` 和 `lock_provider()` 函数

## 前端架构

### 新增文件

| 文件 | 说明 |
|------|------|
| `src/components/ProviderPage.tsx` | Provider 管理页面（列表 + Drawer 布局，参考 SkillsPage） |
| `src/components/ProviderItem.tsx` | Provider 列表项（显示名称、slug、内置/自定义标签） |
| `src/components/ProviderEditor.tsx` | Provider 编辑面板（名称、slug、API URL、文档链接、模型列表管理） |

### 类型定义变更（`types.ts`）

新增 `ProviderModel`、`Provider` 接口，`ClaudeConfig` 新增 `providerId` 字段。

### ConfigEditor.tsx 改动

1. **Provider 下拉选择器**：位于 apiKey 字段上方
   - 数据源：App.tsx 传入的 `providers` 列表
   - 选择后触发：自动填充 `apiUrl`，更新 `providerId`
   - 显示 Provider 的 `docUrl` 快捷链接

2. **模型字段改造**：
   - 当 `providerId` 非空时，模型字段（model/haikuModel/sonnetModel/opusModel）变为 combobox（下拉选择 + 手动输入）
   - 下拉选项来自 `provider.models`，按 `category` 过滤
   - 当 `providerId` 为空或选择 Anthropic 直连时，恢复为纯文本输入

3. **联动逻辑**：
   - Provider 变更 → 自动填充 apiUrl（若用户未手动修改过）
   - Provider 变更 → 清空已选模型（因为不同 Provider 模型列表不同）

### ConfigItem.tsx 改动

在配置列表项中显示关联的 Provider 名称（小标签/badge），通过 `providerId` 查找 Provider 名称。

### Sidebar.tsx 改动

新增 "Provider" 导航项，位于 "Config" 和 "Memory" 之间。

### App.tsx 改动

- 新增 `providers` state 和 `loadProviders()` 函数
- 初始化时调用 `invoke("get_providers")` 加载
- 将 `providers` 传递给 `ConfigEditor` 和 `ProviderPage`
- 新增 "provider" 页面路由

### i18n.ts 改动

新增 Provider 管理相关的中英文翻译 key。

## 实现优先级

1. **P0 - 核心功能**：Provider 数据模型 + 后端 CRUD + ConfigEditor 集成
2. **P1 - 管理页面**：ProviderPage + ProviderEditor + ProviderItem
3. **P2 - 体验优化**：ConfigItem 标签展示、模型列表编辑、reset 功能

## 边界情况

- **删除 Provider 时已关联的 Config**：删除自定义 Provider 前检查是否有 Config 引用该 providerId，若有则拒绝删除并提示用户先解除关联
- **Provider 的 apiUrl 被用户修改**：仅影响后续新建或重新应用的配置，已写入 settings.json 的配置不会自动更新
- **多个 Config 关联同一 Provider**：正常场景，每个 Config 独立管理 API Key，共享 Provider 的 apiUrl 和模型列表

## 向后兼容

- 现有配置的 `providerId` 为空 → 保持原有行为不变
- `apiUrl` 字段保留 → 手动填写的配置继续工作
- 升级后首次打开自动初始化 providers.json，无需用户操作

## 不在范围内

- Provider 间的 API Key 共享（每个配置独立管理 API Key）
- Provider 在线检测/连通性测试
- 模型列表从 Provider API 自动拉取
- 托盘菜单中的 Provider 切换
