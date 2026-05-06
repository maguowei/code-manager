# 前端重构设计：shadcn/ui + Tailwind CSS v4

- 创建日期：2026-05-06
- 仓库：ai-manager
- 适用范围：`src/**`（前端）；不涉及 `src-tauri/`、Tauri 命令注册、`src/types.ts` 数据契约
- 状态：草案，等待最终评审

## 1 目标与不变量

### 1.1 目标

把 ai-manager 前端从「手写 CSS + 自定义组件」整体切换为：

- **Tailwind CSS v4**（CSS-first 配置：`@import "tailwindcss"` + `@theme inline` 反查）
- **shadcn/ui**（`style=new-york`，`baseColor=neutral`，`cssVariables=true`，React 19 / Tailwind v4 现代模式）
- 一次性 PR，单 PR 内拆 commit
- 视觉风格刷新为 shadcn 默认黑白 zinc/neutral；行为、数据流、Tauri 命令调用一律不动

### 1.2 硬性不变量

1. 所有用户可见文本走 `useI18n()` 的 `t()`，禁止硬编码中英文。
2. 所有前端通知走 `useToast()` 的对外 API；底层换为 `sonner`，外部接口签名零变化。
3. Tauri 命令注册表（`src-tauri/src/lib.rs`）与前端 `invoke()` 调用面零改动。
4. `src/types.ts` 类型契约、`src/schemas/*` 的 zod schema 不动；仅 `form-fields.ts` 的渲染分发层删除。
5. CodeMirror 多版本规则保持，`pnpm.overrides` 不动。
6. 测试规模与覆盖度不下降；现有 `App.test.tsx` 等关键路径必须改造后通过。
7. 现有 i18n 文案、键名、路由、Tab、快捷键、Tray 行为完全保留。

## 2 架构与配置

### 2.1 新目录布局

```
src/
├── main.tsx                         入口：注入 ThemeProvider + I18nProvider
├── App.tsx                          类名改 Tailwind；逻辑保持
├── index.css                        ★ 唯一入口 CSS：Tailwind v4 + tw-animate-css + shadcn 变量
├── lib/
│   └── utils.ts                     ★ shadcn 标配：cn(...)
├── components/
│   ├── ui/                          ★ shadcn CLI 生成的所有原子组件（28 个）
│   ├── theme-provider.tsx           ★ system / light / dark 三态，写入 .dark class
│   ├── forms/                       业务侧复用表单字段（StringListField / KeyValueField）
│   ├── ProfilesPage.tsx             业务组件：保留文件名 + 内部全部改 Tailwind
│   ├── PresetsPage.tsx
│   ├── MemoryPage.tsx
│   ├── SkillsPage.tsx
│   ├── ProjectsPage.tsx
│   ├── HistoryPage.tsx
│   ├── StatsPage.tsx
│   ├── UsagePage.tsx
│   ├── ClaudeOverviewPage.tsx
│   ├── Sidebar.tsx
│   ├── SettingsDrawer.tsx
│   ├── ProfileEditor.tsx
│   ├── PresetEditor.tsx
│   ├── MemoryEditor.tsx
│   ├── SkillEditor.tsx
│   ├── SessionDetailDrawer.tsx
│   ├── ProjectDetailPanel.tsx
│   ├── LogViewer.tsx
│   ├── HistoryHeatmap.tsx / HistoryProjectList.tsx / HistorySessionList.tsx
│   └── profile-editor/              子表单：保留文件结构，改 Tailwind
└── hooks/
    └── useToast.ts                  接口不变；内部 sonner.toast(...)
```

### 2.2 删除清单

- `src/App.css`
- `src/styles/shared.css`（连同 `styles/` 目录）
- `src/components/**/*.css`（30+ 个业务 CSS）
- `src/components/Icons.tsx`（改用 `lucide-react`）
- `src/components/SchemaFormField.tsx`（改写各表单页面）
- `src/components/Drawer.tsx`（被 shadcn `Sheet` 替换）
- `src/components/ConfirmDialog.tsx`（被 `AlertDialog` 替换）
- `src/components/Toast.css`

### 2.3 新增依赖

