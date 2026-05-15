# 插件管理 UI 重设计

- 创建日期：2026-05-15
- 更新日期：2026-05-15
- 适用模块：`src/components/profile-editor/EnabledPluginsEditor.tsx`、`src/components/profile-editor/StructuredSettingsSections.tsx`、`src/components/profile-editor/official-plugin-catalog.ts`、`src/components/profile-editor/marketplace-presets.ts`、配套 i18n 与测试
- 相关规则：`.claude/rules/config-system.md`、`.claude/rules/frontend-ui.md`

## 背景

`EnabledPluginsEditor`（916 行）是 Profile / Preset 编辑抽屉里的「已启用插件」分区。当前实现把三件性质不同的事揉在同一张表里：

1. **配置 settings.enabledPlugins**：编辑 `~/.claude/settings.json` 真正会写入的开关条目。
2. **浏览官方插件目录**：点「加载官方插件」按钮，把官方 marketplace 的全部插件以未提交 (draft) 行追加到表中，列表瞬间从 N 行变成 N+30 行。
3. **手动录入条目**：用户输入 `name@marketplaceId` 新增一行。

后果：列表里同时存在「真正已启用」「未启用但未来想启用」「只是为了浏览」三种语义不同的行，靠隐式的 `committed` 字段区分；用户无法直接看到 settings 真实状态，跨 marketplace 搜索也只对官方目录生效，未被加载的非官方 marketplace 插件完全不可见。

## 目标

- 「设置 settings」与「浏览市场」在视觉与交互上彻底拆分，列表只反映真实的 settings 状态。
- 一次拉取所有已配置 marketplace 的插件清单，跨 marketplace 搜索结果完整。
- 默认按 `pluginId` 升序，不引入排序切换。
- 官方插件保留显著「已验证」标识；非官方插件不主动降权（不加灰），仅靠副标题里的 marketplaceId 区分。
- 现有筛选能力不缩水，仅在 Tab 2 增加 marketplace 维度。
- 数据模型与 settings 写盘行为完全不变，纯 UI 重组。

## 范围

**包含**：

- `EnabledPluginsEditor` 重构为双 Tab 结构。
- 新增"按需拉取所有已配置 marketplace 插件清单"能力（前端层，复用现有 fetch + localStorage 缓存模式）。
- 新增 i18n 文案；保留现有 `profileEditor.plugins.*` 文案中仍适用的项。
- 单元测试覆盖两个 Tab 的核心交互。

**不包含**：

- `MarketplaceEditor` 分区不动。
- `settings.json` 的 `enabledPlugins` schema 不变；后端 `validate_settings_document` 不动。
- 不引入新的 Tauri command（Tab 2 拉取仍走前端 `fetch`，与现有 `fetchOfficialPluginCatalog` 一致）。
- 不引入插件版本、依赖、详情页等元数据（现有 `OfficialPluginMetadata` 字段保持不变）。
- 不做跨 Profile 复用 / 批量操作 / 顶级"插件"页面（属于 C 方向，明确剔除）。

## 总体结构

`EnabledPluginsEditor` 内部新增一层 Tab 容器，使用 shadcn `Tabs` 组件：

```
分区头部（沿用现有 SettingsSectionModePanel：表单 / JSON 切换）
└── 表单模式
    └── Tabs
        ├── Tab "已启用" (默认)         → EnabledPluginsTab
        └── Tab "浏览市场"              → BrowseMarketplaceTab
```

JSON 模式与现有完全一致，不受 Tab 影响。

两个 Tab 共享同一份 `plugins: PluginEntry[]` state（继续 lift 在 `EnabledPluginsEditor` 顶层）。任意 Tab 中的启用/禁用立刻反映到另一 Tab。

`headerMeta` 计数仍由 `StructuredSettingsSections.tsx` 提供，文案沿用 `pluginsEnabledSummaryLabel`。

## 数据模型

### plugins state（不变）

```ts
interface PluginEntry {
  id: string;
  pluginId: string;       // "name@marketplaceId"
  enabled: boolean;
  committed: boolean;     // 现有逻辑：第一次被启用时晋升为 true
}
```

`committed = false` 的条目在新设计下不再出现在 Tab 1 列表中——因为 Tab 2 的"+ 启用"按钮直接产生 `committed = true` 条目，无需 draft 概念。`committed` 字段仍保留以兼容现有 `buildPluginRecord`（非布尔 legacy entry 仍走 `preservedEntries` 不动）。

