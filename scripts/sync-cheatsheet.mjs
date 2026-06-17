#!/usr/bin/env node
// 速查表内容再生成脚本。
//
// 用途：抓取 https://cc.storyfox.cz 的 Claude Code 速查表（英文根路径 / 与中文 /zh/），
// 提取为本地 markdown，供 CheatSheetPage 通过 Vite `?raw` 导入并用 MarkdownPreview 渲染。
//
// 何时重跑：源站是「活文档」，跟随 Claude Code 版本更新。当需要把速查表刷新到最新版时，
// 运行 `make sync-cheatsheet`（或 `node scripts/sync-cheatsheet.mjs`），然后提交两个 .md 的变更。
//
// 零依赖：仅用 Node 内置 fetch 与正则；源站是结构规整的单文件静态 HTML，无需 DOM 解析库。

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), "../src/components/cheat-sheet");

// 每个 locale 的源 URL、输出文件名、标题与表头文案
const LOCALES = [
  {
    lang: "zh",
    url: "https://cc.storyfox.cz/zh/",
    out: "cheatsheet.zh.md",
    title: "Claude Code 速查表",
    tableHead: "| 按键 / 命令 | 说明 |\n| --- | --- |",
    attribution:
      "> 来源：[Claude Code Cheat Sheet](https://cc.storyfox.cz/zh/) · Made by [@phasE89](https://x.com/phasE89) · 本页为内容快照，最新版请访问原站。",
  },
  {
    lang: "en",
    url: "https://cc.storyfox.cz/",
    out: "cheatsheet.en.md",
    title: "Claude Code Cheat Sheet",
    tableHead: "| Key / Command | Description |\n| --- | --- |",
    attribution:
      "> Source: [Claude Code Cheat Sheet](https://cc.storyfox.cz/) · Made by [@phasE89](https://x.com/phasE89) · This page is a content snapshot; visit the source for the latest version.",
  },
];

