# 会话等待输入提示音效 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 当检测到新的"等待输入"会话时，按用户偏好播放一次 macOS 系统提示音效。

**Architecture:** 复用 `tray.rs` 已有的"新等待会话"检测点；新增独立、默认关闭的偏好开关 `waiting_sound_enabled` 与音效枚举 `waiting_sound`；新建 `sound.rs` 模块用 `afplay` 播放系统 `.aiff`（非 macOS no-op）；前端在设置抽屉加开关 + 下拉 + 试听。

**Tech Stack:** Rust + Tauri 2 + tauri-specta；React 19 + TypeScript + Tailwind v4 + shadcn/ui。

## Global Constraints

- 代码注释使用中文，技术术语保留英文。
- 所有用户可见文本走 `useI18n()` 的 `t()`，中英文 key 同步加在 `src/i18n.ts`。
- 用户反馈走 `useToast()`，不要用 `console.error` 当用户反馈。
- 偏好开关**默认关闭**：`waiting_sound_enabled` 默认 `false`，音效默认 `Glass`。
- 声音门控与 `system_notifications_enabled` **完全独立**：仅开音效也要发声。
- macOS-only：非 macOS 后端 no-op，不报错；前端控件照常显示。
- 音效白名单唯一来源是 `WaitingSound` 枚举 → 文件名映射，禁止任意路径传给 `afplay`。
- 新增 / 修改 Tauri command 必须走：Rust command → `lib.rs` 注册 → `make bindings` → `make bindings-check`，业务前端经 `src/ipc.ts` 调用，不直接 `invoke`。
- 播放不阻塞托盘事件循环：`Command::spawn()` 后不 `wait()`。

---

## File Structure

| 文件 | 责任 | 动作 |
| --- | --- | --- |
| `src-tauri/src/config.rs` | `WaitingSound` 枚举、`AppPreferences` / `AppPreferencesInput` 新字段、`normalize_app_preferences`、Default | Modify |
| `src-tauri/src/sound.rs` | 枚举→文件名白名单映射、`play_waiting_sound`、`preview_waiting_sound` 命令 | Create |
| `src-tauri/src/lib.rs` | 声明 `mod sound`、注册 `preview_waiting_sound` | Modify |
| `src-tauri/src/tray.rs` | notifier 增 `last_had_new_waiting`、触发处播放、`test_preferences` 补字段、新单测 | Modify |
| `src/bindings.ts` | `make bindings` 重新生成（含枚举、字段、命令） | Generated |
| `src/types.ts` | `AppPreferences` 手工类型补 `waitingSoundEnabled` / `waitingSound` | Modify |
| `src/ipc.ts` | `CompatibleIpc` 接口补 `previewWaitingSound` | Modify |
| `src/components/SettingsDrawer.tsx` | 默认 state 补字段、音效区 UI（开关 + 下拉 + 试听） | Modify |
| `src/i18n.ts` | 新增中英文文案 | Modify |

执行顺序：Task 1（后端配置） → Task 2（sound 模块 + bindings） → Task 3（tray 触发） → Task 4（前端 UI）。

---

## Task 1: 后端配置字段与 WaitingSound 枚举

**Files:**
- Modify: `src-tauri/src/config.rs`（枚举、`AppPreferences:71`、`Default:111`、`AppPreferencesInput:335`、`normalize_app_preferences:980`、测试构造 `:3885`、config 测试 `:2883` 区）
- Modify: `src-tauri/src/tray.rs:1311`（`test_preferences` 补字段，保持 crate 编译）

**Interfaces:**
- Produces:
  - `pub enum WaitingSound { Glass(default), Submarine, Hero, Ping, Sosumi, Tink }`（`#[serde(rename_all="camelCase")]`，序列化为 `"glass"|"submarine"|"hero"|"ping"|"sosumi"|"tink"`）
  - `AppPreferences.waiting_sound_enabled: bool`、`AppPreferences.waiting_sound: WaitingSound`
  - `AppPreferencesInput` 同名字段

- [ ] **Step 1: 写失败测试（config.rs 测试模块，紧邻 `app_preferences_default_to_expanded_sidebar` 之后）**

