import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const ROOT = process.cwd();
const mode = process.argv.includes("--mode=check") ? "check" : "audit";

function readCatalogs() {
  const catalogs = new Map();
  for (const locale of ["zh", "en"]) {
    const messages = new Map();
    const directory = path.join(ROOT, "src/i18n/catalogs", locale);
    for (const fileName of fs.readdirSync(directory).filter((name) => name.endsWith(".ts"))) {
      const file = path.join(directory, fileName);
      const source = fs.readFileSync(file, "utf8");
      const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
      function visit(node) {
        if (ts.isVariableDeclaration(node)) {
          const initializer = ts.isAsExpression(node.initializer)
            ? node.initializer.expression
            : node.initializer;
          if (initializer && ts.isObjectLiteralExpression(initializer)) {
            for (const messageProperty of initializer.properties) {
              if (!ts.isPropertyAssignment(messageProperty)) continue;
              const key = messageProperty.name.getText(sourceFile).replaceAll(/["']/g, "");
              const value = ts.isStringLiteralLike(messageProperty.initializer)
                ? messageProperty.initializer.text
                : messageProperty.initializer.getText(sourceFile);
              messages.set(key, value);
            }
          }
        }
        ts.forEachChild(node, visit);
      }
      visit(sourceFile);
    }
    catalogs.set(locale, messages);
  }
  return catalogs;
}

function placeholders(value) {
  return [...value.matchAll(/\{([A-Za-z][A-Za-z0-9_]*)\}/g)]
    .map((match) => match[1])
    .sort();
}

function walk(directory, extensions) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (["node_modules", "dist", "target", "coverage", ".git"].includes(entry.name)) continue;
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...walk(entryPath, extensions));
    else if (extensions.some((extension) => entry.name.endsWith(extension))) files.push(entryPath);
  }
  return files;
}

const allowedUserVisibleLiterals = new Map([
  ["Code Manager", "产品名"],
  ["Claude", "产品名"],
  ["GitHub", "产品名"],
  ["JSON", "协议与数据格式名"],
  ["Skills", "Claude Code 功能名"],
  ["H", "Markdown 标题工具栏符号"],
  ["B", "Markdown 粗体工具栏符号"],
  ["&lt;/&gt;", "代码工具栏符号"],
  ["ms", "毫秒技术单位"],
  ["AI", "通用技术缩写"],
  ["https://api.anthropic.com", "API 地址示例"],
  ["sk-ant-...", "API key 格式示例"],
  ["owner/repo", "GitHub 仓库格式示例"],
  ["team-market", "代码标识示例"],
  ["github", "插件市场 source 类型"],
  ["git", "插件市场 source 类型"],
  ["url", "插件市场 source 类型"],
  ["hostPattern", "插件市场字段名"],
  ["npm", "包管理协议名"],
  ["file", "插件市场 source 类型"],
  ["directory", "插件市场 source 类型"],
  ["team/plugins", "代码路径示例"],
  ["main", "Git 分支名示例"],
  [".claude-plugin/marketplace.json", "配置文件路径示例"],
  ["github.com/*", "主机匹配模式示例"],
  ["@team/claude-marketplace", "npm 包名示例"],
  ["/path/to/marketplace", "目录路径示例"],
  ["/tmp/team-market", "目录路径示例"],
]);

function isUserVisibleLiteral(value) {
  const normalized = value.trim();
  return (
    normalized.length > 0 &&
    /[A-Za-z\u3400-\u9fff]/.test(normalized) &&
    !allowedUserVisibleLiterals.has(normalized)
  );
}