运行时：

| 包 | 作用 |
|---|---|
| `tailwindcss@^4` + `@tailwindcss/vite@^4` | Tailwind v4 + Vite 插件 |
| `tw-animate-css` | v4 动画工具集（替代 tailwindcss-animate） |
| `class-variance-authority` | shadcn 变体管理 |
| `clsx` + `tailwind-merge` | shadcn `cn` 工具 |
| `lucide-react` | 图标库 |
| `sonner` | shadcn 标准 toast |
| `@radix-ui/react-*`（按 shadcn CLI 拉取） | 原子组件依赖 |

开发时：

- `@types/node`：`vite.config.ts` 用 `path.resolve(__dirname, ...)` 配置别名所需

不新增、保留：`react-hook-form`、`zod`、`@hookform/resolvers`、`recharts`、`react-markdown`、`remark-gfm`、`react-syntax-highlighter`、`@uiw/react-codemirror`、`@uiw/codemirror-theme-xcode`、`github-markdown-css`、`@tanstack/react-virtual`、`@pierre/diffs`、`@pierre/trees`、Tauri 全家桶。

### 2.4 配置文件

`components.json`（shadcn）：

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": false,
  "tsx": true,
  "tailwind": {
    "config": "",
    "css": "src/index.css",
    "baseColor": "neutral",
    "cssVariables": true,
    "prefix": ""
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  },
  "iconLibrary": "lucide"
}
```

`vite.config.ts` 关键变化：

```ts
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

export default defineConfig(async () => ({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  // 现有 server / clearScreen / watch 保留
}));
```

`tsconfig.json`：

```jsonc
{
  "compilerOptions": {
    // 现有保留
    "baseUrl": ".",
    "paths": { "@/*": ["./src/*"] }
  }
}
```

如 `vitest.config.ts` 不存在则在 `vite.config.ts` 内补 `test` 段，确保 Vitest 共享同一别名解析。

## 3 设计令牌（`src/index.css`）

唯一入口 CSS。用 Tailwind v4 + shadcn 最新规范：OKLCH 变量 + `@theme inline` 反查 + `@custom-variant dark`。

```css
@import "tailwindcss";
@import "tw-animate-css";

@custom-variant dark (&:where(.dark, .dark *));

:root {
  --background: oklch(1 0 0);
  --foreground: oklch(0.145 0 0);
  --card: oklch(1 0 0);
  --card-foreground: oklch(0.145 0 0);
  --popover: oklch(1 0 0);
  --popover-foreground: oklch(0.145 0 0);
  --primary: oklch(0.205 0 0);
  --primary-foreground: oklch(0.985 0 0);
  --secondary: oklch(0.97 0 0);
  --secondary-foreground: oklch(0.205 0 0);
  --muted: oklch(0.97 0 0);
  --muted-foreground: oklch(0.556 0 0);
  --accent: oklch(0.97 0 0);
  --accent-foreground: oklch(0.205 0 0);
  --destructive: oklch(0.577 0.245 27.325);
  --border: oklch(0.922 0 0);
  --input: oklch(0.922 0 0);
  --ring: oklch(0.708 0 0);
  --chart-1: oklch(0.646 0.222 41.116);
  --chart-2: oklch(0.6 0.118 184.704);
  --chart-3: oklch(0.398 0.07 227.392);
  --chart-4: oklch(0.828 0.189 84.429);
  --chart-5: oklch(0.769 0.188 70.08);
  --sidebar: oklch(0.985 0 0);
  --sidebar-foreground: oklch(0.145 0 0);
  --sidebar-primary: oklch(0.205 0 0);
  --sidebar-primary-foreground: oklch(0.985 0 0);
  --sidebar-accent: oklch(0.97 0 0);
  --sidebar-accent-foreground: oklch(0.205 0 0);
  --sidebar-border: oklch(0.922 0 0);
  --sidebar-ring: oklch(0.708 0 0);
  --radius: 0.625rem;
}