```rust
#[test]
fn app_preferences_default_waiting_sound_disabled_glass() {
    let prefs = AppPreferences::default();
    assert!(!prefs.waiting_sound_enabled, "等待音效默认必须关闭");
    assert_eq!(prefs.waiting_sound, WaitingSound::Glass);
}

#[test]
fn normalize_app_preferences_passes_waiting_sound_through() {
    let mut input = sample_app_preferences_input();
    input.waiting_sound_enabled = true;
    input.waiting_sound = WaitingSound::Submarine;

    let normalized = normalize_app_preferences(input).expect("normalize 应成功");
    assert!(normalized.waiting_sound_enabled);
    assert_eq!(normalized.waiting_sound, WaitingSound::Submarine);
}
```

> 若测试模块没有 `sample_app_preferences_input()` 辅助函数，改为在测试内联构造一个 `AppPreferencesInput`（参照 `normalize_app_preferences` 的入参字段逐个填默认值），并在末尾加 `waiting_sound_enabled: true, waiting_sound: WaitingSound::Submarine,`。先确认现有测试里已有的 input 构造方式并复用。

- [ ] **Step 2: 运行测试确认失败**

Run: `cargo test -p code-manager --lib config:: 2>&1 | tail -20`（在 `src-tauri/` 下）
Expected: 编译失败，`no field waiting_sound_enabled` / `cannot find type WaitingSound`。

- [ ] **Step 3: 加 `WaitingSound` 枚举（config.rs，放在 `SessionTrayCountStyle` 枚举之后，约 `:69` 下方）**

```rust
/// 会话等待输入时播放的提示音效。
/// 变体映射到 macOS `/System/Library/Sounds/` 下的系统音效（映射见 `sound.rs`）。
#[derive(Debug, Clone, Copy, Default, Serialize, Deserialize, PartialEq, Eq, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum WaitingSound {
    #[default]
    Glass,
    Submarine,
    Hero,
    Ping,
    Sosumi,
    Tink,
}
```

- [ ] **Step 4: 给 `AppPreferences` 加字段（`:108` `floating_widget_opacity` 之后，结构体闭合大括号前）**

```rust
    /// 会话等待输入时是否播放提示音效（独立于 system_notifications_enabled）。
    #[serde(default)]
    pub waiting_sound_enabled: bool,
    /// 等待提示音效，默认 Glass。
    #[serde(default)]
    pub waiting_sound: WaitingSound,
```

- [ ] **Step 5: 给 `Default for AppPreferences` 补字段（`:129` `floating_widget_opacity: ...` 之后）**

```rust
            waiting_sound_enabled: false,
            waiting_sound: WaitingSound::default(),
```

- [ ] **Step 6: 给 `AppPreferencesInput` 加字段（`:362` `floating_widget_opacity` 之后）**

```rust
    #[serde(default)]
    pub waiting_sound_enabled: bool,
    #[serde(default)]
    pub waiting_sound: WaitingSound,
```

- [ ] **Step 7: `normalize_app_preferences` 输出补字段（`:1008` `floating_widget_opacity: ...` 之后）**

```rust
        waiting_sound_enabled: input.waiting_sound_enabled,
        waiting_sound: input.waiting_sound,
```

- [ ] **Step 8: 修补其余全量构造点**

- `config.rs:3885` 附近测试里的 `app: AppPreferences { ... }`：若是完整字段字面量，补 `waiting_sound_enabled: false, waiting_sound: WaitingSound::default(),`；若已是 `..AppPreferences::default()` 则跳过。
- `src-tauri/src/tray.rs:1311` 的 `test_preferences` 闭合前（`floating_widget_opacity: 92,` 之后）补：

```rust
            waiting_sound_enabled: false,
            waiting_sound: crate::config::WaitingSound::default(),
```

- [ ] **Step 9: 运行测试确认通过**

Run: `cargo test -p code-manager --lib 2>&1 | tail -20`
Expected: 全绿，新两条测试 PASS，无其它构造点编译报错。

- [ ] **Step 10: 提交**

```bash
git add src-tauri/src/config.rs src-tauri/src/tray.rs
git commit -m "feat(config): 新增等待提示音效偏好字段与 WaitingSound 枚举"
```

---

## Task 2: sound 模块与试听命令

**Files:**
- Create: `src-tauri/src/sound.rs`
- Modify: `src-tauri/src/lib.rs`（`mod sound;`、`use sound::preview_waiting_sound;`、`collect_commands!` 注册）
- Generated: `src/bindings.ts`（`make bindings`）

