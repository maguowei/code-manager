# Token 用量与花费计算设计

## 概述

`~/.claude/projects/<project_dir>/<sessionId>.jsonl` 是 Claude Code 写入的对话原始流，每条 `assistant` 记录都带有 `message.usage` 字段，列出本轮的输入 / 输出 / 缓存 token。但 **该 jsonl 不包含 `costUSD` 字段**，所以应用必须根据 `message.model` 查价格表，按公式自行计算花费。

本文档说明 Token 用量统计模块（`src-tauri/src/usage.rs` + `src/components/UsagePage.tsx`）的费用计算规则、数据来源、与参考工具（ccusage / claude-usage）的差异、以及已知边界。

## 数据流总览

```
~/.claude/projects/<encoded-cwd>/<sessionId>.jsonl
        │
        │ 启动全量扫描 + watcher 增量
        ▼
src-tauri/src/usage.rs::parse_jsonl_line
        │ 仅保留 type=assistant 且含 message.usage 的行
        ▼
UsageRecord（按 message.id 去重）
        │ compute_cost(model, pricing, raw_usage)
        ▼
内存中 Vec<UsageRecord> + Arc<RwLock<UsageState>>
        │ apply_filter → aggregate_*
        ▼
DailyUsage / ProjectUsage / SessionUsage / ModelUsageStat
```

## 单条 cost 计算公式

每条 `UsageRecord` 在解析时一次性算好 `cost_usd`，避免聚合时重复计算：

```rust
cost_usd = (
    input_tokens               * price.input
  + output_tokens              * price.output
  + (cache_creation_5m + 1h)   * price.cache_write
  + cache_read                 * price.cache_read
) / 1_000_000.0
```

- 价格表中的 `input` / `output` / `cache_read` / `cache_write` 单位均为 **USD per million tokens**（来自 models.dev 的约定）
- `cache_creation_5m` 与 `cache_creation_1h` 当前合并按 `cache_write` 同一单价计费（详见下文「Cache 1h vs 5m」一节）
- 未识别模型时 `cost_usd = 0`，但 token 数仍正常累计

参见 `src-tauri/src/usage.rs::compute_cost`。

## 价格表

### 三层来源（按优先级）

```
启动 → load_pricing()
      ├─ 1. ~/.config/ai-manager/model-pricing.json（上次缓存，PricingSource::Cache）
      └─ 2. src-tauri/resources/model-pricing.json（编译时内置，PricingSource::Builtin）

启动后异步 → fetch_pricing_from_network()
              ├─ GET https://models.dev/api.json (15s timeout)
              ├─ 解析 anthropic provider 下所有 model 的 cost 字段
              ├─ 写入 ~/.config/ai-manager/model-pricing.json (PricingSource::Network)
              └─ emit "usage-pricing-updated" → 前端刷新 + 重算所有 cost
```

UI 上以 badge 形式标注当前价格表来源（`内置 / 本地缓存 / models.dev 实时`），用户可点 [刷新价格] 手动触发联网刷新。

### 价格表数据结构

```rust
struct PricingTable {
    source: PricingSource,        // Builtin / Cache / Network
    fetched_at_ms: Option<i64>,   // 联网拉取时间
    models: HashMap<String, ModelPrice>,
}

struct ModelPrice {
    input: f64,        // per million tokens
    output: f64,
    cache_read: f64,
    cache_write: f64,  // 5m ephemeral 写入价格（与 1h 共用）
}
```

### 内置兜底价格（节选）

| Model | input | output | cache_read | cache_write |
|---|---:|---:|---:|---:|
| claude-opus-4-7 | 5.00 | 25.00 | 0.50 | 6.25 |
| claude-opus-4-5/4-6 | 5.00 | 25.00 | 0.50 | 6.25 |
| claude-opus-4-1 | 15.00 | 75.00 | 1.50 | 18.75 |
| claude-3-7-sonnet-20250219 | 3.00 | 15.00 | 0.30 | 3.75 |
| claude-sonnet-4-x | 3.00 | 15.00 | 0.30 | 3.75 |
| claude-3-5-sonnet-20241022 | 3.00 | 15.00 | 0.30 | 3.75 |
| claude-haiku-4-5 | 1.00 | 5.00 | 0.10 | 1.25 |
| claude-3-5-haiku-20241022 | 0.80 | 4.00 | 0.08 | 1.00 |
| claude-3-haiku-20240307 | 0.25 | 1.25 | 0.03 | 0.30 |

完整内置表见 [`src-tauri/resources/model-pricing.json`](../../src-tauri/resources/model-pricing.json)。

models.dev 缺失的 `cache_read` / `cache_write` 字段按 Anthropic 官方比例补齐：

- `cache_write ≈ input × 1.25`（5min ephemeral）
- `cache_read  ≈ input × 0.10`

`fetch_pricing_from_network` 在解析 models.dev 响应时使用同一 fallback 比例。

## 模型匹配规则

`match_model_price(model_id, pricing)` 按以下顺序匹配：