.dark {
  --background: oklch(0.145 0 0);
  --foreground: oklch(0.985 0 0);
  --card: oklch(0.205 0 0);
  --card-foreground: oklch(0.985 0 0);
  --popover: oklch(0.205 0 0);
  --popover-foreground: oklch(0.985 0 0);
  --primary: oklch(0.922 0 0);
  --primary-foreground: oklch(0.205 0 0);
  --secondary: oklch(0.269 0 0);
  --secondary-foreground: oklch(0.985 0 0);
  --muted: oklch(0.269 0 0);
  --muted-foreground: oklch(0.708 0 0);
  --accent: oklch(0.269 0 0);
  --accent-foreground: oklch(0.985 0 0);
  --destructive: oklch(0.704 0.191 22.216);
  --border: oklch(1 0 0 / 10%);
  --input: oklch(1 0 0 / 15%);
  --ring: oklch(0.556 0 0);
  --chart-1: oklch(0.488 0.243 264.376);
  --chart-2: oklch(0.696 0.17 162.48);
  --chart-3: oklch(0.769 0.188 70.08);
  --chart-4: oklch(0.627 0.265 303.9);
  --chart-5: oklch(0.645 0.246 16.439);
  --sidebar: oklch(0.205 0 0);
  --sidebar-foreground: oklch(0.985 0 0);
  --sidebar-primary: oklch(0.488 0.243 264.376);
  --sidebar-primary-foreground: oklch(0.985 0 0);
  --sidebar-accent: oklch(0.269 0 0);
  --sidebar-accent-foreground: oklch(0.985 0 0);
  --sidebar-border: oklch(1 0 0 / 10%);
  --sidebar-ring: oklch(0.556 0 0);
}

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --color-chart-1: var(--chart-1);
  --color-chart-2: var(--chart-2);
  --color-chart-3: var(--chart-3);
  --color-chart-4: var(--chart-4);
  --color-chart-5: var(--chart-5);
  --color-sidebar: var(--sidebar);
  --color-sidebar-foreground: var(--sidebar-foreground);
  --color-sidebar-primary: var(--sidebar-primary);
  --color-sidebar-primary-foreground: var(--sidebar-primary-foreground);
  --color-sidebar-accent: var(--sidebar-accent);
  --color-sidebar-accent-foreground: var(--sidebar-accent-foreground);
  --color-sidebar-border: var(--sidebar-border);
  --color-sidebar-ring: var(--sidebar-ring);
  --radius-sm: calc(var(--radius) - 4px);
  --radius-md: calc(var(--radius) - 2px);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) + 4px);
}

