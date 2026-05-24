---
name: upgrade-dependencies
description: AI Manager 仓库 pnpm/Cargo 依赖升级技能。无论是依赖巡检、单包升级、Tauri 栈对齐、安全补丁修复，还是评估 Vite/TypeScript/Rust 主版本 breaking change，只要涉及 package.json、Cargo.toml、lock 文件或要跑 pnpm audit/cargo update，都使用本技能：按"安全→Tauri→前端→breaking"分批推进，每批跑对应验证。
---

# Upgrade Dependencies

为 AI Manager 仓库执行依赖检查、升级规划、分批实施和复盘。**事实源永远是当前命令输出**——本文档列出的历史版本号会过时，不能当作未来升级的依据。

## 触发场景

- 检查当前可升级依赖、漏洞或 `cargo update --dry-run` 结果。
- 规划或实施升级（含 patch/minor、Tauri 栈、breaking 主版本）。
- 复盘升级失败：构建挂、测试挂、锁文件漂移、版本回滚。

## 工作流速览

1. **前置检查**：工作区状态 + 工具链版本 + 命中规则。
2. **抓事实**：用当前命令输出，不读历史版本数字。
3. **拆批**：按"安全→Tauri→前端→breaking"四批，每批独立验证、独立回滚。
4. **逐批实施 + 验证**：跑对应验证矩阵。
5. **收口**：汇报实际改动、未尽项、风险。

方向偏离（lockfile 漂移、跨批升级、build 红）→ 停下重新规划，不要硬扛。

## 前置检查

读 `CLAUDE.md` 后，按改动范围读对应规则：

| 改动范围 | 必读规则 |
| --- | --- |
| `package.json`、`vite.config.ts`、`vitest.config.ts`、`tsconfig*.json` | `.claude/rules/frontend-ui.md` |
| `src-tauri/Cargo.toml`、`Cargo.lock`、Rust schema 测试 | `.claude/rules/tauri-backend.md` |
| Memory / Skills schema、契约测试 | `.claude/rules/memory-and-skills.md` |

环境快照（事后排查依赖）：

```bash
git status --short
pnpm --version
node --version
rustc --version
```

工作区已有无关 tracked 改动时**叠加**变更，不顺手回退或格式化——那可能是另一条工作线。

## 事实源

依赖结论只能来自当前输出，**不能引用本文档下方"已知陷阱"里的版本号**：

```bash
pnpm outdated --format json
pnpm audit --json
cd src-tauri && cargo update --dry-run --locked --verbose
```

深挖单个包时：

```bash
pnpm view <package>@<version>                      # 候选版本与 peer deps
cd src-tauri && cargo info <crate>                 # 最新版本与 features
cd src-tauri && cargo tree -i <crate>@<version>    # 反查谁依赖某版本
```

**为什么强调当前输出**：上游随时可能发新版本或撤回（yank）某版本；照抄旧记忆推进升级会让 lockfile 与 registry 实际状态错位，后续 CI 才暴露。

**环境限制识别**：sandbox 下 `pnpm install` / `pnpm audit` 网络可能失败；`make build` 的 DMG bundling 可能因 `hdiutil` 挂载权限挂——这些是环境问题，需要按权限流程提权重跑，不要为了绕过它们弱化测试、删除 audit 项或手改 lockfile。

## 分批策略

默认 4 批，按风险递增；除非用户明确要求合并，否则不合并。每批独立提交，便于定位和回滚。

### Batch A — 安全与低风险前端补丁

先治 `pnpm audit` 中 moderate/high/critical 漏洞，附带前端 patch/minor 工具包。

- **为什么先做**：风险面最小、价值最高，独立验证和回滚都容易，能尽快减小安全暴露窗口。
- **保持 pin 风格**：原本精确 pin 的依赖继续精确 pin，只换版本值——下游 resolver 假设依赖于此，乱改 caret/tilde 会扩散到 lockfile 树。

### Batch B — Tauri 2.x 栈对齐

JS 侧 `@tauri-apps/*` 与 Rust 侧 `tauri*`、所有 `tauri-plugin-*` 同步升级。

- **为什么打包**：Tauri 是双语栈，JS 与 Rust 必须语义版本对齐，否则会出现 invoke 协议错配或 plugin schema 不一致——而且这种错位通常运行时才暴露。
- JS 插件精确 pin 时，Rust 插件同步 pin 到匹配版本。

### Batch C — 前端 UI/表单库小版本

CodeMirror、UIW、React Hook Form、Zod、Tailwind v4、Recharts、date-fns、@pierre/diffs|trees 等。

