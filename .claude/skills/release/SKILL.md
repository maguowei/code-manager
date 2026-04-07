---
name: release
description: This skill should be used when the user asks to "release a version", "publish a release", "发布版本", "打版本", "发版", "release v1.2.3", or provides a version number to release. It handles updating version files, committing, tagging, and pushing for a proper release flow.
---

# Release Skill

给定版本号，自动完成完整发布流程：更新版本文件 → 提交 → 打 git tag → push。

## 工作流

接收版本号（如 `0.12.0` 或 `v0.12.0`），按顺序执行以下步骤：

### 步骤 1：规范化版本号

去掉前缀 `v`，使用纯 semver 格式（如 `0.12.0`）进行后续操作。

### 步骤 2：更新版本文件

用 Edit 工具依次更新以下三个文件：

1. **`src-tauri/tauri.conf.json`** — 顶层 `version` 字段
2. **`package.json`** — 顶层 `version` 字段
3. **`src-tauri/Cargo.toml`** — `[package]` 段的第一个 `version = "..."` 行

### 步骤 3：同步 Cargo.lock

执行以下命令更新锁文件：

```bash
cargo update --manifest-path src-tauri/Cargo.toml --package ai-manager
```

如命令失败（包名不匹配等），跳过并记录。

### 步骤 4：提交版本变更

仅暂存版本相关文件，提交：

```bash
git add src-tauri/tauri.conf.json package.json src-tauri/Cargo.toml src-tauri/Cargo.lock
git commit -m "chore(release): bump version to {VERSION}"
```

### 步骤 5：打 tag 并推送

```bash
git tag v{VERSION}
git push origin HEAD
git push origin v{VERSION}
```

### 步骤 6：完成确认

汇报已完成的步骤，并提示用户：tag 推送后 GitHub Actions 的 release 工作流将自动触发，构建产物文件名将使用正确的版本号。

## 注意事项

- 版本文件中始终使用纯 semver（如 `0.12.0`），只有 git tag 才加 `v` 前缀（`v0.12.0`）。
- 执行前检查工作区是否有未提交的无关变更，若有则先提示用户。
- 不手动修改 `pnpm-lock.yaml`，不手动编辑 `Cargo.lock`。