@layer base {
  * { @apply border-border outline-ring/50; }
  html, body, #root { height: 100%; }
  body {
    @apply bg-background text-foreground antialiased;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  }
  .scrollbar-none::-webkit-scrollbar { display: none; }
  .scrollbar-none { scrollbar-width: none; }
}
```

### 3.1 旧令牌 → 新令牌映射

| 旧 | 新 |
|---|---|
| `--bg-base` / `--bg-primary` / `--bg-secondary` / `--bg-tertiary` / `--bg-elevated` | `bg-background` / `bg-card` / `bg-muted` / `bg-popover` / `bg-secondary` |
| `--text-primary` / `--text-secondary` / `--text-muted` | `text-foreground` / `text-muted-foreground` |
| `--accent-blue` / `--accent-blue-hover` | `text-primary` / `bg-primary` / `hover:bg-primary/90` |
| `--accent-red` / `--accent-green` / `--accent-orange` / `--accent-purple` | `text-destructive` / Tailwind 自带 `text-emerald-*` 等 / chart-1..5 |
| `--space-*` | Tailwind `gap-*` / `p-*` / `m-*` |
| `--radius-*` | `rounded-sm/md/lg/xl` |
| `--font-*` | `text-xs/sm/base/lg/xl` |
| `--shadow-*` | `shadow-sm/md/lg/xl` |
| `--z-index-*` 体系 | shadcn 内置层级 + 局部 `z-50` / `z-[100]` |

## 4 组件替换映射

### 4.1 一次性 shadcn CLI 引入

```
button input textarea label form select checkbox switch radio-group
slider tabs tooltip card badge separator scroll-area skeleton
sheet dialog alert-dialog dropdown-menu popover command sonner
toggle toggle-group avatar collapsible
```

合计 ~28 个原子。

### 4.2 自定义组件 → shadcn 组件 映射

| 现有 | 新 | 说明 |
|---|---|---|
| `Drawer.tsx` + `.drawer-overlay/.drawer` | `Sheet` | `SettingsDrawer` / `SessionDetailDrawer` 都包到 `<Sheet>` |
| `ConfirmDialog.tsx` + `.css` | `AlertDialog` | `danger` prop → Action 按钮 `variant="destructive"` |
| `ToastProvider` + `<ToastList>` + `Toast.css` | `<Toaster />`（sonner） | `useToast.ts` 内部把 success/error 路由到 `toast.success/error` |
| `Icons.tsx` 与各处内联 SVG | `lucide-react` | `Info` / `Trash2` / `ChevronLeft` / `Settings` / `Search` / `Plus` / `X` / `Check` / `Copy` / `ExternalLink` / `Folder` / `Clock` / `BarChart3` / `DollarSign` 等 |
| `SchemaFormField.tsx` + 渲染分发 | `<Form>` + `<FormField>` + `<FormItem>` + `<FormLabel>` + `<FormControl>` + `<FormMessage>` | 见 §5 |
| `CollapsibleSection.tsx` | `Collapsible` + `CollapsibleTrigger` + `CollapsibleContent` |  |
| `ProfileNameBadge.tsx` | `Badge` + `Avatar` 组合 |  |
| `MemoryItem` / `SkillItem` 中 `.toggle-switch` | `Switch` | 颜色统一 primary |
| `.page-header` / `.list-page` / `.list-container` | Tailwind utility 组合 |  |
| `.editor-panel` 系列 | `Sheet` 内部布局 + `Button` 变体 |  |
| `.empty-icon` / `.empty-text` / `.empty-hint` | 简单 flex 组合 |  |
| `data-tooltip` CSS 提示 | `Tooltip` + `TooltipProvider` | 提至 `App` 顶层 |
| `LogViewer.css` 自定义滚动 | `ScrollArea` |  |
| `SystemInfoDialog.css` | `Dialog` |  |
| `ModelTestResultDialog` | `Dialog` |  |
| 4 个 Editor + 8 个 profile-editor 子表单 | `Sheet` + `Form` + `Tabs` + `Card` |  |
| `StatsPage` / `UsagePage` 图表 | 保留 recharts；引入 shadcn `chart` wrapper；色用 `--chart-1..5` |  |
| `HistoryHeatmap` 自绘 SVG | 保留；颜色用 `oklch()` 引用变量 |  |
| `SensitiveTextInput` | `Input` + `<Button variant="ghost">` 切换 type |  |

### 4.3 React 19 + Tailwind v4 模式

- 不用 `forwardRef`，改 `function Foo({ className, ...props }: React.ComponentProps<"div">)`。
- shadcn 原子组件根节点带 `data-slot="<name>"`。
- 类名拼接走 `cn()`：

```ts
// src/lib/utils.ts
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

### 4.4 Sidebar 形态示例

```tsx
<TooltipProvider delayDuration={200}>
  <nav className="flex h-screen w-15 shrink-0 flex-col items-center gap-1 border-r bg-sidebar py-3">
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon" className="size-10 rounded-lg" onClick={...}>AI</Button>
      </TooltipTrigger>
      <TooltipContent side="right">{t("nav.claudeOverview")}</TooltipContent>
    </Tooltip>
    {/* 各 Tab：lucide 图标 + Tooltip + Button variant="ghost" + active 用 data-active */}
  </nav>
</TooltipProvider>
```

## 5 表单层重写

### 5.1 决策

废弃 `SchemaFormField.tsx` 与渲染分发；保留 `src/schemas/form-fields.ts` 的字段元数据（i18n 键名、required、options）作为多页面共享的"内容清单"，由各页面就地解构使用。

### 5.2 统一模式

