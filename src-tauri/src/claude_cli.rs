use std::env;
use std::fmt;
use std::path::{Path, PathBuf};
use std::process::{Command, Output};
use std::time::Duration;

#[cfg(windows)]
const CLAUDE_FILE_NAMES: &[&str] = &["claude.exe", "claude.cmd", "claude.bat", "claude"];
#[cfg(not(windows))]
const CLAUDE_FILE_NAMES: &[&str] = &["claude"];

#[derive(Debug)]
pub(crate) enum ClaudeCliError {
    NotFound,
    Spawn(std::io::Error),
    Timeout,
}

impl fmt::Display for ClaudeCliError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::NotFound => write!(
                formatter,
                "未找到 claude CLI，请确认 Claude Code 已安装并可在 PATH 或标准安装目录中访问"
            ),
            Self::Spawn(error) => write!(formatter, "执行 claude CLI 失败: {error}"),
            Self::Timeout => write!(formatter, "claude CLI 执行超时，请稍后重试"),
        }
    }
}

pub(crate) fn run(args: &[String]) -> Result<Output, ClaudeCliError> {
    let mut command = build_command(args)?;
    command.output().map_err(ClaudeCliError::Spawn)
}

pub(crate) async fn run_with_timeout(
    args: &[String],
    timeout: Duration,
) -> Result<Output, ClaudeCliError> {
    let command = build_command(args)?;
    run_command_with_timeout(command, timeout).await
}

async fn run_command_with_timeout(
    command: Command,
    timeout: Duration,
) -> Result<Output, ClaudeCliError> {
    let mut command = tokio::process::Command::from(command);
    // 超时会丢弃 output future；终止其子进程，避免后台残留执行中的 CLI。
    command.kill_on_drop(true);
    command.stdin(std::process::Stdio::null());
    tokio::time::timeout(timeout, command.output())
        .await
        .map_err(|_| ClaudeCliError::Timeout)?
        .map_err(ClaudeCliError::Spawn)
}

fn build_command(args: &[String]) -> Result<Command, ClaudeCliError> {
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
    Ok(command)
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
    use super::{run, run_command_with_timeout, ClaudeCliError};
    use std::env;
    use std::ffi::OsString;
    use std::fs;

    #[test]
    fn command_timeout_terminates_child_without_blocking_runtime() {
        use std::process::Command;
        use std::time::Duration;

        let root = tempfile::tempdir().unwrap();
        let marker = root.path().join("finished");
        let mut command = Command::new("/bin/sh");
        command.args([
            "-c",
            "/bin/sleep 0.2; printf finished > \"$1\"",
            "diagnostic",
        ]);
        command.arg(&marker);
        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();
        runtime.block_on(async {
            let task = tokio::spawn(run_command_with_timeout(command, Duration::from_millis(50)));
            tokio::time::sleep(Duration::from_millis(10)).await;
            assert!(!marker.exists());
            let result = task.await.unwrap();
            assert!(matches!(result, Err(ClaudeCliError::Timeout)));
            tokio::time::sleep(Duration::from_millis(300)).await;
            assert!(!marker.exists(), "超时后 CLI 不应继续写入");
        });
    }

    #[test]
    fn command_with_timeout_collects_large_output_and_exit_status() {
        use std::process::Command;
        use std::time::Duration;

        let mut command = Command::new("/bin/sh");
        command.args([
            "-c",
            "/bin/dd if=/dev/zero bs=1024 count=600 2>/dev/null; printf failure >&2; exit 7",
        ]);
        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();
        let output = runtime
            .block_on(run_command_with_timeout(command, Duration::from_secs(5)))
            .unwrap();
        assert_eq!(output.stdout.len(), 600 * 1024);
        assert_eq!(output.stderr, b"failure");
        assert_eq!(output.status.code(), Some(7));
    }

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
