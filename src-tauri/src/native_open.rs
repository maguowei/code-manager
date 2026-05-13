use crate::config::{EDITOR_APPS, TERMINAL_APPS};
use serde::Serialize;
use std::env;
use std::ffi::OsString;
use std::path::{Path, PathBuf};
use std::process::Command;

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct NativeOpenAppOption {
    pub slug: String,
    pub label: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct NativeOpenAppOptions {
    pub platform: NativePlatform,
    pub supported_editors: Vec<NativeOpenAppOption>,
    pub supported_terminals: Vec<NativeOpenAppOption>,
    pub editors: Vec<NativeOpenAppOption>,
    pub terminals: Vec<NativeOpenAppOption>,
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum NativePlatform {
    Macos,
    Linux,
    Windows,
    Other,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct NativeOpenCommand {
    program: String,
    args: Vec<String>,
    current_dir: Option<PathBuf>,
    hide_window: bool,
}

impl NativeOpenCommand {
    fn new(program: impl Into<String>, args: Vec<String>) -> Self {
        Self {
            program: program.into(),
            args,
            current_dir: None,
            hide_window: false,
        }
    }

    fn with_current_dir(mut self, current_dir: &Path) -> Self {
        self.current_dir = Some(current_dir.to_path_buf());
        self
    }

    fn with_hidden_window(mut self) -> Self {
        self.hide_window = true;
        self
    }
}

#[derive(Debug, Clone, Copy)]
struct EditorOptionDefinition {
    slug: &'static str,
    label: &'static str,
    command: &'static str,
    mac_app_names: &'static [&'static str],
}

#[derive(Debug, Clone, Copy)]
struct TerminalOptionDefinition {
    slug: &'static str,
    label: &'static str,
}

const VSCODE_MAC_APP_NAMES: &[&str] = &["Visual Studio Code"];
const CURSOR_MAC_APP_NAMES: &[&str] = &["Cursor"];
const WINDSURF_MAC_APP_NAMES: &[&str] = &["Windsurf"];
const ZED_MAC_APP_NAMES: &[&str] = &["Zed"];

const EDITOR_OPTION_DEFINITIONS: &[EditorOptionDefinition] = &[
    EditorOptionDefinition {
        slug: "vscode",
        label: "VS Code",
        command: "code",
        mac_app_names: VSCODE_MAC_APP_NAMES,
    },
    EditorOptionDefinition {
        slug: "cursor",
        label: "Cursor",
        command: "cursor",
        mac_app_names: CURSOR_MAC_APP_NAMES,
    },
    EditorOptionDefinition {
        slug: "windsurf",
        label: "Windsurf",
        command: "windsurf",
        mac_app_names: WINDSURF_MAC_APP_NAMES,
    },
    EditorOptionDefinition {
        slug: "zed",
        label: "Zed",
        command: "zed",
        mac_app_names: ZED_MAC_APP_NAMES,
    },
];

const TERMINAL_OPTION_DEFINITIONS: &[TerminalOptionDefinition] = &[
    TerminalOptionDefinition {
        slug: "terminal",
        label: "Terminal",
    },
    TerminalOptionDefinition {
        slug: "iterm",
        label: "iTerm",
    },
    TerminalOptionDefinition {
        slug: "warp",
        label: "Warp",
    },
    TerminalOptionDefinition {
        slug: "ghostty",
        label: "Ghostty",
    },
];

#[tauri::command]
pub fn get_native_open_app_options() -> NativeOpenAppOptions {
    let terminal_env = env::var("TERMINAL").ok();
    detect_native_open_app_options(
        current_platform(),
        terminal_env.as_deref(),
        command_exists,
        mac_app_exists,
    )
}

pub(crate) fn open_path_in_editor(path: &Path, editor_slug: &str) -> Result<(), String> {
    ensure_path_exists(path)?;
    match current_platform() {
        NativePlatform::Macos => {
            let request = macos_editor_request(path, editor_slug)?;
            run_command_status(&request, "编辑器")
        }
        NativePlatform::Linux => {
            let command = NativeOpenCommand::new(
                editor_cli_command(editor_slug)?,
                vec![path.to_string_lossy().to_string()],
            );
            spawn_command(&command, "编辑器").map_err(|error| {
                if error.kind() == std::io::ErrorKind::NotFound {
                    format!(
                        "未找到编辑器命令 `{}`，请确认对应 CLI 已安装并在 PATH 中",
                        command.program
                    )
                } else {
                    format!("启动编辑器 `{}` 失败: {error}", command.program)
                }
            })
        }
        NativePlatform::Windows => {
            open_path_with_windows_editor(path, editor_cli_command(editor_slug)?)
        }
        NativePlatform::Other => Err("当前平台暂不支持打开本地应用".to_string()),
    }
}

pub(crate) fn open_dir_in_terminal(dir: &Path, terminal_slug: &str) -> Result<(), String> {
    ensure_dir_exists(dir)?;
    match current_platform() {
        NativePlatform::Macos => {
            let request = macos_terminal_request(dir, terminal_slug)?;
            run_command_status(&request, "终端")
        }
        NativePlatform::Linux => {
            let terminal_env = env::var("TERMINAL").ok();
            let candidates = linux_terminal_candidates(terminal_slug, terminal_env.as_deref())?
                .into_iter()
                .map(|candidate| candidate.with_current_dir(dir))
                .collect::<Vec<_>>();
            spawn_first_available(candidates, "终端")
        }
        NativePlatform::Windows => {
            let candidates = windows_terminal_candidates(terminal_slug, dir)?;
            spawn_first_available(candidates, "终端")
        }
        NativePlatform::Other => Err("当前平台暂不支持打开本地应用".to_string()),
    }
}

fn current_platform() -> NativePlatform {
    if cfg!(target_os = "macos") {
        NativePlatform::Macos
    } else if cfg!(target_os = "linux") {
        NativePlatform::Linux
    } else if cfg!(windows) {
        NativePlatform::Windows
    } else {
        NativePlatform::Other
    }
}

fn ensure_path_exists(path: &Path) -> Result<(), String> {
    if path.exists() {
        Ok(())
    } else {
        Err("路径不存在".to_string())
    }
}

fn ensure_dir_exists(path: &Path) -> Result<(), String> {
    if path.is_dir() {
        Ok(())
    } else {
        Err("目录不存在".to_string())
    }
}

fn editor_cli_command(editor_slug: &str) -> Result<&'static str, String> {
    match editor_slug {
        "vscode" => Ok("code"),
        "cursor" => Ok("cursor"),
        "windsurf" => Ok("windsurf"),
        "zed" => Ok("zed"),
        _ => Err("默认编辑器配置无效，请重新选择".to_string()),
    }
}

fn detect_native_open_app_options(
    platform: NativePlatform,
    terminal_env: Option<&str>,
    command_exists: impl Fn(&str) -> bool,
    mac_app_exists: impl Fn(&str) -> bool,
) -> NativeOpenAppOptions {
    NativeOpenAppOptions {
        platform,
        supported_editors: supported_editor_options(platform),
        supported_terminals: supported_terminal_options(platform),
        editors: detect_editor_options(platform, &command_exists, &mac_app_exists),
        terminals: detect_terminal_options(
            platform,
            terminal_env,
            &command_exists,
            &mac_app_exists,
        ),
    }
}

fn detect_editor_options(
    platform: NativePlatform,
    command_exists: &impl Fn(&str) -> bool,
    mac_app_exists: &impl Fn(&str) -> bool,
) -> Vec<NativeOpenAppOption> {
    EDITOR_OPTION_DEFINITIONS
        .iter()
        .filter(|definition| match platform {
            NativePlatform::Macos => {
                command_exists(definition.command)
                    || definition
                        .mac_app_names
                        .iter()
                        .any(|app_name| mac_app_exists(app_name))
            }
            NativePlatform::Linux | NativePlatform::Windows => command_exists(definition.command),
            NativePlatform::Other => false,
        })
        .map(|definition| option_from_parts(definition.slug, definition.label))
        .collect()
}

fn detect_terminal_options(
    platform: NativePlatform,
    terminal_env: Option<&str>,
    command_exists: &impl Fn(&str) -> bool,
    mac_app_exists: &impl Fn(&str) -> bool,
) -> Vec<NativeOpenAppOption> {
    TERMINAL_OPTION_DEFINITIONS
        .iter()
        .filter(|definition| {
            terminal_is_supported(platform, definition.slug)
                && terminal_is_available(
                    platform,
                    definition.slug,
                    terminal_env,
                    command_exists,
                    mac_app_exists,
                )
        })
        .map(|definition| option_from_parts(definition.slug, definition.label))
        .collect()
}

fn supported_editor_options(platform: NativePlatform) -> Vec<NativeOpenAppOption> {
    match platform {
        NativePlatform::Macos | NativePlatform::Linux | NativePlatform::Windows => {
            EDITOR_OPTION_DEFINITIONS
                .iter()
                .map(|definition| option_from_parts(definition.slug, definition.label))
                .collect()
        }
        NativePlatform::Other => Vec::new(),
    }
}

fn supported_terminal_options(platform: NativePlatform) -> Vec<NativeOpenAppOption> {
    TERMINAL_OPTION_DEFINITIONS
        .iter()
        .filter(|definition| terminal_is_supported(platform, definition.slug))
        .map(|definition| option_from_parts(definition.slug, definition.label))
        .collect()
}

fn option_from_parts(slug: &str, label: &str) -> NativeOpenAppOption {
    NativeOpenAppOption {
        slug: slug.to_string(),
        label: label.to_string(),
    }
}

fn terminal_is_supported(platform: NativePlatform, terminal_slug: &str) -> bool {
    match platform {
        NativePlatform::Macos => matches!(terminal_slug, "terminal" | "iterm" | "warp" | "ghostty"),
        NativePlatform::Linux => matches!(terminal_slug, "terminal" | "warp" | "ghostty"),
        NativePlatform::Windows => matches!(terminal_slug, "terminal" | "warp"),
        NativePlatform::Other => false,
    }
}

fn terminal_is_available(
    platform: NativePlatform,
    terminal_slug: &str,
    terminal_env: Option<&str>,
    command_exists: &impl Fn(&str) -> bool,
    mac_app_exists: &impl Fn(&str) -> bool,
) -> bool {
    match (platform, terminal_slug) {
        (NativePlatform::Macos, "terminal") => mac_app_exists("Terminal"),
        (NativePlatform::Macos, "iterm") => mac_app_exists("iTerm") || mac_app_exists("iTerm2"),
        (NativePlatform::Macos, "warp") => {
            mac_app_exists("Warp") || command_exists("warp-terminal")
        }
        (NativePlatform::Macos, "ghostty") => {
            mac_app_exists("Ghostty") || command_exists("ghostty")
        }
        (NativePlatform::Linux, "terminal") => {
            terminal_env
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .is_some_and(command_exists)
                || linux_terminal_candidates("terminal", None)
                    .ok()
                    .into_iter()
                    .flatten()
                    .any(|candidate| command_exists(&candidate.program))
        }
        (NativePlatform::Linux, "warp") => command_exists("warp-terminal"),
        (NativePlatform::Linux, "ghostty") => command_exists("ghostty"),
        (NativePlatform::Windows, "terminal") => ["wt.exe", "powershell.exe", "cmd.exe"]
            .into_iter()
            .any(command_exists),
        (NativePlatform::Windows, "warp") => windows_warp_program_candidates()
            .iter()
            .any(|program| command_exists(program)),
        _ => false,
    }
}

fn macos_editor_request(path: &Path, editor_slug: &str) -> Result<NativeOpenCommand, String> {
    let app_name = app_display_name(EDITOR_APPS, editor_slug, "默认编辑器配置无效，请重新选择")?;
    Ok(macos_open_app_request(path, app_name))
}

fn macos_terminal_request(path: &Path, terminal_slug: &str) -> Result<NativeOpenCommand, String> {
    let app_name = app_display_name(TERMINAL_APPS, terminal_slug, "默认终端配置无效，请重新选择")?;
    Ok(macos_open_app_request(path, app_name))
}

fn app_display_name(
    apps: &[(&'static str, &'static str)],
    slug: &str,
    error_message: &'static str,
) -> Result<&'static str, String> {
    apps.iter()
        .find(|(candidate, _)| *candidate == slug)
        .map(|(_, display)| *display)
        .ok_or_else(|| error_message.to_string())
}

