import { ChevronDown } from "lucide-react";
import { Slider as SliderPrimitive } from "radix-ui";
import { cn } from "@/lib/utils";
import { useI18n } from "../../i18n";
import { EDITOR_CONTROL_SURFACE_CLASS } from "../editor-layout";
import { TYPOGRAPHY } from "../typography-classes";
import { Button } from "../ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import type { SettingsFieldOption } from "./settings-form-registry";

// 描述表覆盖的努力级别(与官方文档一致,不含未设置/auto)
const EFFORT_DESCRIPTION_LEVELS = [
  { level: "low", descKey: "profiles.editor.effort.desc.low" },
  { level: "medium", descKey: "profiles.editor.effort.desc.medium" },
  { level: "high", descKey: "profiles.editor.effort.desc.high" },
  { level: "xhigh", descKey: "profiles.editor.effort.desc.xhigh" },
  { level: "max", descKey: "profiles.editor.effort.desc.max" },
  { level: "ultracode", descKey: "profiles.editor.effort.desc.ultracode" },
] as const;

interface EffortLevelFieldProps {
  /** 档位选项,左→右即 Faster→Smarter;空串档代表「未设置」 */
  options: SettingsFieldOption[];
  /** 当前值(环境变量原值,空串为未设置) */
  value: string;
  /** 选中某一档时回传该档的值 */
  onChange: (value: string) => void;
  /** 供无障碍与测试定位用的标签 */
  ariaLabel: string;
  id?: string;
}

/**
 * 努力级别字段:半宽触发按钮显示当前档位,点击弹出浮窗,
 * 浮窗里用「Faster ←→ Smarter」刻度条调整,并在底部列出各级别说明。
 * 数据驱动 options,未知自定义值会作为额外档位被追加显示。
 */
function EffortLevelField({ options, value, onChange, ariaLabel, id }: EffortLevelFieldProps) {
  const { language, t } = useI18n();

  const count = options.length;
  const activeIndex = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );
  const currentLabel = options.find((option) => option.value === value)?.label[language] ?? value;
  const columnsStyle = { gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))` };

  // ultracode 档(若存在)用于高亮其前一段轨道
  const ultraIndex = options.findIndex((option) => option.value === "ultracode");
  const hasUltra = ultraIndex > 0 && count > 1;
  const ultraStartPercent = hasUltra ? ((ultraIndex - 1) / (count - 1)) * 100 : 0;
  // 滑块两侧各内缩半格,使第 i 档恰好落在第 i 列(整宽等分网格)的中心,实现刻度/滑块/标签垂直对齐
  const insetMargin = count > 0 ? `${50 / count}%` : "0%";
  // low 之前的档(未设置/auto)归为「默认」区,Faster→Smarter 梯度从 low 开始
  const lowIndex = options.findIndex((option) => option.value === "low");
  const fasterCol = lowIndex > 0 ? lowIndex : 0;

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
          <span>{currentLabel}</span>
          <ChevronDown className="size-4 opacity-60" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[32rem]">
        <div className="grid gap-3">
          {/* 顶部说明:默认(未设置/auto 上方)、更快(low 上方)、更智能(末档上方) */}
          <div className={cn("grid", TYPOGRAPHY.auxiliary)} style={columnsStyle}>
            {fasterCol > 0 ? (
              <span className="text-center" style={{ gridColumn: `1 / span ${fasterCol}` }}>
                {t("profiles.editor.effort.default")}
              </span>
            ) : null}
            <span className="text-center" style={{ gridColumn: `${fasterCol + 1} / span 1` }}>
              {t("profiles.editor.effort.faster")}
            </span>
            <span className="text-center" style={{ gridColumn: `${count} / span 1` }}>
              {t("profiles.editor.effort.smarter")}
            </span>
          </div>

          <div className="grid gap-2" data-slot="effort-level-slider">
            {/* 刻度点行:整宽等分网格,与下方标签同列 */}
            <div aria-hidden className="grid" style={columnsStyle}>
              {options.map((option, index) => (
                <span key={option.value || "__unset__"} className="flex justify-center">
                  <span
                    className={cn("h-1.5 w-px", index === activeIndex ? "bg-primary" : "bg-border")}
                  />
                </span>
              ))}
            </div>

            {/* 滑块:内缩半格使档位落在列中心 */}
            <SliderPrimitive.Root
              className="relative flex touch-none items-center select-none"
              style={{ marginInline: insetMargin }}
              min={0}
              max={Math.max(0, count - 1)}
              step={1}
              value={[activeIndex]}
              onValueChange={([next]) => onChange(options[next]?.value ?? "")}
            >
              <SliderPrimitive.Track className="relative h-0.5 w-full rounded-full bg-border">
                {hasUltra ? (
                  <span
                    aria-hidden
                    className="absolute inset-y-0 right-0 rounded-full bg-primary"
                    style={{ left: `${ultraStartPercent}%` }}
                  />
                ) : null}
              </SliderPrimitive.Track>
              {/* 零宽滑块:Radix 读到宽度 0 不再内缩,中心精确落在刻度列;三角与焦点环溢出渲染 */}
              <SliderPrimitive.Thumb
                aria-label={ariaLabel}
                className="group block size-0 cursor-pointer outline-none"
              >
                <span
                  aria-hidden
                  className="absolute top-1/2 left-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full ring-ring group-focus-visible:ring-2"
                />
                <span
                  aria-hidden
                  className="absolute top-1/2 left-1/2 size-0 -translate-x-1/2 -translate-y-1/2 border-x-[6px] border-b-[9px] border-x-transparent border-b-primary"
                />
              </SliderPrimitive.Thumb>
            </SliderPrimitive.Root>

            {/* 档位标签行:整宽等分网格,与刻度点对齐 */}
            <div className="grid" style={columnsStyle}>
              {options.map((option, index) => {
                const active = index === activeIndex;
                const isUltra = option.value === "ultracode";
                return (
                  <Button
                    key={option.value || "__unset__"}
                    type="button"
                    variant="ghost"
                    size="xs"
                    onClick={() => onChange(option.value)}
                    className={cn(
                      "h-auto justify-center px-0.5 py-0 font-normal",
                      TYPOGRAPHY.auxiliary,
                      isUltra && "text-primary",
                      active && "font-semibold text-primary",
                      !active && !isUltra && "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {option.label[language]}
                  </Button>
                );
              })}
            </div>
          </div>

          {/* 各级别说明表 */}
          <div className="grid gap-1 border-t pt-3">
            <div className={cn("grid grid-cols-[4rem_1fr] gap-2", TYPOGRAPHY.auxiliary)}>
              <span className="font-semibold text-foreground">
                {t("profiles.editor.effort.tableLevel")}
              </span>
              <span className="font-semibold text-foreground">
                {t("profiles.editor.effort.tableWhen")}
              </span>
            </div>
            {EFFORT_DESCRIPTION_LEVELS.map((item) => (
              <div
                key={item.level}
                className={cn("grid grid-cols-[4rem_1fr] gap-2", TYPOGRAPHY.auxiliary)}
              >
                <span className={item.level === "ultracode" ? "text-primary" : "text-foreground"}>
                  {item.level}
                </span>
                <span className="text-muted-foreground">{t(item.descKey)}</span>
              </div>
            ))}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export default EffortLevelField;
