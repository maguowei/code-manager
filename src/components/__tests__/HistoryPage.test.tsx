import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../../i18n";
import type { HistoryEntry } from "../../types";
import HistoryPage from "../HistoryPage";

const PROJECT_ALPHA = "/Users/test-user/work/alpha";
const PROJECT_BRAVO = "/Users/test-user/work/bravo";

const entries: HistoryEntry[] = [
  {
    display: "alpha prompt",
    pastedContents: {},
    project: PROJECT_ALPHA,
    sessionId: "session-alpha",
    timestamp: 100,
  },
  {
    display: "bravo prompt",
    pastedContents: {},
    project: PROJECT_BRAVO,
    sessionId: "session-bravo",
    timestamp: 200,
  },
];

vi.mock("../../hooks/useHistoryEntries", () => ({
  useHistoryEntries: () => ({
    entries,
    loading: false,
    reloadHistory: vi.fn(),
  }),
}));

function renderHistoryPage(project: string) {
  render(
    <I18nProvider>
      <HistoryPage projectRequest={{ project, requestId: 1 }} />
    </I18nProvider>,
  );
}

describe("HistoryPage project navigation requests", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/?q=stale&session=session-alpha");
  });

  it("selects the requested project and clears stale search and session state", async () => {
    renderHistoryPage(PROJECT_BRAVO);

    const bravoOption = await screen.findByRole("option", { name: /bravo/ });
    await waitFor(() => {
      expect(bravoOption).toHaveAttribute("aria-selected", "true");
    });

    expect(window.location.search).toContain(`project=${encodeURIComponent(PROJECT_BRAVO)}`);
    expect(window.location.search).not.toContain("q=");
    expect(window.location.search).not.toContain("session=");
  });
});