**Interfaces:**
- Consumes: `crate::config::WaitingSound`（Task 1）
- Produces:
  - `pub(crate) fn waiting_sound_file_name(sound: WaitingSound) -> &'static str`
  - `pub(crate) fn play_waiting_sound(sound: WaitingSound)`（Task 3 调用）
  - `#[tauri::command] pub fn preview_waiting_sound(sound: WaitingSound) -> Result<(), String>`（前端 `ipc.previewWaitingSound`）

- [ ] **Step 1: 写失败测试（新建 `src-tauri/src/sound.rs`，先只放映射 + 测试）**

```rust
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
```

- [ ] **Step 2: 在 `lib.rs` 声明模块，运行测试确认失败**

在 `src-tauri/src/lib.rs` 模块声明区（`mod led;` 附近，`:6`）加：

```rust
mod sound;
```

Run: `cargo test -p code-manager --lib sound:: 2>&1 | tail -20`
Expected: PASS（映射纯函数已可测）——确认模块挂上、测试可跑。若此处直接 PASS，跳过"失败"语义，进入下一步补播放与命令。

- [ ] **Step 3: 补播放函数与试听命令（`sound.rs`，`tests` 模块之前）**

```rust
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
```

- [ ] **Step 4: 在 `lib.rs` 注册命令**

`lib.rs` 顶部 use 区（`use led::{...}` 附近，`:48`）加：

```rust
use sound::preview_waiting_sound;
```

`collect_commands![]` 列表内（`led_test_mode,` 附近，`:169`）加一行：

```rust
            preview_waiting_sound,
```

- [ ] **Step 5: 重新生成并校验 bindings**

Run:
```bash
make bindings
make bindings-check
```
Expected: `bindings-check` 无 diff 漂移；`src/bindings.ts` 出现 `previewWaitingSound`、`WaitingSound` 类型、`AppPreferences.waitingSound` / `waitingSoundEnabled`。

- [ ] **Step 6: 跑 Rust 校验**

Run（在 `src-tauri/`）:
```bash
cargo test -p code-manager --lib sound:: 2>&1 | tail -20
```
Expected: PASS。再跑 `cargo clippy -p code-manager 2>&1 | tail -15`，无新告警。

- [ ] **Step 7: 提交**

```bash
git add src-tauri/src/sound.rs src-tauri/src/lib.rs src/bindings.ts
git commit -m "feat(sound): 新增等待提示音效播放模块与试听命令"
```

---

## Task 3: tray 触发播放

**Files:**
- Modify: `src-tauri/src/tray.rs`（`PendingSessionNotifier:146`、`observe:152`、`handle_pending_session_notifications:1039`、新单测）

**Interfaces:**
- Consumes: `crate::sound::play_waiting_sound`（Task 2）、`AppPreferences.waiting_sound_enabled` / `waiting_sound`（Task 1）
- Produces: `PendingSessionNotifier.last_had_new_waiting: bool`（caller 读取）

> 设计说明：spec 原写"改 `observe` 返回结构体"，这里改为在 notifier 上加 `last_had_new_waiting` 字段，`observe` 签名与返回保持不变 —— 同样实现"音效门控独立于 system_notifications"，但零改动现有 12 处 `observe` 测试调用，更外科手术。

- [ ] **Step 1: 写失败测试（tray.rs 测试模块，紧邻 `pending_session_notifier_reports_new_waiting_session_once` 之后）**

```rust
#[test]
fn pending_session_notifier_flags_new_waiting_independent_of_system_notifications() {
    let mut notifier = PendingSessionNotifier::default();
    let idle = test_session("/Users/demo/work/code-manager", "idle", 1000);
    let waiting = test_session("/Users/demo/work/code-manager", "waiting", 2000);

    // 首帧基线：即便有 waiting 也不算"新出现"
    notifier.observe(
        &test_preferences(false, "terminal"),
        std::slice::from_ref(&idle),
        "zh",
        PendingSessionNotificationInteraction::Plain,
    );
    assert!(!notifier.last_had_new_waiting, "首帧不应触发音效信号");

    // 出现新 waiting：系统通知关闭（false）时仍应置位音效信号，且不产生通知
    let notifications = notifier.observe(
        &test_preferences(false, "terminal"),
        std::slice::from_ref(&waiting),
        "zh",
        PendingSessionNotificationInteraction::Plain,
    );
    assert!(notifier.last_had_new_waiting, "新等待会话应置位音效信号");
    assert!(notifications.is_empty(), "系统通知关闭时不产生通知");

    // 同一 waiting 重复：不再是"新"
    notifier.observe(
        &test_preferences(false, "terminal"),
        std::slice::from_ref(&waiting),
        "zh",
        PendingSessionNotificationInteraction::Plain,
    );
    assert!(!notifier.last_had_new_waiting, "重复 waiting 不应再置位");
}
```

