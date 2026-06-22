use std::path::PathBuf;

fn main() {
    let bindings_path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../src/bindings.ts");

    if let Err(error) = code_manager_lib::export_typescript_bindings(&bindings_path) {
        eprintln!("{error}");
        std::process::exit(1);
    }
}
