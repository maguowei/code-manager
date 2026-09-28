#!/usr/bin/env node
// 文档一致性检查：面向人类的 Markdown 文档（README 与 docs/）。
//
// 检查项：
// 1. 相对链接与图片指向的文件存在，`#锚点` 能在目标文档的标题中找到（按 GitHub 规则生成 slug）。
// 2. 中英文成对文档的各级标题数量一致，且都带语言切换行。
// 3. 行内代码中引用的仓库路径（src/、src-tauri/、docs/、scripts/、.github/、.claude/ 开头）存在。
//
// 零依赖，只读，不修改文件；运行：`make docs-check`。

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, normalize, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BILINGUAL_PAIRS = [
  ["README.md", "README.zh-CN.md"],
  ["docs/user-manual.md", "docs/user-manual.zh-CN.md"],
  ["docs/platform-support.md", "docs/platform-support.zh-CN.md"],
];
const REPO_PATH_PREFIXES = ["src/", "src-tauri/", "docs/", "scripts/", ".github/", ".claude/"];

function listMarkdown(dir) {
  return readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((entry) => {
    const rel = join(dir, entry.name);
    if (entry.isDirectory()) return listMarkdown(rel);
    return entry.name.endsWith(".md") ? [rel] : [];
  });
}

// 去掉围栏代码块，避免把示例代码里的内容当成链接或标题
function stripFences(text) {
  return text.replace(/^```[\s\S]*?^```/gm, "");
}

function headings(text) {
  return stripFences(text)
    .split("\n")
    .filter((line) => /^#{1,6}\s/.test(line))
    .map((line) => ({ level: line.match(/^#+/)[0].length, title: line.replace(/^#+\s*/, "") }));
}

// GitHub 标题锚点：转小写、去掉标点（保留字母数字、下划线、连字符、空格与中日韩字符）、空格转连字符；重名追加 -1、-2
function anchorsOf(text) {
  const seen = new Map();
  const anchors = new Set();
  for (const { title } of headings(text)) {
    const base = title
      .replace(/`/g, "")
      .toLowerCase()
      .replace(/[^\p{L}\p{N}_\- ]/gu, "")
      .replace(/ /g, "-");
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    anchors.add(count === 0 ? base : `${base}-${count}`);
  }
  return anchors;
}

const errors = [];
const files = ["README.md", "README.zh-CN.md", ...listMarkdown("docs")];
const anchorCache = new Map();
const readAnchors = (file) => {
  if (!anchorCache.has(file)) anchorCache.set(file, anchorsOf(readFileSync(join(ROOT, file), "utf8")));
  return anchorCache.get(file);
};

for (const file of files) {
  const text = stripFences(readFileSync(join(ROOT, file), "utf8"));

  for (const [, target] of text.matchAll(/\]\(([^)\s]+)\)/g)) {
    if (/^[a-z]+:/i.test(target)) continue;
    const [pathPart, anchor] = target.split("#");
    const resolved = pathPart ? normalize(join(dirname(file), decodeURI(pathPart))) : file;
    if (!existsSync(join(ROOT, resolved))) {
      errors.push(`${file}: 链接目标不存在 ${target}`);
    } else if (anchor && resolved.endsWith(".md") && !readAnchors(resolved).has(decodeURI(anchor))) {
      errors.push(`${file}: 锚点不存在 ${target}`);
    }
  }

  for (const [, code] of text.matchAll(/`([^`\n]+)`/g)) {
    if (!REPO_PATH_PREFIXES.some((prefix) => code.startsWith(prefix))) continue;
    if (/[*<>{}\s]/.test(code)) continue;
    // 构建产物目录在干净 checkout（如 CI）中不存在，不做存在性校验
    if (code.startsWith("src-tauri/target/")) continue;
    // 去掉 `::symbol` 与 `:行号` 后缀
    const path = code.replace(/::.*$/, "").replace(/:\d+(-\d+)?$/, "");
    if (!existsSync(join(ROOT, path))) errors.push(`${file}: 引用的路径不存在 ${code}`);
  }
}

for (const [en, zh] of BILINGUAL_PAIRS) {
  const enText = readFileSync(join(ROOT, en), "utf8");
  const zhText = readFileSync(join(ROOT, zh), "utf8");
  const enLevels = headings(enText).map((h) => h.level).join(",");
  const zhLevels = headings(zhText).map((h) => h.level).join(",");
  if (enLevels !== zhLevels) errors.push(`${en} 与 ${zh} 的标题结构不一致`);
  for (const [file, text] of [
    [en, enText],
    [zh, zhText],
  ]) {
    const other = relative(dirname(file), file === en ? zh : en);
    if (!text.includes(`](./${other})`)) errors.push(`${file}: 缺少指向 ${other} 的语言切换链接`);
  }
}

if (errors.length > 0) {
  console.error(`docs-check 发现 ${errors.length} 个问题：`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}
console.log(`docs-check 通过：检查了 ${files.length} 个 Markdown 文件。`);
