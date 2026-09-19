# label

2026-09-19，transformation engine（项目 style 为 legacy `new-york`，没有 base 对应风格，只能按转换规则改写用户自己的文件）。

Base UI 没有 Label 原语，wrapper 改为原生 `<label>`；类名、data-slot 与消费者行为不变。

## Changed

- `src/components/ui/label.tsx`：`import { Label as LabelPrimitive } from "radix-ui"` 换成原生 `<label>`；
  组件签名由 `React.ComponentProps<typeof LabelPrimitive.Root>` 改为 `React.ComponentProps<"label">`，
  类名与 `data-slot="label"` 原样保留（`flex items-center gap-2` 等本项目定制全部沿用）。
- 残留扫描：`grep -n "radix-ui\|@radix-ui" src/components/ui/label.tsx` 无命中。

## Left alone

- 消费者（ProfileEditor、MemoryEditor、SkillEditor、SettingsDrawer 等）未改动：它们都通过 `htmlFor` 关联控件，
  原生 label 与 Radix Label 在这一用法上等价。
- `src/components/ui/form.tsx` 里 `FormLabel` 的类型引用在 form 组件迁移中才改为项目内的 `Label`，不在本次改动内。

## Behavior changes

无。Radix Label 本身只是加了 `onMouseDown` 阻止双击选中文本的原语级行为，本项目未依赖。

## Verify by hand

1. 打开任一配置的编辑器，点击「名称」「描述」等标签，光标应落到对应输入框。
2. 点击「回复语言」等带帮助按钮的标签行，帮助浮层不应被误触发。