function sourceWarnings(catalogKeys) {
  const warnings = [];
  const files = walk(path.join(ROOT, "src"), [".ts", ".tsx"]);
  for (const file of files) {
    const relative = path.relative(ROOT, file);
    if (
      relative.includes("__tests__") ||
      relative.includes("src/test/") ||
      relative.endsWith(".test.ts") ||
      relative.endsWith(".test.tsx")
    ) {
      continue;
    }
    const source = fs.readFileSync(file, "utf8");
    const lines = source.split(/\r?\n/);
    lines.forEach((line, index) => {
      if (/\bt\([^\n]+\)\.replace\(\s*["']\{/.test(line)) {
        warnings.push({ file: relative, line: index + 1, message: "翻译结果仍使用手工占位符替换" });
      }
      if (
        relative !== "src/i18n/format.ts" &&
        /(?:Intl\.(?:NumberFormat|DateTimeFormat)|\.toLocale(?:String|DateString|TimeString))\(\s*["'](?:en-US|zh-CN)["']/.test(
          line,
        )
      ) {
        warnings.push({ file: relative, line: index + 1, message: "显示格式使用固定 locale" });
      }
      if (/\.toLocaleString\(\s*\)/.test(line)) {
        warnings.push({ file: relative, line: index + 1, message: "显示格式依赖运行时默认 locale" });
      }
    });

    const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    function addNodeWarning(node, message) {
      const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
      warnings.push({ file: relative, line: position.line + 1, message });
    }
    function visit(node) {
      if (
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === "t" &&
        ts.isStringLiteralLike(node.arguments[0]) &&
        !catalogKeys.has(node.arguments[0].text)
      ) {
        addNodeWarning(node.arguments[0], `使用了未定义词条: ${node.arguments[0].text}`);
      }
      if (ts.isJsxText(node) && isUserVisibleLiteral(node.text)) {
        addNodeWarning(node, `用户可见 JSX 文本未走 i18n: ${node.text.trim()}`);
      }
      if (
        ts.isJsxAttribute(node) &&
        ["aria-label", "label", "placeholder", "title"].includes(node.name.getText(sourceFile)) &&
        node.initializer &&
        ts.isStringLiteralLike(node.initializer) &&
        isUserVisibleLiteral(node.initializer.text)
      ) {
        addNodeWarning(node, `用户可见属性未走 i18n: ${node.initializer.text}`);
      }
      ts.forEachChild(node, visit);
    }
    visit(sourceFile);
  }

  const rustFiles = walk(path.join(ROOT, "src-tauri", "src"), [".rs"]);
  for (const file of rustFiles) {
    const relative = path.relative(ROOT, file);
    const source = fs.readFileSync(file, "utf8");
    const lines = source.split(/\r?\n/);
    for (const match of source.matchAll(/#\[tauri::command\][\s\S]*?\{/g)) {
      if (!/->\s*Result</.test(match[0]) || !/,\s*String>/.test(match[0])) continue;
      const line = source.slice(0, match.index).split(/\r?\n/).length;
      warnings.push({ file: relative, line, message: "Tauri command 仍返回字符串错误" });
    }
    if (relative.endsWith("native_i18n.rs")) continue;
    lines.forEach((line, index) => {
      const match = line.match(/\.(?:title|body|tooltip)\(\s*"([^"]+)"/);
      if (match && isUserVisibleLiteral(match[1])) {
        warnings.push({
          file: relative,
          line: index + 1,
          message: `原生用户文案未集中管理: ${match[1]}`,
        });
      }
    });
  }
  return warnings;
}

const catalogs = readCatalogs();
const zh = catalogs.get("zh") ?? new Map();
const en = catalogs.get("en") ?? new Map();
const missingEn = [...zh.keys()].filter((key) => !en.has(key));
const missingZh = [...en.keys()].filter((key) => !zh.has(key));
const placeholderMismatches = [...zh.keys()].filter(
  (key) =>
    en.has(key) &&
    JSON.stringify(placeholders(zh.get(key))) !== JSON.stringify(placeholders(en.get(key))),
);
const warnings = sourceWarnings(new Set([...zh.keys(), ...en.keys()]));

console.log(`catalogs: zh=${zh.size} en=${en.size}`);
console.log(`missing keys: zh=${missingZh.length} en=${missingEn.length}`);
console.log(`placeholder mismatches: ${placeholderMismatches.length}`);
console.log(`source warnings: ${warnings.length}`);

for (const warning of warnings) {
  const text = `${warning.file}:${warning.line}: ${warning.message}`;
  if (process.env.GITHUB_ACTIONS === "true") {
    console.log(`::warning file=${warning.file},line=${warning.line}::${warning.message}`);
  } else {
    console.log(text);
  }
}

const catalogErrors = missingEn.length + missingZh.length + placeholderMismatches.length;
if (catalogErrors > 0 || (mode === "check" && warnings.length > 0)) {
  process.exitCode = 1;
}