```tsx
// MemoryEditor.tsx 重写示例
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormField, FormItem, FormLabel, FormControl, FormDescription, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ChevronLeft } from "lucide-react";
import { useI18n } from "@/i18n";
import { memorySchema, type MemoryInput } from "@/schemas/memory";

export function MemoryEditor({ open, value, onClose, onSubmit }: Props) {
  const { t } = useI18n();
  const form = useForm<MemoryInput>({ resolver: zodResolver(memorySchema), defaultValues: value });

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="flex w-full flex-col p-0 sm:max-w-xl">
        <SheetHeader className="flex h-14 flex-row items-center justify-between border-b px-6">
          <Button variant="ghost" size="icon" onClick={onClose} aria-label={t("common.back")}>
            <ChevronLeft className="size-4" />
          </Button>
          <SheetTitle className="flex-1 text-base font-semibold">{t("memory.editor.title")}</SheetTitle>
          <Button form="memory-form" type="submit" disabled={!form.formState.isDirty}>
            {t("common.save")}
          </Button>
        </SheetHeader>

        <Form {...form}>
          <form id="memory-form" onSubmit={form.handleSubmit(onSubmit)}
                className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-6">

            <FormField control={form.control} name="name" render={({ field }) => (
              <FormItem>
                <FormLabel>{t("memory.editor.name.label")}</FormLabel>
                <FormControl><Input {...field} /></FormControl>
                <FormDescription>{t("memory.editor.name.description")}</FormDescription>
                <FormMessage />
              </FormItem>
            )}/>

            <FormField control={form.control} name="enabled" render={({ field }) => (
              <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                  <FormLabel>{t("memory.editor.enabled.label")}</FormLabel>
                  <FormDescription>{t("memory.editor.enabled.description")}</FormDescription>
                </div>
                <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
              </FormItem>
            )}/>

            <FormField control={form.control} name="content" render={({ field }) => (
              <FormItem>
                <FormLabel>{t("memory.editor.content.label")}</FormLabel>
                <FormControl><Textarea rows={20} {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )}/>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  );
}
```

### 5.3 i18n 错误消息适配

`src/components/ui/form.tsx` 由 shadcn CLI 生成后做唯一的本仓库定制：`FormMessage` 内部把 `error.message`（`TranslationKey`）走一次 `t()`。

```tsx
const FormMessage = ({ className, children, ...props }: React.ComponentProps<"p">) => {
  const { error, formMessageId } = useFormField();
  const { t } = useI18n();
  const body = error ? t(String(error.message) as TranslationKey) : children;
  if (!body) return null;
  return <p data-slot="form-message" id={formMessageId}
            className={cn("text-destructive text-sm", className)} {...props}>{body}</p>;
};
```

加中文注释说明该定制原因（仅一行）。

### 5.4 工作量分级

| 文件 | 等级 | 备注 |
|---|---|---|
| `MemoryEditor.tsx` | 中 | Form + CodeMirror |
| `SkillEditor.tsx` | 中 | 同上 |
| `PresetEditor.tsx` | 中 | 字段较多 |
| `ProfileEditor.tsx` | 高 | 含 8 子编辑器 + JSON 切换 |
| `SettingsDrawer.tsx` | 中 | 应用偏好 |
| `profile-editor/EnvEditor.tsx` | 中 | `useFieldArray` |
| `profile-editor/HooksEditor.tsx` | 中 |  |
| `profile-editor/PermissionsEditor.tsx` | 中 |  |
| `profile-editor/SandboxEditor.tsx` | 中 |  |
| `profile-editor/StringListEditor.tsx` | 低 | 抽取为 `forms/StringListField` |
| `profile-editor/EnabledPluginsEditor.tsx` | 中 |  |
| `profile-editor/MarketplaceEditor.tsx` | 中 |  |
| `profile-editor/StatusLineEditor.tsx` | 中 |  |
| `profile-editor/StructuredSettingsSections.tsx` | 中 | Tabs / Accordion |
| `profile-editor/DocumentEditorSection.tsx` | 低 |  |

业务侧复用：`src/components/forms/StringListField.tsx`、`src/components/forms/KeyValueField.tsx`。

`useObjectJsonEditor` / `useDocumentJsonEditor` / `useStructuredSettingsSectionState` / `useEscapeKey` / `useTauriEvent` / `useToast` 均不动。

