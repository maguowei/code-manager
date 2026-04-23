.PHONY: init dev build build-universal preview check test lint fmt clean

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

# 构建 macOS 通用包（同时包含 aarch64 和 x86_64）
build-universal:
	@echo ">>> 确保 macOS 双架构 Rust target 已安装..."
	rustup target add aarch64-apple-darwin x86_64-apple-darwin
	pnpm tauri build --target universal-apple-darwin

# 预览生产构建（需先执行 build）
preview:
	pnpm preview

# 快速检查 Rust 代码（不生成二进制，比 build 快）
check:
	cd src-tauri && cargo check

# 运行 Rust 单元测试
test:
	cd src-tauri && cargo test

# 代码检查：Rust lint
lint:
	cd src-tauri && cargo clippy -- -D warnings

# 格式化 Rust 代码
fmt:
	cd src-tauri && cargo fmt

# 清理构建产物
clean:
	cd src-tauri && cargo clean
	rm -rf dist
