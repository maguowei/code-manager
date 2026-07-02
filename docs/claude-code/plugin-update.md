# Claude Code 插件更新

> 本文覆盖 Claude Code 插件（plugins）的版本更新方式，面向使用 code-manager 的开发者与用户。这里记录的是 Claude Code 工具本身的操作参考，`docs/claude-code/` 子目录用于沉淀同类笔记。

## 更新单个插件

CLI 命令：

```bash
claude plugin update <插件名>@<marketplace 名>

# 示例
claude plugin update commit-commands@claude-plugins-official
```

或使用交互式菜单：`/plugin` → **Installed** 标签页 → 选中插件 → 进入详情选择更新。

## 更新所有已启用插件

没有单条「更新全部」命令，但有两种批量方式。

### 方式 A：更新 marketplace（推荐，立刻生效）

```bash
/plugin marketplace update <marketplace 名>

# 示例
/plugin marketplace update claude-plugins-official
```

这会刷新该 marketplace 的插件目录，并把其中**已安装的插件**一并升级到最新版。有更新时会提示运行 `/reload-plugins` 生效。

如果装了多个 marketplace，先用 `/plugin marketplace list` 看清有哪些，再对每个执行一次 update。

### 方式 B：开启自动更新（一劳永逸）

启用后每次启动 Claude Code 会自动刷新目录并升级插件。

- 交互式：`/plugin` → **Marketplaces** 标签页 → 选中 marketplace → Enable auto-update。
- 配置式（`.claude/settings.json`）：

```json
{
  "extraKnownMarketplaces": {
    "my-marketplace": {
      "source": { "source": "github", "repo": "org/plugins" },
      "autoUpdate": true
    }
  }
}
```

官方 Anthropic marketplace 默认开启自动更新；第三方和本地 marketplace 默认关闭。

## 相关命令速查

| 命令 | 用途 |
| --- | --- |
| `/plugin` | 打开交互式插件管理器 |
| `/plugin marketplace list` | 列出所有已添加的 marketplace |
| `/plugin marketplace update <name>` | 刷新指定 marketplace 目录并升级已装插件 |
| `claude plugin update <name>@<marketplace>` | 更新单个插件（CLI） |
| `/reload-plugins` | 安装/更新后重新加载插件 |

## 补充

- `DISABLE_AUTOUPDATER=1`：禁用所有自动更新。
- `FORCE_AUTOUPDATE_PLUGINS=1`：仅保留插件自动更新。

## 参考

- [Discover and install plugins](https://code.claude.com/docs/en/discover-plugins.md)
- [Plugins reference](https://code.claude.com/docs/en/plugins-reference.md)
