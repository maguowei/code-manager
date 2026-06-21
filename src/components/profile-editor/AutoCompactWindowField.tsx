import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "../../i18n";
import { EDITOR_CONTROL_SURFACE_CLASS } from "../editor-layout";
import { TYPOGRAPHY } from "../typography-classes";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { Slider } from "../ui/slider";
import { formatTokens } from "../usage/format";

// 自动压缩窗口取值范围(token);0 = 未设置,与 schema 的 CLAUDE_CODE_AUTO_COMPACT_WINDOW 对应
const MIN = 0;
const MAX = 1_000_000;
const STEP = 10_000;
// 常用窗口大小,作为滑块的快速锚点(均落在 STEP 网格上,拖动也能精确停靠)
const ANCHORS = [200_000, 250_000, 400_000, 500_000];

interface AutoCompactWindowFieldProps {
  /** 环境变量原值,空串表示未设置 */
  value: string;
  /** 回传新值,空串表示清除该 env 键 */
  onChange: (value: string) => void;
  /** 无障碍与测试定位用的标签 */
  ariaLabel: string;
  /** 数字输入框占位文案 */
  placeholder?: string;
  id?: string;
}

/** 解析 env 原值为数字;空串、非有限数或非正数都视为未设置 */
function parseValue(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "") {
    return null;
  }
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

/**
 * 自动压缩窗口字段:输入框样式的触发按钮展示当前值(默认未设置),
 * 点击弹出滑块(0–1M,最左 0 = 未设置)与数字输入框,二者联动,支持精确直填。
 */
function AutoCompactWindowField({
  value,
  onChange,
  ariaLabel,
  placeholder,
  id,
}: AutoCompactWindowFieldProps) {
  const { t } = useI18n();
  const numeric = parseValue(value);
  const unsetLabel = t("profiles.editor.autoCompactWindow.unset");
  const triggerLabel = numeric === null ? unsetLabel : numeric.toLocaleString("en-US");

  // 数字输入:空或非正值清除该 env 键,否则透传原始字符串
  const handleInputChange = (raw: string) => {
    const trimmed = raw.trim();
    if (trimmed === "" || Number(trimmed) <= 0) {
      onChange("");
      return;
    }
    onChange(raw);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          id={id}
          aria-label={ariaLabel}
          className={cn("w-full justify-between font-normal", EDITOR_CONTROL_SURFACE_CLASS)}
        >
          <span>{triggerLabel}</span>
          <ChevronDown className="size-4 opacity-60" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[22rem]">
        <div className="grid gap-3" data-slot="auto-compact-window-control">
          <Slider
            aria-label={ariaLabel}
            min={MIN}
            max={MAX}
            step={STEP}
            value={[numeric ?? 0]}
            onValueChange={([next]) => onChange(next === 0 ? "" : String(next))}
          />
          <div
            className={cn("flex justify-between text-muted-foreground", TYPOGRAPHY.auxiliary)}
            aria-hidden
          >
            <span>{unsetLabel}</span>
            <span>{numeric === null ? "" : `≈ ${formatTokens(numeric)}`}</span>
            <span>{formatTokens(MAX)}</span>
          </div>
          {/* 常用窗口的快速锚点 */}
          <div className="flex flex-wrap gap-1.5">
            {ANCHORS.map((anchor) => (
              <Button
                key={anchor}
                type="button"
                variant="outline"
                size="xs"
                onClick={() => onChange(String(anchor))}
                className={cn(
                  "rounded-full font-normal",
                  numeric === anchor && "border-primary font-semibold text-primary",
                )}
              >
                {formatTokens(anchor)}
              </Button>
            ))}
          </div>
          <Input
            aria-label={ariaLabel}
            className={EDITOR_CONTROL_SURFACE_CLASS}
            type="number"
            inputMode="numeric"
            min={MIN}
            max={MAX}
            step={STEP}
            value={numeric ?? ""}
            placeholder={placeholder}
            onChange={(event) => handleInputChange(event.target.value)}
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}

export default AutoCompactWindowField;