- [ ] **Step 2: 运行确认失败**

Run（`src-tauri/`）: `cargo test -p code-manager --lib tray:: 2>&1 | tail -20`
Expected: 编译失败，`no field last_had_new_waiting`。

- [ ] **Step 3: 给 `PendingSessionNotifier` 加字段（`:146` 结构体）**

```rust
#[derive(Debug, Default)]
struct PendingSessionNotifier {
    seen_snapshot: bool,
    waiting_session_ids: BTreeSet<String>,
    /// 最近一次 observe 是否出现真正的新等待会话（已排除启动首帧）。
    /// 供音效门控读取，独立于 system_notifications_enabled。
    last_had_new_waiting: bool,
}
```

- [ ] **Step 4: 在 `observe` 内计算并写入该字段（`:172` `can_notify` 计算附近）**

把：

```rust
        let can_notify = self.seen_snapshot && preferences.system_notifications_enabled;
        self.seen_snapshot = true;
        self.waiting_session_ids = waiting_session_ids;
```

改为：

```rust
        let has_new_waiting = self.seen_snapshot && !new_waiting_sessions.is_empty();
        let can_notify = self.seen_snapshot && preferences.system_notifications_enabled;
        self.last_had_new_waiting = has_new_waiting;
        self.seen_snapshot = true;
        self.waiting_session_ids = waiting_session_ids;
```

- [ ] **Step 5: 运行确认新测试通过**

Run: `cargo test -p code-manager --lib tray:: 2>&1 | tail -20`
Expected: 全绿，含新测试。

- [ ] **Step 6: 在 caller 触发播放（`handle_pending_session_notifications:1046`）**

把：

```rust
    let notifications = match pending_session_notifier().lock() {
        Ok(mut notifier) => notifier.observe(&state.app, sessions, labels.language, interaction),
        Err(e) => {
            log::warn!("event=tray.pending_session_notify status=err reason=lock error={e}");
            return;
        }
    };

    for notification in notifications {
        show_pending_session_notification(app, notification);
    }
```

改为：

```rust
    let (notifications, has_new_waiting) = match pending_session_notifier().lock() {
        Ok(mut notifier) => {
            let notifications =
                notifier.observe(&state.app, sessions, labels.language, interaction);
            (notifications, notifier.last_had_new_waiting)
        }
        Err(e) => {
            log::warn!("event=tray.pending_session_notify status=err reason=lock error={e}");
            return;
        }
    };

    // 音效独立门控：仅看自身开关 + 是否出现新等待会话，每轮最多播一次
    if state.app.waiting_sound_enabled && has_new_waiting {
        crate::sound::play_waiting_sound(state.app.waiting_sound);
    }

    for notification in notifications {
        show_pending_session_notification(app, notification);
    }
```

- [ ] **Step 7: 跑 Rust 校验**

Run（`src-tauri/`）:
```bash
cargo test -p code-manager --lib 2>&1 | tail -20
cargo clippy -p code-manager 2>&1 | tail -15
```
Expected: 测试全绿；clippy 无新告警。

- [ ] **Step 8: 提交**

```bash
git add src-tauri/src/tray.rs
git commit -m "feat(tray): 检测到新等待会话时按偏好播放提示音效"
```

---

## Task 4: 前端设置 UI

**Files:**
- Modify: `src/types.ts:60`（`AppPreferences` 接口）
- Modify: `src/ipc.ts`（`CompatibleIpc` 接口）
- Modify: `src/components/SettingsDrawer.tsx`（默认 state、音效区 UI）
- Modify: `src/i18n.ts`（中英文文案）

**Interfaces:**
- Consumes: `ipc.previewWaitingSound(sound)`、`AppPreferences.waitingSoundEnabled` / `waitingSound`

