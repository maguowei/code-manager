import { Check, ChevronDown } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { useI18n } from "../../i18n";
import { EDITOR_CONTROL_SURFACE_CLASS } from "../editor-layout";
import { Command, CommandEmpty, CommandGroup, CommandItem, CommandList } from "../ui/command";
import { Input } from "../ui/input";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "../ui/input-group";
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from "../ui/popover";

interface ModelComboboxFieldProps {
  id?: string;
  /** 供无障碍与测试定位用的标签 */
  ariaLabel: string;
  /** 用户的显式输入值(空串为未设置) */
  value: string;
  placeholder?: string;
  /** 当前供应商的候选模型 ID 列表;为空则退化为纯文本输入 */
  suggestions: readonly string[];
  onChange: (value: string) => void;
}

/**
 * 模型字段:文本输入为主控件,尾部 chevron 触发下拉选择供应商支持的模型,
 * 始终保留自由文本输入。suggestions 为空时退化为纯文本输入(无下拉)。
 */
function ModelComboboxField({
  id,
  ariaLabel,
  value,
  placeholder,
  suggestions,
  onChange,
}: ModelComboboxFieldProps) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);

  // 无候选模型时退化为纯文本输入,与其它文本字段一致
  if (suggestions.length === 0) {
    return (
      <Input
        id={id}
        aria-label={ariaLabel}
        className={EDITOR_CONTROL_SURFACE_CLASS}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    );
  }

  // 按当前输入值子串过滤候选(大小写不敏感);输入为空时展示全部
  const query = value.trim().toLowerCase();
  const filtered = query
    ? suggestions.filter((model) => model.toLowerCase().includes(query))
    : suggestions;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <InputGroup className={EDITOR_CONTROL_SURFACE_CLASS}>
          <InputGroupInput
            id={id}
            aria-label={ariaLabel}
            className="font-mono"
            value={value}
            placeholder={placeholder}
            onChange={(event) => onChange(event.target.value)}
          />
          <InputGroupAddon align="inline-end">
            <PopoverTrigger asChild>
              <InputGroupButton
                size="icon-xs"
                aria-label={t("profiles.editor.modelCombobox.trigger")}
              >
                <ChevronDown className="opacity-60" aria-hidden="true" />
              </InputGroupButton>
            </PopoverTrigger>
          </InputGroupAddon>
        </InputGroup>
      </PopoverAnchor>
      <PopoverContent align="start" className="min-w-56 p-0">
        <Command shouldFilter={false}>
          <CommandList>
            <CommandEmpty>{t("profiles.editor.modelCombobox.empty")}</CommandEmpty>
            <CommandGroup>
              {filtered.map((model) => (
                <CommandItem
                  key={model}
                  value={model}
                  className="font-mono"
                  onSelect={() => {
                    onChange(model);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn("size-4", model === value ? "opacity-100" : "opacity-0")}
                    aria-hidden="true"
                  />
                  {model}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export default ModelComboboxField;