// 解码常见 HTML 实体
function decodeEntities(text) {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

// 去标签并归一空白；先把 NEW 徽标替换为 (NEW) 标记
function stripTags(html) {
  const withBadge = html.replace(/<span class="badge-new"[^>]*>.*?<\/span>/gs, " (NEW)");
  return decodeEntities(withBadge.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
}

// 表格单元格转义：GFM 表格中（含 code span 内）的 | 必须写成 \| 才不会被当作列分隔符
function escapeCell(text) {
  return text.replace(/\|/g, "\\|");
}

// 把文本包成内联 code span：围栏长度比内容中最长连续反引号多 1，内容含反引号时两侧补空格
function codeSpan(text) {
  const escaped = escapeCell(text);
  const longestRun = (escaped.match(/`+/g) ?? []).reduce((max, run) => Math.max(max, run.length), 0);
  const fence = "`".repeat(longestRun + 1);
  const pad = escaped.includes("`") ? " " : "";
  return `${fence}${pad}${escaped}${pad}${fence}`;
}

// 从 .key span 提取按键：多个 keycap 用 + 连接，否则取纯文本
function parseKey(keyHtml) {
  const caps = [...keyHtml.matchAll(/<span class="keycap">(.*?)<\/span>/gs)].map((m) =>
    decodeEntities(m[1]).trim(),
  );
  if (caps.length > 0) {
    return caps.join(" + ");
  }
  return stripTags(keyHtml.replace(/<span class="key">/, ""));
}

// 解析单个 row：用 desc 标记切分，避开 key 内嵌套 span 导致的非贪婪截断
function parseRow(inner) {
  const marker = '<span class="desc">';
  const i = inner.indexOf(marker);
  if (i === -1) {
    return [stripTags(inner), ""];
  }
  return [parseKey(inner.slice(0, i)), stripTags(inner.slice(i + marker.length))];
}

function renderSection(body, tableHead) {
  const out = [];
  const header = body.match(/<div class="section-header">(.*?)<\/div>/s);
  if (header) {
    out.push(`## ${stripTags(header[1])}\n`);
  }

  // 按文档顺序依次处理 sub-header 与 row，遇到 sub-header 时先冲刷当前表格
  let rows = [];
  const flush = () => {
    if (rows.length === 0) return;
    // 源站偶尔把一条目拆成「只有 key 的行」+「紧跟只有 desc 的行」，合并回单条
    const merged = [];
    for (let i = 0; i < rows.length; i += 1) {
      const [key, desc] = rows[i];
      if (desc === "" && i + 1 < rows.length && rows[i + 1][0] === "") {
        merged.push([key, rows[i + 1][1]]);
        i += 1;
      } else {
        merged.push([key, desc]);
      }
    }
    out.push(tableHead);
    for (const [key, desc] of merged) {
      out.push(`| ${codeSpan(key)} | ${escapeCell(desc)} |`);
    }
    out.push("");
    rows = [];
  };

  const tokenRe = /<div class="sub-header">(.*?)<\/div>|<div class="row">(.*?)<\/div>/gs;
  for (const m of body.matchAll(tokenRe)) {
    if (m[1] !== undefined) {
      flush();
      out.push(`### ${stripTags(m[1])}\n`);
    } else {
      rows.push(parseRow(m[2]));
    }
  }
  flush();
  return out.join("\n");
}

// footer 里带 label 的行（权限模式、更多环境变量）提升为独立 h2 段落，避免丢内容
function renderFooter(html) {
  const footer = html.match(/<footer class="footer">(.*?)<\/footer>/s);
  if (!footer) return "";
  const out = [];
  for (const row of footer[1].matchAll(/<div class="footer-row"[^>]*>(.*?)<\/div>/gs)) {
    const labelMatch = row[1].match(/<span class="footer-label">(.*?)<\/span>/s);
    if (!labelMatch) continue; // 跳过纯署名行，署名统一走 attribution
    out.push(`## ${stripTags(labelMatch[1]).replace(/[:：]\s*$/, "")}\n`);
    for (const item of row[1].matchAll(/<span class="footer-item">(.*?)<\/span>/gs)) {
      const code = item[1].match(/<code>(.*?)<\/code>/s);
      const rest = stripTags(item[1].replace(/<code>.*?<\/code>/s, ""));
      const key = code ? decodeEntities(code[1]).trim() : "";
      out.push(`- ${codeSpan(key)}${rest ? ` — ${escapeCell(rest)}` : ""}`);
    }
    out.push("");
  }
  return out.join("\n");
}

function htmlToMarkdown(html, locale) {
  const parts = [`# ${locale.title}\n`];

  const version = html.match(/<div class="version-info">(.*?)<\/div>/s);
  const updated = html.match(/<div class="last-updated">(.*?)<\/div>/s);
  const meta = [version && stripTags(version[1]), updated && stripTags(updated[1])].filter(Boolean);
  if (meta.length > 0) {
    parts.push(`> ${meta.join(" · ")}\n`);
  }

  for (const section of html.matchAll(/<section class="section [^"]*">(.*?)<\/section>/gs)) {
    parts.push(renderSection(section[1], locale.tableHead));
  }

  const footer = renderFooter(html);
  if (footer) {
    parts.push(footer);
  }

  parts.push(locale.attribution);
  // 折叠多余空行，结尾保留单个换行
  return `${parts.join("\n").replace(/\n{3,}/g, "\n\n").trim()}\n`;
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  for (const locale of LOCALES) {
    const res = await fetch(locale.url, { headers: { "user-agent": "ai-manager-cheatsheet-sync" } });
    if (!res.ok) {
      throw new Error(`抓取失败 ${locale.url}: HTTP ${res.status}`);
    }
    const html = await res.text();
    const markdown = htmlToMarkdown(html, locale);
    const outPath = join(OUT_DIR, locale.out);
    await writeFile(outPath, markdown, "utf8");
    console.log(`✓ ${locale.out} (${markdown.length} bytes) ← ${locale.url}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
