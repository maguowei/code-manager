---
name: upgrade-dependencies
description: AI Manager 依赖升级技能。用于用户要求检查、规划、实施或复盘 pnpm/Cargo 依赖升级时，按安全补丁、Tauri 栈、前端库和 breaking 主版本分批处理，并执行对应验证。
---

# Upgrade Dependencies

用于 AI Manager 仓库的依赖检查、升级规划、分批实施和升级复盘。每次都以当前真实依赖状态为准，不沿用历史版本表当作最新事实。

## 触发场景

- 用户要求检查当前项目可升级依赖。
- 用户要求制定或实施依赖升级方案。
- 用户要求重新评估 Batch D、breaking 主版本或 pnpm/Cargo 升级。
- 用户要求复盘依赖升级失败、审计失败、构建失败或锁文件漂移。

## 入口检查

先读 `CLAUDE.md`，再按改动范围读取命中的 `.claude/rules/*.md`。依赖升级通常至少涉及：

- `package.json`、`vite.config.ts`、`vitest.config.ts`、`tsconfig*.json`：读取 `.claude/rules/frontend-ui.md`。
- `src-tauri/Cargo.toml`、`src-tauri/Cargo.lock`、Rust schema 测试：读取 `.claude/rules/tauri-backend.md`。
- Memory / Skills schema 或测试适配：读取 `.claude/rules/memory-and-skills.md`。

开始前执行并记录：

```bash
git status --short
pnpm --version
node --version
rustc --version
```

如果工作区已有无关 tracked 改动，不回退、不格式化、不顺手清理；只在必要文件上叠加本次变更。

## 事实源

依赖结论必须来自当前命令输出：

```bash
pnpm outdated --format json
pnpm audit --json
cd src-tauri && cargo update --dry-run --locked --verbose
```

按需补充：

```bash
pnpm view <package>@<version>
cd src-tauri && cargo info <crate>
cd src-tauri && cargo tree -i <crate>@<version>
```

普通 sandbox 下 `pnpm install` / `pnpm audit` 可能因为网络失败；`make build` 的 DMG bundling 可能因为 `hdiutil` 挂载权限失败。遇到这类现象时，先判断是否为环境限制，再按权限流程提升重跑，不要弱化测试或手改 lockfile。

## 分批策略

默认拆为四批，除非用户明确要求合并：

1. **安全与低风险前端补丁**：先修 `pnpm audit` 中 moderate/high/critical 项，再带上前端 patch/minor 工具包。保持精确 pin 的依赖继续精确 pin，只更新版本值。
2. **Tauri 2.x 栈对齐**：JS 侧 `@tauri-apps/*` 与 Rust 侧 `tauri*`、插件版本同步。若 JS 插件精确 pin，Rust 插件也同步 pin 到匹配版本。
3. **前端 UI/表单库小版本**：CodeMirror、UIW、React Hook Form、Zod、Tailwind、图表、日期、diff/tree 等库单独成批，重点跑前端测试和真实构建。
4. **breaking / 主版本**：Vite、TypeScript、pnpm、Rust 主版本依赖逐项评估。每个高风险点独立提交或独立工作段，先查迁移说明，再跑对应局部测试和全量门禁。

## 执行约束

- 不手动编辑 `pnpm-lock.yaml` 或 `Cargo.lock`；通过 `CI=true pnpm install --no-frozen-lockfile`、`CI=true pnpm install`、`cargo update` 等命令生成。
- 不新增功能，不改 UI 文案，不改 Tauri command/capability；除非升级导致编译或测试失败。
- 不把 `sqlx` 单独升到 `0.9`，直到 `tauri-plugin-sql` 支持同一 `sqlx` 主版本，或先重构掉共享 `SqlitePool` 类型耦合。
- 不把 Vite / TypeScript / pnpm 这类工具链主版本混入安全修复批，除非用户明确要求。
- 执行 `pnpm install` 时优先使用 `CI=true`，避免 pnpm 11 在无 TTY 场景下因重建 `node_modules` 交互提示中断。

## 2026-05-24 已验证经验

这些是历史经验，不是未来升级的版本事实；再次升级前必须重新查询。

- `pnpm@11.2.2` 可用于本仓库；安装命令使用 `CI=true pnpm install` 或 `CI=true pnpm install --no-frozen-lockfile`。
- Vite 8 + `@vitejs/plugin-react` 6 + TypeScript 6 可通过本仓库门禁。TS6 下需要显式 Node types，并移除已弃用的 `baseUrl`，仅保留 `paths` alias。
- `schemars 1.x` 不再使用旧的 `RootSchema.schema.object` 测试访问方式；schema 契约测试改为 `serde_json::to_value(schema_for!(...))` 后读取 `properties` / `required`。
- `reqwest 0.13` 在本仓库使用 `default-features = false` 时，Rustls feature 使用 `rustls`，不是旧的 `rustls-tls`。
- `sqlx 0.8.6` 仍与 `tauri-plugin-sql 2.4.0` 绑定；直接升 `sqlx 0.9` 会造成池类型风险。

## 验证矩阵

按改动范围选择最小充分集。没有新鲜输出，不声称通过。

前端依赖：

```bash
pnpm audit --json
make lint-frontend
make build-frontend
make test-frontend
```

Rust 依赖：

```bash
make fmt-rust-check
make check
make lint-rust
make test-rust
```

Schemars / schema 契约：

```bash
cd src-tauri && cargo test schema_tests
make test-rust
make build-frontend
```

最终收口：

```bash
make verify
make build
git diff --check
git status --short
```

## 输出要求

- 规划时列出分批、风险、验证命令和明确延后项。
- 实施时汇报实际改动、命令结果和未完成/被延后的依赖。
- 审计时优先列漏洞状态、主版本风险和锁文件是否由工具生成。
