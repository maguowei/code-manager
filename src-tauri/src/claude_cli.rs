use std::env;
use std::fmt;
use std::path::{Path, PathBuf};
use std::process::{Command, Output};

#[cfg(windows)]
const CLAUDE_FILE_NAMES: &[&str] = &["claude.exe", "claude.cmd", "claude.bat", "claude"];
#[cfg(not(windows))]
const CLAUDE_FILE_NAMES: &[&str] = &["claude"];

#[derive(Debug)]
pub(crate) enum ClaudeCliError {
    NotFound,
    Spawn(std::io::Error),
}

impl fmt::Display for ClaudeCliError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::NotFound => write!(
                formatter,
                "未找到 claude CLI，请确认 Claude Code 已安装并可在 PATH 或标准安装目录中访问"
            ),
            Self::Spawn(error) => write!(formatter, "执行 claude CLI 失败: {error}"),
        }
    }
}

pub(crate) fn run(args: &[String]) -> Result<Output, ClaudeCliError> {
    // 保留调用进程显式 PATH 的优先级，再覆盖 GUI 应用缺少 shell PATH 的标准安装场景。
    let program = path_executable()
        .or_else(|| native_installer_path().filter(|path| is_executable(path)))
        .or_else(standard_install_executable);
    let Some(program) = program else {
        return Err(ClaudeCliError::NotFound);
    };

    let mut command = Command::new(program);
    command.args(args);
    crate::utils::hide_command_window(&mut command);
    command.output().map_err(ClaudeCliError::Spawn)
}

fn path_executable() -> Option<PathBuf> {
    let paths = env::var_os("PATH")?;
    env::split_paths(&paths)
        .flat_map(|directory| {
            CLAUDE_FILE_NAMES
                .iter()
                .copied()
                .map(move |file_name| directory.join(file_name))
        })
        .find(|path| is_executable(path))
}

fn native_installer_path() -> Option<PathBuf> {
    let file_name = if cfg!(windows) {
        "claude.exe"
    } else {
        "claude"
    };
    crate::utils::get_home_dir()
        .ok()
        .map(|home| home.join(".local/bin").join(file_name))
}

fn standard_install_executable() -> Option<PathBuf> {
    standard_bin_directories()
        .into_iter()
        .flat_map(|directory| {
            CLAUDE_FILE_NAMES
                .iter()
                .copied()
                .map(move |file_name| directory.join(file_name))
        })
        .find(|path| is_executable(path))
}

fn standard_bin_directories() -> Vec<PathBuf> {
    #[cfg(test)]
    if let Some(paths) = env::var_os("CODE_MANAGER_TEST_CLAUDE_STANDARD_BIN_DIRS") {
        return env::split_paths(&paths).collect();
    }

    #[cfg(target_os = "macos")]
    {
        vec![
            PathBuf::from("/opt/homebrew/bin"),
            PathBuf::from("/usr/local/bin"),
        ]
    }

    #[cfg(not(target_os = "macos"))]
    {
        Vec::new()
    }
}

fn is_executable(path: &Path) -> bool {
    let Ok(metadata) = path.metadata() else {
        return false;
    };
    if !metadata.is_file() {
        return false;
    }

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        metadata.permissions().mode() & 0o111 != 0
    }

    #[cfg(not(unix))]
    {
        true
    }
}

#[cfg(all(test, unix))]
mod tests {
    use super::run;
    use std::env;
    use std::ffi::OsString;
    use std::fs;

    struct EnvVarGuard {
        key: &'static str,
        original: Option<OsString>,
    }

    impl EnvVarGuard {
        fn capture(key: &'static str) -> Self {
            Self {
                key,
                original: env::var_os(key),
            }
        }
    }

    impl Drop for EnvVarGuard {
        fn drop(&mut self) {
            match &self.original {
                Some(value) => env::set_var(self.key, value),
                None => env::remove_var(self.key),
            }
        }
    }