### marketplace 插件清单缓存

新增类型（在 `official-plugin-catalog.ts` 重命名/扩展为 `marketplace-catalog.ts`）：

```ts
interface MarketplacePluginEntry {
  pluginId: string;        // "name@marketplaceId"
  marketplaceId: string;
  description: string;
  category: string;
  authorName: string;
  sourceType: string;      // 沿用现有：github / git / url / npm / path / unknown
  homepage: string;
  isOfficial: boolean;     // marketplaceId === OFFICIAL_MARKETPLACE_ID
}

interface MarketplaceCatalogState {
  marketplaceId: string;
  status: "idle" | "loading" | "ready" | "error";
  plugins: MarketplacePluginEntry[];
  error?: string;
  cachedAt?: string;       // ISO
}
```

localStorage 缓存键：

- 现有 `ai-manager-official-plugin-cache:v1` 保留，用于官方目录的离线呈现，键名不变以避免用户首次升级时丢缓存。
- 新增 `ai-manager-marketplace-plugin-cache:v1`：按 `marketplaceId` 索引的对象，每个条目包含 `plugins` 与 `cachedAt`。

非 `github` 类型 marketplace 的拉取由后续阶段实现；本设计只规定接口，第一阶段实现详见"实现阶段划分"。

## Tab 1 「已启用」

### 列表语义

- 列表展示 `plugins` 中 `committed === true` 的条目；不再有 draft 行混入。
- 列：`#`、插件 ID（含已验证徽标）+ 元数据副标题、状态开关（沿用现有 `SandboxSwitchControl` `variant="header"`）+ 状态文案、删除按钮。
- 元数据副标题：作者 · 类别（仅当能从 `MarketplacePluginEntry` 匹配到该 `pluginId` 时显示，否则只显示插件 ID）。

### 筛选

保留三项现有筛选 + 搜索框：

| 筛选 | 值 | 数据源 |
| --- | --- | --- |
| 搜索 | 自由文本，匹配 `pluginId` | — |
| 状态 | 全部 / 已启用 / 未启用 | — |
| 类别 | 全部 / 动态聚合 | 当前 `plugins` 中能匹配到 marketplace metadata 的条目（沿用现有逻辑） |
| 来源类型 | 全部 / 动态聚合 | 同上 |

筛选行整体宽度与对齐沿用现有实现的 `clamp(118px,12vw,132px)` 等约束，不重新设计响应式断点。

### 操作

- 行内开关：`SandboxSwitchControl` 切换 enabled，逻辑沿用现有 `updatePlugin`。
- 行内删除：`Trash2` 触发 `ConfirmAlertDialog`，逻辑不变。
- 列表底部仅一个 ghost 按钮 **「+ 手动输入 ID」**：点击展开 inline 表单（沿用现有 draft UI 的输入控件、保存/取消按钮、错误聚合），保存后产生 `committed = true` 条目。删除已暴露的「加载官方插件」按钮——该入口在新设计下不存在。
- 空状态：使用 `Empty` 组件，文案 "还没启用插件"，主按钮 "去浏览市场" 切换到 Tab 2，次按钮 "手动输入 ID"。

### 错误聚合

- 沿用 `interactionError` / `draftError` / `sectionPendingMessage` 三层语义，向 `onError` 冒泡分区错误。
- "正在编辑未保存"语义保留，仅作用于手动 ID inline 表单。

## Tab 2 「浏览市场」

### 数据加载

- 进入 Tab 2 时（首次切到该 Tab，而非分区挂载即拉取），并发触发所有已配置 marketplace 的拉取。
- 已有缓存的 marketplace 立即用缓存值渲染，并在后台拉取最新；拉取完成后无感替换。
- 单个 marketplace 失败不阻塞其他；失败保留缓存（如果有）继续展示，状态条提示失败计数与重试。
- 顶部 `↻ 刷新` 按钮强制刷新所有已配置 marketplace（绕过缓存）。

### 第一阶段实现限制

第一阶段仅实现 `OFFICIAL_MARKETPLACE_ID` 与其他 `source: github` 类型的 marketplace 拉取，复用现有 `fetchOfficialPluginCatalog` 的 raw URL 拉取逻辑、改为以 marketplace 配置中的 `repo` + `ref` + `path` 推导。其他 source 类型（`git` / `url` / `npm` / `path` / `hostPattern`）在 Tab 2 列表中显示为"暂不支持的来源"分组占位，状态条标记 "N 个来源暂不支持，仅展示 GitHub 来源"，避免阻塞主流程。第二阶段再扩展。