- [ ] **Step 1: `src/types.ts` 的 `AppPreferences` 接口补字段（与现有 camelCase 字段并列）**

```ts
  waitingSoundEnabled: boolean;
  waitingSound: "glass" | "submarine" | "hero" | "ping" | "sosumi" | "tink";
```

> 若 `src/types.ts` 直接 re-export 生成类型而非手写接口，则跳过本步（`make bindings` 已覆盖）；先确认 `:60` 是手写 interface 还是 re-export。

- [ ] **Step 2: `src/ipc.ts` 的 `CompatibleIpc` 接口补一行（`setAppPreferences` 附近，`:168`）**

```ts
  previewWaitingSound(sound: AppTypes.AppPreferences["waitingSound"]): Promise<null>;
```

- [ ] **Step 3: `SettingsDrawer.tsx` 默认 state 补字段（`useState<AppPreferences>` 字面量内，`floatingWidgetOpacity: 92,` 之后，`:644`）**

```ts
    waitingSoundEnabled: false,
    waitingSound: "glass",
```

- [ ] **Step 4: `SettingsDrawer.tsx` 顶部加音效选项常量（`sessionTrayCountStyleOptions` 常量附近，`:121`）**

```ts
const waitingSoundOptions: {
  value: AppPreferences["waitingSound"];
  labelKey: TranslationKey;
}[] = [
  { value: "glass", labelKey: "settings.waitingSoundGlass" },
  { value: "submarine", labelKey: "settings.waitingSoundSubmarine" },
  { value: "hero", labelKey: "settings.waitingSoundHero" },
  { value: "ping", labelKey: "settings.waitingSoundPing" },
  { value: "sosumi", labelKey: "settings.waitingSoundSosumi" },
  { value: "tink", labelKey: "settings.waitingSoundTink" },
];
```

> `TranslationKey` 是 `i18n.ts` 导出的 key 联合类型；确认 SettingsDrawer 已 import（`sessionTrayCountStyleOptions` 同款）。若该常量用的是别的类型名，照抄它。

- [ ] **Step 5: 在系统通知设置区附近插入音效卡片 JSX（系统通知 `SettingsSectionCard` 之后）**

```tsx
<SettingsSectionCard
  title={t("settings.waitingSound")}
  description={t("settings.waitingSoundDesc")}
>
  <FieldGroup className="gap-4">
    <Field orientation="horizontal" className="items-center justify-between gap-4">
      <FieldContent>
        <SettingsStateLabel enabled={preferences.waitingSoundEnabled} />
      </FieldContent>
      <Switch
        id="settings-waiting-sound-enabled"
        checked={preferences.waitingSoundEnabled}
        onCheckedChange={(checked) =>
          void persistPreferences(
            { ...preferences, waitingSoundEnabled: checked },
            preferences,
          )
        }
        aria-label={t("settings.waitingSound")}
      />
    </Field>

    {preferences.waitingSoundEnabled && (
      <Field className="gap-2">
        <FieldTitle className="text-muted-foreground text-xs">
          {t("settings.waitingSoundChoice")}
        </FieldTitle>
        <div className="flex items-center gap-2">
          <Select
            value={preferences.waitingSound}
            onValueChange={(next) =>
              void persistPreferences(
                {
                  ...preferences,
                  waitingSound: next as AppPreferences["waitingSound"],
                },
                preferences,
              )
            }
          >
            <SelectTrigger aria-label={t("settings.waitingSoundChoice")} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {waitingSoundOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {t(option.labelKey)}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              void ipc
                .previewWaitingSound(preferences.waitingSound)
                .catch((err) =>
                  showOperationError(showToast, t("toast.waitingSoundPreviewError"), err),
                );
            }}
          >
            {t("settings.waitingSoundPreview")}
          </Button>
        </div>
      </Field>
    )}
  </FieldGroup>
</SettingsSectionCard>
```

> 复用文件内已有 import：`SettingsSectionCard`、`FieldGroup`、`Field`、`FieldContent`、`FieldTitle`、`SettingsStateLabel`、`Switch`、`Select*`、`Button`、`showOperationError`、`showToast`、`ipc`。逐一确认存在；缺哪个补 import（参照 LED 卡片 `:421` 的用法，它们都已在用）。

- [ ] **Step 6: `src/i18n.ts` 加中文文案（`settings.sessionTrayCountStyle*` 中文块附近，`:1251`）**

