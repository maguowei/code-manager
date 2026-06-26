# 会话等待输入时播放固定提示音效 — 设计文档

- 日期：2026-06-27
- 状态：设计已确认，待写实现计划
- 范围：Code Manager（Tauri 2 桌面应用）后端 + 前端设置

## 背景与目标

应用已通过 `tray.rs` 轮询 `~/.claude/sessions/*.json`，识别"新出现的等待输入会话"（`new_waiting_sessions`），并据此发系统通知。现需要在**同一触发点**上增加一路**固定提示音效**：当检测到新的等待会话时播放一段提示音，提醒用户回到终端处理。

明确选择"固定音效"而非 TTS 朗读：实现简单、不依赖窗口、无需处理动态文本与多会话播报歧义。

### 成功标准

- 开启开关后，会话进入等待输入状态时听到一次提示音；关闭时无声。
- 开关**默认关闭**，与现有 `system_notifications_enabled` 等"默认关闭"偏好一致。
- 音效可在设置中从 curated 列表选择，默认 `Glass`，并可试听。
- 声音门控与系统通知开关**完全独立**：仅开音效、不开系统通知也能工作。
- macOS 正常发声；非 macOS 后端 no-op，不报错、不影响通知与托盘。

## 关键决策

| 决策点 | 结论 |
| --- | --- |
| 形式 | 固定音效，不做 TTS |
| 发声机制 | macOS `afplay /System/Library/Sounds/<Name>.aiff`，零依赖 |
| 开关关系 | 独立开关 `waiting_sound_enabled`，与 `system_notifications_enabled` 解耦（仿 LED / 浮窗） |
| 音效选择 | curated 枚举列表，设置内可选 + 可试听，默认 `Glass` |
| 多会话 | 每检测轮**只播一次**，与新等待会话数无关 |
| 平台 | macOS-only；非 macOS no-op，与 LED / 原生通知策略一致 |
| 试听 | 首版纳入 `preview_waiting_sound` 命令 |
| helper 落点 | 新建独立模块 `sound.rs`（一模块一职责，仿 `led.rs` / `widget.rs`） |

## 架构与组件

### 后端

**1. 配置（`src-tauri/src/config.rs::AppPreferences`）**

新增两个字段，沿用现有"默认关闭开关"模式：

- `waiting_sound_enabled: bool`，`#[serde(default)]` → 默认 `false`
- `waiting_sound: WaitingSound`，新增 enum（仿 `SessionTrayCountStyle`），`#[serde(rename_all = "camelCase")]` + `specta::Type`

`WaitingSound` 变体与默认：

- `Glass`（`#[default]`）
- `Submarine`
- `Hero`
- `Ping`
- `Sosumi`
- `Tink`

用 enum 而非 `String`：类型安全 + 天然白名单，enum → 文件名映射写死，杜绝从偏好注入任意路径给 `afplay`。同步更新 `AppPreferences::default()`。

**2. 播放 helper（新增 `src-tauri/src/sound.rs`）**

- `WaitingSound → /System/Library/Sounds/<Name>.aiff` 的映射函数（白名单唯一来源）。
- 播放函数：`Command::new("afplay").arg(path).spawn()` 后**立即 detach，不 `wait()`**，遵守"托盘 handler 不阻塞事件循环"约束。
- 非 macOS 用 `#[cfg]` 编译为 no-op。
- afplay 失败（spawn 错误 / 文件缺失）只记 `warn` 日志，静默降级。
- 日志遵守脱敏规范，形如 `event=sound.waiting status=ok|err sound=glass`，不记录无关数据。

**3. 触发点（`src-tauri/src/tray.rs`）**

- 将 `PendingSessionNotifier::observe()` 的返回从 `Vec<PendingSessionNotification>` 改为携带额外信号的小结构，例如：

  ```rust
  struct ObserveOutcome {
      notifications: Vec<PendingSessionNotification>,
      has_new_waiting: bool, // seen_snapshot && !new_waiting_sessions.is_empty()
  }
  ```

  `has_new_waiting` 与 `system_notifications_enabled` 无关，仅表达"本轮出现了真正的新等待会话（已排除启动首帧）"。
