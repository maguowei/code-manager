import type { CSSProperties, HTMLProps } from "react";
import bash from "react-syntax-highlighter/dist/esm/languages/prism/bash";
import c from "react-syntax-highlighter/dist/esm/languages/prism/c";
import cpp from "react-syntax-highlighter/dist/esm/languages/prism/cpp";
import css from "react-syntax-highlighter/dist/esm/languages/prism/css";
import go from "react-syntax-highlighter/dist/esm/languages/prism/go";
import java from "react-syntax-highlighter/dist/esm/languages/prism/java";
import javascript from "react-syntax-highlighter/dist/esm/languages/prism/javascript";
import json from "react-syntax-highlighter/dist/esm/languages/prism/json";
import jsx from "react-syntax-highlighter/dist/esm/languages/prism/jsx";
import kotlin from "react-syntax-highlighter/dist/esm/languages/prism/kotlin";
import markdown from "react-syntax-highlighter/dist/esm/languages/prism/markdown";
import markup from "react-syntax-highlighter/dist/esm/languages/prism/markup";
import php from "react-syntax-highlighter/dist/esm/languages/prism/php";
import python from "react-syntax-highlighter/dist/esm/languages/prism/python";
import r from "react-syntax-highlighter/dist/esm/languages/prism/r";
import ruby from "react-syntax-highlighter/dist/esm/languages/prism/ruby";
import rust from "react-syntax-highlighter/dist/esm/languages/prism/rust";
import scss from "react-syntax-highlighter/dist/esm/languages/prism/scss";
import sql from "react-syntax-highlighter/dist/esm/languages/prism/sql";
import swift from "react-syntax-highlighter/dist/esm/languages/prism/swift";
import toml from "react-syntax-highlighter/dist/esm/languages/prism/toml";
import tsx from "react-syntax-highlighter/dist/esm/languages/prism/tsx";
import typescript from "react-syntax-highlighter/dist/esm/languages/prism/typescript";
import yaml from "react-syntax-highlighter/dist/esm/languages/prism/yaml";
import PrismLight from "react-syntax-highlighter/dist/esm/prism-light";
import oneLight from "react-syntax-highlighter/dist/esm/styles/prism/one-light";
import vscDarkPlus from "react-syntax-highlighter/dist/esm/styles/prism/vsc-dark-plus";

const REGISTERED_LANGUAGES = {
  bash,
  c,
  cpp,
  css,
  go,
  java,
  javascript,
  json,
  jsx,
  kotlin,
  markdown,
  markup,
  php,
  python,
  r,
  ruby,
  rust,
  scss,
  sql,
  swift,
  toml,
  tsx,
  typescript,
  yaml,
} as const;

const LANGUAGE_ALIASES: Record<string, keyof typeof REGISTERED_LANGUAGES> = {
  html: "markup",
  js: "javascript",
  md: "markdown",
  mdx: "markdown",
  rs: "rust",
  sh: "bash",
  shell: "bash",
  ts: "typescript",
  xml: "markup",
  yml: "yaml",
  zsh: "bash",
};

const SUPPORTED_LANGUAGES = new Set<string>([
  ...Object.keys(REGISTERED_LANGUAGES),
  ...Object.keys(LANGUAGE_ALIASES),
]);

for (const [language, loader] of Object.entries(REGISTERED_LANGUAGES)) {
  PrismLight.registerLanguage(language, loader);
}

interface SyntaxHighlightedCodeProps {
  code: string;
  language?: string;
  themeType: "light" | "dark";
  className?: string;
  customStyle?: CSSProperties;
  codeTagProps?: HTMLProps<HTMLElement>;
  lineNumberStyle?: CSSProperties;
  showLineNumbers?: boolean;
  wrapLongLines?: boolean;
}

function normalizeLanguage(language: string | undefined) {
  const normalized = language?.trim().toLowerCase();
  if (!normalized || !SUPPORTED_LANGUAGES.has(normalized)) {
    return null;
  }
  return LANGUAGE_ALIASES[normalized] ?? normalized;
}

function SyntaxHighlightedCode({
  code,
  language,
  themeType,
  className,
  customStyle,
  codeTagProps,
  lineNumberStyle,
  showLineNumbers,
  wrapLongLines,
}: SyntaxHighlightedCodeProps) {
  const normalizedLanguage = normalizeLanguage(language);

  if (!normalizedLanguage) {
    return (
      <pre className={className} style={customStyle}>
        <code {...codeTagProps}>{code}</code>
      </pre>
    );
  }

  return (
    <PrismLight
      className={className}
      language={normalizedLanguage}
      style={themeType === "dark" ? vscDarkPlus : oneLight}
      customStyle={customStyle}
      codeTagProps={codeTagProps}
      lineNumberStyle={lineNumberStyle}
      showLineNumbers={showLineNumbers}
      wrapLongLines={wrapLongLines}
    >
      {code}
    </PrismLight>
  );
}

export default SyntaxHighlightedCode;
