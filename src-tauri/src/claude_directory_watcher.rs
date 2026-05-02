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
            crate::tray::rebuild_tray_menu(&app_handle, None);
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
    use super::collect_changed_paths;
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
}