1. **精确匹配** — `pricing.models[model_id]`
2. **大小写不敏感精确匹配** — 遍历查找 `key.to_lowercase() == model_id.to_lowercase()`
3. **类别 fallback** — 模型 ID 含 `opus` / `sonnet` / `haiku` 子串时，从该类别下挑选 `input` 单价 **最低** 的条目作为代表（保守估计）
4. **完全无法识别** — 返回 `None`，`compute_cost` 返回 0；模型 ID 加入 `unknown_models` 集合，在 UI 顶部以警告条展示

类别 fallback 的设计意图：当 Anthropic 发布新型号（如 `claude-opus-4-9-experimental-20260601`）但 models.dev 还没有更新时，至少能用同类的保守价格估算，而不是直接 cost = 0。选最低单价是因为高估比低估更不利于用户决策（看到偏高的成本时用户会怀疑数据，看到偏低则可能误以为没在花钱）。

## Cache 1h vs 5m

Anthropic 提供两档 ephemeral cache 写入：5 分钟与 1 小时，对应 `usage.cache_creation.ephemeral_5m_input_tokens` 与 `ephemeral_1h_input_tokens`。

### 当前行为

- **解析时**：分别记录 `cache_creation_5m` 与 `cache_creation_1h` 字段，保留区分能力
- **计费时**：两者求和后按同一 `cache_write` 单价计算

### 取舍原因

models.dev 当前只暴露一个 `cache_write` 价格字段，未区分 1h / 5m。Anthropic 公开定价里 1h 是 5m 的 1.6×（5m = input × 1.25，1h = input × 2.0）。

如果未来需要细分：
1. 价格表新增 `cache_write_1h` 字段（向后兼容：缺失时回退到 `cache_write`）
2. `compute_cost` 改为分别乘对应单价

ccusage 与 claude-usage 当前行为也是合并计费，本实现保持一致以便对账。

### 5m / 1h 字段缺失时的兜底

```rust
let (cache_5m, cache_1h) = if let Some(cc) = usage_v.get("cache_creation") {
    (cc.ephemeral_5m_input_tokens, cc.ephemeral_1h_input_tokens)
} else {
    // 老格式：整体计入 5m
    (usage_v.cache_creation_input_tokens, 0)
};
```

旧版本 Claude Code 写入的 jsonl 没有 `cache_creation` 子对象，只有顶层 `cache_creation_input_tokens`。这种情况下整体当作 5m 处理。

## 去重

同一条 assistant message 可能因网络重试或 Claude Code 的 resume 机制在一个或多个 jsonl 中被多次记录。本模块使用以下策略：

1. **主键**：`message.id`（Anthropic 返回的全局唯一 ID，本机数据 100% 命中）
2. **回退**：`message.id` 为空时按 `(session_id, uuid)` 处理（实测中未触发）
3. **跨文件去重**：`UsageState.seen_message_ids` 是 `HashSet<String>`，扫描时全局共享
4. **增量扫描的去重**：`scan_file_from_offset` 在解析每条记录前检查 `seen.insert(message_id)`，重复则跳过

参考工具 ccusage 也以 `message.id` 为主键去重，本实现行为一致。

## 增量扫描与文件 offset

为避免每次启动重读全部 jsonl，用 Tauri SQL 插件的 `sqlite:usage.db` 持久化 records、文件 offset 索引和扫描 metadata。运行时不是内存库；实际文件位于 Tauri `app_config_dir`：

- macOS：`~/Library/Application Support/com.gotobeta.app.ai-manager/usage.db`
- Linux：`$XDG_CONFIG_HOME/com.gotobeta.app.ai-manager/usage.db` 或 `~/.config/com.gotobeta.app.ai-manager/usage.db`
- Windows：`%APPDATA%\com.gotobeta.app.ai-manager\usage.db`

当前核心表：

```sql
CREATE TABLE IF NOT EXISTS usage_records (...);

CREATE TABLE IF NOT EXISTS usage_file_index (
    path TEXT PRIMARY KEY NOT NULL,
    mtime_ms INTEGER NOT NULL DEFAULT 0,
    size INTEGER NOT NULL DEFAULT 0,
    last_offset INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS usage_meta (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL
);
```

启动扫描时按文件比对：

| `mtime` 与 `size` 对比 | 行为 |
|---|---|
| 二者均未变 | 跳过（直接复用上次的 offset） |
| `size` 增大且 `mtime` 推进 | 从 `lastOffset` 开始续读（jsonl 是 append-only） |
| `size` 缩小或 `mtime` 倒退 | 文件被截断/重写，从 0 开始重读 |

### 末尾不完整行处理

watcher 触发时，jsonl 末行可能正在被 Claude Code 追加。`scan_file_from_offset` 找到最后一个 `\n`，仅消费该位置及之前的内容；下次 watcher 再触发时从同一 offset 续读，直到完整行可用。

```rust
let trailing_incomplete = !buf.ends_with('\n') && !buf.is_empty();
if trailing_incomplete {
    if let Some(last_newline) = buf.rfind('\n') {
        effective_end = last_newline + 1;
    } else {
        return Ok(start_offset);  // 整段都是不完整行，等下次
    }
}
```

`scan_file_handles_incomplete_trailing_line` 单元测试覆盖此分支。

## 时区与日期分桶