### 顶部控件

一行五控件 + 刷新按钮：

```
[搜索 flex 2.4] [marketplace flex 1.1] [状态] [类别] [来源类型] [↻刷新]
```

- 搜索：跨字段匹配 `pluginId` / `description` / `authorName`（不区分大小写）。
- marketplace 筛选：默认"全部"，选项来自所有已配置 marketplace（即使该 marketplace 拉取失败也出现在选项里，方便用户用筛选定位失败源的插件——失败时只是空列表）。
- 状态：全部 / 已启用 / 未启用。判定依据：当前 `plugins` state 中是否存在该 `pluginId` 且 `enabled === true`。
- 类别 / 来源类型：从所有已加载 marketplace 插件聚合。

控件与 Tab 1 共用同一组 i18n key，前缀沿用 `profileEditor.plugins.*`。

### 状态条

筛选行下方一条紧凑摘要：

```
共 N 个插件 · M 已启用 · 来自 K 个 marketplace        [⚠ X 个来源加载失败 · 查看]
```

- 失败计数为 0 时不显示失败链接。
- 失败链接点开 shadcn `Popover`，列出失败的 `marketplaceId` + 错误信息 + "重试"按钮。

### 列表

- 单一表格，无分组折叠。
- 列：`#`、插件 + 元数据副标题、操作按钮（宽度 80px）。
- 副标题信息组成：`{authorName} · {category} · {marketplaceId}`，缺字段时跳过。
- 已验证徽标：`pluginId` 同行显示 `CircleCheck` + "已验证" 文案，色值 `text-chart-2`，仅当 `isOfficial === true` 时出现。
- 默认按 `pluginId` 升序；`localeCompare` 排序，不区分大小写。
- 操作按钮：
  - 未启用：边框 ghost 按钮 `+ 启用`。点击直接 push 一个 `{ pluginId, enabled: true, committed: true }` 到 `plugins` state。
  - 已启用：实心徽标"已启用"。hover / focus 时按钮文案与样式切换为 `取消启用`（destructive 边框），点击调用 `updatePlugin(... enabled: false)` 但保留 `committed = true`，与 Tab 1 状态实时同步。
- 行尾文本"显示 1-N，共 M 项 · 默认按 pluginId 升序"。

### 空状态与错误状态

| 场景 | 呈现 |
| --- | --- |
| 未配置任何 marketplace | `Empty` 组件 + "未配置插件来源" + 副提示"请在 Marketplace 分区添加来源" |
| 已配置但全部加载失败 | 列表区显示 `Empty` + "加载失败"，状态条仍展示失败链接以便重试 |
| 筛选无结果 | `Empty` + "未找到匹配插件" |
| 部分 marketplace 暂不支持的来源类型 | 列表正常展示已支持来源；状态条加副提示 |

## 与 JSON 模式共存

- `SettingsSectionModePanel` 的"表单 / JSON" 切换不变。
- 切到 JSON 模式时，整个分区是 `enabledPlugins` 的 CodeMirror 编辑器，与 Tab 无关。
- 切回表单模式默认回到 Tab 1。

## i18n

新增 key（在 `src/i18n.ts` 同步 zh / en）：

| Key | 用途 |
| --- | --- |
| `profileEditor.plugins.tabEnabled` | Tab 1 标题 |
| `profileEditor.plugins.tabBrowse` | Tab 2 标题 |
| `profileEditor.plugins.tabEnabledCount` | Tab 1 计数（与现有 enabledSummary 共享） |
| `profileEditor.plugins.tabBrowseCount` | Tab 2 标题计数（覆盖所有已加载 marketplace 的总数） |
| `profileEditor.plugins.browse.searchPlaceholder` | Tab 2 搜索框 |
| `profileEditor.plugins.browse.marketplaceFilterLabel` | marketplace 筛选 label |
| `profileEditor.plugins.browse.marketplaceFilterAll` | "全部 marketplace" |
| `profileEditor.plugins.browse.statusBarSummary` | 状态条主文案模板 |
| `profileEditor.plugins.browse.failureSummary` | 状态条失败提示 |
| `profileEditor.plugins.browse.failurePopoverTitle` | 失败 popover 标题 |
| `profileEditor.plugins.browse.failureRetry` | 失败重试按钮 |
| `profileEditor.plugins.browse.refreshAll` | 刷新全部按钮 |
| `profileEditor.plugins.browse.actionEnable` | "+ 启用" |
| `profileEditor.plugins.browse.actionEnabled` | "已启用" |
| `profileEditor.plugins.browse.actionDisable` | hover 后的"取消启用" |
| `profileEditor.plugins.browse.unsupportedSourceHint` | 暂不支持来源类型的副提示 |
| `profileEditor.plugins.browse.emptyNoMarketplace` | 未配置 marketplace 空状态 |
| `profileEditor.plugins.browse.emptyAllFailed` | 全部加载失败空状态 |
| `profileEditor.plugins.browse.emptyNoMatch` | 筛选无结果 |
| `profileEditor.plugins.browse.sortHint` | "显示 1-N，共 M 项 · 默认按 pluginId 升序" |
| `profileEditor.plugins.emptyEnabled` | Tab 1 空状态文案 |
| `profileEditor.plugins.emptyEnabledGoBrowse` | "去浏览市场" |
| `profileEditor.plugins.emptyEnabledManualId` | "手动输入 ID" |

