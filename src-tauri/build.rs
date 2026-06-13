fn main() {
    tauri_build::build();

    // Windows: tauri-build 仅通过 rustc-link-arg-bins 把应用清单(manifest)嵌入主二进制，
    // 测试二进制拿不到 Common-Controls v6 清单，在 MSVC 下以
    // STATUS_ENTRYPOINT_NOT_FOUND (0xc0000139) 崩溃。见 https://github.com/tauri-apps/tauri/issues/13419
    // 用 rustc-link-arg-tests 只给测试二进制补嵌同一份清单，不影响生产二进制。
    #[cfg(windows)]
    {
        let manifest =
            std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("windows-app-manifest.xml");
        println!("cargo:rerun-if-changed={}", manifest.display());
        println!("cargo:rustc-link-arg-tests=/MANIFEST:EMBED");
        println!(
            "cargo:rustc-link-arg-tests=/MANIFESTINPUT:{}",
            manifest.display()
        );
    }
}
