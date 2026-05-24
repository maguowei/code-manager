declare module "react-syntax-highlighter/dist/esm/prism-light" {
  import type * as React from "react";
  import type { SyntaxHighlighterProps } from "react-syntax-highlighter";

  export default class SyntaxHighlighter extends React.Component<SyntaxHighlighterProps> {
    static registerLanguage(name: string, func: unknown): void;
  }
}

declare module "react-syntax-highlighter/dist/esm/languages/prism/*" {
  const language: unknown;
  export default language;
}

declare module "react-syntax-highlighter/dist/esm/styles/prism/*" {
  import type * as React from "react";

  const style: { [key: string]: React.CSSProperties };
  export default style;
}