fn macos_open_app_request(path: &Path, app_name: &str) -> NativeOpenCommand {
    NativeOpenCommand::new(
        "open",
        vec![
            "-a".to_string(),
            app_name.to_string(),
            path.to_string_lossy().to_string(),
        ],
    )
}

fn linux_terminal_candidates(
    terminal_slug: &str,
    terminal_env: Option<&str>,
) -> Result<Vec<NativeOpenCommand>, String> {
    let mut programs = Vec::new();
    match terminal_slug {
        "terminal" => {
            if let Some(value) = terminal_env
                .map(str::trim)
                .filter(|value| !value.is_empty())
            {
                push_unique_program(&mut programs, value);
            }
            for program in [
                "xdg-terminal-exec",
                "x-terminal-emulator",
                "gnome-terminal",
                "konsole",
            ] {
                push_unique_program(&mut programs, program);
            }
        }
        "ghostty" => push_unique_program(&mut programs, "ghostty"),
        "warp" => push_unique_program(&mut programs, "warp-terminal"),
        "iterm" => return Err("iTerm 仅支持 macOS".to_string()),
        _ => return Err("默认终端配置无效，请重新选择".to_string()),
    }

    Ok(programs
        .into_iter()
        .map(|program| NativeOpenCommand::new(program, Vec::new()))
        .collect())
}

