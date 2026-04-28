import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { I18nProvider, useI18n } from "./i18n";

function setSystemLanguages(languages: string[]) {
  Object.defineProperty(navigator, "languages", {
    value: languages,
    configurable: true,
  });
  Object.defineProperty(navigator, "language", {
    value: languages[0] ?? "",
    configurable: true,
  });
}

function LanguageProbe() {
  const { t } = useI18n();
  return <span>{t("header.settings")}</span>;
}

function renderProbe() {
  render(
    <I18nProvider>
      <LanguageProbe />
    </I18nProvider>,
  );
}

describe("I18nProvider", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("defaults to chinese when the system language is chinese", () => {
    setSystemLanguages(["zh-CN"]);

    renderProbe();

    expect(screen.getByText("设置")).toBeInTheDocument();
  });

  it("defaults to english when the system language is not chinese", () => {
    setSystemLanguages(["en-US"]);

    renderProbe();

    expect(screen.getByText("Settings")).toBeInTheDocument();
  });
});
