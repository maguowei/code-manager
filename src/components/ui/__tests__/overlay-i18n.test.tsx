import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CommandDialog } from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { I18nProvider } from "@/i18n";

describe("overlay component i18n", () => {
  it("renders Dialog close labels with current locale text", () => {
    render(
      <I18nProvider>
        <Dialog open>
          <DialogContent>
            <DialogTitle>标题</DialogTitle>
            <DialogDescription>描述</DialogDescription>
          </DialogContent>
        </Dialog>
      </I18nProvider>,
    );

    expect(screen.getByText("关闭")).toBeInTheDocument();
    expect(screen.queryByText("Close")).not.toBeInTheDocument();
  });

  it("renders DialogFooter close button with current locale text", () => {
    render(
      <I18nProvider>
        <Dialog open>
          <DialogContent showCloseButton={false}>
            <DialogTitle>标题</DialogTitle>
            <DialogDescription>描述</DialogDescription>
            <DialogFooter showCloseButton />
          </DialogContent>
        </Dialog>
      </I18nProvider>,
    );

    expect(screen.getByRole("button", { name: "关闭" })).toBeInTheDocument();
  });

  it("renders Sheet close labels with current locale text", () => {
    render(
      <I18nProvider>
        <Sheet open>
          <SheetContent>
            <SheetTitle>标题</SheetTitle>
            <SheetDescription>描述</SheetDescription>
          </SheetContent>
        </Sheet>
      </I18nProvider>,
    );

    expect(screen.getByText("关闭")).toBeInTheDocument();
    expect(screen.queryByText("Close")).not.toBeInTheDocument();
  });

  it("renders CommandDialog default title and description with current locale text", () => {
    render(
      <I18nProvider>
        <CommandDialog open />
      </I18nProvider>,
    );

    expect(screen.getByText("命令面板")).toBeInTheDocument();
    expect(screen.getByText("搜索要运行的命令...")).toBeInTheDocument();
    expect(screen.queryByText("Command Palette")).not.toBeInTheDocument();
    expect(screen.queryByText("Search for a command to run...")).not.toBeInTheDocument();
  });
});