fn windows_terminal_candidates(
    terminal_slug: &str,
    dir: &Path,
) -> Result<Vec<NativeOpenCommand>, String> {
    match terminal_slug {
        "terminal" => {
            let dir_arg = dir.to_string_lossy().to_string();
            Ok(vec![
                NativeOpenCommand::new("wt.exe", vec!["-d".to_string(), dir_arg])
                    .with_hidden_window(),
                NativeOpenCommand::new(
                    "cmd.exe",
                    vec![
                        "/C".to_string(),
                        "start".to_string(),
                        "".to_string(),
                        "powershell.exe".to_string(),
                        "-NoExit".to_string(),
                    ],
                )
                .with_current_dir(dir)
                .with_hidden_window(),
                NativeOpenCommand::new(
                    "cmd.exe",
                    vec![
                        "/C".to_string(),
                        "start".to_string(),
                        "".to_string(),
                        "cmd.exe".to_string(),
                        "/K".to_string(),
                    ],
                )
                .with_current_dir(dir)
                .with_hidden_window(),
            ])
        }
        "warp" => Ok(windows_warp_program_candidates()
            .into_iter()
            .map(|program| NativeOpenCommand::new(program, Vec::new()).with_current_dir(dir))
            .collect()),
        "iterm" | "ghostty" => Err(format!(
            "当前平台暂不支持 {} 终端",
            terminal_display_name(terminal_slug)
        )),
        _ => Err("默认终端配置无效，请重新选择".to_string()),
    }
}

