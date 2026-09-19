# form

2026-09-19，transformation engine（legacy `new-york`，无 base 对照风格）。

Slot 用 useRender + mergeProps 承接；`EffortLevelField` 直接使用的 Radix Slider 也一并迁移。

## Changed

- `src/components/ui/form.tsx`：去掉 `radix-ui` 的 `Slot` 与 `Label` 类型引用。
  `FormControl` 改为 `useRender` + `mergeProps`：传入单个子元素时把
  `data-slot="form-control"`、`id`、`aria-describedby`、`aria-invalid` 合并到该元素上，
  与 Radix Slot 的 asChild 语义一致；同时保留 `render` 属性（Base UI 惯用形式）。
  `FormLabel` 的类型改用项目内已迁移为原生 `<label>` 的 `Label`。
  FormControl 的调用点（MemoryEditor 4 处、SkillEditor 2 处、form.test 1 处）因此不必改写。
- `src/components/profile-editor/EffortLevelField.tsx`：改用 `@base-ui/react/slider`；
  新增 Control 布局层（内缩 margin 从 Root 移到 Control），单值场景 `value` / `onValueChange`
  直接用 number，去掉原先的数组解构。
- 残留扫描：`grep -rn "radix-ui\|@radix-ui\|asChild"` 对上述文件无命中。

## Left alone

- `react-hook-form` 的集成方式未变（FormField = Controller 包装、useFormField 读取 fieldState）。
- shadcn 上游已不再提供 `form` 组件（基座注册表改推 `field`），所以没有 golden 参照，
  本次是按项目自有实现做等价改写。

## Behavior changes

1. `FormControl` 的属性合并时机与 Slot 一致（子元素自身的 props 优先），校验错误时
   `aria-invalid` / `aria-describedby` 仍然正确下发。
2. 努力级别滑块的键盘与指针交互由 Base UI 接管：刻度条位置算法不变，但拖动手感与焦点环由新库决定。

## Verify by hand

1. 记忆编辑器：留空名称提交，错误文案出现，输入框有 `aria-invalid`。
2. Skills 编辑器：切换备注/内容字段，校验错误仍指向正确控件。
3. 配置编辑器 → 努力级别：打开浮窗，拖动滑块档位跟随，点击档位按钮同步滑块位置。
