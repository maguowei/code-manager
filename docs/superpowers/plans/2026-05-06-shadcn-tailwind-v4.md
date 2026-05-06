# 前端重构 shadcn/ui + Tailwind v4 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 ai-manager 前端整体切换到 Tailwind v4 (CSS-first) + shadcn/ui (new-york / neutral)，删除全部业务 CSS，业务组件用 shadcn 原子重写，行为/数据/Tauri 调用面零变化。

**Architecture:** 单 PR 内 15 个 commit 切片；每 commit 可独立通过 `pnpm biome:ci` + `pnpm build` + `pnpm test`。基础设施（Tailwind v4 / shadcn / ThemeProvider / sonner / lucide）先落，再按页面板块批量替换。删除 `Drawer.tsx` / `ConfirmDialog.tsx` / `Icons.tsx` / `SchemaFormField.tsx` 与所有 30+ 业务 CSS。`useToast` / `useI18n` / `react-hook-form` / `zod` / Tauri 命令调用面不动。

**Tech Stack:** Tailwind v4 + `@tailwindcss/vite` + `tw-animate-css`；shadcn/ui (style=new-york, baseColor=neutral, cssVariables=true)；React 19；Vite 7；Vitest 4；TypeScript 5.8；lucide-react；sonner；react-hook-form + zod（保留）；recharts（保留，染色对接 chart-* 变量）；CodeMirror（保留，dark class 联动）。

**Spec:** 完整设计、令牌值、组件映射、风险登记见 `docs/superpowers/specs/2026-05-06-shadcn-tailwind-v4-design.md`（下文以"spec §X"引用其章节）。

---

## 文件结构

### 新建

| 文件 | 职责 |
|---|---|
| `src/index.css` | Tailwind v4 唯一入口 + tw-animate-css + OKLCH 变量 + `@theme inline` + `@custom-variant dark` |
| `src/lib/utils.ts` | shadcn `cn(...)` 工具 |
| `src/components/ui/*.tsx` | shadcn CLI 生成的 28 个原子组件 |
| `src/components/theme-provider.tsx` | system/light/dark 三态状态管理 + `.dark` class DOM 写入 + 持久化 |
| `src/hooks/useCodeMirrorTheme.ts` | 监听 `<html>` class 变化返回 xcodeDark/xcodeLight |
| `src/hooks/useIsDark.ts` | 暴露当前是否暗色（供 react-syntax-highlighter / markdown wrapper 用） |
| `src/components/forms/StringListField.tsx` | `useFieldArray` 字符串列表通用字段；保留自定义新增与逐行 action 扩展 |
| `src/components/forms/KeyValueField.tsx` | 键值对动态增删通用字段 |
| `components.json` | shadcn 配置 |

### 修改

| 文件 | 改动要点 |
|---|---|
| `package.json` | 新增 9 个运行时依赖 + `@types/node` |
| `vite.config.ts` | `tailwindcss()` 插件 + `@/*` 别名 + Vitest test 段 |
| `tsconfig.json` | `baseUrl` + `paths` |
| `src/main.tsx` | 引入 `index.css`；包裹 `<ThemeProvider>`；移除 `<ToastProvider>` |
| `src/App.tsx` | 类名改 Tailwind；包裹 `<TooltipProvider>`；末尾挂 `<Toaster>` |
| `src/i18n.ts` | 主题状态/持久化/DOM 写入逻辑迁出到 `theme-provider`；语言文案不动 |
| `src/hooks/useToast.tsx` | 改为函数 hook，内部调 `sonner.toast` |
| `src/components/profile-editor/ModelTestResultDialog.tsx` | `data-theme` 检测改 `.dark` class |
| 所有业务页面 `.tsx`（25+ 个） | 类名改 Tailwind，自定义元素换 shadcn 原子，SVG 换 lucide |
| 所有测试 `*.test.tsx` | 选择器从 class 改 role/aria/text |

### 删除

```
src/App.css
src/styles/shared.css   （及 styles/ 目录）
src/components/Toast.css
src/components/Icons.tsx
src/components/Drawer.tsx
src/components/ConfirmDialog.tsx
src/components/ConfirmDialog.css
src/components/SchemaFormField.tsx
src/components/Sidebar.css
src/components/ClaudeOverviewPage.css
src/components/ConfigEditor.css
src/components/HistoryPage.css
src/components/LogViewer.css
src/components/MemoryEditor.css
src/components/MemoryItem.css
src/components/MemoryPage.css
src/components/PresetEditor.css
src/components/PresetsPage.css
src/components/ProfileEditor.css
src/components/ProfileNameBadge.css
src/components/ProfilesPage.css
src/components/ProjectsPage.css
src/components/SessionDetailDrawer.css
src/components/SettingsDrawer.css
src/components/SkillEditor.css
src/components/SkillItem.css
src/components/SkillsPage.css
src/components/StatsPage.css
src/components/SystemInfoDialog.css
src/components/UsagePage.css
src/components/profile-editor/editor-shared.css
src/components/profile-editor/EnabledPluginsEditor.css
src/components/profile-editor/EnvEditor.css
src/components/profile-editor/HooksEditor.css
src/components/profile-editor/MarketplaceEditor.css
src/components/profile-editor/PermissionsEditor.css
src/components/profile-editor/SandboxEditor.css
src/components/profile-editor/StringListEditor.css
```

---

## 通用约定

- 所有命令以仓库根目录 `/Users/maguowei/Work/AI/ai-manager` 为 cwd 执行。
- 每个 Task 末尾运行 `pnpm biome:ci` + `pnpm build` + `pnpm test` 三件套作为门禁。
- 每个 Task 独立 commit，commit message 用中文 type(scope) 风格（仓库现有风格）。
- 业务代码注释中文；测试断言中文 i18n 文本时使用 `t()` 渲染结果或具体翻译值。
- 测试选择器优先级：`getByRole(role, { name })` > `getByText` / `getByLabelText` > `[data-slot="..."]` > `data-testid`。**禁止** class 选择。

---

## Task 1：引入 Tailwind v4 + shadcn 基础设施

**Files:**
- Modify: `package.json`
- Modify: `vite.config.ts`
- Modify: `tsconfig.json`
- Create: `src/index.css`
- Create: `src/lib/utils.ts`
- Create: `components.json`
- Modify: `src/main.tsx`

- [ ] **Step 1.1：安装运行时依赖**

```bash
pnpm add tailwindcss@^4 @tailwindcss/vite@^4 tw-animate-css \
        class-variance-authority clsx tailwind-merge \
        lucide-react sonner
pnpm add -D @types/node
```

预期：`package.json` 新增依赖，`pnpm-lock.yaml` 更新，无 peer dep 错误。

- [ ] **Step 1.2：检查 CodeMirror 多版本未复发**

```bash
grep "'@codemirror/state@" pnpm-lock.yaml | sort -u | wc -l
```

预期：输出 `1`。如 ≥2，先用 `pnpm.overrides` 兜底再继续。

- [ ] **Step 1.3：修改 `vite.config.ts`**

完整新内容：

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