- `handle_pending_session_notifications()`（`tray.rs:1039` 附近）：在展示通知之外，若 `preferences.waiting_sound_enabled && outcome.has_new_waiting` → 调 `sound::play_waiting_sound(preferences.waiting_sound)`，**每轮只播一次**。
- 现有 `system_notifications_enabled` 的通知逻辑保持不变。

**4. 试听命令（`src-tauri/src/sound.rs` + `lib.rs` 注册）**

- `#[tauri::command] #[specta::specta] fn preview_waiting_sound(sound: WaitingSound) -> Result<(), String>`，内部复用播放 helper。
- 在 `lib.rs::build_specta_builder()` 的 `collect_commands![]` 注册，运行 `make bindings` 重新生成 `src/bindings.ts`，再 `make bindings-check`。
- 该命令仅调用本地 `afplay`，不触碰文件系统受控目录，无需新增 capability。

### 前端

**`src/components/SettingsDrawer.tsx`**（通知相关区）：

- 新增 **开关**（绑定 `waiting_sound_enabled`）。
- 新增 **音效下拉选择**（绑定 `waiting_sound`，选项来自枚举）。
- 新增 **试听按钮**，调用 `ipc` 包装的 `previewWaitingSound(sound)`。
- 开关关闭时，下拉与试听按钮禁用。
- 所有用户可见文案走 `useI18n()` 的 `t()`，新增 i18n key（`src/i18n.ts`）。
- `AppPreferences` 新增字段经现有 get / update 偏好命令 + `make bindings` 自动贯通；试听命令在 `src/ipc.ts` 增窄包装（如生成类型不直接兼容）。

## 数据流

```
tray 轮询 sessions/*.json
  → PendingSessionNotifier.observe()
      → 计算 new_waiting_sessions、has_new_waiting
  → handle_pending_session_notifications()
      ├─ system_notifications_enabled? → 现有系统通知（不变）
      └─ waiting_sound_enabled && has_new_waiting? → sound::play_waiting_sound()
                                                        → afplay <enum→path> (spawn detach)
```

## 错误处理与边界

- 非 macOS：`sound.rs` no-op；前端控件照常显示（与现有"系统通知"开关一致），仅不发声。
- afplay 不存在 / 系统音效文件缺失：`warn` 日志，静默降级，不影响通知与托盘。
- 偏好出现未知音效值：`serde` 反序列化回退默认 `Glass`。
- 播放不阻塞托盘事件循环（spawn 不 wait）。

## 测试

- Rust 单测：
  - `observe()` 的 `has_new_waiting` 仅在 `seen_snapshot` 之后、有新等待会话时为 `true`；启动首帧为 `false`；无新会话为 `false`。
  - `WaitingSound → 文件名` 映射白名单覆盖全部变体。
  - 更新现有 `observe` 相关单测以适配新返回类型。
- 契约：`make bindings-check`、`make build-frontend`、`make test-rust`。
- Rust 行为变更补 `make check`、`make lint-rust`。

## 明确不做（YAGNI）

- 不做自定义音频文件上传 / 打包自定义 chime。
- 不做音量、循环、多音效编排。
- 不引入跨平台音频库（非 macOS 直接 no-op）。
- 不复用 / 改动系统通知自带声音。
- 不做 TTS 朗读、不携带项目名 / 会话数等动态内容。

## 同步点清单

- `src-tauri/src/config.rs`（`AppPreferences` + `WaitingSound` 枚举 + `default()`）
- `src-tauri/src/sound.rs`（新模块：映射 + 播放 + 试听命令）
- `src-tauri/src/tray.rs`（`observe` 返回结构 + 触发处播放）
- `src-tauri/src/lib.rs`（注册 `preview_waiting_sound`）
- `src/bindings.ts`（`make bindings` 生成）
- `src/ipc.ts`（试听命令窄包装，按需）
- `src/components/SettingsDrawer.tsx`（开关 + 下拉 + 试听）
- `src/i18n.ts`（新增文案）
- `src/types.ts`（如手工类型需同步）
- 相关 Rust 单测