fn windows_warp_program_candidates() -> Vec<String> {
    windows_warp_program_candidates_from_env(
        env::var_os("LOCALAPPDATA"),
        env::var_os("PROGRAMFILES"),
    )
}

fn windows_warp_program_candidates_from_env(
    local_app_data: Option<OsString>,
    program_files: Option<OsString>,
) -> Vec<String> {
    let mut programs = Vec::new();
    push_unique_program(&mut programs, "warp.exe");
    if let Some(base_dir) = local_app_data {
        push_unique_program(
            &mut programs,
            &PathBuf::from(base_dir)
                .join("Programs")
                .join("Warp")
                .join("warp.exe")
                .to_string_lossy(),
        );
    }
    if let Some(base_dir) = program_files {
        push_unique_program(
            &mut programs,
            &PathBuf::from(base_dir)
                .join("Warp")
                .join("warp.exe")
                .to_string_lossy(),
        );
    }
    programs
}

fn terminal_display_name(terminal_slug: &str) -> &'static str {
    TERMINAL_APPS
        .iter()
        .find(|(slug, _)| *slug == terminal_slug)
        .map(|(_, display)| *display)
        .unwrap_or("该")
}

fn push_unique_program(programs: &mut Vec<String>, program: &str) {
    if !programs.iter().any(|candidate| candidate == program) {
        programs.push(program.to_string());
    }
}

