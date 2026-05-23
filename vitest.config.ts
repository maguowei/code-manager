import { configDefaults, defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isCoverageRun = process.argv.some((arg) => arg === "--coverage" || arg.startsWith("--coverage."));

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
    // 覆盖率插桩 (v8) 下部分 findBy* 异步用例会更慢；普通测试保持默认 5s。
    testTimeout: isCoverageRun ? 20_000 : 5_000,
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
      // W1 初始阈值；W8 提升至 lines 85 / branches 78
      thresholds: { lines: 70, branches: 60, functions: 70, statements: 70 },
    },
  },
});
