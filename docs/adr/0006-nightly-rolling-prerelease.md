# 每夜构建使用滚动预发布通道、临时构建配置与独立更新策略

主分支 `main` 每次合并后在 CI 上自动构建各平台安装包，供用户提前测试尚未发布的功能，同时不影响已安装稳定版的用户自更新。

## Context

正式版由 `release.yml` 在 `v*` tag 时发布，产物发布前已通过质量门禁，但大众只能等正式发版才拿到包含新功能的包。若直接让测试者安装 pre-release 标记的构建，需要解决三个问题：包要能精确定位到某次 `main` 合并（否则报 bug 无从回溯）；预发布构建不能污染稳定版的自更新通道；各平台打包器对版本号后缀的容忍度不同（MSI/RPM 拒绝预发布后缀）。

## Decision

- **滚动每夜构建**：固定 `nightly` tag，每次 `main` 合并后用完整的新产物集替换旧 release，`prerelease: true`，下载链接 `releases/download/nightly` 永久稳定，不刷新 tag 历史。
- **CI 注入版本号**：构建前先断言 `package.json`、`src-tauri/Cargo.toml` 与 `src-tauri/tauri.conf.json` 的正式版本一致，再生成临时 Tauri overlay，把构建版本设为 `<当前semver>-nightly.g<短sha>`（如 `1.6.0-nightly.ga1b2c3d`）。构建通过 `tauri build --config` 合并 overlay，不改写任何正式版本源或 `Cargo.lock`；产物名、About 页、`package_info()` 均可据此定位 commit。
- **打包器收窄**：因版本号含 `-`，预发布只在 macOS 出 `dmg`、Linux 出 `deb`+`appimage`、Windows 出 `nsis`；`rpm` 与 `msi` 留给正式版。正式版 `release.yml` / `bundle.targets: "all"` 保持不变。
- **隔离稳定自更新**：稳定版继续查询 `releases/latest` 下的稳定 `latest.json`，GitHub 会排除预发布 release。Nightly overlay 则清空 updater endpoints，运行时再根据 `-nightly.` 版本标识禁用自动与手动检查；任一层失效都不会把 Nightly 引向稳定版安装包。Nightly 仍不注入 `TAURI_SIGNING_PRIVATE_KEY`，也不生成 `.sig` / `latest.json`。Homebrew cask workflow 已有 `prerelease == false` 判断，不会误更新。
- **上传编排**：不用 `tauri-action`（其"构建+上传"一步、无法插入中间验证步骤）。各平台 job 独立执行 `tauri build` → 产物断言 → 无头启动冒烟 → 上传 workflow artifact；最终 `publish` job 只在全部成功后核验四类产物、删除旧 release、创建 draft 并一次性上传，最后公开为 prerelease。构建失败不会改变当前可下载的 Nightly。
- **质量门禁**：`push: main` 由 `workflow_run` 等待 `ci.yml` 成功后才构建（不重复跑 verify）；`workflow_dispatch` 走独立轻量前置（actionlint + gitleaks）。Nightly workflow 串行执行且不自动取消发布阶段；发布前再次核对 `main`，过期构建直接跳过。

## Consequences

- `main` 合并到包可下载要等 CI 完成，约比正式发布快；无法回溯历史预发布包（滚动语义，旧包被覆盖）。
- 预发布包不签名/不公证：macOS 触发 Gatekeeper、Windows 触发 SmartScreen，测试者需额外步骤，已写入 README 说明。
- 每夜构建**不支持**应用内自更新；设置页会明确提示手动安装新 Nightly。后续若要给测试者提供自动更新，需要独立 endpoint、签名产物与通道切换，属另一个决策。
- 若未来想用 `tauri-action` 统一正式与预发布，需重新评估各平台打包器的版本后缀行为；本决策刻意保留了两条独立流水线。
