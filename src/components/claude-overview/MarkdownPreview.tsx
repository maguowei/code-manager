import { openUrl } from "@tauri-apps/plugin-opener";
import type { ReactNode } from "react";
import { memo, useMemo } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneLight, vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import remarkGfm from "remark-gfm";

// 模块级常量，所有实例共享，避免每次渲染重建
const REMARK_PLUGINS = [remarkGfm];

interface MarkdownPreviewProps {
  content: string;
  themeType: "light" | "dark";
  className?: string;
}

// 仅允许 http/https 图片，避免桌面应用泄露本地路径或加载未知协议
function isSafeImageSrc(src: string | undefined): src is string {
  if (!src) return false;
  return /^https?:\/\//i.test(src);
}

// 外链点击在系统浏览器打开，避免在桌面应用 webview 内跳转脱壳
function isExternalHref(href: string | undefined): href is string {
  if (!href) return false;
  return /^https?:\/\//i.test(href);
}

function MarkdownPreviewBase({ content, themeType, className }: MarkdownPreviewProps) {
  const components = useMemo<Components>(() => {
    const codeStyle = themeType === "dark" ? vscDarkPlus : oneLight;

    return {
      // 代码块：带 language-* 类名走语法高亮，inline code 保持普通 <code>
      code({ className: codeClassName, children, ...rest }) {
        const match = /language-(\w+)/.exec(codeClassName ?? "");
        const code = String(children ?? "").replace(/\n$/, "");
        if (match) {
          return (
            <SyntaxHighlighter
              language={match[1]}
              style={codeStyle}
              customStyle={{
                margin: 0,
                borderRadius: "var(--radius-sm, 6px)",
                fontSize: "var(--font-xs, 12px)",
              }}
              wrapLongLines={false}
            >
              {code}
            </SyntaxHighlighter>
          );
        }
        return (
          <code className={codeClassName} {...rest}>
            {children}
          </code>
        );
      },
      // 外链拦截：通过 plugin-opener 在系统浏览器打开
      a({ href, children, ...rest }) {
        const target = isExternalHref(href) ? "_blank" : undefined;
        const rel = target ? "noreferrer noopener" : undefined;
        return (
          <a
            href={href}
            target={target}
            rel={rel}
            onClick={(event) => {
              if (!isExternalHref(href)) {
                return;
              }
              event.preventDefault();
              void openUrl(href);
            }}
            {...rest}
          >
            {children}
          </a>
        );
      },
      // 图片白名单：仅 http/https 渲染 <img>，其它降级成 alt 文本
      img({ src, alt, ...rest }) {
        if (typeof src === "string" && isSafeImageSrc(src)) {
          return <img src={src} alt={alt ?? ""} {...rest} />;
        }
        return <span className="markdown-preview-image-fallback">{alt ?? ""}</span>;
      },
    } satisfies Components;
  }, [themeType]);

  const rootClassName = className ? `markdown-body ${className}` : "markdown-body";

  return (
    <article className={rootClassName} data-color-mode={themeType}>
      <ReactMarkdown remarkPlugins={REMARK_PLUGINS} components={components}>
        {content}
      </ReactMarkdown>
    </article>
  );
}

const MarkdownPreview = memo(MarkdownPreviewBase) as (props: MarkdownPreviewProps) => ReactNode;

export default MarkdownPreview;