export default defineConfig(async () => ({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: "ws", host, port: 1421 } : undefined,
    watch: { ignored: ["**/src-tauri/**"] },
  },
}));
```

**注意**：仓库已有独立 `vitest.config.ts`，`test` 段不放在 `vite.config.ts`，下一步在 vitest.config 里加别名。

- [ ] **Step 1.3.1：修改现有 `vitest.config.ts` 加 `@/*` 别名**

完整新内容：

```ts
import { configDefaults, defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    exclude: [...configDefaults.exclude, "**/.worktrees/**", "**/.pnpm-store/**"],
  },
});
```

- [ ] **Step 1.4：修改 `tsconfig.json` 加路径别名**

将 `compilerOptions` 节末尾追加：

```jsonc
"baseUrl": ".",
"paths": { "@/*": ["./src/*"] }
```

- [ ] **Step 1.5：创建 `src/lib/utils.ts`**

```ts
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

- [ ] **Step 1.6：创建 `src/index.css`**

复制 spec §3 的完整 CSS（`@import` 三行 + `@custom-variant` + `:root` 浅色 OKLCH + `.dark` 深色 OKLCH + `@theme inline` 反查 + `@layer base` 基线）到 `src/index.css`。

- [ ] **Step 1.7：创建 `components.json`**

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

- [ ] **Step 1.8：修改 `src/main.tsx` 引入 `index.css`**

替换原有的两个 CSS import（`./styles/shared.css`、`./components/Toast.css`），改为单一 `import "./index.css";`。本步骤**保留** `<ToastProvider>` 暂不动（Task 4 处理）。

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import { ToastProvider } from "./hooks/useToast";
import { I18nProvider } from "./i18n";
import { installGlobalErrorLogging } from "./utils/logger";
import "./index.css";
import App from "./App";

installGlobalErrorLogging();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <I18nProvider>
      <ToastProvider>
        <App />
      </ToastProvider>
    </I18nProvider>
  </React.StrictMode>,
);
```

注意：本步骤**不**删除旧 CSS 文件——`App.css` / `shared.css` / `Toast.css` 保留在仓库中，但不再被 import；`App.tsx` 内仍 `import "./App.css"`，故视觉上仍受旧样式影响。这是预期的过渡态，让构建通过即可。

- [ ] **Step 1.9：构建验证**

```bash
pnpm biome:ci
```

预期：通过（旧文件未动，新文件少量）。

```bash
pnpm build
```

预期：构建成功，产出 `dist/`，无类型错误。

```bash
pnpm test
```

预期：现有测试全通过（本 Task 未触及业务测试）。

- [ ] **Step 1.10：commit**

```bash
git add package.json pnpm-lock.yaml vite.config.ts vitest.config.ts \
        tsconfig.json src/index.css src/lib/utils.ts components.json src/main.tsx
git commit -m "$(cat <<'EOF'
chore(deps): 引入 tailwind v4 + shadcn 基础设施

新增 tailwindcss / @tailwindcss/vite / tw-animate-css /
class-variance-authority / clsx / tailwind-merge /
lucide-react / sonner 依赖；
配置 @/ 路径别名；新建 src/index.css 作为 Tailwind v4 入口；
新建 src/lib/utils.ts 提供 cn 工具；新建 components.json。

EOF
)"
```

预期：lefthook pre-commit 通过。

---

## Task 2：shadcn CLI 一次性引入 28 个原子组件

**Files:**
- Create: `src/components/ui/*.tsx`（28 个文件）
- Modify: `src/components/ui/form.tsx`（i18n FormMessage 包装）

- [ ] **Step 2.1：CLI 一次性 add**

```bash
pnpm dlx shadcn@latest add button input textarea label form select \
  checkbox switch radio-group slider tabs tooltip card badge separator \
  scroll-area skeleton sheet dialog alert-dialog dropdown-menu popover \
  command sonner toggle toggle-group avatar collapsible
```

预期：在 `src/components/ui/` 下生成 28 个 `.tsx` 文件 + 自动安装 `@radix-ui/*` 依赖。如 CLI 询问覆盖确认，全部选 yes（仅追加新文件）。

- [ ] **Step 2.2：检查生成结果**

```bash
ls src/components/ui/
```

预期：包含 button.tsx / input.tsx / form.tsx / sheet.tsx / dialog.tsx / alert-dialog.tsx 等共 ≥28 个文件。

- [ ] **Step 2.3：修改 `src/components/ui/form.tsx` 的 `FormMessage` 加 i18n 包装**

定位 `FormMessage` 函数（shadcn 生成的版本），改为：

```tsx
import { useI18n, type TranslationKey } from "@/i18n";

function FormMessage({ className, children, ...props }: React.ComponentProps<"p">) {
  const { error, formMessageId } = useFormField();
  const { t } = useI18n();
  // 业务定制：FormMessage 渲染 i18n key 而非原始字符串
  const body = error ? t(String(error.message) as TranslationKey) : children;
  if (!body) return null;
  return (
    <p
      data-slot="form-message"
      id={formMessageId}
      className={cn("text-destructive text-sm", className)}
      {...props}
    >
      {body}
    </p>
  );
}
```

- [ ] **Step 2.4：写新增 hook 单测——`useFormMessage` i18n 包装**

创建 `src/components/ui/__tests__/form.test.tsx`：

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { useForm } from "react-hook-form";
import { Form, FormField, FormItem, FormControl, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { I18nProvider } from "@/i18n";

function Harness() {
  const form = useForm({ defaultValues: { name: "" } });
  return (
    <I18nProvider>
      <Form {...form}>
        <form>
          <FormField
            control={form.control}
            name="name"
            rules={{ required: "form.required" }}
            render={({ field }) => (
              <FormItem>
                <FormControl><Input {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <button type="button" onClick={() => form.trigger("name")}>trigger</button>
        </form>
      </Form>
    </I18nProvider>
  );
}

describe("FormMessage i18n", () => {
  it("把 TranslationKey 渲染为 t() 文本", async () => {
    const { default: userEvent } = await import("@testing-library/user-event");
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "trigger" }));
    // 翻译后的文本应当出现，"form.required" 这个 key 不能原样泄露到 DOM
    expect(screen.queryByText("form.required")).toBeNull();
  });
});
```

补依赖：

```bash
pnpm add -D @testing-library/user-event
```

- [ ] **Step 2.5：跑新测试看红再看绿**

```bash
pnpm test src/components/ui/__tests__/form.test.tsx -- --run
```

预期：通过（FormMessage 已修改，测试应直接绿）。如失败先调代码。

- [ ] **Step 2.6：构建验证**

```bash
pnpm biome:ci && pnpm build && pnpm test
```

预期：全绿。新原子组件未被业务引用，仅类型检查 + 测试通过。

- [ ] **Step 2.7：commit**

```bash
git add src/components/ui/ package.json pnpm-lock.yaml \
        src/components/ui/__tests__/form.test.tsx
git commit -m "$(cat <<'EOF'
feat(ui): shadcn CLI 一次性引入 28 个原子组件

执行 pnpm dlx shadcn@latest add 一次性产出 button/input/form/
sheet/dialog/alert-dialog/dropdown-menu/popover/sonner/tooltip
等原子组件；FormMessage 加业务定制：把 i18n TranslationKey
渲染为 t() 文本；新增 form i18n 包装单测。

EOF
)"
```

---

## Task 3：ThemeProvider 接管主题状态

**Files:**
- Create: `src/components/theme-provider.tsx`
- Create: `src/components/__tests__/theme-provider.test.tsx`
- Create: `src/hooks/useCodeMirrorTheme.ts`
- Create: `src/hooks/useIsDark.ts`
- Modify: `src/hooks/useEditorTheme.ts`（删除或改为兼容转发）
- Create: `src/hooks/__tests__/useCodeMirrorTheme.test.tsx`
- Modify: `src/i18n.ts`（迁出主题逻辑）
- Modify: `src/main.tsx`（注入 `<ThemeProvider>`）
- Modify: `src/components/MemoryEditor.tsx`
- Modify: `src/components/SkillEditor.tsx`
- Modify: `src/components/ClaudeOverviewPage.tsx`
- Modify: `src/components/ConfigPreview.tsx`
- Modify: `src/components/SettingsDrawer.tsx`
- Modify: `src/components/profile-editor/ModelTestResultDialog.tsx`
- Modify: `src/App.test.tsx`（断言 `.dark` 替代 `data-theme`）
- Modify: `src/i18n.test.tsx`

- [ ] **Step 3.1：先读 `src/i18n.ts:2120-2150` 与所有"主题"相关函数定位逻辑边界**

```bash
grep -n "data-theme\|prefersDark\|setAttribute\|theme" src/i18n.ts | head -40
```

输出供下一步参考；记录现有的：状态变量名、setter 名、持久化 key。

- [ ] **Step 3.2：创建 `src/hooks/useIsDark.ts`**

```ts
import { useEffect, useState } from "react";

/** 监听 <html> 的 class 是否含 dark，供 CodeMirror / 高亮等响应主题切换 */
export function useIsDark(): boolean {
  const [isDark, setIsDark] = useState(() =>
    typeof document !== "undefined" && document.documentElement.classList.contains("dark"),
  );
  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains("dark"));
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => observer.disconnect();
  }, []);
  return isDark;
}
```

- [ ] **Step 3.3：创建 `src/hooks/useCodeMirrorTheme.ts`**

```ts
import { xcodeDark, xcodeLight } from "@uiw/codemirror-theme-xcode";
import { useIsDark } from "./useIsDark";

/** 根据当前主题返回 CodeMirror xcode 扩展 */
export function useCodeMirrorTheme() {
  const isDark = useIsDark();
  return isDark ? xcodeDark : xcodeLight;
}
```

- [ ] **Step 3.4：写 useCodeMirrorTheme 测试（先红）**

`src/hooks/__tests__/useCodeMirrorTheme.test.tsx`：

```tsx
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useCodeMirrorTheme } from "@/hooks/useCodeMirrorTheme";
import { xcodeDark, xcodeLight } from "@uiw/codemirror-theme-xcode";

describe("useCodeMirrorTheme", () => {
  beforeEach(() => {
    document.documentElement.classList.remove("dark");
  });
  afterEach(() => {
    document.documentElement.classList.remove("dark");
  });

  it("html 无 dark class 时返回 xcodeLight", () => {
    const { result } = renderHook(() => useCodeMirrorTheme());
    expect(result.current).toBe(xcodeLight);
  });

  it("dark class 加上后切换到 xcodeDark", () => {
    const { result } = renderHook(() => useCodeMirrorTheme());
    expect(result.current).toBe(xcodeLight);
    act(() => {
      document.documentElement.classList.add("dark");
    });
    expect(result.current).toBe(xcodeDark);
  });
});
```

```bash
pnpm test src/hooks/__tests__/useCodeMirrorTheme.test.tsx -- --run
```

预期：通过（hook 已写好）。

- [ ] **Step 3.5：写 ThemeProvider 测试（先红）**

`src/components/__tests__/theme-provider.test.tsx`：

```tsx
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { ThemeProvider, useTheme } from "@/components/theme-provider";

function Probe() {
  const { theme, setTheme, isDark } = useTheme();
  return (
    <div>
      <span data-testid="theme">{theme}</span>
      <span data-testid="isDark">{String(isDark)}</span>
      <button type="button" onClick={() => setTheme("dark")}>to-dark</button>
      <button type="button" onClick={() => setTheme("light")}>to-light</button>
      <button type="button" onClick={() => setTheme("system")}>to-system</button>
    </div>
  );
}