## 6 第三方组件适配 + 全局接入

### 6.1 CodeMirror 主题联动

```ts
// src/hooks/useCodeMirrorTheme.ts
import { useEffect, useState } from "react";
import { xcodeDark, xcodeLight } from "@uiw/codemirror-theme-xcode";

export function useCodeMirrorTheme() {
  const [isDark, setIsDark] = useState(() =>
    typeof document !== "undefined" && document.documentElement.classList.contains("dark"),
  );
  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains("dark"));
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);
  return isDark ? xcodeDark : xcodeLight;
}
```

CodeMirror 容器加 `rounded-md border bg-background` 与 shadcn `Input` 风格对齐。

### 6.2 recharts

- 颜色用 CSS 变量 `var(--chart-1)`～`var(--chart-5)`。
- 网格线 `var(--border)`，文字 `var(--muted-foreground)`。
- 引入 shadcn `chart` 组件（`components/ui/chart.tsx`）做模板简化。
- 自定义 Tooltip 用 `bg-popover text-popover-foreground border rounded-md p-2 shadow-md`。

### 6.3 Markdown

`react-markdown` + `remark-gfm` 保持。`github-markdown-css` 通过 wrapper 切换：

```tsx
<div className={cn("markdown-body", isDark ? "markdown-dark" : "markdown-light")}>
  <ReactMarkdown remarkPlugins={[remarkGfm]}>{md}</ReactMarkdown>
</div>
```

`markdown-light` / `markdown-dark` 对应 `github-markdown-css` 子模块的 `light.css` / `dark.css`。

### 6.4 react-syntax-highlighter

按 `useIsDark()` 选 `oneDark` / `oneLight`。

### 6.5 `useToast` 适配 sonner

```ts
// hooks/useToast.ts
import { toast } from "sonner";

type ToastType = "success" | "error";
export function useToast() {
  return {
    showToast: (message: string, type: ToastType = "success") => {
      if (type === "error") toast.error(message);
      else toast.success(message);
    },
  };
}
```

`main.tsx` 移除 `<ToastProvider>`，`App.tsx` 末尾挂 `<Toaster richColors closeButton position="top-right" />`。

### 6.6 主题状态归位到 `ThemeProvider`

将 `src/i18n.ts` 中现有的「主题状态 + 持久化 + DOM 写入」逻辑**整体迁移**到新的 `src/components/theme-provider.tsx`。`i18n.ts` 之后只负责语言/文案，不再触摸 `<html>` 元素，关注点分离。

迁移到 `ThemeProvider` 的内容：

- `theme` 状态（`"system" | "light" | "dark"`）
- `prefers-color-scheme` 监听
- 当前是否暗色的派生
- 持久化键（沿用 i18n.ts 中现有的同名 key，**不变更存储字段、迁移路径透明**）
- DOM 写入：从 `setAttribute("data-theme", ...)` 改为 `classList.toggle("dark", isDark)`

需要随之改写的检测点：

- `App.test.tsx:377`：`removeAttribute("data-theme")` → `classList.remove("dark")`
- `ModelTestResultDialog.tsx:64`：`getAttribute("data-theme") === "light"` → `!classList.contains("dark")`
- 任何旧的「读 i18n 中的主题」调用点：改为 `useTheme()` from `theme-provider`。

i18n 文案、语言键名、`useI18n()` 公共 API 不变。

### 6.7 `ThemeProvider` 接口

```tsx
// src/components/theme-provider.tsx
type Theme = "system" | "light" | "dark";
interface ThemeContextValue {
  theme: Theme;
  setTheme: (t: Theme) => void;
  isDark: boolean;  // 派生：system 模式下根据 prefers-color-scheme
}
```

挂在 `main.tsx` 的 Provider 树中，包裹 `<I18nProvider>`，确保所有子组件都能用 `useTheme()`。

### 6.8 `App.tsx` 顶层注入

```tsx
return (
  <TooltipProvider delayDuration={200}>
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar ... />
      <div className="relative flex flex-1 overflow-hidden">{/* tabs */}</div>
      {isSettingsOpen && <SettingsDrawer ... />}
    </div>
    <Toaster richColors closeButton position="top-right" />
  </TooltipProvider>
);
```

