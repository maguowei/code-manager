.PHONY: init dev build

# 初始化：安装前端依赖并确保 Rust 工具链就绪
init:
	@echo ">>> 检查 Rust 工具链..."
	@if ! command -v cargo >/dev/null 2>&1; then \
		echo "错误：未找到 cargo，请先安装 Rust：https://www.rust-lang.org/tools/install"; \
		exit 1; \
	fi
	@echo ">>> Rust 版本：$$(cargo --version)"
	@echo ">>> 安装前端依赖..."
	pnpm install
	@echo ">>> 初始化完成"

# 启动开发模式
dev:
	pnpm tauri dev

# 构建生产包
build:
	pnpm tauri build