describe("ThemeProvider", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove("dark");
  });

  it("默认 system；setTheme('dark') 写入 .dark class", async () => {
    const { default: userEvent } = await import("@testing-library/user-event");
    const user = userEvent.setup();
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    expect(screen.getByTestId("theme")).toHaveTextContent("system");
    await user.click(screen.getByRole("button", { name: "to-dark" }));
    expect(screen.getByTestId("theme")).toHaveTextContent("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("setTheme('light') 移除 .dark class", async () => {
    const { default: userEvent } = await import("@testing-library/user-event");
    const user = userEvent.setup();
    document.documentElement.classList.add("dark");
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    await user.click(screen.getByRole("button", { name: "to-light" }));
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("持久化：刷新后从 localStorage 还原", () => {
    localStorage.setItem("ai-manager.theme", "dark");
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    expect(screen.getByTestId("theme")).toHaveTextContent("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });
});
```

```bash
pnpm test src/components/__tests__/theme-provider.test.tsx -- --run
```

预期：FAIL（ThemeProvider 还不存在）。

- [ ] **Step 3.6：实现 `src/components/theme-provider.tsx`**

```tsx
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

export type Theme = "system" | "light" | "dark";

interface ThemeContextValue {
  theme: Theme;
  setTheme: (t: Theme) => void;
  isDark: boolean;
}

const STORAGE_KEY = "ai-manager.theme";

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readStoredTheme(): Theme {
  if (typeof localStorage === "undefined") return "system";
  const v = localStorage.getItem(STORAGE_KEY);
  if (v === "dark" || v === "light" || v === "system") return v;
  try {
    const legacy = localStorage.getItem("ai-manager-settings");
    const parsed = legacy ? JSON.parse(legacy) : null;
    if (
      parsed &&
      typeof parsed === "object" &&
      (parsed.theme === "dark" || parsed.theme === "light" || parsed.theme === "system")
    ) {
      return parsed.theme;
    }
  } catch {
    // 忽略损坏的旧本地缓存
  }
  return "system";
}

function prefersDark(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function applyDarkClass(isDark: boolean) {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("dark", isDark);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(readStoredTheme);
  const [systemDark, setSystemDark] = useState<boolean>(prefersDark);

  // 监听 system 主题变化
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);

  const isDark = theme === "system" ? systemDark : theme === "dark";

  // 写入 DOM
  useEffect(() => {
    applyDarkClass(isDark);
  }, [isDark]);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // 桌面应用环境下 localStorage 始终可写；忽略异常
    }
  }, []);

  const value = useMemo(() => ({ theme, setTheme, isDark }), [theme, setTheme, isDark]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme 必须在 ThemeProvider 内使用");
  return ctx;
}
```

```bash
pnpm test src/components/__tests__/theme-provider.test.tsx -- --run
```

预期：PASS。

- [ ] **Step 3.7：迁出 `src/i18n.ts` 中的主题逻辑**

操作：定位 `i18n.ts` 中所有 `data-theme` / `setAttribute` / `prefersDark` / 主题状态/setter/storage 相关代码块（预计在第 2100-2160 行附近的 `applyTheme` 函数与 `useThemeMode` hook 等处）。删除这些代码段；保留语言/文案/`useI18n` 公共 API。被删除的存储 key 如与 `theme-provider` 中的 `STORAGE_KEY` 冲突，统一为 `ai-manager.theme`（如原 key 不同，在 ThemeProvider 中读取时一次性兼容旧 key 后写新 key）。

兼容旧 key 的实现（如有需要替换 `readStoredTheme`）：

```ts
function readStoredTheme(): Theme {
  if (typeof localStorage === "undefined") return "system";
  // 读新 key
  const v = localStorage.getItem(STORAGE_KEY);
  if (v === "dark" || v === "light" || v === "system") return v;
  // 兼容旧 key：i18n.ts 原本把 language/theme 放在同一个 ai-manager-settings JSON 中
  try {
    const legacy = localStorage.getItem("ai-manager-settings");
    const parsed = legacy ? JSON.parse(legacy) : null;
    if (
      parsed &&
      typeof parsed === "object" &&
      (parsed.theme === "dark" || parsed.theme === "light" || parsed.theme === "system")
    ) {
      return parsed.theme;
    }
  } catch {
    // 忽略损坏的旧本地缓存
  }
  return "system";
}
```

- [ ] **Step 3.8：迁移所有 `useI18n()` 主题消费者**

在删除 `i18n.ts` 的 `theme` / `setTheme` 前，先把所有主题读取点迁到 `useTheme()` 或 `useIsDark()`；否则 `pnpm build` 会直接因 `useI18n()` 返回类型变化失败。

```bash
grep -rn "useI18n().*theme\|theme, setTheme\|setTheme\|useEditorTheme" src/ --include="*.ts" --include="*.tsx"
```

必须处理的当前命中：
- `src/components/SettingsDrawer.tsx`：`const { t, language } = useI18n()`；`const { theme, setTheme } = useTheme()`
- `src/components/MemoryEditor.tsx`：`const { t } = useI18n()`；Markdown preview 主题用 `useTheme().isDark` 或 `useIsDark()`
- `src/components/ClaudeOverviewPage.tsx`：`const { language, t } = useI18n()`；Pierre / Markdown 主题用 `useTheme().theme` + `isDark`
- `src/components/profile-editor/ModelTestResultDialog.tsx`：`const { t } = useI18n()`；语法高亮主题用 `useTheme()` / `useIsDark()`
- `src/components/ConfigPreview.tsx`、`src/components/SkillEditor.tsx`、`src/components/MemoryEditor.tsx`：把 `useEditorTheme()` import 替换为 `useCodeMirrorTheme()`；随后删除 `src/hooks/useEditorTheme.ts` 或改为转发新 hook，避免旧 hook 继续依赖 `useI18n().theme`

完成后再跑：

```bash
grep -rn "theme, setTheme\|setTheme\|useEditorTheme\|const .*theme.*= useI18n" src/ --include="*.ts" --include="*.tsx"
```

预期：没有从 `useI18n()` 读取主题的命中；仅允许 `useTheme()` 相关命中。

- [ ] **Step 3.9：替换业务代码中所有 `data-theme` 使用点**

```bash
grep -rn "data-theme\|getAttribute(\"data-theme\"\|setAttribute(\"data-theme" src/ --include="*.ts" --include="*.tsx"
```

针对每条命中：
- `App.test.tsx:377` `removeAttribute("data-theme")` → `classList.remove("dark")`
- `ModelTestResultDialog.tsx:64` `getAttribute("data-theme") === "light"` → `!document.documentElement.classList.contains("dark")`
- `i18n.test.tsx` 涉及 data-theme 断言的：换为 `classList.contains("dark")`

- [ ] **Step 3.10：修改 `src/main.tsx` 注入 `<ThemeProvider>`**

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import { ToastProvider } from "./hooks/useToast";
import { I18nProvider } from "./i18n";
import { ThemeProvider } from "./components/theme-provider";
import { installGlobalErrorLogging } from "./utils/logger";
import "./index.css";
import App from "./App";

installGlobalErrorLogging();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ThemeProvider>
      <I18nProvider>
        <ToastProvider>
          <App />
        </ToastProvider>
      </I18nProvider>
    </ThemeProvider>
  </React.StrictMode>,
);
```

- [ ] **Step 3.11：构建 + 测试**

```bash
pnpm biome:ci && pnpm build && pnpm test
```

预期：全绿。如 i18n.test.tsx 或 App.test.tsx 中残留 data-theme 断言导致红色，定位修复。

- [ ] **Step 3.12：commit**

```bash
git add src/components/theme-provider.tsx \
        src/components/__tests__/theme-provider.test.tsx \
        src/hooks/useIsDark.ts \
        src/hooks/useCodeMirrorTheme.ts \
        src/hooks/useEditorTheme.ts \
        src/hooks/__tests__/useCodeMirrorTheme.test.tsx \
        src/i18n.ts src/main.tsx \
        src/components/MemoryEditor.tsx \
        src/components/SkillEditor.tsx \
        src/components/ClaudeOverviewPage.tsx \
        src/components/ConfigPreview.tsx \
        src/components/SettingsDrawer.tsx \
        src/App.test.tsx src/i18n.test.tsx \
        src/components/profile-editor/ModelTestResultDialog.tsx
git commit -m "$(cat <<'EOF'
feat(theme): ThemeProvider 接管主题状态 + dark class 切换

把主题状态/持久化/DOM 写入逻辑从 i18n.ts 整体迁出到新的
ThemeProvider；DOM 写入由 setAttribute("data-theme") 改为
classList.toggle("dark")；新增 useIsDark / useCodeMirrorTheme
hook；所有 useI18n 主题消费者迁到 useTheme / useIsDark；
ModelTestResultDialog 与既有测试同步替换 data-theme 为 .dark 检测。

EOF
)"
```

---

## Task 4：useToast 接 sonner

**Files:**
- Modify: `src/hooks/useToast.tsx`
- Create: `src/hooks/__tests__/useToast.test.tsx`
- Modify: `src/main.tsx`
- Modify: `src/App.tsx`
- Delete: `src/components/Toast.css`

- [ ] **Step 4.1：写 useToast 测试（先红）**

`src/hooks/__tests__/useToast.test.tsx`：

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

import { toast } from "sonner";
import { useToast } from "@/hooks/useToast";

describe("useToast (sonner adapter)", () => {
  beforeEach(() => {
    vi.mocked(toast.success).mockClear();
    vi.mocked(toast.error).mockClear();
  });

  it("默认 success 走 toast.success", () => {
    const { result } = renderHook(() => useToast());
    act(() => result.current.showToast("ok"));
    expect(toast.success).toHaveBeenCalledWith("ok");
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("error 类型走 toast.error", () => {
    const { result } = renderHook(() => useToast());
    act(() => result.current.showToast("bad", "error"));
    expect(toast.error).toHaveBeenCalledWith("bad");
    expect(toast.success).not.toHaveBeenCalled();
  });
});
```

```bash
pnpm test src/hooks/__tests__/useToast.test.tsx -- --run
```

预期：FAIL（旧 useToast 不依赖 sonner）。

- [ ] **Step 4.2：重写 `src/hooks/useToast.tsx`（保留导出名 `ToastProvider` 与 `useToast`，但 Provider 退化为 passthrough）**

```tsx
import type { ReactNode } from "react";
import { toast } from "sonner";

type ToastType = "success" | "error";

/** 兼容性 Provider：保留命名以减少 main.tsx 改动惯性；不再持有状态 */
export function ToastProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

export function useToast() {
  return {
    showToast: (message: string, type: ToastType = "success") => {
      if (type === "error") toast.error(message);
      else toast.success(message);
    },
  };
}
```

```bash
pnpm test src/hooks/__tests__/useToast.test.tsx -- --run
```

预期：PASS。

- [ ] **Step 4.3：修改 `src/main.tsx` 移除 ToastProvider 包裹（不再需要）**

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import { I18nProvider } from "./i18n";
import { ThemeProvider } from "./components/theme-provider";
import { installGlobalErrorLogging } from "./utils/logger";
import "./index.css";
import App from "./App";

installGlobalErrorLogging();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ThemeProvider>
      <I18nProvider>
        <App />
      </I18nProvider>
    </ThemeProvider>
  </React.StrictMode>,
);
```

- [ ] **Step 4.4：修改 `src/App.tsx` 在 return 末尾挂 `<Toaster>` + `<TooltipProvider>`**

定位 `App.tsx` 的 return 块，包入 `<TooltipProvider>` 并在最外层 fragment 末尾加 `<Toaster>`：

```tsx
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
// ...

return (
  <TooltipProvider delayDuration={200}>
    <div className="app-container">
      {/* 现有内容保持不动；类名后续 Task 6 会替换 */}
      <Sidebar ... />
      <div className="content-area">{/* tabs */}</div>
      {isSettingsOpen && <SettingsDrawer onClose={closeSettingsDrawer} />}
    </div>
    <Toaster richColors closeButton position="top-right" />
  </TooltipProvider>
);
```

- [ ] **Step 4.5：删除 `src/components/Toast.css`**

```bash
git rm src/components/Toast.css
```

注意：Toast.css 已在 Task 1 不再被 import；此处只是把文件清掉。

- [ ] **Step 4.6：构建 + 测试**

```bash
pnpm biome:ci && pnpm build && pnpm test
```

预期：全绿。

- [ ] **Step 4.7：commit**

```bash
git add src/hooks/useToast.tsx src/hooks/__tests__/useToast.test.tsx \
        src/main.tsx src/App.tsx
git commit -m "$(cat <<'EOF'
refactor(toast): useToast 内部接 sonner，App.tsx 顶层挂 Toaster

useToast 公共 API 不变；ToastProvider 退化为 passthrough；
main.tsx 移除 ToastProvider；App.tsx 包裹 TooltipProvider 并
在末尾挂 sonner Toaster；删除 Toast.css。

EOF
)"
```

---

## Task 5：全面替换为 lucide-react

**Files:**
- Delete: `src/components/Icons.tsx`
- Modify: `src/components/Sidebar.tsx`
- Modify: 所有引用 `Icons.tsx` 的业务组件

- [ ] **Step 5.1：盘点所有 Icons.tsx 调用点**

```bash
grep -rn "from \"./Icons\"\|from \"../Icons\"\|from \"\\./components/Icons\"" src/ --include="*.tsx"
```

记录命中文件清单（约 10-15 个文件）。

- [ ] **Step 5.2：盘点所有内联 SVG**

```bash
grep -rn "<svg" src/components/ --include="*.tsx" | wc -l
```

预期：≥30 处，主要在 Sidebar.tsx + 各页面。

- [ ] **Step 5.3：建立映射表**

| 现有名 | lucide 名 |
|---|---|
| `InfoIcon` | `Info` |
| `TrashIcon` | `Trash2` |
| `ChevronLeftIcon` | `ChevronLeft` |
| `ChevronRightIcon` | `ChevronRight` |
| `ChevronDownIcon` | `ChevronDown` |
| `SettingsIcon` | `Settings` |
| `SearchIcon` | `Search` |
| `PlusIcon` | `Plus` |
| `CloseIcon` / `XIcon` | `X` |
| `CheckIcon` | `Check` |
| `CopyIcon` | `Copy` |
| `ExternalLinkIcon` | `ExternalLink` |
| `FolderIcon` | `Folder` |
| `ClockIcon` | `Clock` |
| `BarChartIcon` | `BarChart3` |
| `DollarIcon` | `DollarSign` |
| Sidebar 配置图标 | `SlidersHorizontal` |
| Sidebar 记忆图标 | `Brain` |
| Sidebar 技能图标 | `Zap` |
| Sidebar provider 图标 | `Server` |
| Sidebar projects 图标 | `FolderOpen` |
| Sidebar history 图标 | `Clock` |
| Sidebar stats 图标 | `BarChart3` |
| Sidebar usage 图标 | `DollarSign` |

- [ ] **Step 5.4：在每个文件内替换 import 与 JSX**

对每个命中文件，把 `import { XxxIcon } from "./Icons"` 改为 `import { LucideName } from "lucide-react"`，JSX 里 `<XxxIcon size={n}/>` 改为 `<LucideName className="size-n" />`（n 用 Tailwind 尺寸：14→`size-3.5`、16→`size-4`、20→`size-5`、24→`size-6`）。

`Sidebar.tsx` 内的内联 SVG（约 9-10 处）：用映射表替换 + Tailwind size 类。

`Sidebar.tsx` Logo 与按钮的样式留到 Task 6 才换；本步骤只动图标。

- [ ] **Step 5.5：删除 `src/components/Icons.tsx`**

```bash
git rm src/components/Icons.tsx
```

- [ ] **Step 5.6：跑 typecheck + 测试**

```bash
pnpm build
```

预期：成功。如有未替换到的 import 残留会报 TS 错误，根据错误定位修复。

```bash
pnpm test
```

预期：全绿（如有快照测试断言图标 SVG 节点结构会失败，删除或更新这些断言为 lucide 的 svg）。

- [ ] **Step 5.7：commit**

```bash
git add -A src/components/
git commit -m "$(cat <<'EOF'
refactor(icons): 全面替换为 lucide-react

删除 src/components/Icons.tsx；Sidebar 与各页面内联 SVG /
旧 Icon 导出全部替换为 lucide-react 等价图标；尺寸用 Tailwind
size 类（size-3.5 / size-4 / size-5 / size-6）。

EOF
)"
```

---

## Task 6：App / Sidebar / 公共布局 Tailwind 化

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/Sidebar.tsx`
- Delete: `src/App.css` `src/components/Sidebar.css` `src/styles/shared.css`

- [ ] **Step 6.1：先确认 `App.tsx` 中仍有 `import "./App.css"`**

```bash
grep -n "import \"\\./App.css" src/App.tsx
```

存在则进入 6.2 删除并替换类名。

- [ ] **Step 6.2：重写 `src/App.tsx`（结构不变，类名改 Tailwind，删除 App.css import）**

```tsx
import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import ClaudeOverviewPage from "./components/ClaudeOverviewPage";
import HistoryPage from "./components/HistoryPage";
import MemoryPage from "./components/MemoryPage";
import PresetsPage from "./components/PresetsPage";
import ProfilesPage from "./components/ProfilesPage";
import ProjectsPage from "./components/ProjectsPage";
import SettingsDrawer from "./components/SettingsDrawer";
import Sidebar from "./components/Sidebar";
import SkillsPage from "./components/SkillsPage";
import StatsPage from "./components/StatsPage";
import UsagePage from "./components/UsagePage";
import useTauriEvent from "./hooks/useTauriEvent";
import { useToast } from "./hooks/useToast";
import { useI18n } from "./i18n";
import { type ConfigWorkspace, isTauri, type TabType } from "./types";

const EMPTY_WORKSPACE: ConfigWorkspace = {
  app: {
    showTrayTitle: true,
    showTraySessions: true,
    uiLanguage: "zh",
    defaultTerminalApp: "terminal",
    defaultEditorApp: null,
  },
  builtinPresets: [],
  customPresets: [],
  profiles: [],
  bindings: {},
};

function App() {
  const { t } = useI18n();
  const { showToast } = useToast();
  const [workspace, setWorkspace] = useState<ConfigWorkspace>(EMPTY_WORKSPACE);
  const [activeTab, setActiveTab] = useState<TabType>("configs");
  const [loading, setLoading] = useState(true);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isDetailDrawerOpen, setIsDetailDrawerOpen] = useState(false);
  const previousContentTabRef = useRef<TabType>("configs");

  const loadWorkspace = useCallback(async () => {
    if (!isTauri()) {
      setWorkspace(EMPTY_WORKSPACE);
      setLoading(false);
      return;
    }
    try {
      const next = await invoke<ConfigWorkspace>("get_config_workspace");
      setWorkspace(next);
    } catch {
      setWorkspace(EMPTY_WORKSPACE);
      showToast("加载配置工作区失败", "error");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { void loadWorkspace(); }, [loadWorkspace]);
  useTauriEvent<void>("config-workspace-changed", () => { void loadWorkspace(); });
  useTauriEvent<string>("navigate-to-tab", (tab) => {
    const next = tab as TabType;
    if (next !== "claudeOverview") previousContentTabRef.current = next;
    setActiveTab(next);
    setIsDetailDrawerOpen(false);
  });

  const closeSettingsDrawer = useCallback(() => {
    setIsSettingsOpen(false);
    void loadWorkspace();
  }, [loadWorkspace]);

  const handleSettingsClick = useCallback(() => {
    if (isSettingsOpen) closeSettingsDrawer();
    else setIsSettingsOpen(true);
  }, [closeSettingsDrawer, isSettingsOpen]);

  const handleClaudeOverviewClick = useCallback(() => {
    setIsSettingsOpen(false);
    setIsDetailDrawerOpen(false);
    if (activeTab === "claudeOverview") {
      setActiveTab(previousContentTabRef.current);
      return;
    }
    previousContentTabRef.current = activeTab;
    setActiveTab("claudeOverview");
  }, [activeTab]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background text-muted-foreground">
        {t("loading")}
      </div>
    );
  }

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex h-screen overflow-hidden bg-background text-foreground">
        <Sidebar
          activeTab={activeTab}
          onTabChange={(tab) => {
            if (tab !== "claudeOverview") previousContentTabRef.current = tab;
            setActiveTab(tab);
            setIsDetailDrawerOpen(false);
          }}
          onClaudeOverviewClick={handleClaudeOverviewClick}
          onSettingsClick={handleSettingsClick}
        />
        <div className="relative flex flex-1 overflow-hidden">
          {activeTab === "stats" ? (
            <StatsPage />
          ) : activeTab === "usage" ? (
            <UsagePage />
          ) : activeTab === "claudeOverview" ? (
            <ClaudeOverviewPage />
          ) : activeTab === "projects" ? (
            <ProjectsPage />
          ) : activeTab === "history" ? (
            <HistoryPage />
          ) : activeTab === "providers" ? (
            <PresetsPage workspace={workspace} onWorkspaceChange={loadWorkspace} />
          ) : activeTab === "configs" ? (
            <ProfilesPage workspace={workspace} onWorkspaceChange={loadWorkspace} />
          ) : (
            <div
              className={cn(
                "flex shrink-0 flex-col overflow-y-auto overflow-x-hidden bg-card transition-[width] duration-300",
                isDetailDrawerOpen ? "w-70" : "w-90",
              )}
            >
              {activeTab === "memory" && <MemoryPage onDrawerChange={setIsDetailDrawerOpen} />}
              {activeTab === "skills" && <SkillsPage onDrawerChange={setIsDetailDrawerOpen} />}
            </div>
          )}
        </div>
        {isSettingsOpen && <SettingsDrawer onClose={closeSettingsDrawer} />}
      </div>
      <Toaster richColors closeButton position="top-right" />
    </TooltipProvider>
  );
}

export default App;
```

注意：上面顶层加了 `import { cn } from "@/lib/utils";`（如缺失需补）。

- [ ] **Step 6.3：重写 `src/components/Sidebar.tsx`**

完整替换为 Tailwind + lucide + Tooltip：

```tsx
import { Brain, Folder, Clock, BarChart3, DollarSign, SlidersHorizontal,
  Server, Zap, Settings as SettingsIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useI18n, type TranslationKey } from "@/i18n";
import type { TabType } from "@/types";

interface SidebarProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
  onClaudeOverviewClick: () => void;
  onSettingsClick: () => void;
}

interface NavItem {
  key: TabType;
  label: TranslationKey;
  icon: React.ComponentType<{ className?: string }>;
}

const NAV_ITEMS: NavItem[] = [
  { key: "configs",  label: "nav.configs",  icon: SlidersHorizontal },
  { key: "memory",   label: "nav.memory",   icon: Brain },
  { key: "skills",   label: "nav.skills",   icon: Zap },
  { key: "providers",label: "nav.providers",icon: Server },
  { key: "projects", label: "nav.projects", icon: Folder },
  { key: "history",  label: "nav.history",  icon: Clock },
  { key: "stats",    label: "nav.stats",    icon: BarChart3 },
  { key: "usage",    label: "nav.usage",    icon: DollarSign },
];

function Sidebar({ activeTab, onTabChange, onClaudeOverviewClick, onSettingsClick }: SidebarProps) {
  const { t } = useI18n();
  return (
    <nav
      className="flex h-screen w-15 shrink-0 flex-col items-center gap-1 border-r bg-sidebar py-3"
      aria-label={t("nav.ariaLabel")}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant={activeTab === "claudeOverview" ? "secondary" : "ghost"}
            size="icon"
            className="size-10 rounded-lg font-semibold"
            onClick={onClaudeOverviewClick}
            aria-label={t("nav.claudeOverview")}
            aria-current={activeTab === "claudeOverview" ? "page" : undefined}
          >
            AI
          </Button>
        </TooltipTrigger>
        <TooltipContent side="right">{t("nav.claudeOverview")}</TooltipContent>
      </Tooltip>

      <div className="flex flex-1 flex-col items-center gap-1 pt-2">
        {NAV_ITEMS.map(({ key, label, icon: Icon }) => (
          <Tooltip key={key}>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant={activeTab === key ? "secondary" : "ghost"}
                size="icon"
                className={cn("size-10 rounded-lg")}
                onClick={() => onTabChange(key)}
                aria-label={t(label)}
                aria-current={activeTab === key ? "page" : undefined}
                data-active={activeTab === key}
              >
                <Icon className="size-5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">{t(label)}</TooltipContent>
          </Tooltip>
        ))}
      </div>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-10 rounded-lg"
            onClick={onSettingsClick}
            aria-label={t("header.settings")}
          >
            <SettingsIcon className="size-5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="right">{t("header.settings")}</TooltipContent>
      </Tooltip>
    </nav>
  );
}

export default Sidebar;
```

- [ ] **Step 6.4：删除三个 CSS 文件**

```bash
git rm src/App.css src/components/Sidebar.css src/styles/shared.css
rmdir src/styles 2>/dev/null || true
```

- [ ] **Step 6.5：跑 typecheck + 测试**

```bash
pnpm biome:ci && pnpm build && pnpm test
```

预期：全绿。`App.test.tsx` 中可能有针对 `.app-container` / `.sidebar` / `.nav-item` 的选择器，全部改为 `getByRole("navigation", { name: ... })` / `getByRole("button", { name: ... })`。

- [ ] **Step 6.6：commit**

```bash
git add src/App.tsx src/components/Sidebar.tsx src/App.test.tsx
git commit -m "$(cat <<'EOF'
refactor(shell): App / Sidebar / 公共布局 Tailwind 化

App.tsx 顶层包 TooltipProvider，末尾挂 sonner Toaster，
移除 App.css import，类名全部 Tailwind 化；
Sidebar 改 lucide-react + Tooltip + Button(variant=ghost/secondary)；
删除 App.css / Sidebar.css / styles/shared.css。

EOF
)"
```

---

## Task 7：Drawer / ConfirmDialog → Sheet / AlertDialog

**Files:**
- Delete: `src/components/Drawer.tsx` `src/components/ConfirmDialog.tsx` `src/components/ConfirmDialog.css`
- Modify: `src/components/SettingsDrawer.tsx` (+ 删除 `.css`)
- Modify: `src/components/SessionDetailDrawer.tsx` (+ 删除 `.css`)
- Modify: `src/components/SystemInfoDialog.tsx` (+ 删除 `.css`)
- Modify: `src/components/profile-editor/ModelTestResultDialog.tsx`
- Modify: 所有调用 `<Drawer>` 与 `<ConfirmDialog>` 的页面

- [ ] **Step 7.1：盘点 Drawer / ConfirmDialog 引用**

```bash
grep -rn "from \"./Drawer\"\|from \"../Drawer\"\|<Drawer\|<ConfirmDialog" src/ --include="*.tsx"
```

记录命中。

- [ ] **Step 7.2：把所有 `<Drawer>` 调用点改为 shadcn `<Sheet>`**

模式：
```tsx
// 旧
<Drawer onClose={onClose}>{content}</Drawer>

// 新
<Sheet open onOpenChange={(o) => !o && onClose()}>
  <SheetContent side="right" className="flex w-full flex-col p-0 sm:max-w-xl">
    {content}
  </SheetContent>
</Sheet>
```

按调用点逐一改，导入 `import { Sheet, SheetContent } from "@/components/ui/sheet";`。`SettingsDrawer` 与 `SessionDetailDrawer` 内部本身就是抽屉壳，把外层 `<>` 改为 `<Sheet open onOpenChange={(o) => !o && onClose()}> <SheetContent side="right" ...>`。

- [ ] **Step 7.3：把所有 `<ConfirmDialog>` 调用点改为 shadcn `<AlertDialog>`**

模式：
```tsx
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// 旧
<ConfirmDialog title=... message=... confirmText=... cancelText=...
               onConfirm=... onCancel=... danger />

// 新
<AlertDialog open onOpenChange={(o) => !o && onCancel()}>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>{title}</AlertDialogTitle>
      <AlertDialogDescription>{message}</AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel onClick={onCancel}>{cancelText}</AlertDialogCancel>
      <AlertDialogAction
        className={danger ? cn(buttonVariants({ variant: "destructive" })) : undefined}
        onClick={onConfirm}
      >
        {confirmText}
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

`useEscapeKey` 不再需要（AlertDialog/Sheet 自带 ESC）；删除相关调用。

- [ ] **Step 7.4：把 `SystemInfoDialog` 改为 shadcn `<Dialog>`**

模式：
```tsx
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

<Dialog open onOpenChange={(o) => !o && onClose()}>
  <DialogContent className="max-w-2xl">
    <DialogHeader><DialogTitle>{...}</DialogTitle></DialogHeader>
    {/* 内容 */}
  </DialogContent>
</Dialog>
```

- [ ] **Step 7.5：把 `ModelTestResultDialog` 改为 shadcn `<Dialog>`**

同上模式；CodeMirror 已在 Task 3 改用 `useCodeMirrorTheme`，本步骤仅改外壳。

- [ ] **Step 7.6：删除 4 个文件**

```bash
git rm src/components/Drawer.tsx \
       src/components/ConfirmDialog.tsx \
       src/components/ConfirmDialog.css \
       src/components/SettingsDrawer.css \
       src/components/SessionDetailDrawer.css \
       src/components/SystemInfoDialog.css
```

- [ ] **Step 7.7：跑 typecheck + 测试**

```bash
pnpm biome:ci && pnpm build && pnpm test
```

预期：全绿。如有针对 `.confirm-overlay` / `.drawer-overlay` 的测试断言，改为 `getByRole("alertdialog")` / `getByRole("dialog")`。

- [ ] **Step 7.8：commit**

```bash
git add -A src/components/
git commit -m "$(cat <<'EOF'
refactor(drawer-dialog): Drawer/ConfirmDialog → shadcn Sheet/AlertDialog

删除 Drawer.tsx / ConfirmDialog.tsx + .css；所有调用点改为
shadcn Sheet / AlertDialog；SystemInfoDialog 与
ModelTestResultDialog 改为 shadcn Dialog；删除对应 .css。

EOF
)"
```

---

## Task 8：删除 SchemaFormField + 表单基础工具

**Files:**
- Delete: `src/components/SchemaFormField.tsx`
- Modify: `src/schemas/form-fields.ts`（移除渲染分发，仅留元数据）
- Create: `src/components/forms/StringListField.tsx`
- Create: `src/components/forms/KeyValueField.tsx`

- [ ] **Step 8.1：盘点 SchemaFormField 引用**

```bash
grep -rn "SchemaFormField\|from \"@/components/SchemaFormField\"\|from \"./SchemaFormField\"" src/ --include="*.tsx"
```

应仅在 `ProfileEditor.tsx`、`PresetEditor.tsx`、`MemoryEditor.tsx`、`SkillEditor.tsx`、`SettingsDrawer.tsx`、`profile-editor/*` 引用。这些页面在 Task 9~13 重写，本 Task 不动它们；只在最后才能真正删除 `SchemaFormField.tsx`，故本 Task **保留** 该文件，仅准备工具。

- [ ] **Step 8.2：创建 `src/components/forms/StringListField.tsx`**

```tsx
import type { ReactNode } from "react";
import { useFieldArray, useWatch, type Control, type FieldValues, type Path } from "react-hook-form";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useI18n, type TranslationKey } from "@/i18n";

interface StringListFieldProps<TFieldValues extends FieldValues> {
  control: Control<TFieldValues>;
  name: Path<TFieldValues>;
  labelKey: TranslationKey;
  placeholderKey?: TranslationKey;
  addLabelKey?: TranslationKey;
  resolveAddValue?: () => Promise<string | null> | string | null;
  resolveRowActionValue?: (currentValue: string, index: number) => Promise<string | null> | string | null;
  rowActionLabelKey?: TranslationKey;
  rowActionIcon?: ReactNode;
  buildRowActionAriaLabel?: (itemLabel: string) => string;
}

export function StringListField<TFieldValues extends FieldValues>({
  control,
  name,
  labelKey,
  placeholderKey,
  addLabelKey,
  resolveAddValue,
  resolveRowActionValue,
  rowActionLabelKey,
  rowActionIcon,
  buildRowActionAriaLabel,
}: StringListFieldProps<TFieldValues>) {
  const { t } = useI18n();
  const { fields, append, remove, update } = useFieldArray({ control, name: name as never });
  const values = (useWatch({ control, name }) ?? []) as string[];

  async function handleAdd() {
    const nextValue = resolveAddValue ? await resolveAddValue() : "";
    if (nextValue !== null) append(nextValue as never);
  }

  async function handleRowAction(index: number) {
    if (!resolveRowActionValue) return;
    const nextValue = await resolveRowActionValue(values[index] ?? "", index);
    if (nextValue !== null) update(index, nextValue as never);
  }

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium leading-none">{t(labelKey)}</label>
      <div className="space-y-2">
        {fields.map((f, idx) => (
          <div key={f.id} className="flex items-center gap-2">
            <Input
              {...control.register(`${name}.${idx}` as Path<TFieldValues>)}
              placeholder={placeholderKey ? t(placeholderKey) : ""}
            />
            <Button type="button" variant="ghost" size="icon" onClick={() => remove(idx)}>
              <X className="size-4" />
            </Button>
            {resolveRowActionValue && rowActionLabelKey ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={
                  buildRowActionAriaLabel?.(`${t(labelKey)} ${idx + 1}`) ??
                  `${t(rowActionLabelKey)} ${idx + 1}`
                }
                onClick={() => void handleRowAction(idx)}
              >
                {rowActionIcon ?? t(rowActionLabelKey)}
              </Button>
            ) : null}
          </div>
        ))}
      </div>
      <Button type="button" variant="outline" size="sm" onClick={() => void handleAdd()}>
        <Plus className="size-4" />
        {addLabelKey ? t(addLabelKey) : t("common.add")}
      </Button>
    </div>
  );
}
```

`PermissionsEditor` 的 `additionalDirectories` 迁移时必须传入 `resolveAddValue` 与 `resolveRowActionValue`，继续调用 `@tauri-apps/plugin-dialog` 的目录选择器；取消选择返回 `null`，保持原值不变。不要用无 row action 的普通字符串列表替换该字段。

- [ ] **Step 8.3：创建 `src/components/forms/KeyValueField.tsx`**

```tsx
import { useFieldArray, type Control, type FieldValues, type Path } from "react-hook-form";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useI18n, type TranslationKey } from "@/i18n";

interface KeyValueFieldProps<TFieldValues extends FieldValues> {
  control: Control<TFieldValues>;
  name: Path<TFieldValues>;
  labelKey: TranslationKey;
  keyPlaceholderKey?: TranslationKey;
  valuePlaceholderKey?: TranslationKey;
}

export function KeyValueField<TFieldValues extends FieldValues>({
  control,
  name,
  labelKey,
  keyPlaceholderKey,
  valuePlaceholderKey,
}: KeyValueFieldProps<TFieldValues>) {
  const { t } = useI18n();
  const { fields, append, remove } = useFieldArray({ control, name: name as never });

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium leading-none">{t(labelKey)}</label>
      <div className="space-y-2">
        {fields.map((f, idx) => (
          <div key={f.id} className="grid grid-cols-[1fr_1fr_auto] items-center gap-2">
            <Input
              {...control.register(`${name}.${idx}.key` as Path<TFieldValues>)}
              placeholder={keyPlaceholderKey ? t(keyPlaceholderKey) : ""}
            />
            <Input
              {...control.register(`${name}.${idx}.value` as Path<TFieldValues>)}
              placeholder={valuePlaceholderKey ? t(valuePlaceholderKey) : ""}
            />
            <Button type="button" variant="ghost" size="icon" onClick={() => remove(idx)}>
              <X className="size-4" />
            </Button>
          </div>
        ))}
      </div>
      <Button type="button" variant="outline" size="sm"
              onClick={() => append({ key: "", value: "" } as never)}>
        <Plus className="size-4" /> {t("common.add")}
      </Button>
    </div>
  );
}
```

- [ ] **Step 8.4：清理 `form-fields.ts` 渲染分发**

打开 `src/schemas/form-fields.ts`，定位 `inputType` 字段的使用。如该文件**仅声明** `FieldConfig` 接口与字段元数据列表，则不需要改动；如其中含针对各 `inputType` 的渲染辅助函数（`createTextField` / `createSelectField` 之类），保留生成元数据的部分，删除任何返回 JSX 的部分。

- [ ] **Step 8.5：构建 + 测试**

```bash
pnpm biome:ci && pnpm build && pnpm test
```

预期：全绿（`SchemaFormField.tsx` 仍存在并被业务页面使用）。

- [ ] **Step 8.6：commit**

```bash
git add src/components/forms/ src/schemas/form-fields.ts
git commit -m "$(cat <<'EOF'
refactor(forms): 引入 StringListField / KeyValueField 通用字段

新增 src/components/forms/ 目录，提供 useFieldArray 字符串列表
与键值对动态增删通用字段，供下游表单页面替换 StringListEditor /
EnvEditor 内部样板；form-fields.ts 仅保留字段元数据，移除渲染辅助。

EOF
)"
```

---

## Task 9：ProfilesPage + ProfileEditor + 8 子编辑器

> 体量最大的 Task；内部按子编辑器再切分为 commit 9.x 多个。每个 sub-commit 独立可构建。

**Files:**
- Modify: `src/components/ProfilesPage.tsx` + delete `.css`
- Modify: `src/components/ProfileEditor.tsx` + delete `.css`
- Modify: `src/components/profile-editor/*.tsx` + delete 7 个 `.css`
- Modify: 测试

- [ ] **Step 9.1：commit 9a — ProfilesPage 列表壳**

读 `ProfilesPage.tsx` + `.css`，把列表/卡片样式改 Tailwind：

模式：
```tsx
<div className="flex h-full flex-col">
  <header className="sticky top-0 z-10 flex h-13 items-center justify-between border-b bg-card px-5">
    <h2 className="text-base font-semibold">{t("profiles.title")}</h2>
    <Button size="sm" onClick={onCreate}><Plus className="size-4"/>{t("common.create")}</Button>
  </header>
  <ScrollArea className="flex-1 px-2">
    <div className="flex flex-col gap-3 py-3">
      {items.map(...)}
    </div>
  </ScrollArea>
</div>
```

删 `ProfilesPage.css`。

```bash
git rm src/components/ProfilesPage.css
git add src/components/ProfilesPage.tsx
pnpm biome:ci && pnpm build && pnpm test
git commit -m "refactor(profiles): ProfilesPage 列表壳 Tailwind 化"
```

- [ ] **Step 9.2：commit 9b — ProfileEditor 外壳（Sheet + 顶栏）**

`ProfileEditor.tsx` 用 `<Sheet><SheetContent side="right" className="flex w-full flex-col p-0 sm:max-w-2xl">` 替换原 editor-drawer-container；顶栏（返回/标题/保存按钮）按 spec §5.2 模式重写；body 用 `<form id="profile-form" onSubmit=...>`。

字段块在 9c~9j 逐个迁。

```bash
git rm src/components/ProfileEditor.css
git add src/components/ProfileEditor.tsx
pnpm biome:ci && pnpm build && pnpm test
git commit -m "refactor(profile-editor): 外壳改为 shadcn Sheet"
```

- [ ] **Step 9.3 ~ 9.10：commit 9c-9j — 8 个子编辑器**

为 `EnvEditor` / `HooksEditor` / `PermissionsEditor` / `SandboxEditor` / `StringListEditor` / `EnabledPluginsEditor` / `MarketplaceEditor` / `StatusLineEditor` 各做一个 sub-commit：

通用流程（每个子编辑器套用）：
1. 读现有 `.tsx` + `.css`，了解字段结构
2. 改为 shadcn `Form` + `FormField` + `FormItem` + `FormLabel` + `FormControl` + `FormMessage`
3. 字符串列表用 `<StringListField>`，键值对用 `<KeyValueField>`；`additionalDirectories` 必须保留新增时选择目录和逐行重选目录能力
4. 多选/单选用 `<Checkbox>` / `<RadioGroup>`
5. preset 选择用 `<Select>`
6. 删除对应 `.css`
7. 跑 `pnpm biome:ci && pnpm build && pnpm test`
8. commit：`refactor(profile-editor): <Name> 改 shadcn Form`

具体每个子编辑器需要重写的字段，按 `src/schemas/form-fields.ts` 与现有 `<子编辑器>.tsx` 的 props 对齐；保留 `FieldHelpButton` / `RequiredBadge` / `BehaviorFieldHeader` 等小工具的功能（外观换 Tailwind）。

`StatusLineEditor` 的 preset 列表用 `<RadioGroup>` + `<Card>` 卡片选择形态；自定义脚本编辑用 CodeMirror（接 `useCodeMirrorTheme()`）。

- [ ] **Step 9.11：commit 9k — StructuredSettingsSections / DocumentEditorSection**

把 `Tabs` / `Accordion` 用 shadcn `<Tabs>` / `<Collapsible>` 表达；DocumentEditor 用 `<Card>` + CodeMirror。删除 `editor-shared.css` 中已用不上的样式。

```bash
git rm src/components/profile-editor/editor-shared.css
pnpm biome:ci && pnpm build && pnpm test
git commit -m "refactor(profile-editor): Structured/Document 段改 shadcn Tabs/Card"
```

- [ ] **Step 9.12：commit 9l — 收尾删除 SchemaFormField**

确认 `grep -rn "SchemaFormField" src/` 无命中后：

```bash
git rm src/components/SchemaFormField.tsx
pnpm biome:ci && pnpm build && pnpm test
git commit -m "refactor(forms): 删除 SchemaFormField，全部表单页改写完成"
```

---

## Task 10：PresetsPage / PresetEditor / MemoryPage / MemoryEditor / SkillsPage / SkillEditor

**Files:**
- Modify: 6 个组件 `.tsx` + 删除对应 `.css`（含 `MemoryItem.css`、`SkillItem.css`、`ProfileNameBadge.css`）

- [ ] **Step 10.1：PresetsPage + PresetEditor**

模式参考 Task 9。PresetsPage 列表卡片用 `<Card>`；PresetEditor 用 `<Sheet>` + `<Form>`。Provider 选择用 `<Select>`。

```bash
git rm src/components/PresetsPage.css src/components/PresetEditor.css
pnpm biome:ci && pnpm build && pnpm test
git commit -m "refactor(presets): PresetsPage / PresetEditor 改 shadcn"
```

- [ ] **Step 10.2：MemoryPage + MemoryEditor**

按 spec §5.2 完整示例改写 `MemoryEditor`。MemoryPage 列表用 `<Card>`；`MemoryItem` 内 `.toggle-switch` 改 `<Switch>`；`UnmanagedMemoryItem` 同样改 `<Card>` + `<Badge>`。一键复制按钮用 `<Button variant="ghost" size="icon"><Copy/></Button>`。`ProfileNameBadge` 用 `<Avatar>` + `<Badge>` 组合。

```bash
git rm src/components/MemoryPage.css src/components/MemoryEditor.css \
       src/components/MemoryItem.css src/components/ProfileNameBadge.css
pnpm biome:ci && pnpm build && pnpm test
git commit -m "refactor(memory): MemoryPage / MemoryEditor / Item / Badge 改 shadcn"
```

- [ ] **Step 10.3：SkillsPage + SkillEditor + SkillItem**

同上模式。SkillItem 的 `.toggle-switch.toggle-blue` 改 `<Switch>`（颜色统一 primary，Q3 决策）。Skills 页标题栏的"官方文档链接"用 `<Button variant="link" asChild><a href=...><ExternalLink/></a></Button>`。

```bash
git rm src/components/SkillsPage.css src/components/SkillEditor.css src/components/SkillItem.css
pnpm biome:ci && pnpm build && pnpm test
git commit -m "refactor(skills): SkillsPage / SkillEditor / SkillItem 改 shadcn"
```

---

## Task 11：ProjectsPage / HistoryPage / SessionDetailDrawer / LogViewer

**Files:**
- Modify: `ProjectsPage.tsx` + delete `.css`
- Modify: `ProjectDetailPanel.tsx`
- Modify: `HistoryPage.tsx` + delete `.css`
- Modify: `HistoryHeatmap.tsx` `HistoryProjectList.tsx` `HistorySessionList.tsx`
- Modify: `SessionDetailDrawer.tsx`
- Modify: `LogViewer.tsx` + delete `.css`

- [ ] **Step 11.1：ProjectsPage + ProjectDetailPanel**

ProjectsPage 列表用 `<Card>` + `<Badge>`；详情面板用 `<Card>` + `<Tabs>`（如有 tab）；空状态用 `<div className="flex flex-col items-center justify-center text-muted-foreground">` + lucide 图标。响应式断点（1240/1080/900）改 Tailwind 默认 lg/md/sm。

```bash
git rm src/components/ProjectsPage.css
pnpm biome:ci && pnpm build && pnpm test
git commit -m "refactor(projects): ProjectsPage / Detail 改 shadcn"
```

- [ ] **Step 11.2：HistoryPage + Heatmap + ProjectList + SessionList**

HistoryPage 主体壳用 Tailwind grid；Heatmap 自绘 SVG 颜色用 `oklch()` / `var(--chart-*)`；ProjectList / SessionList 用 `<Button variant="ghost">` 行项 + lucide 图标。

```bash
git rm src/components/HistoryPage.css
pnpm biome:ci && pnpm build && pnpm test
git commit -m "refactor(history): HistoryPage / Heatmap / List 改 shadcn"
```

- [ ] **Step 11.3：SessionDetailDrawer**

外壳改 `<Sheet side="right">`；段落分隔用 `<Separator>`；JSON 区块用 `<Card>` + CodeMirror（接 `useCodeMirrorTheme()`）。

`SessionDetailDrawer.css` 已在 Task 7 删除。

```bash
pnpm biome:ci && pnpm build && pnpm test
git commit -m "refactor(history): SessionDetailDrawer 改 shadcn Sheet"
```

- [ ] **Step 11.4：LogViewer**

容器用 `<ScrollArea className="h-full rounded-md border bg-card">`；行项用 `<div className="px-3 py-1 font-mono text-xs">`；不同 level 用 `text-destructive` / `text-yellow-500` / `text-muted-foreground`。

```bash
git rm src/components/LogViewer.css
pnpm biome:ci && pnpm build && pnpm test
git commit -m "refactor(logs): LogViewer 改 shadcn ScrollArea"
```

---

## Task 12：StatsPage / UsagePage / ClaudeOverviewPage（图表 + 总览）

**Files:**
- Modify: `StatsPage.tsx` + delete `.css`
- Modify: `UsagePage.tsx` + delete `.css`
- Modify: `ClaudeOverviewPage.tsx` + delete `.css`
- Modify: `src/components/usage/*` `src/components/claude-overview/*`

- [ ] **Step 12.1：引入 shadcn chart 组件**

```bash
pnpm dlx shadcn@latest add chart
```

预期：生成 `src/components/ui/chart.tsx`。

- [ ] **Step 12.2：StatsPage 改用 shadcn chart wrapper**

把 recharts 直接调用包到 `<ChartContainer config={chartConfig}>` 内，颜色用 `var(--chart-1)` ~ `var(--chart-5)` 通过 `chartConfig` 传入。Tooltip 用 `<ChartTooltip />`。

```bash
git rm src/components/StatsPage.css
pnpm biome:ci && pnpm build && pnpm test
git commit -m "refactor(stats): StatsPage 改 shadcn chart"
```

- [ ] **Step 12.3：UsagePage 同上**

```bash
git rm src/components/UsagePage.css
pnpm biome:ci && pnpm build && pnpm test
git commit -m "refactor(usage): UsagePage 改 shadcn chart"
```

- [ ] **Step 12.4：ClaudeOverviewPage**

`ClaudeOverviewPage` 内的统计卡片用 `<Card>`；按钮组用 `<Tabs>` 或 `<ToggleGroup>`；外部链接用 `<Button variant="link" asChild>`；markdown 渲染区按 spec §6.3 加 `markdown-light`/`markdown-dark` 切换。

```bash
git rm src/components/ClaudeOverviewPage.css
pnpm biome:ci && pnpm build && pnpm test
git commit -m "refactor(overview): ClaudeOverviewPage 改 shadcn"
```

---

## Task 13：SettingsDrawer

**Files:**
- Modify: `src/components/SettingsDrawer.tsx`

- [ ] **Step 13.1：SettingsDrawer 改 Sheet + Form + 三态主题**

外壳 `<Sheet>` + `<SheetContent side="right" className="flex w-full flex-col p-0 sm:max-w-md">`。各设置段用 `<Card>` 分组。

主题切换用 `<RadioGroup>`（system/light/dark），onChange → `setTheme` from `useTheme()`：

```tsx
const { theme, setTheme } = useTheme();
<RadioGroup value={theme} onValueChange={(v) => setTheme(v as Theme)}>
  <RadioGroupItem value="system" id="theme-system" />
  <Label htmlFor="theme-system">{t("settings.theme.system")}</Label>
  ...
</RadioGroup>
```

语言切换、tray 配置、终端/编辑器选择沿用现有 react-hook-form 字段；样式改 shadcn `<Select>` / `<Switch>`。

`SettingsDrawer.css` 在 Task 7 已删除。

- [ ] **Step 13.2：构建 + 测试**

```bash
pnpm biome:ci && pnpm build && pnpm test
```

- [ ] **Step 13.3：commit**

```bash
git add src/components/SettingsDrawer.tsx
git commit -m "$(cat <<'EOF'
refactor(settings): SettingsDrawer 改 shadcn Sheet + Form

设置项分组改 Card；主题切换接 ThemeProvider 三态 RadioGroup；
语言/终端/编辑器选择改 shadcn Select / Switch；
全部 i18n 键不变。

EOF
)"
```

---

## Task 14：残留资产清理 + Biome 全量整理

**Files:**
- 删除：未触及到的残留 CSS（保险）
- 修改：`.claude/rules/frontend-ui.md`（更新规则反映新架构）
- 修改：所有需要 import 整理 / 类名排序的文件

- [ ] **Step 14.1：搜索残留 .css**

```bash
find src -name "*.css" -type f
```

预期：仅剩 `src/index.css`。如有其它文件，逐个确认无引用后删除。

- [ ] **Step 14.2：搜索残留旧令牌引用**

```bash
grep -rn "var(--bg-base\|--bg-primary\|--bg-secondary\|--accent-blue\|--text-primary\|--space-\|--radius-sm" src/ --include="*.tsx" --include="*.ts" --include="*.css"
```

预期：除 `src/index.css` 外无命中（`src/index.css` 内部允许 OKLCH 变量定义）。如有命中改为 Tailwind utility 或 shadcn 变量。

- [ ] **Step 14.3：删除 styles/ 空目录（如还存在）**

```bash
rmdir src/styles 2>/dev/null || true
```

- [ ] **Step 14.4：Biome 全量整理 import 与格式**

```bash
pnpm biome check --write .
```

预期：自动修复 import 顺序、类型 import、未使用变量等；`pnpm biome:ci` 在此之后通过。

- [ ] **Step 14.5：更新 `.claude/rules/frontend-ui.md`**

旧规则提到 `styles/shared.css`、`SchemaFormField`、`ToastProvider`、"主题在 i18n.ts" 等已与现实不符。完整重写为：

```markdown
# Frontend UI Rules

## 先读文件

- 应用壳与页面编排：`src/App.tsx`
- React 入口、全局 Provider 与错误日志：`src/main.tsx`
- 国际化：`src/i18n.ts`
- 类型契约：`src/types.ts`
- 共享 schema 与表单定义：`src/schemas/`
- 公共 hooks：`src/hooks/`
- Tailwind v4 入口与 OKLCH 主题变量：`src/index.css`
- shadcn 原子组件：`src/components/ui/`
- 业务复用表单字段：`src/components/forms/`
- 主题状态管理：`src/components/theme-provider.tsx`

## 通用约束

- 所有用户可见文本（按钮、标签、提示、空状态、错误提示等）必须走 `useI18n()` 的 `t()` 函数。
- 所有用户反馈优先走 `useToast()`（底层 sonner），不要把 `console.error` 当作用户反馈。
- 样式使用 Tailwind v4 工具类；颜色一律走 shadcn 语义变量（`bg-background` / `text-foreground` / `text-muted-foreground` / `bg-primary` / `text-destructive` / `border` 等），禁止硬编码十六进制色值。
- 圆角使用 `rounded-md`/`rounded-lg`，间距使用 Tailwind `gap-*` / `p-*` / `m-*`，不要再用 `--space-*` / `--radius-*` 旧令牌。
- 类名拼接走 `cn(...)`（来自 `@/lib/utils`）；不要手写字符串拼接。
- 浮层、抽屉、菜单、Toast、模态框一律使用 shadcn `Sheet` / `Dialog` / `AlertDialog` / `DropdownMenu` / `Popover` / `Tooltip` / sonner 等原子，不再自实现。
- 复杂表单使用 shadcn `Form` + `FormField` + `FormItem` + `FormLabel` + `FormControl` + `FormMessage` + `react-hook-form` + `zod`；字符串列表用 `<StringListField>`，键值对用 `<KeyValueField>`。
- `FormMessage` 已内置 i18n 包装：`error.message` 直接传入 `TranslationKey` 即可。
- 主题状态由 `ThemeProvider` 管理（`useTheme()`）；Dark mode 使用 `<html>.dark` class 切换；持久化键 `ai-manager.theme`。
- CodeMirror 主题用 `useCodeMirrorTheme()`；其他需要响应主题的逻辑用 `useIsDark()`。
- 图标库统一使用 `lucide-react`，按 Tailwind size 类（`size-3.5` / `size-4` / `size-5` / `size-6`）控制尺寸。
- 复杂编辑器优先复用 `useObjectJsonEditor`、`useDocumentJsonEditor`、`useStructuredSettingsSectionState` 等现有 hook。

## UI 共享约束

- 全局 `ThemeProvider` / `I18nProvider` 在 `src/main.tsx`。
- `App.tsx` 顶层挂 `<TooltipProvider>` 与 sonner `<Toaster>`。
- 编辑器抽屉一律 `<Sheet side="right">`，内部内容用 Tailwind flex 布局。

## 测试与命令

- 前端静态检查：`pnpm biome:ci`
- 前端构建：`pnpm build`
- 前端测试：`pnpm test`
- 注意：`pnpm check` 会执行 `biome check --write .` 并修改文件。

## 测试选择器优先级

1. ❌ class 选择
2. ✅ `getByRole(role, { name })`
3. ✅ `getByText` / `getByLabelText`
4. ✅ `[data-slot="..."]`（shadcn 标准）
5. ✅ `data-testid`（按需）
```

- [ ] **Step 14.6：构建 + 测试**

```bash
pnpm biome:ci && pnpm build && pnpm test
```

预期：全绿。

- [ ] **Step 14.7：cargo 验证（确认前端改动未影响后端）**

```bash
cd src-tauri && cargo test && cargo clippy -- -D warnings && cd ..
```

预期：通过。

- [ ] **Step 14.8：commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
chore(cleanup): 清理残留 CSS、更新规则文件、Biome 全量整理

确认无 src/**/*.css 残留（src/index.css 除外）；
搜索旧 design token (--bg-* / --accent-blue / --space-* /
--radius-sm) 在业务代码中已无引用；
更新 .claude/rules/frontend-ui.md 反映 Tailwind v4 + shadcn
新模式（删除 shared.css/SchemaFormField/ToastProvider 引用，
新增主题/图标/表单/选择器规则）；
biome check --write 统一 import 顺序与格式。

EOF
)"
```

---

## Task 15：手测 + 视觉/交互验证

**Files:** 无代码改动；如发现回归则在本 Task 内补 fix commit。

- [ ] **Step 15.1：启动 dev**

```bash
pnpm tauri dev
```

预期：构建成功，桌面应用启动，无控制台红色错误。

- [ ] **Step 15.2：执行手测清单（spec §7.4）**

逐项：
1. Sidebar 全部 Tab 切换、Tooltip、Active 态正确
2. ProfilesPage → 进入 ProfileEditor → 8 子编辑器全部交互（增删字段、保存、重置）
3. PresetsPage / MemoryPage / SkillsPage 列表 + 编辑 + 删除（AlertDialog 出现 + ESC 关闭 + 确认/取消）
4. ProjectsPage / HistoryPage 列表 + ProjectDetailPanel / SessionDetailDrawer 展开
5. StatsPage / UsagePage 图表交互、Tooltip、图例
6. ClaudeOverviewPage 总览
7. SettingsDrawer 全部段落 + 主题三态切换 + 重启后保留
8. CodeMirror 在 dark / light 下颜色正确
9. Toast 成功/失败两种类型从右上角弹出
10. ESC 关 Sheet / AlertDialog
11. Tray 行为：show tray title / sessions 切换、navigate-to-tab 事件

- [ ] **Step 15.3：发现回归 → 补 fix commit**

每个回归一个 commit：

```bash
git add <fix files>
git commit -m "fix(ui): <具体描述>"
pnpm biome:ci && pnpm build && pnpm test
```

直至清单全过。

- [ ] **Step 15.4：最终验证三件套**

```bash
pnpm biome:ci
pnpm build
pnpm test
cd src-tauri && cargo test && cd ..
```

预期：全绿。

- [ ] **Step 15.5：完成 commit（如本 Task 内有 fix commit 即可；如完全无回归则不留 commit）**

---

## 验证总清单

每个 Task 末尾：

```bash
pnpm biome:ci   # Biome 静态检查
pnpm build      # tsc + vite build 编译
pnpm test       # vitest run
```

涉及主题/CodeMirror/Theme 的 Task 还需：

```bash
cd src-tauri && cargo test && cd ..
```

最后一次 commit 后跑：

```bash
pnpm tauri dev   # 桌面 dev 模式手测
```

---

## 风险与回滚

详见 spec §9 / §10。中途任何 Task 不可恢复地破坏构建：

```bash
git status --short
git diff --stat
git revert --no-edit HEAD  # 需要撤销最近一次已提交改动时优先使用非破坏性 revert
```

不要在共享工作区执行 `git reset --hard` 作为计划步骤；如确实需要丢弃本地未提交改动，必须先确认没有用户改动并获得明确许可。

整个 PR 不可用：

```bash
git revert <merge-commit>  # 已合入主干时
```