fn run_command_status(request: &NativeOpenCommand, action_name: &str) -> Result<(), String> {
    let mut command = build_command(request);
    let status = command
        .status()
        .map_err(|error| format!("启动{action_name} `{}` 失败: {error}", request.program))?;

    if status.success() {
        Ok(())
    } else {
        Err(format!(
            "启动{action_name} `{}` 失败，退出码: {:?}",
            request.program,
            status.code()
        ))
    }
}

fn spawn_first_available(
    candidates: Vec<NativeOpenCommand>,
    action_name: &str,
) -> Result<(), String> {
    let mut missing_programs = Vec::new();
    let mut failures = Vec::new();

    for candidate in candidates {
        match spawn_command(&candidate, action_name) {
            Ok(()) => return Ok(()),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                missing_programs.push(candidate.program);
            }
            Err(error) => failures.push(format!("{}: {error}", candidate.program)),
        }
    }

    if failures.is_empty() {
        Err(format!(
            "未找到可用{action_name}命令，请确认已安装并在 PATH 中可访问: {}",
            missing_programs.join(", ")
        ))
    } else {
        Err(format!("启动{action_name}失败: {}", failures.join("; ")))
    }
}

fn spawn_command(request: &NativeOpenCommand, _action_name: &str) -> Result<(), std::io::Error> {
    let mut command = build_command(request);
    command.spawn().map(|_| ())
}

fn build_command(request: &NativeOpenCommand) -> Command {
    let mut command = Command::new(&request.program);
    command.args(&request.args);
    if let Some(current_dir) = &request.current_dir {
        command.current_dir(current_dir);
    }
    configure_command_window(&mut command, request.hide_window);
    command
}

#[cfg(windows)]
fn configure_command_window(command: &mut Command, hide_window: bool) {
    use std::os::windows::process::CommandExt;
    if hide_window {
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        command.creation_flags(CREATE_NO_WINDOW);
    }
}

#[cfg(not(windows))]
fn configure_command_window(_command: &mut Command, _hide_window: bool) {}

fn open_path_with_windows_editor(path: &Path, command: &str) -> Result<(), String> {
    #[cfg(windows)]
    {
        tauri_plugin_opener::open_path(path, Some(command)).map_err(|error| {
            format!("启动编辑器 `{command}` 失败，请确认对应 CLI 已安装并在 PATH 中: {error}")
        })
    }

    #[cfg(not(windows))]
    {
        let _ = (path, command);
        Err("当前平台暂不支持 Windows 编辑器启动".to_string())
    }
}

fn command_exists(command: &str) -> bool {
    let command_path = Path::new(command);
    if command_path.components().count() > 1 {
        return command_path.is_file();
    }

    let Some(paths) = env::var_os("PATH") else {
        return false;
    };
    env::split_paths(&paths)
        .any(|dir| executable_candidates(command).any(|name| dir.join(name).is_file()))
}

fn executable_candidates(command: &str) -> impl Iterator<Item = OsString> + '_ {
    let base = OsString::from(command);
    let mut candidates = vec![base.clone()];
    if cfg!(windows) && Path::new(command).extension().is_none() {
        let extensions = env::var_os("PATHEXT")
            .map(|value| {
                env::split_paths(&value)
                    .map(|path| path.to_string_lossy().to_string())
                    .collect::<Vec<_>>()
            })
            .filter(|extensions| !extensions.is_empty())
            .unwrap_or_else(|| vec![".EXE".to_string(), ".CMD".to_string(), ".BAT".to_string()]);
        for extension in extensions {
            let mut candidate = base.clone();
            candidate.push(extension);
            candidates.push(candidate);
        }
    }
    candidates.into_iter()
}

fn mac_app_exists(app_name: &str) -> bool {
    mac_app_candidate_paths(app_name)
        .iter()
        .any(|path| path.is_dir())
}

