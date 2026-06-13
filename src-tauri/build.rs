fn main() {
    // Windows: tauri-build 默认只通过 rustc-link-arg-bins 把应用清单(声明 Common-Controls v6
    // 依赖，dialog 等 API 必需)嵌入主二进制。单元测试二进制由 lib 在 test 模式下编译、
    // target kind 仍是 lib，既拿不到 bins 清单，也不被 rustc-link-arg-tests 覆盖
    // (后者只作用于 tests/ 集成测试，见 cargo#10937)，于是在 MSVC 下加载期以
    // STATUS_ENTRYPOINT_NOT_FOUND (0xc0000139) 崩溃。见 tauri-apps/tauri#13419。
    // 解决：关闭 tauri 默认清单，改用通用 rustc-link-arg 把同一份清单嵌入全部产物
    // (主二进制/cdylib/单元测试/集成测试)。生产二进制清单内容不变，行为无回归。
    let attributes = tauri_build::Attributes::new();
    #[cfg(windows)]
    let attributes =
        attributes.windows_attributes(tauri_build::WindowsAttributes::new_without_app_manifest());
    tauri_build::try_build(attributes).expect("failed to run tauri-build");

    #[cfg(windows)]
    {
        let manifest =
            std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("windows-app-manifest.xml");
        println!("cargo:rerun-if-changed={}", manifest.display());
        println!("cargo:rustc-link-arg=/MANIFEST:EMBED");
        println!("cargo:rustc-link-arg=/MANIFESTINPUT:{}", manifest.display());
    }
}
