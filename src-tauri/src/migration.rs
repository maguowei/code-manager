//! 一次性数据目录迁移：项目从 `ai-manager` 改名为 `code-manager` 后，
//! 把旧目录下**不可重建**的用户数据搬迁到新目录。
//!
//! 只迁移 `~/.config` 应用数据目录（`config-registry.json`、`memories.json`、
//! `skills-disabled/` 等不可重建的配置）。`usage.db`（`~/.claude/projects` 的
//! 可重建缓存）与日志目录刻意不迁移：它们可丢弃，由应用首次启动时从源数据自动重建。
//!
//! 迁移在应用启动早期执行，幂等：新目录已存在则跳过；旧目录不存在则无操作。

use std::fs;
use std::path::{Path, PathBuf};

/// 旧应用数据目录名（重命名前），位于 `~/.config/` 下。
const LEGACY_APP_DATA_DIR_NAME: &str = "ai-manager";

/// 在应用启动早期执行一次性目录迁移。
///
/// 仅在未设置测试用 `CODE_MANAGER_*` 覆盖时执行，避免污染隔离测试环境。
pub fn migrate_legacy_data_dirs() {
    // 集成测试通过环境变量隔离目录，此时跳过迁移
    if std::env::var_os("CODE_MANAGER_APP_DATA_DIR_OVERRIDE").is_some()
        || std::env::var_os("CODE_MANAGER_HOME_OVERRIDE").is_some()
    {
        return;
    }

    // 应用数据目录：~/.config/ai-manager -> ~/.config/code-manager
    // （config-registry.json、memories.json、model-pricing.json、skills-disabled/ 等）
    let new_app_data = crate::utils::get_app_data_dir();
    if let Some(legacy) = legacy_sibling(&new_app_data, LEGACY_APP_DATA_DIR_NAME) {
        migrate_dir(&legacy, &new_app_data, "app-data");
    }
}

/// 根据新目录推导同级旧目录路径；旧名与新目录同名时返回 None（防御自迁移）。
fn legacy_sibling(new_dir: &Path, legacy_name: &str) -> Option<PathBuf> {
    let parent = new_dir.parent()?;
    let legacy = parent.join(legacy_name);
    if legacy == new_dir {
        return None;
    }
    Some(legacy)
}

/// 把旧目录整体搬迁到新目录。新目录已存在或旧目录缺失时跳过，保证幂等。
fn migrate_dir(legacy: &Path, new: &Path, label: &str) {
    if !legacy.is_dir() || new.exists() {
        return;
    }
    // 优先用 rename 原子搬迁（同盘场景）
    match fs::rename(legacy, new) {
        Ok(()) => log::info!("event=migration.dir status=ok label={label} method=rename"),
        Err(rename_err) => {
            // 跨设备等情况 rename 失败，回退递归复制；保留旧目录作为备份不删除
            match copy_dir_all(legacy, new) {
                Ok(()) => log::info!("event=migration.dir status=ok label={label} method=copy"),
                Err(copy_err) => {
                    // 复制失败时清理半成品，避免下次启动误判为已迁移
                    let _ = fs::remove_dir_all(new);
                    log::warn!(
                        "event=migration.dir status=error label={label} rename_err={rename_err} copy_err={copy_err}"
                    );
                }
            }
        }
    }
}

/// 递归复制目录内容；rename 跨设备失败时的兜底实现。
fn copy_dir_all(src: &Path, dst: &Path) -> std::io::Result<()> {
    fs::create_dir_all(dst)?;
    for entry in fs::read_dir(src)? {
        let entry = entry?;
        let target = dst.join(entry.file_name());
        if entry.file_type()?.is_dir() {
            copy_dir_all(&entry.path(), &target)?;
        } else {
            fs::copy(entry.path(), &target)?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn temp_root(name: &str) -> PathBuf {
        let root = std::env::temp_dir().join(format!(
            "code-manager-migration-{name}-{}-{}",
            std::process::id(),
            crate::utils::current_timestamp()
        ));
        fs::create_dir_all(&root).unwrap();
        root
    }

    #[test]
    fn legacy_sibling_resolves_parent_join() {
        let new = Path::new("/home/u/.config/code-manager");
        assert_eq!(
            legacy_sibling(new, "ai-manager"),
            Some(PathBuf::from("/home/u/.config/ai-manager"))
        );
    }

    #[test]
    fn legacy_sibling_guards_against_same_name() {
        let new = Path::new("/home/u/.config/ai-manager");
        assert_eq!(legacy_sibling(new, "ai-manager"), None);
    }

    #[test]
    fn migrate_dir_renames_when_new_absent() {
        let root = temp_root("rename");
        let legacy = root.join("ai-manager");
        let new = root.join("code-manager");
        fs::create_dir_all(&legacy).unwrap();
        fs::write(legacy.join("config-registry.json"), b"{}").unwrap();

        migrate_dir(&legacy, &new, "test");

        assert!(new.join("config-registry.json").exists());
        assert!(!legacy.exists());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn migrate_dir_skips_when_new_exists() {
        let root = temp_root("skip-existing");
        let legacy = root.join("ai-manager");
        let new = root.join("code-manager");
        fs::create_dir_all(&legacy).unwrap();
        fs::write(legacy.join("old.json"), b"old").unwrap();
        fs::create_dir_all(&new).unwrap();
        fs::write(new.join("new.json"), b"new").unwrap();

        migrate_dir(&legacy, &new, "test");

        // 新目录已存在则跳过，两边都保持原样
        assert!(new.join("new.json").exists());
        assert!(!new.join("old.json").exists());
        assert!(legacy.join("old.json").exists());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn migrate_dir_noop_when_legacy_absent() {
        let root = temp_root("no-legacy");
        let legacy = root.join("ai-manager");
        let new = root.join("code-manager");

        migrate_dir(&legacy, &new, "test");

        assert!(!new.exists());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn copy_dir_all_copies_nested_tree() {
        let root = temp_root("copy");
        let src = root.join("src");
        let dst = root.join("dst");
        fs::create_dir_all(src.join("nested")).unwrap();
        fs::write(src.join("a.txt"), b"a").unwrap();
        fs::write(src.join("nested/b.txt"), b"b").unwrap();

        copy_dir_all(&src, &dst).unwrap();

        assert_eq!(fs::read(dst.join("a.txt")).unwrap(), b"a");
        assert_eq!(fs::read(dst.join("nested/b.txt")).unwrap(), b"b");
        let _ = fs::remove_dir_all(root);
    }
}