## 7 测试策略

### 7.1 适配规则

| 测试 | 处理 |
|---|---|
| `App.test.tsx` | 选择器从 class 改为 role / aria-label / 文本 |
| `i18n.test.tsx` | 断言 `data-theme` → `classList.contains("dark")` |
| `components/__tests__/*` | 选择器迁移 |
| `profile-editor/__tests__/*` | 选择器迁移 |
| `hooks/__tests__/*` | 不动 |
| `history-utils.test.ts` | 不动 |
| `cargo test` | 不动 |

### 7.2 选择器优先级

1. ❌ class 选择
2. ✅ `getByRole(role, { name })`
3. ✅ `getByText` / `getByLabelText`
4. ✅ `[data-slot="..."]`（shadcn 标准）
5. ✅ `data-testid`（按需）

### 7.3 新增测试

- `useToast` 走 sonner：mock `toast.success/error`，验证路由。
- `ThemeProvider`：三态切换 + `<html>` class 正确切换。
- `useCodeMirrorTheme`：mock `MutationObserver`，验证响应。
- `FormMessage` i18n 包装：传 `TranslationKey` → 渲染 `t()` 结果。

### 7.4 视觉/交互手测清单

`pnpm tauri dev` 后走完：

1. Sidebar 全部 Tab 切换、Tooltip、Active 态
2. ProfilesPage 列表 → ProfileEditor → 8 子编辑器
3. PresetsPage / MemoryPage / SkillsPage 列表 + 编辑 + 删除（AlertDialog）
4. ProjectsPage / HistoryPage 列表 + ProjectDetailPanel / SessionDetailDrawer
5. StatsPage / UsagePage 图表
6. ClaudeOverviewPage
7. SettingsDrawer 全部段落
8. system / light / dark 三态切换 + 重启保留
9. CodeMirror 在 dark / light 下颜色
10. Toast 成功/失败
11. ESC 关 Sheet / AlertDialog
12. Tray 行为

## 8 实施顺序（单 PR 内 commit 切片）

```
commit 1  chore(deps): 引入 tailwind v4 + shadcn 基础设施
            - package.json 新增依赖
            - vite.config.ts: tailwindcss() + @/* 别名
            - tsconfig.json: paths
            - src/index.css: @import / @theme inline / @custom-variant dark / OKLCH 变量
            - src/lib/utils.ts: cn()
            - components.json
            - main.tsx: 引入 src/index.css，临时同时保留旧 CSS

commit 2  feat(ui): shadcn CLI 一次性引入 28 个原子
            - pnpm dlx shadcn@latest add ...
            - components/ui/* 全部生成
            - components/ui/form.tsx 加 i18n FormMessage 包装

commit 3  feat(theme): ThemeProvider 接管主题状态 + dark class 切换
            - components/theme-provider.tsx（新建）
            - 把 i18n.ts 中主题状态/持久化/DOM 写入逻辑迁出
            - DOM 写入改为 classList.toggle("dark", isDark)
            - ModelTestResultDialog 检测改 .dark
            - hooks/useCodeMirrorTheme.ts
            - main.tsx 注入 <ThemeProvider>
            - App.test.tsx / i18n.test.tsx 同步改

commit 4  refactor(toast): useToast 接 sonner
            - hooks/useToast.ts 改写
            - main.tsx 移除 ToastProvider
            - App.tsx 注入 <Toaster> + <TooltipProvider>
            - 删除 components/Toast.css

commit 5  refactor(icons): 全面替换为 lucide-react
            - 删除 components/Icons.tsx
            - Sidebar / 各页面所有内联 SVG → lucide

commit 6  refactor(shell): App / Sidebar / 公共布局 Tailwind 化
            - App.tsx / Sidebar.tsx 改类名 + Tooltip + lucide
            - 删除 App.css / styles/shared.css / Sidebar.css

commit 7  refactor(drawer-dialog): Drawer/ConfirmDialog → Sheet/AlertDialog
            - 删除 Drawer.tsx / ConfirmDialog.tsx + .css
            - SettingsDrawer / SessionDetailDrawer / SystemInfoDialog / ModelTestResultDialog 适配

commit 8  refactor(forms-shared): 删除 SchemaFormField + 渲染分发
            - 保留 form-fields.ts 元数据
            - 新增 components/forms/StringListField.tsx, KeyValueField.tsx

commit 9  refactor(profiles): ProfilesPage + ProfileEditor + 8 子编辑器
            - 删除对应 .css
            - 改写为 shadcn Form / Sheet / Tabs

commit 10 refactor(presets-memory-skills): PresetsPage / PresetEditor /
                                           MemoryPage / MemoryEditor /
                                           SkillsPage / SkillEditor
            - 删除对应 .css

commit 11 refactor(projects-history): ProjectsPage / ProjectDetailPanel /
                                      HistoryPage / HistoryHeatmap /
                                      HistoryProjectList / HistorySessionList /
                                      SessionDetailDrawer / LogViewer
            - 删除对应 .css

commit 12 refactor(stats-usage): StatsPage / UsagePage / ClaudeOverviewPage
            - 引入 shadcn chart wrapper
            - 颜色用 --chart-* 变量
            - 删除对应 .css

commit 13 refactor(settings): SettingsDrawer 改 Sheet + Form
            - 删除 SettingsDrawer.css
            - 三态主题接 ThemeProvider

commit 14 chore(cleanup): 删除残留资产
            - 确认无引用后删 styles/ 目录与所有残留 CSS
            - biome check --write . 全量过

commit 15 test: 全量测试与视觉验证
            - 走手测清单
            - 修复回归
```

