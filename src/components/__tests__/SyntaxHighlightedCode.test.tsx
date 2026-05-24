import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import SyntaxHighlightedCode from "../SyntaxHighlightedCode";

describe("SyntaxHighlightedCode", () => {
  it("renders registered languages through the syntax highlighter", () => {
    const { container } = render(
      <SyntaxHighlightedCode code="const value = 1;" language="typescript" themeType="light" />,
    );

    const highlightedCode = container.querySelector("pre code");
    expect(highlightedCode).not.toBeNull();
    expect(highlightedCode).toHaveTextContent("const value = 1;");
  });

  it("falls back to a plain code block for unknown languages", () => {
    render(
      <SyntaxHighlightedCode
        code="unknown syntax"
        language="not-a-real-language"
        themeType="dark"
      />,
    );

    const code = screen.getByText("unknown syntax");
    expect(code.tagName).toBe("CODE");
    expect(code.closest("pre")).not.toBeNull();
  });
});