    #[cfg(unix)]
    #[test]
    fn run_finds_native_installer_when_gui_path_is_restricted() {
        use std::os::unix::fs::PermissionsExt;

        let _guard = crate::utils::TEST_ENV_LOCK
            .lock()
            .unwrap_or_else(|error| error.into_inner());
        let _path_guard = EnvVarGuard::capture("PATH");
        let _home_guard = EnvVarGuard::capture("CODE_MANAGER_HOME_OVERRIDE");
        let home = tempfile::tempdir().expect("应可创建临时 home");
        let cli_dir = home.path().join(".local/bin");
        let cli_path = cli_dir.join("claude");
        fs::create_dir_all(&cli_dir).expect("应可创建 native installer 目录");
        fs::write(&cli_path, "#!/bin/sh\nprintf '%s\\n' \"$@\"\n")
            .expect("应可写入模拟 claude CLI");
        fs::set_permissions(&cli_path, fs::Permissions::from_mode(0o755))
            .expect("应可设置模拟 CLI 为可执行");
        env::set_var("PATH", "/usr/bin:/bin:/usr/sbin:/sbin");
        env::set_var("CODE_MANAGER_HOME_OVERRIDE", home.path());
        let args = ["plugin", "list", "--available", "--json"].map(str::to_string);

        let output = run(&args).expect("受限 GUI PATH 下应能运行 native installer 中的 CLI");

        assert!(output.status.success());
        assert_eq!(
            String::from_utf8_lossy(&output.stdout),
            "plugin\nlist\n--available\n--json\n"
        );
    }

    #[cfg(unix)]
    #[test]
    fn run_prefers_cli_from_process_path() {
        use std::os::unix::fs::PermissionsExt;

        let _guard = crate::utils::TEST_ENV_LOCK
            .lock()
            .unwrap_or_else(|error| error.into_inner());
        let _path_guard = EnvVarGuard::capture("PATH");
        let _home_guard = EnvVarGuard::capture("CODE_MANAGER_HOME_OVERRIDE");
        let root = tempfile::tempdir().expect("应可创建临时目录");
        let home_cli_dir = root.path().join("home/.local/bin");
        let path_cli_dir = root.path().join("path-bin");
        fs::create_dir_all(&home_cli_dir).expect("应可创建 native installer 目录");
        fs::create_dir_all(&path_cli_dir).expect("应可创建 PATH 目录");
        let home_cli = home_cli_dir.join("claude");
        let path_cli = path_cli_dir.join("claude");
        fs::write(&home_cli, "#!/bin/sh\nprintf 'native\\n'\n").expect("应可写入 native CLI");
        fs::write(&path_cli, "#!/bin/sh\nprintf 'path\\n'\n").expect("应可写入 PATH CLI");
        fs::set_permissions(&home_cli, fs::Permissions::from_mode(0o755))
            .expect("应可设置 native CLI 为可执行");
        fs::set_permissions(&path_cli, fs::Permissions::from_mode(0o755))
            .expect("应可设置 PATH CLI 为可执行");
        env::set_var("PATH", &path_cli_dir);
        env::set_var("CODE_MANAGER_HOME_OVERRIDE", root.path().join("home"));

        let output = run(&["--version".to_string()]).expect("应优先运行 PATH 中的 CLI");

        assert!(output.status.success());
        assert_eq!(String::from_utf8_lossy(&output.stdout), "path\n");
    }

    #[cfg(unix)]
    #[test]
    fn run_finds_cli_in_standard_install_directory() {
        use std::os::unix::fs::PermissionsExt;

        let _guard = crate::utils::TEST_ENV_LOCK
            .lock()
            .unwrap_or_else(|error| error.into_inner());
        let _path_guard = EnvVarGuard::capture("PATH");
        let _home_guard = EnvVarGuard::capture("CODE_MANAGER_HOME_OVERRIDE");
        let _standard_dirs_guard =
            EnvVarGuard::capture("CODE_MANAGER_TEST_CLAUDE_STANDARD_BIN_DIRS");
        let root = tempfile::tempdir().expect("应可创建临时目录");
        let standard_bin_dir = root.path().join("standard-bin");
        fs::create_dir_all(&standard_bin_dir).expect("应可创建标准安装目录替身");
        let cli_path = standard_bin_dir.join("claude");
        fs::write(&cli_path, "#!/bin/sh\nprintf 'standard\\n'\n")
            .expect("应可写入标准安装目录中的 CLI");
        fs::set_permissions(&cli_path, fs::Permissions::from_mode(0o755))
            .expect("应可设置标准安装 CLI 为可执行");
        env::set_var("PATH", "/usr/bin:/bin:/usr/sbin:/sbin");
        env::set_var("CODE_MANAGER_HOME_OVERRIDE", root.path().join("home"));
        env::set_var(
            "CODE_MANAGER_TEST_CLAUDE_STANDARD_BIN_DIRS",
            &standard_bin_dir,
        );

        let output = run(&["--version".to_string()]).expect("应运行标准安装目录中的 CLI");

        assert!(output.status.success());
        assert_eq!(String::from_utf8_lossy(&output.stdout), "standard\n");
    }
}