- **为什么单独**：这些库改 UI 行为或类型签名的概率高，需要前端测试 + 真实构建 + 视觉核验；混入 Tauri 批会让回滚粒度过粗，问题难定位。

### Batch D — breaking / 主版本

Vite、TypeScript、pnpm、Rust 主版本依赖逐项独立评估。

- **为什么逐项**：每个主版本都自带迁移指南，必须先读 release notes/migration guide 再动手；混批后"到底是哪个升级炸了"无法定位。
- 每个主版本独立提交或独立工作段，先跑局部测试，再跑全量门禁。

## 执行约束

- **不手动编辑 `pnpm-lock.yaml` / `Cargo.lock`**——lock 文件由 resolver 生成，手改会引入实际不存在的版本组合。用 `CI=true pnpm install`、`CI=true pnpm install --no-frozen-lockfile`、`cargo update` 等命令生成。
- **不顺手改 UI 文案、Tauri command/capability、产品行为**——升级只动版本号；编译/类型/测试挂时按最小必要修改适配，不顺道做产品改进。
- **不把 `sqlx` 单独升到 `0.9`**——`tauri-plugin-sql` 当前主版本仍绑定 `sqlx 0.8`，两者共享 `SqlitePool` 类型，主版本错配会运行时崩溃。等 plugin 跟上或先解耦池类型。
- **不把工具链主版本混入安全批**——Vite/TypeScript/pnpm 主版本属于 Batch D，混入会让"安全修复 PR"丧失快速合并和快速回滚的属性。
- **`pnpm install` 强制 `CI=true`**——pnpm 11 在无 TTY 场景重建 `node_modules` 会等待交互输入而挂住，`CI=true` 关闭交互。

## 验证矩阵

按改动范围选最小充分集；没有本次会话的新鲜命令输出，**不**声称通过。

| 改动范围 | 验证命令 |
| --- | --- |
| 前端依赖 | `pnpm audit --json`、`make lint-frontend`、`make build-frontend`、`make test-frontend` |
| Rust 依赖 | `make fmt-rust-check`、`make check`、`make lint-rust`、`make test-rust` |
| Schemars / schema 契约 | `cd src-tauri && cargo test schema_tests`、`make test-rust`、`make build-frontend` |
| 跨语言收口 | `make verify`、`make build`、`git diff --check`、`git status --short` |

`make verify` 是本地全门禁；时间允许，每批结束都跑一次。

## 已知陷阱（截至 2026-05-24，使用前重新验证）

下列是过往升级踩过的具体事实。**版本号会过时，再次升级前必须用"事实源"小节的命令重新查询。** 若历史与当前输出冲突，信任当前输出并就地更新或删除条目。

- `pnpm@11.x` 在本仓库可用；安装走 `CI=true pnpm install` 或 `CI=true pnpm install --no-frozen-lockfile`。
- Vite 8 + `@vitejs/plugin-react` 6 + TypeScript 6 可通过本仓库门禁；TS6 下需显式 Node types，并移除已弃用的 `baseUrl`，仅保留 `paths` alias。
- `schemars 1.x` 弃用了 `RootSchema.schema.object` 访问路径；schema 契约测试改为 `serde_json::to_value(schema_for!(...))` 后读取 `properties` / `required`。
- `reqwest 0.13` 使用 `default-features = false` 时，Rustls feature 是 `rustls`，不是旧的 `rustls-tls`。
- `sqlx 0.8.x` 仍与 `tauri-plugin-sql 2.4.0` 绑定（见"执行约束"）。

## 输出格式

按阶段输出对应结构。

**规划阶段**：

```
## 升级计划

事实源（当前命令输出）：
- pnpm outdated: <候选包数>
- pnpm audit: <漏洞数 by severity>
- cargo update --dry-run: <候选 crate 数>

Batch A — 安全/低风险：
- <pkg> <old> -> <new>   (原因: CVE-XXXX / patch / ...)

Batch B — Tauri 栈：...
Batch C — 前端 UI：...
Batch D — breaking：
- <pkg> <old> -> <new>   风险：<点>   延后原因：<点>

每批验证命令：参考"验证矩阵"对应行
```

**实施阶段**（每批结束汇报）：

```
## Batch X 实施结果

改动文件：package.json / Cargo.toml / lock
版本变化：<pkg> <old> -> <new>
命令结果：<命令> -> <pass/fail，关键输出>
未完成 / 延后：<条目 + 原因>
```

**复盘阶段**：

- 漏洞修复状态（before/after by severity）
- 主版本风险与延后理由
- 锁文件是否完全由工具生成（绝无手改）
- 下次升级前需要先解决的耦合（如 sqlx/tauri-plugin-sql）
