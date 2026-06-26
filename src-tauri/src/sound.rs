//! 会话等待输入提示音效：macOS 通过 afplay 播放系统 .aiff；非 macOS no-op。

use crate::config::WaitingSound;

/// 音效枚举 → `/System/Library/Sounds/` 下的文件名（不含目录）。
/// 这是白名单的唯一来源：只允许内置系统音效，杜绝任意路径注入。
pub(crate) fn waiting_sound_file_name(sound: WaitingSound) -> &'static str {
    match sound {
        WaitingSound::Glass => "Glass.aiff",
        WaitingSound::Submarine => "Submarine.aiff",
        WaitingSound::Hero => "Hero.aiff",
        WaitingSound::Ping => "Ping.aiff",
        WaitingSound::Sosumi => "Sosumi.aiff",
        WaitingSound::Tink => "Tink.aiff",
    }
}

/// 播放等待提示音效。macOS 用 afplay 异步播放系统音效；非 macOS no-op。
/// fire-and-forget：spawn 后不 wait，避免阻塞调用方（托盘事件循环）。
#[cfg(target_os = "macos")]
pub(crate) fn play_waiting_sound(sound: WaitingSound) {
    use std::process::Command;

    let file = waiting_sound_file_name(sound);
    let path = format!("/System/Library/Sounds/{file}");
    match Command::new("afplay").arg(&path).spawn() {
        Ok(_) => log::info!("event=sound.waiting status=ok file={file}"),
        Err(e) => log::warn!("event=sound.waiting status=err file={file} error={e}"),
    }
}

#[cfg(not(target_os = "macos"))]
pub(crate) fn play_waiting_sound(_sound: WaitingSound) {
    // 非 macOS 暂不支持系统音效播放，静默 no-op。
}

/// 设置页"试听"入口：立即播放一次选中音效。
#[tauri::command]
#[specta::specta]
pub fn preview_waiting_sound(sound: WaitingSound) -> Result<(), String> {
    play_waiting_sound(sound);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn file_name_maps_every_variant_to_aiff() {
        for sound in [
            WaitingSound::Glass,
            WaitingSound::Submarine,
            WaitingSound::Hero,
            WaitingSound::Ping,
            WaitingSound::Sosumi,
            WaitingSound::Tink,
        ] {
            assert!(
                waiting_sound_file_name(sound).ends_with(".aiff"),
                "{sound:?} 必须映射到 .aiff 文件名"
            );
        }
        assert_eq!(waiting_sound_file_name(WaitingSound::Glass), "Glass.aiff");
    }
}
