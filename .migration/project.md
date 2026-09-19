# project

2026-09-19，整仓（whole-project）模式，transformation engine。

`src/components/ui/` 下全部 22 个 Radix wrapper 与使用 Radix 原语的业务代码已迁移到 `@base-ui/react`，
`radix-ui` 直接依赖已移除，前端全量测试 937 用例通过。

## 策略

- 项目 `components.json` 的 style 是 legacy `new-york`，上游没有 `base-new-york` 对照风格，
  因此**不能走 golden-pair 重放**（拿 base-<style> 覆盖会把界面重新配色）。
  实际做法是 transformation engine：逐个 wrapper 重接原语，保留用户自己的类名与定制。
- 非 shadcn 的第三方库一律不动：cmdk（command）、vaul/drawer、sonner、input-otp、
  react-day-picker（calendar）、recharts（chart）。`ui/command.tsx` 只调整了 children 类型收窄。
- 每个组件一个提交，任意一步都可构建。

## 依赖替换

| 动作 | 结果 |
| --- | --- |
| 新增 | `@base-ui/react` `^1.8.0`（`chore(deps): 引入 @base-ui/react`） |
| 移除 | `radix-ui` `^1.6.7`（`chore(deps): 移除 radix-ui 依赖`，pnpm 移除 65 个包） |
| 残留 | `@radix-ui/*` 仅作为 `cmdk` 的传递依赖存在（`pnpm-lock.yaml` 中由 cmdk 引入），项目源码零引用 |

## 已迁移的 wrapper（22 个）

label、separator、badge、avatar、toggle、collapsible、checkbox、switch、radio-group、slider、
scroll-area、button、dialog、sheet、popover、tooltip、alert-dialog、tabs、select、dropdown-menu、
toggle-group、form。每个组件的细节见同名报告文件。

派生统计：**0 个 wrapper 仍在 Radix**（`grep -rln "@base-ui/react"` 覆盖 ui 目录，
`grep -rn "radix-ui" src/` 无命中）。

## 业务代码 sweep 摘要

- **asChild → render**：17 处 TooltipTrigger、9 处 PopoverTrigger、4 处 Button、2 处 CollapsibleTrigger，
  以及 AlertDialogDescription / Sheet 等零散调用点，全部改为 `render={<Element/>}` 形式。
- **回调签名**：`select` 的 `onValueChange` 宽化为 `(value | null, eventDetails)`（调用点补 null 兜底）；
  `slider` 的 `onValueCommit` → `onValueCommitted`，单值场景回调值由数组变为 number。
- **必需的新属性**：`select` 的触发器文案改由 `items` 决定，16 处调用点补了 `items`
  （这是本次迁移最大的一处调用点破坏面，详见 select 报告）。
- **属性改名**：`textValue` → `label`（select item）、`delayDuration` → `delay`（tooltip provider）、
  `position="popper"` → `alignItemWithTrigger={false}`（select，项目内未使用）。
- **直接使用 Radix 原语的业务组件**：`profile-editor/EffortLevelField.tsx` 的 Slider 一并迁移
  （新增 Control 层、单值回调）。

## 测试基础设施改动

- `src/test/setup.ts`：
  - `Element.prototype.getAnimations ??= () => []`：jsdom 不实现该 API，Base UI 的 ScrollArea Viewport 会调用它。
  - 置位 `BASE_UI_ANIMATIONS_DISABLED`：Base UI 要等退场动画结束才卸载浮层，
    jsdom 不跑 CSS 动画 + 假定时器 mock 掉 requestAnimationFrame，会让已关闭的浮层永久残留。
  - 既有的 window blur shim 保留：cmdk 内部仍带 Radix Dialog，该 shim 仍有存在意义。
- 交互助手按 Base UI 事件模型调整：打开下拉用 `click`（不再是 pointerdown），
  选项提交需要 `pointerdown` + `click`。涉及 `ProfileEditor.test.tsx`、`SettingsDrawer.test.tsx`。
- 新增 `src/components/ui/__tests__/select.test.tsx`，锁定「触发器文案来自 items」这一契约。

## 验证结果

| 命令 | 结果 |
| --- | --- |
| `pnpm exec tsc --noEmit` | 通过 |
| `make lint-frontend`（biome ci，只读） | 通过，303 文件无告警 |
| `make fmt-check` | 通过 |
| `make build-frontend` | 通过（vite build 2.5s） |
| `pnpm exec vitest run` | 113 文件 / 937 用例全部通过 |
| `grep -rn "radix-ui" src/` | 0 命中 |

未执行：`make verify` 全量本地门禁（含 Rust 侧）、`make dev` 真机视觉验收。
Rust 侧未改动，理论上不受影响；视觉验收建议按各组件报告的「Verify by hand」清单逐条过一遍。

## 需要用户决定的事项（FLAG，未修改）

1. **`components.json` 的 style 仍是 `new-york`**：这是 Radix 时代的风格名，上游没有 `base-new-york`。
   保持现状时，将来执行 `shadcn add <component>` 仍会拉取 Radix 变体，把 radix-ui 依赖重新带回来。
   可选路径：(a) 保持 legacy 风格，手动迁移新组件；(b) 切换到某个 `base-*` 风格（会带来一次视觉重配色，
   需要单独评估）。本次迁移不擅自更改。
2. **行为差异需要产品确认**：tabs 的键盘激活由「跟随焦点」变为「手动激活」；
   dropdown-menu 的 CheckboxItem/RadioItem 默认点击后不关闭菜单（当前无消费者）。
   两处都按规则只标记、未静默修补，详见对应报告。
