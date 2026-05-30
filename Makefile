.PHONY: init dev build build-frontend build-universal preview check verify bindings bindings-check test test-rust test-frontend lint lint-rust lint-frontend fmt fmt-check fmt-rust fmt-rust-check fmt-frontend fmt-frontend-check gitleaks gitleaks-history clean coverage coverage-rust coverage-rust-lcov coverage-frontend ensure-llvm-cov

RUST_COVERAGE_THRESHOLDS := --fail-under-regions 80 --fail-under-functions 70 --fail-under-lines 80

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

# 构建前端产物
build-frontend:
	pnpm build

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

# 本地 CI-like 验证入口
verify: fmt-rust-check bindings-check lint build-frontend test

# 重新生成 Tauri IPC TypeScript bindings
bindings:
	cd src-tauri && cargo run --bin generate_bindings

# 检查 Tauri IPC bindings 是否与 Rust command 契约同步
bindings-check:
	cd src-tauri && cargo test specta_export_tests

# 运行 Rust 与前端测试
test: test-rust test-frontend

# 运行 Rust 测试
test-rust:
	cd src-tauri && cargo test

# 运行前端测试
test-frontend:
	pnpm test

# 代码检查：前端 Biome + Rust clippy
lint: lint-frontend lint-rust

# 前端静态检查
lint-frontend:
	pnpm biome:ci

# Rust lint
lint-rust:
	cd src-tauri && cargo clippy --all-targets -- -D warnings

# 格式化前端与 Rust 代码
fmt: fmt-frontend fmt-rust

# 只读格式检查
fmt-check: fmt-frontend-check fmt-rust-check

# 格式化前端代码
fmt-frontend:
	pnpm format

# 只读检查前端格式
fmt-frontend-check:
	pnpm exec biome format .

# 格式化 Rust 代码
fmt-rust:
	cd src-tauri && cargo fmt

# 只读检查 Rust 格式
fmt-rust-check:
	cd src-tauri && cargo fmt --all -- --check

# 扫描当前项目文件中的密钥
gitleaks:
	gitleaks dir . --redact --no-banner

# 扫描 Git 历史中的密钥
gitleaks-history:
	gitleaks git . --redact --no-banner

# 清理构建产物
clean:
	cd src-tauri && cargo clean
	rm -rf dist

# 全项目覆盖率（Rust HTML + 前端 text/html/lcov）
coverage: coverage-rust coverage-frontend

# Rust 覆盖率（HTML 报告输出到 src-tauri/target/llvm-cov/html/）
coverage-rust: ensure-llvm-cov
	cd src-tauri && cargo llvm-cov --lib --tests --html \
		$(RUST_COVERAGE_THRESHOLDS) \
		--ignore-filename-regex '(tests/|/target/)'

# Rust 覆盖率（LCOV 报告输出到 src-tauri/lcov.info，供覆盖率服务上传）
coverage-rust-lcov: ensure-llvm-cov
	cd src-tauri && cargo llvm-cov --lib --tests --lcov \
		--output-path lcov.info \
		$(RUST_COVERAGE_THRESHOLDS) \
		--ignore-filename-regex '(tests/|/target/)'

# 确保 cargo-llvm-cov 已安装，缺失时自动通过 cargo install 拉取
ensure-llvm-cov:
	@if ! cargo llvm-cov --version >/dev/null 2>&1; then \
		echo ">>> 未检测到 cargo-llvm-cov，正在安装..."; \
		cargo install cargo-llvm-cov --locked || { \
			echo "错误：cargo-llvm-cov 安装失败，请手动执行 'cargo install cargo-llvm-cov --locked'"; \
			exit 1; \
		}; \
	fi

# 前端覆盖率（text/html/lcov 报告输出到 ./coverage/）
coverage-frontend:
	pnpm test:coverage