fn mac_app_candidate_paths(app_name: &str) -> Vec<PathBuf> {
    let bundle = format!("{app_name}.app");
    let mut paths = vec![
        PathBuf::from("/Applications").join(&bundle),
        PathBuf::from("/Applications/Utilities").join(&bundle),
        PathBuf::from("/System/Applications").join(&bundle),
        PathBuf::from("/System/Applications/Utilities").join(&bundle),
    ];
    if let Some(home) = env::var_os("HOME") {
        paths.push(PathBuf::from(home).join("Applications").join(bundle));
    }
    paths
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    #[test]
    fn editor_cli_mapping_covers_linux_and_windows_editors() {
        assert_eq!(editor_cli_command("vscode").unwrap(), "code");
        assert_eq!(editor_cli_command("cursor").unwrap(), "cursor");
        assert_eq!(editor_cli_command("windsurf").unwrap(), "windsurf");
        assert_eq!(editor_cli_command("zed").unwrap(), "zed");

        let err = editor_cli_command("unknown").unwrap_err();
        assert!(err.contains("默认编辑器配置无效"));
    }

    #[test]
    fn macos_open_requests_keep_existing_open_a_shape() {
        let path = Path::new("/tmp/project with space");

        let editor = macos_editor_request(path, "vscode").unwrap();
        assert_eq!(editor.program, "open");
        assert_eq!(
            editor.args,
            vec![
                "-a".to_string(),
                "Visual Studio Code".to_string(),
                "/tmp/project with space".to_string()
            ]
        );

        let terminal = macos_terminal_request(path, "iterm").unwrap();
        assert_eq!(terminal.program, "open");
        assert_eq!(
            terminal.args,
            vec![
                "-a".to_string(),
                "iTerm".to_string(),
                "/tmp/project with space".to_string()
            ]
        );
    }

    #[test]
    fn linux_terminal_candidates_try_environment_then_standard_fallbacks() {
        let candidates = linux_terminal_candidates("terminal", Some("custom-terminal")).unwrap();

        assert_eq!(candidates.len(), 5);
        assert_eq!(candidates[0].program, "custom-terminal");
        assert_eq!(candidates[1].program, "xdg-terminal-exec");
        assert_eq!(candidates[2].program, "x-terminal-emulator");
        assert_eq!(candidates[3].program, "gnome-terminal");
        assert_eq!(candidates[4].program, "konsole");
    }

    #[test]
    fn linux_terminal_candidates_without_env_has_four_fallbacks() {
        let candidates = linux_terminal_candidates("terminal", None).unwrap();

        assert_eq!(candidates.len(), 4);
        assert_eq!(candidates[0].program, "xdg-terminal-exec");
        assert_eq!(candidates[1].program, "x-terminal-emulator");
        assert_eq!(candidates[2].program, "gnome-terminal");
        assert_eq!(candidates[3].program, "konsole");
    }

    #[test]
    fn linux_terminal_candidates_support_known_linux_terminal_apps() {
        let ghostty = linux_terminal_candidates("ghostty", None).unwrap();
        assert_eq!(ghostty[0].program, "ghostty");

        let warp = linux_terminal_candidates("warp", None).unwrap();
        assert_eq!(warp[0].program, "warp-terminal");

        let err = linux_terminal_candidates("iterm", None).unwrap_err();
        assert!(err.contains("仅支持 macOS"));
    }

    #[test]
    fn windows_terminal_candidates_try_windows_terminal_then_shells() {
        let candidates = windows_terminal_candidates("terminal", Path::new("C:\\Projects\\demo"))
            .expect("terminal 应可构建 Windows 候选命令");

        assert_eq!(candidates[0].program, "wt.exe");
        assert_eq!(
            candidates[0].args,
            vec!["-d".to_string(), "C:\\Projects\\demo".to_string()]
        );
        assert_eq!(candidates[1].program, "cmd.exe");
        assert_eq!(
            candidates[1].args,
            vec![
                "/C".to_string(),
                "start".to_string(),
                "".to_string(),
                "powershell.exe".to_string(),
                "-NoExit".to_string()
            ]
        );
        assert_eq!(candidates[2].program, "cmd.exe");
        assert_eq!(
            candidates[2].args,
            vec![
                "/C".to_string(),
                "start".to_string(),
                "".to_string(),
                "cmd.exe".to_string(),
                "/K".to_string()
            ]
        );
    }

    #[test]
    fn windows_terminal_candidates_support_warp_with_default_install_paths() {
        let candidates = windows_terminal_candidates("warp", Path::new("C:\\Projects\\demo"))
            .expect("Windows 应支持 Warp 终端");

        assert!(candidates
            .iter()
            .any(|candidate| candidate.program == "warp.exe"));
        assert!(candidates
            .iter()
            .all(|candidate| candidate.current_dir.as_deref()
                == Some(Path::new("C:\\Projects\\demo"))));
    }

    #[test]
    fn windows_warp_program_candidates_include_official_install_paths() {
        let candidates = windows_warp_program_candidates_from_env(
            Some(OsString::from("C:\\Users\\demo\\AppData\\Local")),
            Some(OsString::from("C:\\Program Files")),
        )
        .into_iter()
        .map(|candidate| candidate.replace('/', "\\"))
        .collect::<Vec<_>>();

        assert!(candidates.contains(&"warp.exe".to_string()));
        assert!(candidates
            .contains(&"C:\\Users\\demo\\AppData\\Local\\Programs\\Warp\\warp.exe".to_string()));
        assert!(candidates.contains(&"C:\\Program Files\\Warp\\warp.exe".to_string()));
    }

    #[test]
    fn windows_rejects_non_windows_terminal_apps_for_now() {
        for app in ["iterm", "ghostty"] {
            let err = windows_terminal_candidates(app, Path::new("C:\\Projects\\demo"))
                .expect_err("非系统终端在 Windows v1 应被拒绝");
            assert!(err.contains("当前平台暂不支持"));
        }
    }

    #[test]
    fn native_open_options_only_include_detected_linux_tools() {
        let options = detect_native_open_app_options(
            NativePlatform::Linux,
            Some("custom-terminal"),
            |command| matches!(command, "code" | "ghostty" | "custom-terminal"),
            |_| false,
        );

        assert_eq!(option_slugs(&options.editors), vec!["vscode"]);
        assert_eq!(
            option_slugs(&options.terminals),
            vec!["terminal", "ghostty"]
        );
    }

    #[test]
    fn native_open_options_ignore_missing_linux_terminal_env() {
        let options = detect_native_open_app_options(
            NativePlatform::Linux,
            Some("missing-terminal"),
            |_| false,
            |_| false,
        );

        assert!(options.terminals.is_empty());
    }

    #[test]
    fn native_open_options_include_supported_lists_for_windows() {
        let options = detect_native_open_app_options(
            NativePlatform::Windows,
            None,
            |command| matches!(command, "wt.exe" | "warp.exe" | "code"),
            |_| false,
        );

        assert_eq!(options.platform, NativePlatform::Windows);
        assert_eq!(
            option_slugs(&options.supported_terminals),
            vec!["terminal", "warp"]
        );
        assert_eq!(option_slugs(&options.terminals), vec!["terminal", "warp"]);
        assert_eq!(
            option_slugs(&options.supported_editors),
            vec!["vscode", "cursor", "windsurf", "zed"]
        );
        assert_eq!(option_slugs(&options.editors), vec!["vscode"]);
    }

    #[test]
    fn native_open_options_report_empty_supported_lists_for_other_platforms() {
        let options =
            detect_native_open_app_options(NativePlatform::Other, None, |_| true, |_| true);

        assert_eq!(options.platform, NativePlatform::Other);
        assert!(options.supported_terminals.is_empty());
        assert!(options.supported_editors.is_empty());
        assert!(options.terminals.is_empty());
        assert!(options.editors.is_empty());
    }

    #[test]
    fn native_open_options_detect_macos_apps_without_cli_commands() {
        let options = detect_native_open_app_options(
            NativePlatform::Macos,
            None,
            |_| false,
            |app_name| matches!(app_name, "Visual Studio Code" | "Terminal" | "Ghostty"),
        );

        assert_eq!(option_slugs(&options.editors), vec!["vscode"]);
        assert_eq!(
            option_slugs(&options.terminals),
            vec!["terminal", "ghostty"]
        );
    }

    fn option_slugs(options: &[NativeOpenAppOption]) -> Vec<&str> {
        options.iter().map(|option| option.slug.as_str()).collect()
    }
}
