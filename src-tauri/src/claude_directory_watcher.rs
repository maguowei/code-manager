use notify::{RecursiveMode, Watcher};
use serde::Serialize;
use std::collections::BTreeSet;
use std::path::{Component, Path, PathBuf};
use std::sync::mpsc::{self, Receiver, Sender};
use std::thread::{self, JoinHandle};
use std::time::Duration;
use tauri::{AppHandle, Emitter};

const CLAUDE_DIRECTORY_CHANGED_EVENT: &str = "claude-directory-changed";
const DEBOUNCE_DELAY: Duration = Duration::from_millis(400);
const NODE_MODULES_DIR_NAME: &str = "node_modules";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeDirectoryChangedPayload {
    pub paths: Vec<String>,
}

enum WatcherMessage {
    Changed(Vec<PathBuf>),
    Error,
    Stop,
}

pub struct ClaudeDirectoryWatcherState {
    stop_tx: Option<Sender<WatcherMessage>>,
    worker: Option<JoinHandle<()>>,
    _watcher: Option<notify::RecommendedWatcher>,
}

impl ClaudeDirectoryWatcherState {
    fn inactive() -> Self {
        Self {
            stop_tx: None,
            worker: None,
            _watcher: None,
        }
    }
}

impl Drop for ClaudeDirectoryWatcherState {
    fn drop(&mut self) {
        if let Some(stop_tx) = self.stop_tx.take() {
            let _ = stop_tx.send(WatcherMessage::Stop);
        }
        if let Some(worker) = self.worker.take() {
            let _ = worker.join();
        }
    }
}

pub(crate) fn start_claude_directory_watcher(app_handle: AppHandle) -> ClaudeDirectoryWatcherState {
    let root = match crate::utils::get_home_dir() {
        Ok(home_dir) => home_dir.join(".claude"),
        Err(_) => {
            log::warn!("event=claude_directory.watch status=warn reason=home_unavailable");
            return ClaudeDirectoryWatcherState::inactive();
        }
    };

    match std::fs::metadata(&root) {
        Ok(metadata) if metadata.is_dir() => {}
        Ok(_) => {
            log::warn!("event=claude_directory.watch status=warn reason=root_not_directory");
            return ClaudeDirectoryWatcherState::inactive();
        }
        Err(_) => {
            log::warn!("event=claude_directory.watch status=warn reason=root_missing");
            return ClaudeDirectoryWatcherState::inactive();
        }
    }

    let (tx, rx) = mpsc::channel::<WatcherMessage>();
    let event_tx = tx.clone();
    let mut watcher =
        match notify::recommended_watcher(move |result: notify::Result<notify::Event>| match result
        {
            Ok(event) => {
                let _ = event_tx.send(WatcherMessage::Changed(event.paths));
            }
            Err(_) => {
                let _ = event_tx.send(WatcherMessage::Error);
            }
        }) {
            Ok(watcher) => watcher,
            Err(_) => {
                log::error!("event=claude_directory.watch status=error reason=create_failed");
                return ClaudeDirectoryWatcherState::inactive();
            }
        };

    if watcher.watch(&root, RecursiveMode::Recursive).is_err() {
        log::error!("event=claude_directory.watch status=error reason=watch_failed");
        return ClaudeDirectoryWatcherState::inactive();
    }

    let worker_root = root;
    let worker = match thread::Builder::new()
        .name("claude-directory-watcher".to_string())
        .spawn(move || run_watch_loop(app_handle, worker_root, rx))
    {
        Ok(worker) => worker,
        Err(_) => {
            log::error!("event=claude_directory.watch status=error reason=thread_failed");
            return ClaudeDirectoryWatcherState::inactive();
        }
    };

    log::info!("event=claude_directory.watch status=ok");
    ClaudeDirectoryWatcherState {
        stop_tx: Some(tx),
        worker: Some(worker),
        _watcher: Some(watcher),
    }
}

fn run_watch_loop(app_handle: AppHandle, root: PathBuf, rx: Receiver<WatcherMessage>) {
    let mut pending_paths = BTreeSet::new();

    loop {
        match rx.recv() {
            Ok(WatcherMessage::Changed(paths)) => {
                pending_paths.extend(collect_changed_paths(&root, paths));
            }
            Ok(WatcherMessage::Error) => {
                log::warn!("event=claude_directory.watch status=warn reason=runtime_error");
                continue;
            }
            Ok(WatcherMessage::Stop) | Err(_) => return,
        }

        loop {
            match rx.recv_timeout(DEBOUNCE_DELAY) {
                Ok(WatcherMessage::Changed(paths)) => {
                    pending_paths.extend(collect_changed_paths(&root, paths));
                }
                Ok(WatcherMessage::Error) => {
                    log::warn!("event=claude_directory.watch status=warn reason=runtime_error");
                }
                Ok(WatcherMessage::Stop) => return,
                Err(mpsc::RecvTimeoutError::Timeout) => break,
                Err(mpsc::RecvTimeoutError::Disconnected) => return,
            }
        }

        if pending_paths.is_empty() {
            continue;
        }

        let paths = pending_paths.iter().cloned().collect::<Vec<_>>();
        pending_paths.clear();
        let path_count = paths.len();
        let sessions_changed = paths
            .iter()
            .any(|path| path == "sessions" || path.starts_with("sessions/"));
        let payload = ClaudeDirectoryChangedPayload { paths };
        if app_handle
            .emit(CLAUDE_DIRECTORY_CHANGED_EVENT, payload)
            .is_err()
        {
            log::warn!("event=claude_directory.watch.emit status=warn reason=emit_failed");
        } else {
            log::info!("event=claude_directory.watch.emit status=ok path_count={path_count}");
        }
        if sessions_changed {
            // 只刷新会话托盘：sessions 变化与 Profile/Preset 配置无关，
            // 不需要重建主托盘（避免高频 watcher 触发整托盘重建）
            crate::tray::rebuild_sessions_tray_only(&app_handle);
        }
    }
}

