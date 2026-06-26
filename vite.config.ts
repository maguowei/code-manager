import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const host = process.env.TAURI_DEV_HOST;
const chunkMaxSize = 450 * 1024;

function nodeModulePattern(packageNames: string[]) {
  return new RegExp(
    String.raw`[\\/]node_modules[\\/](?:\.pnpm[\\/][^\\/]+[\\/]node_modules[\\/])?(?:${packageNames.join(
      "|",
    )})(?:[\\/]|$)`,
  );
}

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  build: {
    // 仅放宽 Shiki 的单语言/wasm 异步资源告警；应用入口与页面 chunk 仍需低于默认 500 kB。
    chunkSizeWarningLimit: 850,
    rolldownOptions: {
      output: {
        codeSplitting: {
          // CodeMirror / Markdown / Recharts 依赖图存在循环引用，强制拆 vendor chunk 会导致 Tauri 生产包初始化顺序错误。
          groups: [
            {
              name: "react-vendor",
              test: nodeModulePattern(["react", "react-dom", "scheduler"]),
              priority: 60,
              maxSize: chunkMaxSize,
            },
            {
              name: "diff-viewer-vendor",
              test: nodeModulePattern([
                "@pierre",
                "@shikijs",
                "diff",
                "hast-util-to-html",
                "lru_map",
                "shiki",
              ]),
              priority: 45,
              maxSize: chunkMaxSize,
            },
            {
              name: "ui-vendor",
              test: nodeModulePattern([
                "class-variance-authority",
                "cmdk",
                "lucide-react",
                "radix-ui",
                "react-day-picker",
                "sonner",
                "tailwind-merge",
              ]),
              priority: 30,
              maxSize: chunkMaxSize,
            },
          ],
        },
      },
    },
  },

  // 避免 Vite 清屏遮挡 Rust 错误
  clearScreen: false,
  server: {
    port: 17420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 17421,
        }
      : undefined,
    watch: {
      // 避免前端 dev server 监听 Rust 目录
      ignored: ["**/src-tauri/**"],
    },
  },
}));