```ts
    "settings.waitingSound": "等待提示音效",
    "settings.waitingSoundDesc": "会话等待输入时播放系统提示音（仅 macOS）",
    "settings.waitingSoundChoice": "音效",
    "settings.waitingSoundPreview": "试听",
    "settings.waitingSoundGlass": "清脆 Glass",
    "settings.waitingSoundSubmarine": "低沉 Submarine",
    "settings.waitingSoundHero": "上扬 Hero",
    "settings.waitingSoundPing": "短促 Ping",
    "settings.waitingSoundSosumi": "经典 Sosumi",
    "settings.waitingSoundTink": "轻响 Tink",
    "toast.waitingSoundPreviewError": "试听音效失败",
```

- [ ] **Step 7: `src/i18n.ts` 加英文文案（英文块对应位置，`:2914` 附近）**

```ts
    "settings.waitingSound": "Waiting sound",
    "settings.waitingSoundDesc": "Play a system sound when a session is waiting for input (macOS only)",
    "settings.waitingSoundChoice": "Sound",
    "settings.waitingSoundPreview": "Preview",
    "settings.waitingSoundGlass": "Crisp Glass",
    "settings.waitingSoundSubmarine": "Deep Submarine",
    "settings.waitingSoundHero": "Rising Hero",
    "settings.waitingSoundPing": "Short Ping",
    "settings.waitingSoundSosumi": "Classic Sosumi",
    "settings.waitingSoundTink": "Light Tink",
    "toast.waitingSoundPreviewError": "Failed to preview sound",
```

> `toast.waitingSoundPreviewError` 若英文 toast 块在别处，放到对应 `toast.*` 区；保持中英 key 一一对应。

- [ ] **Step 8: 前端校验**

Run:
```bash
make lint-frontend
make build-frontend
```
Expected: 类型检查与构建通过，无 `t()` 未知 key 报错、无未用 import。

- [ ] **Step 9: 手动核验（macOS）**

`make dev` 启动应用 → 打开设置抽屉 → 找到"等待提示音效" → 打开开关 → 下拉切到 Submarine → 点"试听"应听到 Submarine。关闭开关后下拉/试听隐藏。重启应用确认开关默认关闭仍持久化为上次选择。

> 无法截图 / 无 macOS 环境时，说明限制并以 `make build-frontend` + 单测为准。

- [ ] **Step 10: 提交**

```bash
git add src/types.ts src/ipc.ts src/components/SettingsDrawer.tsx src/i18n.ts
git commit -m "feat(settings): 等待提示音效开关、音效选择与试听"
```

---

## Self-Review

**Spec 覆盖：**
- 固定音效、非 TTS → Task 2 `afplay` 系统 `.aiff`。✓
- 独立默认关闭开关 → Task 1 `waiting_sound_enabled` 默认 false + Task 3 独立门控。✓
- curated 列表可选 + 默认 Glass → Task 1 枚举默认 Glass + Task 4 下拉。✓
- 可试听 → Task 2 `preview_waiting_sound` + Task 4 试听按钮。✓
- 每轮只播一次 → Task 3 `has_new_waiting` 单次门控。✓
- macOS-only / 非 macOS no-op → Task 2 `#[cfg]`。✓
- 白名单防注入 → Task 2 枚举→文件名映射。✓
- 不阻塞托盘 → Task 2 `spawn()` 不 `wait()`。✓
- 测试：observe 信号、映射白名单、默认值、normalize 透传 → Task 1/2/3。✓
- 契约：`make bindings-check` / `build-frontend` / `test-rust` → Task 2/4 + 各 Rust 步。✓

**占位符扫描：** 无 TBD / "类似 Task N" / 空泛"加错误处理"；每个代码步均含完整代码。少数"先确认现有写法"提示是为适配未知的既有辅助函数，非占位。

**类型一致性：** `WaitingSound`（Rust）↔ `"glass"|...`（serde camelCase ↔ TS 联合）一致；`waiting_sound_enabled`/`waiting_sound`（Rust snake）↔ `waitingSoundEnabled`/`waitingSound`（TS camel，经 `rename_all` + bindings）一致；`waiting_sound_file_name`、`play_waiting_sound`、`preview_waiting_sound`、`last_had_new_waiting` 全程同名。✓