fn collect_changed_paths(root: &Path, paths: impl IntoIterator<Item = PathBuf>) -> Vec<String> {
    paths
        .into_iter()
        .filter_map(|path| normalize_changed_path(root, &path))
        .collect::<BTreeSet<_>>()
        .into_iter()
        .collect()
}

fn normalize_changed_path(root: &Path, path: &Path) -> Option<String> {
    let relative_path = path.strip_prefix(root).ok()?;
    let mut parts = Vec::new();

    for component in relative_path.components() {
        match component {
            Component::Normal(part) => {
                let part = part.to_string_lossy();
                if part == NODE_MODULES_DIR_NAME {
                    return None;
                }
                parts.push(part.into_owned());
            }
            Component::CurDir => {}
            Component::ParentDir | Component::RootDir | Component::Prefix(_) => return None,
        }
    }

    if parts.is_empty() {
        return None;
    }

    Some(parts.join("/"))
}

#[cfg(test)]
mod tests {
    use super::{collect_changed_paths, normalize_changed_path, ClaudeDirectoryWatcherState};
    use std::path::PathBuf;

    #[test]
    fn changed_paths_normalize_absolute_paths_to_relative_paths() {
        let root = PathBuf::from("/tmp/ai-manager/.claude");

        let paths = collect_changed_paths(&root, [root.join("settings.json")]);

        assert_eq!(paths, vec!["settings.json"]);
    }

    #[test]
    fn changed_paths_filter_node_modules_root_and_outside_paths() {
        let root = PathBuf::from("/tmp/ai-manager/.claude");

        let paths = collect_changed_paths(
            &root,
            [
                root.clone(),
                root.join("plugins/demo/node_modules/lodash/index.js"),
                root.join("skills/demo/SKILL.md"),
                PathBuf::from("/tmp/ai-manager/outside.txt"),
            ],
        );

        assert_eq!(paths, vec!["skills/demo/SKILL.md"]);
    }

    #[test]
    fn changed_paths_dedupe_and_sort_relative_paths() {
        let root = PathBuf::from("/tmp/ai-manager/.claude");

        let paths = collect_changed_paths(
            &root,
            [
                root.join("z.txt"),
                root.join("a.txt"),
                root.join("z.txt"),
                root.join("nested/b.txt"),
                root.join("nested/a.txt"),
            ],
        );

        assert_eq!(
            paths,
            vec!["a.txt", "nested/a.txt", "nested/b.txt", "z.txt"]
        );
    }

    #[test]
    fn normalize_returns_none_when_root_equals_path() {
        // 路径恰好等于 root 时 strip_prefix 后没有任何 Normal 段，parts 为空
        let root = PathBuf::from("/tmp/ai-manager/.claude");
        assert!(normalize_changed_path(&root, &root).is_none());
    }

    #[test]
    fn normalize_filters_node_modules_at_any_depth() {
        // node_modules 在任意层级都应使整条路径被过滤
        let root = PathBuf::from("/root");

        assert!(normalize_changed_path(&root, &root.join("a/node_modules/lib.js")).is_none());
        assert!(
            normalize_changed_path(&root, &root.join("node_modules/foo")).is_none(),
            "顶层 node_modules 必须被过滤"
        );
    }

    #[test]
    fn normalize_returns_none_when_path_is_not_under_root() {
        // strip_prefix 失败时直接返回 None
        let root = PathBuf::from("/tmp/ai-manager/.claude");
        let unrelated = PathBuf::from("/tmp/elsewhere/file.txt");
        assert!(normalize_changed_path(&root, &unrelated).is_none());
    }

    #[test]
    fn normalize_joins_nested_components_with_unix_separator() {
        // 即便在 Windows 下，结果也应该使用 `/` 拼接，便于前端统一处理
        let root = PathBuf::from("/root");
        let rel = normalize_changed_path(&root, &root.join("a").join("b").join("c.md"));
        assert_eq!(rel.as_deref(), Some("a/b/c.md"));
    }

    #[test]
    fn collect_changed_paths_returns_empty_when_inputs_outside_root() {
        // 全部路径都在 root 外，结果应为空 Vec
        let root = PathBuf::from("/root");
        let paths = collect_changed_paths(
            &root,
            [
                PathBuf::from("/elsewhere/a.txt"),
                PathBuf::from("/other/b.txt"),
            ],
        );
        assert!(paths.is_empty());
    }

    #[test]
    fn inactive_state_drops_without_panic() {
        // inactive state 无 worker / stop_tx，Drop 时不能 panic（保护 start_*_watcher 早返回路径）
        let state = ClaudeDirectoryWatcherState::inactive();
        drop(state);
    }
}