废弃 key（不删，保留兼容）：

- `profileEditor.plugins.loadOfficial`、`loadOfficialTooltip`、`loadOfficialSuccess`、`loadOfficialFallbackSuccess`、`loadOfficialError`、`loadingOfficial`：新设计中"加载官方插件"按钮不再存在。第一阶段保留 i18n 条目，避免外部引用断链；第二阶段清理。

## 测试

- 沿用 `EnabledPluginsEditor.test.tsx` 文件路径，扩展用例：
  - Tab 1 列表只展示 committed 条目，加载官方目录后 Tab 1 不变。
  - Tab 2 进入时触发拉取，并发多个 marketplace。
  - Tab 2 "+ 启用" 立即反映到 Tab 1。
  - Tab 2 hover 已启用行可禁用，状态同步。
  - 失败 popover 列出失败 marketplace 并能重试。
  - 筛选叠加生效，搜索匹配多字段，marketplace 筛选默认"全部"。
  - 排序按 `pluginId` 升序稳定。
  - 空状态三种分支文案正确。
  - 切回 JSON 模式后再回表单默认在 Tab 1。
- 测试选择器优先 `getByRole({ name })` / `getByText` / `data-slot`，禁止 class 选择。

## 验证

- `pnpm biome:ci`
- `pnpm test`
- `pnpm build`

## 实现阶段划分

阶段 1（本次实现，单一 PR）：

1. 拆分 `EnabledPluginsEditor` 为容器 + `EnabledPluginsTab` + `BrowseMarketplaceTab` + 共享 hook（plugins state、marketplace catalog 状态机）。
2. 重命名 / 扩展 `official-plugin-catalog.ts` 为 `marketplace-catalog.ts`，保留官方目录 helper 作为 specialization。
3. 新增 marketplace 列表缓存（按 marketplaceId）；从已配置 marketplace 推导 GitHub raw URL。
4. UI、i18n、测试同步落地。
5. 暂不支持的 source 类型显示占位。

阶段 2（后续，独立 PR）：

1. 扩展非 GitHub 来源的 marketplace 拉取；可能需要后端 Tauri command 走 `https`/`fs` 避免 CORS。
2. 清理废弃 i18n key 与 dead code。

## 风险与缓解

- **风险：Tab 2 进入即触发多源拉取，可能 30+ 个并发请求。** 缓解：限制并发数（`Promise.allSettled` + 简单 chunk 5）；缓存命中时跳过本次刷新。
- **风险：现有 `buildPluginEntries` / `buildPluginRecord` / `preservedEntries` 链路依赖 committed 字段保持 legacy entry。** 缓解：完全保留这三个函数与字段；只在 UI 层不再产生 `committed = false` 条目。
- **风险：状态条上失败链接位置在窄屏被挤压。** 缓解：与现有筛选行 wrap 行为对齐；窄屏时状态条另起一行。
- **风险：测试中需要 mock 多 marketplace 拉取。** 缓解：新建 `mockMarketplaceCatalog` 工具函数，复用现有 `fetchOfficialPluginCatalog` mock 思路。

## 不在本设计内

- 顶级"插件"页面（C 方向，已剔除）。
- 跨 Profile 复用已启用插件集（"整体 + 跨 Profile"方向，已剔除）。
- 插件版本、依赖、详情面板、安装文件操作。
- Tab 内的多排序模式（id 之外的排序）。
- 触发后端 marketplace 解析的 Tauri command（阶段 2 再考虑）。

