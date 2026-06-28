# Code Manager 项目主页

`site/` 是 Code Manager 的**零构建静态主页**：纯 HTML + 手写 CSS + 少量原生 JS，没有任何构建步骤或 Node 依赖。直接把这个目录当作静态站点根目录托管即可。

## 目录结构

```
site/
├── index.html              # 单页落地页（中英双语，可切换主题）
├── .nojekyll               # 让 GitHub Pages 跳过 Jekyll，原样发布静态文件
├── README.md               # 本文件
└── assets/
    ├── css/styles.css      # 全部样式（CSS 变量驱动明暗主题）
    ├── js/app.js           # 语言/主题切换、导航高亮、年份
    └── img/                # logo、favicon、架构图 SVG
```

设计要点：

- **双语**：靠 `[data-lang="zh"]` / `[data-lang="en"]` + `html[lang]` 选择器切换，无需 JS 字典；默认按浏览器语言，选择持久化到 `localStorage`。
- **主题**：浅/深通过 `[data-theme]` 切换，`<head>` 内联脚本提前定调避免闪烁。
- **相对路径**：所有资源走相对路径（`assets/...`），既能部署在域名根目录（Cloudflare 自定义域名），也能部署在子路径（GitHub Pages 项目站 `…/<repo>/`）。

本地预览（任选其一）：

```bash
cd site && python3 -m http.server 8080   # 然后访问 http://localhost:8080
# 或
npx serve site
```

## 部署到 GitHub Pages（已配置自动化）

仓库已内置 `.github/workflows/deploy-site.yml`：当 `site/**` 变更并推送到 `main` 时，自动把 `site/` 发布到 GitHub Pages。

一次性准备：

1. 打开仓库 **Settings → Pages**。
2. **Build and deployment → Source** 选择 **GitHub Actions**。
3. 推送一次 `site/` 改动（或在 Actions 页手动 `Run workflow`）即可。

发布地址通常为 `https://<user>.github.io/<repo>/`。
> 本仓库已公开，GitHub Pages 免费可用。

## 部署到 Cloudflare Pages

因为是零构建静态站点，Cloudflare Pages 无需任何构建命令：

1. Cloudflare 控制台 → **Workers & Pages → Create → Pages → Connect to Git**，选择本仓库。
2. 构建设置：
   - **Framework preset**：`None`
   - **Build command**：留空（或 `exit 0`）
   - **Build output directory**：`site`
3. 保存并部署。后续每次推送自动发布，可在 **Custom domains** 绑定自有域名。

也可以用 Wrangler 直接上传，无需连 Git：

```bash
npx wrangler pages deploy site --project-name code-manager
```

## 更新内容

- 文案：直接改 `index.html`，中英文成对出现（`data-lang="zh"` / `data-lang="en"`），改动时记得两种语言同步。
- 版本号：`index.html` 内 hero 徽标处的 `v0.20.1` 需与 `package.json` 等三处版本保持一致。
- 下载链接：指向 `releases/latest`；仓库已公开，正式发布 Release 后链接即自动解析到对应平台安装包。
- 架构图：来源于仓库根目录 `diagram/code-manager-architecture/`，更新后重新复制到 `assets/img/`。
