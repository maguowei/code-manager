---
name: release-new-version
description: 手动触发的发版技能。仅在用户主动输入 `/release-new-version` 命令时调用，模型不得自动调用此技能。
disable-model-invocation: true
---

# Release Skill

给定版本号，自动完成完整发布流程：更新版本文件 → 提交 → 生成 release notes → 打 annotated git tag（附带完整变更日志）→ push。

## 工作流

接收版本号（如 `0.17.0` 或 `v0.17.0`），可选接收对比基准版本（如 `from v0.15.0`、`base=v0.15.0`、`对比 v0.15.0`）。若未提供基准，自动取前一个 SemVer tag。按顺序执行以下步骤：

### 步骤 1：规范化版本号

去掉前缀 `v`，使用纯 semver 格式（如 `0.17.0`）进行后续操作。

### 步骤 2：更新版本文件

**⏸️ 用户确认点**：展示将要更新的版本号（如 `0.17.0`），提示用户确认是否继续。用户确认后再执行。

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

**⏸️ 用户确认点**：展示将要提交的文件列表和 commit message，提示用户确认。用户确认后再执行。

仅暂存版本相关文件，提交：

```bash
git add src-tauri/tauri.conf.json package.json src-tauri/Cargo.toml src-tauri/Cargo.lock
git commit -m "chore(release): bump version to {VERSION}"
```

### 步骤 5：确定对比基准 tag

确定用于生成 release notes 的基准版本，规则如下：

1. **用户显式指定优先**：若用户消息中包含基准版本（如 `from v0.15.0`、`base=v0.15.0`、`对比 v0.15.0`），将其规范化为 `vX.Y.Z` 格式后直接使用。
2. **自动推断**：否则执行以下命令获取上一个 tag：
   ```bash
   git tag --sort=-v:refname | grep -v "^v{VERSION}$" | head -1
   ```
3. **首次发布**：若仓库无任何历史 tag，将基准设为 `INITIAL`，release notes 标题写 "Initial release"。

校验基准 tag 是否真实存在（`git rev-parse {BASE_TAG}` 不报错）；不存在则中止并询问用户。

### 步骤 6：生成 release notes 并写入临时文件

执行以下流程生成结构化变更日志：

#### 6.1 收集 commits

```bash
git log --pretty=format:'%h %s' {BASE_TAG}..HEAD
```

若基准为 `INITIAL`，改用 `git log --pretty=format:'%h %s'`（取全部历史）。

#### 6.2 过滤噪音 commit

移除匹配 `chore(release): bump version to` 的行（版本升级 commit 本身）。

#### 6.3 按 Conventional Commits 类型归类

将剩余 commit 按以下前缀分组，无对应类型则省略该段：

| 类型前缀                  | 中文标题   |
|--------------------------|-----------|
| `feat`                   | 新功能     |
| `fix`                    | 缺陷修复   |
| `perf`                   | 性能优化   |
| `refactor`               | 重构       |
| `docs`                   | 文档       |
| `test`                   | 测试       |
| `build` / `ci`           | 构建与 CI  |
| `chore` / `style` / 其他 | 其他       |

同类型内按原始 commit 顺序排列（即时间从早到晚）。

#### 6.4 解析 GitHub compare URL

```bash
git remote get-url origin
```

同时兼容两种格式：
- `git@github.com:owner/repo.git` → `https://github.com/owner/repo/compare/{BASE_TAG}...v{VERSION}`
- `https://github.com/owner/repo.git` → 同上

无法解析则省略 compare 链接行。

#### 6.5 写入临时文件

将生成的 release notes 写入临时文件，模板如下（当基准为 INITIAL 时省略「对比基准」和「完整变更」行）：

```markdown
Release v{VERSION} ({YYYY-MM-DD})

对比基准：{BASE_TAG}

## 新功能
- feat(xxx): ... ({short_sha})

## 缺陷修复
- fix(xxx): ... ({short_sha})

（其他类型按需出现，无该类型则省略整段）

完整变更：https://github.com/{owner}/{repo}/compare/{BASE_TAG}...v{VERSION}
```

**⏸️ 用户确认点**：展示生成的完整 release notes 内容，提示用户审核。用户确认后才写入临时文件。

使用 `mktemp` 创建临时文件，将上述内容写入其中，记录文件路径为 `$NOTES_FILE`。

### 步骤 7：打 annotated tag 并推送

**⏸️ 用户确认点**：提示用户即将执行不可逆操作（打 tag + push），展示即将执行的命令摘要，请求最终确认。用户确认后才执行 push。

```bash
git tag -a v{VERSION} -F "$NOTES_FILE"
git push origin HEAD
git push origin v{VERSION}
rm -f "$NOTES_FILE"
```

### 步骤 8：完成确认

- 汇报已完成的步骤，展示生成的 release notes 内容（供用户确认）。
- 提示用户：tag 推送后 GitHub Actions 的 release 工作流将自动触发，构建产物文件名将使用正确的版本号。
- 提示：GitHub Release 页面的默认 body 仍是 `release.yml` 中的占位文案「查看 Assets 下载并安装此版本」。若希望 Release 页直接展示此 notes，可后续修改 `release.yml` 的 `releaseBody` 改为从 tag message 读取。

## 注意事项

- 版本文件中始终使用纯 semver（如 `0.17.0`），只有 git tag 才加 `v` 前缀（`v0.17.0`）。
- **tag 必须用 annotated（`-a`）**，lightweight tag 不会保存 message，`git show v{VERSION}` 将看不到变更内容。
- 对比基准 tag 必须真实存在（通过 `git rev-parse` 校验），不存在则中止并询问用户确认。
- 当 `{BASE_TAG}..HEAD` 区间无 commit 时（少见，如重打 tag），release notes 为空，需提示用户确认是否继续。
- 执行前检查工作区是否有未提交的无关变更，若有则先提示用户。
- 不手动修改 `pnpm-lock.yaml`，不手动编辑 `Cargo.lock`。
