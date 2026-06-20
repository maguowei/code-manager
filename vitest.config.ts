import { configDefaults, defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isCoverageRun = process.argv.some((arg) => arg === "--coverage" || arg.startsWith("--coverage."));

// 固定测试时区，避免本地（UTC+8）与 CI（UTC）因 toLocaleString / getHours 等本地时区
// 格式化产生不一致：用例普遍以 UTC+8 为前提硬编码期望值（如 formatShortDateTime 渲染结果）。
process.env.TZ = "Asia/Shanghai";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    exclude: [...configDefaults.exclude, "**/.worktrees/**", "**/.claude/worktrees/**", "**/.pnpm-store/**"],
    // 覆盖率插桩 (v8) 下部分 findBy* 异步用例更慢用 20s；普通运行用 15s 给慢 CI runner
    // (尤其 Windows，偶发整机 I/O 极慢) 足够余量，避免慢环境下整体执行超时的偶发 flake。
    testTimeout: isCoverageRun ? 20_000 : 15_000,
    coverage: {
      // 使用 v8 引擎，与 Vitest 4 原生集成且性能优于 istanbul
      provider: "v8",
      // 本地查看 html，CI 上传 lcov，text 用于控制台快速浏览
      reporter: ["text", "html", "lcov"],
      reportsDirectory: "./coverage",
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        // shadcn 第三方原子组件
        "src/components/ui/**",
        // 测试工具与全局 setup
        "src/test/**",
        // React 入口仅装配 Provider，由 smoke test 覆盖
        "src/main.tsx",
        // 类型定义与配置
        "**/*.d.ts",
        "**/*.config.*",
        // 测试文件本身
        "**/__tests__/**",
        "**/*.test.{ts,tsx}",
      ],
      thresholds: { lines: 80, branches: 75, functions: 80, statements: 80 },
    },
  },
});