每个 commit 期望可独立通过 `pnpm biome:ci` + `pnpm build` + `pnpm test`。commit 6 之后页面应能正常使用。

## 9 风险登记

| 风险 | 概率 | 影响 | 缓解 |
|---|---|---|---|
| Tailwind v4 + Vite 7 + Tauri 2 三角兼容性问题 | 低 | 高 | commit 1 先建最简 demo 验证 build |
| React 19 + shadcn 最新模板 + Vitest 4 setup 冲突 | 低-中 | 中 | commit 2 后跑 baseline；调 vitest config |
| CodeMirror 多版本冲突复发 | 中 | 高 | 加包后立即查 `pnpm-lock.yaml` 中 `'@codemirror/state@'` 唯一性，必要时 `pnpm.overrides` |
| 视觉回归（GitHub 蓝 → neutral 黑白）用户体感差 | 高 | 低-中 | 已是 §1 决策；属预期非缺陷 |
| ProfileEditor + 8 子编辑器一次重写体量过大 | 高 | 中 | commit 9 内部按子编辑器再切片提交 |
| `MutationObserver` 监听性能 | 低 | 低 | 仅监听 attributeFilter `class` |
| sonner 与现有 toast 行为差异 | 中 | 低 | 在 `useToast` 内对齐参数；测试 success/error |
| recharts 与 shadcn `chart` API 落差 | 低 | 低 | 必要时仅用变量染色，不引 wrapper |
| github-markdown-css 暗色 wrapper 类名变更 | 低 | 低 | 验证后固定类名 |
| 路径别名 `@/*` 在 Vitest 不生效 | 中 | 低 | `vite.config.ts` 内补 `test` 段共享别名 |
| Biome 与 Tailwind 类名顺序冲突 | 低 | 低 | 不强制排序；commit 14 一次性整理 |

## 10 回滚策略

- 严重不可修复问题：`git revert` PR 整体回滚。
- 中间 commit 失败：保留前序 commit，定位失败 commit，修补后重新 push。
- 不做 feature flag：UI 重构无法运行时切换。

## 11 不在本次范围

- 不重写 `recharts` 为 shadcn 原生图表（仅染色 + wrapper）。
- 不引入 i18n 框架替换（`useI18n` 不动）。
- 不重写 Tauri 命令、Rust 业务逻辑、SQLite 缓存层。
- 不替换 react-hook-form / zod。
- 不引入 React Router / Zustand / Redux 等状态库。
- 不重写国际化文案、键名。