按日期聚合（`get_usage_daily`）必须使用 **本地时区**，否则跨 UTC 0 点的会话会被分到错误的日期，用户感觉数据"消失"。

```rust
fn local_offset() -> time::UtcOffset {
    static OFFSET: Lazy<time::UtcOffset> = Lazy::new(|| {
        time::UtcOffset::current_local_offset().unwrap_or(time::UtcOffset::UTC)
    });
    *OFFSET
}
```

`once_cell::Lazy` 在第一次访问时尝试获取本地偏移并缓存。`time` crate 在多线程环境下取本地偏移可能因 libc 限制返回 `Err`，此时回退 UTC（用户日历日会与系统时区相差 ±N 小时，但分桶逻辑仍然单调一致）。

filter 中的 `start_date` / `end_date` 字段（`YYYY-MM-DD` 字符串）也按本地时区解析为半开区间：`[start of day, end of day]`。

## 重新计算 cost 的时机

只有以下两种情况会重算 `UsageRecord.cost_usd`：

1. **价格表更新** — `apply_new_pricing()` 内一次性遍历 `inner.records.iter_mut()`，按新价格表覆盖 `cost_usd`，同时刷新 `unknown_models`
2. **强制全量重扫** — `rescan_usage` 命令清空内存与索引后重扫

watcher 触发的增量扫描不会重算已有 records 的 cost，仅追加新 records。

## 与 ccusage / claude-usage 的差异

| 维度 | 本实现 | ccusage | claude-usage |
|---|---|---|---|
| 数据源 | `~/.claude/projects/**/*.jsonl` | 同 | 同 |
| 价格来源 | 内置 + models.dev 实时 + 本地缓存 | 嵌入 ccusage 的内置价格 | Python 写死的 April 2026 价格 |
| 去重 key | `message.id` | `message.id` | 不详（按 row 处理） |
| Cache 1h/5m | 合并按 cache_write 单价 | 合并 | 合并 |
| 维度 | daily / project / session / model | daily / monthly / session / blocks | today / weekly / all-time |
| 未识别模型 | cost = 0 + 警告条 | 不计费 | 仅支持 opus/sonnet/haiku |
| 持久化 | SQLite records + 文件索引 + 价格缓存 | 无（每次重扫） | SQLite 增量扫描 |
| 5h Block 视图 | 暂未实现 | 有 | 无 |
| 时区 | 本地时区 | UTC（默认） | 不详 |

对账方法：在同一台机器上跑 `npx ccusage daily`，把同一天的 cost 与 UsagePage 显示的 cost 比较。差异通常 < 1%，主要来自：
- 时区不同（ccusage 默认 UTC，本实现本地）
- 浮点精度差异（cumulative）

## 性能特征（本机数据，Apple Silicon）

| 操作 | 实测数据 |
|---|---|
| 全量扫描 849 个 jsonl，27k assistant 记录 | 1.5–3 秒 |
| 增量扫描（单文件追加 1 条） | < 50 ms |
| 内存占用（27k records） | 约 5–6 MB |
| 全 records cost 重算（价格更新后） | < 100 ms |
| 聚合查询（无 filter） | < 20 ms |

## 已知限制

1. **Cache 1h 与 5m 未分别计费** — models.dev 价格表不区分。如果 Anthropic 后续公布差异化定价，需扩展 `ModelPrice` 与 `compute_cost`。
2. **未识别模型 cost = 0** — 第三方代理（OpenRouter / Bedrock 等）使用的非 Anthropic 模型 ID 不会被识别。后续可考虑暴露"自定义价格表"功能让用户手动补充。
3. **SQLite 首次建库需要全量扫描** — 从旧版本升级或 `usage.db` 不存在时，需要完整读取一次 `~/.claude/projects/**/*.jsonl` 来初始化 `usage_records` 与 `usage_file_index`。
4. **不支持 5h Block 视图** — Claude Pro/Max 用户的滚动 5 小时配额窗口尚未实现，可作为后续 ccusage 风格的"配额预测"功能补上。
5. **时区取一次后缓存** — 用户夏令时切换 / 跨时区出差时，应用需要重启才能正确分桶。
6. **未做磁盘空间监控** — `usage.db` 体积随 records 与 jsonl 文件数增长；WAL 模式还可能产生 `usage.db-wal` 与 `usage.db-shm`，后续可在诊断页补充数据库大小提示。

## 关键文件

- 后端：`src-tauri/src/usage.rs`（数据结构、扫描、价格、聚合、命令、单测）
- 内置价格表：`src-tauri/resources/model-pricing.json`
- 启动注册：`src-tauri/src/lib.rs::usage::start_usage_runtime`
- 前端 hook：`src/hooks/useUsage.ts`
- 前端页面：`src/components/UsagePage.tsx`
- 类型契约：`src/types.ts`（`UsageRecord` / `PricingTable` / `UsageFilter` 等）

## 参考

- ccusage：https://github.com/ryoppippi/ccusage
- claude-usage：https://github.com/phuryn/claude-usage
- models.dev：https://models.dev / https://models.dev/api.json
- Anthropic 官方定价：https://www.anthropic.com/pricing
