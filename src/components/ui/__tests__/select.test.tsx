import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../select";

interface SelectCaseProps {
  value: string;
  onValueChange?: (value: string | null) => void;
  items?: { value: string; label: string }[];
}

function renderSelect({ value, onValueChange, items }: SelectCaseProps) {
  return render(
    <Select value={value} items={items} onValueChange={onValueChange}>
      <SelectTrigger aria-label="终端">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectItem value="iterm2">iTerm2</SelectItem>
          <SelectItem value="terminal">Terminal</SelectItem>
        </SelectGroup>
      </SelectContent>
    </Select>,
  );
}

function openSelect(name: string | RegExp) {
  const trigger = screen.getByRole("combobox", { name });
  act(() => {
    fireEvent.click(trigger);
  });
  return trigger;
}

// Base UI 的 Item 只在 pointerdown 之后才接受鼠标 click 提交，测试里补上这一步。
function pickOption(name: string | RegExp) {
  const option = screen.getByRole("option", { name });
  act(() => {
    fireEvent.pointerDown(option, { button: 0, pointerType: "mouse" });
    fireEvent.click(option);
  });
}

describe("Select", () => {
  it("renders the labels passed through items in the trigger", () => {
    renderSelect({
      value: "iterm2",
      items: [
        { value: "iterm2", label: "iTerm2" },
        { value: "terminal", label: "Terminal" },
      ],
    });

    expect(screen.getByRole("combobox", { name: "终端" })).toHaveTextContent("iTerm2");
  });

  // Base UI 不会从渲染出来的 Item 文本推导触发器文案，缺 items 时显示原始 value，
  // 消费者必须显式传 items（或 itemToStringLabel）才能拿到展示名。
  it("falls back to the raw value without items", () => {
    renderSelect({ value: "iterm2" });

    expect(screen.getByRole("combobox", { name: "终端" })).toHaveTextContent("iterm2");
  });

  it("lists options and commits the picked value", () => {
    const onValueChange = vi.fn();

    renderSelect({
      value: "iterm2",
      items: [
        { value: "iterm2", label: "iTerm2" },
        { value: "terminal", label: "Terminal" },
      ],
      onValueChange,
    });

    openSelect("终端");
    pickOption("Terminal");

    expect(onValueChange).toHaveBeenCalledWith("terminal", expect.anything());
  });
});
